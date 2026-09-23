import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A crashed Python backend never answers a call, and the call never settles.
 * In v1.2.3 that turned into a spinner that ran forever with no error shown
 * anywhere, because every screen loads a setting before it can render. These
 * pin that a settings read or write always completes, backend or no backend.
 */

/** A call that never settles - exactly what a dead backend produces. */
const NEVER = () => new Promise<any>(() => {});

async function boot(callPluginMethod: (method: string, args: any) => Promise<any>) {
    vi.resetModules();
    const { Cache } = await import("./Cache");
    const { Settings, Setting } = await import("./Settings");

    Cache.init();
    Settings.init({ callPluginMethod, fetchNoCors: NEVER, toaster: { toast: () => {} } } as any);

    const { SETTINGS } = await import("./Settings");
    return { SETTINGS, Setting };
}

describe("Settings when the backend never answers", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("load falls back to the default instead of hanging", async () => {
        const { SETTINGS, Setting } = await boot(NEVER);

        const pending = SETTINGS.load(Setting.WISHLIST_DEALS);
        await vi.advanceTimersByTimeAsync(10_000);

        await expect(pending).resolves.toEqual({});
    });

    it("save completes instead of stalling the caller", async () => {
        const { SETTINGS, Setting } = await boot(NEVER);

        const pending = SETTINGS.save(Setting.WISHLIST_LAST_CHECK, 123);
        await vi.advanceTimersByTimeAsync(10_000);

        await expect(pending).resolves.toBeUndefined();
    });

    it("says in the log that the backend is the problem", async () => {
        const { SETTINGS, Setting } = await boot(NEVER);

        const pending = SETTINGS.load(Setting.COUNTRY);
        await vi.advanceTimersByTimeAsync(10_000);
        await pending;

        const logged = (console.error as any).mock.calls.flat().join(" ");
        expect(logged).toContain("backend");
        expect(logged).toContain("settings_load(country)");
    });

    it("does not cache the fallback, so a recovered backend is used", async () => {
        // Caching the default on timeout would make it permanent for the
        // session and hide a backend that came back.
        let answer = false;
        const { SETTINGS, Setting } = await boot(async () =>
            answer ? { success: true, result: "GB" } : await NEVER()
        );

        const first = SETTINGS.load(Setting.COUNTRY);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(await first).toBe("US");

        answer = true;
        expect(await SETTINGS.load(Setting.COUNTRY)).toBe("GB");
    });
});

describe("Settings with a working backend", () => {
    it("returns the stored value and does not wait out the timeout", async () => {
        const { SETTINGS, Setting } = await boot(async (_method, args) => ({
            success: true,
            result: args.key === "country" ? "DE" : undefined,
        }));

        // Real timers: a resolved call must not be held up by the timeout timer.
        await expect(SETTINGS.load(Setting.COUNTRY)).resolves.toBe("DE");
    });

    it("falls back to the default when the backend answers with a failure", async () => {
        const { SETTINGS, Setting } = await boot(async () => ({ success: false, result: "boom" }));

        await expect(SETTINGS.load(Setting.WISHLIST_MIN_DISCOUNT)).resolves.toBe(20);
    });
});
