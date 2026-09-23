import type { DeckyServer as ServerAPI } from "../platform";
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

/**
 * How long to wait for the Python backend before falling back to defaults.
 *
 * A backend that failed to start never answers at all, and the call that was
 * waiting on it never settles. Every screen that loads a setting before it can
 * render then waits forever - which is what a crashed backend looked like to
 * users in v1.2.3: a spinner that never stopped, with no error anywhere. A
 * settings read is local and takes milliseconds, so anything past this is not
 * slow, it is not coming.
 */
const BACKEND_TIMEOUT_MS = 5000;

/** Returned instead of a backend reply when the wait ran out. */
const TIMED_OUT = Symbol("backend timeout");

/**
 * Resolve to `TIMED_OUT` if `promise` has not settled within BACKEND_TIMEOUT_MS.
 *
 * The timer is always cleared, so a prompt answer does not hold the event loop
 * open for the rest of the timeout, and a late answer is ignored rather than
 * rejecting into an unhandled promise.
 */
async function withTimeout<T>(promise: Promise<T>, timedOut: typeof TIMED_OUT, label: string): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>(resolve => {
        timer = setTimeout(() => {
          console.error(
            `[DeckySales] The Python backend did not answer ${label} within ${BACKEND_TIMEOUT_MS}ms. ` +
            "Carrying on with defaults - the backend is probably not running, so check its log."
          );
          resolve(timedOut);
        }, BACKEND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class Settings {
  private readonly serverAPI: ServerAPI;
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

  constructor(serverAPI: ServerAPI) {
    this.serverAPI = serverAPI;
  }

  static init(serverAPI: ServerAPI) {
    SETTINGS = new Settings(serverAPI)
  }

  async load(key: Setting) {
    const cacheValue = await CACHE.loadValue(key)
    if (cacheValue) {
      return cacheValue
    }

    const response = await withTimeout(
      this.serverAPI.callPluginMethod("settings_load", {
        key: key,
        defaults: this.defaults[key]
      }),
      TIMED_OUT,
      `settings_load(${key})`,
    );

    // A timeout is not an answer, so it is not cached: caching the default
    // would make the fallback permanent for the session and hide a backend
    // that came back. A backend that answered with a failure is cached as
    // before, since that is a real answer about a real key.
    if (response === TIMED_OUT) return this.defaults[key];

    if (response.success && response.result != undefined) {
      CACHE.setValue(key, response.result)
      return response.result;
    }
    CACHE.setValue(key, this.defaults[key])
    return this.defaults[key];
  }


  async save(key: Setting, value: any) {
    CACHE.setValue(key, value)

    // Bounded for the same reason as load: callers await this in sequence, so
    // one unanswered write would stall the whole wishlist check. The value is
    // already in the cache, so the session carries on with it either way.
    await withTimeout(
      this.serverAPI.callPluginMethod("settings_save", {
        key: key,
        value: value,
      }),
      TIMED_OUT,
      `settings_save(${key})`,
    );
  }
}
