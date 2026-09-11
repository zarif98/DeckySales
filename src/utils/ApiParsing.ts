import { ALL_STORE_IDS, STEAM_STORE_ID } from "./Stores";

/*
 * Pure parsing and validation helpers for the external APIs the plugin talks
 * to. Kept separate from the services so the trust boundary - what we accept
 * from Steam and ITAD - can be unit tested without any network.
 */

/** SteamID64s are exactly 17 digits. Anything else is not an account id. */
export function isValidSteamId64(value: unknown): value is string {
    const candidate = typeof value === "string" ? value : String(value ?? "");
    return /^\d{17}$/.test(candidate);
}

export type WishlistParseResult =
    | { appIds: string[] }
    | { appIds: []; error: "private" };

/**
 * Extract wishlist app ids from Steam's wishlist API payload.
 *
 * A missing or non-array `response.items` is reported as "private" rather than
 * as an empty wishlist: those two cases need different messages in the UI, and
 * conflating them would tell a user with a private wishlist that they simply
 * have no games on it.
 */
export function parseWishlistAppIds(payload: unknown, maxApps: number): WishlistParseResult {
    const items = (payload as any)?.response?.items;
    if (!Array.isArray(items)) return { appIds: [], error: "private" };

    const appIds: string[] = [];
    for (const item of items) {
        if (appIds.length >= maxApps) break;
        const appId = (item as any)?.appid;
        if (Number.isInteger(appId) && appId > 0) appIds.push(String(appId));
    }

    return { appIds };
}

/**
 * Parse ITAD's bulk id lookup response, which is keyed by the shop-scoped id we
 * sent ("app/1086940") and valued with the ITAD game id. Keys come back to us
 * as plain Steam app ids so callers can match them against the wishlist.
 */
export function parseBulkLookupMap(payload: unknown): Map<string, string> {
    const out = new Map<string, string>();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return out;

    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
        const appId = key.startsWith("app/") ? key.slice(4) : key;
        if (appId.length === 0) continue;
        if (typeof value === "string" && value.length > 0 && value.length <= 128) {
            out.set(appId, value);
        }
    }

    return out;
}

/** Steam app ids are numeric and bounded; used before any id reaches a URL. */
export function isValidAppId(appId: string): boolean {
    return /^\d{1,12}$/.test(appId);
}

/** ITAD country codes are two uppercase letters. */
export function isValidCountry(country: string): boolean {
    return /^[A-Z]{2}$/.test(country);
}

/**
 * Turn a stored store selection into the `shops` query parameter.
 *
 * Steam is always included so the price history graph keeps its reference line
 * even if the user deselected it, and ids are bounded before they reach a URL.
 */
export function buildShopsParam(stores: unknown): string {
    const selection = Array.isArray(stores) ? stores : ALL_STORE_IDS;
    const withSteam = selection.includes(STEAM_STORE_ID) ? selection : [...selection, STEAM_STORE_ID];

    const safeIds = withSteam
        .filter((id: unknown) => Number.isInteger(id) && (id as number) >= 0 && (id as number) <= 9999)
        .map((id: unknown) => String(id));

    return safeIds.length > 0 ? safeIds.join(",") : String(STEAM_STORE_ID);
}

/** Currency rates in the shape the store page consumes. */
export interface ParsedRates {
    base: string;
    rates: Record<string, number>;
}

/**
 * Parse a response from the keyless currency API
 * (github.com/fawazahmed0/exchange-api).
 *
 * Its shape is `{ "date": "...", "<base>": { "<code>": <rate>, ... } }` with
 * lowercase codes, and the list mixes ISO currencies with crypto tickers and
 * other identifiers ("usdt", "1inch"). Only three-letter alphabetic codes
 * with a finite positive rate are kept, uppercased to match the rest of the
 * plugin. Anything else about the payload being off means it is rejected.
 */
export function parseCurrencyApiRates(payload: unknown, base: string): ParsedRates | null {
    if (!isValidCurrencyCode(base)) return null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

    const table = (payload as Record<string, unknown>)[base.toLowerCase()];
    if (!table || typeof table !== "object" || Array.isArray(table)) return null;

    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(table as Record<string, unknown>)) {
        const upper = code.toUpperCase();
        if (!isValidCurrencyCode(upper)) continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
        rates[upper] = value;
    }

    if (Object.keys(rates).length === 0) return null;
    return { base: base.toUpperCase(), rates };
}

/** ISO 4217-style code: exactly three uppercase letters. */
export function isValidCurrencyCode(code: string): boolean {
    return /^[A-Z]{3}$/.test(code);
}
