"use client";

import { useEffect, useState } from "react";
import { daySummaryKey, sanitizeDaySummary } from "./day-summary";
import type { DaySummaryInput } from "./day-summary";
import { readExplanationStream } from "./explanation-stream";

const cache = new Map<string, string | null>();
type State = { key: string; text: string | null; streaming: boolean; signal?: AbortSignal };
export function useDaySummary(input: DaySummaryInput | null) {
  const body = input ? JSON.stringify(input) : "";
  const key = input ? daySummaryKey(input) : "";
  const [state, setState] = useState<State>({ key: "", text: null, streaming: false });
  useEffect(() => {
    if (!input || cache.has(key)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let raw = "";
      setState({ key, text: null, streaming: true, signal: controller.signal });
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(16000)]);
        const response = await fetch("/api/day-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal });
        raw = await readExplanationStream(response, signal, text => {
          if (!controller.signal.aborted) setState({ key, text, streaming: true, signal: controller.signal });
        });
        if (!controller.signal.aborted) {
          const text = response.ok ? sanitizeDaySummary(raw, input) : null;
          if (cache.size >= 64) cache.delete(cache.keys().next().value!);
          cache.set(key, text);
          setState({ key, text, streaming: false, signal: controller.signal });
        }
      } catch {
        if (!controller.signal.aborted) setState({ key, text: null, streaming: false, signal: controller.signal });
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [body, key, input]);
  if (!input) return { text: null, streaming: false, loading: false };
  if (cache.has(key)) return { text: cache.get(key)!, streaming: false, loading: false };
  const current = state.key === key && !state.signal?.aborted ? state : null;
  return { text: current?.text || null, streaming: current?.streaming || false, loading: !current || (current.streaming && !current.text) };
}
