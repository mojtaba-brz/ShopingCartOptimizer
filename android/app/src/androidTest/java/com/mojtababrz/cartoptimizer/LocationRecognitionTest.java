package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.content.Intent;
import android.webkit.WebView;
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

/** Real WebView handoff for addresses already registered in Jet, with no header,
 * click marker or latitude-bearing catalog request to lean on. */
@RunWith(AndroidJUnit4.class)
public class LocationRecognitionTest {
    @Before public void clean(){InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{RetailerSession.discard();android.webkit.WebStorage.getInstance().deleteAllData();});new DeliveryChoice(ApplicationProvider.getApplicationContext()).clear();}
    @After public void release(){InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);}
    private Intent prepare(){return new Intent(ApplicationProvider.getApplicationContext(),DigikalaActivity.class).putExtra("prepare_location",true);}
    private void fixture(ActivityScenario<DigikalaActivity> s,String path,String html)throws Exception{
        AtomicReference<String> token=new AtomicReference<>();s.onActivity(a->token.set(RetailerFixtures.load(RetailerFixtures.browser(a),"https://www.digikalajet.com/"+path,html)));
        for(int i=0;i<100;i++){if(s.getState()==Lifecycle.State.DESTROYED)return;String r=eval(s,"document.querySelector('meta[name=cartwise-fixture]')?.content==="+JSONObject.quote(token.get()));if("true".equals(r))return;Thread.sleep(100);}fail("Fixture not loaded");
    }
    private String eval(ActivityScenario<DigikalaActivity> s,String js)throws Exception{
        AtomicReference<String> out=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
        s.onActivity(a->RetailerFixtures.browser(a).evaluateJavascript(js,r->{out.set(r);done.countDown();}));assertTrue(done.await(5,TimeUnit.SECONDS));return out.get();
    }
    private JSONObject result(ActivityScenario<DigikalaActivity> s)throws Exception{
        for(int i=0;i<200&&s.getState()!=Lifecycle.State.DESTROYED;i++)Thread.sleep(100);
        assertEquals("A registered address must return automatically",Lifecycle.State.DESTROYED,s.getState());assertEquals(Activity.RESULT_OK,s.getResult().getResultCode());
        return new JSONObject(s.getResult().getResultData().getStringExtra("live_data"));
    }
    @Test public void guestRegistrationWithoutHeaderOrButtonEventWaitsForMapThenReturns()throws Exception{
        try(ActivityScenario<DigikalaActivity> s=ActivityScenario.launchActivityForResult(prepare())){
            fixture(s,"user/add-address","<div id='root'></div><div id='modal-root'><p>انتخاب از روی نقشه</p></div><script>const save=p=>localStorage.setItem('persist:DKNow',JSON.stringify({user:'NEVER_COPY_ACCOUNT',address:JSON.stringify({isLocationMode:true,isUsingDefaultLocation:false,defaultAddress:p})}));save({addressName:'پیش فرض',addressLatitude:35.780833,addressLongitude:51.464139});setTimeout(()=>save({addressAddress:'تهران، میدان ونک',addressLatitude:35.75,addressLongitude:51.4}),700);setTimeout(()=>document.getElementById('modal-root').style.cssText='position:fixed;top:100vh;width:0;height:0;overflow:hidden',2400);</script>");
            Thread.sleep(1200);assertEquals("Do not accept a choice while the map is still open",Lifecycle.State.RESUMED,s.getState());
            JSONObject data=result(s);assertEquals("ارسال به تهران، میدان ونک",data.getString("location"));assertTrue(data.getBoolean("location_only"));
            assertEquals("35.75|51.4",new DeliveryChoice(ApplicationProvider.getApplicationContext()).coordinates());assertFalse(data.toString().contains("NEVER_COPY_ACCOUNT"));
        }
    }
    @Test public void cachedAccountChoiceWithoutHeaderOrNetworkOverridesOldAppBookmark()throws Exception{
        Intent manual=new Intent(ApplicationProvider.getApplicationContext(),DigikalaActivity.class).putExtra("query","fixture");
        try(ActivityScenario<DigikalaActivity> seed=ActivityScenario.launch(manual)){
            fixture(seed,"search/v2/result?q=fixture","<div id='root'><p>موقعیت در جت ثبت شد</p></div><script>localStorage.setItem('persist:DKNow',JSON.stringify({user:'KEEP_ACCOUNT',address:JSON.stringify({isLocationMode:false,isUsingDefaultLocation:false,defaultAddress:{addressId:123,addressName:'خانه',addressAddress:'خیابان آزادی',addressLatitude:'35.75001',addressLongitude:'51.41001'}})}));</script>");
        }
        new DeliveryChoice(ApplicationProvider.getApplicationContext()).rememberJet("ارسال به نشانی قدیمی","36|52");
        try(ActivityScenario<DigikalaActivity> s=ActivityScenario.launchActivityForResult(prepare())){
            JSONObject data=result(s);assertEquals("ارسال به خیابان آزادی",data.getString("location"));
            assertEquals("35.75001|51.41001",new DeliveryChoice(ApplicationProvider.getApplicationContext()).coordinates());assertFalse(data.toString().contains("KEEP_ACCOUNT"));assertFalse(data.toString().contains("addressId"));
        }
    }
    @Test public void invalidNewServiceAddressCannotBeHiddenByAnOldConfirmedLabel()throws Exception{
        Intent manual=new Intent(ApplicationProvider.getApplicationContext(),DigikalaActivity.class).putExtra("query","fixture");
        try(ActivityScenario<DigikalaActivity> seed=ActivityScenario.launch(manual)){
            fixture(seed,"search/v2/result?q=fixture","<div id='root'><p>نشانی نیاز به اصلاح دارد</p></div><script>localStorage.setItem('persist:DKNow',JSON.stringify({address:JSON.stringify({isLocationMode:false,defaultAddress:{addressId:123,addressAddress:'نشانی جدید',addressLatitude:35.76,addressLongitude:51.41,addressIsCoordinatesValid:false}})}));</script>");
        }
        new DeliveryChoice(ApplicationProvider.getApplicationContext()).rememberJet("ارسال به نشانی قدیمی","35.75|51.4");
        RetailerSession.confirmJetDelivery("ارسال به نشانی قدیمی","35.75|51.4");
        try(ActivityScenario<DigikalaActivity> s=ActivityScenario.launchActivityForResult(prepare())){
            Thread.sleep(2000);assertEquals("A stale in-memory label must not stand in for an invalid new address",Lifecycle.State.RESUMED,s.getState());
            assertTrue(eval(s,"localStorage.getItem('persist:DKNow')").contains("addressIsCoordinatesValid"));
            s.onActivity(a->{try{java.lang.reflect.Field f=DigikalaActivity.class.getDeclaredField("read");f.setAccessible(true);((android.widget.Button)f.get(a)).performClick();}catch(Exception e){throw new AssertionError(e);}});
            Thread.sleep(700);assertEquals("Manual verification must also reject the invalid address",Lifecycle.State.RESUMED,s.getState());
        }
    }

}
