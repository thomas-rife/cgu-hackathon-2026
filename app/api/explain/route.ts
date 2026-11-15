import { streamExplanation } from "@/lib/explain";

const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" };

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 16000) return new Response(null, { status: 400, headers });
    const stream = streamExplanation(JSON.parse(raw), {
      baseURL: process.env.LLM_BASE_URL || "http://localhost:1234/v1",
      model: process.env.LLM_MODEL || "bolt-instruct-v2",
      signal: request.signal,
    });
    return new Response(stream, { headers });
  } catch { return new Response(null, { headers }); }
}
