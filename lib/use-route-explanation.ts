"use client";

import { useEffect, useState } from "react";
import { explanationKey } from "./route-explanation";
import { sanitizeExplanation } from "./explanation-validation";
import { readExplanationStream } from "./explanation-stream";
import type { ExplanationRequest } from "./route-explanation";

// null is a cached hidden result, distinct from a route we haven't requested yet.
const sessionCache = new Map<string, string | null>();
function cacheResult(key: string, text: string | null) {
  if (sessionCache.size >= 128) sessionCache.delete(sessionCache.keys().next().value!);
  sessionCache.set(key, text);
}
type Result = { key: string; signal?: AbortSignal; text: string | null; phase: "streaming" | "fading" | "done" };

export function useRouteExplanation(selectedId: string, input: ExplanationRequest, departureMinutes: number | undefined) {
  const body = JSON.stringify(input);
  const key = explanationKey(selectedId, input, departureMinutes);
  const [result, setResult] = useState<Result>({ key: "", text: null, phase: "done" });
  useEffect(() => {
    if (sessionCache.has(key)) return;
    const controller = new AbortController();
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingHidden = false;
    const timer = setTimeout(async () => {
      let raw = "";
      let completed = false;
      setResult({ key, signal: controller.signal, text: null, phase: "streaming" });
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(16000)]);
        const response = await fetch("/api/explain", {
          method: "POST", headers: { "Content-Type": "application/json" }, body, signal,
        });
        raw = await readExplanationStream(response, signal, text => {
          raw = text;
          if (!controller.signal.aborted) setResult({ key, signal: controller.signal, text, phase: "streaming" });
        });
        completed = response.ok;
      } catch { /* Explanation failures never affect routing. */ }
      if (controller.signal.aborted) return;
      const text = completed ? sanitizeExplanation(raw, JSON.parse(body)) : null;
      if (completed && text) cacheResult(key, text);
      if (!text && raw) {
        pendingHidden = completed;
        setResult({ key, signal: controller.signal, text: raw, phase: "fading" });
        fadeTimer = setTimeout(() => {
          if (completed) cacheResult(key, null);
          pendingHidden = false;
          setResult({ key, signal: controller.signal, text: null, phase: "done" });
        }, 200);
      } else {
        if (completed && !text) cacheResult(key, null);
        setResult({ key, signal: controller.signal, text, phase: "done" });
      }
    }, 400);
    return () => {
      clearTimeout(timer); clearTimeout(fadeTimer); controller.abort();
      if (pendingHidden) cacheResult(key, null);
    };
  }, [body, key]);
  const current = result.key === key && !result.signal?.aborted ? result : null;
  if (sessionCache.has(key)) return { text: sessionCache.get(key)!, loading: false, streaming: false, fading: false };
  if (current?.phase === "fading") return { text: current.text, loading: false, streaming: false, fading: true };
  return {
    text: current?.text ?? null,
    loading: !current || (current.phase === "streaming" && !current.text),
    streaming: current?.phase === "streaming",
    fading: false,
  };
}
