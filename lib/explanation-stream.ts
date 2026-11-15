// Decode incrementally so UTF-8 characters split between network chunks stay intact.
export async function readExplanationStream(response: Response, signal: AbortSignal, onText: (text: string) => void): Promise<string> {
  if (!response.ok || !response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      text += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (text.length > 4000) throw new Error("Explanation too long");
      if (text) onText(text);
      if (done) return text;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
