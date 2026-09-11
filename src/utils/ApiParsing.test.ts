import { describe, expect, it } from "vitest";
import {
    buildShopsParam,
    isValidAppId,
    isValidCountry,
    isValidCurrencyCode,
    parseCurrencyApiRates,
    isValidSteamId64,
    parseBulkLookupMap,
    parseWishlistAppIds,
} from "./ApiParsing";
import { ALL_STORE_IDS, STEAM_STORE_ID } from "./Stores";

describe("isValidSteamId64", () => {
    it("accepts a 17-digit id", () => {
        expect(isValidSteamId64("76561197960287930")).toBe(true);
    });

    it.each([
        ["too short", "7656119796028793"],
        ["too long", "765611979602879301"],
        ["non-numeric", "7656119796028793a"],
        ["an account name", "someuser"],
        ["empty", ""],
        ["undefined", undefined],
        ["null", null],
    ])("rejects %s", (_label, value) => {
        expect(isValidSteamId64(value)).toBe(false);
    });
});

describe("parseWishlistAppIds", () => {
    it("extracts app ids as strings", () => {
        const result = parseWishlistAppIds(
            { response: { items: [{ appid: 1086940 }, { appid: 570 }] } },
            500
        );

        expect(result.appIds).toEqual(["1086940", "570"]);
    });

    it("distinguishes a private wishlist from an empty one", () => {
        // These need different messages in the UI, so they must not collapse.
        const privateList = parseWishlistAppIds({ response: {} }, 500);
        const emptyList = parseWishlistAppIds({ response: { items: [] } }, 500);

        expect(privateList).toHaveProperty("error", "private");
        expect(emptyList).not.toHaveProperty("error");
        expect(emptyList.appIds).toEqual([]);
    });

    it.each([
        ["a null payload", null],
        ["a string payload", "nope"],
        ["a missing response envelope", {}],
        ["items that are not an array", { response: { items: "nope" } }],
    ])("reports %s as private rather than throwing", (_label, payload) => {
        expect(parseWishlistAppIds(payload, 500)).toHaveProperty("error", "private");
    });

    it("skips malformed entries without discarding the good ones", () => {
        const result = parseWishlistAppIds(
            {
                response: {
                    items: [
                        { appid: 570 },
                        { appid: "1086940" },
                        { appid: 0 },
                        { appid: -5 },
                        { appid: 1.5 },
                        {},
                        null,
                        { appid: 440 },
                    ],
                },
            },
            500
        );

        expect(result.appIds).toEqual(["570", "440"]);
    });

    it("caps the number of entries it will process", () => {
        const items = Array.from({ length: 600 }, (_, i) => ({ appid: i + 1 }));

        const result = parseWishlistAppIds({ response: { items } }, 500);

        expect(result.appIds).toHaveLength(500);
        expect(result.appIds[499]).toBe("500");
    });
});

describe("parseBulkLookupMap", () => {
    it("strips the shop prefix so keys match wishlist app ids", () => {
        const result = parseBulkLookupMap({ "app/1086940": "018d937f-1234" });

        expect(result.get("1086940")).toBe("018d937f-1234");
    });

    it("keeps unprefixed keys as-is", () => {
        expect(parseBulkLookupMap({ "570": "abc" }).get("570")).toBe("abc");
    });

    it("drops entries ITAD could not resolve", () => {
        const result = parseBulkLookupMap({
            "app/570": "valid-id",
            "app/1": null,
            "app/2": "",
            "app/3": 12345,
            "app/4": "x".repeat(129),
        });

        expect([...result.keys()]).toEqual(["570"]);
    });

    it.each([
        ["null", null],
        ["an array", []],
        ["a string", "nope"],
    ])("returns an empty map for %s", (_label, payload) => {
        expect(parseBulkLookupMap(payload).size).toBe(0);
    });
});

