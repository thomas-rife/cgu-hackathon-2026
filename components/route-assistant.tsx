"use client";

import { useEffect, useRef, useState } from "react";
import { appliedSummary } from "@/lib/assistant-tools";
import type { AssistantMessage, AssistantRoute, AssistantRouteResult } from "@/lib/assistant-tools";
import { ASSISTANT_INVALID, ASSISTANT_OFFLINE, recentAssistantHistory, runAssistantTurn } from "@/lib/assistant-conversation";
import type { Disruption } from "@/lib/simulation";
import { selectionSummary } from "@/lib/assistant-selection";
import type { SelectRouteArgs, SelectRouteResult } from "@/lib/assistant-selection";

type ChatLine = { id: string; role: "user" | "assistant" | "system"; text: string; undoId?: string };
type Undo = { id: string; kind: "disruption"; previous: Disruption[] } | { id: string; kind: "selection"; previous: { key: string; id: string } | null };
export type AssistantProps = {
  freeways: string[];
  selectedRoute: { name: string; freeways: string[]; tags: string[] } | null;
  disruptions: Disruption[];
  routes: AssistantRoute[];
  ready: boolean;
  cancelVersion: number;
  onApply: (items: Disruption[], signal: AbortSignal) => Promise<AssistantRouteResult>;
  onSelect: (args: SelectRouteArgs) => { result: SelectRouteResult; previous: { key: string; id: string } | null };
  onUndoSelection: (previous: { key: string; id: string } | null) => void;
};

