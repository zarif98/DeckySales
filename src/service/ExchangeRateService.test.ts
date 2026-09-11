import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Exchange rates come from a keyless API published to two mirrors. These pin
 * the behaviour that matters on a real Deck: the fallback when one mirror is
 * down, that no key or credentials request is ever involved, and that a bad
 * response degrades to "no conversion" instead of wrong numbers.
 */

const JSDELIVR = "cdn.jsdelivr.net";
const CLOUDFLARE = "latest.currency-api.pages.dev";

interface World {
    down?: string[];
    /** Per-host body override, for malformed-response cases. */
    bodies?: Record<string, unknown>;
}

const goodBody = { date: "2026-09-10", usd: { eur: 0.86, gbp: 0.74, ars: 1513.77 } };

async function boot(world: World = {}) {
    vi.resetModules();
    const requests: string[] = [];

    const api: any = {
        fetchNoCors: async (url: string) => {
            requests.push(url);
            const host = new URL(url).hostname;
            if (world.down?.includes(host)) return { success: false, result: null };
            const body = world.bodies?.[host] ?? goodBody;
            return { success: true, result: { body: JSON.stringify(body) } };
        },
        callPluginMethod: async () => ({ success: true, result: null }),
    };

    const { Cache } = await import("../utils/Cache");
    const { exchangeRateService } = await import("./ExchangeRateService");
    Cache.init();
    exchangeRateService.init(api);

    return { exchangeRateService, requests };
}

describe("exchange rates", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("returns rates in the shape the store page expects", async () => {
        const { exchangeRateService } = await boot();

        const rates = await exchangeRateService.getExchangeRates("USD");

        expect(rates?.base).toBe("USD");
        expect(rates?.rates).toMatchObject({ EUR: 0.86, GBP: 0.74, ARS: 1513.77 });
        expect(typeof rates?.timestamp).toBe("number");
    });

    it("asks the primary mirror for the lowercased currency file", async () => {
        const { exchangeRateService, requests } = await boot();

        await exchangeRateService.getExchangeRates("USD");

        expect(requests).toEqual([
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
        ]);
    });

    it("falls back to the second mirror when the first is down", async () => {
        const { exchangeRateService, requests } = await boot({ down: [JSDELIVR] });

        const rates = await exchangeRateService.getExchangeRates("USD");

        expect(rates?.rates.EUR).toBe(0.86);
        expect(requests.map(u => new URL(u).hostname)).toEqual([JSDELIVR, CLOUDFLARE]);
    });

    it("falls back when the first mirror answers with garbage", async () => {
        const { exchangeRateService } = await boot({ bodies: { [JSDELIVR]: { nonsense: true } } });

        expect((await exchangeRateService.getExchangeRates("USD"))?.rates.EUR).toBe(0.86);
    });

    it("returns null when every mirror is down, rather than inventing a rate", async () => {
        const { exchangeRateService } = await boot({ down: [JSDELIVR, CLOUDFLARE] });

        expect(await exchangeRateService.getExchangeRates("USD")).toBeNull();
    });

    it("never contacts a credentials endpoint - no key is involved", async () => {
        const { exchangeRateService, requests } = await boot();

        await exchangeRateService.getExchangeRates("USD");

        const hosts = new Set(requests.map(u => new URL(u).hostname));
        expect([...hosts].every(h => h === JSDELIVR || h === CLOUDFLARE)).toBe(true);
    });

    it("serves a repeat request from cache without a second fetch", async () => {
        const { exchangeRateService, requests } = await boot();

        await exchangeRateService.getExchangeRates("USD");
        await exchangeRateService.getExchangeRates("USD");

        expect(requests).toHaveLength(1);
    });

    it.each(["usd", "US", "USDT", "../x"])("refuses a malformed currency %j without any request", async (bad) => {
        const { exchangeRateService, requests } = await boot();

        expect(await exchangeRateService.getExchangeRates(bad)).toBeNull();
        expect(requests).toEqual([]);
    });

    it("converts between two currencies using the fetched rates", async () => {
        const { exchangeRateService } = await boot();

        expect(await exchangeRateService.convertCurrency(100, "USD", "EUR")).toBeCloseTo(86);
    });
});
