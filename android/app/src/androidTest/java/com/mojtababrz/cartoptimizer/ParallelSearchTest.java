package com.mojtababrz.cartoptimizer;

import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ParallelSearchTest {
    private String asset(android.content.Context context,String name)throws Exception{try(java.io.InputStream in=context.getAssets().open(name)){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}}
    @Test public void independentWorkersReadBothItemsAndAllStorePages()throws Exception{
        String html=asset(InstrumentationRegistry.getInstrumentation().getContext(),"jet-search.html")+"<script>if(location.pathname==='/user/add-address')document.querySelector('#root').insertAdjacentHTML('beforeend','<input placeholder=\"جستجوی آدرس\">');</script>";
        byte[] bytes=html.getBytes(StandardCharsets.UTF_8);CountDownLatch done=new CountDownLatch(1);AtomicReference<String> error=new AtomicReference<>();AtomicReference<JSONArray> results=new AtomicReference<>();AtomicReference<JetSearchPool> pool=new AtomicReference<>();AtomicReference<ViewGroup> frame=new AtomicReference<>();java.util.concurrent.atomic.AtomicInteger peak=new java.util.concurrent.atomic.AtomicInteger();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())){
            scenario.onActivity(a->{try{
                ViewGroup parent=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);frame.set(parent);
                String pref=asset(a,"jet-location.js"),point=asset(a,"jet-delivery-point.js"),saved="{location:'ارسال به ونک',coordinates:'35.75|51.4'}";
                String init="("+pref+")('select',"+saved+");("+point+")('35.75|51.4');";
                JSONArray items=new JSONArray("[{id:'m',name:'شیر',query:'شیر',quantity:1},{id:'n',name:'شیر 2 لیتر',query:'شیر',quantity:1}]");
                JetSearchPool value=new JetSearchPool(a,parent,items,"35.75|51.4",init,new JetSearchPool.Listener(){
                    public void progress(int c,int p,int s,int n,String detail){peak.set(Math.max(peak.get(),n));}
                    public void failed(String message){error.set(message);done.countDown();}
                    public void complete(JSONArray items,JSONArray quotes,JSONObject budget){results.set(items);done.countDown();}
                },context->{WebView web=new WebView(context);web.setWebChromeClient(new android.webkit.WebChromeClient(){@Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message){if(message.messageLevel()==android.webkit.ConsoleMessage.MessageLevel.ERROR)System.out.println("Fixture worker JS: "+message.message());return true;}});web.setWebViewClient(new WebViewClient(){@Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return r.isForMainFrame()?new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream(bytes)):new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}});return web;},new JSONObject().put("workers",2).put("base_carts",3).put("max_carts",4).put("state_limit",40000).put("solve_ms",400));pool.set(value);value.start();
            }catch(Exception e){error.set(e.toString());done.countDown();}});
            assertTrue("Worker pool completes",done.await(120,TimeUnit.SECONDS));assertNull(error.get());assertEquals(2,results.get().length());assertEquals("Actual store tasks overlap",2,peak.get());
            for(int i=0;i<2;i++){JSONArray products=results.get().getJSONObject(i).getJSONArray("products");assertEquals(24,products.length());boolean cheap=false;for(int n=0;n<products.length();n++){JSONObject p=products.getJSONObject(n);if(p.getString("store_id").equals("b")&&p.getLong("regular_price")==200)cheap=true;}assertTrue("Later full-store product retained",cheap);}
            scenario.onActivity(a->assertEquals("Worker views removed after completion",1,frame.get().getChildCount()));
        }finally{InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{if(pool.get()!=null)pool.get().stop();RetailerSession.discard();});}
    }
}