export default function RouteAssistant(props: AssistantProps) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [offline, setOffline] = useState(false);
  const [undos, setUndos] = useState<Undo[]>([]);
  const history = useRef<AssistantMessage[]>([]);
  const request = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const latest = useRef(props);
  const selectedFreeways = props.selectedRoute?.freeways.filter(freeway => props.freeways.includes(freeway)) || [];
  const examples = [
    ...(selectedFreeways[0] ? [`What if ${selectedFreeways[0]} was blocked?`] : []),
    ...(selectedFreeways[1] || selectedFreeways[0] ? [`What if there was a crash on ${selectedFreeways[1] || selectedFreeways[0]}?`] : []),
    ...(props.selectedRoute?.name !== "Original plan" && props.selectedRoute
      ? [`Choose the ${props.selectedRoute.tags.includes("Lowest community burden") ? "fastest" : "lowest-DAC-mile"} route instead of ${props.selectedRoute.name}.`]
      : []),
    ...(props.disruptions.length ? ["Clear everything"] : []),
  ].slice(0, 3);
  useEffect(() => { latest.current = props; }, [props]);
  useEffect(() => () => { request.current?.abort(); }, [props.cancelVersion]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [lines, status]);
  function updateReply(id: string, text: string) {
    setStatus("");
    setLines(previous => previous.map(line => line.id === id ? { ...line, text } : line));
  }
  async function send(value: string) {
    const text = value.trim();
    if (!text || busy || request.current || !props.ready) return;
    const controller = new AbortController();
    request.current = controller;
    const replyId = crypto.randomUUID();
    setInput(""); setOffline(false); setBusy(true); setStatus("Thinking locally…");
    setLines(previous => [...previous, { id: crypto.randomUUID(), role: "user", text }, { id: replyId, role: "assistant", text: "" }]);
    const messages = recentAssistantHistory([...history.current, { role: "user", content: text }]);
    history.current = messages;
    try {
      await runAssistantTurn({ messages, freeways: props.freeways, disruptions: props.disruptions, routes: props.routes }, {
        signal: controller.signal,
        onText: value => updateReply(replyId, value),
        onHistory: messages => { history.current = messages; },
        onApply: async (next, previous) => {
          const id = crypto.randomUUID();
          setUndos(stack => [...stack, { id, kind: "disruption", previous: structuredClone(previous) }]);
          setLines(lines => {
            const applied: ChatLine = { id: crypto.randomUUID(), role: "system", text: `Applied: ${appliedSummary(next)}`, undoId: id };
            const position = lines.findIndex(line => line.id === replyId);
            return [...lines.slice(0, position), applied, ...lines.slice(position)];
          });
          setStatus("Recalculating routes…");
          const result = await props.onApply(next, controller.signal);
          setStatus("Replying locally…");
          return result;
        },
        onSelect: async args => {
          const { result, previous } = latest.current.onSelect(args);
          if (result.selected) {
            const id = crypto.randomUUID();
            setUndos(stack => [...stack, { id, kind: "selection", previous }]);
            setLines(lines => {
              const selected: ChatLine = { id: crypto.randomUUID(), role: "system", text: selectionSummary(args, result.selected!), undoId: id };
              const position = lines.findIndex(line => line.id === replyId);
              return [...lines.slice(0, position), selected, ...lines.slice(position)];
            });
          }
          return result;
        },
      });
    } catch (error) {
      setLines(lines => lines.filter(line => line.id !== replyId));
      // Keep a balanced history if a turn was interrupted during tool execution.
      history.current = [];
      if (!controller.signal.aborted) {
        if (error instanceof Error && error.message === ASSISTANT_OFFLINE) setOffline(true);
        else setLines(lines => [...lines, { id: crypto.randomUUID(), role: "assistant", text: ASSISTANT_INVALID }]);
      }
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); setStatus(""); }
    }
  }
  async function undo() {
    const last = undos.at(-1);
    if (!last || busy || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setStatus("Restoring previous scenario…");
    setUndos(stack => stack.slice(0, -1));
    setLines(lines => [...lines, { id: crypto.randomUUID(), role: "system", text: "Undid last assistant change." }]);
    try {
      if (last.kind === "selection") props.onUndoSelection(last.previous);
      else await props.onApply(structuredClone(last.previous), controller.signal);
    }
    catch { /* The route-change cleanup aborts obsolete undo waits. */ }
    finally { if (request.current === controller) { request.current = null; setBusy(false); setStatus(""); } }
  }
  return <div className="mt-3 flex min-h-0 flex-col">
    {offline && <p role="alert" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{ASSISTANT_OFFLINE}</p>}
    {!props.ready && <p className="mb-2 text-xs text-slate-600">Set a route to simulate disruptions with Bolt.</p>}
    <div role="log" aria-label="Dispatch assistant messages" className="min-h-24 max-h-[min(38dvh,360px)] space-y-3 overflow-y-auto overscroll-contain pr-1 text-xs">
      {!lines.length && <div className="space-y-2 py-2">
        <p className="text-slate-600">Describe a scenario to apply it to your route.</p>
        {examples.map(example => <button key={example} disabled={!props.ready || busy} onClick={() => void send(example)} className="block rounded-full border border-slate-200 px-3 py-2 text-left text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-40">{example}</button>)}
      </div>}
      {lines.map(line => <div key={line.id} className={line.role === "user" ? "ml-6 rounded-xl bg-blue-50 px-3 py-2 text-slate-800" : line.role === "system" ? "rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600" : "pr-2 leading-relaxed text-slate-600"}>
        {line.text || (busy ? <span className="text-slate-500">{status || "Replying locally…"}</span> : null)}
        {line.role === "assistant" && line.text && busy && line.id === lines.at(-1)?.id && <span aria-hidden className="route-explanation-caret ml-0.5 inline-block h-[1em] w-px bg-current align-[-0.1em]" />}
        {line.undoId && <button type="button" onClick={() => void undo()} disabled={busy || undos.at(-1)?.id !== line.undoId} className="ml-2 font-medium text-blue-700 underline disabled:text-slate-400 disabled:no-underline">{undos.some(undo => undo.id === line.undoId) ? "Undo" : "Undone"}</button>}
      </div>)}
      <div ref={end} />
    </div>
    <form className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3" onSubmit={event => { event.preventDefault(); void send(input); }}>
      <label className="sr-only" htmlFor="assistant-message">Describe a disruption</label>
      <textarea id="assistant-message" rows={2} maxLength={1000} value={input} onChange={event => setInput(event.target.value)} disabled={!props.ready || busy} placeholder="Describe a disruption…" className="route-input min-w-0 flex-1 resize-none text-xs" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); } }} />
      <button type="submit" disabled={!props.ready || busy || !input.trim()} className="rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40">Send</button>
    </form>
    <p className="mt-2 text-center text-[11px] text-slate-500">AI · runs locally (Bolt) · simulated scenarios</p>
  </div>;
}
