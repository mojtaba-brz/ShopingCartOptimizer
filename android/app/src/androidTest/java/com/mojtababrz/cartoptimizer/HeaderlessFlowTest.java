package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises the user's actual native-browser/planner handoff with no search address header. */
@RunWith(AndroidJUnit4.class)
public class HeaderlessFlowTest {
    @Before public void clean() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);
        ApplicationProvider.getApplicationContext().getSharedPreferences("digikala-delivery",0).edit().clear().commit();
    }
    @After public void cleanup() {InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
        for(Activity a:new java.util.ArrayList<>(ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))) if(a instanceof DigikalaActivity)a.finish();
        RetailerSession.discard();
    });}
    private WebView planner(MainActivity a) {return (WebView)((ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);}
    private WebView browser(DigikalaActivity a) {return (WebView)((ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(2);}
    private String eval(WebView view,String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>("");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.evaluateJavascript(script,r->{value.set(r);latch.countDown();}));
        assertTrue("JS callback",latch.await(5,TimeUnit.SECONDS));return value.get();
    }
    private void waitFor(WebView view,String condition) throws Exception {
        long until=System.currentTimeMillis()+20000;
        while(System.currentTimeMillis()<until){if("true".equals(eval(view,condition)))return;Thread.sleep(100);}fail("Timed out: "+condition);
    }
    private DigikalaActivity child() throws Exception {
        long until=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<until){AtomicReference<DigikalaActivity> out=new AtomicReference<>();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{for(Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof DigikalaActivity)out.set((DigikalaActivity)a);});
            if(out.get()!=null)return out.get();Thread.sleep(100);
        }throw new AssertionError("Digikala browser did not open");
    }
    private void page(DigikalaActivity a,String body) throws Exception {
        AtomicReference<String> token=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->token.set(RetailerFixtures.load(browser(a),"https://www.digikala.com/supermarket/search/shop?q=fixture",body)));
        waitFor(browser(a),"document.querySelector('meta[name=cartwise-fixture]')?.content==="+org.json.JSONObject.quote(token.get()));

    }
    private void read(DigikalaActivity a) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            ViewGroup root=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);
            ((Button)((ViewGroup)root.getChildAt(0)).getChildAt(1)).performClick();
        });
    }
    private void continueChoice() throws Exception {
        long until=System.currentTimeMillis()+10000;
        while(System.currentTimeMillis()<until){AccessibilityNodeInfo root=InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if(root!=null) for(AccessibilityNodeInfo n:root.findAccessibilityNodeInfosByText("Continue"))if(n.isClickable()&&n.performAction(AccessibilityNodeInfo.ACTION_CLICK))return;
            Thread.sleep(100);
        }throw new AssertionError("Delivery confirmation did not appear");
    }
    @Test public void selectAreaSearchWithoutHeaderImportAndCalculate() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(planner(a)));WebView main=ref.get();
            waitFor(main,"Boolean(window.CartwiseLive && document.getElementById('live-location-button'))");
            eval(main,"localStorage.clear();state=initialState();state.items=[{id:'milk',name:'شیر',quantity:1}];dirty.clear();save();document.getElementById('live-location-button').click();true");
            DigikalaActivity first=child();
            page(first,"<div id='root'><div><p>ارسال به</p><p>تهران، انقلاب</p></div><button aria-pressed='true'>ارسال زمان‌دار</button><button aria-pressed='false'>ارسال فوری</button><span id='fixture-ready'></span></div>");
            read(first);continueChoice();
            waitFor(main,"document.getElementById('live-location').textContent.includes('انقلاب')");
            assertEquals("ارسال به تهران، انقلاب",RetailerSession.deliveryLocation());
            assertEquals("scheduled",RetailerSession.deliveryMode());
            eval(main,"document.querySelector('[data-live-search]').click();true");
            DigikalaActivity second=child();
            page(second,"<div id='root'><div><img alt='شیر یک لیتری'><div><p>135,300</p><img src='/supermarket/i/toman.svg'></div><p class='line-through'>165,000</p><button data-cro-id='add-one-more-to-cart'>+</button></div><span id='fixture-ready'></span></div>");
            assertEquals("false",eval(browser(second),"document.body.innerText.includes('ارسال به')"));
            read(second);
            waitFor(main,"document.querySelectorAll('[data-live-add]').length===1");
            eval(main,"document.querySelector('[data-live-add]').click();true");
            waitFor(main,"state.offers.length===1");
            eval(main,"showTab('rules');document.getElementById('store-edit').value=state.offers[0].store_id;document.getElementById('store-edit').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('store-form').elements.delivery_fee.value='10000';document.getElementById('live-fees-checked').checked=true;document.getElementById('store-form').requestSubmit();true");
            waitFor(main,"!dirty.size && !CartwiseLive.checkBeforeOptimize(state)");
            // The primary button now starts a new automatic search; validate the imported
            // manual snapshot through the shared engine without launching that flow.
            eval(main,"CartwiseEngine.optimize(state,{timeLimit:5000,stateLimit:200000}).then(r=>document.getElementById('results').textContent=money(r.total));true");
            waitFor(main,"document.getElementById('results').textContent.includes('145,300')");
            String deliveryState=eval(main,"JSON.stringify({context:state.context,price:state.offers[0].promo_price})");
            assertEquals(deliveryState,"true",eval(main,"state.context.includes('انقلاب') && state.context.includes('scheduled') && state.offers[0].promo_price===1353000"));
            // Feed a captured search response through the Android result event and
            // verify the new list-to-review UI without a dependency on live prices.
            eval(main,"document.getElementById('optimize').click();true");
            DigikalaActivity automatic=child();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(automatic::finish);
            waitFor(main,"!busy");
            eval(main,"window.dispatchEvent(new CustomEvent('cartwise:auto-results',{detail:JSON.stringify({source:'digikala-automatic',location:'ارسال به تهران، انقلاب',shipment_type:'scheduled',items:[{id:'milk',products:[{title:'شیر یک لیتری',regular_price:1650000,promo_price:1353000},{title:'پنیر آزمون',regular_price:1000000,promo_price:null}]}]})}));true");
            waitFor(main,"document.getElementById('results').textContent.includes('135,300') && document.getElementById('results').textContent.includes('برآورد')");
            eval(main,"window.dispatchEvent(new CustomEvent('cartwise:ai-results',{detail:{items:JSON.stringify([{id:'milk',name:'شیر',quantity:1,query:'شیر'}]),result:JSON.stringify({items:[{id:'milk',titles:['پنیر آزمون','کالای ساختگی'],examined:2,available:2}]})}}));true");
            waitFor(main,"document.querySelector('[data-auto-item]')?.textContent.includes('پنیر آزمون')");
            assertEquals("false",eval(main,"document.querySelector('.auto-result-item li').textContent.includes('پنیر آزمون')"));
            assertEquals("false",eval(main,"document.querySelector('[data-auto-item]').textContent.includes('کالای ساختگی')"));
            eval(main,"let s=document.querySelector('[data-auto-item]');s.value='ai:پنیر آزمون';s.dispatchEvent(new Event('change'));true");
            waitFor(main,"document.querySelector('.auto-result-item li')?.textContent.includes('پنیر آزمون')");
        }
    }
    @Test public void automaticSearchLoadsFurtherResultsAndComparesAmounts() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(planner(a)));WebView main=ref.get();
            waitFor(main,"Boolean(window.CartwiseAuto && document.getElementById('live-location-button'))");
            eval(main,"localStorage.clear();state=initialState();state.items=[{id:'milk',name:'شیر 2 لیتر',quantity:1}];dirty.clear();save();document.getElementById('live-location-button').click();true");
            DigikalaActivity first=child();
            page(first,"<style>body{min-height:2400px}img{width:60px;height:60px}</style><div id='root'><div><p>ارسال به</p><p>تهران، انقلاب</p></div><button aria-pressed='true'>ارسال زمان‌دار</button><button aria-pressed='false'>ارسال فوری</button></div><script>function card(t,p){return '<div><img alt=\"'+t+'\"><div><p>'+p+'</p><img src=\"/supermarket/i/toman.svg\"></div><button data-cro-id=\"add-one-more-to-cart\">+</button></div>'}window.addEventListener('popstate',()=>{document.getElementById('root').innerHTML=card('شیر 1 لیتر','100');window.scrollTo(0,0)});window.addEventListener('scroll',()=>{if(!document.getElementById('extra')&&scrollY>0){let d=document.createElement('div');d.id='extra';d.innerHTML=card('شیر 500 میلی لیتر','30');document.getElementById('root').appendChild(d)}});</script>");
            read(first);continueChoice();
            waitFor(main,"document.getElementById('live-location').textContent.includes('انقلاب')");
            eval(main,"document.getElementById('optimize').click();true");
            waitFor(main,"document.getElementById('results').textContent.includes('شیر 500 میلی لیتر') && document.getElementById('results').textContent.includes('120')");
        }
    }
}
