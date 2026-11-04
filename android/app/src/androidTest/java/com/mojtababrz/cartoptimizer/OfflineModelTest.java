package com.mojtababrz.cartoptimizer;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import static org.junit.Assert.*;

/** Real model test, enabled only when the pinned model is provisioned by CI. */
@RunWith(AndroidJUnit4.class)
public class OfflineModelTest {
    @Test public void classifiesPersianProductsOnDevice() throws Exception {
        Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();
        Assume.assumeTrue(new File(app.getFilesDir(),"qwen3-1.7b-int4.litertlm").isFile());
        JSONArray products=new JSONArray().put(new JSONObject().put("title","شیر کم چرب یک لیتر"))
            .put(new JSONObject().put("title","مایع ظرفشویی"));
        JSONObject payload=new JSONObject().put("items",new JSONArray().put(new JSONObject().put("id","milk").put("products",products)));
        JSONArray items=new JSONArray().put(new JSONObject().put("id","milk").put("name","شیر کم چرب"));
        JSONObject result=new JSONObject(new OfflineMatcher(app).suggest(payload.toString(),items.toString()));
        JSONArray matches=result.getJSONArray("items").getJSONObject(0).getJSONArray("titles");
        assertTrue(matches.toString().contains("شیر کم چرب یک لیتر"));
        assertFalse(matches.toString().contains("مایع ظرفشویی"));
    }
}
