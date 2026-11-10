# Cartwise for Android 0.12.0


The app is branded **سبدچین**, with Persian RTL layout, Persian numbers/toman,
three locally saved themes, a privacy explanation and local-data deletion.
Automatic choices are ranked by displayed price per kilogram/litre/item,
not by package cost or basket subtotal. Unlike dimensions are kept separate;
explicit requested amounts determine how many packages cover the target.
A visual choice sheet lists every captured match in ascending unit-price order,
with image, merchant, package size, observed normal price and Amazing badge.
All options are ranked before display pagination; only render batches are limited.
Visible monetary rows and correction notices can be read from the selected
supermarket and retailer basket. Basket fees are observations, not universal
rules: a retailer total is labelled matching only for an exact readable
product-title/quantity match; missing or ambiguous data remains unverified.
Catalog coordinates and delivery mode can restore a saved address after process
restart when fresh retailer requests match. Old labels alone are never proof.
Android release preparation is documented in [release/README-fa.md](../release/README-fa.md).

The Android planner searches Digikala Jet automatically after the list and delivery
area are supplied. An opaque native progress screen covers the retailer page while
it remains measured for lazy-loading. It reports completed list items, current
query, captured products/stores and scrolling steps, without claiming full catalog
coverage. At app startup, a dedicated preflight restores the user's confirmed Jet address
preference and coordinate pair before the first catalog query. Only the address
subfield of Jet's documented-in-source persisted schema is read/written inside its
own WebView; the native app stores only the selected label and coordinates. User,
credential and account state is never exported or overwritten. This schema is based
on the publicly served Jet x-app bundle observed on 2026-11-08 and needs maintenance
if the retailer changes it. First use requires a location choice; an old hypermarket
label with no usable coordinates cannot be treated as a confirmed Jet location.
A retained session, fresh matching catalog coordinates or an exact,
unambiguous saved address in the public picker can restore location after restart.
An expired/missing/ambiguous address needs the separate address/map step. No new
address is created automatically. Product photos are fetched from approved public
retailer image CDNs without login cookies, authorization or referrer headers.
Unknown store, image, normal price and package size are stated explicitly.
Stock, promotion quotas and final fees are not inferred. For multiple promotional
packages the estimate assumes one discounted package and the rest at the normal
price; the observed checkout is reported separately.

Matching runs locally using Persian/Arabic character and digit normalization,
known spelling variants, a small grocery category dictionary and conservative
one-character typo checks. Exact matches are selected automatically; synonyms
and typos are offered for review. Known brands and numeric constraints must
match exactly; unrelated categories and conflicting milk flavours/fat levels
are excluded. This is a limited dictionary, not general language understanding.
There is no LLM runtime, model download, inference service or API key.
Previously cached model weights are removed on app startup after an upgrade.

Search results have not been validated on every phone or delivery area. The
retailer can change its site or prevent complete retrieval.

Android 8.0+ (API 26) and an updated Android System WebView. The planner and
optimizer run on the phone; live product lookup needs an internet connection.

## Legacy manual workflow

The following describes the older manual interface retained in the codebase.
The Android app's default interface uses the automatic flow described above.

1. Add an item to your shopping list.
2. Tap **Choose location / map**. Digikala's own supermarket opens inside the app.
   Select the delivery address using its address search/map. Select instant or
   scheduled delivery on the site. Tap **Use this location** and confirm the mode
   currently selected on the site. GPS is optional; its permission is requested
   only after you choose to use your device's location.
3. Tap **Search Digikala** beside the item. Search if needed and wait for the product prices to load. The search page
   does not need to display an address header. Tap **Read
   products**. The area confirmed in your current session is reused; the app
   shows it above the browser even when the search page hides its address.
   Your browser tab is now reused between searches, keeping Digikala's live
   address/session state. The app remembers your confirmed location and mode;
   later imports reuse them when the retailer still shows the same values.
   Use **Change location / map** when you actually want a different area. An
   unknown or changed delivery mode still needs confirmation. GPS permission is
   reused after approval, subject to the phone's Android permission settings.
4. Back in the planner, select acceptable brands and package sizes with **Add
   option**. Displayed normal/discounted prices fill automatically in rials and
   are shown in toman. Read-only imports never add to a retailer cart.
5. Under **Coupons & delivery**, select the imported delivery group. Enter its
   checkout delivery fee, service fee, minimum order and free-delivery threshold,
   tick the verification box, and save. Add any coupon and its actual terms.
6. Find the best cart. Refresh live prices after 30 minutes. Changing delivery
   location or mode marks previously imported live prices for refresh.

## What the live reader knows

It reads **rendered product cards** on Digikala's current `/supermarket/` site:
product name, current price and crossed-out normal price. The selected delivery area is bound to the current retailer tab. Product pages
can omit the address header: the reader reuses the area previously confirmed
in that same session and shows it in Cartwise's own delivery banner. It never
treats an old saved label alone as proof of the current retailer area. Explicit
address changes and changed catalog coordinates invalidate that session binding.
Digikala stores the selected address/session in its own WebView cookies/storage.
The planner does not read its login tokens, cookies, account, or checkout data.

Product cards do not publish remaining stock or promotional quotas. Every live
product is therefore capped at **one unit across all carts**, with a maximum of
one promotional unit. This is a conservative planning cap, not a reported stock
count. Multiple alternatives can fulfill larger quantities. The same product
cannot be assigned twice to different list items to multiply its cap. For
reviewed larger quotas, remove the live option and create a manual option with
the verified terms. Coupon use limits and shared promotion caps still apply.

