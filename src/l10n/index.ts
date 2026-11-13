import { en } from "./en";
import { ru } from "./ru";
import { uk } from "./uk";

// The language follows the Steam client (see utils/SteamLocale.ts).
// To add a new language:
//   1. Copy template.ts → <lang>.ts (e.g. de.ts) and translate it
//   2. Import it here and add it to `locales`
//   3. Map Steam's language name to it in utils/SteamLocale.ts

const locales: Record<string, Record<string, string>> = {
    en, ru, uk,
};

let currentLocale = "en";

/**
 * Set the active locale. Falls back to "en" if not found.
 */
export function setLocale(locale: string) {
    currentLocale = locales[locale] ? locale : "en";
}

/**
 * Translate a key. Returns the localized string, falling back to English,
 * or the raw key if no translation exists.
 */
export function t(key: string): string {
    return locales[currentLocale]?.[key] ?? locales["en"]?.[key] ?? key;
}

/** Locale codes the plugin ships translations for. */
export const AVAILABLE_LOCALES: readonly string[] = Object.keys(locales);
