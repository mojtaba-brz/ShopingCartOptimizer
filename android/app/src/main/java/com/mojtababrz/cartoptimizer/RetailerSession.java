package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.content.Context;
import android.content.MutableContextWrapper;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.ViewGroup;
import java.lang.ref.WeakReference;
import java.util.Map;

/** One retailer tab per application process. Never contains the planner bridge. */
final class RetailerSession {
    private static WebView tab;
    private static MutableContextWrapper context;
    private static WeakReference<Activity> owner=new WeakReference<>(null);
    private static volatile String observedMode="";
    private static int navigationId;
    private static volatile String confirmedLocation="", confirmedMode="", catalogLocation="";

    private static volatile DeliveryChoice savedChoice;
    private static volatile boolean editingLocation;
    static void initialize(Context app) {savedChoice=new DeliveryChoice(app.getApplicationContext());}
    static void confirmDelivery(String location,String mode) {
        if(!DeliveryChoice.label(location).isEmpty() && mode(mode)) {
            confirmedLocation=DeliveryChoice.label(location);confirmedMode=mode;observedMode=mode;editingLocation=false;
            if(savedChoice!=null){savedChoice.remember(confirmedLocation,mode);savedChoice.rememberCoordinates(catalogLocation);}
        }
    }
    static String deliveryLocation() {return confirmedLocation;}
    static String deliveryMode() {return mode(observedMode)?observedMode:confirmedMode;}
    static void changingLocation() {editingLocation=true;confirmedLocation="";confirmedMode="";catalogLocation="";observedMode="";}
    static void noticeNavigation(Uri uri) {
        String path=uri.getPath(), modal=uri.getQueryParameter("MID");
        if((path!=null && path.contains("/user/add-address")) || (modal!=null && (modal.contains("address")||modal.contains("location")))) changingLocation();
    }


    static WebView acquire(Activity activity) {
        initialize(activity);
        if(tab==null) {
            context=new MutableContextWrapper(activity.getApplicationContext());
            tab=new WebView(context);
        }
        if(tab.getParent() instanceof ViewGroup) ((ViewGroup)tab.getParent()).removeView(tab);
        context.setBaseContext(activity);
        owner=new WeakReference<>(activity);
        tab.onResume();
        return tab;
    }
    static void observe(WebResourceRequest request) {
        Uri uri=request.getUrl();String path=uri.getPath();
        if(!"GET".equals(request.getMethod()) || !"https".equals(uri.getScheme())
            || !"api.digikalajet.ir".equals(uri.getHost()) || path==null
            || !(path.startsWith("/fresh/") || path.startsWith("/search/")
                || path.startsWith("/v2/search/") || path.equals("/first-load/"))) return;
        // The user-selected location stays in private local preferences.
        // Only an exact fresh catalog coordinate + delivery-mode match can restore its label.
        // Changed catalog coordinates invalidate the prior label; no guessing a new area.
        String lat=uri.getQueryParameter("latitude"), lon=uri.getQueryParameter("longitude");
        if(lat!=null && lon!=null) {
            String next=lat+"|"+lon;
            if(!catalogLocation.isEmpty() && !catalogLocation.equals(next)) {confirmedLocation="";confirmedMode="";}
            if(!DeliveryChoice.validCoordinates(next)){catalogLocation="";confirmedLocation="";confirmedMode="";return;}
            catalogLocation=next;
        }
        // Read only the public delivery-mode header, never auth or account headers.
        for(Map.Entry<String,String> entry:request.getRequestHeaders().entrySet())
            if("shipment-type".equalsIgnoreCase(entry.getKey()) && mode(entry.getValue())) observedMode=entry.getValue();
        if(!editingLocation && confirmedLocation.isEmpty() && savedChoice!=null) {
            String restored=savedChoice.restoreFromCatalog(catalogLocation,observedMode);
            if(!restored.isEmpty()) {confirmedLocation=restored;confirmedMode=observedMode;}
        }
        if(!confirmedLocation.isEmpty() && savedChoice!=null) savedChoice.rememberCoordinates(catalogLocation);
    }
    static boolean mode(String value) { return "scheduled".equals(value)||"on_demand".equals(value); }
    static String observedMode() { return observedMode; }
    static void navigate(WebView view,String url) {
        final int requestId=++navigationId;
        String current=view.getUrl();
        if(url.equals(current)) return;
        // Retain Redux and tab storage while changing the site's own router route.
        // A cold/unfinished document falls back to normal HTTPS navigation.
        if(current!=null && DigikalaActivity.retailer(Uri.parse(current))
            && Uri.parse(current).getPath()!=null && Uri.parse(current).getPath().startsWith("/supermarket")) {
            view.evaluateJavascript("Boolean(document.getElementById('root'))",ready->{
                if(requestId!=navigationId) return;
                if("true".equals(ready)) {
                    Uri uri=Uri.parse(url);String route=uri.getEncodedPath();
                    if(uri.getEncodedQuery()!=null) route+="?"+uri.getEncodedQuery();
                    view.evaluateJavascript("history.pushState(null,'',"+org.json.JSONObject.quote(route)+");window.dispatchEvent(new PopStateEvent('popstate',{state:history.state}));true",null);
                } else view.loadUrl(url);
            });
        } else view.loadUrl(url);
    }
    static void release(Activity activity,WebView view) {
        if(tab!=view || owner.get()!=activity) return;
        CookieManager.getInstance().flush();
        if(view.getParent() instanceof ViewGroup) ((ViewGroup)view.getParent()).removeView(view);
        view.onPause();
        // Drop all callbacks that capture the old Activity; keep the tab and its state.
        view.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r) {
                if(r.isForMainFrame() && DigikalaActivity.retailer(r.getUrl())) noticeNavigation(r.getUrl());
                return r.isForMainFrame()&&!DigikalaActivity.retailer(r.getUrl());
            }
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r) {
                observe(r);return null;
            }
        });
        view.setWebChromeClient(new WebChromeClient());
        context.setBaseContext(activity.getApplicationContext());owner.clear();
    }
    static void discard() {
        navigationId++;
        if(tab!=null) {
            if(tab.getParent() instanceof ViewGroup) ((ViewGroup)tab.getParent()).removeView(tab);
            tab.destroy();
        }
        tab=null;context=null;owner.clear();changingLocation();editingLocation=false;
    }
}
