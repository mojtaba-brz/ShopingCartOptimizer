package com.mojtababrz.cartoptimizer;

import android.webkit.WebView;
import android.view.ViewGroup;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PersianAppearanceTest {
    private String eval(ActivityScenario<MainActivity> scenario,String js)throws Exception{
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        scenario.onActivity(a->{WebView web=(WebView)((ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);web.evaluateJavascript(js,v->{result.set(v);done.countDown();});});
        assertTrue(done.await(10,TimeUnit.SECONDS));return result.get();
    }
    private void ready(ActivityScenario<MainActivity> scenario)throws Exception{
        for(int i=0;i<100;i++){if("true".equals(eval(scenario,"Boolean(window.CartwiseAppearance && window.CartwiseCheckout)")))return;Thread.sleep(100);}fail("Persian UI unavailable");
    }
    private void rendered(ActivityScenario<MainActivity> scenario)throws Exception{
        CountDownLatch next=new CountDownLatch(1);
        scenario.onActivity(a->{WebView w=(WebView)((ViewGroup)((ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);
            w.postVisualStateCallback(1,new WebView.VisualStateCallback(){@Override public void onComplete(long request){w.invalidate();next.countDown();}});
        });
        assertTrue("Theme frame was not ready",next.await(20,TimeUnit.SECONDS));Thread.sleep(200);
    }
    private void progress(String value){android.os.Bundle data=new android.os.Bundle();data.putString("stream","Appearance: "+value+"\n");InstrumentationRegistry.getInstrumentation().sendStatus(2,data);}
    @Test public void persianThemesPersistAndDoNotOverflowOnPhone()throws Exception{
        progress("launching");try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            progress("launched");
            ready(scenario);progress("ready");assertEquals("true",eval(scenario,"document.documentElement.lang==='fa' && document.documentElement.dir==='rtl' && money(123450)==='۱۲٬۳۴۵'"));
            eval(scenario,"localStorage.clear();state=initialState();state.items=[{id:'milk',name:'شیر کم‌چرب ۱ لیتر',quantity:2},{id:'rice',name:'برنج ایرانی ۱ کیلوگرم',quantity:1}];dirty.clear();save();showTab('list');true");
            for(String theme:new String[]{"simple","modern","traditional"}){
                assertEquals("true",eval(scenario,"CartwiseAppearance.setTheme('"+theme+"');document.documentElement.dataset.theme==='"+theme+"' && document.documentElement.scrollWidth<=innerWidth"));
                String green=theme.equals("simple")?"#286349":theme.equals("modern")?"#086c78":"#164c78";
                assertEquals("true",eval(scenario,"getComputedStyle(document.documentElement).getPropertyValue('--green').trim()==='"+green+"'"));
                rendered(scenario);progress(theme+" checked");
                // Android 16 headless emulator image capture can terminate the emulator.
                // Both API levels assert theme/layout/persistence; API 30 supplies store screenshots.
                if(android.os.Build.VERSION.SDK_INT<36){
                android.graphics.Bitmap bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
                assertNotNull(bitmap);AtomicReference<java.io.File> directory=new AtomicReference<>();scenario.onActivity(a->directory.set(new java.io.File(a.getFilesDir(),"store-screenshots")));
                directory.get().mkdirs();try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(directory.get(),theme+".png"))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();
                }
            }
            progress("recreating");scenario.recreate();ready(scenario);assertEquals("true",eval(scenario,"document.documentElement.dataset.theme==='traditional' && document.querySelectorAll('.item-row').length===2"));
            eval(scenario,"showTab('settings');true");assertEquals("true",eval(scenario,"!document.getElementById('tab-settings').hidden && document.querySelectorAll('[name=theme]').length===3"));
        }
    }
}
