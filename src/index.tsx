import { definePlugin, routerHook } from "@decky/api";
import { FaChartLine } from "react-icons/fa";

import DeckyMenuOption from "./components/DeckyMenuOption";
import DealsPage from "./components/DealsPage";
import { injectStore } from "./patches/StoreInjector";
import { Cache } from "./utils/Cache";
import { Settings } from "./utils/Settings";
import { DEALS_ROUTE } from "./utils/Deals";
import { wishlistService } from "./service/WishlistService";
import { AVAILABLE_LOCALES, setLocale } from "./l10n";
import { detectSteamLanguage, localeForSteamLanguage } from "./utils/SteamLocale";


export default definePlugin(() => {
  Cache.init()
  Settings.init()

  void detectSteamLanguage().then(language => {
    const locale = localeForSteamLanguage(language, AVAILABLE_LOCALES);
    if (locale) setLocale(locale);
  });

  void wishlistService.start()

  // Full-page deals list, opened directly by wishlist notifications.
  routerHook.addRoute(DEALS_ROUTE, DealsPage)

  // injectStore returns a teardown function
  const stopStoreInjector = injectStore()


  return {
    name: "DeckySales",
    content: <DeckyMenuOption />,
    icon: <FaChartLine />,
    onDismount() {
      stopStoreInjector()
      routerHook.removeRoute(DEALS_ROUTE)
      void wishlistService.stop()
    },
  };
});