Delivery charges, order thresholds, account coupons and exact promotional quotas
are **not automatically retrieved**. Unknown delivery charges never silently
become zero: planning is blocked until checkout rules are explicitly reviewed.
Totals are estimates from the displayed product prices and supplied rules;
verify the checkout before paying. Import/export keeps pricing snapshots; live
verification metadata stays on the device, so imported live snapshots may need
refreshing. Resetting a planner workspace does not sign you out of Digikala.

The adapter currently recognizes Digikala's supermarket card markup. A retailer
layout change, empty search, region restriction, failed connection or site
verification can prevent reading. Errors are shown; invented prices are never
substituted. The bundled demo remains explicitly invented and works offline.

## Security and privacy

The packaged planner uses `WebViewAssetLoader` at the appassets origin. Only it
has the narrow native bridge for document import/export and opening Digikala.
The separate, non-exported retailer activity has **no JavaScript interfaces**.
The retailer tab is retained for the current app process using a mutable
context; activity callbacks are detached when returning to the planner. Only a
short confirmed address label, delivery mode and explicit GPS approval are
stored by the native app. Read-only catalog request observation checks the
delivery-mode header; it does not read authorization headers. Its native Read
button evaluates the bundled DOM reader; the retailer cannot
call native methods. Imports are bounded and revalidated, and rendered as text.
Top-level navigation is restricted to HTTPS Digikala origins, TLS errors are not
bypassed, file/content access is off, and mixed content is blocked. Location is
shared with Digikala only after a native explanation and Android permission;
manual address/map selection does not require GPS. No storage permissions or
server are required. Clear Android app data to remove both saved workspaces and
the retailer's session, or sign out on Digikala.

## Install / update

Download `Cartwise-Android-0.2.2-debug.apk` and open it. Allow installation from
that browser/file manager when Android asks. This is a signed development build,
not a Play Store release. The package ID is `com.mojtababrz.cartoptimizer`.

**Export your existing workspace before installing.** Earlier builds used fresh debug keys, so Android may require uninstalling the
previous version before this APK can be installed. Development builds currently use a fresh signing key on each runner. Uninstalling removes local data. Reimport your exported snapshot.
A stable private release-signing key is needed for regular in-place updates.

## Build and validate

JDK 17, Gradle 8.9, Android platform/build tools 35:

```bash
python -m unittest discover -v
node android/tests/live-reader.cjs
cd android
gradle assembleDebug assembleDebugAndroidTest
```

The Android APK workflow builds and verifies the signed APK and runs emulator
tests covering the offline demo, live import/fee checks/location invalidation,
workspace restoration, origin restrictions and the bridge-free DOM reader, plus consecutive searches
and activity recreation preserving the retailer tab and skipping repeated
location confirmations.
Fixtures exercise the import flow without depending on external availability.
Real search and price-card markup have also been inspected on the public site;
GPS permission, the retailer's full map and delivery coverage still depend on
your phone, connection and Digikala's current service area.

The Android regression suite includes the complete native handoff: select and
confirm a delivery area, search on a page with no address header or delivery-mode
controls, tap Read products, accept a product in the planner, review its delivery
rules and calculate the cart. A separate negative test rejects a headerless page
when only an old saved choice exists and the retailer session is unconfirmed.

Retailer regression pages are served as intercepted HTTPS responses inside the
test APK. They have unique document markers and retain the native URL and page
lifecycle, so tests cannot accidentally read the previous page or a data URL.

## Jet integration validation

The live Jet search UI was inspected on 2026-11-08: `/search/v2/result?q=…` groups
products under merchant headings, and “مشاهده همه” opens `/search/shop?q=…&shopId=…`.
The adapter extracts the visible heading outside product and navigation buttons;
store-specific pages inherit only the name matched to their current shopId.
Every discovered merchant's full result page is scrolled before returning to the
global search for more merchants. Limits: 40 merchants, 1,000 offers and five minutes
per requested item; reaching a bound is reported as incomplete, never full coverage.
A user-supplied account-transfer URL must never be embedded in the app or logs.

## Location recognition in 0.9.2

A committed Jet `defaultAddress.addressAddress` or registered account address is
read with its validated coordinates. A guest fallback carrying only name/title is
not accepted automatically. Guest map selections may have no `addressName`; the
UI can show “آدرس انتخابی” while the full address is already committed. This
placeholder, a specific click event, cached network activity and the old route
are not required for recognition. Visible map/picker controls still block return;
a stale add-address URL without an editor does not. Two stable observations are
required. A user-initiated change disables automatic restoration and invalidates
pending callbacks; a newly configured service choice is never replaced by an old
app bookmark. The label and point are stored atomically.

Coverage includes headerless delayed guest registration, cached account selection
with string coordinates and no catalog request, closing the picker, process
restart, preservation of a changed service address, and late old requests. Tests
use deterministic Jet fixtures; inspecting the live cloud map on 2026-11-08 did
not complete a map selection because its confirm control remained disabled. No
claim of live validation on the owner's phone is made.

## Address selection without GPS (0.9.2)

The native picker sends the entered query to Jet's public `GET /map/search/`, then validates the chosen point using `GET /map/reverse/no-modal/`. It sends no account credentials or cookies. Missing/false coverage, malformed responses and failed requests cannot confirm an address. Cancellation and query generations reject late callbacks. The selection is applied to the address preference before Jet initializes, then reread from the loaded page before the app remembers it. The map is optional, opens without a synthetic MID route, and has a native exit. Closed panels clipped/transformed out of view are ignored.

Tests cover live public address lookup/range from Android, native confirmation and hydration, out-of-order search, outside-service results, cancellation during verification, native map exit, and kept-mounted closed-map recognition. Actual phone and authenticated retailer checkout validation remains owner testing.
