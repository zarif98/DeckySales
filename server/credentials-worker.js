/*
 * Credentials endpoint for the plugin.
 *
 * The plugin ships no API keys. On first use it asks this endpoint for the
 * IsThereAnyDeal key, then caches it in memory for 12 hours. (Exchange rates
 * come from a keyless API, so this is the only key the plugin needs.) Running your own means the plugin depends on infrastructure you
 * control, and lets you rotate a key without shipping a plugin release.
 *
 * Deploy: see server/README.md. Runs free on Cloudflare Workers.
 *
 * Note on secrecy: this does NOT keep the keys private - anyone who can run
 * the plugin can read the response. That is true of the original design too.
 * What it buys is central rotation. Treat this key as public and rely on
 * IsThereAnyDeal's own rate limits.
 */

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

    // Fail loudly here rather than shipping a malformed payload the plugin
    // will silently reject, which is far harder to diagnose from a Deck.
    if (!KEY_PATTERN.test(itad ?? "")) {
      return json({ error: "server_misconfigured" }, 500);
    }

    // Exactly this shape. The plugin's parser rejects unknown fields, so do
    // not add a status or version key here.
    const payload = { itad_api_key: itad };

    return json(payload);
  },
};
