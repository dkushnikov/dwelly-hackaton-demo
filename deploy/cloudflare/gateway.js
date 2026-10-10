// Shared, runtime-independent gateway rules. No credentials belong in this file.
export const MODEL = 'claude-haiku-4-5-20251001';
export const BUDGET_MICRO_USD = 5_000_000;
// 200k input at $2/MTok (including 1h cache creation), 8k output at $5/MTok.
export const REQUEST_RESERVE = 440_000;
export const COOKIE = '__Host-village';
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const bytes = value => Uint8Array.from(value.match(/../g) || [], h => parseInt(h, 16));

export function json(value, status = 200) {
  return Response.json(value, {status, headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export async function samePassword(a, b) {
  const [x,y] = await Promise.all([a,b].map(v => crypto.subtle.digest('SHA-256', encoder.encode(v))));
  return new Uint8Array(x).reduce((diff,v,i) => diff | (v ^ new Uint8Array(y)[i]), 0) === 0;
}
async function signingKey(password) {
  return crypto.subtle.importKey('raw', encoder.encode(password), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
}
export async function issueCookie(password, origin, now = Date.now()) {
  const expires = Math.floor(now / 1000) + 8 * 3600;
  const payload = `${origin}|${expires}`;
  const signature = hex(await crypto.subtle.sign('HMAC', await signingKey(password), encoder.encode(payload)));
  return `${COOKIE}=${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}
export async function authenticated(request, password, origin, now = Date.now()) {
  const value = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value || !/^\d{10}\.[a-f0-9]{64}$/.test(value)) return false;
  const [expires, signature] = value.split('.');
  if (+expires <= Math.floor(now / 1000) || +expires > Math.floor(now / 1000) + 28800) return false;
  return crypto.subtle.verify('HMAC', await signingKey(password), bytes(signature), encoder.encode(`${origin}|${expires}`));
}
export function sameOrigin(request, origin) {
  return request.headers.get('origin') === origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}
export function validateMessage(body) {
  const allowed = new Set(['model','max_tokens','messages','system','tools','tool_choice','temperature','stop_sequences']);
  if (!body || typeof body !== 'object' || Object.keys(body).some(k => !allowed.has(k))) throw new Error('Unsupported model options');
  if (body.model !== MODEL || !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 8000) throw new Error('Model or output budget is not allowed');
  if (!Array.isArray(body.messages) || (body.tools && (!Array.isArray(body.tools) || body.tools.some(t => !t || (t.type && t.type !== 'custom') || !t.input_schema)))) throw new Error('Only messages and custom tools are allowed');
  return body;
}
export function usageCharge(usage) {
  // Missing/unknown receipts retain the entire reservation. Never refund on failure.
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)) return null;
  const counts = [usage.input_tokens, usage.output_tokens, usage.cache_creation_input_tokens ?? 0, usage.cache_read_input_tokens ?? 0];
  if (counts.some(n => !Number.isSafeInteger(n) || n < 0)) return null;
  const [input, output, creation, read] = counts;
  if (input + creation + read > 200000 || output > 8000) return null;
  return Math.ceil(input + output * 5 + creation * 2 + read / 10);
}
export async function boundedText(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('Request too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(result);
}
export function loginPage(message = '') {
  // Message is an internal constant, never user-supplied text.
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lettings Village · Sign in</title><style>body{font:18px system-ui;background:#f7f7ed;color:#304336;max-width:420px;margin:12vh auto;padding:24px}h1{font:44px Georgia}input,button{font:inherit;box-sizing:border-box;width:100%;padding:14px;margin:12px 0;border:1px solid #bbc7ab;border-radius:8px}button{background:#496c4a;color:white;cursor:pointer}small{color:#61715d}</style><h1>Lettings Village</h1><p>A shared, private demo.</p><p role="alert">${message}</p><form method="post" action="/login"><label for="password">Demo password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button>Enter the village</button></form><small>Simulation is free of model calls. Live cases use a shared demo budget.</small></html>`, {headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff'}});
}
