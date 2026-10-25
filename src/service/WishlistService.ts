import { Navigation } from "@decky/ui";
import { fetchNoCors, toaster } from "@decky/api";
import { SETTINGS, Setting } from "../utils/Settings";
import { priceService } from "./PriceService";
import { DEALS_ROUTE, Deal, buildRowDeals, pickWishlistDeal, planAnnouncements, storePageUrlFor } from "../utils/Deals";
import { isValidSteamId64, parseDynamicStoreWishlist, parseWishlistAppIds } from "../utils/ApiParsing";
import { t } from "../l10n";

/*
 * Watches the user's Steam wishlist and sends a toast when a game on it is
 * discounted at any store, not just Steam. Failures are non-fatal; the next
 * scheduled check retries.
 */

interface WishlistCandidate {
    appId: string;
    gameId: string;
    deal: Deal;
}

class WishlistService {
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    /** Bumped on every start/stop so a delayed first pass cannot re-arm a stopped watcher. */
    private generation = 0;
    /**
     * The Steam client's own store session endpoint. Injectable fetch so the
     * tests can drive this route without a browser.
     */
    private readonly DYNAMIC_STORE_URL = "https://store.steampowered.com/dynamicstore/userdata/";
    public pageFetch: typeof fetch | undefined;
    private readonly WISHLIST_HOST = "api.steampowered.com";
    private readonly WISHLIST_PATH = "/IWishlistService/GetWishlist/v1/";
    private readonly MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
    /** Bound the work for people with enormous wishlists. */
    private readonly MAX_WISHLIST_APPS = 500;
    /** Announce at most this many games individually; the rest get one summary. */
    private readonly MAX_INDIVIDUAL_TOASTS = 3;
    /** Steam app id -> ITAD game id, cached for the session. */
    private idCache = new Map<string, string>();


    public async start() {
        await this.stop();

        const enabled = await SETTINGS.load(Setting.WISHLIST_ALERTS);
        if (!enabled) return;

        const hours = await this.getCheckIntervalHours();
        const intervalMs = hours * 60 * 60 * 1000;
        const generation = this.generation;

        // Give the Steam client a moment to finish signing in before the first pass.
        this.timer = setTimeout(async () => {
            await this.check();
            // The plugin may have been stopped while that first check was in flight.
            if (generation !== this.generation) return;
            this.timer = setInterval(() => { void this.check(); }, intervalMs);
        }, 60 * 1000);
    }

    public async stop() {
        this.generation++;
        if (this.timer) {
            clearTimeout(this.timer as NodeJS.Timeout);
            clearInterval(this.timer as NodeJS.Timeout);
            this.timer = null;
        }
    }

    /** Restart the schedule after a settings change. */
    public async restart() {
        await this.start();
    }

    private async getCheckIntervalHours(): Promise<number> {
        const raw = await SETTINGS.load(Setting.WISHLIST_CHECK_HOURS);
        const hours = Number(raw);
        if (!Number.isFinite(hours) || hours < 1 || hours > 168) return 6;
        return hours;
    }

    private getSteamId(): string | null {
        const candidates: unknown[] = [];
        try {
            const w = window as any;
            candidates.push(w?.App?.m_CurrentUser?.strSteamID);
            candidates.push(w?.g_steamID);
            candidates.push(w?.App?.cm?.m_steamid?.m_ulSteamID?.toString?.());
            candidates.push(w?.LoginStore?.m_strAccountSteamID);
        } catch {
            return null;
        }

        for (const candidate of candidates) {
            if (isValidSteamId64(candidate)) return String(candidate);
        }
        return null;
    }

    private buildWishlistUrl(steamId: string): string {
        const url = new URL(`https://${this.WISHLIST_HOST}${this.WISHLIST_PATH}`);
        url.searchParams.set("steamid", steamId);
        return url.toString();
    }

    private isAllowedWishlistUrl(urlString: string): boolean {
        try {
            const url = new URL(urlString);
            return url.protocol === "https:"
                && url.hostname === this.WISHLIST_HOST
                && url.pathname === this.WISHLIST_PATH;
        } catch {
            return false;
        }
    }

