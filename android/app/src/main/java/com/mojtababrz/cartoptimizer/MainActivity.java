package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int IMPORT_JSON = 10, EXPORT_JSON = 11, LIVE_DIGIKALA = 12, AUTO_DIGIKALA = 13;
    private static final int MAX_BYTES = 1_000_000;
    private static final String HOST = "appassets.androidplatform.net";
    private WebView webView;
    private String pendingExport;
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private final ExecutorService aiWorker = Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicBoolean aiBusy = new java.util.concurrent.atomic.AtomicBoolean(false);

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(245, 246, 241));
        webView = new WebView(this);
        frame.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        if (Build.VERSION.SDK_INT >= 35) {
            frame.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout() | android.view.WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            frame.requestApplyInsets();
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.addJavascriptInterface(new Bridge(), "CartwiseAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                WebResourceResponse response = trusted(uri) ? loader.shouldInterceptRequest(uri) : null;
                if (response != null) return response;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", null,
                    new ByteArrayInputStream("Only packaged app resources are allowed".getBytes(StandardCharsets.UTF_8)));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!request.isForMainFrame()) return true;
                if (trusted(uri)) return false;
                if ("https".equals(uri.getScheme())) openBrowser(uri);
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String text, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(text)
                    .setPositiveButton("Continue", (d, w) -> result.confirm())
                    .setNegativeButton("Cancel", (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel()).show();
                return true;
            }
        });
        webView.loadUrl("https://" + HOST + "/assets/index.html");
    }

    private boolean trusted(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }
    private void openBrowser(Uri uri) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException error) { toast("Install a browser to open Digikala links."); }
    }
    private void toast(String text) { runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show()); }

    private final class Bridge {
        @JavascriptInterface public void openDigikala(String itemId, String query, boolean locationOnly) {
            if (itemId == null || itemId.length() > 100 || query == null || query.length() > 300) return;
            runOnUiThread(() -> startActivityForResult(new Intent(MainActivity.this, DigikalaActivity.class)
                .putExtra("item_id",itemId).putExtra("query",query).putExtra("location_only",locationOnly), LIVE_DIGIKALA));
        }

        @JavascriptInterface public void findAutomatically(String items) {
            if(items==null || items.getBytes(StandardCharsets.UTF_8).length>20000) return;
            runOnUiThread(() -> startActivityForResult(new Intent(MainActivity.this, DigikalaActivity.class)
                .putExtra("automatic_items",items), AUTO_DIGIKALA));
        }
        @JavascriptInterface public boolean suggestOffline(String payload, String items) {
            if(payload==null||items==null||payload.getBytes(StandardCharsets.UTF_8).length>500000||items.getBytes(StandardCharsets.UTF_8).length>20000||!aiBusy.compareAndSet(false,true))return false;
            aiWorker.execute(() -> {
                String result;
                try {result=new OfflineMatcher(getApplicationContext()).suggest(payload,items);}
                catch(Throwable e) {result="{\"error\":\"هوش مصنوعی آفلاین آماده نشد؛ اتصال برای دریافت اولیه مدل، فضای خالی و حافظه گوشی را بررسی کنید.\"}";}
                final String json=result;
                runOnUiThread(() -> {if(!isFinishing() && webView!=null) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('cartwise:ai-results',{detail:{items:"+JSONObject.quote(items)+",result:"+JSONObject.quote(json)+"}}));",null);});
                aiBusy.set(false);
            });
            return true;
        }
        @JavascriptInterface public void pickSnapshot() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(intent, IMPORT_JSON); }
                catch (ActivityNotFoundException error) { toast("No document picker is available."); }
            });
        }
        @JavascriptInterface public void saveJSON(String name, String content) {
            if (content == null || content.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) { toast("Export exceeds 1 MB."); return; }
            final String filename = "cartoptimizer-plan.json".equals(name) ? name : "cartoptimizer-snapshot.json";
            runOnUiThread(() -> {
                pendingExport = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(intent, EXPORT_JSON); }
                catch (ActivityNotFoundException error) { pendingExport = null; toast("No document picker is available."); }
            });
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == AUTO_DIGIKALA) {
            if(resultCode==RESULT_OK && data!=null) {
                String json=data.getStringExtra("auto_data");
                if(json!=null && json.getBytes(StandardCharsets.UTF_8).length<=500_000)
                    webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('cartwise:auto-results',{detail:"+JSONObject.quote(json)+"}));",null);
            } else webView.evaluateJavascript("window.dispatchEvent(new Event('cartwise:auto-cancelled'));",null);
            return;
        }
        if (requestCode == LIVE_DIGIKALA) {
            if (resultCode == RESULT_OK && data != null) {
                String json = data.getStringExtra("live_data");
                if (json != null && json.getBytes(StandardCharsets.UTF_8).length <= 500_000)
                    webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('cartwise:live',{detail:" + JSONObject.quote(json) + "}));", null);
            }
            return;
        }
        if (resultCode != RESULT_OK || data == null || data.getData() == null) { pendingExport = null; return; }
        Uri uri = data.getData();
        if (requestCode == EXPORT_JSON) {
            String content = pendingExport; pendingExport = null;
            if (content == null) { toast("Please export again."); return; }
            files.execute(() -> {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    if (out == null) throw new IllegalStateException();
                    out.write(content.getBytes(StandardCharsets.UTF_8)); toast("JSON file saved.");
                } catch (Exception error) { toast("Could not save the JSON file. Try another location."); }
            });
        } else if (requestCode == IMPORT_JSON) {
            files.execute(() -> {
                try (InputStream input = getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    if (input == null) throw new IllegalStateException();
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (out.size() + count > MAX_BYTES) throw new IllegalArgumentException();
                        out.write(buffer, 0, count);
                    }
                    String json = out.toString(StandardCharsets.UTF_8.name());
                    String script = "window.dispatchEvent(new CustomEvent('cartwise:import',{detail:" + JSONObject.quote(json) + "}));";
                    runOnUiThread(() -> { if (!isFinishing()) webView.evaluateJavascript(script, null); });
                } catch (Exception error) { toast("Could not read the snapshot. Use a JSON file smaller than 1 MB."); }
            });
        }
    }
    @Override public void onBackPressed() {
        webView.evaluateJavascript("document.querySelector('.nav.active').dataset.tab", value -> {
            if (!"\"list\"".equals(value)) webView.evaluateJavascript("document.querySelector('[data-tab=list]').click()", null);
            else new AlertDialog.Builder(this).setMessage("Close Cartwise? Your saved workspace stays on this device.")
                .setPositiveButton("Close", (d, w) -> finish()).setNegativeButton("Stay", null).show();
        });
    }
    @Override protected void onDestroy() {
        files.shutdown();
        aiWorker.shutdownNow();
        if (webView != null) { webView.removeJavascriptInterface("CartwiseAndroid"); webView.destroy(); }
        super.onDestroy();
    }
}
