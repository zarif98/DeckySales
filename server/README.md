# Credentials endpoint

The plugin ships no API keys. It asks this endpoint for the IsThereAnyDeal and
exchangerate-api keys on first use, then caches them in memory for 12 hours.

Running your own means the plugin depends only on infrastructure you control,
and lets you rotate a key without shipping a plugin release.

> **These keys are not secret.** Anyone running the plugin can read this
> endpoint's response, and the same was true of the original hosted endpoint.
> What this design buys is central rotation, not confidentiality. Treat the
> keys as public and rely on each provider's rate limits.

## 1. Get the API keys

| Key | Where | Notes |
| :-- | :-- | :-- |
| `ITAD_API_KEY` | <https://isthereanydeal.com/apps/> — register an app | Required. Without it the plugin shows "Data unavailable" everywhere. |
| `EXCHANGE_RATE_API_KEY` | <https://www.exchangerate-api.com/> — free tier | Optional-ish: without it, prices are still shown in each store's own currency, but cross-currency comparison silently falls back to comparing raw numbers. |

Both must match `^[A-Za-z0-9._-]{16,256}$`, which is what the plugin accepts.

## 2. Deploy

Cloudflare Workers has a free tier that comfortably covers this.

```bash
npm install -g wrangler
wrangler login

cd server
wrangler deploy credentials-worker.js --name deckdeals-credentials --compatibility-date 2026-01-01

# Store the keys as secrets, not in the source
wrangler secret put ITAD_API_KEY --name deckdeals-credentials
wrangler secret put EXCHANGE_RATE_API_KEY --name deckdeals-credentials
```

Wrangler prints the deployed URL, e.g.
`https://deckdeals-credentials.<your-subdomain>.workers.dev`.

Any host works — a Vercel or Netlify function, or your own server. The plugin
only requires HTTPS and this exact JSON shape:

```json
{ "itad_api_key": "...", "exchange_rate_api_key": "..." }
```

The plugin's parser rejects the payload if it contains **any** extra key, so do
not add a status or version field.

## 3. Point the plugin at it

One line, in [`src/service/ProviderAuthService.ts`](../src/service/ProviderAuthService.ts):

```ts
export const CREDENTIALS_ENDPOINT = "https://deckdeals-credentials.<you>.workers.dev";
```

The endpoint's security check derives from that same constant, so there is
nothing else to keep in sync.

## 4. Verify

```bash
curl -s https://deckdeals-credentials.<you>.workers.dev | jq
```

You should get exactly the two keys. A `server_misconfigured` error means a
secret is missing or fails the pattern above.

## If the endpoint is unavailable

Users can paste their own IsThereAnyDeal key under **Settings → API Access**.
That takes precedence over this endpoint, so the plugin keeps working even if
this deployment is down or retired.
