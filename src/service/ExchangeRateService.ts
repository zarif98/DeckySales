import { ServerAPI } from "decky-frontend-lib";
import { CACHE } from "../utils/Cache";
import { isValidCurrencyCode, parseCurrencyApiRates } from "../utils/ApiParsing";

/*
 * ExchangeRateService provides currency conversion support with cache-first reads.
 *
 * Rates come from the free, keyless currency API at
 * github.com/fawazahmed0/exchange-api, updated daily and covering every
 * currency the plugin needs. It replaced exchangerate-api.com, whose free
 * tier allows 1,500 requests a month on one key - shared by every user of
 * the plugin, and exhausted within days at plugin-store scale.
 *
 * Security model:
 * - No API key is involved, so nothing to leak or rotate.
 * - Only two pinned HTTPS mirrors are contacted, tried in order.
 * - The only thing sent is the target currency code, in the URL path.
 * - Responses are size-bounded and strictly parsed; failure returns null and
 *   the store page simply shows prices without cross-currency comparison.
 */
export interface ExchangeRates {
    base: string;
    rates: Record<string, number>;
    timestamp: number;
}

class ExchangeRateService {
    // =========================================================================
    // PART 1: Service State + Cache Policy
    // Purpose: Hold runtime dependencies and cache configuration.
    // =========================================================================
    private serverApi: ServerAPI | undefined;
    private readonly CACHE_KEY = "exchange_rates";
    private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    private readonly MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB hard cap
    /**
     * The same data, published to two independent hosts by the project
     * itself. If jsDelivr is unreachable the Cloudflare mirror is tried.
     */
    private readonly MIRRORS: ReadonlyArray<{ host: string; prefix: string }> = [
        { host: "cdn.jsdelivr.net", prefix: "/npm/@fawazahmed0/currency-api@latest/v1/currencies/" },
        { host: "latest.currency-api.pages.dev", prefix: "/v1/currencies/" },
    ];

    public init(serverApi: ServerAPI) {
        this.serverApi = serverApi;
    }

    private isValidCurrencyCode(currency: string): boolean {
        return isValidCurrencyCode(currency);
    }

    private buildRatesUrl(mirror: { host: string; prefix: string }, baseCurrency: string): string {
        return `https://${mirror.host}${mirror.prefix}${baseCurrency.toLowerCase()}.json`;
    }

    /** Only the pinned mirrors, and only a three-letter currency file on them. */
    private isAllowedRatesUrl(urlString: string): boolean {
        try {
            const url = new URL(urlString);
            if (url.protocol !== "https:" || url.search || url.hash) return false;
            return this.MIRRORS.some(m =>
                url.hostname === m.host &&
                url.pathname.startsWith(m.prefix) &&
                /^[a-z]{3}\.json$/.test(url.pathname.slice(m.prefix.length))
            );
        } catch {
            return false;
        }
    }

    private parseBodyString(result: unknown): string | null {
        if (result && typeof result === "object" && "body" in result && typeof (result as any).body === "string") {
            return (result as any).body;
        }
        if (typeof result === "string") {
            return result;
        }
        return null;
    }

    // =========================================================================
    // PART 2: Public Rate Retrieval
    // Purpose: Cache-first entrypoint for rate consumers.
    // =========================================================================
    /**
     * Get exchange rates, using cache if available and fresh
     */
    public async getExchangeRates(baseCurrency: string = "USD"): Promise<ExchangeRates | null> {
        if (!this.serverApi) return null;
        if (!this.isValidCurrencyCode(baseCurrency)) return null;

        // Check cache first
        const cached = await this.getCachedRates(baseCurrency);
        if (cached) {
            return cached;
        }

        // Fetch fresh rates
        return await this.fetchExchangeRates(baseCurrency);
    }

    // =========================================================================
    // PART 3: Conversion Helpers
    // Purpose: Convert single or multiple amounts using fetched rates.
    // =========================================================================
    /**
     * Convert amount from one currency to another
     */
    public async convertCurrency(
        amount: number,
        fromCurrency: string,
        toCurrency: string
    ): Promise<number | null> {
        if (!this.isValidCurrencyCode(fromCurrency) || !this.isValidCurrencyCode(toCurrency)) return null;
        if (fromCurrency === toCurrency) return amount;

        const rates = await this.getExchangeRates(fromCurrency);
        if (!rates || !rates.rates[toCurrency]) {
            return null;
        }

        return amount * rates.rates[toCurrency];
    }

    /**
     * Convert multiple prices to a target currency
     */
    public async convertPrices(
        prices: Array<{ amount: number; currency: string }>,
        targetCurrency: string
    ): Promise<Array<{ amount: number; originalAmount: number; originalCurrency: string }>> {
        const converted = [];

        for (const price of prices) {
            const convertedAmount = await this.convertCurrency(
                price.amount,
                price.currency,
                targetCurrency
            );

            if (convertedAmount !== null) {
                converted.push({
                    amount: convertedAmount,
                    originalAmount: price.amount,
                    originalCurrency: price.currency
                });
            }
        }

        return converted;
    }

    // =========================================================================
    // PART 4: Cache Read Path
    // Purpose: Return rates only when object shape exists and age is acceptable.
    // =========================================================================
    private async getCachedRates(baseCurrency: string): Promise<ExchangeRates | null> {
        const cacheKey = `${this.CACHE_KEY}_${baseCurrency}`;
        const cached = await CACHE.loadValue(cacheKey);

        if (cached && typeof cached === 'object') {
            const rates = cached as ExchangeRates;
            const now = Date.now();

            // Check if cache is still fresh
            if (rates.timestamp && (now - rates.timestamp) < this.CACHE_DURATION) {
                return rates;
            }
        }

        return null;
    }

    // =========================================================================
    // PART 5: Remote Fetch + Parse + Cache Write
    // Purpose: Retrieve the latest rates, trying each mirror in turn.
    // Security:
    // - No key required; pinned HTTPS hosts and paths only.
    // - Rejects malformed or oversized payloads per mirror.
    // =========================================================================
    private async fetchExchangeRates(baseCurrency: string): Promise<ExchangeRates | null> {
        if (!this.serverApi) return null;
        if (!this.isValidCurrencyCode(baseCurrency)) return null;

        for (const mirror of this.MIRRORS) {
            const rates = await this.fetchFromMirror(mirror, baseCurrency);
            if (rates) {
                await CACHE.setValue(`${this.CACHE_KEY}_${baseCurrency}`, rates);
                return rates;
            }
        }

        console.error("[DeckySales] Exchange rates unavailable from every mirror.");
        return null;
    }

    private async fetchFromMirror(
        mirror: { host: string; prefix: string },
        baseCurrency: string
    ): Promise<ExchangeRates | null> {
        const url = this.buildRatesUrl(mirror, baseCurrency);
        if (!this.isAllowedRatesUrl(url)) return null;

        try {
            const response = await this.serverApi!.fetchNoCors(url, { method: "GET" });
            if (!response.success) return null;

            const body = this.parseBodyString(response.result);
            if (!body || body.length > this.MAX_RESPONSE_BYTES) return null;

            const parsed = parseCurrencyApiRates(JSON.parse(body), baseCurrency);
            if (!parsed) return null;

            return { ...parsed, timestamp: Date.now() };
        } catch {
            return null;
        }
    }
}

export const exchangeRateService = new ExchangeRateService();
