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
    private static final AtomicInteger sequence=new AtomicInteger();
    static String load(WebView view,String base,String html) {
        String token=String.valueOf(sequence.incrementAndGet());
        String url=Uri.parse(base).buildUpon().appendQueryParameter("_fixture",token).build().toString();
        byte[] page=("<meta name='cartwise-fixture' content='"+token+"'>"+html).getBytes(StandardCharsets.UTF_8);
        WebViewClient original=view.getWebViewClient();
        view.stopLoading();view.getSettings().setBlockNetworkLoads(false);
        view.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r) {
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
