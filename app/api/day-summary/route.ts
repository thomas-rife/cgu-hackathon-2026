import { streamDaySummary } from "@/lib/day-summary-stream";
import { z } from "zod";

const number = z.number().finite();
const inputSchema = z.object({
  tripCount: z.number().int().min(1).max(100),
  totals: z.object({ miles: number, fuel: number, co2Kg: number, dacMi: number, highDieselMi: number, driveMin: number }).strict(),
  vsFastest: z.object({ extraFuel: number, extraMin: number, dacMiAvoided: number, co2Delta: number }).strict(),
  trips: z.array(z.object({ from: z.string().max(160), to: z.string().max(160), chosen: z.string().max(40), tags: z.array(z.string().max(80)).max(4), disruptions: z.array(z.string().max(160)).max(8), extraMin: number, extraFuel: number, dacMiAvoided: number }).strict()).min(1).max(100),
}).strict().refine(input => input.tripCount === input.trips.length);
const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" };
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 64000) return new Response(null, { status: 400, headers });
    const parsed = inputSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return new Response(null, { status: 400, headers });
    return new Response(streamDaySummary(parsed.data, { baseURL: process.env.LLM_BASE_URL || "http://localhost:1234/v1", model: process.env.LLM_MODEL || "bolt-instruct-v2", signal: request.signal }), { headers });
  } catch { return new Response(null, { headers }); }
}
