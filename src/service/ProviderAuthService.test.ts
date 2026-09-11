import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Credential resolution: the hosted endpoint versus a key the user supplied.
 *
 * This is the plugin's single point of failure - without an ITAD key nothing
 * works at all - so the precedence and the fallback behaviour are pinned here.
 */

const HOSTED_KEY = "hosted-key-0123456789abcdef";
const USER_KEY = "user-key-9876543210abcdef";

interface World {
    /** When true the credentials endpoint fails, as during an outage. */
    endpointFails?: boolean;
    /** Body the endpoint returns; overridden for malformed-payload cases. */
    payload?: unknown;
}

async function boot(world: World = {}) {
    vi.resetModules();

    const requests: string[] = [];
    const settingsStore: Record<string, unknown> = {};

    const api: any = {
        callPluginMethod: async (method: string, args: any) => {
            if (method === "settings_load") {
                const stored = settingsStore[args.key];
                return { success: true, result: stored !== undefined ? stored : args.defaults };
            }
            settingsStore[args.key] = args.value;
            return { success: true, result: args.value };
        },
        fetchNoCors: async (url: string) => {
            requests.push(url);
            if (world.endpointFails) return { success: false, result: null };
            const body = world.payload ?? { itad_api_key: HOSTED_KEY };
            return { success: true, result: { body: JSON.stringify(body) } };
        },
    };

    const { Cache } = await import("../utils/Cache");
    const settingsModule = await import("../utils/Settings");
    const { providerAuthService } = await import("./ProviderAuthService");

    Cache.init();
    settingsModule.Settings.init(api);
    providerAuthService.init(api);

    return { providerAuthService, settingsModule, Setting: settingsModule.Setting, requests };
}

describe("credential resolution", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("uses the hosted endpoint when the user has set no key", async () => {
        const { providerAuthService } = await boot();

        expect(await providerAuthService.getItadKey()).toBe(HOSTED_KEY);
    });

    it("prefers the user's own key over the hosted one", async () => {
        const { providerAuthService, settingsModule, Setting } = await boot();
        await settingsModule.SETTINGS.save(Setting.ITAD_API_KEY, USER_KEY);

        expect(await providerAuthService.getItadKey()).toBe(USER_KEY);
    });

    it("does not contact the endpoint at all when a user key is set", async () => {
        const { providerAuthService, settingsModule, Setting, requests } = await boot();
        await settingsModule.SETTINGS.save(Setting.ITAD_API_KEY, USER_KEY);

        await providerAuthService.getItadKey();

        expect(requests).toEqual([]);
    });

    it("keeps working from the user's key when the endpoint is down", async () => {
        // The whole point of the override: an outage must not brick the plugin.
        const { providerAuthService, settingsModule, Setting } = await boot({ endpointFails: true });
        await settingsModule.SETTINGS.save(Setting.ITAD_API_KEY, USER_KEY);

        expect(await providerAuthService.getItadKey()).toBe(USER_KEY);
    });

    it("returns nothing when the endpoint is down and no key was set", async () => {
        const { providerAuthService } = await boot({ endpointFails: true });

        expect(await providerAuthService.getItadKey()).toBeNull();
    });

    it.each([
        ["too short", "abc"],
        ["blank", ""],
        ["whitespace", "   "],
        ["illegal characters", "not a valid key!!"],
    ])("ignores a user key that is %s and falls back to the hosted one", async (_label, badKey) => {
        const { providerAuthService, settingsModule, Setting } = await boot();
        await settingsModule.SETTINGS.save(Setting.ITAD_API_KEY, badKey);

        expect(await providerAuthService.getItadKey()).toBe(HOSTED_KEY);
    });

    it.each([
        ["an unknown extra field", { itad_api_key: HOSTED_KEY, extra: 1 }],
        ["no ITAD key", { exchange_rate_api_key: HOSTED_KEY }],
        ["an empty object", {}],
        ["a malformed key", { itad_api_key: "short" }],
        ["an array", []],
    ])("rejects an endpoint payload with %s", async (_label, payload) => {
        const { providerAuthService } = await boot({ payload });

        expect(await providerAuthService.getItadKey()).toBeNull();
    });

    it("accepts the legacy two-key reply, so an existing endpoint keeps working", async () => {
        // The upstream endpoint still sends exchange_rate_api_key. Rejecting it
        // would break the plugin before a replacement endpoint is deployed.
        const { providerAuthService } = await boot({
            payload: { itad_api_key: HOSTED_KEY, exchange_rate_api_key: HOSTED_KEY },
        });

        expect(await providerAuthService.getItadKey()).toBe(HOSTED_KEY);
    });

    it("still rejects unknown fields alongside the legacy one", async () => {
        const { providerAuthService } = await boot({
            payload: { itad_api_key: HOSTED_KEY, exchange_rate_api_key: HOSTED_KEY, extra: 1 },
        });

        expect(await providerAuthService.getItadKey()).toBeNull();
    });
});
