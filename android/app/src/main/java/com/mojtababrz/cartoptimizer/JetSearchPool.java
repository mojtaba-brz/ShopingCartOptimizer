package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.Arrays;
import java.io.ByteArrayInputStream;

/** Read-only independent pages. No JS bridge, shared mutable navigation or cart actions. */
final class JetSearchPool {
    interface Listener {void progress(int completed,int products,int stores,int active,String detail);void complete(JSONArray items,JSONArray quotes,JSONObject resources);void failed(String error);}
    interface Factory {WebView create(Activity activity);}
    private final Activity activity;private final ViewGroup parent;private final Listener listener;private final Factory factory;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ArrayDeque<JSONObject> queue=new ArrayDeque<>();private final ArrayList<Worker> workers=new ArrayList<>();
    private final LinkedHashMap<String,JSONObject> entries=new LinkedHashMap<>();private final LinkedHashMap<String,Integer> pending=new LinkedHashMap<>();
    private final JSONArray quotes=new JSONArray();private final HashSet<String> quoteKeys=new HashSet<>();
    private final JSONArray requested;private final LinkedHashMap<String,String> queries=new LinkedHashMap<>();private final LinkedHashMap<String,Integer> weights=new LinkedHashMap<>();
    private final JSONObject resources;private final String coordinates,init,adapters,script;private boolean stopped;private int active;
    JetSearchPool(Activity activity,ViewGroup parent,JSONArray items,String coordinates,String init,Listener listener) throws Exception {
        this(activity,parent,items,coordinates,init,listener,a->new WebView(a));
    }
    JetSearchPool(Activity activity,ViewGroup parent,JSONArray items,String coordinates,String init,Listener listener,Factory factory) throws Exception {
        this.requested=items;this.activity=activity;this.parent=parent;this.listener=listener;this.factory=factory;this.coordinates=coordinates;this.init=init;resources=SearchBudget.read(activity);
        StringBuilder b=new StringBuilder("window.CartwiseSearchAdapters={");String[] keys={"reader","preference","checkout","navigation","expand"},files={"jet-dom.js","jet-location.js","digikala-checkout.js","jet-navigation.js","jet-expand.js"};
        for(int i=0;i<keys.length;i++){if(i>0)b.append(',');b.append(keys[i]).append(i==2?":()=> (":":(").append(read(files[i])).append(')');}adapters=b.append("};").toString();script=read("jet-search-task.js");
        for(int i=0;i<items.length();i++){
            JSONObject item=new JSONObject(items.getJSONObject(i).toString());String id=item.getString("id"),query=item.optString("query",item.getString("name"));
            if(queries.containsKey(query)){String key=queries.get(query);weights.put(key,weights.get(key)+1);continue;}queries.put(query,id);weights.put(id,1);
            entries.put(id,new JSONObject().put("id",id).put("products",new JSONArray()).put("error",JSONObject.NULL));pending.put(id,1);
            item.put("kind","global").put("query",query).put("url","https://www.digikalajet.com/search/v2/result?q="+Uri.encode(query));queue.add(item);
        }
    }
    private String read(String name)throws Exception{try(java.io.InputStream in=activity.getAssets().open(name)){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] bytes=new byte[4096];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);return out.toString("UTF-8");}}
    void start(){if(!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)){listener.failed("برای جست‌وجوی موازی، Android System WebView را به‌روز کنید.");return;}for(int i=0;i<resources.optInt("workers",1);i++){Worker w=new Worker();workers.add(w);w.open();}}
    void stop(){if(stopped)return;stopped=true;handler.removeCallbacksAndMessages(null);for(Worker w:workers)w.close();workers.clear();queue.clear();}
    void conserveMemory(){if(stopped)return;try{resources.put("workers",1).put("max_carts",3).put("state_limit",20000).put("solve_ms",200);}catch(Exception ignored){}boolean kept=false;for(Worker w:workers){if(w.task!=null||!kept&&!w.closed){kept=true;continue;}w.close();}}
    private void fail(String message){if(stopped)return;stop();listener.failed(message);}
    private void report(String detail){int completed=0,products=0;HashSet<String> stores=new HashSet<>();for(String id:pending.keySet())if(pending.get(id)==0)completed+=weights.get(id);for(JSONObject e:entries.values()){JSONArray rows=e.optJSONArray("products");products+=rows.length();for(int i=0;i<rows.length();i++){String name=rows.optJSONObject(i).optString("store_name");if(!name.isEmpty())stores.add(name);}}listener.progress(completed,products,stores.size(),active,detail);}
    private void dispatch(){if(stopped)return;for(Worker w:workers)if(active<resources.optInt("workers",1)&&w.ready&&!w.closed&&w.task==null&&!queue.isEmpty())w.run(queue.remove());if(queue.isEmpty()&&active==0&&pending.values().stream().allMatch(n->n==0)){JSONArray all=new JSONArray();try{for(int i=0;i<requested.length();i++){JSONObject item=requested.getJSONObject(i);String query=item.optString("query",item.getString("name"));all.put(new JSONObject(entries.get(queries.get(query)).toString()).put("id",item.getString("id")));}}catch(Exception e){fail("نتیجهٔ جست‌وجو کامل نشد.");return;}stop();listener.complete(all,quotes,resources);}}
    private void merge(JSONObject task,JSONObject data)throws Exception{
        JSONObject entry=entries.get(task.getString("id"));JSONArray rows=entry.getJSONArray("products"),fresh=data.optJSONArray("products");
        if(fresh!=null&&fresh.length()>0&&task.optString("kind").equals("store")){JSONArray kept=new JSONArray();for(int i=0;i<rows.length();i++)if(!task.optString("store_name").equals(rows.getJSONObject(i).optString("store_name")))kept.put(rows.getJSONObject(i));rows=kept;entry.put("products",rows);}
        HashSet<String> seen=new HashSet<>();for(int i=0;i<rows.length();i++)seen.add(identity(rows.getJSONObject(i)));
        if(fresh!=null)for(int i=0;i<fresh.length()&&rows.length()<1000;i++)if(seen.add(identity(fresh.getJSONObject(i))))rows.put(fresh.getJSONObject(i));
        String warning=data.optString("error","");if(!warning.isEmpty()&&!warning.equals("null"))entry.put("error",entry.isNull("error")?warning:entry.getString("error")+"؛ "+warning);
        JSONArray qs=data.optJSONArray("checkout_quotes");if(qs!=null)for(int i=0;i<qs.length()&&quotes.length()<100;i++){JSONObject q=qs.getJSONObject(i);String key=q.optString("store_id")+q.optString("store_name")+q.optString("page_kind")+q.optJSONObject("fields");if(quoteKeys.add(key))quotes.put(q);}
        JSONArray next=data.optJSONArray("store_tasks");if(next!=null)for(int i=0;i<next.length();i++){JSONObject child=next.getJSONObject(i);Uri url=Uri.parse(child.optString("url"));if(!DigikalaActivity.retailer(url)||!"/search/shop".equals(url.getPath())||!task.getString("query").equals(url.getQueryParameter("q")))continue;JSONObject copy=new JSONObject(task.toString());for(java.util.Iterator<String> it=child.keys();it.hasNext();){String key=it.next();copy.put(key,child.get(key));}queue.add(copy);pending.put(task.getString("id"),pending.get(task.getString("id"))+1);}
        pending.put(task.getString("id"),pending.get(task.getString("id"))-1);
    }
    private String identity(JSONObject p){return p.optString("title")+'|'+p.optString("store_name")+'|'+p.optString("store_id")+'|'+p.optLong("regular_price")+'|'+p.optLong("promo_price");}
    private final class Worker {
        final WebView web=factory.create(activity);JSONObject task;boolean ready,loaded,closed;long started;androidx.webkit.ScriptHandler initHandler;
        void close(){if(closed)return;closed=true;if(initHandler!=null)initHandler.remove();web.stopLoading();parent.removeView(web);web.destroy();}
        void open(){
            web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setLoadsImagesAutomatically(false);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            // Keep real layout/scroll dimensions underneath the existing opaque progress layer.
            parent.addView(web,0,new android.widget.FrameLayout.LayoutParams(-1,-1));
            initHandler=WebViewCompat.addDocumentStartJavaScript(web,init,new HashSet<>(Arrays.asList("https://www.digikalajet.com","https://digikalajet.com")));
            WebViewClient fixture=web.getWebViewClient();web.setWebViewClient(new WebViewClient(){
                @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){WebResourceResponse response=fixture==null?null:fixture.shouldInterceptRequest(v,r);if(response!=null)return response;return null;}
                @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return r.isForMainFrame()&&!DigikalaActivity.retailer(r.getUrl());}
                @Override public void onPageFinished(WebView v,String u){if(stopped||closed||loaded||!DigikalaActivity.retailer(Uri.parse(u)))return;loaded=true;ready=true;v.evaluateJavascript(adapters+script,ignored->dispatch());}
                @Override public boolean onRenderProcessGone(WebView v,android.webkit.RenderProcessGoneDetail d){fail("حافظهٔ مرورگر کافی نبود؛ جست‌وجو را دوباره شروع کنید.");return true;}
            });
            web.loadUrl("https://www.digikalajet.com/user/add-address");handler.postDelayed(()->{if(!stopped&&!closed&&!ready)fail("صفحهٔ جت برای جست‌وجو آماده نشد.");},30000);
        }
        void run(JSONObject value){task=value;active++;started=System.currentTimeMillis();try{JSONObject options=new JSONObject(value.toString()).put("coordinates",coordinates).put("seconds",value.optString("kind").equals("store")?30:60).put("max_stores",40);web.evaluateJavascript("CartwiseSearchTask.start("+options+")",ignored->handler.postDelayed(this::poll,350));}catch(Exception e){fail("شروع جست‌وجو ناموفق بود.");}}
        void poll(){if(stopped||task==null)return;if(System.currentTimeMillis()-started>75000){fail("صفحهٔ فروشگاه در مهلت بررسی پاسخ نداد.");return;}web.evaluateJavascript("window.cartwiseTask",raw->{if(stopped)return;try{JSONObject state=new JSONObject(raw);if(state.has("fatal")){fail(state.getString("fatal"));return;}report("جست‌وجوی موازی · "+task.getString("name")+" · "+state.optString("detail"));if(state.optBoolean("done")){merge(task,state.getJSONObject("result"));task=null;active--;dispatch();}else handler.postDelayed(this::poll,350);}catch(Exception e){fail("خواندن نتیجهٔ جست‌وجوی موازی ناموفق بود.");}});}
    }
}
