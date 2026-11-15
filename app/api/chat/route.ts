import { chatResponse } from "@/lib/chat";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 100000) return Response.json({ error: "Message too long." }, { status: 400 });
    return await chatResponse(JSON.parse(body), {
      baseURL: process.env.LLM_BASE_URL || "http://localhost:1234/v1",
      model: process.env.LLM_MODEL || "bolt-instruct-v2",
      signal: request.signal,
    });
  } catch { return Response.json({ error: "Couldn't apply that, try rephrasing." }, { status: 400 }); }
}
