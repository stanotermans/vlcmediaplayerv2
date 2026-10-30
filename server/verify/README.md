# Vela Player Pro: the purchase check

The Android app only unlocks Pro when this small server confirms the purchase with Google. A Google Play answer that is faked on the phone (Lucky Patcher and similar apps) gets nowhere: Google doesn't know that purchase, so the server answers "not bought". The answer is signed with our own key (ECDSA P-256), and the app checks that signature with the public key built into [`VelaVerdict.java`](../../qt/packaging/android/src/io/github/stanotermans/velaplayer/VelaVerdict.java). The app keeps a "bought" answer for 30 days, so Pro also works offline, and asks again after 7 days.

It runs on **Cloudflare Workers** (free up to 100,000 requests a day): [`worker.js`](worker.js), [`wrangler.toml`](wrangler.toml). Tests: `node server/verify/test.mjs`.

## Setting it up (once)

You need: a Cloudflare account, the Google Cloud project of your Play Console, and the private key `SIGNING_KEY.txt` (kept outside the repository).

### 1. Google: a service account that may look up purchases

1. Open [Google Cloud Console](https://console.cloud.google.com/) and pick (or create) a project.
2. *APIs & Services → Library*: turn on **Google Play Android Developer API**.
3. *IAM & Admin → Service accounts → Create service account*, e.g. `vela-verify`. No roles are needed here.
4. Open the new service account → *Keys → Add key → Create new key → JSON*. A `.json` file downloads; keep it safe and never put it in the repository.
5. In the **Play Console**: *Users and permissions → Invite new users*, enter the service account's email address (`vela-verify@…iam.gserviceaccount.com`). Under *App permissions*, add Vela Player and tick **View financial data, orders and cancellation survey responses**. Send the invitation. It can take up to a day before Google lets it read purchases.

### 2. Cloudflare: put the Worker online

In a terminal, in this folder (`server/verify`):

```bash
npx wrangler login
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
npx wrangler secret put SIGNING_KEY
npx wrangler deploy
```

- `wrangler login` opens the browser to sign in to Cloudflare.
- For `GOOGLE_SERVICE_ACCOUNT`, paste the **whole content** of the downloaded `.json` file.
- For `SIGNING_KEY`, paste the content of `SIGNING_KEY.txt`.
- `wrangler deploy` prints the address, e.g. `https://vela-verify.<your-subdomain>.workers.dev`. The app uses `https://vela-verify.stanotermans.workers.dev/verify` ([`VelaStore.java`](../../qt/packaging/android/src/io/github/stanotermans/velaplayer/VelaStore.java), `VERIFY_URL`); if your subdomain is different, that line must change.

### 3. Check it

```bash
curl -X POST https://vela-verify.<your-subdomain>.workers.dev/verify -H "content-type: application/json" -d "{\"token\":\"test\"}"
```

The answer should be `{"verdict":"…","sig":"…"}` (a verdict with `"pro":false`, because `test` is no purchase). `{"error":"google unavailable"}` means the service account can't read purchases yet (step 1.5, or wait a little longer).

## The keys

- `SIGNING_KEY` (private) lives only in Cloudflare and in your backup. Whoever has it can make "bought" answers.
- The public key is in `VelaVerdict.java`. A new key pair means every installed app must be updated, so keep the backup.
