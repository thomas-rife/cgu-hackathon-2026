import { generateExplanation } from "@/lib/explain";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 16000) return Response.json({ text: null }, { status: 400 });
    const text = await generateExplanation(JSON.parse(raw), {
      baseURL: process.env.LLM_BASE_URL || "http://localhost:1234/v1",
      model: process.env.LLM_MODEL || "bolt-instruct-v2",
      signal: request.signal,
    });
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ text: null }); }
}
