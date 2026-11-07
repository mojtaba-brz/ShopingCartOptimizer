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
import org.json.JSONArray;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONTokener;
import java.nio.charset.StandardCharsets;

/** Official site, its location/map picker and live price reading. No JS interfaces. */
public final class DigikalaActivity extends Activity {
    private WebView shop;
    private TextView status;
    private Button read;
    private String captureScript, checkoutScript;
    private boolean cartOnly, cartReadStarted;
    private String checkoutUrl="";
    private final JSONArray checkoutQuotes=new JSONArray();
    private String itemId;
    private boolean locationOnly, captureNotice;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;
    private DeliveryChoice deliveryChoice;
    private JSONArray autoItems, autoResults;
    private int autoIndex, stableCount;
    private String lastFingerprint="", priorFingerprint="", autoQuery="", scanLocation="", scanMode="";
    private long scanStarted;
    private boolean scanning, sameQuery;
    private JSONArray collectedProducts;
    private java.util.HashSet<String> collectedKeys;
    private int quietScrolls, scrollSteps;
    private final Handler scanHandler=new Handler(Looper.getMainLooper());
    private static final int LOCATION_REQUEST = 31;

    static boolean retailer(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && uri.getUserInfo() == null
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && ("www.digikala.com".equals(uri.getHost()) || "digikala.com".equals(uri.getHost()));
    }
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
        deliveryChoice=new DeliveryChoice(this);
        cartOnly=getIntent().getBooleanExtra("checkout_only",false);
        itemId = getIntent().getStringExtra("item_id");
        String automatic=getIntent().getStringExtra("automatic_items");
        if(automatic!=null) {
            try {
                autoItems=new JSONArray(automatic);
                if(autoItems.length()<1 || autoItems.length()>15) throw new IllegalArgumentException();
                for(int i=0;i<autoItems.length();i++) {
                    JSONObject item=autoItems.getJSONObject(i);String name=item.getString("name"), id=item.getString("id");
                    int qty=item.getInt("quantity");
                    if(name.trim().isEmpty()||name.length()>300||id.trim().isEmpty()||id.length()>100||qty<1||qty>50) throw new IllegalArgumentException();
                }
                autoResults=new JSONArray();
            } catch(Exception error) {setResult(RESULT_CANCELED);finish();return;}
        }
        locationOnly = autoItems!=null ? RetailerSession.deliveryLocation().isEmpty() : getIntent().getBooleanExtra("location_only", false);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);root.setLayoutDirection(android.view.View.LAYOUT_DIRECTION_RTL);
        root.setBackgroundColor(Color.rgb(245,246,241));
        root.setPadding(0, 0, 0, 0);
        setContentView(root);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(this);
        Button back = new Button(this); back.setText("بازگشت به سبدچین"); back.setOnClickListener(v -> finish());
        toolbar.addView(back);
        read = new Button(this); read.setText(autoItems!=null && locationOnly ? "ثبت موقعیت و شروع" : locationOnly ? "ثبت موقعیت" : "خواندن کالاها");
        if(cartOnly)read.setText("خواندن سبد");
        read.setOnClickListener(v -> capture()); toolbar.addView(read);
        Button home = new Button(this); home.setText("تغییر موقعیت");
        home.setOnClickListener(v -> {if(shop!=null) {captureNotice=false;RetailerSession.changingLocation();RetailerSession.navigate(shop,"https://www.digikala.com/supermarket/");updateStatus();}}); toolbar.addView(home);
        root.addView(toolbar);
        status = new TextView(this); status.setPadding(16,8,16,8);
        status.setText(RetailerSession.mode(deliveryChoice.mode()) ? "نشست دیجی‌کالا حفظ شده است؛ فقط برای تغییر آدرس، «تغییر موقعیت» را بزنید." : "آدرس و روش ارسال را در دیجی‌کالا انتخاب کنید. جست‌وجوی آدرس و نقشه در دسترس است."); root.addView(status);
        if(locationOnly && autoItems==null) RetailerSession.changingLocation();
        shop = RetailerSession.acquire(this);
        updateStatus();
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
                if(scanning) {setResult(RESULT_CANCELED);finish();return true;}
                status.setText("مرورگر دیجی‌کالا بسته شد؛ به برنامه برگردید و دوباره تلاش کنید. لیست خرید شما ذخیره است.");return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                if (retailer(request.getUrl())) {RetailerSession.noticeNavigation(request.getUrl());return false;}
                status.setText("این پیوند خارج از دیجی‌کالا است؛ برای خواندن قیمت‌ها به سوپرمارکت برگردید.");
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                if (!retailer(Uri.parse(url))) return;
                updateStatus();
                if(autoItems!=null && locationOnly && !scanning) scanHandler.postDelayed(()->restoreDelivery(0),700);
            }
            @Override public void onReceivedError(WebView view, android.webkit.WebResourceRequest req, android.webkit.WebResourceError error) {
                if (req.isForMainFrame()) status.setText("اتصال به دیجی‌کالا برقرار نشد؛ اینترنت را بررسی و دوباره تلاش کنید.");
            }
        });
        shop.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!retailer(Uri.parse(origin))) { callback.invoke(origin,false,false); return; }
                if(deliveryChoice.locationApproved() && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin,true,true);return;
                }
                new AlertDialog.Builder(DigikalaActivity.this).setMessage("برای انتخاب آدرس، موقعیت گوشی با دیجی‌کالا به اشتراک گذاشته شود؟ بدون دسترسی به موقعیت هم می‌توانید آدرس را جست‌وجو یا نقشه را جابه‌جا کنید.")
                    .setPositiveButton("استفاده از موقعیت گوشی", (d,w) -> {
                        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {deliveryChoice.approveLocation();callback.invoke(origin,true,true);}
                        else { locationCallback=callback; locationOrigin=origin; requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST); }
                    }).setNegativeButton("انتخاب روی نقشه", (d,w) -> callback.invoke(origin,false,false))
                    .setOnCancelListener(d -> callback.invoke(origin,false,false)).show();
            }
        });
        try (java.io.InputStream input=getAssets().open("digikala-capture.js")) {
            captureScript=new String(readScript(input), StandardCharsets.UTF_8);
        } catch (Exception error) { status.setText("خواندن کالاها در دسترس نیست؛ به لیست خرید برگردید."); read.setEnabled(false); }
        try(java.io.InputStream input=getAssets().open("digikala-checkout.js")) {
            checkoutScript=new String(readScript(input),StandardCharsets.UTF_8);
            captureScript="(()=>{const data="+captureScript+";data.checkout="+checkoutScript+";return data;})()";
        }catch(Exception ignored){}
        String query=getIntent().getStringExtra("query");
        String url="https://www.digikala.com/supermarket/";
        if (!locationOnly && query != null && !query.trim().isEmpty()) url += "search/shop?q="+Uri.encode(query);
        if(cartOnly) {
            String saved=getSharedPreferences("digikala-delivery",MODE_PRIVATE).getString("cart-url","");
            if(validCartUrl(saved))url=saved;
            status.setText("سبد دیجی‌کالا را باز کنید؛ قیمت‌ها، هزینه‌ها و پیام‌های اصلاح خوانده می‌شوند. برنامه خریدی ثبت نمی‌کند.");
        }
        if(autoItems!=null && !locationOnly) {
            read.setVisibility(android.view.View.GONE);home.setVisibility(android.view.View.GONE);
            scanLocation=RetailerSession.deliveryLocation();scanMode=RetailerSession.deliveryMode();
            scanning=true;scanHandler.postDelayed(this::nextSearch,500);
        } else RetailerSession.navigate(shop,url);
    }
    private byte[] readScript(java.io.InputStream input) throws java.io.IOException {
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
        byte[] buffer=new byte[8192];int n;
        while((n=input.read(buffer))!=-1) out.write(buffer,0,n);
        return out.toByteArray();
    }
    private void capture() {
        if (captureScript==null || !retailer(Uri.parse(shop.getUrl()==null?"":shop.getUrl()))) return;
        captureNotice=false;read.setEnabled(false);
        shop.evaluateJavascript(captureScript, raw -> {
            if(isFinishing() || isDestroyed() || shop==null) return;
            read.setEnabled(true);
            try {
                Object parsed=new JSONTokener(raw).nextValue();
                if (!(parsed instanceof JSONObject)) throw new IllegalArgumentException();
                JSONObject data=(JSONObject)parsed;
                if (data.toString().getBytes(StandardCharsets.UTF_8).length>500_000) throw new IllegalArgumentException();
                if(data.optBoolean("location_editing",false)) {
                    RetailerSession.changingLocation();status.setText("انتخاب آدرس را تمام کنید؛ سپس به کالاها برگردید.");return;
                }
                if (!locationOnly && !cartOnly && !data.isNull("error")) { status.setText(data.optString("error")); return; }
                rememberCheckout(data);
                String location=DeliveryChoice.label(data.optString("location",""));
                String observed=data.optString("shipment_type","");
                if(!RetailerSession.mode(observed)) observed=RetailerSession.deliveryMode();
                boolean fromSession=location.isEmpty() && !RetailerSession.deliveryLocation().isEmpty();
                if(fromSession) {
                    location=RetailerSession.deliveryLocation();
                    data.put("location",location);data.put("location_source","retained-session");
                } else data.put("location_source","page");
                if(location.isEmpty()) {captureNotice=true;status.setText("یک‌بار آدرس را از «تغییر موقعیت» انتخاب کنید؛ در جست‌وجوهای بعدی حفظ می‌شود.");return;}
                // A missing header does not erase a delivery choice confirmed in this same tab.
                boolean sameSession=location.equals(RetailerSession.deliveryLocation()) && RetailerSession.mode(observed);
                if(!locationOnly && (sameSession || deliveryChoice.matches(location,observed))) {
                    completeCapture(data,observed);return;
                }
                if(autoItems!=null && locationOnly && RetailerSession.mode(observed)) {
                    completeCapture(data,observed);return;
                }
                final String selectedLocation=location;
                final String currentMode=observed;
                LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
                TextView label=new TextView(this); label.setText("آدرس نمایش‌داده‌شده در دیجی‌کالا:\n"+location+"\n\nکدام روش ارسال در فروشگاه انتخاب شده است؟"); form.addView(label);
                android.widget.RadioGroup modes=new android.widget.RadioGroup(this);
                android.widget.RadioButton instant=new android.widget.RadioButton(this); instant.setText("ارسال فوری"); instant.setId(R.id.delivery_instant); modes.addView(instant);
                android.widget.RadioButton scheduled=new android.widget.RadioButton(this); scheduled.setText("ارسال زمان‌دار"); scheduled.setId(R.id.delivery_scheduled); modes.addView(scheduled); form.addView(modes);
                if(RetailerSession.mode(currentMode)) modes.check("on_demand".equals(currentMode)?R.id.delivery_instant:R.id.delivery_scheduled);
                // First selection, explicit change, or a different retailer context needs confirmation.
                AlertDialog dialog=new AlertDialog.Builder(this).setTitle(locationOnly ? "ثبت آدرس تحویل" : "خواندن قیمت‌های روز")
                    .setView(form).setPositiveButton("ادامه",null).setNegativeButton("انصراف",null).create();
                dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(b -> {
                    if (modes.getCheckedRadioButtonId()==-1) { label.setText("روش ارسال فعلی دیجی‌کالا را انتخاب کنید.\n"+selectedLocation); return; }
                    try {
                        String selectedMode=modes.getCheckedRadioButtonId()==R.id.delivery_instant?"on_demand":"scheduled";
                        if(RetailerSession.mode(currentMode) && !currentMode.equals(selectedMode)) {
                            label.setText("روش ارسال فعلی فروشگاه "+("scheduled".equals(currentMode)?"زمان‌دار":"فوری")+" است؛ همان گزینه را انتخاب کنید یا ابتدا آن را در دیجی‌کالا تغییر دهید.");return;
                        }
                        deliveryChoice.remember(selectedLocation,selectedMode);
                        completeCapture(data,selectedMode);dialog.dismiss();
                    } catch(Exception error) { status.setText("اطلاعات کالا خوانده نشد؛ دوباره جست‌وجو کنید.");dialog.dismiss(); }
                }));dialog.show();
            } catch(Exception error) { status.setText("صفحه خوانده نشد؛ جست‌وجوی کالا را باز کنید و دوباره تلاش کنید."); }
        });
    }
    private void updateStatus() {
        if(scanning || captureNotice) return;
        String location=RetailerSession.deliveryLocation();
        if(!location.isEmpty()) status.setText("آدرس تحویل: "+location+" · "+("scheduled".equals(RetailerSession.deliveryMode())?"زمان‌دار":"فوری")+"؛ جست‌وجوی کالا آماده است.");
        else status.setText(locationOnly?"آدرس و روش ارسال را در دیجی‌کالا انتخاب کنید و «ثبت موقعیت» را بزنید.":"آدرس در دیجی‌کالا حفظ می‌شود؛ برای عوض کردن آن «تغییر موقعیت» را بزنید.");
    }
    private void restoreDelivery(int attempt) {
        if(isFinishing()||isDestroyed()||shop==null||!locationOnly||scanning||autoItems==null||captureScript==null)return;
        shop.evaluateJavascript(captureScript,raw->{
            if(isFinishing()||isDestroyed()||shop==null||!locationOnly||scanning)return;
            try {
                Object value=new JSONTokener(raw).nextValue();
                if(value instanceof JSONObject) {
                    JSONObject data=(JSONObject)value;
                    if(data.optBoolean("location_editing",false))return;
                    if(!RetailerSession.deliveryLocation().isEmpty() && RetailerSession.mode(RetailerSession.deliveryMode())) {
                        data.put("location",RetailerSession.deliveryLocation());completeCapture(data,RetailerSession.deliveryMode());return;
                    }
                    String location=DeliveryChoice.label(data.optString("location",""));
                    String mode=data.optString("shipment_type","");
                    if(!RetailerSession.mode(mode))mode=RetailerSession.observedMode();
                    if(deliveryChoice.matches(location,mode)) {completeCapture(data,mode);return;}
                }
            } catch(Exception ignored) {}
            if(attempt<12)scanHandler.postDelayed(()->restoreDelivery(attempt+1),700);
        });
    }
    private void completeCapture(JSONObject data,String mode) throws org.json.JSONException {
        rememberCheckout(data);
        RetailerSession.confirmDelivery(data.optString("location",""),mode);
        deliveryChoice.remember(data.optString("location",""),mode);
        if(autoItems!=null && locationOnly) {
            scanLocation=RetailerSession.deliveryLocation();scanMode=mode;locationOnly=false;scanning=true;
            read.setVisibility(android.view.View.GONE);
            scanHandler.postDelayed(this::nextSearch,500);return;
        }
        data.put("checkout_only",cartOnly);
        data.put("shipment_type",mode);data.remove("delivery_modes");
        data.put("item_id",itemId==null?"":itemId);data.put("location_only",locationOnly);
        if(locationOnly) data.put("products",new org.json.JSONArray());
        CookieManager.getInstance().flush();
        setResult(RESULT_OK,new Intent().putExtra("live_data",data.toString()));finish();
    }
    private String fingerprint(JSONObject data) {
        JSONArray products=data.optJSONArray("products");if(products==null||products.length()==0)return "";
        StringBuilder value=new StringBuilder();
        for(int i=0;i<Math.min(8,products.length());i++) {JSONObject p=products.optJSONObject(i);if(p!=null)value.append(p.optString("title")).append(':').append(p.optLong("regular_price")).append('|');}
        return value.toString();
    }
    private void nextSearch() {
        if(!scanning || isFinishing() || shop==null)return;
        if(!scanLocation.equals(RetailerSession.deliveryLocation()) || !scanMode.equals(RetailerSession.deliveryMode())) {finishAutoError("موقعیت یا روش ارسال تغییر کرد؛ دوباره تلاش کنید.");return;}
        if(autoIndex>=autoItems.length()) {finishAuto();return;}
        JSONObject item=autoItems.optJSONObject(autoIndex);autoQuery=item.optString("query",item.optString("name"));
        status.setText("در حال جست‌وجوی «"+autoQuery+"» ("+java.text.NumberFormat.getInstance(new java.util.Locale("fa")).format(autoIndex+1)+" از "+java.text.NumberFormat.getInstance(new java.util.Locale("fa")).format(autoItems.length())+")…");
        String url=shop.getUrl();String q=url==null?null:Uri.parse(url).getQueryParameter("q");sameQuery=autoQuery.equals(q);
        scanStarted=System.currentTimeMillis();lastFingerprint="";stableCount=0;
        shop.evaluateJavascript(captureScript,raw->{
            if(!scanning || shop==null)return;
            try {Object d=new JSONTokener(raw).nextValue();priorFingerprint=d instanceof JSONObject?fingerprint((JSONObject)d):"";}catch(Exception e){priorFingerprint="";}
            RetailerSession.navigate(shop,"https://www.digikala.com/supermarket/search/shop?q="+Uri.encode(autoQuery));
            scanHandler.postDelayed(this::pollSearch,700);
        });
    }
    private void pollSearch() {
        if(!scanning || isFinishing() || shop==null)return;
        if(!scanLocation.equals(RetailerSession.deliveryLocation()) || !scanMode.equals(RetailerSession.deliveryMode())) {finishAutoError("موقعیت یا روش ارسال تغییر کرد؛ دوباره تلاش کنید.");return;}
        if(System.currentTimeMillis()-scanStarted>20000) {recordSearch(new JSONArray(),"نتیجه قابل خواندن پیدا نشد یا جست‌وجو تمام نشد.");return;}
        String url=shop.getUrl();String query=url==null?null:Uri.parse(url).getQueryParameter("q");
        if(!autoQuery.equals(query)) {scanHandler.postDelayed(this::pollSearch,400);return;}
        shop.evaluateJavascript(captureScript,raw->{
            if(!scanning || shop==null)return;
            try {
                Object obj=new JSONTokener(raw).nextValue();JSONObject data=obj instanceof JSONObject?(JSONObject)obj:null;
                if(data!=null && !data.optBoolean("location_editing",false)) {
                    String location=DeliveryChoice.label(data.optString("location",""));
                    if(!location.isEmpty() && !location.equals(scanLocation)) {finishAutoError("موقعیت نمایش‌داده‌شده تغییر کرد؛ دوباره تلاش کنید.");return;}
                    String fp=fingerprint(data);
                    if(!fp.isEmpty() && fp.equals(lastFingerprint))stableCount++;else {lastFingerprint=fp;stableCount=0;}
                    if(!fp.isEmpty() && stableCount>=2 && System.currentTimeMillis()-scanStarted>=1600 && (sameQuery || priorFingerprint.isEmpty() || !fp.equals(priorFingerprint))) {
                        collectedProducts=new JSONArray();collectedKeys=new java.util.HashSet<>();quietScrolls=0;scrollSteps=0;
                        collectPage(data);return;
                    }
                }
            } catch(Exception ignored) {}
            scanHandler.postDelayed(this::pollSearch,400);
        });
    }
    private void collectPage(JSONObject data) {
        if(!scanning || shop==null)return;
        if(!scanLocation.equals(RetailerSession.deliveryLocation()) || !scanMode.equals(RetailerSession.deliveryMode())) {finishAutoError("موقعیت یا روش ارسال تغییر کرد؛ دوباره تلاش کنید.");return;}
        String observedLocation=DeliveryChoice.label(data.optString("location",""));
        if(data.optBoolean("location_editing",false) || (!observedLocation.isEmpty() && !scanLocation.equals(observedLocation))) {finishAutoError("موقعیت نمایش‌داده‌شده تغییر کرد؛ دوباره تلاش کنید.");return;}
        rememberCheckout(data);
        JSONArray products=data.optJSONArray("products");int before=collectedProducts.length();
        if(products!=null) for(int i=0;i<products.length() && collectedProducts.length()<1000;i++) {
            JSONObject p=products.optJSONObject(i);if(p==null)continue;
            String key=p.optString("title")+"\u0000"+p.optLong("regular_price")+"\u0000"+p.optLong("promo_price");
            if(collectedKeys.add(key)) collectedProducts.put(p);
        }
        quietScrolls=before==collectedProducts.length()?quietScrolls+1:0;
        if(++scrollSteps>=120 || collectedProducts.length()>=1000 || System.currentTimeMillis()-scanStarted>120000) {
            recordSearch(collectedProducts,"بررسی نتایج به سقف زمانی یا تعداد رسید؛ ممکن است کامل نباشد.");return;
        }
        // Scroll both the document and any independently scrollable result container.
        shop.evaluateJavascript("(()=>{window.scrollBy(0,Math.max(400,innerHeight*.8));for(const e of document.querySelectorAll('*'))if(e.scrollHeight>e.clientHeight+200&&e.clientHeight>200&&['auto','scroll'].includes(getComputedStyle(e).overflowY))e.scrollTop+=Math.max(400,e.clientHeight*.8);return true})()", ignored ->
            scanHandler.postDelayed(() -> {
                if(!scanning || shop==null)return;
                shop.evaluateJavascript("(()=>{const els=[document.scrollingElement,...document.querySelectorAll('*')].filter(e=>e&&e.scrollHeight>e.clientHeight+200&&e.clientHeight>200&&(['auto','scroll'].includes(getComputedStyle(e).overflowY)||e===document.scrollingElement));return els.some(e=>e.scrollTop+e.clientHeight<e.scrollHeight-20)})()", more -> {
                    if(!scanning || shop==null)return;
                    if("false".equals(more) && quietScrolls>=3) {recordSearch(collectedProducts,"کامل بودن نتایج فروشگاه قابل تأیید نیست.");return;}
                    shop.evaluateJavascript(captureScript,raw -> {
                        if(!scanning || shop==null)return;
                        try {Object obj=new JSONTokener(raw).nextValue();if(obj instanceof JSONObject) {collectPage((JSONObject)obj);return;}}catch(Exception ignored2) {}
                        recordSearch(collectedProducts,"خواندن بخشی از نتایج ناموفق بود.");
                    });
                });
            },900));
    }
    private void recordSearch(JSONArray products,String error) {
        try {
            JSONObject item=autoItems.getJSONObject(autoIndex),entry=new JSONObject();
            entry.put("id",item.getString("id"));entry.put("products",products==null?new JSONArray():products);entry.put("error",error);
            autoResults.put(entry);autoIndex++;nextSearch();
        } catch(Exception e) {finishAutoError("خواندن نتایج ناموفق بود.");}
    }
    private void finishAutoError(String error) {
        try {JSONObject result=new JSONObject();result.put("error",error);returnAuto(result);}catch(Exception ignored){setResult(RESULT_CANCELED);finish();}
    }
    private boolean validCartUrl(String url) {
        try {Uri u=Uri.parse(url);return retailer(u)&&u.getPath()!=null&&u.getPath().matches("/supermarket/(.*/)?(cart|checkout)/?");}catch(Exception e){return false;}
    }
    private void rememberCheckout(JSONObject data) {
        JSONObject quote=data.optJSONObject("checkout");if(quote==null)return;
        if(checkoutQuotes.length()<40)checkoutQuotes.put(quote);
        String url=quote.optString("cart_url","");
        if(validCartUrl(url)) {checkoutUrl=url;getSharedPreferences("digikala-delivery",MODE_PRIVATE).edit().putString("cart-url",url).apply();}
    }
    private void readAutomaticCart(int attempt) {
        if(!scanning||shop==null||isFinishing())return;
        if(attempt>=10){finishAuto();return;}
        if(!checkoutUrl.equals(shop.getUrl())) {scanHandler.postDelayed(()->readAutomaticCart(attempt+1),700);return;}
        shop.evaluateJavascript(captureScript,raw->{
            if(!scanning||shop==null)return;
            try {Object v=new JSONTokener(raw).nextValue();if(v instanceof JSONObject) {
                JSONObject data=(JSONObject)v;String address=DeliveryChoice.label(data.optString("location",""));
                if(data.optBoolean("location_editing",false)||(!address.isEmpty()&&!address.equals(scanLocation))||!scanLocation.equals(RetailerSession.deliveryLocation())||!scanMode.equals(RetailerSession.deliveryMode())){finishAutoError("آدرس یا روش ارسال هنگام خواندن سبد تغییر کرد؛ دوباره جست‌وجو کنید.");return;}
                JSONObject q=data.optJSONObject("checkout");if(q==null){scanHandler.postDelayed(()->readAutomaticCart(attempt+1),700);return;}JSONObject fields=q.optJSONObject("fields");
                if(fields!=null&&(!fields.isNull("delivery_fee")||!fields.isNull("total")||q.optJSONArray("notices").length()>0)) {checkoutQuotes.put(q);finishAuto();return;}
            }}catch(Exception ignored){}
            scanHandler.postDelayed(()->readAutomaticCart(attempt+1),700);
        });
    }
    private void finishAuto() {
        if(!cartReadStarted&&!checkoutUrl.isEmpty()&&checkoutScript!=null) {
            cartReadStarted=true;status.setText("در حال بررسی هزینه ارسال و پیام‌های سبد دیجی‌کالا…");
            RetailerSession.navigate(shop,checkoutUrl);scanHandler.postDelayed(()->readAutomaticCart(0),900);return;
        }
        try {JSONObject result=new JSONObject();result.put("source","digikala-automatic");result.put("location",scanLocation);result.put("shipment_type",scanMode);result.put("captured_at",new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX",java.util.Locale.US).format(new java.util.Date()));result.put("items",autoResults);result.put("checkout_quotes",checkoutQuotes);returnAuto(result);}
        catch(Exception e){finishAutoError("آماده‌سازی نتیجه ناموفق بود.");}
    }
    private void returnAuto(JSONObject result) {
        scanning=false;scanHandler.removeCallbacksAndMessages(null);
        String json=result.toString();
        if(json.getBytes(StandardCharsets.UTF_8).length>500_000){setResult(RESULT_CANCELED);finish();return;}
        setResult(RESULT_OK,new Intent().putExtra("auto_data",json));finish();
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
    private void handleBack() { if(shop!=null && shop.canGoBack()) shop.goBack();else finish(); }
    @Override public void onBackPressed() {handleBack();}
    @Override protected void onDestroy() { scanning=false;scanHandler.removeCallbacksAndMessages(null);if(locationCallback!=null) locationCallback.invoke(locationOrigin,false,false); if(shop!=null) RetailerSession.release(this,shop);super.onDestroy(); }
}
