package com.mojtababrz.cartoptimizer;

import android.content.Context;
import android.content.Intent;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ResultTransportTest {
    @Test public void largeResultSurvivesWithoutBinderPayloadAndIsOneUse() throws Exception {
        Context c=ApplicationProvider.getApplicationContext();
        String value="{\"fixture\":\""+new String(new char[600000]).replace('\0','x')+"\"}";
        Intent result=SearchResult.pack(c,value);
        assertNull(result.getStringExtra("auto_data"));
        assertEquals(value,SearchResult.read(c,result));
        try{SearchResult.read(c,result);fail("Private result must be one use");}catch(java.io.IOException expected){}
        try{SearchResult.read(c,new Intent().putExtra("auto_result_token","../secret"));fail("Traversal token accepted");}catch(IllegalArgumentException expected){}
        SearchResult.clear(c);
    }
    @Test public void imageProxyAndLocationRestorationRejectUntrustedInputs() {
        assertTrue(ProductImages.allowed("https://dkstatics-public.digikala.com/product.jpg"));
        for(String s:new String[]{"http://dkstatics-public.digikala.com/x","https://dkstatics-public.digikala.com.evil.test/x","https://user@dkstatics-public.digikala.com/x","https://127.0.0.1/x","https://dkstatics-public.digikala.com:444/x"})assertFalse(s,ProductImages.allowed(s));
        assertTrue(DeliveryChoice.sameCoordinates("35.700|51.400","35.7|51.4"));
        assertFalse(DeliveryChoice.sameCoordinates("35.701|51.4","35.7|51.4"));
        assertFalse(DeliveryChoice.sameCoordinates("NaN|51.4","35.7|51.4"));
    }
    @Test public void lateCatalogCoordinatesCannotRelabelAConfirmedJetAddress(){
        android.content.Context c=ApplicationProvider.getApplicationContext();new DeliveryChoice(c).clear();RetailerSession.initialize(c);
        RetailerSession.confirmJetDelivery("ارسال به ونک","35.75|51.4");
        android.webkit.WebResourceRequest request=new android.webkit.WebResourceRequest(){
            public android.net.Uri getUrl(){return android.net.Uri.parse("https://api.digikalajet.ir/search/shop/?latitude=36&longitude=52");}
            public boolean isForMainFrame(){return false;}public boolean isRedirect(){return false;}public boolean hasGesture(){return false;}public String getMethod(){return "GET";}
            public java.util.Map<String,String> getRequestHeaders(){return java.util.Collections.emptyMap();}
        };
        RetailerSession.observe(request);assertEquals("ارسال به ونک",RetailerSession.deliveryLocation());assertEquals("35.75|51.4",new DeliveryChoice(c).coordinates());
        new DeliveryChoice(c).rememberJet("ارسال به ونک","");assertEquals("A label-only read must not retain old coordinates", "",new DeliveryChoice(c).coordinates());
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().runOnMainSync(RetailerSession::discard);
    }

}
