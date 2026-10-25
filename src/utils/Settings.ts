import { call } from "@decky/api";
import { CACHE } from "./Cache";
import { ALL_STORE_IDS } from "./Stores";

export enum Setting {
  FONTSIZE = "fontSize",
  PADDING_BOTTOM = "paddingBottom",
  COUNTRY = "country",
  STORES = "stores",
  ENABLED = "enabled",
  DATE_FORMAT = "dateFormat",
  SHOW_QUICK_LINKS = "showQuickLinks",
  SHOW_PREDICTIONS = "showPredictions",
  PROVIDERS = "providers",
  HISTORY_RANGE = "historyRange",
  LOCALE = "locale",
  ITAD_API_KEY = "itadApiKey",
  WISHLIST_ALERTS = "wishlistAlerts",
  WISHLIST_MIN_DISCOUNT = "wishlistMinDiscount",
  WISHLIST_CHECK_HOURS = "wishlistCheckHours",
  WISHLIST_SEEN = "wishlistSeen",
  WISHLIST_DEALS = "wishlistDeals",
  WISHLIST_SEEDED = "wishlistSeeded",
  WISHLIST_LAST_CHECK = "wishlistLastCheck",
}

export let SETTINGS: Settings

// A backend that failed to start never answers, so every call is bounded;
// otherwise screens that load a setting wait forever.
const BACKEND_TIMEOUT_MS = 5000;
const TIMED_OUT = Symbol("timed out");
const FAILED = Symbol("failed");

async function backendCall<T>(label: string, method: string, ...args: unknown[]): Promise<T | typeof TIMED_OUT | typeof FAILED> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const answer = call<unknown[], T>(method, ...args).catch((e): typeof FAILED => {
    console.error(`[DeckySales] ${label} failed`, e);
    return FAILED;
  });
  const timeout = new Promise<typeof TIMED_OUT>(resolve => {
    timer = setTimeout(() => {
      console.error(`[DeckySales] Backend did not answer ${label} within ${BACKEND_TIMEOUT_MS}ms; using defaults. Check the plugin's backend log.`);
      resolve(TIMED_OUT);
    }, BACKEND_TIMEOUT_MS);
  });
  try {
    return await Promise.race([answer, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class Settings {
  public defaults: Record<Setting, any> = {
    fontSize: 16,
    paddingBottom: 10,
    country: "US",
    stores: ALL_STORE_IDS,
    enabled: true,
    dateFormat: "default",
    showQuickLinks: true,
    showPredictions: true,
    providers: ["itad"],
    historyRange: "1y",
    locale: "en",
    itadApiKey: "",
    wishlistAlerts: true,
    wishlistMinDiscount: 20,
    wishlistCheckHours: 6,
    wishlistSeen: {},
    wishlistDeals: {},
    wishlistSeeded: false,
    wishlistLastCheck: 0,
  };

  static init() {
    SETTINGS = new Settings()
  }

  async load(key: Setting) {
    const cacheValue = await CACHE.loadValue(key)
    if (cacheValue) {
      return cacheValue
    }

    const result = await backendCall<unknown>(`settings_load(${key})`, "settings_load", key, this.defaults[key]);
    // Not cached on timeout, so a backend that comes back later is used.
    if (result === TIMED_OUT) return this.defaults[key];

    const value = result === FAILED || result == undefined ? this.defaults[key] : result;
    CACHE.setValue(key, value)
    return value;
  }

  async save(key: Setting, value: any) {
    CACHE.setValue(key, value)
    await backendCall(`settings_save(${key})`, "settings_save", key, value);
  }
}
