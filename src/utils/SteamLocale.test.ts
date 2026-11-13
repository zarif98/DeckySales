import { describe, expect, it } from "vitest";
import { localeForSteamLanguage, supportedCountry } from "./SteamLocale";

const LOCALES = ["en", "ru", "uk"];

describe("localeForSteamLanguage", () => {
    it.each([
        ["english", "en"],
        ["russian", "ru"],
        ["ukrainian", "uk"],
        ["ru-RU", "ru"],
        ["en_US", "en"],
    ])("maps %s to %s", (input, expected) => {
        expect(localeForSteamLanguage(input, LOCALES)).toBe(expected);
    });

    it.each([["german"], ["de-DE"], [""], [undefined], [42]])("returns null for unsupported %s", (input) => {
        expect(localeForSteamLanguage(input, LOCALES)).toBeNull();
    });
});

describe("supportedCountry", () => {
    const SUPPORTED = ["US", "DE", "GB"];

    it("accepts a supported code in any case", () => {
        expect(supportedCountry("de", SUPPORTED)).toBe("DE");
    });

    it.each([["FR"], ["USA"], [""], [null], [7]])("rejects %s", (input) => {
        expect(supportedCountry(input, SUPPORTED)).toBeNull();
    });
});
