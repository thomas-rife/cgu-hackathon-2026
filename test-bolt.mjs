// Tool-calling test for local models (Bolt, Qwen, etc.)
// Usage:
//   npm i openai
//   MODEL=<model id> node test-bolt.mjs
//   (Ollama instead of LM Studio: BASE_URL=http://localhost:11434/v1 MODEL=<id> node test-bolt.mjs)
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.BASE_URL ?? "http://localhost:1234/v1", // LM Studio default
  apiKey: "local",
});
const MODEL = process.env.MODEL ?? "bolt-instruct-v2";

const tools = [
  {
    type: "function",
    function: {
      name: "get_route_freeways",
      description: "List the freeways the current route uses.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "run_scenario",
      description:
        "Simulate disruptions on the current route and return the new route and indicators.",
      parameters: {
        type: "object",
        properties: {
          closures: {
            type: "array",
            items: {
              type: "object",
              properties: { freeway: { type: "string", description: "e.g. I-710, CA-60" } },
              required: ["freeway"],
            },
          },
          slowdowns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                freeway: { type: "string" },
                type: { type: "string", enum: ["lane_closure", "crash"] },
              },
              required: ["freeway", "type"],
            },
          },
          departure: { type: "string", description: "24h HH:MM" },
          weather: { type: "string", enum: ["clear", "rain"] },
        },
      },
    },
  },
];

const SYSTEM =
  "You are a dispatch assistant. Use tools to simulate scenarios on the user's current route. " +
  "Only use the tools provided. If a request can't be done with them, say so briefly and do not call a tool.";

const num = (s = "") => (String(s).match(/\d+/) ?? [])[0];
const hhmm = (s = "") => {
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s;
};

// strict = exact format; loose = what you'd accept after normalizing in your own code
const tests = [
  ["What if the 710 is closed?",
    c => c?.name === "run_scenario" && num(c.args.closures?.[0]?.freeway) === "710"],
  ["Close the 10, 15 and 710 at 3pm",
    c => c?.name === "run_scenario" &&
      (c.args.closures ?? []).map(x => num(x.freeway)).sort().join() === "10,15,710" &&
      hhmm(c.args.departure) === "15:00"],
  ["There's a crash on the 60",
    c => c?.name === "run_scenario" && num(c.args.slowdowns?.[0]?.freeway) === "60" &&
      c.args.slowdowns[0].type === "crash"],
  ["Leave at 7:30 instead",
    c => c?.name === "run_scenario" && hhmm(c.args.departure) === "07:30"],
  ["What if it rains?",
    c => c?.name === "run_scenario" && c.args.weather === "rain"],
  ["Lane closure on the 710, leaving at 8am in the rain",
    c => c?.name === "run_scenario" && c.args.slowdowns?.[0]?.type === "lane_closure" &&
      hhmm(c.args.departure) === "08:00" && c.args.weather === "rain"],
  ["Which freeways am I using?",
    c => c?.name === "get_route_freeways"],
  ["Close the five",
    c => c?.name === "run_scenario" && num(c.args.closures?.[0]?.freeway) === "5"],
  ["What's the weather in Paris?",
    c => c === null],
  ["Book me a hotel in Ontario",
    c => c === null],
];

let pass = 0;
let totalSec = 0;
for (const [prompt, check] of tests) {
  const t0 = Date.now();
  let call = null, text = "", err = "";
  try {
    const r = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      tools,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    });
    const msg = r.choices[0].message;
    text = (msg.content ?? "").slice(0, 120).replace(/\s+/g, " ");
    const tc = msg.tool_calls?.[0];
    if (tc) call = { name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") };
  } catch (e) {
    err = e.message;
  }
  const sec = (Date.now() - t0) / 1000;
  totalSec += sec;
  const ok = !err && check(call);
  pass += ok ? 1 : 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${sec.toFixed(1)}s  ${prompt}`);
  console.log(`     -> ${err || (call ? JSON.stringify(call) : `(no tool) ${text}`)}`);
}
console.log(`\n${MODEL}: ${pass}/${tests.length} passed, avg ${(totalSec / tests.length).toFixed(1)}s/call`);
