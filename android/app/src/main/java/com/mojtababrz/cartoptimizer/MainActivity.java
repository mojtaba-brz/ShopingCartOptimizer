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
    private static final int IMPORT_JSON = 10, EXPORT_JSON = 11, LIVE_DIGIKALA = 12, AUTO_DIGIKALA = 13, CHECKOUT_DIGIKALA = 14, PREPARE_DELIVERY = 15;
    private static final int MAX_BYTES = 1_000_000;
    private static final String HOST = "appassets.androidplatform.net";
    private WebView webView;
    private String pendingExport;
    private boolean preflightStarted;
    private final ExecutorService files = Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        RetailerSession.initialize(this);
        preflightStarted=savedInstanceState!=null&&savedInstanceState.getBoolean("delivery-preflight-started",false);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
        files.execute(() -> {
            SearchResult.cleanup(MainActivity.this);
            for (String name : new String[]{"qwen2.5-1.5b-int8.litertlm", "qwen3-1.7b-int4.litertlm", "qwen3-0.6b-mixed-int4.litertlm", "offline-model.download"})
                new java.io.File(getFilesDir(), name).delete();
        });
        FrameLayout frame = new FrameLayout(this);frame.setLayoutDirection(android.view.View.LAYOUT_DIRECTION_RTL);
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
            @Override public void onPageFinished(WebView view,String url){
                if(preflightStarted||!trusted(Uri.parse(url))||getIntent().getBooleanExtra("skip_delivery_preflight",false))return;
                preflightStarted=true;
                view.postDelayed(()->{if(!isFinishing()&&!isDestroyed())startActivityForResult(new Intent(MainActivity.this,DigikalaActivity.class).putExtra("prepare_location",true),PREPARE_DELIVERY);},700);
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if(trusted(uri)&&"/assets/product-image".equals(uri.getPath())&&"GET".equals(request.getMethod()))return ProductImages.read(uri.getQueryParameter("u"));
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
                    .setPositiveButton("ادامه", (d, w) -> result.confirm())
                    .setNegativeButton("انصراف", (d, w) -> result.cancel())
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
        catch (ActivityNotFoundException error) { toast("برای بازکردن پیوندها یک مرورگر نصب کنید."); }
    }
    private void toast(String text) { runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show()); }

    private final class Bridge {
        @JavascriptInterface public void setAppearance(String theme) {
            if("simple".equals(theme)||"modern".equals(theme)||"traditional".equals(theme))getSharedPreferences("cartwise-preferences",MODE_PRIVATE).edit().putString("theme",theme).apply();
        }
        @JavascriptInterface public String savedDelivery() {
            try {DeliveryChoice c=new DeliveryChoice(MainActivity.this);return new JSONObject().put("location",c.location()).put("coordinates",c.coordinates()).put("shipment_type",c.mode()).put("updated_at",c.updatedAt()).toString();}catch(Exception e){return "{}";}
        }
        @JavascriptInterface public void chooseDelivery(){runOnUiThread(()->startActivityForResult(new Intent(MainActivity.this,DigikalaActivity.class).putExtra("app_picker",true),LIVE_DIGIKALA));}
        @JavascriptInterface public void readCheckout() {
            runOnUiThread(()->startActivityForResult(new Intent(MainActivity.this,DigikalaActivity.class).putExtra("checkout_only",true),CHECKOUT_DIGIKALA));
        }
        @JavascriptInterface public void clearPrivateData() {
            runOnUiThread(()->new AlertDialog.Builder(MainActivity.this).setTitle("پاک‌کردن اطلاعات این گوشی")
                .setMessage("لیست خرید، آدرس ذخیره‌شده، تنظیمات و نشست دیجی‌کالاجت از این برنامه پاک شوند؟ فایل‌های پشتیبان شما حذف نمی‌شوند.")
                .setPositiveButton("پاک شود",(dialog,which)->{
                    android.webkit.GeolocationPermissions.getInstance().clearAll();ProductImages.clear();
                    SearchResult.clear(MainActivity.this);getSharedPreferences("cartwise-preferences",MODE_PRIVATE).edit().clear().apply();
                    RetailerSession.discard();new DeliveryChoice(MainActivity.this).clear();
                    android.webkit.CookieManager.getInstance().removeAllCookies(ok->{android.webkit.WebStorage.getInstance().deleteAllData();webView.evaluateJavascript("localStorage.clear();location.reload()",null);});
                }).setNegativeButton("انصراف",null).show());
        }
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
        @JavascriptInterface public void pickSnapshot() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(intent, IMPORT_JSON); }
                catch (ActivityNotFoundException error) { toast("انتخاب‌گر فایل در دسترس نیست."); }
            });
        }
        @JavascriptInterface public void saveJSON(String name, String content) {
            if (content == null || content.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) { toast("حجم پشتیبان بیش از یک مگابایت است."); return; }
            final String filename = "cartoptimizer-plan.json".equals(name) ? name : "cartoptimizer-snapshot.json";
            runOnUiThread(() -> {
                pendingExport = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                    .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(intent, EXPORT_JSON); }
                catch (ActivityNotFoundException error) { pendingExport = null; toast("انتخاب‌گر فایل در دسترس نیست."); }
            });
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == AUTO_DIGIKALA) {
            if(resultCode==RESULT_OK&&data!=null){files.execute(()->{
                try{String json=SearchResult.read(MainActivity.this,data);runOnUiThread(()->{if(!isFinishing()&&!isDestroyed()&&webView!=null)webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('cartwise:auto-results',{detail:"+JSONObject.quote(json)+"}));",null);});}
                catch(Exception e){runOnUiThread(()->{if(webView!=null&&!isDestroyed())webView.evaluateJavascript("window.dispatchEvent(new Event('cartwise:auto-cancelled'));",null);});}
            });}else webView.evaluateJavascript("window.dispatchEvent(new Event('cartwise:auto-cancelled'));",null);
            return;
        }
        if(requestCode==CHECKOUT_DIGIKALA) {
            if(resultCode==RESULT_OK&&data!=null){String json=data.getStringExtra("live_data");if(json!=null&&json.getBytes(StandardCharsets.UTF_8).length<=500000)
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('cartwise:checkout',{detail:"+JSONObject.quote(json)+"}));",null);}
            return;
        }
        if (requestCode == LIVE_DIGIKALA || requestCode == PREPARE_DELIVERY) {
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
            if (content == null) { toast("دوباره پشتیبان بگیرید."); return; }
            files.execute(() -> {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    if (out == null) throw new IllegalStateException();
                    out.write(content.getBytes(StandardCharsets.UTF_8)); toast("فایل پشتیبان ذخیره شد.");
                } catch (Exception error) { toast("ذخیره پشتیبان انجام نشد؛ پوشه دیگری را انتخاب کنید."); }
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
                    runOnUiThread(() -> { if (!isFinishing() && !isDestroyed() && webView!=null) webView.evaluateJavascript(script, null); });
                } catch (Exception error) { toast("فایل خوانده نشد؛ یک فایل پشتیبان کوچک‌تر از یک مگابایت انتخاب کنید."); }
            });
        }
    }
    @Override protected void onSaveInstanceState(Bundle out){out.putBoolean("delivery-preflight-started",preflightStarted);super.onSaveInstanceState(out);}
    private void handleBack() {
        webView.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return 'dialog';}return document.querySelector('.nav.active').dataset.tab})()", value -> {
            if("\"dialog\"".equals(value))return;
            if (!"\"list\"".equals(value)) webView.evaluateJavascript("document.querySelector('[data-tab=list]').click()", null);
            else new AlertDialog.Builder(this).setMessage("از سبدچین خارج می‌شوید؟ لیست خرید روی این گوشی ذخیره می‌ماند.")
                .setPositiveButton("خروج", (d, w) -> finish()).setNegativeButton("ماندن", null).show();
        });
    }
    @Override public void onBackPressed() {handleBack();}
    @Override protected void onDestroy() {
        files.shutdown();
        if (webView != null) {
            // WebView.destroy requires removal from the view system first.
            if(webView.getParent() instanceof android.view.ViewGroup)
                ((android.view.ViewGroup)webView.getParent()).removeView(webView);
            webView.stopLoading();webView.removeJavascriptInterface("CartwiseAndroid");webView.destroy();webView=null;
        }
        super.onDestroy();
    }
}
