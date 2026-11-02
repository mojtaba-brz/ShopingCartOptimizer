> **Android 0.2.0:** The Android app now opens Digikala’s current supermarket
> inside a separate browser screen, including its delivery address/map picker,
> and imports displayed product prices without typing offers. See
> [Android instructions](android/README.md) for usage and current limits.
> Imported products have a conservative one-unit planning cap because the page
> does not publish stock/promotion counts. Delivery rules still require review.

# Shopping Cart Optimizer

A local **Digikala Supermarket** shopping planner with a browser GUI. Enter your shopping list, review product offers, set coupon and delivery terms, then compare complete checkout plans.

## Android app

An offline Android version is included in [`android/`](android/README.md), with
the same shopping-list GUI and pricing rules. Install the downloadable
`Cartwise-Android-0.1.0-debug.apk`; no PC or Python server is needed on the phone.
Requires Android 8.0+ and an up-to-date Android System WebView. Native document
pickers handle JSON import/export. The `Android APK` GitHub Actions workflow
provides a signed APK artifact and an Android emulator smoke test.

**First milestone:** the pricing optimizer and GUI work with reviewed snapshots. Public product-link import is implemented, but live, location-specific Fresh catalog access has **not** been verified. Manual entry and JSON snapshots are supported. The app does not log into Digikala, populate the retailer's cart, or purchase anything.

## Start on Windows

Install **Python 3.10 or newer**, download or clone this repository, then open a terminal in the repository folder:

```powershell
py -m cartoptimizer
```

The GUI opens at **http://127.0.0.1:8765**. No pip packages, Node.js, API keys or paid services are needed to run from the source folder.

On Linux/macOS:

```bash
python3 -m cartoptimizer
```

For a different port, or to avoid automatically opening a browser:

```bash
python -m cartoptimizer --port 8766 --no-browser
```

Optional installation into your own environment: `python -m pip install .`, then `cartoptimizer`. The application itself has no third-party runtime dependencies; installation uses setuptools as a build tool.

## Use the GUI

1. **Shopping list:** add items and required quantities. Persian item names are supported. All offers attached to an item are treated as acceptable alternatives, so check size, brand and quality yourself.
2. **Product offers:** enter a product/seller's normal unit price, promotional price, promotional quantity limit and total stock. Optionally read a public Digikala product URL. Imported metadata needs explicit review; stock and promotional limits are never invented.
3. **Coupons & delivery:** enter the actual delivery/service fee, minimum order, free-delivery threshold and coupon terms shown for your selected location/account. Choose whether thresholds are measured before or after the coupon. Zero is a user input, not a verified free-delivery quote.
4. Set a location/account context and allow one, two or three total carts.
5. **Find the best cart:** compare the final totals and follow the cart purchase order shown. Export the plan if needed.

**Load demo** uses clearly labelled, invented prices. Its best plan costs **375,000 toman** in two carts, versus **420,000 toman** for the best single-cart plan without a coupon. These are regression-test values, not real product prices.

The browser keeps your workspace in local storage. **Export JSON** creates a reusable snapshot; **Import JSON** restores one, including unfinished drafts. Editing saved inputs invalidates the old cart plan. Save or clear edited forms before optimizing. Export a backup before clearing browser data or changing the application port.

## Pricing behavior

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

## Digikala integration status

The adapter reads public `Product` / `Offer` JSON-LD from validated HTTPS Digikala product URLs. It normalizes explicit IRR/IRT prices and rejects aggregate "from" prices, unknown currencies, challenge pages and unsupported schemas. It uses timeouts, response-size limits and restricted redirects.

The Fresh landing page currently exposes a client-rendered shell in this development environment; a trial Fresh search request did not yield a usable product response. No account session, selected delivery location or live checkout quote was available. Consequently:

- Product-link import is **best effort**, not a full supermarket catalog connector.
- The displayed public-page price may already include a promotion. It is only a draft: verify normal price, promotional price, quota, seller and stock in the form.
- Live importing is covered by fixture/mocked tests, **not** a successful end-to-end Fresh price verification.
- The next integration milestone is a location-aware catalog/checkout adapter based on observed, authorized requests and real checkout fixtures.

No browser cookies, login tokens or personal addresses belong in this public repository. The server binds to loopback and rejects unrelated hosts and cross-origin writes.

## Snapshot contract

See [`cartoptimizer/demo.json`](cartoptimizer/demo.json) for a complete example. Metadata records source, capture timestamp (with timezone) and location/account context. Snapshots over one hour old produce a warning. Imports preserve the snapshot timestamp; editing a price does not silently mark all prices as fresh.

- `items`: requested quantities, each with a stable `id`.
- `stores`: fulfilment groups with checkout fees and thresholds.
- `offers`: item/store references, exact seller/product, integer prices, stock, promotion quota/scope and review status.
- `coupons`: store-specific terms and account-wide use count.
- `max_carts`: total permitted checkouts, 1–3.

Do not duplicate the same inventory or account-wide promotion under different offer/group IDs: that would incorrectly create extra stock/allowance. One snapshot describes one purchase context. Stock and quota inputs must mean **remaining available allowance**, accounting for purchases already made outside the plan.

## Development and tests

```bash
python -m unittest discover -s tests -v
node --check cartoptimizer/web/app.js
```

Node is optional and used only for the JavaScript syntax check. Tests exercise pricing rules, account-wide limits, split carts, JSON validation, adapter failure paths and HTTP routes. A deterministic randomized test compares the engine with an independent unit-assignment oracle. GitHub Actions runs the Python suite on Windows and Ubuntu with Python 3.10, 3.12 and 3.13.

```text
cartoptimizer/
  models.py             Validated marketplace-independent snapshot
  optimizer.py          Pricing and bounded cart search
  adapters/digikala.py   Read-only public product metadata importer
  server.py             Local HTTP API and GUI asset server
  web/                  Responsive HTML, CSS and vanilla JavaScript GUI
  demo.json             Invented demonstration snapshot
tests/                  Pricing, adapter and HTTP regression tests
```

## Current limits and next work

- Input limits: 15 items, 50 units per item, 80 offers, 8 coupons, 6 fulfilment groups and 3 carts. Large combinations can reach the default five-second / 200,000-state budget. Best-found results are explicitly labelled and may improve with a stronger solver.
- Model supports a normal price plus one promotional tier and fixed checkout fees. More price tiers, weight-based items, bundle promotions, payment-method offers, expiring coupons, gift credits and account-specific delivery subscriptions need explicit extensions.
- No automatic product equivalence, retailer-cart creation, login, checkout or payment.
- Interface text is English; Persian product names use automatic text direction. A complete Persian interface can be added separately.
- The desktop GUI assets and HTTP endpoints are tested; desktop interactive browser QA was unavailable in the development environment. The Android workflow separately runs an emulator UI smoke test; check its run result for device validation.
- SnappMarket and Tapsi Market can be added through adapters sharing the same normalized model.
