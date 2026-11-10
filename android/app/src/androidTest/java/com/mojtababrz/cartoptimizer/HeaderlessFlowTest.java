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
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{RetailerSession.discard();android.webkit.WebStorage.getInstance().deleteAllData();});
        ApplicationProvider.getApplicationContext().getSharedPreferences("digikala-delivery",0).edit().clear().commit();
    }
    @After public void cleanup() {InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
        for(Activity a:new java.util.ArrayList<>(ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))) if(a instanceof DigikalaActivity)a.finish();
        RetailerSession.discard();
    });}
    private WebView planner(MainActivity a) {return (WebView)((ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);}
    private WebView browser(DigikalaActivity a) {return RetailerFixtures.browser(a);}
    private String eval(WebView view,String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>("");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.evaluateJavascript(script,r->{value.set(r);latch.countDown();}));
        assertTrue("JS callback",latch.await(5,TimeUnit.SECONDS));return value.get();
    }
    private void waitFor(WebView view,String condition) throws Exception {
        long until=System.currentTimeMillis()+60000;
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
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->token.set(RetailerFixtures.load(browser(a),"https://www.digikalajet.com/search/shop?q=fixture",body)));
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
        while(System.currentTimeMillis()<until){
            AtomicReference<Boolean> returned=new AtomicReference<>(false);InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{for(Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof MainActivity)returned.set(true);});if(returned.get())return;
            AccessibilityNodeInfo root=InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if(root!=null) for(AccessibilityNodeInfo n:root.findAccessibilityNodeInfosByText("ادامه"))if(n.isClickable()&&n.performAction(AccessibilityNodeInfo.ACTION_CLICK))return;
            Thread.sleep(100);
        }throw new AssertionError("Delivery confirmation did not appear");
    }
    @Test public void selectAreaSearchWithoutHeaderImportAndCalculate() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())) {
            AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(planner(a)));WebView main=ref.get();
            waitFor(main,"Boolean(window.CartwiseLive && document.getElementById('live-location-button'))");
            eval(main,"localStorage.clear();state=initialState();state.items=[{id:'milk',name:'شیر',quantity:1}];dirty.clear();save();CartwiseAndroid.openDigikala('','',true);true");
            DigikalaActivity first=child();
            page(first,"<div id='root'><div><p>ارسال به</p><p>تهران، انقلاب</p></div><button aria-pressed='true'>ارسال زمان‌دار</button><button aria-pressed='false'>ارسال فوری</button><span id='fixture-ready'></span></div>");
            read(first);continueChoice();
            waitFor(main,"document.getElementById('live-location').textContent.includes('انقلاب')");
            assertEquals("ارسال به تهران، انقلاب",RetailerSession.deliveryLocation());
            assertEquals("on_demand",RetailerSession.deliveryMode());
            // The automatic UI intentionally has no per-item retailer button.
            // Exercise the retained legacy import bridge directly for this fixture.
            eval(main,"CartwiseAndroid.openDigikala('milk','شیر',false);true");
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
            waitFor(main,"document.getElementById('results').textContent.includes('۱۴۵٬۳۰۰')");
            String deliveryState=eval(main,"JSON.stringify({context:state.context,price:state.offers[0].promo_price})");
            assertEquals(deliveryState,"true",eval(main,"state.context.includes('انقلاب') && state.context.includes('on_demand') && state.offers[0].promo_price===1353000"));
            // Feed a captured search response through the Android result event and
            // verify the new list-to-review UI without a dependency on live prices.
            eval(main,"state.items=[{id:'pasta',name:'ماکارونی',quantity:1}];save();document.getElementById('optimize').click();true");
            DigikalaActivity automatic=child();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(automatic::finish);
            waitFor(main,"!busy");
            eval(main,"window.dispatchEvent(new CustomEvent('cartwise:auto-results',{detail:JSON.stringify({source:'digikala-automatic',location:'ارسال به تهران، انقلاب',shipment_type:'on_demand',items:[{id:'pasta',products:[{title:'ماکارونی ساده',regular_price:1353000,promo_price:null},{title:'پاستا 500 گرم',regular_price:1000000,promo_price:null},{title:'پنیر آزمون',regular_price:500000,promo_price:null}]}]})}));true");
            waitFor(main,"document.getElementById('results').textContent.includes('۱۳۵٬۳۰۰') && document.getElementById('results').textContent.includes('برآورد')");
            eval(main,"document.querySelector('[data-change-item]').click();document.querySelector('[data-choice-unit=g]').click();true");
            waitFor(main,"document.querySelector('#choice-list').textContent.includes('پاستا 500 گرم')");
            assertEquals("false",eval(main,"document.querySelector('[data-selected-product]').textContent.includes('پاستا')"));
            assertEquals("false",eval(main,"document.querySelector('#choice-list').textContent.includes('پنیر آزمون')"));
            assertEquals("true",eval(main,"typeof window.CartwiseAndroid.suggestOffline==='undefined'"));
            eval(main,"document.querySelector('[data-choice-id][data-review=true]').click();true");
            waitFor(main,"document.querySelector('[data-selected-product]')?.textContent.includes('پاستا 500 گرم')");
        }
    }
    @Test public void automaticSearchLoadsFurtherResultsAndComparesAmounts() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())) {
            AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(planner(a)));WebView main=ref.get();
            waitFor(main,"Boolean(window.CartwiseAuto && document.getElementById('live-location-button'))");
            eval(main,"localStorage.clear();state=initialState();state.items=[{id:'milk',name:'شیر 2 لیتر',quantity:1}];dirty.clear();save();CartwiseAndroid.openDigikala('','',true);true");
            DigikalaActivity first=child();
            // The real address bootstrap has no products. Keep that route separate
            // from search so the stale-response guard remains exercised correctly.
            page(first,"<style>body{min-height:2400px}img{width:60px;height:60px}</style><div id='root'><div><p>ارسال به</p><p>تهران، انقلاب</p></div><button aria-pressed='true'>ارسال زمان‌دار</button><button aria-pressed='false'>ارسال فوری</button></div><script>function card(t,p){return '<div><img alt=\"'+t+'\"><div><p>'+p+'</p><img src=\"/supermarket/i/toman.svg\"></div><button data-cro-id=\"add-one-more-to-cart\">+</button></div>'}window.addEventListener('popstate',()=>{if(location.pathname==='/'||location.pathname==='/user/add-address'){document.getElementById('root').innerHTML='<p>ارسال به تهران، انقلاب</p>';return;}document.getElementById('root').innerHTML=card('شیر 1 لیتر','100');window.scrollTo(0,0)});window.addEventListener('scroll',()=>{if(location.pathname==='/search/v2/result'&&!document.getElementById('extra')&&scrollY>0){let d=document.createElement('div');d.id='extra';d.innerHTML=card('شیر 500 میلی لیتر','30');document.getElementById('root').appendChild(d)}});</script>");
            read(first);continueChoice();
            waitFor(main,"document.getElementById('live-location').textContent.includes('انقلاب')");
            eval(main,"document.getElementById('optimize').click();true");
            waitFor(main,"document.getElementById('results').textContent.includes('شیر 500 میلی لیتر') && document.getElementById('results').textContent.includes('۱۲۰')");
        }
    }
    @Test public void automaticSearchRestoresRetailerConfirmedAreaAfterSessionRestart() throws Exception {
        new DeliveryChoice(ApplicationProvider.getApplicationContext()).rememberJet("ارسال به تهران، انقلاب","");
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())) {
            AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(planner(a)));WebView main=ref.get();
            waitFor(main,"Boolean(window.CartwiseAuto && document.getElementById('optimize'))");
            eval(main,"localStorage.clear();state=initialState();state.items=[{id:'bread',name:'نان',quantity:1}];dirty.clear();save();document.getElementById('optimize').click();true");
            DigikalaActivity browser=child();
            page(browser,"<div id='root'><div><p>ارسال به</p><p>تهران، انقلاب</p></div><button aria-pressed='true'>ارسال زمان‌دار</button><button aria-pressed='false'>ارسال فوری</button></div><script>window.addEventListener('popstate',()=>{document.getElementById('root').innerHTML='<div><img alt=\"نان تست\" style=\"width:60px;height:60px\"><div><p>100</p><img src=\"/supermarket/i/toman.svg\"></div><button data-cro-id=\"add-one-more-to-cart\">+</button></div>'})</script>");
            waitFor(main,"document.getElementById('results').textContent.includes('نان تست') && document.getElementById('results').textContent.includes('۱۰۰')");
        }
    }
    @Test public void savedPickerReplaysAutomaticallyBehindProgressScreen() throws Exception {
        new DeliveryChoice(ApplicationProvider.getApplicationContext()).rememberJet("ارسال به ونک","");
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())) {
            AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(planner(a)));WebView main=ref.get();
            waitFor(main,"Boolean(window.CartwiseComparison && document.getElementById('optimize'))");
            eval(main,"localStorage.clear();state=initialState();state.items=[{id:'bread',name:'نان 1 کیلوگرم',quantity:1}];dirty.clear();save();document.getElementById('optimize').click();true");
            DigikalaActivity automatic=child();
            page(automatic,"<div id='root'><div role='dialog'><button onclick=\"document.getElementById('root').innerHTML='<p>ارسال به ونک</p><button aria-pressed=true>ارسال زمان‌دار</button>'\">ونک</button></div></div><script>window.addEventListener('popstate',()=>{document.getElementById('root').innerHTML='<div data-store-name=\"بهار\" data-store-id=\"s1\"><img alt=\"نان 1 کیلوگرم\" src=\"https://dkstatics-public.digikala.com/fixture.jpg\" style=\"width:60px;height:60px\"><p>شگفت‌انگیز</p><div><p>100</p><img src=\"/supermarket/i/toman.svg\"></div><p class=\"line-through\">150</p><button data-cro-id=\"add-one-more-to-cart\">+</button></div>'})</script>");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
                WebView web=browser(automatic);assertEquals(android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS,web.getImportantForAccessibility());
                ViewGroup frame=(ViewGroup)web.getParent();assertEquals(android.view.View.VISIBLE,frame.getChildAt(1).getVisibility());
                assertEquals(android.view.View.VISIBLE,web.getVisibility());
            });
            waitFor(main,"document.querySelector('#results')?.textContent.includes('نان 1 کیلوگرم') && document.querySelector('#results')?.textContent.includes('شگفت‌انگیز')");
            assertEquals("true",eval(main,"document.querySelector('#results').textContent.includes('بهار') && document.querySelector('#results').textContent.includes('۱۵۰') && document.querySelector('.product-result img').getAttribute('src').startsWith('/assets/product-image')"));
        }
    }

    @Test public void jetReadsAllProductsFromEachStoreAndKeepsMerchantIdentity() throws Exception {
        new DeliveryChoice(ApplicationProvider.getApplicationContext()).rememberJet("ارسال به ونک","");
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())){
            AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(planner(a)));WebView main=ref.get();
            waitFor(main,"Boolean(window.CartwiseComparison)");
            eval(main,"localStorage.clear();state=initialState();state.items=[{id:'milk',name:'شیر 1 لیتر',quantity:1}];dirty.clear();save();document.getElementById('optimize').click();true");
            DigikalaActivity automatic=child();String html;
            try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("jet-search.html")){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);html=out.toString("UTF-8");}
            page(automatic,html);
            waitFor(main,"document.querySelector('#results')?.textContent.includes('۲۴ نتیجه خوانده‌شده')");
            assertEquals("true",eval(main,"document.querySelector('.product-result .store-name').textContent.includes('فروشگاه ب') && document.querySelector('[data-selected-product]').textContent.includes('نمونه 11') && document.querySelector('.product-result .unit-price').textContent.includes('۲۰')"));
        }
    }
    @Test public void startupRestoresJetLocationBeforeAnyShoppingListSearch() throws Exception {
        DeliveryChoice choice=new DeliveryChoice(ApplicationProvider.getApplicationContext());choice.rememberJet("ارسال به ونک","35.7|51.4");
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            DigikalaActivity startup=child();
            page(startup,"<div id='root'><p id='place'></p></div><script>const a=JSON.parse(JSON.parse(localStorage.getItem('persist:DKNow')).address).defaultAddress;document.getElementById('place').textContent='ارسال به '+a.addressAddress;fetch('https://api.digikalajet.ir/v3/main-page/?latitude='+a.addressLatitude+'&longitude='+a.addressLongitude);</script>");
            AtomicReference<WebView> ref=new AtomicReference<>();scenario.onActivity(a->ref.set(planner(a)));WebView main=ref.get();
            waitFor(main,"document.getElementById('live-location')?.textContent.includes('ونک')");
            long until=System.currentTimeMillis()+45000;boolean returned=false;
            while(System.currentTimeMillis()<until){AtomicReference<Boolean> resumed=new AtomicReference<>(false);InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{for(Activity a:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED))if(a instanceof MainActivity)resumed.set(true);});if(resumed.get()){returned=true;break;}Thread.sleep(100);}
            assertTrue("Startup must actually finish validation and return to the planner; a saved label alone is not proof",returned);
            assertTrue(new DeliveryChoice(ApplicationProvider.getApplicationContext()).isJet());
            assertEquals("35.7|51.4",new DeliveryChoice(ApplicationProvider.getApplicationContext()).coordinates());
            assertEquals("on_demand",RetailerSession.deliveryMode());
        }
    }

}
