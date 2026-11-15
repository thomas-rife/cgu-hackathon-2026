import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  let code = ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace('from "openai"', `from "${import.meta.resolve("openai")}"`);
  code = code.replace(/from "\.\/([^\"]+)"/g, (_, dependency) => `from "${load(dependency)}"`);
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  modules.set(name, url); return url;
}
const { streamExplanation, EXPLANATION_SYSTEM_PROMPT } = await import(load('explain'));
const { sanitizeExplanation } = await import(load('explanation-validation'));
const { readExplanationStream } = await import(load('explanation-stream'));
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
function sse(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}
const options = { baseURL: 'http://localhost:1234/v1/', model: 'local-instruct' };
const streamedText = async (fetcher, extra = {}) => new Response(streamExplanation(input, { ...options, fetcher, ...extra })).text();

test('SDK requests streamed chat completions with no tools or retries and forwards only content', async () => {
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++; assert.equal(String(url), 'http://localhost:1234/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.stream, true); assert.equal(body.model, 'local-instruct'); assert.equal(body.temperature, 0); assert.equal(body.max_tokens, 80); assert.equal(body.tools, undefined);
    assert.ok(body.messages[0].content.startsWith(EXPLANATION_SYSTEM_PROMPT));
    assert.ok(body.messages[1].content.startsWith('Explain the selected route vs. the original plan:'));
    return sse([{ choices: [{ delta: { role: 'assistant' } }] }, { choices: [{ delta: { content: sentence.slice(0, 30) } }] }, { choices: [{ delta: { content: sentence.slice(30) }, finish_reason: 'stop' }] }]);
  };
  assert.equal(await streamedText(fetcher), sentence); assert.equal(calls, 1);
});

test('Bolt streams through its explicit answer channel with the eighty-token budget', async () => {
  const fetcher = async (url, init) => {
    assert.equal(String(url), 'http://localhost:1234/v1/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.stream, true); assert.equal(body.max_tokens, 80); assert.equal(body.temperature, 0); assert.equal(body.tools, undefined);
    assert.ok(body.prompt.includes(EXPLANATION_SYSTEM_PROMPT)); assert.ok(body.prompt.endsWith('<|start|>assistant to=user<|message|>'));
    return sse([{ choices: [{ text: sentence.slice(0, 20) }] }, { choices: [{ text: sentence.slice(20), finish_reason: 'stop' }] }]);
  };
  assert.equal(await streamedText(fetcher, { model: 'bolt-instruct-v2' }), sentence);
});

test('first text arrives before the upstream stream finishes', async () => {
  let upstream;
  const fetcher = async () => new Response(new ReadableStream({ start(controller) { upstream = controller; controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Route B "}}]}\n\n')); } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const reader = streamExplanation(input, { ...options, fetcher }).getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), 'Route B '); assert.equal(first.done, false);
  upstream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"uses I-405 for a longer trip."}}]}\n\ndata: [DONE]\n\n')); upstream.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'uses I-405 for a longer trip.');
  assert.equal((await reader.read()).done, true);
});

test('offline, HTTP errors, empty output, and invalid inputs produce empty text without retries', async () => {
  for (const fetcher of [async () => { throw new Error('ECONNREFUSED'); }, async () => new Response('', { status: 503 }), async () => sse([{ choices: [] }])]) assert.equal(await streamedText(fetcher), '');
  assert.equal(await new Response(streamExplanation({}, options)).text(), '');
});

test('cancelling the downstream stream aborts the model request', async () => {
  let upstreamSignal;
  const fetcher = async (_, { signal }) => {
    upstreamSignal = signal;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Route B "}}]}\n\n'));
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const reader = streamExplanation(input, { ...options, fetcher }).getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'Route B ');
  await reader.cancel();
  assert.equal(upstreamSignal.aborted, true);
});

test('the fifteen-second deadline and request cancellation close silently', async () => {
  const fetcher = (_, { signal }) => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
  // Keep the test process alive while AbortSignal.timeout's unref'ed timer runs.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const start = Date.now(); assert.equal(await streamedText(fetcher, { timeoutMs: 15 }), ''); assert.ok(Date.now() - start < 500);
    const controller = new AbortController(); controller.abort();
    assert.equal(await streamedText(fetcher, { signal: controller.signal }), '');
  } finally { clearTimeout(keepAlive); }
});

test('client reader appends partial text, preserves split UTF-8, then applies the existing guard', async () => {
  const encoded = new TextEncoder().encode('"**Route B uses I-405 with lower CO₂ and fewer disadvantaged-community miles.** Another sentence."');
  const split = encoded.indexOf(0xe2) + 1;
  const updates = [];
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(encoded.slice(0, split)); controller.enqueue(encoded.slice(split)); controller.close(); } }));
  const raw = await readExplanationStream(response, new AbortController().signal, text => updates.push(text));
  assert.ok(updates[0].startsWith('"**Route B')); assert.ok(!raw.includes('�'));
  assert.equal(sanitizeExplanation(raw, input), 'Route B uses I-405 with lower CO₂ and fewer disadvantaged-community miles.');
  assert.equal(sanitizeExplanation('Route B saves 999 miles via I-405.', input), null);
});

test('client cancellation closes the reader and prevents later chunks', async () => {
  let cancelled = false;
  const controller = new AbortController(); const updates = [];
  const response = new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('Route B')); }, cancel() { cancelled = true; } }));
  await assert.rejects(readExplanationStream(response, controller.signal, text => { updates.push(text); controller.abort(); }), { name: 'AbortError' });
  assert.equal(cancelled, true); assert.deepEqual(updates, ['Route B']);
});

test('route handler returns plain text and an empty body when the model is unavailable', async t => {
  let code = ts.transpileModule(readFileSync(new URL('../app/api/explain/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace('"@/lib/explain"', JSON.stringify(load('explain')));
  const { POST } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed: ECONNREFUSED'); });
  const response = await POST(new Request('http://localhost/api/explain', { method: 'POST', body: JSON.stringify(input) }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8'); assert.equal(await response.text(), '');
});
