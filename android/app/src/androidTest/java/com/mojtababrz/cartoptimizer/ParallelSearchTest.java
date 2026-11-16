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
    @Test public void independentWorkersReadBothItemsAndAllStorePages()throws Exception{runPool(false,false);}
    @Test public void memoryPressureRetiresWorkersWithoutDroppingStoreTasks()throws Exception{runPool(true,false);}
    @Test public void cachedFeesSkipOnlyStorefrontInspections()throws Exception{runPool(false,true);}
    private void runPool(boolean pressure,boolean cached)throws Exception{
        String html=asset(InstrumentationRegistry.getInstrumentation().getContext(),"jet-search.html")+"<script>if(location.pathname==='/user/add-address')document.querySelector('#root').insertAdjacentHTML('beforeend','<input placeholder=\"جستجوی آدرس\">');</script>";
        html+="<script>window.addEventListener('popstate',()=>{if(location.pathname==='/v4/shop')console.info('CartwiseFeesHeader')});</script>";byte[] bytes=html.getBytes(StandardCharsets.UTF_8);CountDownLatch done=new CountDownLatch(1);AtomicReference<String> error=new AtomicReference<>();AtomicReference<JSONArray> results=new AtomicReference<>();AtomicReference<JSONArray> feeQuotes=new AtomicReference<>();AtomicReference<JSONObject> finalBudget=new AtomicReference<>();java.util.concurrent.atomic.AtomicBoolean reduced=new java.util.concurrent.atomic.AtomicBoolean();AtomicReference<JetSearchPool> pool=new AtomicReference<>();AtomicReference<ViewGroup> frame=new AtomicReference<>();java.util.concurrent.atomic.AtomicInteger headerReads=new java.util.concurrent.atomic.AtomicInteger();java.util.concurrent.atomic.AtomicInteger peak=new java.util.concurrent.atomic.AtomicInteger();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())){
            scenario.onActivity(a->{try{
                ViewGroup parent=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);frame.set(parent);
                String pref=asset(a,"jet-location.js"),point=asset(a,"jet-delivery-point.js"),saved="{location:'ارسال به ونک',coordinates:'35.75|51.4'}";
                String init="("+pref+")('select',"+saved+");("+point+")('35.75|51.4');";
                JSONArray items=new JSONArray("[{id:'m',name:'شیر',query:'شیر',quantity:1},{id:'n',name:'شیر 2 لیتر',query:'شیر',quantity:1}]");
                JetSearchPool value=new JetSearchPool(a,parent,items,"35.75|51.4",init,new JetSearchPool.Listener(){
                    public void progress(int c,int p,int s,int n,String detail){peak.set(Math.max(peak.get(),n));if(pressure&&n==2&&reduced.compareAndSet(false,true))pool.get().conserveMemory();}
                    public void failed(String message){error.set(message);done.countDown();}
                    public void complete(JSONArray items,JSONArray quotes,JSONObject budget){results.set(items);feeQuotes.set(quotes);finalBudget.set(budget);done.countDown();}
                },context->{WebView web=new WebView(context);web.setWebChromeClient(new android.webkit.WebChromeClient(){@Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message){if(message.message().equals("CartwiseFeesHeader"))headerReads.incrementAndGet();if(message.messageLevel()==android.webkit.ConsoleMessage.MessageLevel.ERROR)System.out.println("Fixture worker JS: "+message.message());return true;}});web.setWebViewClient(new WebViewClient(){@Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return r.isForMainFrame()?new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream(bytes)):new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}});return web;},new JSONObject().put("workers",2).put("base_carts",3).put("max_carts",4).put("state_limit",40000).put("solve_ms",400));pool.set(value);if(cached)value.useCachedFees(new JSONObject().put("coordinates","35.75|51.4").put("shipment_type","on_demand").put("checks",new JSONArray().put(new JSONObject().put("store_id","a").put("store_type","supermarket").put("captured_at",java.time.Instant.now().toString()).put("observed",true)).put(new JSONObject().put("store_id","b").put("store_type","supermarket").put("captured_at",java.time.Instant.now().toString()).put("observed",true))).toString());value.start();
            }catch(Exception e){error.set(e.toString());done.countDown();}});
            assertTrue("Worker pool completes",done.await(120,TimeUnit.SECONDS));assertNull(error.get());assertEquals(2,results.get().length());assertEquals("Actual store tasks overlap",2,peak.get());
            if(pressure){assertTrue(reduced.get());assertEquals(1,finalBudget.get().getInt("workers"));assertEquals("Search pressure preserves optimization budget",4,finalBudget.get().getInt("max_carts"));}
            for(int i=0;i<2;i++){JSONArray products=results.get().getJSONObject(i).getJSONArray("products");assertEquals(24,products.length());boolean cheap=false;for(int n=0;n<products.length();n++){JSONObject p=products.getJSONObject(n);if(p.getString("store_id").equals("b")&&p.getLong("regular_price")==200)cheap=true;}assertTrue("Later full-store product retained",cheap);}
            assertEquals("Cached inspections do not navigate to the storefront",cached?0:2,headerReads.get());
            java.util.Map<String,Long> deliveryFees=new java.util.HashMap<>();
            for(int i=0;i<feeQuotes.get().length();i++){JSONObject quote=feeQuotes.get().getJSONObject(i),field=quote.getJSONObject("fields").optJSONObject("delivery_fee");if(field!=null)deliveryFees.put(quote.getString("store_id"),field.getLong("value"));}
            if(!cached){assertEquals("Current storefront shipping in rials",Long.valueOf(404000),deliveryFees.get("a"));assertEquals(Long.valueOf(429500),deliveryFees.get("b"));}else assertEquals("Cached observations do not acquire a new inspection timestamp",0,finalBudget.get().getJSONArray("fee_checks").length());
            scenario.onActivity(a->assertEquals("Worker views removed after completion",1,frame.get().getChildCount()));
        }finally{InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{if(pool.get()!=null)pool.get().stop();RetailerSession.discard();});}
    }
}
