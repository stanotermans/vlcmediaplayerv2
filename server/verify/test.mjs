// Tests of the purchase check (node server/verify/test.mjs): Google answered by a fake (no network, no real keys).
//   - a paid purchase → a "pro" verdict; refunded or unknown → not pro; Google down → an error (no verdict)
//   - the verdict's signature checks out with the public key, and a changed verdict does not
// With --sign <SIGNING_KEY file> <token> it prints a verdict signed with that key ({ verdict, sig }), for the app's test.
import { purchased, sign } from './worker.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const subtle = globalThis.crypto.subtle;
const b64 = u8 => Buffer.from(u8).toString('base64');

if (process.argv[2] === '--sign') {
  const env = { PACKAGE: 'io.github.stanotermans.velaplayer', PRODUCT: 'vela_pro', SIGNING_KEY: readFileSync(process.argv[3], 'utf8').trim() };
  const tok = await subtle.digest('SHA-256', new TextEncoder().encode(process.argv[4]));
  const hex = [...new Uint8Array(tok)].map(b => b.toString(16).padStart(2, '0')).join('');
  console.log(JSON.stringify(await sign(env, { pkg: env.PACKAGE, product: env.PRODUCT, pro: process.argv[5] !== 'free', tok: hex })));
  process.exit(0);
}

// a service account and a signing key just for this test
const rsa = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pem = `-----BEGIN PRIVATE KEY-----\n${b64(new Uint8Array(await subtle.exportKey('pkcs8', rsa.privateKey)))}\n-----END PRIVATE KEY-----\n`;
const ec = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const env = { PACKAGE: 'io.github.stanotermans.velaplayer', PRODUCT: 'vela_pro',
              GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'test@example.iam.gserviceaccount.com', private_key: pem }),
              SIGNING_KEY: b64(new Uint8Array(await subtle.exportKey('pkcs8', ec.privateKey))) };

// the fake Google: the OAuth token (its JWT checked against the service account's public key), then the purchase
let purchase = { status: 200, body: { purchaseState: 0 } };
const asked = [];
async function google(url, init = {}) {
  asked.push(url);
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    const jwt = new URLSearchParams(init.body).get('assertion').split('.');
    const ok = await subtle.verify('RSASSA-PKCS1-v1_5', rsa.publicKey, Buffer.from(jwt[2], 'base64url'), new TextEncoder().encode(`${jwt[0]}.${jwt[1]}`));
    assert.ok(ok, 'the JWT is signed with the service account key');
    const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
    return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
  }
  assert.match(url, /\/applications\/io\.github\.stanotermans\.velaplayer\/purchases\/products\/vela_pro\/tokens\/tok%2F1$/);
  assert.equal(init.headers.authorization, 'Bearer AT');
  return new Response(JSON.stringify(purchase.body), { status: purchase.status });
}

assert.equal(await purchased(env, 'tok/1', google), true, 'paid');
purchase = { status: 200, body: { purchaseState: 1 } };
assert.equal(await purchased(env, 'tok/1', google), false, 'cancelled / refunded');
purchase = { status: 400, body: { error: 'invalid token' } };
assert.equal(await purchased(env, 'tok/1', google), false, 'a token Google does not know (a faked purchase)');
purchase = { status: 503, body: {} };
await assert.rejects(purchased(env, 'tok/1', google), 'Google down: no verdict');

// the signature: checks out unchanged, not after a change
const v = await sign(env, { pkg: env.PACKAGE, product: env.PRODUCT, pro: true, tok: 'ab' }, 1000);
const bytes = Buffer.from(v.verdict, 'base64');
assert.deepEqual(JSON.parse(bytes), { pkg: env.PACKAGE, product: env.PRODUCT, pro: true, tok: 'ab', iat: 1000, exp: 1000 + 30 * 86400 });
assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ec.publicKey, Buffer.from(v.sig, 'base64'), bytes));
const forged = Buffer.from(JSON.stringify({ ...JSON.parse(bytes), exp: 9999999999 }));
assert.ok(!await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ec.publicKey, Buffer.from(v.sig, 'base64'), forged));
console.log('ok:', asked.length, 'requests to the fake Google');
