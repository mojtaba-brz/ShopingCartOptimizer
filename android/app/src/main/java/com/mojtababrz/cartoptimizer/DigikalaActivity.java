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
import android.widget.FrameLayout;
import android.widget.ProgressBar;
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
    private String captureScript, checkoutScript, locationScript, jetScript, preferenceScript;
    private boolean preparing,restoreReloaded,manualLocationChange,locationRestoreTried,locationCompleted,sawLocationEditor;
    private int locationEpoch;
    private String locationBaseline="",lastLocationPoint="",stableLocationKey="";
    private long stableLocationSince;
    private androidx.webkit.ScriptHandler locationHandler;
    private final java.util.HashSet<String> expandedStores=new java.util.HashSet<>();
    private String activeStore="",activeShopId="";
    private boolean returningToGlobal;
    private long queryStarted;
    private int globalScrolls,completedStores;
    private final java.util.HashSet<String> seenStores=new java.util.HashSet<>();
    private ProgressBar scrollSpinner;
    private static final String HOME="https://www.digikalajet.com/";
    private static String searchURL(String query){return HOME+"search/v2/result?q="+Uri.encode(query);}
    private boolean automated(){return autoItems!=null||preparing;}
    private LinearLayout progressLayer;
    private TextView progressTitle,progressDetail,progressCount;
    private ProgressBar progressBar;
    private Button addressFallback;

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
            && ("www.digikalajet.com".equals(uri.getHost()) || "digikalajet.com".equals(uri.getHost()));
    }
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
        deliveryChoice=new DeliveryChoice(this);
        cartOnly=getIntent().getBooleanExtra("checkout_only",false);preparing=getIntent().getBooleanExtra("prepare_location",false);
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
        locationOnly = automated() || getIntent().getBooleanExtra("location_only", false);
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
        Button back = new Button(this); back.setText(automated()?"بازگشت":"بازگشت"); back.setOnClickListener(v -> finish());
        toolbar.addView(back);
        read = new Button(this); read.setText(autoItems!=null && locationOnly ? "ثبت موقعیت و شروع" : locationOnly ? "ثبت موقعیت" : "خواندن کالاها");
        if(cartOnly)read.setText("خواندن سبد");
        read.setOnClickListener(v -> capture()); toolbar.addView(read);
        Button home = new Button(this); home.setText("تغییر موقعیت");
        home.setOnClickListener(v -> {if(shop!=null) {captureNotice=false;RetailerSession.changingLocation();RetailerSession.navigate(shop,HOME);updateStatus();}}); toolbar.addView(home);
        if(automated()){home.setVisibility(android.view.View.GONE);if(!locationOnly||!deliveryChoice.location().isEmpty()||preparing)read.setVisibility(android.view.View.GONE);}
        root.addView(toolbar);
        status = new TextView(this); status.setPadding(16,8,16,8);
        status.setText(RetailerSession.mode(deliveryChoice.mode()) ? "نشست دیجی‌کالاجت حفظ شده است؛ فقط برای تغییر آدرس، «تغییر موقعیت» را بزنید." : "آدرس و روش ارسال را در دیجی‌کالاجت انتخاب کنید. جست‌وجوی آدرس و نقشه در دسترس است."); root.addView(status);
        if(locationOnly && !automated()) RetailerSession.changingLocation();
        shop = RetailerSession.acquire(this);
        updateStatus();
        FrameLayout content=new FrameLayout(this);content.addView(shop,new FrameLayout.LayoutParams(-1,-1));
        root.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        buildProgress(content);
        if(automated())showProgress("بررسی موقعیت دیجی‌کالاجت","پیش از جست‌وجو، موقعیت انتخاب‌شده بررسی و بازیابی می‌شود…");
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
                if(automated()) {setResult(RESULT_CANCELED);finish();return true;}
                status.setText("مرورگر دیجی‌کالاجت بسته شد؛ به برنامه برگردید و دوباره تلاش کنید. لیست خرید شما ذخیره است.");return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                if (retailer(request.getUrl())) {RetailerSession.noticeNavigation(request.getUrl());return false;}
                status.setText("این پیوند خارج از دیجی‌کالاجت است؛ برای خواندن قیمت‌ها به سوپرمارکت برگردید.");
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                if (!retailer(Uri.parse(url))) return;
                updateStatus();
                if(locationOnly&&!scanning)restartLocationPolling();
            }
            @Override public void onReceivedError(WebView view, android.webkit.WebResourceRequest req, android.webkit.WebResourceError error) {
                if (req.isForMainFrame()) status.setText("اتصال به دیجی‌کالاجت برقرار نشد؛ اینترنت را بررسی و دوباره تلاش کنید.");
            }
        });
        shop.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!retailer(Uri.parse(origin))) { callback.invoke(origin,false,false); return; }
                if(deliveryChoice.locationApproved() && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin,true,true);return;
                }
                new AlertDialog.Builder(DigikalaActivity.this).setMessage("برای انتخاب آدرس، موقعیت گوشی با دیجی‌کالاجت به اشتراک گذاشته شود؟ بدون دسترسی به موقعیت هم می‌توانید آدرس را جست‌وجو یا نقشه را جابه‌جا کنید.")
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
        try(java.io.InputStream in=getAssets().open("digikala-location.js")) {
            JSONObject saved=new JSONObject();saved.put("location",deliveryChoice.location());saved.put("shipment_type",deliveryChoice.mode());
            locationScript="("+new String(readScript(in),StandardCharsets.UTF_8)+")("+saved.toString()+")";
        }catch(Exception ignored){}
        try(java.io.InputStream in=getAssets().open("jet-dom.js")){jetScript=new String(readScript(in),StandardCharsets.UTF_8);}catch(Exception ignored){}
        try(java.io.InputStream in=getAssets().open("jet-location.js")){preferenceScript=new String(readScript(in),StandardCharsets.UTF_8);}catch(Exception ignored){}
        installLocationRestoration();
        String query=getIntent().getStringExtra("query");
        String url=HOME;
        if (!locationOnly && query != null && !query.trim().isEmpty()) url=searchURL(query);
        if(cartOnly) {
            String saved=getSharedPreferences("digikala-delivery",MODE_PRIVATE).getString("cart-url","");
            if(validCartUrl(saved))url=saved;
            status.setText("سبد دیجی‌کالاجت را باز کنید؛ قیمت‌ها، هزینه‌ها و پیام‌های اصلاح خوانده می‌شوند. برنامه خریدی ثبت نمی‌کند.");
        }
        manualLocationChange=locationOnly&&!automated();
        locationBaseline=deliveryChoice.coordinates();
        RetailerSession.navigate(shop,url);
        if(automated()){
            if(deliveryChoice.location().isEmpty()){
                showProgress("موقعیت تحویل را یک‌بار انتخاب کنید","پس از انتخاب، موقعیت در همین گوشی نگهداری و در شروع‌های بعدی خودکار بازیابی می‌شود.");
                addressFallback.setVisibility(android.view.View.VISIBLE);
            }
        }
        if(locationOnly)restartLocationPolling();
    }
    private String preference(String command){
        try{JSONObject saved=new JSONObject().put("location",deliveryChoice.location()).put("coordinates",deliveryChoice.coordinates());return "("+preferenceScript+")("+JSONObject.quote(command)+","+saved+")";}catch(Exception e){return "({state:'unavailable'})";}
    }
    private String pageScript(){
        if(jetScript==null)return captureScript;
        try{JSONObject context=new JSONObject().put("store_name",activeStore).put("expected_shop_id",activeShopId);
            return "(()=>{const data=("+jetScript+")("+context+");data.delivery_preference="+preference("read")+";const p=data.delivery_preference;if(p.location)data.location=p.location;if(typeof p.editing==='boolean')data.location_editing=p.editing;data.checkout="+(checkoutScript==null?"null":checkoutScript)+";return data;})()";
        }catch(Exception e){return captureScript;}
    }
    private void installLocationRestoration(){
        if(preferenceScript==null)return;
        String init=automated()&&DeliveryChoice.validCoordinates(deliveryChoice.coordinates())?preference("restore"):preference("listen");
        if(androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT)){
            locationHandler=androidx.webkit.WebViewCompat.addDocumentStartJavaScript(shop,init,new java.util.HashSet<>(java.util.Arrays.asList("https://www.digikalajet.com","https://digikalajet.com")));
        }
    }
    private String locationSnapshot(){
        return "(()=>{const p="+preference("read")+";return {source:'digikala-live-page',retailer:'jet',captured_at:new Date().toISOString(),location:p.location||'',shipment_type:'on_demand',location_editing:p.editing===true,delivery_preference:p,products:[]};})()";
    }
    private void restartLocationPolling(){
        if(!locationOnly||locationCompleted||shop==null)return;
        int epoch=++locationEpoch;stableLocationKey="";scanHandler.postDelayed(()->pollLocation(epoch,0),350);
    }
    private void beginLocationChange(){
        if(shop==null)return;
        ++locationEpoch;manualLocationChange=true;locationRestoreTried=true;sawLocationEditor=false;
        locationBaseline=lastLocationPoint.isEmpty()?deliveryChoice.coordinates():lastLocationPoint;
        if(locationHandler!=null){locationHandler.remove();locationHandler=null;}
        RetailerSession.changingLocation();
        progressLayer.setVisibility(android.view.View.GONE);shop.setImportantForAccessibility(android.view.View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        read.setVisibility(android.view.View.VISIBLE);read.setText("بررسی موقعیت ثبت‌شده");
        status.setText("موقعیت را در جت انتخاب کنید؛ پس از ثبت، برنامه آن را خودکار تشخیص می‌دهد.");
        RetailerSession.navigate(shop,HOME+"user/add-address?MID=add-address-map");restartLocationPolling();
    }
    private boolean stableLocation(String location,String point){
        String key=DeliveryChoice.label(location)+"|"+point;long now=System.currentTimeMillis();
        if(!key.equals(stableLocationKey)){stableLocationKey=key;stableLocationSince=now;return false;}
        return now-stableLocationSince>=450;
    }
    private void pollLocation(int epoch,int attempts){
        if(epoch!=locationEpoch||locationCompleted||!locationOnly||scanning||shop==null||isFinishing()||isDestroyed())return;
        shop.evaluateJavascript(locationSnapshot(),raw->{
            if(epoch!=locationEpoch||locationCompleted||!locationOnly||scanning||shop==null||isFinishing()||isDestroyed())return;
            boolean replay=false;
            try{
                Object value=new JSONTokener(raw).nextValue();if(value instanceof JSONObject){
                    JSONObject data=(JSONObject)value,p=data.optJSONObject("delivery_preference");
                    if(p==null||"wrong-origin".equals(p.optString("state"))){scanHandler.postDelayed(()->pollLocation(epoch,attempts+1),700);return;}
                    String location=DeliveryChoice.label(data.optString("location")),point=p.optString("coordinates");
                    boolean validPoint=DeliveryChoice.validCoordinates(point),configured=p!=null&&p.optBoolean("configured")&&validPoint&&DeliveryChoice.usableLabel(location);
                    replay="ok".equals(p.optString("state"))&&!p.optBoolean("has_address_record")&&!manualLocationChange;
                    if(validPoint){lastLocationPoint=point;if(manualLocationChange&&!DeliveryChoice.validCoordinates(locationBaseline))locationBaseline=point;}
                    boolean editing=p!=null&&p.optBoolean("editing"),blocking=p!=null&&(p.optBoolean("map_open")||p.optBoolean("picker_open"));
                    if(editing)sawLocationEditor=true;
                    boolean changed=validPoint&&DeliveryChoice.validCoordinates(locationBaseline)&&!DeliveryChoice.sameCoordinates(point,locationBaseline);
                    boolean pendingManual=manualLocationChange&&!sawLocationEditor&&!changed;
                    // A committed preference can outlive the add-address route. A
                    // visible map/picker remains a barrier; its URL alone is not.
                    if(configured&&!blocking&&(!editing||changed)&&!pendingManual){
                        if(stableLocation(location,point)){data.put("location_editing",false);completeCapture(data,"on_demand");return;}
                    }else{
                        stableLocationKey="";
                        if(!editing&&!manualLocationChange){
                            boolean emptyPreference="ok".equals(p.optString("state"))&&!p.optBoolean("has_address_record");
                            boolean headerConfirmed=emptyPreference&&deliveryChoice.isJet()&&deliveryChoice.matches(location,"on_demand")&&DeliveryChoice.usableLabel(location)&&!validPoint;
                            boolean retained=emptyPreference&&!RetailerSession.deliveryLocation().isEmpty()&&!validPoint;
                            if(headerConfirmed||retained){if(retained)data.put("location",RetailerSession.deliveryLocation());completeCapture(data,"on_demand");return;}
                            if(!locationRestoreTried&&automated()&&DeliveryChoice.validCoordinates(deliveryChoice.coordinates())){
                                locationRestoreTried=true;
                                shop.evaluateJavascript(preference("restore"),restored->{
                                    if(epoch!=locationEpoch||locationCompleted||shop==null||isFinishing())return;
                                    try{Object r=new JSONTokener(restored).nextValue();if(r instanceof JSONObject&&((JSONObject)r).optBoolean("changed")&&!restoreReloaded){restoreReloaded=true;shop.reload();}}catch(Exception ignored){}
                                    scanHandler.postDelayed(()->pollLocation(epoch,attempts+1),700);
                                });return;
                            }
                        }
                    }
                    if(manualLocationChange){status.setText(configured?"موقعیت ثبت‌شده پیدا شد؛ در حال تأیید…":editing?"پس از ثبت موقعیت در جت، برنامه آن را خودکار می‌خواند.":"در حال بررسی موقعیت ثبت‌شده در جت…");}
                    else if(automated()){
                        boolean invalid=p.optBoolean("invalid_address");
                        showProgress(invalid?"موقعیت نیاز به اصلاح دارد":configured?"تأیید موقعیت ثبت‌شده":"بررسی موقعیت جت",invalid?"جت مختصات این آدرس را معتبر نمی‌داند؛ از «تغییر موقعیت» آن را اصلاح کنید.":configured?"اطلاعات موقعیت دریافت شد؛ در حال تأیید پایداری انتخاب…":"منتظر اطلاعات آدرس انتخاب‌شده در جت…");
                        if(invalid||attempts>=12||deliveryChoice.location().isEmpty())addressFallback.setVisibility(android.view.View.VISIBLE);
                    }
                }
            }catch(Exception ignored){}
            if(replay&&attempts<20&&locationScript!=null&&!deliveryChoice.location().isEmpty()){
                shop.evaluateJavascript(locationScript,ignored->{if(epoch==locationEpoch&&!locationCompleted)scanHandler.postDelayed(()->pollLocation(epoch,attempts+1),700);});
            }else scanHandler.postDelayed(()->pollLocation(epoch,attempts+1),700);
        });
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
        shop.evaluateJavascript(pageScript(), raw -> {
            if(isFinishing() || isDestroyed() || shop==null) return;
            read.setEnabled(true);
            try {
                Object parsed=new JSONTokener(raw).nextValue();
                if (!(parsed instanceof JSONObject)) throw new IllegalArgumentException();
                JSONObject data=(JSONObject)parsed;
                if (data.toString().getBytes(StandardCharsets.UTF_8).length>500_000) throw new IllegalArgumentException();
                JSONObject registered=data.optJSONObject("delivery_preference");
                if(registered!=null&&registered.optBoolean("configured")&&!registered.optBoolean("map_open")&&!registered.optBoolean("picker_open"))data.put("location_editing",false);
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
                if(!DeliveryChoice.usableLabel(location)) {captureNotice=true;status.setText("یک‌بار آدرس را از «تغییر موقعیت» انتخاب کنید؛ در جست‌وجوهای بعدی حفظ می‌شود.");return;}
                // A missing header does not erase a delivery choice confirmed in this same tab.
                boolean sameSession=location.equals(RetailerSession.deliveryLocation()) && RetailerSession.mode(observed);
                if(!locationOnly && (sameSession || deliveryChoice.matches(location,observed))) {
                    completeCapture(data,observed);return;
                }
                if(RetailerSession.mode(observed)) {
                    completeCapture(data,observed);return;
                }
                final String selectedLocation=location;
                final String currentMode=observed;
                LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
                TextView label=new TextView(this); label.setText("آدرس نمایش‌داده‌شده در دیجی‌کالاجت:\n"+location+"\n\nکدام روش ارسال در فروشگاه انتخاب شده است؟"); form.addView(label);
                android.widget.RadioGroup modes=new android.widget.RadioGroup(this);
                android.widget.RadioButton instant=new android.widget.RadioButton(this); instant.setText("ارسال فوری"); instant.setId(R.id.delivery_instant); modes.addView(instant);
                android.widget.RadioButton scheduled=new android.widget.RadioButton(this); scheduled.setText("ارسال زمان‌دار"); scheduled.setId(R.id.delivery_scheduled); modes.addView(scheduled); form.addView(modes);
                if(RetailerSession.mode(currentMode)) modes.check("on_demand".equals(currentMode)?R.id.delivery_instant:R.id.delivery_scheduled);
                // First selection, explicit change, or a different retailer context needs confirmation.
                AlertDialog dialog=new AlertDialog.Builder(this).setTitle(locationOnly ? "ثبت آدرس تحویل" : "خواندن قیمت‌های روز")
                    .setView(form).setPositiveButton("ادامه",null).setNegativeButton("انصراف",null).create();
                dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(b -> {
                    if (modes.getCheckedRadioButtonId()==-1) { label.setText("روش ارسال فعلی دیجی‌کالاجت را انتخاب کنید.\n"+selectedLocation); return; }
                    try {
                        String selectedMode=modes.getCheckedRadioButtonId()==R.id.delivery_instant?"on_demand":"scheduled";
                        if(RetailerSession.mode(currentMode) && !currentMode.equals(selectedMode)) {
                            label.setText("روش ارسال فعلی فروشگاه "+("scheduled".equals(currentMode)?"زمان‌دار":"فوری")+" است؛ همان گزینه را انتخاب کنید یا ابتدا آن را در دیجی‌کالاجت تغییر دهید.");return;
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
        else status.setText(locationOnly?"آدرس و روش ارسال را در دیجی‌کالاجت انتخاب کنید و «ثبت موقعیت» را بزنید.":"آدرس در دیجی‌کالاجت حفظ می‌شود؛ برای عوض کردن آن «تغییر موقعیت» را بزنید.");
    }
    private void buildProgress(FrameLayout parent) {
        progressLayer=new LinearLayout(this);progressLayer.setOrientation(LinearLayout.VERTICAL);progressLayer.setGravity(android.view.Gravity.CENTER);progressLayer.setPadding(36,32,36,32);
        String theme=getSharedPreferences("cartwise-preferences",MODE_PRIVATE).getString("theme","simple");
        int paper=Color.parseColor(theme.equals("modern")?"#EDF4F7":theme.equals("traditional")?"#FAF2E3":"#F5F5EF");progressLayer.setBackgroundColor(paper);
        progressTitle=new TextView(this);progressTitle.setTextSize(22);progressTitle.setTextColor(Color.parseColor("#164C78"));progressTitle.setGravity(android.view.Gravity.CENTER);progressLayer.addView(progressTitle);
        progressDetail=new TextView(this);progressDetail.setTextSize(15);progressDetail.setGravity(android.view.Gravity.CENTER);progressDetail.setPadding(0,20,0,20);progressLayer.addView(progressDetail);
        scrollSpinner=new ProgressBar(this);scrollSpinner.setIndeterminate(true);progressLayer.addView(scrollSpinner,new LinearLayout.LayoutParams(72,72));
        progressBar=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progressBar.setMax(autoItems==null?1:autoItems.length());progressBar.setIndeterminate(autoItems==null);progressLayer.addView(progressBar,new LinearLayout.LayoutParams(-1,24));
        progressCount=new TextView(this);progressCount.setTextSize(14);progressCount.setPadding(0,20,0,20);progressCount.setGravity(android.view.Gravity.CENTER);progressLayer.addView(progressCount);
        addressFallback=new Button(this);addressFallback.setText("انتخاب آدرس روی نقشه");addressFallback.setVisibility(android.view.View.GONE);addressFallback.setOnClickListener(v->beginLocationChange());progressLayer.addView(addressFallback);
        progressLayer.setVisibility(android.view.View.GONE);parent.addView(progressLayer,new FrameLayout.LayoutParams(-1,-1));
    }
    private String fa(int n){return java.text.NumberFormat.getInstance(new java.util.Locale("fa")).format(n);}
    private void showProgress(String title,String detail) {
        if(!automated()||progressLayer==null)return;
        progressLayer.setVisibility(android.view.View.VISIBLE);shop.setImportantForAccessibility(android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        progressTitle.setText(title);progressDetail.setText(detail);progressBar.setProgress(autoIndex);
        int count=collectedProducts==null?0:collectedProducts.length();java.util.HashSet<String> stores=new java.util.HashSet<>();
        if(collectedProducts!=null)for(int i=0;i<collectedProducts.length();i++){JSONObject p=collectedProducts.optJSONObject(i);if(p!=null&&!p.optString("store_name").isEmpty())stores.add(p.optString("store_name"));}
        progressCount.setText(autoItems==null?"بررسی موقعیت پیش از شروع جست‌وجوی کالاها":fa(autoIndex)+" از "+fa(autoItems.length())+" قلم تکمیل شده\n"+fa(count)+" کالای خوانده‌شده · "+fa(stores.size())+" فروشگاه شناسایی‌شده");
    }
    private void completeCapture(JSONObject data,String mode) throws org.json.JSONException {
        if(locationCompleted)return;locationCompleted=true;++locationEpoch;
        rememberCheckout(data);
        JSONObject preference=data.optJSONObject("delivery_preference");String point=preference==null?"":preference.optString("coordinates");
        if(!DeliveryChoice.validCoordinates(point))point=RetailerSession.deliveryCoordinates();
        RetailerSession.confirmJetDelivery(data.optString("location",""),point);
        if(autoItems!=null && locationOnly) {
            scanLocation=RetailerSession.deliveryLocation();scanMode=mode;locationOnly=false;scanning=true;showProgress("آدرس بازیابی شد","آماده‌سازی جست‌وجوی کالاها…");
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
    private boolean changedDelivery(JSONObject data){
        JSONObject pref=data.optJSONObject("delivery_preference");
        String current=pref==null?"":pref.optString("coordinates"),expected=RetailerSession.deliveryCoordinates();
        if(DeliveryChoice.validCoordinates(current)&&DeliveryChoice.validCoordinates(expected))return !DeliveryChoice.sameCoordinates(current,expected);
        String label=DeliveryChoice.label(data.optString("location"));return DeliveryChoice.usableLabel(label)&&!label.equals(scanLocation);
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
        collectedProducts=new JSONArray();collectedKeys=new java.util.HashSet<>();showProgress("جست‌وجوی «"+autoQuery+"»","دریافت قیمت‌ها و فروشگاه‌های قابل مشاهده…");
        status.setText("در حال جست‌وجوی «"+autoQuery+"» ("+java.text.NumberFormat.getInstance(new java.util.Locale("fa")).format(autoIndex+1)+" از "+java.text.NumberFormat.getInstance(new java.util.Locale("fa")).format(autoItems.length())+")…");
        String url=shop.getUrl();String q=url==null?null:Uri.parse(url).getQueryParameter("q");sameQuery=autoQuery.equals(q);
        scanStarted=System.currentTimeMillis();queryStarted=scanStarted;expandedStores.clear();activeStore="";activeShopId="";globalScrolls=0;completedStores=0;seenStores.clear();returningToGlobal=false;lastFingerprint="";stableCount=0;
        shop.evaluateJavascript(pageScript(),raw->{
            if(!scanning || shop==null)return;
            try {Object d=new JSONTokener(raw).nextValue();priorFingerprint=d instanceof JSONObject?fingerprint((JSONObject)d):"";}catch(Exception e){priorFingerprint="";}
            RetailerSession.navigate(shop,searchURL(autoQuery));
            scanHandler.postDelayed(this::pollSearch,700);
        });
    }
    private void pollSearch() {
        if(!scanning || isFinishing() || shop==null)return;
        if(!scanLocation.equals(RetailerSession.deliveryLocation()) || !scanMode.equals(RetailerSession.deliveryMode())) {finishAutoError("موقعیت یا روش ارسال تغییر کرد؛ دوباره تلاش کنید.");return;}
        if(System.currentTimeMillis()-scanStarted>20000) {if(!activeStore.isEmpty()){returnToGlobal();return;}recordSearch(collectedProducts,"نتیجه قابل خواندن پیدا نشد یا جست‌وجو تمام نشد.");return;}
        String url=shop.getUrl();String query=url==null?null:Uri.parse(url).getQueryParameter("q");
        if(!activeStore.isEmpty()){
            if(!"/search/shop".equals(Uri.parse(url).getPath())||Uri.parse(url).getQueryParameter("shopId")==null){scanHandler.postDelayed(this::pollSearch,400);return;}
            activeShopId=Uri.parse(url).getQueryParameter("shopId");
        }
        if(!autoQuery.equals(query)) {scanHandler.postDelayed(this::pollSearch,400);return;}
        shop.evaluateJavascript(pageScript(),raw->{
            if(!scanning || shop==null)return;
            try {
                Object obj=new JSONTokener(raw).nextValue();JSONObject data=obj instanceof JSONObject?(JSONObject)obj:null;
                if(data!=null && !data.optBoolean("location_editing",false)) {
                    String location=DeliveryChoice.label(data.optString("location",""));
                    if(changedDelivery(data)) {finishAutoError("موقعیت نمایش‌داده‌شده تغییر کرد؛ دوباره تلاش کنید.");return;}
                    JSONArray groups=data.optJSONArray("shops");
                    if(!activeStore.isEmpty()&&groups!=null&&groups.length()>0){scanHandler.postDelayed(this::pollSearch,400);return;}
                    String fp=fingerprint(data);
                    if(!fp.isEmpty() && fp.equals(lastFingerprint))stableCount++;else {lastFingerprint=fp;stableCount=0;}
                    if(!fp.isEmpty() && stableCount>=2 && System.currentTimeMillis()-scanStarted>=1600 && (sameQuery || priorFingerprint.isEmpty() || !fp.equals(priorFingerprint) || !activeStore.isEmpty() || (activeStore.isEmpty()&&groups!=null&&groups.length()>0))) {
                        quietScrolls=0;scrollSteps=0;
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
        if(data.optBoolean("location_editing",false) || changedDelivery(data)) {finishAutoError("موقعیت نمایش‌داده‌شده تغییر کرد؛ دوباره تلاش کنید.");return;}
        rememberCheckout(data);
        JSONArray products=data.optJSONArray("products");int before=collectedProducts.length();
        if(products!=null) for(int i=0;i<products.length() && collectedProducts.length()<1000;i++) {
            JSONObject p=products.optJSONObject(i);if(p==null)continue;
            if(activeStore.isEmpty()&&expandedStores.contains(p.optString("store_name")))continue;
            String key=p.optString("title")+"\u0000"+p.optString("store_id")+"|"+p.optString("store_name")+"|"+p.optString("url")+"|"+p.optLong("regular_price")+"|"+p.optLong("promo_price");
            if(collectedKeys.add(key)) collectedProducts.put(p);
        }
        quietScrolls=before==collectedProducts.length()?quietScrolls+1:0;
        JSONArray stores=data.optJSONArray("shops");
        if(activeStore.isEmpty()&&stores!=null){
            for(int n=0;n<stores.length();n++){JSONObject g=stores.optJSONObject(n);if(g!=null&&!g.optString("name").isEmpty())seenStores.add(g.optString("name"));}
            for(int n=0;n<stores.length();n++){JSONObject g=stores.optJSONObject(n);if(g==null)continue;String name=g.optString("name");
                if(name.isEmpty()||expandedStores.contains(name))continue;
                if(expandedStores.size()>=40){recordSearch(collectedProducts,"بررسی به سقف ۴۰ فروشگاه رسید؛ پوشش کامل تأیید نیست.");return;}
                expandStore(name,data);return;
            }
        }
        showProgress("مقایسه «"+autoQuery+"»",(activeStore.isEmpty()?"یافتن فروشگاه‌های بیشتر":("فروشگاه «"+activeStore+"»"))+" · پیمایش "+fa(scrollSteps+1)+"؛ "+fa(completedStores)+" از "+fa(seenStores.size())+" فروشگاه شناسایی‌شده تکمیل شد…");
        if(collectedProducts.length()>=1000 || System.currentTimeMillis()-queryStarted>300000) {
            recordSearch(collectedProducts,"بررسی نتایج به سقف زمانی یا تعداد رسید؛ ممکن است کامل نباشد.");return;
        }
        if(++scrollSteps>=120||System.currentTimeMillis()-scanStarted>90000){finishSearchPage("سقف پیمایش این صفحه رسید؛ پوشش کامل تأیید نیست.");return;}
        // Scroll both the document and any independently scrollable result container.
        shop.evaluateJavascript("(()=>{window.scrollBy(0,Math.max(400,innerHeight*.8));for(const e of document.querySelectorAll('*'))if(e.scrollHeight>e.clientHeight+200&&e.clientHeight>200&&['auto','scroll'].includes(getComputedStyle(e).overflowY))e.scrollTop+=Math.max(400,e.clientHeight*.8);return true})()", ignored ->
            scanHandler.postDelayed(() -> {
                if(!scanning || shop==null)return;
                shop.evaluateJavascript("(()=>{const els=[document.scrollingElement,...document.querySelectorAll('*')].filter(e=>e&&e.scrollHeight>e.clientHeight+200&&e.clientHeight>200&&(['auto','scroll'].includes(getComputedStyle(e).overflowY)||e===document.scrollingElement));return els.some(e=>e.scrollTop+e.clientHeight<e.scrollHeight-20)})()", more -> {
                    if(!scanning || shop==null)return;
                    if("false".equals(more) && quietScrolls>=3) {finishSearchPage("کامل بودن نتایج فروشگاه قابل تأیید نیست.");return;}
                    shop.evaluateJavascript(pageScript(),raw -> {
                        if(!scanning || shop==null)return;
                        try {Object obj=new JSONTokener(raw).nextValue();if(obj instanceof JSONObject) {collectPage((JSONObject)obj);return;}}catch(Exception ignored2) {}
                        finishSearchPage("خواندن بخشی از نتایج ناموفق بود.");
                    });
                });
            },900));
    }
    private void finishSearchPage(String note){if(!activeStore.isEmpty())returnToGlobal();else recordSearch(collectedProducts,note);}
    private void expandStore(String name,JSONObject snapshot){
        activeStore=name;activeShopId="";expandedStores.add(name);priorFingerprint=fingerprint(snapshot);sameQuery=false;
        for(int i=collectedProducts.length()-1;i>=0;i--)if(name.equals(collectedProducts.optJSONObject(i).optString("store_name")))collectedProducts.remove(i);
        // Only activate the observed public “view all” navigation, never a product/cart button.
        String script="(()=>{const wanted="+JSONObject.quote(name)+";const matches=[];for(const b of document.querySelectorAll('button'))if(b.innerText.trim()==='مشاهده همه'){let g=b.parentElement;for(let n=0;g&&n<6;n++,g=g.parentElement){const titles=[...g.querySelectorAll('p.truncate')].filter(p=>p.getClientRects().length&&!p.closest('button'));if(titles.length>1)break;if(titles.length===1&&titles[0].innerText.trim()===wanted&&g.querySelector('button[data-cro-id=add-one-more-to-cart]')){matches.push(b);break;}}}if(matches.length===1){matches[0].click();return true;}return false;})()";
        showProgress("خواندن همه نتایج فروشگاه","باز کردن «"+name+"» برای بررسی کالاهای بعد از ردیف اول…");
        scanStarted=System.currentTimeMillis();lastFingerprint="";stableCount=0;
        shop.evaluateJavascript(script,raw->{if(!scanning||shop==null)return;if(!"true".equals(raw)){returnToGlobal();return;}scanHandler.postDelayed(this::pollSearch,700);});
    }
    private void returnToGlobal(){
        if(!scanning||shop==null)return;
        completedStores++;activeStore="";activeShopId="";returningToGlobal=true;sameQuery=false;
        shop.evaluateJavascript(pageScript(),raw->{
            if(!scanning||shop==null)return;
            try{Object d=new JSONTokener(raw).nextValue();priorFingerprint=d instanceof JSONObject?fingerprint((JSONObject)d):"";}catch(Exception e){priorFingerprint="";}
            scanStarted=System.currentTimeMillis();lastFingerprint="";stableCount=0;
            RetailerSession.navigate(shop,searchURL(autoQuery));scanHandler.postDelayed(this::pollSearch,700);
        });
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
        try {Uri u=Uri.parse(url);return retailer(u)&&u.getPath()!=null&&u.getPath().matches("/(.*/)?(cart|carts|checkout)/?");}catch(Exception e){return false;}
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
        shop.evaluateJavascript(pageScript(),raw->{
            if(!scanning||shop==null)return;
            try {Object v=new JSONTokener(raw).nextValue();if(v instanceof JSONObject) {
                JSONObject data=(JSONObject)v;String address=DeliveryChoice.label(data.optString("location",""));
                if(data.optBoolean("location_editing",false)||changedDelivery(data)||!scanLocation.equals(RetailerSession.deliveryLocation())||!scanMode.equals(RetailerSession.deliveryMode())){finishAutoError("آدرس یا روش ارسال هنگام خواندن سبد تغییر کرد؛ دوباره جست‌وجو کنید.");return;}
                JSONObject q=data.optJSONObject("checkout");if(q==null){scanHandler.postDelayed(()->readAutomaticCart(attempt+1),700);return;}JSONObject fields=q.optJSONObject("fields");
                if(fields!=null&&(!fields.isNull("delivery_fee")||!fields.isNull("total")||q.optJSONArray("notices").length()>0)) {checkoutQuotes.put(q);finishAuto();return;}
            }}catch(Exception ignored){}
            scanHandler.postDelayed(()->readAutomaticCart(attempt+1),700);
        });
    }
    private void finishAuto() {
        if(!cartReadStarted&&!checkoutUrl.isEmpty()&&checkoutScript!=null) {
            cartReadStarted=true;showProgress("بررسی هزینه‌ها و اصلاحات سبد","جست‌وجوی اقلام تمام شد؛ اکنون مبلغ و پیام‌های سبد بررسی می‌شوند.");status.setText("در حال بررسی هزینه ارسال و پیام‌های سبد دیجی‌کالاجت…");
            RetailerSession.navigate(shop,checkoutUrl);scanHandler.postDelayed(()->readAutomaticCart(0),900);return;
        }
        try {JSONObject result=new JSONObject();result.put("source","digikala-automatic");result.put("location",scanLocation);result.put("shipment_type",scanMode);result.put("captured_at",new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX",java.util.Locale.US).format(new java.util.Date()));result.put("items",autoResults);result.put("checkout_quotes",checkoutQuotes);returnAuto(result);}
        catch(Exception e){finishAutoError("آماده‌سازی نتیجه ناموفق بود.");}
    }
    private void returnAuto(JSONObject result) {
        scanning=false;scanHandler.removeCallbacksAndMessages(null);
        String json=result.toString();
        try{setResult(RESULT_OK,SearchResult.pack(this,json));finish();}
        catch(Exception e){setResult(RESULT_CANCELED);finish();}
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
    private void handleBack() { if(automated()){scanning=false;setResult(RESULT_CANCELED);finish();return;}if(shop!=null && shop.canGoBack()) shop.goBack();else finish(); }
    @Override public void onBackPressed() {handleBack();}
    @Override protected void onDestroy() { if(locationHandler!=null)locationHandler.remove();scanning=false;scanHandler.removeCallbacksAndMessages(null);if(locationCallback!=null) locationCallback.invoke(locationOrigin,false,false); if(shop!=null) RetailerSession.release(this,shop);super.onDestroy(); }
}
