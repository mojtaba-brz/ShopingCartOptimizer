package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.content.Intent;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DeliverySessionTest {
    private Intent intent(String query) {return new Intent(ApplicationProvider.getApplicationContext(),DigikalaActivity.class).putExtra("query",query).putExtra("item_id","milk");}
    private WebView shop(DigikalaActivity activity) {
        return RetailerFixtures.browser(activity);
    }
    private String eval(ActivityScenario<DigikalaActivity> scenario,String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>("");
        scenario.onActivity(a->shop(a).evaluateJavascript(script,r->{value.set(r);done.countDown();}));
        assertTrue(done.await(5,TimeUnit.SECONDS));return value.get();
    }
    private void waitFor(ActivityScenario<DigikalaActivity> scenario,String script) throws Exception {
        long until=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<until) {if("true".equals(eval(scenario,script)))return;Thread.sleep(100);}
        fail("Timed out: "+script);
    }
    private void fixture(ActivityScenario<DigikalaActivity> scenario,String location) throws Exception {
        AtomicReference<String> token=new AtomicReference<>();
        scenario.onActivity(a->token.set(RetailerFixtures.load(shop(a),"https://www.digikala.com/supermarket/search/shop?q=fixture",
            "<div id='root'><div><p>ارسال به</p><p>"+location+"</p></div><button aria-pressed='true'>ارسال زمان‌دار</button><button aria-pressed='false'>ارسال فوری</button><div><img alt='شیر یک لیتری'><div><p>135,300</p><img src='/supermarket/i/toman.svg'></div><p class='line-through'>165,000</p><button data-cro-id='add-one-more-to-cart'>+</button></div></div>")));
        waitFor(scenario,"document.querySelector('meta[name=cartwise-fixture]')?.content==="+JSONObject.quote(token.get()));

    }
    @Before public void clean() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);
        ApplicationProvider.getApplicationContext().getSharedPreferences("digikala-delivery",0).edit().clear().commit();
    }
    @After public void release() {InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);}
    @Test public void choicePersistsAndChangedAddressOrModeRequiresConfirmation() {
        DeliveryChoice first=new DeliveryChoice(ApplicationProvider.getApplicationContext());first.remember("ارسال به ونک","scheduled");
        DeliveryChoice second=new DeliveryChoice(ApplicationProvider.getApplicationContext());
        assertTrue(second.matches("ارسال به   ونک","scheduled"));
        assertFalse(second.matches("ارسال به آزادی","scheduled"));assertFalse(second.matches("ارسال به ونک","on_demand"));
        assertFalse(second.matches("ارسال به ونک",""));
    }
    @Test public void sameTabAndLiveStateSurviveClosingAndAnotherSearch() throws Exception {
        AtomicReference<WebView> original=new AtomicReference<>();
        try(ActivityScenario<DigikalaActivity> first=ActivityScenario.launch(intent("شیر"))) {
            fixture(first,"ونک");first.onActivity(a->original.set(shop(a)));
            assertEquals("true",eval(first,"!!document.getElementById(\"root\")"));
            eval(first,"window.deliveryMarker='selected';sessionStorage.setItem('delivery-test','vanak');true");
            assertEquals("true",eval(first,"window.deliveryMarker==='selected' && sessionStorage.getItem('delivery-test')==='vanak'"));
        }
        try(ActivityScenario<DigikalaActivity> next=ActivityScenario.launch(intent("پنیر"))) {
            next.onActivity(a->assertSame(original.get(),shop(a)));
            waitFor(next,"location.search.includes(encodeURIComponent('پنیر'))");
            assertEquals("Retained state: "+eval(next,"JSON.stringify({marker:window.deliveryMarker,saved:sessionStorage.getItem(\"delivery-test\"),bridge:typeof CartwiseAndroid,url:location.href,root:!!document.getElementById(\"root\")})"),"true",eval(next,"window.deliveryMarker==='selected' && sessionStorage.getItem('delivery-test')==='vanak' && typeof CartwiseAndroid==='undefined'"));
            next.recreate();
            next.onActivity(a->assertSame(original.get(),shop(a)));
            assertEquals("true",eval(next,"window.deliveryMarker==='selected'"));
        }
    }
    @Test public void sameConfirmedLocationImportsWithoutAnotherDialog() throws Exception {
        new DeliveryChoice(ApplicationProvider.getApplicationContext()).remember("ارسال به ونک","scheduled");
        try(ActivityScenario<DigikalaActivity> scenario=ActivityScenario.launchActivityForResult(intent("شیر"))) {
            fixture(scenario,"ونک");
            AtomicReference<String> reader=new AtomicReference<>();
            scenario.onActivity(a->{try(java.io.InputStream in=a.getAssets().open("digikala-capture.js")){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);reader.set(out.toString("UTF-8"));}catch(Exception e){throw new RuntimeException(e);}});
            String captured=eval(scenario,reader.get());
            AtomicReference<String> nativeUrl=new AtomicReference<>("");scenario.onActivity(a->nativeUrl.set(shop(a).getUrl()));
            assertTrue("Native fixture URL: "+nativeUrl.get(),DigikalaActivity.retailer(android.net.Uri.parse(nativeUrl.get())));
            scenario.onActivity(a->{ViewGroup root=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);((Button)((ViewGroup)root.getChildAt(0)).getChildAt(1)).performClick();});
            long until=System.currentTimeMillis()+10000;
            while(scenario.getState()!=Lifecycle.State.DESTROYED && System.currentTimeMillis()<until)Thread.sleep(100);
            AtomicReference<String> nativeStatus=new AtomicReference<>("");
            if(scenario.getState()!=Lifecycle.State.DESTROYED) scenario.onActivity(a->{ViewGroup root=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);nativeStatus.set(((android.widget.TextView)root.getChildAt(1)).getText().toString());});
            assertEquals("Repeated import status: "+nativeStatus.get()+"; capture: "+captured,Lifecycle.State.DESTROYED,scenario.getState());
            assertEquals(Activity.RESULT_OK,scenario.getResult().getResultCode());
            JSONObject data=new JSONObject(scenario.getResult().getResultData().getStringExtra("live_data"));
            assertEquals("scheduled",data.getString("shipment_type"));assertEquals("ارسال به ونک",data.getString("location"));
        }
    }
    @Test public void headerlessPageDoesNotTrustAnOldChoiceAfterSessionDiscard() throws Exception {
        new DeliveryChoice(ApplicationProvider.getApplicationContext()).remember("ارسال به ونک","scheduled");
        try(ActivityScenario<DigikalaActivity> scenario=ActivityScenario.launch(intent("شیر"))) {
            fixture(scenario,"ونک");
            eval(scenario,"document.querySelector('#root > div').remove();true");
            scenario.onActivity(a->{ViewGroup root=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);((Button)((ViewGroup)root.getChildAt(0)).getChildAt(1)).performClick();});
            long until=System.currentTimeMillis()+5000;AtomicReference<String> text=new AtomicReference<>("");
            while(System.currentTimeMillis()<until){scenario.onActivity(a->{ViewGroup root=(ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);text.set(((android.widget.TextView)root.getChildAt(1)).getText().toString());});if(text.get().contains("یک‌بار آدرس"))break;Thread.sleep(100);}
            assertTrue(text.get(),text.get().contains("یک‌بار آدرس"));
            assertEquals(Lifecycle.State.RESUMED,scenario.getState());
        }
    }
    @Test public void explicitAddressChangeInvalidatesTheRetainedLocation() {
        RetailerSession.confirmDelivery("ارسال به ونک","scheduled");assertEquals("ارسال به ونک",RetailerSession.deliveryLocation());
        RetailerSession.noticeNavigation(android.net.Uri.parse("https://www.digikala.com/supermarket?MID=main-change-address"));
        assertEquals("",RetailerSession.deliveryLocation());
        RetailerSession.confirmDelivery("ارسال به آزادی","scheduled");InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);
        assertEquals("",RetailerSession.deliveryLocation());
    }

}
