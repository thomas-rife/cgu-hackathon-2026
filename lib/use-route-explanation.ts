"use client";

import { useEffect, useState } from "react";
import { explanationKey } from "./route-explanation";
import type { ExplanationRequest } from "./route-explanation";

const sessionCache = new Map<string, string>();

export function useRouteExplanation(selectedId: string, input: ExplanationRequest, departureMinutes: number | undefined) {
  const body = JSON.stringify(input);
  const key = explanationKey(selectedId, input, departureMinutes);
  const [result, setResult] = useState<{ key: string; text: string | null }>({ key: "", text: null });
  useEffect(() => {
    if (sessionCache.has(key)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let text: string | null = null;
      try {
        const response = await fetch("/api/explain", {
          method: "POST", headers: { "Content-Type": "application/json" }, body,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(16000)]),
        });
        const data = response.ok ? await response.json() : null;
        text = typeof data?.text === "string" && data.text.trim() ? data.text : null;
      } catch { /* Explanation failures never affect routing. */ }
      if (controller.signal.aborted) return;
      if (text) {
        if (sessionCache.size >= 128) sessionCache.delete(sessionCache.keys().next().value!);
        sessionCache.set(key, text);
      }
      setResult({ key, text });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [body, key]);
  const cached = sessionCache.get(key);
  return { text: cached || (result.key === key ? result.text : null), loading: !cached && result.key !== key };
}
