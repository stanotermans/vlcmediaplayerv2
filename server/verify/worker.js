// Vela Player Pro: the purchase check (#53). The Android app sends the Google Play purchase token of "vela_pro"; this
// Worker asks Google (Google Play Developer API) whether that purchase is real and paid, and answers with a verdict
// signed with our own key (ECDSA P-256). The app only unlocks Pro with a verdict whose signature checks out, so a
// faked Google Play answer on the phone (Lucky Patcher) gets nowhere: Google does not know its purchase.
//
// Secrets (wrangler secret put …):
//   GOOGLE_SERVICE_ACCOUNT  the JSON key of a Google Cloud service account that has access to the app in the Play
//                           Console ("View app information and download bulk reports" and "View financial data")
//   SIGNING_KEY             our private key: PKCS#8, base64 (the app has the public key)
// Variables (wrangler.toml): PACKAGE (io.github.stanotermans.velaplayer), PRODUCT (vela_pro)
//
// POST /verify  { "token": "<purchase token>" }
//   → 200 { "verdict": "<base64 JSON>", "sig": "<base64 P-1363 signature of the verdict bytes>" }
//     verdict JSON: { "pkg", "product", "pro": true|false, "tok": "<sha-256 hex of the token>", "iat", "exp" }

const DAY = 24 * 3600;
const VALID = 30 * DAY;   // the app may use a verdict for 30 days (offline too); it asks again before that

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/verify') return json({ error: 'not found' }, 404);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token || token.length > 4096) return json({ error: 'bad request' }, 400);
    try {
      const pro = await purchased(env, token);
      return json(await sign(env, { pkg: env.PACKAGE, product: env.PRODUCT, pro, tok: await sha256hex(token) }));
    } catch (e) {
      return json({ error: 'google unavailable' }, 502);   // (the app keeps its last verdict and asks again later)
    }
  },
};

// true: a real, paid purchase of the product (purchaseState 0); false: Google does not know it, or it was refunded
// or cancelled. Network or Google errors throw.
export async function purchased(env, token, fetcher = fetch) {
  const access = await accessToken(env, fetcher);
  const u = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.PACKAGE)}` +
            `/purchases/products/${encodeURIComponent(env.PRODUCT)}/tokens/${encodeURIComponent(token)}`;
  const r = await fetcher(u, { headers: { authorization: `Bearer ${access}` } });
  if (r.status === 400 || r.status === 404 || r.status === 410) return false;   // not a purchase of ours
  if (!r.ok) throw new Error(`purchases ${r.status}`);
  const p = await r.json();
  return p.purchaseState === 0;
}

// a signed verdict: base64 of the JSON, and base64 of its ECDSA P-256 / SHA-256 signature (r ‖ s, 64 bytes)
export async function sign(env, fields, now = Math.floor(Date.now() / 1000)) {
  const verdict = new TextEncoder().encode(JSON.stringify({ ...fields, iat: now, exp: now + VALID }));
  const key = await crypto.subtle.importKey('pkcs8', b64decode(env.SIGNING_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, verdict);
  return { verdict: b64encode(verdict), sig: b64encode(new Uint8Array(sig)) };
}

// an OAuth access token for the service account (a JWT signed with its RS256 key), kept for its hour
let cached = { token: '', until: 0 };
async function accessToken(env, fetcher) {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.until > now + 60) return cached.token;
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', b64decode(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const r = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64url(new Uint8Array(sig))}` });
  if (!r.ok) throw new Error(`oauth ${r.status}`);
  const t = await r.json();
  cached = { token: t.access_token, until: now + (t.expires_in || 3600) };
  return cached.token;
}

async function sha256hex(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function json(o, status = 200) { return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } }); }
function b64encode(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function b64decode(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function b64url(bytes) { return b64encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
