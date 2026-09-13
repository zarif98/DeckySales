import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREDENTIALS_ENDPOINT } from "./ProviderAuthService";

/*
 * The ITAD API key travels in every request URL (?key=...). getLowestPrice
 * returns those URLs in a `debug` object for diagnostics, which is exactly
 * the kind of thing that ends up pasted into a bug report. These pin that the
 * key never survives into it.
 */

const API_KEY = "secret-itad-key-0123456789";
const CREDENTIALS_HOST = new URL(CREDENTIALS_ENDPOINT).hostname;

interface World {
    lookupFails?: boolean;
    historyFails?: boolean;
}

async function boot(world: World = {}) {
    vi.resetModules();

    const api: any = {
        callPluginMethod: async (_method: string, args: any) => ({ success: true, result: args.defaults }),
        fetchNoCors: async (url: string) => {
            const u = new URL(url);
            const json = (v: unknown) => ({ success: true, result: { body: JSON.stringify(v) } });
            if (u.hostname === CREDENTIALS_HOST) return json({ itad_api_key: API_KEY });
            if (u.pathname === "/games/lookup/v1") {
                if (world.lookupFails) return { success: false, result: null };
                return json({ found: true, game: { id: "game-1", slug: "game-one" } });
            }
            if (u.pathname === "/games/history/v2") {
                if (world.historyFails) return { success: false, result: null };
                return json([]);
            }
            return { success: false, result: null };
        },
    };

    const { Cache } = await import("../utils/Cache");
    const settingsModule = await import("../utils/Settings");
    const { providerAuthService } = await import("./ProviderAuthService");
    const { priceService } = await import("./PriceService");

    Cache.init();
    settingsModule.Settings.init(api);
    providerAuthService.init(api);
    priceService.init(api);

    return { priceService };
}

describe("debug information from getLowestPrice", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("never contains the API key when the lookup fails", async () => {
        const { priceService } = await boot({ lookupFails: true });

        const result = await priceService.getLowestPrice("1086940");

        expect(result.data).toBeNull();
        expect(JSON.stringify(result.debug)).not.toContain(API_KEY);
        expect(result.debug.lookupUrl).toContain("key=REDACTED");
    });

    it("never contains the API key when the history request fails", async () => {
        const { priceService } = await boot({ historyFails: true });

        const result = await priceService.getLowestPrice("1086940");

        expect(JSON.stringify(result.debug)).not.toContain(API_KEY);
        expect(result.debug.historyUrl).toContain("key=REDACTED");
    });

    it("keeps the rest of the URL, so the diagnostics are still useful", async () => {
        const { priceService } = await boot({ lookupFails: true });

        const result = await priceService.getLowestPrice("1086940");

        expect(result.debug.lookupUrl).toContain("api.isthereanydeal.com/games/lookup/v1");
        expect(result.debug.lookupUrl).toContain("appid=1086940");
    });
});
