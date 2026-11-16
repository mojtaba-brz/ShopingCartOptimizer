package com.mojtababrz.cartoptimizer;

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
import org.junit.Test;
import org.junit.After;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AccountSessionTest {
    private String eval(WebView view,String js)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.evaluateJavascript(js,x->{value.set(x);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();}
    private void waitFor(WebView w,String js)throws Exception{for(int n=0;n<150;n++){if("true".equals(eval(w,js)))return;Thread.sleep(100);}fail("Account condition timed out: "+js);}
    @After public void clean(){InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{JetAccount.save(ApplicationProvider.getApplicationContext(),"disconnected");RetailerSession.discard();android.webkit.WebStorage.getInstance().deleteAllData();new DeliveryChoice(ApplicationProvider.getApplicationContext()).clear();});}
    @Test public void loginPersistsAndLogoutClearsOnlyRetailerStorage()throws Exception{
        android.content.Context context=ApplicationProvider.getApplicationContext();JetAccount.save(context,"disconnected");
        Intent login=new Intent(context,DigikalaActivity.class).putExtra("account_login",true);
        try(ActivityScenario<DigikalaActivity> a=ActivityScenario.launch(login)){
            AtomicReference<WebView> ref=new AtomicReference<>();a.onActivity(x->{ref.set(RetailerFixtures.browser(x));RetailerFixtures.load(ref.get(),"https://www.digikalajet.com/user/login","<div id='root'><input type='tel' value='fixture-only'><button>ادامه</button></div>");});
            waitFor(ref.get(),"Boolean(document.querySelector('input[type=tel]'))");
            a.onActivity(x->{ViewGroup root=(ViewGroup)((ViewGroup)x.findViewById(android.R.id.content)).getChildAt(0);((Button)((ViewGroup)root.getChildAt(0)).getChildAt(1)).performClick();});Thread.sleep(300);
            assertNotEquals("Unfinished login stays open",Lifecycle.State.DESTROYED,a.getState());assertEquals("disconnected",JetAccount.status(context));
            a.onActivity(x->RetailerFixtures.load(ref.get(),"https://www.digikalajet.com/profile","<div id='root'><button>خروج از حساب</button></div><script>localStorage.setItem('fixture-session','private-fixture')</script>"));
            waitFor(ref.get(),"document.body.innerText.includes('خروج از حساب')");
            a.onActivity(x->{ViewGroup root=(ViewGroup)((ViewGroup)x.findViewById(android.R.id.content)).getChildAt(0);((Button)((ViewGroup)root.getChildAt(0)).getChildAt(1)).performClick();});
            for(int n=0;n<100&&a.getState()!=Lifecycle.State.DESTROYED;n++)Thread.sleep(100);
            assertEquals(Lifecycle.State.DESTROYED,a.getState());assertEquals("signed_in",JetAccount.status(context));assertFalse(a.getResult().getResultData().getStringExtra("account_data").contains("private-fixture"));
        }
        new DeliveryChoice(context).rememberJet("ارسال به ونک","35.75|51.4");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);
        try(ActivityScenario<DigikalaActivity> a=ActivityScenario.launch(new Intent(context,DigikalaActivity.class).putExtra("account_quote",true))){
            a.onActivity(x->RetailerFixtures.load(RetailerFixtures.browser(x),"https://www.digikalajet.com/checkout/cart","<div id='root'><p>ارسال به ونک</p><p>تعداد کالاها ۲</p><div data-store-name='ونک'><img alt='شیر یک لیتری'><span data-testid='cart-item-quantity'>2</span></div><p>جمع کالاها ۲۰٬۰۰۰ تومان</p><p>هزینه ارسال ۳٬۰۰۰ تومان</p><p>هزینه بسته بندی ۱٬۰۰۰ تومان</p><p>مبلغ قابل پرداخت ۲۴٬۰۰۰ تومان</p></div><script>if(localStorage.getItem('fixture-session')!=='private-fixture'){document.body.innerHTML='<input type=tel><button>ادامه</button>';history.replaceState({},'', '/user/login')}</script>"));
            for(int n=0;n<150&&a.getState()!=Lifecycle.State.DESTROYED;n++)Thread.sleep(100);
            assertEquals("Account quote completes without manual import",Lifecycle.State.DESTROYED,a.getState());
            org.json.JSONObject data=new org.json.JSONObject(a.getResult().getResultData().getStringExtra("account_data")),q=data.getJSONObject("checkout");
            assertEquals(10000,q.getJSONObject("fields").getJSONObject("packaging_fee").getLong("value"));assertTrue(q.getBoolean("delivery_verified"));assertTrue(q.getBoolean("items_complete"));assertFalse(data.toString().contains("private-fixture"));
        }
        try(ActivityScenario<MainActivity> main=ActivityScenario.launch(RetailerFixtures.plannerIntent())){
            AtomicReference<WebView> ref=new AtomicReference<>();main.onActivity(x->ref.set((WebView)((ViewGroup)((ViewGroup)x.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0)));
            waitFor(ref.get(),"Boolean(window.CartwiseAccount)");assertEquals("true",eval(ref.get(),"JSON.parse(CartwiseAndroid.accountStatus()).status==='signed_in'"));
            eval(ref.get(),"localStorage.clear();state=initialState();state.items=[{id:'m',name:'شیر',quantity:2}];save();localStorage.setItem('cartwise.lists.v1',JSON.stringify([{name:'هفتگی',items:state.items}]));true");
            main.recreate();main.onActivity(x->ref.set((WebView)((ViewGroup)((ViewGroup)x.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0)));
            waitFor(ref.get(),"Boolean(window.CartwiseAccount)");assertEquals("true",eval(ref.get(),"JSON.parse(CartwiseAndroid.accountStatus()).status==='signed_in'"));
            eval(ref.get(),"CartwiseAndroid.disconnectAccount();true");waitFor(ref.get(),"JSON.parse(CartwiseAndroid.accountStatus()).status==='disconnected'");
            assertEquals("true",eval(ref.get(),"state.items[0].quantity===2&&JSON.parse(localStorage.getItem('cartwise.lists.v1')).length===1"));assertEquals("35.75|51.4",new DeliveryChoice(context).coordinates());
        }
        try(ActivityScenario<DigikalaActivity> a=ActivityScenario.launch(login)){
            AtomicReference<WebView> ref=new AtomicReference<>();a.onActivity(x->{ref.set(RetailerFixtures.browser(x));RetailerFixtures.load(ref.get(),"https://www.digikalajet.com/user/login","<div id='root'><input type='tel'><button>ادامه</button></div>");});waitFor(ref.get(),"Boolean(document.querySelector('input[type=tel]'))");
            assertEquals("true",eval(ref.get(),"localStorage.getItem('fixture-session')===null"));
        }
    }
}
