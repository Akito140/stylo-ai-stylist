# Stylo AI Stylist API

A reusable, small AI-stylist backend for static sites and other frontends. It runs on Cloudflare Workers and calls the Gemini Developer API without exposing the provider key in browser code.

## What it provides

- `POST /api/chat` — personalized Russian-language style advice.
- `GET /health` — deployment health check.
- Gemini model selection through `GEMINI_MODEL`.
- Browser-origin allowlist and per-IP rate limiting.
- Input size, message count, and message length validation.
- Context allowlisting: only supported profile and clothing fields are forwarded.

The backend does not store messages or profile data. The calling application submits recent chat messages, optional profile preferences, wardrobe items, products, and outfit descriptions with each request. Do not send photos or sensitive personal information.

## Free presentation setup

Gemini offers a free API tier for selected models, but availability, quotas, and rate limits depend on the Google AI Studio project and can change. Check the active limits in [Google AI Studio](https://aistudio.google.com/rate-limit). Google states that free-tier content may be used to improve its products; do not send confidential information.

Cloudflare Workers has a free plan with a documented allowance of 100,000 Worker requests per day. Provider quotas are separate, and free quotas are not guaranteed capacity.

## Deploy

Requirements: Node.js 20+, a Cloudflare account, and a Gemini API key.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Authenticate Wrangler:

   ```sh
   npx wrangler login
   ```

3. Set the Gemini key as a Worker secret. Do not commit it or put it in frontend code:

   ```sh
   npx wrangler secret put GEMINI_API_KEY
   ```

4. In the Cloudflare dashboard, open the Worker settings and add the variable `ALLOWED_ORIGINS` with the exact origin(s) of the website(s) allowed to use the API. Example:

   ```text
   https://akito140.github.io,http://localhost:5173
   ```

   An origin is the scheme + hostname + optional port; do not include a path.

5. Optionally add `GEMINI_MODEL` as a Worker variable. The default is `gemini-3.5-flash-lite`; confirm that the model is available for the API key and free tier in AI Studio.

6. Deploy:

   ```sh
   npm run deploy
   ```

7. Check `https://<worker-name>.<account-subdomain>.workers.dev/health`.

The Worker rate limiter is set to 12 requests per client IP per minute. Cloudflare documents this binding as approximate and scoped per location. CORS is not authentication; for a public presentation endpoint, keep the allowlist narrow and monitor provider quotas.

The `namespace_id` in `wrangler.toml` must be a unique integer in your Cloudflare account. Change `1001` if it is already used by another rate-limit binding in that account.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, add a valid local API key, then run:

```sh
npm run dev
npm test
```

`.dev.vars` is gitignored. Never share a key in chat, commits, screenshots, or browser code.

## Connect a frontend

Send a JSON request to `/api/chat` with the configured allowed `Origin`:

```js
const response = await fetch(`${STYLIST_API_URL}/api/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'user', text: 'Что надеть на встречу?' }
    ],
    context: {
      profile: { style: 'минимализм', favoriteColors: 'чёрный, белый' },
      wardrobe: [{ name: 'Чёрная рубашка', category: 'верх' }],
      products: [{ name: 'Бордовое пальто', category: 'верхняя одежда' }],
      looks: [{ name: 'После полуночи', description: 'Чёрный монохромный образ' }]
    }
  })
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error || 'Stylist request failed.');
}

const { reply } = await response.json();
```

The browser never receives `GEMINI_API_KEY`. Configure every frontend origin in `ALLOWED_ORIGINS`; add no wildcard origins.

## API contract

Request:

```json
{
  "messages": [
    { "role": "user", "text": "Подбери образ на каждый день" },
    { "role": "assistant", "text": "Какой стиль тебе нравится?" },
    { "role": "user", "text": "Минимализм" }
  ],
  "context": {
    "profile": {},
    "wardrobe": [],
    "products": [],
    "looks": []
  }
}
```

Success response: `200 { "reply": "..." }`. Errors return a JSON `error` field with an appropriate HTTP status, including `400`, `403`, `413`, `429`, `502`, or `503`.