describe("buildShopsParam", () => {
    it("always includes Steam so the history graph keeps its baseline", () => {
        expect(buildShopsParam([35, 16]).split(",")).toContain(String(STEAM_STORE_ID));
    });

    it("does not duplicate Steam when it is already selected", () => {
        const ids = buildShopsParam([61, 35]).split(",");

        expect(ids.filter(id => id === "61")).toHaveLength(1);
    });

    it("filters out ids that could not be real stores", () => {
        expect(buildShopsParam([35, -1, 1.5, 10000, NaN, "61" as any, null]).split(",").sort())
            .toEqual(["35", "61"]);
    });

    it.each([
        ["an empty selection", []],
        ["a non-array value", "everything"],
        ["null", null],
    ])("falls back sensibly for %s", (_label, stores) => {
        // An empty array still yields Steam; a non-array means "unset", which
        // should behave like the new all-stores default.
        expect(buildShopsParam(stores).length).toBeGreaterThan(0);
    });

    it("uses every store when the setting is unset", () => {
        expect(buildShopsParam(undefined).split(",")).toHaveLength(ALL_STORE_IDS.length);
    });

    it("yields Steam alone when the selection is emptied", () => {
        expect(buildShopsParam([])).toBe(String(STEAM_STORE_ID));
    });
});


describe("input validators", () => {
    it.each(["570", "1086940", "1"])("accepts app id %s", (appId) => {
        expect(isValidAppId(appId)).toBe(true);
    });

    it.each(["", "abc", "57 0", "-570", "5.70", "1234567890123"])(
        "rejects app id %j before it reaches a URL",
        (appId) => {
            expect(isValidAppId(appId)).toBe(false);
        }
    );

    it.each(["US", "DE", "GB"])("accepts country %s", (country) => {
        expect(isValidCountry(country)).toBe(true);
    });

    it.each(["us", "USA", "U", "", "U1"])("rejects country %j", (country) => {
        expect(isValidCountry(country)).toBe(false);
    });
});

describe("parseCurrencyApiRates", () => {
    const sample = {
        date: "2026-09-10",
        usd: { eur: 0.859, gbp: 0.738, ars: 1513.77, twd: 31.52, usd: 1 },
    };

    it("reads the table for the requested base and uppercases the codes", () => {
        const result = parseCurrencyApiRates(sample, "USD");

        expect(result?.base).toBe("USD");
        expect(result?.rates).toMatchObject({ EUR: 0.859, GBP: 0.738, ARS: 1513.77, TWD: 31.52 });
    });

    it("drops crypto tickers and other non-currency identifiers", () => {
        const result = parseCurrencyApiRates(
            { usd: { eur: 0.9, usdt: 1, "1inch": 3.2, btc: 0.00001 } },
            "USD"
        );

        // btc passes the three-letter shape, which is fine - it is simply
        // never looked up. The point is that malformed codes never get in.
        expect(Object.keys(result!.rates).sort()).toEqual(["BTC", "EUR"]);
    });

    it.each([
        ["zero", 0],
        ["negative", -1],
        ["NaN", NaN],
        ["infinite", Infinity],
        ["a string", "0.9"],
        ["null", null],
    ])("drops a rate that is %s", (_label, bad) => {
        const result = parseCurrencyApiRates({ usd: { eur: 0.9, gbp: bad } }, "USD");

        expect(result?.rates).toEqual({ EUR: 0.9 });
    });

    it("rejects a payload whose table is for a different base", () => {
        expect(parseCurrencyApiRates({ eur: { usd: 1.16 } }, "USD")).toBeNull();
    });

    it.each([
        ["null", null],
        ["an array", []],
        ["a string", "nope"],
        ["a table that is an array", { usd: [1, 2] }],
        ["an empty table", { usd: {} }],
        ["a table with nothing usable", { usd: { usdt: 1, "1inch": 2 } }],
    ])("rejects %s", (_label, payload) => {
        expect(parseCurrencyApiRates(payload, "USD")).toBeNull();
    });

    it("refuses an invalid base code before looking anything up", () => {
        expect(parseCurrencyApiRates(sample, "usd")).toBeNull();
        expect(parseCurrencyApiRates(sample, "US")).toBeNull();
    });
});

describe("isValidCurrencyCode", () => {
    it.each(["USD", "EUR", "TWD"])("accepts %s", (code) => {
        expect(isValidCurrencyCode(code)).toBe(true);
    });

    it.each(["usd", "US", "USDT", "", "U5D"])("rejects %j", (code) => {
        expect(isValidCurrencyCode(code)).toBe(false);
    });
});
