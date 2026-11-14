import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  let code = ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace(/from "\.\/([^\"]+)"/g, (_, dependency) => `from "${load(dependency)}"`);
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  modules.set(name, url); return url;
}
const { sanitizeExplanation, generateExplanation, EXPLANATION_SYSTEM_PROMPT } = await import(load('explain'));
const { normalizeExplanationRequest, explanationKey, explanationMetrics } = await import(load('route-explanation'));
const input = {
  original: { freeways: ['I-710', 'CA-91', 'CA-60'], timeMin: 84, miles: 63.7, fuel: 92.1, co2Kg: 115.7, dacMi: 25.6, dieselPct: 86 },
  selected: { name: 'Route B', tag: 'Balanced', freeways: ['I-405', 'I-605', 'CA-60'], timeMin: 101, miles: 62, fuel: 90.7, co2Kg: 113.9, dacMi: 15.8, dieselPct: 81 },
  disruptions: ['CA-91 closed', 'Lane closure on CA-60'],
};
const sentence = 'Route B avoids CA-91 via I-405 and I-605, trading a longer trip for fewer miles through disadvantaged communities.';
test('strips markdown and quotes, preserves decimal values, and takes only the first sentence', () => {
  assert.equal(sanitizeExplanation('"**' + sentence + '** Another sentence has 999 miles."', input), sentence);
  assert.equal(sanitizeExplanation('Route B uses I-405 with 15.8 miles through disadvantaged communities.', input), 'Route B uses I-405 with 15.8 miles through disadvantaged communities.');
  assert.equal(sanitizeExplanation('<think>999 miles?</think>' + sentence, input), sentence);
});
test('rejects invented numeric and written numbers, computed deltas, and invented road IDs', () => {
  for (const text of ['Route B adds 17 minutes via I-405.', 'Route B adds seventeen minutes via I-405.', 'Route B uses I-84 and takes 101 minutes.', 'Route B halves travel on I-405 in 2 hours.']) assert.equal(sanitizeExplanation(text, input), null, text);
  assert.equal(sanitizeExplanation('Route B uses I-405 with lower CO2 and fewer disadvantaged-community miles.', input), 'Route B uses I-405 with lower CO2 and fewer disadvantaged-community miles.');
});
test('empty, overlong, invalid, and unfinished reasoning outputs are hidden', () => {
  for (const text of ['', null, ' ', '<think>still thinking', Array(31).fill('word').join(' ')]) assert.equal(sanitizeExplanation(text, input), null);
  assert.equal(normalizeExplanationRequest({ ...input, original: { ...input.original, timeMin: NaN } }), null);
  assert.equal(normalizeExplanationRequest({ ...input, disruptions: 'CA-91 closed' }), null);
});
test('rounds the same displayed fields and preserves ordered freeways and missing data', () => {
  const metrics = explanationMetrics({ minutes: 83.701, miles: 60.332, freeways: [{ id: 'I-710' }, { id: 'CA-91' }], communityImpact: { avgDieselPct: null, dacMi: 0 } }, 8.1);
  assert.deepEqual(metrics.freeways, ['I-710', 'CA-91']); assert.equal(metrics.timeMin, 83.7); assert.equal(metrics.miles, 60.3); assert.equal(metrics.dacMi, null); assert.equal(metrics.dieselPct, null);
  const normalized = normalizeExplanationRequest({ ...input, original: { ...input.original, timeMin: 84.01234, fuel: 92.104 } });
  assert.equal(normalized.original.timeMin, 84); assert.equal(normalized.original.fuel, 92.1);
});
test('cache keys cover selection, constraints, time, reference, and diesel price', () => {
  const key = explanationKey('b', input, 480);
  assert.equal(key, explanationKey('b', { ...input, disruptions: [...input.disruptions].reverse() }, 480));
  assert.notEqual(key, explanationKey('a', input, 480)); assert.notEqual(key, explanationKey('b', input, 495));
  assert.notEqual(key, explanationKey('b', { ...input, disruptions: [] }, 480));
  assert.notEqual(key, explanationKey('b', { ...input, selected: { ...input.selected, fuel: 99 } }, 480));
});
test('uses the local OpenAI-compatible protocol with no tools or retries', async () => {
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++; assert.equal(url, 'http://localhost:1234/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'local-instruct'); assert.equal(body.temperature, 0); assert.equal(body.max_tokens, 80); assert.equal(body.tools, undefined);
    assert.ok(body.messages[0].content.startsWith(EXPLANATION_SYSTEM_PROMPT)); assert.ok(body.messages[1].content.startsWith('Explain the selected route vs. the original plan:'));
    return Response.json({ choices: [{ message: { content: sentence }, finish_reason: 'stop' }] });
  };
  assert.equal(await generateExplanation(input, { baseURL: 'http://localhost:1234/v1/', model: 'local-instruct', fetcher }), sentence); assert.equal(calls, 1);
});
test('offline server, HTTP errors, empty output, invented numbers, and token-limit truncation return null', async () => {
  for (const fetcher of [async () => { throw new Error('ECONNREFUSED'); }, async () => new Response('', { status: 503 }), async () => Response.json({ choices: [] }), async () => Response.json({ choices: [{ message: { content: 'Route B saves 999 miles.' } }] }), async () => Response.json({ choices: [{ message: { content: sentence }, finish_reason: 'length' }] })]) assert.equal(await generateExplanation(input, { baseURL: 'http://local/v1', model: 'bolt', fetcher }), null);
});
test('times out and honors cancellation without surfacing errors', async () => {
  const fetcher = (_, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(Response.json({ choices: [] })), 1000);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
  const start = Date.now(); assert.equal(await generateExplanation(input, { baseURL: 'http://local/v1', model: 'bolt', timeoutMs: 10, fetcher }), null); assert.ok(Date.now() - start < 500);
  const controller = new AbortController(); controller.abort();
  assert.equal(await generateExplanation(input, { baseURL: 'http://local/v1', model: 'bolt', signal: controller.signal, fetcher }), null);
});

test('Bolt uses its explicit answer channel and still spends at most eighty output tokens',async()=>{
  let calls=0;
  const fetcher=async(url,init)=>{
    calls++;assert.equal(url,'http://localhost:1234/v1/completions');
    const body=JSON.parse(init.body);assert.equal(body.model,'bolt-instruct-v2');assert.equal(body.max_tokens,80);assert.equal(body.temperature,0);assert.equal(body.tools,undefined);
    assert.ok(body.prompt.includes(EXPLANATION_SYSTEM_PROMPT));assert.ok(body.prompt.endsWith('<|start|>assistant to=user<|message|>'));
    assert.ok(body.prompt.includes('Explain the selected route vs. the original plan:'));
    return Response.json({choices:[{text:sentence,finish_reason:'stop'}]});
  };
  assert.equal(await generateExplanation(input,{baseURL:'http://localhost:1234/v1',model:'bolt-instruct-v2',fetcher}),sentence);assert.equal(calls,1);
});
test('the route handler returns a silent null result when the model server is unavailable', async t => {
  let code=ts.transpileModule(readFileSync(new URL('../app/api/explain/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  code=code.replace('"@/lib/explain"',JSON.stringify(load('explain')));
  const {POST}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('fetch failed: ECONNREFUSED');});
  const response=await POST(new Request('http://localhost/api/explain',{method:'POST',body:JSON.stringify(input)}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{text:null});
});
