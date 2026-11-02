package com.mojtababrz.cartoptimizer;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.nio.charset.StandardCharsets;

/** Official site, its location/map picker and live price reading. No JS interfaces. */
public final class DigikalaActivity extends Activity {
    private WebView shop;
    private TextView status;
    private Button read;
    private String captureScript;
    private String itemId;
    private boolean locationOnly;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;
    private DeliveryChoice deliveryChoice;
    private static final int LOCATION_REQUEST = 31;

    static boolean retailer(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && uri.getUserInfo() == null
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && ("www.digikala.com".equals(uri.getHost()) || "digikala.com".equals(uri.getHost()));
    }
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        deliveryChoice=new DeliveryChoice(this);
        itemId = getIntent().getStringExtra("item_id");
        locationOnly = getIntent().getBooleanExtra("location_only", false);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(245,246,241));
        root.setPadding(0, 0, 0, 0);
        setContentView(root);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(this);
        Button back = new Button(this); back.setText("← Planner"); back.setOnClickListener(v -> finish());
        toolbar.addView(back);
        read = new Button(this); read.setText(locationOnly ? "Use this location" : "Read products");
        read.setOnClickListener(v -> capture()); toolbar.addView(read);
        Button home = new Button(this); home.setText("Location");
        home.setOnClickListener(v -> RetailerSession.navigate(shop,"https://www.digikala.com/supermarket/")); toolbar.addView(home);
        root.addView(toolbar);
        status = new TextView(this); status.setPadding(16,8,16,8);
        status.setText(RetailerSession.mode(deliveryChoice.mode()) ? "Digikala live · Reusing your browsing session. Use Location only to change the delivery area." : "Digikala live · Select delivery address and instant/scheduled delivery on the site. You can search an address or use its map."); root.addView(status);
        shop = RetailerSession.acquire(this);
        root.addView(shop, new LinearLayout.LayoutParams(-1,0,1));
        WebSettings s = shop.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false); s.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(shop, false);
        shop.setWebViewClient(new WebViewClient() {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                RetailerSession.observe(request);return null;
            }
            @Override public boolean onRenderProcessGone(WebView view,android.webkit.RenderProcessGoneDetail detail) {
                RetailerSession.discard();shop=null;read.setEnabled(false);
                status.setText("Digikala's browser stopped. Return to the planner and open it again. Your saved planner remains available.");return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                if (retailer(request.getUrl())) return false;
                status.setText("This link leaves Digikala. Return to the supermarket to read prices.");
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                if (!retailer(Uri.parse(url))) return;
                status.setText(locationOnly ? "Choose your address/map and delivery mode, then tap Use this location." : "Check the delivery address at the top. Search for your item, wait for prices, then tap Read products. No retailer cart is changed by reading.");
            }
            @Override public void onReceivedError(WebView view, android.webkit.WebResourceRequest req, android.webkit.WebResourceError error) {
                if (req.isForMainFrame()) status.setText("Could not reach Digikala. Check your connection and try Location again.");
            }
        });
        shop.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!retailer(Uri.parse(origin))) { callback.invoke(origin,false,false); return; }
                if(deliveryChoice.locationApproved() && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin,true,true);return;
                }
                new AlertDialog.Builder(DigikalaActivity.this).setMessage("Share this device's location with Digikala to choose the delivery area? You can also search an address or move the map without GPS.")
                    .setPositiveButton("Use location", (d,w) -> {
                        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {deliveryChoice.approveLocation();callback.invoke(origin,true,true);}
                        else { locationCallback=callback; locationOrigin=origin; requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST); }
                    }).setNegativeButton("Use map instead", (d,w) -> callback.invoke(origin,false,false))
                    .setOnCancelListener(d -> callback.invoke(origin,false,false)).show();
            }
        });
        try (java.io.InputStream input=getAssets().open("digikala-capture.js")) {
            captureScript=new String(readScript(input), StandardCharsets.UTF_8);
        } catch (Exception error) { status.setText("Product reader is unavailable. Return to the planner."); read.setEnabled(false); }
        String query=getIntent().getStringExtra("query");
        String url="https://www.digikala.com/supermarket/";
        if (!locationOnly && query != null && !query.trim().isEmpty()) url += "search/shop?q="+Uri.encode(query);
        RetailerSession.navigate(shop,url);
    }
    private byte[] readScript(java.io.InputStream input) throws java.io.IOException {
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
        byte[] buffer=new byte[8192];int n;
        while((n=input.read(buffer))!=-1) out.write(buffer,0,n);
        return out.toByteArray();
    }
    private void capture() {
        if (captureScript==null || !retailer(Uri.parse(shop.getUrl()==null?"":shop.getUrl()))) return;
        read.setEnabled(false);
        shop.evaluateJavascript(captureScript, raw -> {
            if(isFinishing() || isDestroyed() || shop==null) return;
            read.setEnabled(true);
            try {
                Object parsed=new JSONTokener(raw).nextValue();
                if (!(parsed instanceof JSONObject)) throw new IllegalArgumentException();
                JSONObject data=(JSONObject)parsed;
                if (data.toString().getBytes(StandardCharsets.UTF_8).length>500_000) throw new IllegalArgumentException();
                String location=data.optString("location","");
                if (location.trim().isEmpty()) { status.setText("Select a delivery address on Digikala first. Its header must show ارسال به … before importing."); return; }
                if (!locationOnly && !data.isNull("error")) { status.setText(data.optString("error")); return; }
                String observed=data.optString("shipment_type","");
                if(!RetailerSession.mode(observed)) observed=RetailerSession.observedMode();
                // Reuse the choice only when the actual retailer location and mode match.
                if(!locationOnly && deliveryChoice.matches(location,observed)) {
                    completeCapture(data,observed);return;
                }
                final String currentMode=observed;
                LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
                TextView label=new TextView(this); label.setText("Delivery location shown by Digikala:\n"+location+"\n\nWhich delivery mode is selected on the site?"); form.addView(label);
                android.widget.RadioGroup modes=new android.widget.RadioGroup(this);
                android.widget.RadioButton instant=new android.widget.RadioButton(this); instant.setText("Instant / ارسال فوری"); instant.setId(101); modes.addView(instant);
                android.widget.RadioButton scheduled=new android.widget.RadioButton(this); scheduled.setText("Scheduled / ارسال زمان‌دار"); scheduled.setId(102); modes.addView(scheduled); form.addView(modes);
                if(RetailerSession.mode(currentMode)) modes.check("on_demand".equals(currentMode)?101:102);
                // First selection, explicit change, or a different retailer context needs confirmation.
                AlertDialog dialog=new AlertDialog.Builder(this).setTitle(locationOnly ? "Use delivery location" : "Read live products")
                    .setView(form).setPositiveButton("Continue",null).setNegativeButton("Cancel",null).create();
                dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(b -> {
                    if (modes.getCheckedRadioButtonId()==-1) { label.setText("Choose the delivery mode currently selected on Digikala before continuing.\n"+location); return; }
                    try {
                        String selectedMode=modes.getCheckedRadioButtonId()==101?"on_demand":"scheduled";
                        if(RetailerSession.mode(currentMode) && !currentMode.equals(selectedMode)) {
                            label.setText("The retailer is currently showing "+("scheduled".equals(currentMode)?"scheduled":"instant")+" delivery. Select that mode here, or change it on Digikala first.");return;
                        }
                        deliveryChoice.remember(location,selectedMode);
                        completeCapture(data,selectedMode);dialog.dismiss();
                    } catch(Exception error) { status.setText("Could not read product data. Try another search.");dialog.dismiss(); }
                }));dialog.show();
            } catch(Exception error) { status.setText("Could not read this page. Open a product search and try again."); }
        });
    }
    private void completeCapture(JSONObject data,String mode) throws org.json.JSONException {
        data.put("shipment_type",mode);data.remove("delivery_modes");
        data.put("item_id",itemId==null?"":itemId);data.put("location_only",locationOnly);
        if(locationOnly) data.put("products",new org.json.JSONArray());
        CookieManager.getInstance().flush();
        setResult(RESULT_OK,new Intent().putExtra("live_data",data.toString()));finish();
    }
    @Override protected void onPause() {super.onPause();CookieManager.getInstance().flush();}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(code,permissions,grants);
        if(code==LOCATION_REQUEST && locationCallback!=null) {
            boolean allowed=checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
            if(allowed) deliveryChoice.approveLocation();
            locationCallback.invoke(locationOrigin,allowed,allowed);locationCallback=null;locationOrigin=null;
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); }
    @Override public void onBackPressed() { if(shop!=null && shop.canGoBack()) shop.goBack();else finish(); }
    @Override protected void onDestroy() { if(locationCallback!=null) locationCallback.invoke(locationOrigin,false,false); if(shop!=null) RetailerSession.release(this,shop);super.onDestroy(); }
}