    /**
     * Reads the wishlist from the Steam client's signed-in store session, which
     * works whatever the profile's privacy settings. The public API returns
     * `{"response":{}}` for both empty and hidden wishlists, so it's only a
     * fallback. Uses the page's fetch, since Decky's fetchNoCors has no Steam
     * session. Returns null so the caller falls back.
     */
    private async fetchWishlistFromClient(): Promise<{ appIds: string[]; total: number } | null> {
        const pageFetch = this.pageFetch ?? (typeof fetch === "function" ? fetch : undefined);
        if (!pageFetch) return null;

        try {
            const response = await pageFetch(this.DYNAMIC_STORE_URL, {
                method: "GET",
                credentials: "include",
            });
            if (!response || !response.ok) return null;

            const body = await response.text();
            if (!body || body.length > this.MAX_RESPONSE_BYTES) return null;

            const parsed = parseDynamicStoreWishlist(JSON.parse(body), this.MAX_WISHLIST_APPS);
            return parsed && !("error" in parsed) ? parsed : null;
        } catch (e) {
            console.error("[DeckySales] In-client wishlist read failed; falling back", e);
            return null;
        }
    }

    public async fetchWishlistAppIds(): Promise<{ appIds: string[]; total?: number; error?: string }> {

        const fromClient = await this.fetchWishlistFromClient();
        if (fromClient) return fromClient;

        const steamId = this.getSteamId();
        if (!steamId) return { appIds: [], error: "noSteamId" };

        const url = this.buildWishlistUrl(steamId);
        if (!this.isAllowedWishlistUrl(url)) return { appIds: [], error: "blocked" };

        try {
            const res = await fetchNoCors(url, { method: "GET" });
            if (!res.ok) return { appIds: [], error: "fetchFailed" };

            const body = await res.text();
            if (!body || body.length > this.MAX_RESPONSE_BYTES) return { appIds: [], error: "badResponse" };

            return parseWishlistAppIds(JSON.parse(body), this.MAX_WISHLIST_APPS);
        } catch (e) {
            console.error("[DeckySales] Wishlist fetch failed", e);
            return { appIds: [], error: "exception" };
        }
    }


