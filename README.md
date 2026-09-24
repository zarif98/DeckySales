<div align="center">

# DeckySales

### Find the cheapest price, on any store, without leaving your Deck

![DeckySales on a Steam store page](./.github/DOCUMENTATION/images/best-price-now.jpeg)

**Steam wants 49.99. The Microsoft Store has it for 24.99. DeckySales tells you before you buy.**

[![CI](https://github.com/zarif98/DeckySales/actions/workflows/ci.yml/badge.svg)](https://github.com/zarif98/DeckySales/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/zarif98/DeckySales?label=download&style=flat)](https://github.com/zarif98/DeckySales/releases/latest)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](./LICENSE)

</div>

---

## What it does

DeckySales adds a price panel to every Steam store page on your Deck, and watches your wishlist for sales anywhere — not just on Steam.

- **The best price available right now**, across ~30 stores. Not an all-time low you can no longer pay — the price you would actually pay today, with the historic low kept underneath as context.
- **Wishlist alerts across every store.** Steam only tells you when *Steam* discounts a wishlisted game. This tells you when GOG, Fanatical, GreenManGaming or anyone else does.
- **Price history and next-sale prediction**, from five years of data.
- **Currency-aware comparison** — daily exchange rates are used behind the scenes so "cheaper" means cheaper, even across stores pricing in different currencies.
- **All stores enabled by default**, so the comparison works out of the box.

> [!NOTE]
> DeckySales is not on the Decky plugin store yet, so installation is manual — see below. It is a working, tested plugin, not a preview.

## Installation

DeckySales is not on the Decky store yet, so it installs by hand. Decky Loader
must already be installed, and do this from Game Mode.

### From a URL (easiest)

In **Decky** → **Settings** → enable **Developer mode** (General tab) → the
**Developer** tab → **Install Plugin from URL**, and enter:

```
https://github.com/zarif98/DeckySales/releases/latest/download/DeckySales.zip
```

That link always resolves to the newest release, so it stays current and is
worth keeping. Nothing to download first, and no toolchain.

### From a zip

If you would rather have the file, download `deckysales-v*.zip` from the
[**Releases page**](https://github.com/zarif98/DeckySales/releases/latest),
then use **Install Plugin from ZIP File** in that same Developer tab. Every
release carries both files: they are the same build under two names.

Prefer to build it yourself? See [`FORK_AND_BUILD_ZIP.md`](./.github/DOCUMENTATION/FORK_AND_BUILD_ZIP.md).

## Screenshots

**On the store page.** The right-hand tile is the cheapest price live across your selected stores, with the discount, the store, and what it saves against Steam. The all-time low sits below it as context, not as the headline.

![Best price now](./.github/DOCUMENTATION/images/best-price-now.jpeg)

**Wishlist Deals.** Every wishlisted game currently on sale anywhere, deepest discount first. Selecting one opens its Steam store page. The notification that opens this list is visible bottom-right.

![Wishlist deals](./.github/DOCUMENTATION/images/wishlist-deals.jpeg)

## Wishlist alerts

Your wishlist is read from the Steam client's own signed-in store session, so it works **whatever your privacy settings are**. If that is ever unavailable, the plugin falls back to Steam's public wishlist API, which only sees the wishlist when *Game details* is public (Steam Profile → Privacy Settings). Steam answers that API identically for an empty wishlist and a hidden one, so if nothing is found the plugin says so and points at that setting rather than guessing which it is.

**When you get told**

- Checks run on a configurable interval (default: every 6 hours), and on demand via **Check Now**.
- The **first** check records what is already on sale *without* notifying you. Across ~30 stores something is always discounted, so announcing that backlog would present weeks-old deals as news. After that, an alert means a sale genuinely started.
- Games you wishlist later while already on sale, and discounts that deepen, still alert normally.
- Each deal is announced once per price. A sale that ends and later returns is announced again.
- Up to three games are announced individually; beyond that you get one summary.

**Where the notification takes you**

- A single-game alert opens that game's Steam store page, where the DeckySales panel shows the full cross-store comparison.
- A summary alert opens the **Wishlist Deals** list. Selecting a game opens its store page.
- That list is available any time from **View Deals List** in settings.

**Controls**

| Setting | What it does |
| :-- | :-- |
| **Minimum Discount** | Ignore anything shallower than this. |
| **Check Frequency** | How often the background check runs. |
| **Reset Alert History** | Forget what you have been told, so the next check reports every current sale again. |

## Privacy and API usage

| Service | Purpose | What is sent |
| :--- | :--- | :--- |
| **Credentials endpoint** (`deckysales-credentials.zarif98.workers.dev`) | Supplies the shared IsThereAnyDeal key. A free Cloudflare Worker run by this project; self-hostable — see [`server/`](./server/README.md). Never contacted if you supply your own key. | An `X-App-ID` header |
| **IsThereAnyDeal** | Current prices, historic lows, graph data | App ID, country code, store IDs |
| **[Free Currency Exchange Rates API](https://github.com/fawazahmed0/exchange-api)** (via jsDelivr, Cloudflare mirror as fallback) | Daily rates for cross-currency comparison. No key, no account | Target currency code |
| **Steam store** (`store.steampowered.com/dynamicstore/userdata`) | Reads your wishlist from your signed-in session, only when alerts are enabled | Nothing beyond the session the Steam client already sends |
| **Steam Web API** | Fallback wishlist read if the above is unavailable | Your SteamID64 |

All requests are made from your Deck. The store-session read goes through the Steam client itself, since only it holds the session; everything else goes through Decky's network layer. The plugin never reads, stores or sends your Steam session or any credential.

That store response is Steam's general per-user store data, so alongside the wishlist it also contains things like the games you own. The plugin reads only the wishlist from it and discards the rest in memory. The only thing that leaves your Deck as a result is the wishlist's app IDs, sent to IsThereAnyDeal for prices.

**On wishlist data specifically:** your SteamID goes only to Steam's own API. To price your wishlist, the Steam app IDs of the games on it are sent to IsThereAnyDeal — that is the only wishlist-derived data that leaves your device, and nothing about your wishlist is sent anywhere else.

### Bring your own API key

DeckySales uses a shared IsThereAnyDeal key by default. Paste your own under **Settings → API Access** to use your own quota, or if the shared key is ever unavailable. It takes precedence, and while it is set the credentials endpoint is not contacted at all.

Running your own fork? Deploy your own endpoint rather than depending on someone else's: [`server/README.md`](./server/README.md).

## Development

```bash
pnpm install
pnpm build        # bundle to dist/index.js
pnpm test         # unit + end-to-end service tests
pnpm typecheck    # tsc --noEmit
pnpm run archive  # build an installable zip
```

Tests cover two layers:

- **Pure logic** (`src/utils`) — deal normalization, which offer triggers an alert, notification de-duplication and first-run seeding, deals-list ordering, and validation of everything arriving from an external API.
- **The wishlist flow end to end** (`src/service/WishlistService.test.ts`) — driven through a fake `ServerAPI`, so a sale can be made to start, deepen, lapse and return and the resulting notification asserted, without waiting for a real sale.

`@decky/ui` cannot load outside the Steam client, so vitest aliases it to a stub in `src/test/` that records navigation calls. The Python backend's settings storage and Deckdeals migration are tested with `python3 -m unittest discover -s tests_py`. Only the Steam store DOM injection and on-screen rendering need real hardware.

> [!IMPORTANT]
> Use **pnpm**, not npm. The lockfile is what CI and the plugin store build from, and npm ignores it.


## Releases

Every push runs [CI](.github/workflows/ci.yml): type check, tests, build, and a packaging check that the zip contains what it should and that no test code leaked into the bundle. Each run attaches the installable zip as an artifact, so the latest build is always one download away.

To publish, bump the version in **both** `package.json` and `plugin.json`, then tag:

```bash
git tag v1.3.0 && git push origin v1.3.0
```

[`release.yml`](.github/workflows/release.yml) checks the tag matches both manifests, re-runs the type check and both test suites, then publishes a GitHub Release. CI fails if the two version fields ever disagree — the Decky store reads `plugin.json`, while the zip is named from `package.json`.

Each release carries the same build twice: `deckysales-v<version>.zip`, and `DeckySales.zip` under a name that never changes. GitHub serves the newest release's assets from `/releases/latest/download/<name>`, so the fixed name is what makes the install URL above permanent. Renaming it would break that link for everyone already using it.

## Security

Reviewers should start with the [Security Review Notes](./.github/DOCUMENTATION/SECURITY_REVIEW.md), covering file-by-file responsibilities, settings persistence and privacy scope, logging policy, and the fail-closed handling of external API responses.

## Roadmap

- [ ] Submit to the Decky plugin store
- [ ] Link deals through to the store offering them, not only to Steam
- [ ] More price providers
- [ ] More translations
- [ ] Wishlist page integration
- [ ] Configurable placement of the store-page panel

## Contributing

Translations especially welcome. Russian and Ukrainian currently include machine-translated strings for the features added in this fork, marked with a comment in each file — corrections from native speakers are particularly valuable:

1. Copy `src/l10n/template.ts` → `src/l10n/<lang>.ts` (e.g. `de.ts`).
2. Fill in the strings.
3. Import it in `src/l10n/index.ts` and add it to the `locales` map.
4. Open a pull request.

## Credits

**DeckySales is a fork of [Deckdeals](https://github.com/ebdevag/optideck-deckdeals) by [ebdevag](https://github.com/ebdevag), and the great majority of it is his work** — the Steam store page integration, the price history graph, the next-sale prediction, the currency normalisation tables, the settings interface, and the IsThereAnyDeal integration the whole thing is built on. This fork continues the project with his knowledge, adding cross-store best-price-now, wishlist sale alerts, a self-hostable credentials endpoint, and a test suite.

Russian and Ukrainian translations by [Eugene Chefranov](https://github.com/chefranov).

Original inspiration: the [IsThereAnyDeal Decky Plugin](https://github.com/JtdeGraaf/IsThereAnyDeal-DeckyPlugin) by JtdeGraaf.

Price data from the [IsThereAnyDeal API](https://isthereanydeal.com/), exchange rates from the [Free Currency Exchange Rates API](https://github.com/fawazahmed0/exchange-api) by fawazahmed0.

## License

[GPL-3.0-or-later](./LICENSE), as the upstream project has always been. See [`NOTICE`](./defaults/NOTICE) for full attribution and the list of changes made in this fork.
