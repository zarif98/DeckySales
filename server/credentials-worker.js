/*
 * Credentials endpoint for the plugin.
 *
 * The plugin ships no API keys. On first use it asks this endpoint for the
 * IsThereAnyDeal and exchangerate-api keys, then caches them in memory for
 * 12 hours. Running your own means the plugin depends on infrastructure you
 * control, and lets you rotate a key without shipping a plugin release.
 *
 * Deploy: see server/README.md. Runs free on Cloudflare Workers.
 *
 * Note on secrecy: this does NOT keep the keys private - anyone who can run
 * the plugin can read the response. That is true of the original design too.
 * What it buys is central rotation. Treat these keys as public and rely on
 * the providers' own rate limits.
 */

/** The plugin rejects any payload that is not exactly these two keys. */
const RESPONSE_KEYS = ["itad_api_key", "exchange_rate_api_key"];

/** Matches the plugin's own validation: /^[A-Za-z0-9._-]{16,256}$/ */
const KEY_PATTERN = /^[A-Za-z0-9._-]{16,256}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The plugin caches for 12h; let any edge cache do the same.
      "cache-control": "public, max-age=3600",
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const itad = env.ITAD_API_KEY;
    const exchange = env.EXCHANGE_RATE_API_KEY;

    // Fail loudly here rather than shipping a malformed payload the plugin
    // will silently reject, which is far harder to diagnose from a Deck.
    if (!KEY_PATTERN.test(itad ?? "") || !KEY_PATTERN.test(exchange ?? "")) {
      return json({ error: "server_misconfigured" }, 500);
    }

    // Exactly the two expected keys, in the shape the plugin's strict parser
    // requires. Adding any extra field will cause it to reject the response.
    const payload = {};
    payload[RESPONSE_KEYS[0]] = itad;
    payload[RESPONSE_KEYS[1]] = exchange;

    return json(payload);
  },
};
