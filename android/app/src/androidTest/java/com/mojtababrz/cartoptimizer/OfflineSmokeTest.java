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
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitFor(scenario, "Boolean(window.CartwiseEngine && document.getElementById('demo'))");
            eval(scenario, "localStorage.clear();document.getElementById('demo').click();true");
            waitFor(scenario, "document.getElementById('source-badge').textContent.includes('DEMO')");
            eval(scenario, "document.getElementById('optimize').click();true");
            waitFor(scenario, "document.getElementById('results').textContent.includes('375,000')");
            assertTrue(eval(scenario, "document.getElementById('results').textContent.includes('Optimal')").equals("true"));
            scenario.recreate();
            waitFor(scenario, "Boolean(document.getElementById('source-badge') && document.getElementById('source-badge').textContent.includes('DEMO'))");
            assertTrue(eval(scenario, "document.querySelectorAll('.item-row').length === 3").equals("true"));
        }
    }
}
