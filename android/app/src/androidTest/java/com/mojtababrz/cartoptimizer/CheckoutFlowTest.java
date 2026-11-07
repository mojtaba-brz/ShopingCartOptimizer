package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.content.Intent;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.lifecycle.Lifecycle;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CheckoutFlowTest {
    private WebView browser(Activity a){return (WebView)((ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(2);}
    @Test public void cartReaderReturnsVisibleFeesAndCorrectionsWithoutNativeBridge() throws Exception {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);
        RetailerSession.confirmDelivery("ارسال به تهران، انقلاب","scheduled");
        Intent intent=new Intent(ApplicationProvider.getApplicationContext(),DigikalaActivity.class).putExtra("checkout_only",true);
        try(ActivityScenario<DigikalaActivity> scenario=ActivityScenario.launchActivityForResult(intent)) {
            AtomicReference<String> token=new AtomicReference<>();
            scenario.onActivity(a->token.set(RetailerFixtures.load(browser(a),"https://www.digikala.com/supermarket/cart/",
                "<div id='root'><p>ارسال به تهران، انقلاب</p><button aria-selected='true'>ارسال زمان‌دار</button><div><p>هزینه ارسال</p><span>۲۵٬۰۰۰ تومان</span></div><p>هزینه خدمات ۱٬۰۰۰ تومان</p><p>مبلغ قابل پرداخت ۱۳۶٬۰۰۰ تومان</p><p>قیمت کالا تغییر کرده است</p><div><img alt='شیر کم چرب'><span data-testid='cart-item-quantity'>2</span></div></div>")));
            boolean ready=false;
            for(int n=0;n<80&&!ready;n++){
                CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
                scenario.onActivity(a->browser(a).evaluateJavascript("document.querySelector('meta[name=cartwise-fixture]')?.content==="+JSONObject.quote(token.get())+" && typeof CartwiseAndroid==='undefined'",v->{value.set(v);done.countDown();}));
                assertTrue(done.await(5,TimeUnit.SECONDS));ready="true".equals(value.get());if(!ready)Thread.sleep(100);
            }
            assertTrue("Cart fixture loaded and retailer bridge isolated",ready);
            scenario.onActivity(a->{ViewGroup root=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);((Button)((ViewGroup)root.getChildAt(0)).getChildAt(1)).performClick();});
            for(int n=0;n<80&&scenario.getState()!=Lifecycle.State.DESTROYED;n++)Thread.sleep(100);
            assertEquals(Lifecycle.State.DESTROYED,scenario.getState());assertEquals(Activity.RESULT_OK,scenario.getResult().getResultCode());
            JSONObject quote=new JSONObject(scenario.getResult().getResultData().getStringExtra("live_data")).getJSONObject("checkout");
            assertEquals(250000,quote.getJSONObject("fields").getJSONObject("delivery_fee").getInt("value"));
            assertEquals(1360000,quote.getJSONObject("fields").getJSONObject("total").getInt("value"));
            assertEquals(2,quote.getJSONArray("cart_items").getJSONObject(0).getInt("quantity"));assertTrue(quote.getBoolean("items_complete"));
            assertTrue(quote.getJSONArray("notices").toString().contains("تغییر"));
        }finally{InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);}
    }
    private android.webkit.WebResourceRequest request(String lat,String mode){
        return new android.webkit.WebResourceRequest(){
            public android.net.Uri getUrl(){return android.net.Uri.parse("https://api.digikalajet.ir/first-load/?latitude="+lat+"&longitude=51.4");}
            public boolean isForMainFrame(){return false;}public boolean isRedirect(){return false;}public boolean hasGesture(){return false;}
            public String getMethod(){return "GET";}public java.util.Map<String,String> getRequestHeaders(){return java.util.Collections.singletonMap("shipment-type",mode);}
        };
    }
    @Test public void savedLocationRestoresFromFreshMatchingCatalogAfterRestartButNotChangedCoordinates() {
        android.content.Context context=ApplicationProvider.getApplicationContext();
        new DeliveryChoice(context).clear();RetailerSession.initialize(context);
        RetailerSession.observe(request("35.7","scheduled"));RetailerSession.confirmDelivery("ارسال به تهران، انقلاب","scheduled");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);
        assertEquals("",RetailerSession.deliveryLocation());RetailerSession.observe(request("35.7","scheduled"));
        assertEquals("ارسال به تهران، انقلاب",RetailerSession.deliveryLocation());
        InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);
        RetailerSession.observe(request("35.8","scheduled"));assertEquals("",RetailerSession.deliveryLocation());
        RetailerSession.changingLocation();RetailerSession.observe(request("35.7","scheduled"));assertEquals("",RetailerSession.deliveryLocation());
        InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);new DeliveryChoice(context).clear();
    }
}
