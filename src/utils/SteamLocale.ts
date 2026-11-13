/*
 * Follow the Steam client's own language and country, as Steam's UI does.
 * Every lookup is optional: anything missing or unexpected returns null.
 */

const STEAM_LANGUAGE_TO_LOCALE: Record<string, string> = {
    english: "en",
    russian: "ru",
    ukrainian: "uk",
};

/** Map a Steam language name ("russian") or BCP 47 tag ("ru-RU") to a locale we ship. */
export function localeForSteamLanguage(language: unknown, available: readonly string[]): string | null {
    if (typeof language !== "string" || !language) return null;
    const lower = language.toLowerCase();
    const mapped = STEAM_LANGUAGE_TO_LOCALE[lower] ?? lower.split(/[-_]/)[0];
    return available.includes(mapped) ? mapped : null;
}

/** A two-letter country code we have price data for, or null. */
export function supportedCountry(code: unknown, supported: readonly string[]): string | null {
    if (typeof code !== "string") return null;
    const upper = code.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(upper) && supported.includes(upper) ? upper : null;
}

const TIMEOUT_MS = 2000;

async function ask<T>(read: () => Promise<T> | T | undefined): Promise<T | null> {
    try {
        const value = read();
        if (value === undefined) return null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); });
        try {
            return (await Promise.race([Promise.resolve(value), timeout])) ?? null;
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return null;
    }
}

export async function detectSteamLanguage(): Promise<string | null> {
    const client = (globalThis as any).SteamClient;
    return (await ask<string>(() => client?.Settings?.GetCurrentLanguage?.()))
        ?? (typeof navigator !== "undefined" ? navigator.language : null);
}

export async function detectSteamCountry(): Promise<string | null> {
    const client = (globalThis as any).SteamClient;
    return ask<string>(() => client?.User?.GetIPCountry?.());
}
