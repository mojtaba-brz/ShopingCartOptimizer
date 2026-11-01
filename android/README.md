# Cartwise for Android

An installable Android version of the Digikala supermarket cart planner. It runs
the responsive GUI and pricing calculations **on the phone**, without Python,
a PC, an account or a server.

## Install

Use the supplied `Cartwise-Android-0.1.0-debug.apk`. Open it on your Android phone
and allow installation from the browser/file manager when Android asks. This is
a signed development APK, distributed outside Google Play. Minimum OS:
**Android 8.0 (API 26)** with an up-to-date Android System WebView / Chrome.

The APK supports all CPU architectures because it contains no native CPU code.
The app name is **Cartwise**; package ID is `com.mojtababrz.cartoptimizer`.

## What works

- Create shopping lists and acceptable product alternatives; Persian names work.
- Enter and review normal/promotional prices, promotional quotas and stock.
- Configure coupons, delivery fees, order minimums, free-delivery thresholds and
  up to three carts.
- Optimize offline and inspect the full price breakdown in toman.
- Persist the workspace in the app's private WebView storage.
- Import snapshots with Android's document picker; export snapshots and plans
  with Android's Save dialog. Desktop and Android use the same JSON contract.
- Open Digikala product/store links in the phone's external browser.

No app network or broad storage permissions are requested. Clearing the app's
data or uninstalling deletes its private workspace; export a backup first.

This first Android version uses **reviewed snapshots**, not live Digikala search,
login or checkout. Read current prices in Digikala, choose your location there,
and enter the rules here. The bundled demo is clearly labelled as invented.

## Architecture

The Android container is Java plus AndroidX WebKit. It serves only packaged
assets at `https://appassets.androidplatform.net/assets/` using
`WebViewAssetLoader`. File/content access, mixed content and arbitrary WebView
navigation are disabled; external HTTPS links open in the browser. The JavaScript
bridge exposes only document import/export and never loads a remote page.

`cartoptimizer/web/engine.js` implements the Python pricing model in JavaScript.
The browser adapts local API calls to this engine inside Android. Desktop still
uses its Python backend. One build task copies the shared GUI assets, preventing
a separate drifting copy of the UI.

The Android engine uses exact integer-rial calculations (including BigInt for
percentage multiplication), enforces the same limits as Python, and yields
periodically so search does not lock the interface. Search has a five-second /
200,000-state budget and clearly distinguishes best-found from proven-optimal
plans.

## Build

Prerequisites: JDK 17, Gradle 8.9, Android SDK platform 35 and build tools 35.0.0.
Android Studio can open this `android` directory; configure Gradle 8.9 if asked.

```bash
cd android
gradle assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`. Debug signing is automatic;
the debug certificate is **not a production publishing identity**. A later APK
built with a different debug key may require uninstalling the older build first.
Export your workspace before uninstalling. A stable private release-signing key
should be configured before regular update distribution.

The `Android APK` GitHub Actions workflow builds and verifies the APK, uploads
`Cartwise-Android-APK` for download, and runs a UI smoke test on an Android 15
emulator. The smoke test loads the demo, checks the 375,000-toman result, then
recreates the activity and verifies that the workspace was saved.

```bash
python -m unittest tests.test_mobile_engine -v
```

The parity test compares 62 fixtures with the Python engine, including randomized
stock, coupons, multiple items/stores, delivery rules and high-value integer-rial
rounding. Android tests live under `app/src/androidTest`.