    private async getMinDiscount(): Promise<number> {
        const raw = await SETTINGS.load(Setting.WISHLIST_MIN_DISCOUNT);
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 100) return 20;
        return value;
    }

    /**
     * Run one wishlist pass. Returns a short status the settings UI can show.
     */
    public async check(): Promise<{ found: number; checked: number; error?: string; seeded?: boolean; limited?: { checked: number; total: number } }> {
        if (this.running) return { found: 0, checked: 0, error: "busy" };
        this.running = true;

        try {
            const enabled = await SETTINGS.load(Setting.WISHLIST_ALERTS);
            if (!enabled) return { found: 0, checked: 0, error: "disabled" };

            const { appIds, total, error } = await this.fetchWishlistAppIds();
            if (error) {
                return { found: 0, checked: 0, error };
            }
            if (appIds.length === 0) {
                // A check that reached Steam and found nothing did run, so
                // record it. Returning early here left the panel saying "Not
                // checked yet" straight after a completed check.
                await SETTINGS.save(Setting.WISHLIST_LAST_CHECK, Date.now());
                return { found: 0, checked: 0, error: "emptyWishlist" };
            }

            // Wishlists beyond MAX_WISHLIST_APPS are checked only in part; say so.
            const limited = total !== undefined && total > appIds.length
                ? { checked: appIds.length, total }
                : undefined;

            // Resolve ITAD ids, reusing anything already mapped this session.
            const unknownAppIds = appIds.filter(id => !this.idCache.has(id));
            if (unknownAppIds.length > 0) {
                const resolved = await priceService.lookupItadIds(unknownAppIds);
                for (const [appId, gameId] of resolved) this.idCache.set(appId, gameId);
            }

            const gameIdByApp = new Map<string, string>();
            for (const appId of appIds) {
                const gameId = this.idCache.get(appId);
                if (gameId) gameIdByApp.set(appId, gameId);
            }
            if (gameIdByApp.size === 0) return { found: 0, checked: appIds.length, limited };

            const dealsByGame = await priceService.getDealsForGameIds([...gameIdByApp.values()]);

            // An empty map means the price fetch failed, not that every sale
            // ended. Writing state from it would clear the alert history - so
            // the next successful pass would re-announce everything - and blank
            // the deals page. Leave both untouched and try again next cycle.
            if (dealsByGame.size === 0) {
                return { found: 0, checked: gameIdByApp.size, error: "noPrices", limited };
            }

            const minDiscount = await this.getMinDiscount();

            const candidates: WishlistCandidate[] = [];
            for (const [appId, gameId] of gameIdByApp) {
                const deal = pickWishlistDeal(dealsByGame.get(gameId) || [], minDiscount);
                if (!deal) continue;
                candidates.push({ appId, gameId, deal });
            }

            const seenRaw = await SETTINGS.load(Setting.WISHLIST_SEEN);
            const seen: Record<string, string> = (seenRaw && typeof seenRaw === "object" && !Array.isArray(seenRaw))
                ? { ...seenRaw }
                : {};

            // The first pass only establishes a baseline - see planAnnouncements.
            const isFirstRun = !(await SETTINGS.load(Setting.WISHLIST_SEEDED));
            const { announce, nextSeen } = planAnnouncements(candidates, seen, isFirstRun);

            if (announce.length > 0) await this.announce(announce);

            await SETTINGS.save(Setting.WISHLIST_SEEN, nextSeen);
            // Published for the wishlist page, which annotates matching rows.
            await SETTINGS.save(Setting.WISHLIST_DEALS, buildRowDeals(candidates));
            await SETTINGS.save(Setting.WISHLIST_LAST_CHECK, Date.now());
            if (isFirstRun) await SETTINGS.save(Setting.WISHLIST_SEEDED, true);

            return { found: announce.length, checked: gameIdByApp.size, seeded: isFirstRun, limited };
        } catch (e) {
            console.error("[DeckySales] Wishlist check failed", e);
            return { found: 0, checked: 0, error: "exception" };
        } finally {
            this.running = false;
        }
    }

    /** Open a game's store page, where the DeckySales panel shows the comparison. */
    private navigateTo(url: string) {
        try {
            Navigation.CloseSideMenus();
            Navigation.NavigateToSteamWeb(url);
        } catch (e) {
            console.error("[DeckySales] Could not open page", e);
        }
    }



    /** Open the deals list; a summary toast stands for several games. */
    private openDealsList() {
        try {
            Navigation.CloseSideMenus();
            Navigation.Navigate(DEALS_ROUTE);
        } catch (e) {
            console.error("[DeckySales] Could not open deals list", e);
        }
    }

    private formatDeal(deal: Deal): string {
        return t("wishlist.toast.body")
            .replace("{cut}", String(deal.cut))
            .replace("{price}", `${deal.amount.toFixed(2)} ${deal.currency}`)
            .replace("{store}", deal.store);
    }

    private async announce(candidates: WishlistCandidate[]) {

        // Biggest discount first, so the summary toast leads with the best find.
        const byDiscount = [...candidates].sort((a, b) => b.deal.cut - a.deal.cut);

        if (byDiscount.length <= this.MAX_INDIVIDUAL_TOASTS) {
            for (const candidate of byDiscount) {
                const title = await priceService.getGameTitle(candidate.gameId)
                    || t("wishlist.toast.fallbackTitle");
                toaster.toast({
                    title,
                    body: this.formatDeal(candidate.deal),
                    duration: 8000,
                    onClick: () => this.navigateTo(storePageUrlFor(candidate.appId)),
                });
            }
            return;
        }

        const headline = byDiscount[0];
        const title = await priceService.getGameTitle(headline.gameId) || t("wishlist.toast.fallbackTitle");
        toaster.toast({
            title: t("wishlist.toast.summaryTitle").replace("{count}", String(byDiscount.length)),
            body: `${title} - ${this.formatDeal(headline.deal)}`,
            duration: 10000,
            onClick: () => this.openDealsList(),
        });
    }

    /**
     * Forget announced deals so the next check re-announces current sales.
     * The seeded flag stays set, or the next check would be silent again.
     */
    public async resetAlertHistory() {
        await SETTINGS.save(Setting.WISHLIST_SEEN, {});
    }

}

export const wishlistService = new WishlistService();
