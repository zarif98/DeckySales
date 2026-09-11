# Credentials endpoint

The plugin ships no API keys. On first use it asks this endpoint for the
IsThereAnyDeal key, then caches it in memory for 12 hours.

That is the only key the plugin needs. Exchange rates come from a free public
API that requires no key at all, so there is nothing else to configure.

Running your own endpoint means the plugin depends only on infrastructure you
control, and lets you replace a revoked or abused key without shipping a
plugin release — which matters when store updates wait on review.

**Everything here is free.** Cloudflare Workers' free plan allows 100,000
requests a day with no card required, and each Deck asks at most every
12 hours.

> **The key is not secret.** Anyone running the plugin can read this
> endpoint's response, and the same was true of the original hosted endpoint.
> What this design buys is central rotation, not confidentiality. Treat the
> key as public and rely on IsThereAnyDeal's rate limits.

## 1. Get an IsThereAnyDeal key

Register an app at <https://isthereanydeal.com/apps/my/>. Free; the default
limit is 1,000 requests per 5 minutes once your email is verified. The key
must match `^[A-Za-z0-9._-]{16,256}$`, which is what the plugin accepts.

### Worth knowing before you register

IsThereAnyDeal's API terms carry a few obligations that fall on whoever owns
the key:

- **Attribution is expected** — you "SHOULD provide a link to IsThereAnyDeal.com
  or mention IsThereAnyDeal API". The plugin already does, via the
  IsThereAnyDeal button on the store page and the Sources panel in settings.
  Don't remove those.
- **Data must not be altered**, including removing affiliate tags from the deal
  URLs they return.
- **Don't build a competitor** to IsThereAnyDeal itself.
- Commercial use is allowed only if the resulting app is publicly available.

Describe the plugin honestly when you register; the limits are generous for
this use and higher ones are available on request.

## 2. Deploy

```bash
npm install -g wrangler
wrangler login                 # opens your browser - click Allow

cd server
wrangler deploy                # reads wrangler.toml

wrangler secret put ITAD_API_KEY   # paste the key when asked
```

Never commit the key to the repository. Beyond the obvious, GitHub's secret
scanning will often report a leaked key to the provider, who may revoke it —
breaking the plugin for everyone using the endpoint.

Wrangler prints the deployed URL, e.g.
`https://deckysales-credentials.<your-subdomain>.workers.dev`.

Any host works — a Vercel or Netlify function, or your own server. The plugin
only requires HTTPS and this exact JSON shape:

```json
{ "itad_api_key": "..." }
```

The plugin rejects the reply if it contains any unknown field, so do not add a
status or version key. (An `exchange_rate_api_key` field is tolerated and
ignored, so endpoints written for older versions keep working.)

## 3. Verify

```bash
curl -s https://deckysales-credentials.<your-subdomain>.workers.dev
```

You should see `{"itad_api_key":"..."}`. A `server_misconfigured` error means
the secret is missing or did not paste correctly — run `wrangler secret put`
again.

## 4. Point the plugin at it

One line, in
[`src/service/ProviderAuthService.ts`](../src/service/ProviderAuthService.ts):

```ts
export const CREDENTIALS_ENDPOINT = "https://deckysales-credentials.<your-subdomain>.workers.dev";
```

Nothing else needs to change; the endpoint check derives from that constant.

## If the endpoint is unavailable

Users can paste their own IsThereAnyDeal key under **Settings → API Access**.
That takes precedence over this endpoint, so the plugin keeps working even if
this deployment is down or retired.
