package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import androidx.webkit.WebViewAssetLoader;

/** Trusted app-owned tile map; it never embeds the retailer or requests GPS. */
final class DeliveryMap {
    interface Listener {void selected(JetAddressClient.Point point);}
    private final WebView web;private final AlertDialog dialog;private boolean closed;
    DeliveryMap(Activity activity,String coordinates,Listener listener){
        web=new WebView(activity);web.setLayoutParams(new android.view.ViewGroup.LayoutParams(-1,(int)(activity.getResources().getDisplayMetrics().heightPixels*.65)));web.getSettings().setJavaScriptEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);web.getSettings().setUserAgentString(web.getSettings().getUserAgentString()+" Sabadchin/0.12.0 (+https://github.com/mojtaba-brz/ShopingCartOptimizer)");
        WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(activity)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return assets.shouldInterceptRequest(r.getUrl());}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){if(r.isForMainFrame()&&r.getUrl().toString().equals("https://www.openstreetmap.org/copyright")){activity.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,r.getUrl()));}return r.isForMainFrame();}
            @Override public boolean onRenderProcessGone(WebView v,android.webkit.RenderProcessGoneDetail detail){dismiss();return true;}
        });
        dialog=new AlertDialog.Builder(activity).setTitle("انتخاب موقعیت روی نقشه").setView(web).setNegativeButton("بستن نقشه",(d,w)->dismiss()).create();dialog.setOnDismissListener(d->close());
        web.addJavascriptInterface(new Object(){@JavascriptInterface public void select(String lat,String lon){String point=lat+"|"+lon;if(!DeliveryChoice.validCoordinates(point))return;activity.runOnUiThread(()->{if(closed)return;dismiss();listener.selected(new JetAddressClient.Point("نقشه","موقعیت روی نقشه",point));});}},"CartwiseMapBridge");
        String[] xy=DeliveryChoice.validCoordinates(coordinates)?coordinates.split("\\|"):new String[]{"35.6892","51.389"};
        web.loadUrl("https://appassets.androidplatform.net/assets/map.html?lat="+Uri.encode(xy[0])+"&lon="+Uri.encode(xy[1]));
    }
    void show(){dialog.show();dialog.getWindow().setLayout(-1,(int)(activityHeight()*.85));}
    private int activityHeight(){return web.getResources().getDisplayMetrics().heightPixels;}
    void dismiss(){dialog.dismiss();close();}
    private void close(){if(closed)return;closed=true;web.stopLoading();web.removeJavascriptInterface("CartwiseMapBridge");web.destroy();}
}
