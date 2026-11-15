# سبدچین — Sabadchin 0.15.3

**Use `main` for the latest completed version.** Finished updates are merged here; working branches are temporary and fully merged inactive branches are removed automatically.

- [Download the current project from main](https://github.com/mojtaba-brz/ShopingCartOptimizer/archive/refs/heads/main.zip)
- [Android APK and desktop builds from main](https://github.com/mojtaba-brz/ShopingCartOptimizer/actions?query=branch%3Amain)


Desktop web and Android share shopping-list entry, Persian themes, matching, package-size normalization, unit-price comparison, product/store images and review choices. Both search **Digikala Jet**, not Digikala hypermarket. No LLM or model download is required. This independent app does not place orders or make payments.

## Start on Windows

Extract this version of the project into a folder. Install Python 3.10+ and use your installed Chrome or Edge. Double-click **Start-Sabadchin.cmd**, or open PowerShell in the folder containing `pyproject.toml` and run:

```powershell
py -m pip install -e ".[live]"
py -m cartoptimizer
```

The GUI opens at **http://127.0.0.1:8765**. Keep the terminal running. The optional `live` dependency installs Playwright; it does not download a language model. Existing Chrome/Edge is used in the background. If neither browser is available, install the bundled browser with `py -m playwright install chromium`.

On Linux/macOS use `python3` in the commands above. To choose a port or avoid opening the GUI automatically:

```powershell
py -m cartoptimizer --port 8766 --no-browser
```

The pricing engine and manually imported snapshots can run without the `live` extra. Automatic desktop retrieval requires it; missing dependencies produce an explicit installation message, never a request for manually reviewed offers.

## Automatic shopping

1. Enter goods and required amounts, such as شیر ۱ لیتر or برنج ۲ کیلوگرم.
2. Choose a delivery point by searching city/street. Jet's coverage is checked before saving it on that device. GPS is optional. The isolated automated Jet session receives the delivery point you selected; this does not read the physical device location.
3. Run **جست‌وجوی کل لیست**. Progress reports completed list items, products and stores. The retrieval browser stays hidden and does not use your personal browser profile.
4. Review quantities and change a choice if needed. Options are sorted by comparable kg/litre/item price, with package totals kept separate. Saving/changing a list never requires entering offers for automatic search.

The three themes and comparison code are common to both platforms. Unknown package sizes, missing ordinary prices and partial searches are labelled. The shared task queue starts up to twenty independent pages using available RAM and CPU, then retires surplus pages when free memory falls or the interface repeatedly stalls. Active tasks finish and queued tasks/results are retained; search concurrency does not shrink the optimizer’s store/order budget. It blocks retailer image/media/font downloads where supported, and checks the same delivery point in every task. Global discovery and full-store tasks share that queue. There is no top-20 filter; the change-selection list paginates all accepted results. Budgets remain 120 scrolls/page, 40 stores/query, 1,000 products/item, 30 seconds/global task, 20 seconds/store task and two minutes/query including queued store work; reaching a cap is reported and never means complete inventory coverage. No fees or stock quotas are invented.

The multi-store planner starts with three carts and can expand to 4–6 when the measured resource budget permits. This cap is independent of search concurrency. Every automatic store mode minimizes comparable unit prices after shared amazing quotas. Each line contributes its effective unit price divided by the lowest feasible unit price for that line, with equal weight per shopping-list line; this avoids adding incompatible kg/litre/sheet units. Known payable totals including separately charged store fees break equal unit-score ties. Minimum orders and observed free-shipping thresholds are still checked. Unknown fees remain unknown; the known amount is a lower bound, not a complete payable total. Alternatives include one, up to two and up to three stores per department, plus selected stores and independent unit-price choices. Bounded enumeration yields to the UI and reports its time/state cap. Prices, quotas and availability remain estimates until matched to the retailer basket.

Desktop reads fees/notices visible on scanned store pages. Android additionally supports reading the actual basket in its retailer WebView. The desktop session does not connect to a cart in your personal browser; **به‌روزرسانی قیمت‌ها و هزینه‌های فروشگاه** refreshes public store data. Only a basket whose products, quantities and store match the proposal can supply a verified checkout total. Otherwise totals are estimates.

The **گزینه‌های کالا** form remains available for manual snapshots. Export JSON before deleting app data, uninstalling, changing port or clearing browser data. Desktop delivery data is held in the current user's local `Sabadchin/delivery.json`, separate from browser list storage; the app's clear-data action removes both.

## Android

See [Android instructions](android/README.md). Requires Android 8+ and an up-to-date System WebView. APK and desktop artifacts are generated from the same commit and the version in `cartoptimizer/release.json`. Debug APKs are test builds; store candidates require owner signing and publisher details. See [release preparation](release/README-fa.md).

## Automatic package contents and three price tiers

The same package parser is used by desktop and Android. Tissue prices compare the total two-ply-equivalent sheets (boxes × sheets per box; unspecified ply defaults to two). Mass/volume multipacks multiply their per-item amount by the item count, e.g. three 180 g tuna cans = 540 g. Explicit total weights are not multiplied again. Inconsistent or ambiguous labels remain unknown instead of inventing an amount.

For count-based requests, quantity means consumer pieces, including tissue boxes and cans within a multipack. Three tissue boxes can be fulfilled by three single boxes or one three-box pack; a ten-box pack is never selected automatically. If no exact whole-pack quantity fits, the item remains unresolved with manual alternatives rather than silently buying excess. Explicit weight/volume requests still round to whole packages. Oversized manual selections and package-count overrides remain possible, with the extra quantity shown. Tissue unit prices still use sheets, while purchase quantities use boxes.

Changing optimization mode asks whether to keep or reset manual product/package-count choices. **دوباره نپرس** remembers the selected behavior; **تنظیمات → انتخاب‌های دستی** can restore asking or set always keep/reset. Cancel leaves the current mode and choices intact. Modern uses a card dashboard and floating mobile navigation; Traditional uses a framed notebook with a horizontal desktop header. Simple keeps the compact list.

Ordinary discounted prices apply to every purchased package. Amazing prices share a merchant-order quota: two distinct products for supermarket merchants and one for other merchant types. The same SKU can receive that price at most once across all proposed orders from that merchant; its other packages use the observed post-amazing price, which may retain an ordinary discount. The planner allocates the quota together with store assignments, actual package quantities, delivery/free-shipping and minimum-order thresholds. Other packages use the separately observed post-amazing discounted/ordinary price. Public catalogue fields are accepted only when merchant, title and visible current price agree. For amazing offers whose complete discount components reconcile exactly, the next price removes only the Jet amazing contribution and retains the vendor/brand discounts; the UI identifies this component-based calculation. If that next price is unavailable, the estimate is explicitly marked unverified; the struck ordinary price is not claimed to be the actual next price. Final account stock and offers still require checkout verification.

Valid unfinished item entries are committed by either search button. Cleared/reverted drafts and unrelated hidden manual forms do not block automatic searches. Invalid quantities are reported in place, without requiring a page refresh.

## Manual-snapshot pricing behavior

The explicit snapshot contract below is retained for manually reviewed offers; its quota/coupon inputs are independent of the automatic catalogue rules above.

| Rule | Behavior |
| --- | --- |
| Money | The GUI displays toman; engine and JSON use **integer IRR (rials)**. 1 toman = 10 rials. |
| Limited amazing offers | Only the permitted units get the promotional price; excess units pay the normal price. Promotions apply automatically. |
| Promotion scope | Account-wide across all planned carts by default. Per-cart limits must be explicitly verified and selected. Earlier carts consume account quotas first. |
| Coupon replaces promotions | Enabled by default. Normal prices are restored in that cart before checking coupon minimum spend and calculating its discount. |
| Combining discounts | Supported only when `removes_promotions` is explicitly false. |
| Coupon eligibility | Measured on the item subtotal before the coupon, after any remaining item promotions. |
| Coupon types | Fixed amount or percentage in basis points, with optional maximum discount. Percent discounts round down to an integer rial. |
| Coupon usage | One coupon per cart, shared total-use limit across carts. No coupon is always an option. |
| Fees | Delivery and fixed service fees charged for every cart; free delivery and minimum orders use the selected subtotal basis. |
| Stock | Shared across carts for the same offer ID. An offer is a single product/seller inventory pool. |
| Splitting | Quantity can split between acceptable offers and carts. Up to three total carts across up to six fulfilment groups. |
| Search | Bounded exhaustive enumeration. Reports **Optimal** only after the entire finite search completes. Otherwise reports **Best found** or **No plan found within limit**. |

The no-coupon comparison is the best **single-cart plan found**, not a market-wide savings claim. The displayed result includes fees but only the rules entered in the snapshot. Recheck the retailer's final checkout total.

## Snapshot contract

See [`cartoptimizer/demo.json`](cartoptimizer/demo.json) for a complete example. Metadata records source, capture timestamp (with timezone) and location/account context. Snapshots over one hour old produce a warning. Imports preserve the snapshot timestamp; editing a price does not silently mark all prices as fresh.

- `items`: requested quantities, each with a stable `id`.
- `stores`: fulfilment groups with checkout fees and thresholds.
- `offers`: item/store references, exact seller/product, integer prices, stock, promotion quota/scope and review status.
- `coupons`: store-specific terms and account-wide use count.
- `max_carts`: total permitted checkouts, 1–3.

Do not duplicate the same inventory or account-wide promotion under different offer/group IDs: that would incorrectly create extra stock/allowance. One snapshot describes one purchase context. Stock and quota inputs must mean **remaining available allowance**, accounting for purchases already made outside the plan.

## Development and platform synchronization

```powershell
py -m unittest discover -s tests -v
```

`cartoptimizer/release.json` is the version authority for Python, Gradle and the web version label. Shared `live.js` and `auto-ui.js` consume the `CartwiseRetailer` contract, backed by Android's native bridge or the desktop HTTP worker. Native file/GPS APIs remain platform-specific. The tests require version wiring and common-provider use to remain aligned.

CI runs Python on Windows/Ubuntu with Python 3.10, 3.12 and 3.13, desktop and Android UI integration checks, and the Python collector against offline HTTPS retailer fixtures. Live service availability and fixture coverage are separate: successful fixture tests are not a claim of live, account-specific checkout validation. Retailer challenges stop collection; there is no challenge bypass.

No login credentials, signing keys, personal browser profiles or delivery data belong in the repository or release artifacts. The local HTTP server accepts only loopback hosts and rejects cross-origin writes. Public image requests have a fixed host allowlist and do not forward cookies. Source and APK must be released together; see [AGENTS.md](AGENTS.md).

## Incremental lists and retailer departments

Use **جست‌وجوی کل لیست** for a fresh scan, or **جست‌وجوی موارد جدید** to reuse successful catalogue results for up to 15 minutes in the same address/coordinates and delivery mode. Quantity edits recalculate locally; removed items are excluded. The cache is in memory only and retains the original observation age. Only failed queries without products and expired results are retried. A coverage/time-limit notice attached to usable products does not make that query fail. When coordinates exist, changing only the address label does not invalidate those results.

The parallel progress view lists each active item/store task separately. Grocery, pastry/nuts, produce, protein, bakery and pet retailers are planned separately. The editable item department supplies a fallback when public retailer metadata is unavailable; catalogue business metadata takes precedence. One/two/three-store caps apply per department, never across unlike departments. Selected-store mode restricts candidates to the checked stores. Unspecified physical quantities remain the exact requested number of packages; only explicit weight/volume/count targets cause rounding up to whole packages. No quantities are raised to satisfy minimum spend. Shipping, service, packaging, processing and explicitly observed additional fees are charged per scoped merchant. Unknown fees remain unknown.

The app-owned map uses OpenStreetMap tiles and normal browser caching, requests only the visible viewport, includes attribution and requires internet access. It has no Jet/WebGL/GPS dependency; text address search remains available if tiles are inaccessible. The same public Jet service-range check is required before saving a map point. No offline tile downloads or map prefetch are provided.

## Repeated orders and public availability (0.15)

One-store/two-store/three-store modes count distinct typed merchants, separately from the 3–6 order budget per department. The planner can distribute the existing package quantities among several orders from one merchant. Each order is checked against its own minimum, free-delivery threshold, delivery, service and observed packaging/processing/tax fees. A split is recommended only when fees and fallback prices are known and its payable total is below that merchant's unsplit plan. Unknown fees do not establish a saving. Single observed cart totals never verify multiple future orders. Per-item quantities and averages are recombined for review without duplicating list quantities. Bounded package partitioning reports incomplete search and uses balanced seeds for large quantities.

A catalogue product ID identifies the same SKU across matching rows; normalized title is the fallback. No repeated-SKU amazing entitlement is assumed for a new order. Quotas on *different* goods in subsequent orders still require retailer confirmation; the UI labels this condition. Purchase limits or eligibility that the account checkout does not expose cannot be inferred from the public catalogue. No orders are placed.

Public `stock.has_stock`, `dynamic_amazing.remaining_stock` and `price.timer` fields are whitelisted from the current Jet catalogue formatter. Unavailable goods are excluded, exhausted/expired amazing prices revert to the verified ordinary discounted price, and the UI recomputes at the next observed expiry. Missing baseline prices remain explicit estimates. The `price.price - vendor_discount - brand_discount` derivation remains permitted only when all discount components reconcile exactly.

Research references (public retailer assets inspected 2026-11-15): [terms](https://www.digikalajet.com/static/terms-and-conditions), [terms page source](https://www.digikalajet.com/assets/x-lazy-page-terms-and-conditions-static.CNz69Uyc.js), [catalogue/price formatter](https://www.digikalajet.com/assets/x-app.B7LUQ1z9.js). The terms reserve product quantity limits and stock/price corrections; repeated orders must not be treated as a way to bypass quantity limits. Public evidence does not confirm an account-wide quota reset. Account coupons, membership delivery allowances, actual weights/substitutions and delivery-slot compatibility need matching checkout evidence before they can be optimized as guaranteed benefits.

The interface uses bundled Amiri 1.003 (regular and bold) in all themes, map controls and native Android dialogs. Fonts load locally without Google Fonts or another font service. The original SIL Open Font License and copyright notice are included in `cartoptimizer/web/Amiri-OFL.txt`; source: https://github.com/aliftype/amiri/releases/tag/1.003.

## Downloadable Windows and Android release

The [GitHub Releases page](https://github.com/mojtaba-brz/ShopingCartOptimizer/releases) provides a direct APK, a portable Windows x64 EXE and SHA256SUMS. The EXE includes Python and the Playwright driver; it uses installed Chrome or Edge for background retrieval. Launch it to open the local web interface, and close its console window to exit. It also accepts `--check-browser` for a local browser-driver diagnostic. Windows downloads are not publisher-code-signed, and the APK is a test-signed build.

The downloadable-release workflow builds and tests the real one-file EXE from an empty working directory before publishing. Publication runs only on `main`, first creating a draft, attaching both binaries/checksums, then publishing as a prerelease. Existing releases/assets are not overwritten. The Android run/hash are pinned to the verified 0.15.3 APK in the workflow; update them alongside the app version for a later release.
