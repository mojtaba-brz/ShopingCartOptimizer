package com.mojtababrz.cartoptimizer;

import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

/** Offline HTTPS responses, retaining the real URL/lifecycle used by native security checks. */
final class RetailerFixtures {
    static android.webkit.WebView browser(android.app.Activity a){return find(a.findViewById(android.R.id.content));}
    private static android.webkit.WebView find(android.view.View view){
        if(view instanceof android.webkit.WebView)return (android.webkit.WebView)view;
        if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int n=0;n<group.getChildCount();n++){android.webkit.WebView result=find(group.getChildAt(n));if(result!=null)return result;}}
        return null;
    }

    static android.content.Intent plannerIntent(){return new android.content.Intent(androidx.test.core.app.ApplicationProvider.getApplicationContext(),MainActivity.class).putExtra("skip_delivery_preflight",true);}
    private static final AtomicInteger sequence=new AtomicInteger();
    static String load(WebView view,String base,String html) {
        String token=String.valueOf(sequence.incrementAndGet());
        String url=Uri.parse(base).buildUpon().appendQueryParameter("_fixture",token).build().toString();
        String clean=html.contains("persist:DKNow")?"":"<script>localStorage.removeItem('persist:DKNow');</script>";
        byte[] page=(clean+"<meta name='cartwise-fixture' content='"+token+"'>"+html).getBytes(StandardCharsets.UTF_8);
        WebViewClient original=view.getWebViewClient();
        view.stopLoading();view.getSettings().setBlockNetworkLoads(false);
        view.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r) {
                original.shouldInterceptRequest(v,r);
                if(r.isForMainFrame() && url.equals(r.getUrl().toString()))
                    return new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream(page));
                return new WebResourceResponse("text/plain","UTF-8",404,"Fixture only",null,new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r) {return original.shouldOverrideUrlLoading(v,r);}
            @Override public void onPageFinished(WebView v,String u) {original.onPageFinished(v,u);}
        });
        view.loadUrl(url);return token;
    }
}
