# Cartwise for Android 0.2.2

Android 8.0+ (API 26) and an updated Android System WebView. The planner and
optimizer run on the phone; live product lookup needs an internet connection.

## Use live Digikala prices

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
