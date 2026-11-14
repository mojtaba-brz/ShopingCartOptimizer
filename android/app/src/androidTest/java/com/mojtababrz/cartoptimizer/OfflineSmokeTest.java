package com.mojtababrz.cartoptimizer;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class OfflineSmokeTest {
    private String eval(ActivityScenario<MainActivity> scenario, String javascript) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>("");
        scenario.onActivity(activity -> {
            android.view.ViewGroup content = activity.findViewById(android.R.id.content);
            android.view.ViewGroup frame = (android.view.ViewGroup) content.getChildAt(0);
            WebView web = (WebView) frame.getChildAt(0);
            web.evaluateJavascript(javascript, result -> { value.set(result); done.countDown(); });
        });
        assertTrue("JavaScript callback did not arrive", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }
    private void waitFor(ActivityScenario<MainActivity> scenario, String condition) throws Exception {
        long deadline = System.currentTimeMillis() + 30000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(eval(scenario, condition))) return;
            Thread.sleep(200);
        }
        throw new AssertionError("UI condition timed out: " + condition);
    }
    @Test public void demoWorksOfflineAndWorkspaceSurvivesRecreation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(RetailerFixtures.plannerIntent())) {
            waitFor(scenario, "Boolean(window.CartwiseEngine && document.getElementById('demo'))");
            eval(scenario, "localStorage.clear();state=initialState();dirty.clear();save();document.getElementById('demo').click();true");
            waitFor(scenario, "document.getElementById('source-badge').textContent.includes('نمونه')");
            eval(scenario, "CartwiseEngine.optimize(state).then(renderPlan);true");
            waitFor(scenario, "document.getElementById('results').textContent.includes('۳۷۵٬۰۰۰')");
            assertTrue(eval(scenario, "document.getElementById('results').textContent.includes('بهینه')").equals("true"));
            scenario.recreate();
            waitFor(scenario, "Boolean(document.getElementById('source-badge') && document.getElementById('source-badge').textContent.includes('نمونه'))");
            assertTrue(eval(scenario, "document.querySelectorAll('.item-row').length === 3").equals("true"));
        }
    }
    @Test public void liveImportAddsPricesChecksFeesAndSurvivesRecreation() throws Exception {
        try (ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())) {
            waitFor(scenario,"Boolean(window.CartwiseLive && document.getElementById('live-location-button'))");
            eval(scenario,"localStorage.clear();state=initialState();state.items=[{id:'milk',name:'شیر',quantity:1}];dirty.clear();save();true");
            eval(scenario,"window.dispatchEvent(new CustomEvent('cartwise:live',{detail:{source:'digikala-live-page',captured_at:new Date().toISOString(),location:'ارسال به ونک',shipment_type:'scheduled',page_url:'https://www.digikalajet.com/search/shop',item_id:'milk',products:[{title:'شیر یک لیتری',regular_price:1650000,promo_price:1353000}]}}));true");
            waitFor(scenario,"document.querySelectorAll('[data-live-add]').length===1");
            eval(scenario,"document.querySelector('[data-live-add]').click();true");
            assertTrue(eval(scenario,"state.offers.length===1 && state.offers[0].promo_price===1353000 && state.offers[0].stock===1").equals("true"));
            assertTrue(eval(scenario,"CartwiseLive.checkBeforeOptimize(state).includes('delivery and order rules')").equals("true"));
            eval(scenario,"showTab('rules');document.getElementById('store-edit').value=state.offers[0].store_id;document.getElementById('store-edit').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('store-form').elements.delivery_fee.value='10000';document.getElementById('live-fees-checked').checked=true;document.getElementById('store-form').requestSubmit();true");
            waitFor(scenario,"state.stores.find(s=>s.id===state.offers[0].store_id).delivery_fee===100000 && !dirty.size");
            eval(scenario,"CartwiseEngine.optimize(state).then(renderPlan);true");
            waitFor(scenario,"document.getElementById('results').textContent.includes('۱۴۵٬۳۰۰')");
            scenario.recreate();
            waitFor(scenario,"Boolean(window.CartwiseLive && state.offers.length===1 && document.getElementById('live-location').textContent.includes('ونک'))");
            assertTrue(eval(scenario,"!CartwiseLive.checkBeforeOptimize(state)").equals("true"));
            eval(scenario,"window.dispatchEvent(new CustomEvent('cartwise:live',{detail:{source:'digikala-live-page',captured_at:new Date().toISOString(),location:'ارسال به آزادی',shipment_type:'scheduled',page_url:'https://www.digikalajet.com/',location_only:true,products:[]}}));true");
            assertTrue(eval(scenario,"state.offers[0].confirmed===false").equals("true"));
        }
    }

    @Test public void packageContentsAndAmazingQuotaUseSharedBundledCode() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(RetailerFixtures.plannerIntent())) {
            waitFor(scenario,"Boolean(window.CartwisePackages && window.CartwisePricing && window.CartwiseBasket)");
            assertTrue(eval(scenario,"CartwisePackages.measure('دستمال کاغذی 200 برگ دولا بسته 10 عددی').value===2000 && CartwisePackages.amount('تن ماهی 180 گرمی بسته 3 عددی').value===540").equals("true"));
            assertTrue(eval(scenario,"CartwiseAuto.estimated({regular_price:100,promo_price:80},3)===240").equals("true"));
            eval(scenario,"window.quotaResult=null;CartwiseBasket.solve([{id:'x',name:'کالا',quantity:3}],[{id:'x',products:[{title:'کالا',store_name:'الف',store_id:'a',store_type:'supermarket',regular_price:150,promo_price:10,amazing:true,post_amazing_price:100,post_amazing_verified:true}]}]).then(r=>window.quotaResult=r.best);true");
            waitFor(scenario,"window.quotaResult!==null");
            assertTrue(eval(scenario,"quotaResult.total===120 && quotaResult.picks[0].amazing_quantity===2 && quotaResult.picks[0].base_quantity===1").equals("true"));
        }
    }

}
