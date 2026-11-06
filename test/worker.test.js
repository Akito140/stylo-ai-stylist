import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const origin = 'https://akito140.github.io';
const env = {
  ALLOWED_ORIGINS: origin,
  GEMINI_API_KEY: 'test-key',
  STYLIST_RATE_LIMITER: { limit: async () => ({ success: true }) }
};

const makeRequest = (body, overrides = {}) => new Request('https://stylist.example/api/chat', {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10', ...overrides.headers },
  body: JSON.stringify(body)
});

test('health endpoint responds without provider configuration', async () => {
  const response = await worker.fetch(new Request('https://stylist.example/health'), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'stylo-ai-stylist' });
});

test('chat calls Gemini and returns the model response', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options };
    return Response.json({ candidates: [{ content: { parts: [{ text: 'Надень бордовую рубашку с денимом.' }] } }] });
  };
  try {
    const response = await worker.fetch(makeRequest({
      messages: [{ role: 'user', text: 'Подбери образ' }],
      context: { profile: { height: 170, shoeSize: '38', secret: 'не передавать' } }
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: 'Надень бордовую рубашку с денимом.' });
    assert.equal(new URL(upstreamRequest.url).search, '');
    assert.equal(upstreamRequest.options.headers['x-goog-api-key'], 'test-key');
    const body = JSON.parse(upstreamRequest.options.body);
    assert.equal(body.contents[0].role, 'user');
    assert.match(body.systemInstruction.parts[0].text, /"shoeSize":"38"/);
    assert.doesNotMatch(body.systemInstruction.parts[0].text, /secret|не передавать/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects requests from origins that are not configured', async () => {
  const response = await worker.fetch(makeRequest({ messages: [{ role: 'user', text: 'Привет' }] }, {
    headers: { origin: 'https://attacker.example' }
  }), env);
  assert.equal(response.status, 403);
});

test('rejects malformed chat messages before calling Gemini', async () => {
  const response = await worker.fetch(makeRequest({ messages: [{ role: 'user', text: 'x'.repeat(1_201) }] }), env);
  assert.equal(response.status, 400);
});

test('enforces per-IP rate limiting before calling Gemini', async () => {
  const limitedEnv = {
    ...env,
    STYLIST_RATE_LIMITER: { limit: async ({ key }) => ({ key, success: false }) }
  };
  const response = await worker.fetch(makeRequest({ messages: [{ role: 'user', text: 'Привет' }] }), limitedEnv);
  assert.equal(response.status, 429);
});

test('does not expose provider error details to the browser', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('private provider response', { status: 401 });
  try {
    const response = await worker.fetch(makeRequest({ messages: [{ role: 'user', text: 'Привет' }] }), env);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private provider response|test-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
