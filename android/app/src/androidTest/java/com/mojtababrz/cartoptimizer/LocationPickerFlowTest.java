package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LocationPickerFlowTest {
    private final AtomicReference<String> hydrated=new AtomicReference<>("");
    @Before public void clean(){InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{RetailerSession.discard();android.webkit.WebStorage.getInstance().deleteAllData();});new DeliveryChoice(ApplicationProvider.getApplicationContext()).clear();}
    @After public void release(){InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);}
    private ActivityScenario<DigikalaActivity> launch()throws Exception{
        ActivityScenario<DigikalaActivity> s=ActivityScenario.launchActivityForResult(new Intent(ApplicationProvider.getApplicationContext(),DigikalaActivity.class).putExtra("query","fixture"));
        CountDownLatch loaded=new CountDownLatch(1);s.onActivity(a->{WebView web=RetailerFixtures.browser(a);WebViewClient original=web.getWebViewClient();web.stopLoading();web.setWebViewClient(new WebViewClient(){
            public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
                String html="<div id='root'></div><script>const raw=localStorage.getItem('persist:DKNow');const p=raw?JSON.parse(JSON.parse(raw).address).defaultAddress:{};window.fixtureHydratedAddress=p.addressAddress||'';document.getElementById('root').textContent=window.fixtureHydratedAddress;</script>";
                return new WebResourceResponse("text/html","UTF-8",new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
            }
            public void onPageFinished(WebView v,String url){v.evaluateJavascript("window.fixtureHydratedAddress||''",r->{hydrated.set(r);loaded.countDown();});original.onPageFinished(v,url);}
            public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return original.shouldOverrideUrlLoading(v,r);}
        });web.loadUrl("https://www.digikalajet.com/");});assertTrue(loaded.await(10,TimeUnit.SECONDS));return s;
    }
    private AlertDialog dialog(DigikalaActivity a){try{java.lang.reflect.Field p=DigikalaActivity.class.getDeclaredField("addressPicker");p.setAccessible(true);java.lang.reflect.Field d=JetAddressPicker.class.getDeclaredField("dialog");d.setAccessible(true);return (AlertDialog)d.get(p.get(a));}catch(Exception e){throw new AssertionError(e);}}
    private String response(boolean covered){return "{\"status\":200,\"data\":{\"is_in_service_range\":"+covered+",\"approximate_address\":\"میدان ونک\",\"city_name\":\"تهران\"}}";}
    private String rows(String label){return "{\"status\":200,\"data\":[{\"title\":\""+label+"\",\"address\":\"تهران، "+label+"\",\"latitude\":35.75,\"longitude\":51.4}]}";}
    private void search(ActivityScenario<DigikalaActivity> s,String query){s.onActivity(a->{AlertDialog d=dialog(a);((EditText)d.findViewById(R.id.address_query)).setText(query);d.findViewById(R.id.address_search).performClick();});}
    private void waitForRows(ActivityScenario<DigikalaActivity> s,String expected)throws Exception{
        for(int i=0;i<100;i++){AtomicReference<String> text=new AtomicReference<>("");s.onActivity(a->{LinearLayout list=dialog(a).findViewById(R.id.address_results);if(list.getChildCount()>0)text.set(((TextView)list.getChildAt(0)).getText().toString());});if(text.get().contains(expected))return;Thread.sleep(50);}fail("Address results did not arrive");
    }
    private void confirm(ActivityScenario<DigikalaActivity> s){s.onActivity(a->{AlertDialog d=dialog(a);((LinearLayout)d.findViewById(R.id.address_results)).getChildAt(0).performClick();d.findViewById(R.id.address_confirm).performClick();});}
    @Test public void selectionConfirmsWithoutMapOrGpsAndHydratesJetBeforeReading()throws Exception{
        try(ActivityScenario<DigikalaActivity> s=launch()){
            s.onActivity(a->a.openAddressPicker(new JetAddressClient(path->path.startsWith("/map/search/")?rows("میدان ونک"):response(true))));search(s,"ونک");waitForRows(s,"ونک");
            if(android.os.Build.VERSION.SDK_INT<36){
                s.onActivity(a->((LinearLayout)dialog(a).findViewById(R.id.address_results)).getChildAt(0).performClick());Thread.sleep(250);
                android.graphics.Bitmap bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();assertNotNull(bitmap);
                java.io.File folder=new java.io.File(ApplicationProvider.getApplicationContext().getFilesDir(),"qa");folder.mkdirs();try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(folder,"location-picker.png"))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();
            }
            confirm(s);
            for(int i=0;i<150&&s.getState()!=Lifecycle.State.DESTROYED;i++)Thread.sleep(100);
            assertEquals(Lifecycle.State.DESTROYED,s.getState());assertEquals(Activity.RESULT_OK,s.getResult().getResultCode());
            JSONObject data=new JSONObject(s.getResult().getResultData().getStringExtra("live_data"));assertEquals("ارسال به تهران، میدان ونک",data.getString("location"));assertEquals("35.75|51.4",new DeliveryChoice(ApplicationProvider.getApplicationContext()).coordinates());assertTrue(hydrated.get().contains("میدان ونک"));
            assertFalse("A delivery-point choice must not approve physical GPS",new DeliveryChoice(ApplicationProvider.getApplicationContext()).locationApproved());
        }
    }
    @Test public void lateSearchCannotReplaceNewResultsAndOutsideRangeDoesNotSave()throws Exception{
        CountDownLatch oldStarted=new CountDownLatch(1),releaseOld=new CountDownLatch(1);
        try(ActivityScenario<DigikalaActivity> s=launch()){
            s.onActivity(a->a.openAddressPicker(new JetAddressClient(path->{if(path.contains(android.net.Uri.encode("قدیمی"))){oldStarted.countDown();releaseOld.await(5,TimeUnit.SECONDS);return rows("قدیمی");}return path.startsWith("/map/search/")?rows("ونک"):response(false);})));search(s,"قدیمی");assertTrue(oldStarted.await(5,TimeUnit.SECONDS));search(s,"ونک");waitForRows(s,"ونک");releaseOld.countDown();Thread.sleep(150);waitForRows(s,"ونک");confirm(s);
            for(int i=0;i<100;i++){AtomicReference<String> message=new AtomicReference<>();s.onActivity(a->message.set(((TextView)dialog(a).findViewById(R.id.address_message)).getText().toString()));if(message.get().contains("خارج از محدوده"))break;if(i==99)fail("Range error not shown");Thread.sleep(50);}
            assertEquals(Lifecycle.State.RESUMED,s.getState());assertEquals("",new DeliveryChoice(ApplicationProvider.getApplicationContext()).location());
        }finally{releaseOld.countDown();}
    }
    @Test public void cancellingPendingVerificationCannotCommitLateAddress()throws Exception{
        CountDownLatch requested=new CountDownLatch(1),release=new CountDownLatch(1);
        try(ActivityScenario<DigikalaActivity> s=launch()){
            s.onActivity(a->a.openAddressPicker(new JetAddressClient(path->{if(path.startsWith("/map/search/"))return rows("ونک");requested.countDown();release.await(5,TimeUnit.SECONDS);return response(true);})));search(s,"ونک");waitForRows(s,"ونک");confirm(s);assertTrue(requested.await(5,TimeUnit.SECONDS));
            s.onActivity(a->dialog(a).getButton(AlertDialog.BUTTON_NEGATIVE).performClick());release.countDown();Thread.sleep(250);assertEquals(Activity.RESULT_CANCELED,s.getResult().getResultCode());assertEquals("",new DeliveryChoice(ApplicationProvider.getApplicationContext()).location());
        }finally{release.countDown();}
    }
    @Test public void appOwnedMapClosesBackToAddressSearch()throws Exception{
        try(ActivityScenario<DigikalaActivity> s=launch()){
            s.onActivity(a->{try{a.openAddressPicker(new JetAddressClient(path->rows("ونک")));dialog(a).findViewById(R.id.address_map).performClick();java.lang.reflect.Field field=DigikalaActivity.class.getDeclaredField("addressPicker");field.setAccessible(true);Object picker=field.get(a);field=JetAddressPicker.class.getDeclaredField("mapDialog");field.setAccessible(true);Object map=field.get(picker);field=DeliveryMap.class.getDeclaredField("web");field.setAccessible(true);WebView web=(WebView)field.get(map);web.getSettings().setBlockNetworkLoads(true);assertTrue(web.getUrl().startsWith("https://appassets.androidplatform.net/assets/map.html"));field=DeliveryMap.class.getDeclaredField("dialog");field.setAccessible(true);((AlertDialog)field.get(map)).getButton(AlertDialog.BUTTON_NEGATIVE).performClick();assertTrue(dialog(a).isShowing());assertTrue(dialog(a).findViewById(R.id.address_query).isEnabled());}catch(Exception e){throw new AssertionError(e);}});
            assertEquals("",new DeliveryChoice(ApplicationProvider.getApplicationContext()).location());
        }
    }
}
