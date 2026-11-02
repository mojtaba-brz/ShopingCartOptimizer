package com.mojtababrz.cartoptimizer;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LiveReaderTest {
    @Test public void officialOriginOnlyAndReadOnlyDomReaderHasNoBridge() throws Exception {
        assertTrue(DigikalaActivity.retailer(Uri.parse("https://www.digikala.com/supermarket/")));
        assertFalse(DigikalaActivity.retailer(Uri.parse("https://www.digikala.com.evil.invalid/")));
        assertFalse(DigikalaActivity.retailer(Uri.parse("http://www.digikala.com/")));
        assertFalse(DigikalaActivity.retailer(Uri.parse("https://user@www.digikala.com/")));
        Intent intent=new Intent(ApplicationProvider.getApplicationContext(),DigikalaActivity.class).putExtra("query", "شیر");
        try(ActivityScenario<DigikalaActivity> scenario=ActivityScenario.launch(intent)) {
            scenario.onActivity(activity -> {
                android.view.ViewGroup content=activity.findViewById(android.R.id.content);
                android.view.ViewGroup root=(android.view.ViewGroup)content.getChildAt(0);
                WebView shop=(WebView)root.getChildAt(2);
                shop.stopLoading();
                shop.loadDataWithBaseURL("https://www.digikala.com/supermarket/search/shop", "<div id='root'><div><p>ارسال به</p><p>ونک</p></div><div><img alt='شیر یک لیتری'><div><p>135,300</p><img src='/supermarket/i/toman.svg'></div><p class='line-through'>165,000</p><button data-cro-id='add-one-more-to-cart'>+</button></div></div>","text/html","utf-8",null);
            });
            long deadline=System.currentTimeMillis()+15000;String result="";
            while(System.currentTimeMillis()<deadline) {
                CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>("");
                scenario.onActivity(activity -> {
                    try(java.io.InputStream input=activity.getAssets().open("digikala-capture.js")) {
                        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buf=new byte[4096];int n;
                        while((n=input.read(buf))!=-1)out.write(buf,0,n);
                        android.view.ViewGroup root=(android.view.ViewGroup)((android.view.ViewGroup)activity.findViewById(android.R.id.content)).getChildAt(0);
                        WebView shop=(WebView)root.getChildAt(2);
                        shop.evaluateJavascript("({bridge:typeof CartwiseAndroid,read:"+out.toString("UTF-8")+"})",r->{value.set(r);done.countDown();});
                    }catch(Exception e){done.countDown();}
                });
                assertTrue(done.await(5,TimeUnit.SECONDS));result=value.get();
                if(result.contains("1353000"))break;Thread.sleep(150);
            }
            assertTrue("Live reader result: "+result,result.contains("1353000"));
            assertTrue(result.contains("1650000"));assertTrue(result.contains("undefined"));assertTrue(result.contains("ونک"));
        }
    }
}
