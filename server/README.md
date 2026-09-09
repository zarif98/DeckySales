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
| `ITAD_API_KEY` | <https://isthereanydeal.com/apps/my/> — register an app | Required. Without it the plugin shows "Data unavailable" everywhere. Free; the default limit is 1000 requests per 5 minutes once your email is verified. |
| `EXCHANGE_RATE_API_KEY` | <https://www.exchangerate-api.com/> — free tier | Optional-ish: without it, prices are still shown in each store's own currency, but cross-currency comparison silently falls back to comparing raw numbers. |

Both must match `^[A-Za-z0-9._-]{16,256}$`, which is what the plugin accepts.

### Worth knowing before you register

IsThereAnyDeal's API terms carry a few obligations that fall on whoever owns the key:

- **Attribution is expected** — you "SHOULD provide a link to IsThereAnyDeal.com or mention IsThereAnyDeal API". The plugin already does, via the IsThereAnyDeal quick-link button on the store page and the Sources panel in settings. Don't remove those.
- **Data must not be altered**, including removing affiliate tags from the deal URLs they return.
- **Don't build a competitor** to IsThereAnyDeal itself.
- Commercial use is allowed only if the resulting app is publicly available.

Describe the plugin honestly when you register the app; the limits above are generous for this use and higher ones are available on request.

## 2. Deploy

Cloudflare Workers has a free tier that comfortably covers this.

```bash
npm install -g wrangler
wrangler login

cd server
wrangler deploy                      # reads wrangler.toml

# Store the keys as secrets - they are never written to the repo
wrangler secret put ITAD_API_KEY
wrangler secret put EXCHANGE_RATE_API_KEY
```

Never commit the keys to the repository. Beyond the obvious, GitHub's secret
scanning will often report a leaked key to the provider, who may revoke it -
breaking the plugin for everyone using the shared endpoint.

Wrangler prints the deployed URL, e.g.
`https://deckysales-credentials.<your-subdomain>.workers.dev`.

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
export const CREDENTIALS_ENDPOINT = "https://deckysales-credentials.<you>.workers.dev";
```

The endpoint's security check derives from that same constant, so there is
nothing else to keep in sync.

## 4. Verify

```bash
curl -s https://deckysales-credentials.<you>.workers.dev | jq
```

You should get exactly the two keys. A `server_misconfigured` error means a
secret is missing or fails the pattern above.

## If the endpoint is unavailable

Users can paste their own IsThereAnyDeal key under **Settings → API Access**.
That takes precedence over this endpoint, so the plugin keeps working even if
this deployment is down or retired.
