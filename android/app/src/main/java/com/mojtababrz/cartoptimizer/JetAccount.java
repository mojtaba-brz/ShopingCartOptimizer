package com.mojtababrz.cartoptimizer;

import android.content.Context;
import org.json.JSONObject;

/** Only an opt-in status is stored here. The official WebView owns login data. */
final class JetAccount {
    static String status(Context c){return c.getSharedPreferences("jet-account",0).getString("status","disconnected");}
    static boolean enabled(Context c){String s=status(c);return s.equals("saved")||s.equals("signed_in");}
    static void save(Context c,String status){if(status.equals("saved")||status.equals("signed_in")||status.equals("login_required")||status.equals("disconnected"))c.getSharedPreferences("jet-account",0).edit().putString("status",status).apply();}
    static String json(Context c){try{return new JSONObject().put("status",status(c)).toString();}catch(Exception e){return "{}";}}
    static void disconnect(android.app.Activity activity,java.util.function.Consumer<Boolean> done){
        RetailerSession.discard();
        android.webkit.WebView view=new android.webkit.WebView(activity);
        view.getSettings().setJavaScriptEnabled(true);view.getSettings().setDomStorageEnabled(true);view.getSettings().setAllowFileAccess(false);view.getSettings().setAllowContentAccess(false);
        String[] origins={"https://www.digikalajet.com","https://digikalajet.com"};int[] at={0};
        java.util.concurrent.atomic.AtomicBoolean finished=new java.util.concurrent.atomic.AtomicBoolean();
        android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
        java.util.function.Consumer<Boolean> finish=ok->{if(!finished.compareAndSet(false,true))return;handler.removeCallbacksAndMessages(null);view.destroy();
            if(ok)android.webkit.CookieManager.getInstance().removeAllCookies(removed->{android.webkit.CookieManager.getInstance().flush();save(activity,"disconnected");done.accept(true);});else done.accept(false);};
        view.setWebViewClient(new android.webkit.WebViewClient(){
            @Override public void onPageFinished(android.webkit.WebView w,String url){if(finished.get())return;
                w.evaluateJavascript("(()=>{localStorage.clear();sessionStorage.clear();return true;})()",value->{if(finished.get())return;if(!"true".equals(value)){finish.accept(false);return;}if(++at[0]<origins.length)w.loadDataWithBaseURL(origins[at[0]],"<!doctype html><body></body>","text/html","UTF-8",null);else finish.accept(true);});}
            @Override public boolean onRenderProcessGone(android.webkit.WebView w,android.webkit.RenderProcessGoneDetail d){finish.accept(false);return true;}
        });
        handler.postDelayed(()->finish.accept(false),8000);
        view.loadDataWithBaseURL(origins[0],"<!doctype html><body></body>","text/html","UTF-8",null);
    }
}
