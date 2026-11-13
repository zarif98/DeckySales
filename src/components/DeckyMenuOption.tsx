import { useSettings } from '../hooks/useSettings'
import { ButtonItem, DropdownItem, Field, Navigation, PanelSection, PanelSectionRow, TextField, ToggleField } from '@decky/ui'
import { STORES } from '../utils/Stores';
import { PROVIDERS } from '../utils/Providers';
import { useEffect, useState } from 'react';
import { t } from '../l10n';
import { wishlistService } from '../service/WishlistService';
import { DEALS_ROUTE } from '../utils/Deals';
import { CURRENCY_METADATA } from '../utils/CurrencyMeta';
import { SETTINGS, Setting } from '../utils/Settings';

const DeckyMenuOption = () => {
  const {
    country,
    saveCountry,
    stores,
    toggleStore,
    enabled,
    toggleEnabled,
    dateFormat,
    saveDateFormat,
    showQuickLinks,
    toggleShowQuickLinks,
    showPredictions,
    toggleShowPredictions,
    providers,
    toggleProvider,
    historyRange,
    saveHistoryRange,
    wishlistAlerts,
    toggleWishlistAlerts,
    wishlistMinDiscount,
    saveWishlistMinDiscount,
    wishlistCheckHours,
    saveWishlistCheckHours,
    itadApiKey,
    saveItadApiKey,
  } = useSettings();

  const [wishlistChecking, setWishlistChecking] = useState(false);
  const [wishlistStatus, setWishlistStatus] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<number>(0);

  // Answers "is this actually running?" without waiting for a notification.
  useEffect(() => {
    let mounted = true;
    SETTINGS.load(Setting.WISHLIST_LAST_CHECK).then((value) => {
      if (mounted) setLastCheck(Number(value) || 0);
    });
    return () => { mounted = false; };
  }, []);

  const lastCheckText = lastCheck > 0
    ? t("settings.wishlist.status.lastChecked").replace("{time}", new Date(lastCheck).toLocaleString())
    : t("settings.wishlist.status.never");

  const wishlistErrorText = (error: string) => {
    if (error === 'noSteamId') return t("settings.wishlist.error.noSteamId");
    if (error === 'emptyWishlist') return t("settings.wishlist.error.emptyWishlist");
    if (error === 'noPrices') return t("settings.wishlist.status.noPrices");
    return t("settings.wishlist.error.generic");
  };

  const resetWishlistHistory = async () => {
    await wishlistService.resetAlertHistory();
    setWishlistStatus(t("settings.wishlist.status.reset"));
  };

  const runWishlistCheck = async () => {
    setWishlistChecking(true);
    setWishlistStatus(null);
    try {
      const result = await wishlistService.check();
      let status: string;
      if (result.error) {
        status = wishlistErrorText(result.error);
      } else if (result.seeded) {
        // A silent first pass would otherwise report "no new deals", which reads
        // as a failure to someone who just pressed the button.
        status = t("settings.wishlist.status.seeded");
      } else if (result.found > 0) {
        status = t("settings.wishlist.status.found").replace("{count}", String(result.found));
      } else {
        status = t("settings.wishlist.status.none");
      }
      if (result.limited) {
        status += " " + t("settings.wishlist.status.limited")
          .replace("{checked}", String(result.limited.checked))
          .replace("{total}", String(result.limited.total));
      }
      setWishlistStatus(status);
    } finally {
      setWishlistChecking(false);
      setLastCheck(Number(await SETTINGS.load(Setting.WISHLIST_LAST_CHECK)) || 0);
    }
  };

  const [storesExpanded, setStoresExpanded] = useState(false);
  const [providersExpanded, setProvidersExpanded] = useState(false);

  // Major gaming regions/countries (Expanded)
  const countryOptions = [
    // North America
    { data: "US", label: "United States (US)" },
    { data: "CA", label: "Canada (CA)" },
    { data: "MX", label: "Mexico (MX)" },
    // Europe
    { data: "GB", label: "United Kingdom (GB)" },
    { data: "DE", label: "Germany (DE)" },
    { data: "FR", label: "France (FR)" },
    { data: "ES", label: "Spain (ES)" },
    { data: "IT", label: "Italy (IT)" },
    { data: "PL", label: "Poland (PL)" },
    { data: "NL", label: "Netherlands (NL)" },
    { data: "SE", label: "Sweden (SE)" },
    { data: "NO", label: "Norway (NO)" },
    { data: "CH", label: "Switzerland (CH)" },
    { data: "DK", label: "Denmark (DK)" },
    { data: "FI", label: "Finland (FI)" },
    { data: "AT", label: "Austria (AT)" },
    { data: "CZ", label: "Czech Republic (CZ)" },
    { data: "HU", label: "Hungary (HU)" },
    { data: "RO", label: "Romania (RO)" },
    { data: "UA", label: "Ukraine (UA)" },
    { data: "BE", label: "Belgium (BE)" },
    { data: "PT", label: "Portugal (PT)" },
    { data: "IE", label: "Ireland (IE)" },
    // Asia
    { data: "JP", label: "Japan (JP)" },
    { data: "KR", label: "South Korea (KR)" },
    { data: "CN", label: "China (CN)" },
    { data: "TW", label: "Taiwan (TW)" },
    { data: "HK", label: "Hong Kong (HK)" },
    { data: "IN", label: "India (IN)" },
    { data: "ID", label: "Indonesia (ID)" },
    { data: "MY", label: "Malaysia (MY)" },
    { data: "PH", label: "Philippines (PH)" },
    { data: "SG", label: "Singapore (SG)" },
    { data: "TH", label: "Thailand (TH)" },
    { data: "VN", label: "Vietnam (VN)" },
    // South America
    { data: "BR", label: "Brazil (BR)" },
    { data: "AR", label: "Argentina (AR)" },
    { data: "CL", label: "Chile (CL)" },
    { data: "CO", label: "Colombia (CO)" },
    { data: "PE", label: "Peru (PE)" },
    // Oceania
    { data: "AU", label: "Australia (AU)" },
    { data: "NZ", label: "New Zealand (NZ)" },
    // Middle East / Africa
    { data: "IL", label: "Israel (IL)" },
    { data: "SA", label: "Saudi Arabia (SA)" },
    { data: "AE", label: "United Arab Emirates (AE)" },
    { data: "ZA", label: "South Africa (ZA)" },
    { data: "TR", label: "Turkey (TR)" },
  ];

  const getCurrencyForCountry = (cc: string) => {
    const Mapping: Record<string, string> = {
      "US": "USD", "CA": "CAD", "MX": "USD",
      "GB": "GBP", "PL": "PLN", "JP": "JPY", "KR": "KRW", "CN": "CNY",
      "TW": "TWD", "IN": "INR", "ID": "IDR", "PH": "PHP", "BR": "BRL",
      "AU": "AUD", "NZ": "NZD",
      "DE": "EUR", "FR": "EUR", "ES": "EUR", "IT": "EUR", "NL": "EUR",
      "SE": "EUR", "NO": "EUR", "CH": "EUR", "DK": "EUR", "FI": "EUR",
      "AT": "EUR", "CZ": "EUR", "HU": "EUR", "RO": "EUR", "UA": "EUR",
      "BE": "EUR", "PT": "EUR", "IE": "EUR",
      "HK": "USD", "MY": "USD", "SG": "USD", "TH": "USD", "VN": "USD",
      "AR": "USD", "CL": "USD", "CO": "USD", "PE": "USD", "IL": "USD",
      "SA": "USD", "AE": "USD", "ZA": "USD", "TR": "USD"
    };
    return Mapping[cc] || "USD";
  };

  const getNativeCurrency = (cc: string) => {
    const NativeMapping: Record<string, string> = {
      "NO": "NOK", "CH": "CHF", "DK": "DKK", "FI": "EUR", "SE": "SEK",
      "HK": "HKD", "MY": "MYR", "SG": "SGD", "TH": "THB", "VN": "VND",
      "AR": "ARS", "CL": "CLP", "CO": "COP", "PE": "PEN", "IL": "ILS",
      "SA": "SAR", "AE": "AED", "ZA": "ZAR", "TR": "TRY", "RU": "RUB",
      "MX": "MXN", "UA": "UAH", "CZ": "CZK", "HU": "HUF", "RO": "RON"
    };
    // Default to mapping result if not in native mapping (meaning it likely matches)
    return NativeMapping[cc] || getCurrencyForCountry(cc);
  };

  const selectedStoreNames = STORES.filter(s => stores.includes(s.id)).map(s => s.title);
  const selectedProviderNames = PROVIDERS.filter(p => providers.includes(p.id)).map(p => p.title);
  const currentCurrency = getCurrencyForCountry(country);
  const nativeCurrency = getNativeCurrency(country);
  const showWarning = nativeCurrency !== currentCurrency;
  const currentCountryLabel = countryOptions.find(o => o.data === country)?.label?.split(' (')[0] || country;

  const getStoreCurrencyInfo = (storeTitle: string) => {
    const regionCurrencies = CURRENCY_METADATA[country]?.stores?.[storeTitle];
    if (!Array.isArray(regionCurrencies) || regionCurrencies.length === 0) {
      return { currencies: [] as string[], status: 'unknown' as const };
    }

    const currencies = [...new Set(regionCurrencies.filter(Boolean))];
    if (currencies.length === 0) {
      return { currencies: [] as string[], status: 'unknown' as const };
    }

    const includesNative = currencies.includes(nativeCurrency);
    if (includesNative && currencies.length === 1) {
      return { currencies, status: 'native' as const };
    }
    if (includesNative) {
      return { currencies, status: 'mixed' as const };
    }
    return { currencies, status: 'nonNative' as const };
  };

  const storesByCurrency = selectedStoreNames.reduce((acc, name) => {
    const info = getStoreCurrencyInfo(name);
    // Only include stores with known currency data
    if (info.status !== 'unknown') {
      info.currencies.forEach(curr => {
        if (!acc[curr]) acc[curr] = [];
        if (!acc[curr].includes(name)) acc[curr].push(name);
      });
    }
    return acc;
  }, {} as Record<string, string[]>);

  // Get ALL stores and their currencies for the current region (for info display)
  const allStoresCurrencyInfo = STORES.map(store => {
    const info = getStoreCurrencyInfo(store.title);
    return {
      name: store.title,
      id: store.id,
      currencies: info.currencies,
      status: info.status,
      isSelected: stores.includes(store.id)
    };
  }).filter(store => store.status !== 'unknown'); // Only show stores with data

  // Group all stores by currency
  const allStoresByCurrency = allStoresCurrencyInfo.reduce((acc, store) => {
    store.currencies.forEach(curr => {
      if (!acc[curr]) acc[curr] = { selected: [], unselected: [] };
      if (store.isSelected) {
        acc[curr].selected.push(store.name);
      } else {
        acc[curr].unselected.push(store.name);
      }
    });
    return acc;
  }, {} as Record<string, { selected: string[], unselected: string[] }>);

  const [showAllStores, setShowAllStores] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  return (
    <>
      <PanelSection title={t("settings.general.title")}>
        <ToggleField
          label={t("settings.enable.label")}
          description={t("settings.enable.description")}
          checked={enabled}
          onChange={toggleEnabled}
        />
        <ToggleField
          label={t("settings.quickLinks.label")}
          description={t("settings.quickLinks.description")}
          checked={showQuickLinks}
          onChange={toggleShowQuickLinks}
        />
        <ToggleField
          label={t("settings.predictions.label")}
          description={t("settings.predictions.description")}
          checked={showPredictions}
          onChange={toggleShowPredictions}
        />
      </PanelSection>

      <PanelSection title={t("settings.display.title")}>
        <DropdownItem
          layout="below"
          label={t("settings.dateFormat.label")}
          description={t("settings.dateFormat.description")}
          rgOptions={[
            { data: "default", label: t("settings.dateFormat.default") },
            { data: "US", label: t("settings.dateFormat.us") },
            { data: "EU", label: t("settings.dateFormat.eu") },
            { data: "ISO", label: t("settings.dateFormat.iso") },
          ]}
          selectedOption={dateFormat}
          onChange={(option) => saveDateFormat(option.data)}
        />
        <DropdownItem
          layout="below"
          label={t("settings.historyRange.label")}
          description={t("settings.historyRange.description")}
          rgOptions={[
            { data: "3m", label: t("settings.historyRange.3m") },
            { data: "6m", label: t("settings.historyRange.6m") },
            { data: "1y", label: t("settings.historyRange.1y") },
            { data: "2y", label: t("settings.historyRange.2y") },
          ]}
          selectedOption={historyRange}
          onChange={(option) => saveHistoryRange(option.data)}
        />
      </PanelSection>

      <PanelSection title={t("settings.region.title")}>
        <DropdownItem
          layout="below"
          label={t("settings.country.label")}
          description={t("settings.country.description")}
          rgOptions={countryOptions}
          selectedOption={countryOptions.find(option => option.data === country)?.data}
          onChange={(option) => saveCountry(option.data)}
        />
        <ToggleField
          label={t("settings.stores.showListLabel")}
          description={selectedStoreNames.length > 0
            ? (
              <span>
                <span style={{ color: '#67c1f5' }}>{t("settings.common.selectedPrefix")} </span>
                {selectedStoreNames.join(', ')}
              </span>
            )
            : t("settings.stores.noneSelected")}
          checked={storesExpanded}
          onChange={() => setStoresExpanded(!storesExpanded)}
        />
        {storesExpanded && STORES.map((store) => (
          <ToggleField
            key={store.id}
            label={store.title}
            checked={stores.includes(store.id)}
            onChange={() => toggleStore(store.id)}
          />
        ))}
        <Field
          focusable
          description={
            <>
              {t("settings.country.currencyHint").replace("{currency}", currentCurrency)}
              {showWarning && (
                <div style={{ color: '#ffc107', marginTop: '6px' }}>
                  {t("settings.country.nativeCurrencyWarning")
                    .replace("{country}", currentCountryLabel)
                    .replace("{native}", nativeCurrency)
                    .replace("{fallback}", currentCurrency)}
                </div>
              )}
            </>
          }
        />
        {Object.keys(storesByCurrency).length > 1 && (
          <>
            {Object.entries(storesByCurrency).map(([curr, names]) => (
              <Field
                key={curr}
                focusable
                label={`${t("settings.country.storesReturning").replace("{currency}", curr)} ${names.length}`}
                description={names.join(", ")}
              />
            ))}
            <PanelSectionRow>
              <ButtonItem layout="below" onClick={() => setShowHowItWorks(!showHowItWorks)}>
                {t("settings.stores.howItWorksLabel")}
              </ButtonItem>
            </PanelSectionRow>
            {showHowItWorks && (
              <Field
                focusable
                description={
                  <>
                    <div>{t("settings.stores.howItWorksBody1")}</div>
                    <div style={{ marginTop: '6px' }}>{t("settings.stores.howItWorksBody2")}</div>
                    <div style={{ marginTop: '6px' }}>{t("settings.stores.howItWorksBody3")}</div>
                  </>
                }
              />
            )}
          </>
        )}
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => setShowAllStores(!showAllStores)}>
            {showAllStores
              ? t("settings.stores.hideAllForCountry").replace("{country}", currentCountryLabel)
              : t("settings.stores.showAllForCountry").replace("{country}", currentCountryLabel)}
          </ButtonItem>
        </PanelSectionRow>
        {showAllStores && Object.entries(allStoresByCurrency)
          .sort(([a], [b]) => (a === nativeCurrency ? -1 : b === nativeCurrency ? 1 : a.localeCompare(b)))
          .map(([curr, storeGroups]) => (
            <Field
              key={curr}
              focusable
              label={`${curr} (${t("settings.stores.count").replace("{count}", String(storeGroups.selected.length + storeGroups.unselected.length))})`}
              description={
                <>
                  {storeGroups.selected.length > 0 && (
                    <div>{t("settings.stores.selectedBadge")}: {storeGroups.selected.join(", ")}</div>
                  )}
                  {storeGroups.unselected.length > 0 && (
                    <div style={{ marginTop: '4px' }}>{t("settings.stores.availableBadge")}: {storeGroups.unselected.join(", ")}</div>
                  )}
                </>
              }
            />
          ))}
        {showAllStores && (
          <Field
            focusable
            description={t("settings.stores.availableInCountry")
              .replace("{count}", String(allStoresCurrencyInfo.length))
              .replace("{country}", currentCountryLabel)}
          />
        )}
        <ToggleField
          label={t("settings.provider.showListLabel")}
          description={selectedProviderNames.length > 0
            ? (
              <span>
                <span style={{ color: '#67c1f5' }}>{t("settings.common.selectedPrefix")} </span>
                {selectedProviderNames.join(', ')}
              </span>
            )
            : t("settings.provider.noneSelected")}
          checked={providersExpanded}
          onChange={() => setProvidersExpanded(!providersExpanded)}
        />
        {providersExpanded && PROVIDERS.map((p) => (
          <ToggleField
            key={p.id}
            label={p.title}
            checked={providers.includes(p.id)}
            onChange={() => toggleProvider(p.id)}
          />
        ))}
      </PanelSection>

      <PanelSection title={t("settings.wishlist.title")}>
        <ToggleField
          label={t("settings.wishlist.label")}
          description={t("settings.wishlist.description")}
          checked={wishlistAlerts}
          onChange={toggleWishlistAlerts}
        />
        {wishlistAlerts && (
          <>
            <DropdownItem
          layout="below"
              label={t("settings.wishlist.minDiscount.label")}
              description={t("settings.wishlist.minDiscount.description")}
              rgOptions={[10, 20, 33, 50, 66, 75].map(value => ({ data: value, label: `${value}%` }))}
              selectedOption={wishlistMinDiscount}
              onChange={(option) => saveWishlistMinDiscount(Number(option.data))}
            />
            <DropdownItem
          layout="below"
              label={t("settings.wishlist.interval.label")}
              description={t("settings.wishlist.interval.description")}
              rgOptions={[1, 3, 6, 12, 24].map(value => ({
                data: value,
                label: t("settings.wishlist.interval.hours").replace("{count}", String(value))
              }))}
              selectedOption={wishlistCheckHours}
              onChange={(option) => saveWishlistCheckHours(Number(option.data))}
            />
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                disabled={wishlistChecking}
                onClick={runWishlistCheck}
              >
                {wishlistChecking ? t("settings.wishlist.checkNow.running") : t("settings.wishlist.checkNow.label")}
              </ButtonItem>
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                onClick={() => {
                  Navigation.CloseSideMenus();
                  Navigation.Navigate(DEALS_ROUTE);
                }}
              >
                {t("settings.wishlist.viewDeals.label")}
              </ButtonItem>
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                disabled={wishlistChecking}
                onClick={resetWishlistHistory}
              >
                {t("settings.wishlist.reset.label")}
              </ButtonItem>
            </PanelSectionRow>
            <Field
              focusable
              description={
                <>
                  {wishlistStatus && <div>{wishlistStatus}</div>}
                  <div>{lastCheckText}</div>
                  <div style={{ marginTop: '6px' }}>{t("settings.wishlist.privacyNote")}</div>
                </>
              }
            />
          </>
        )}
      </PanelSection>

      <PanelSection title={t("settings.api.title")}>
        <PanelSectionRow>
          <TextField
            label={t("settings.api.itadKey.label")}
            description={t("settings.api.itadKey.description")}
            value={itadApiKey}
            bIsPassword={true}
            bShowClearAction={true}
            onChange={(e) => saveItadApiKey(e.target.value)}
          />
        </PanelSectionRow>
        <Field
          focusable
          description={itadApiKey ? t("settings.api.itadKey.active") : t("settings.api.itadKey.shared")}
        />
      </PanelSection>

      <PanelSection title={t("settings.about.title")}>
        <Field
          focusable
          label={t("attribution.title")}
          description={
            <>
              <div>{t("attribution.line1")}</div>
              <div>{t("attribution.line2")}</div>
              <div>{t("attribution.line3")}</div>
              <div>{t("attribution.line4")}</div>
              <div>{t("attribution.line5")}</div>
            </>
          }
        />
      </PanelSection>
    </>
  );
}

export default DeckyMenuOption
