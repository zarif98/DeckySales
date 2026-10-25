import { staticClasses } from "@decky/ui";
import { definePlugin, routerHook } from "@decky/api";
import { FaChartLine } from "react-icons/fa";

import DeckyMenuOption from "./components/DeckyMenuOption";
import DealsPage from "./components/DealsPage";
import { injectStore } from "./patches/StoreInjector";
import { Cache } from "./utils/Cache";
import { Settings } from "./utils/Settings";
import { DEALS_ROUTE } from "./utils/Deals";
import { wishlistService } from "./service/WishlistService";
import { t } from "./l10n";


export default definePlugin(() => {
  Cache.init()
  Settings.init()

  void wishlistService.start()

  // Full-page deals list, opened directly by wishlist notifications.
  routerHook.addRoute(DEALS_ROUTE, DealsPage)

  // injectStore returns a teardown function
  const stopStoreInjector = injectStore()


  return {
    name: "DeckySales",
    titleView: <div className={staticClasses.Title}>{t("plugin.title")}</div>,
    content: <DeckyMenuOption />,
    icon: <FaChartLine />,
    onDismount() {
      stopStoreInjector()
      routerHook.removeRoute(DEALS_ROUTE)
      void wishlistService.stop()
    },
  };
});
