import { ServerAPI } from "decky-frontend-lib";
import { SETTINGS, Setting } from "../utils/Settings";

/*
 * The credentials service that hands out provider API keys.
 *
 * This is the single place the endpoint is configured. Both the request and
 * the security check below derive from this constant, so pointing the plugin
 * at a different deployment is a one-line change that cannot leave the two
 * out of sync.
 *
 * See `server/README.md` for deploying your own.
 */
// TODO(fork): replace with your own deployment - see server/README.md.
// This is the last remaining dependency on the upstream project's
// infrastructure. It is left pointing at the working upstream path so builds
// are not dead in the meantime; users who set their own key in
// Settings > API Access bypass it entirely.
export const CREDENTIALS_ENDPOINT = "https://api.optideck.gg/deckdeals/auth";

export interface Credentials {
    itad_api_key: string;
}

/*
 * ProviderAuthService fetches the IsThereAnyDeal API key from the credentials
 * endpoint and caches it in memory for a limited duration. A key entered by
 * the user in settings takes precedence and bypasses the endpoint entirely.
 *
 * Currency rates no longer need a key (see ExchangeRateService), so the
 * endpoint only has to serve one.
 *
 * Security model:
 * - Endpoint is a single compile-time HTTPS constant.
 * - Response body size is bounded.
 * - Payload must match a strict schema; unknown keys are rejected.
 * - Key values must match the expected character set and length.
 * - Any failure falls back to existing cached credentials.
 */
class ProviderAuthService {
    // =========================================================================
    // PART 1: Service State + Security Constants
    // Purpose: Define cache, endpoint, and strict validation limits.
    // =========================================================================
    private serverApi: ServerAPI | undefined;
    private credentials: Credentials | null = null;
    private readonly ENDPOINT = CREDENTIALS_ENDPOINT;
    private readonly CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours
    private readonly MAX_RESPONSE_BYTES = 4096;
    /**
     * Endpoints written for older versions also return an
     * `exchange_rate_api_key`. It is accepted and ignored, so an existing
     * deployment keeps working; any other unexpected key is still rejected.
     */
    private readonly LEGACY_KEYS = new Set(["exchange_rate_api_key"]);
    private readonly API_KEY_PATTERN = /^[A-Za-z0-9._-]{16,256}$/;
    private lastFetchTime: number = 0;

    // =========================================================================
    // PART 2: Public Bootstrap
    // Purpose: Inject Decky's ServerAPI dependency once at startup.
    // =========================================================================
    public init(serverApi: ServerAPI) {
        this.serverApi = serverApi;
    }

    // =========================================================================
    // PART 3: Endpoint Trust Boundary Validation
    // Purpose: Enforce HTTPS + pinned host/path before any network call.
    // =========================================================================
    /**
     * The endpoint must be a well-formed HTTPS URL.
     *
     * Previously the host and path were also hardcoded here, duplicating the
     * constant above - changing one without the other silently failed closed.
     * Pinning is preserved by there being exactly one compile-time constant.
     */
    private isValidEndpoint(): boolean {
        try {
            const endpoint = new URL(this.ENDPOINT);
            return endpoint.protocol === "https:" && endpoint.hostname.length > 0;
        } catch {
            return false;
        }
    }

    // =========================================================================
    // PART 4: Primitive Validators
    // Purpose: Validate API key format and supported response body container types.
    // =========================================================================
    private isSafeApiKey(value: unknown): value is string {
        return typeof value === "string" && this.API_KEY_PATTERN.test(value);
    }

    private parseResponseBody(result: unknown): string | null {
        if (result && typeof result === "object" && "body" in result && typeof (result as any).body === "string") {
            return (result as any).body;
        }
        if (typeof result === "string") {
            return result;
        }
        return null;
    }

    // =========================================================================
    // PART 5: Strict Payload Schema Gate
    // Purpose: Accept only exact expected object shape and key values.
    // Security: Rejects extra keys, missing keys, arrays, and invalid key strings.
    // =========================================================================
    private parseStrictCredentials(payload: unknown): Credentials | null {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return null;
        }

        const obj = payload as Record<string, unknown>;

        for (const key of Object.keys(obj)) {
            if (key !== "itad_api_key" && !this.LEGACY_KEYS.has(key)) {
                return null;
            }
        }

        const itadKey = obj.itad_api_key;
        if (!this.isSafeApiKey(itadKey)) {
            return null;
        }

        return { itad_api_key: itadKey };
    }

    // =========================================================================
    // PART 6: Fetch + Verify + Cache Credentials
    // Purpose: Retrieve remote credentials under strict policy and cache on success.
    // Security: Fails closed and returns prior cache on any validation/network error.
    // =========================================================================
    private async fetchCredentials(): Promise<Credentials | null> {
        if (!this.serverApi) return null;
        if (!this.isValidEndpoint()) {
            console.error("[DeckySales] Invalid credentials endpoint configuration.");
            return this.credentials;
        }

        const now = Date.now();
        if (this.credentials && (now - this.lastFetchTime) < this.CACHE_DURATION) {
            return this.credentials;
        }

        try {
            console.log("[DeckySales] Fetching remote credentials...");
            const response = await this.serverApi.fetchNoCors(this.ENDPOINT, {
                method: "GET",
                headers: {
                    "X-App-ID": "DeckySales",
                    "User-Agent": "DeckySales-Plugin"
                }
            });

            if (!response.success) {
                console.error("[DeckySales] Failed to fetch credentials.");
                return this.credentials; // Return cached even if stale if fetch fails
            }

            const body = this.parseResponseBody(response.result);
            if (!body || body.length > this.MAX_RESPONSE_BYTES) {
                console.error("[DeckySales] Credentials payload missing or too large.");
                return this.credentials;
            }

            const parsed = JSON.parse(body);
            const strictCredentials = this.parseStrictCredentials(parsed);

            if (!strictCredentials) {
                console.error("[DeckySales] Credentials payload failed strict validation.");
                return this.credentials;
            }

            this.credentials = Object.freeze({ ...strictCredentials });
            this.lastFetchTime = now;
            return this.credentials;
        } catch {
            console.error("[DeckySales] Error fetching credentials.");
        }

        return this.credentials;
    }

    // =========================================================================
    // PART 7: Public Read API
    // Purpose: Expose individual provider keys to caller services.
    // =========================================================================
    /**
     * A key the user entered themselves, if it looks like a key at all.
     *
     * This is the escape hatch: it takes precedence over the hosted endpoint,
     * so the plugin keeps working if that endpoint is down, rate-limited, or
     * retired - and lets people use their own ITAD quota if they prefer.
     */
    private async getUserItadKey(): Promise<string | null> {
        try {
            const value = await SETTINGS.load(Setting.ITAD_API_KEY);
            return this.isSafeApiKey(value) ? value : null;
        } catch {
            return null;
        }
    }

    public async getItadKey(): Promise<string | null> {
        const userKey = await this.getUserItadKey();
        if (userKey) return userKey;

        const credentials = await this.fetchCredentials();
        return credentials?.itad_api_key || null;
    }
}

export const providerAuthService = new ProviderAuthService();
