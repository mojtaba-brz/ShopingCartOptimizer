package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.content.Context;
import android.view.View;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** The same offline phrase catalogue as the web interface; never translates retailer data. */
final class AppLanguage {
    private static JSONObject phrases;
    static boolean valid(String value){return java.util.Arrays.asList("fa","en","ckb","ku","az-Arab").contains(value);}
    static String get(Context context){String value=context.getSharedPreferences("cartwise-preferences",Context.MODE_PRIVATE).getString("language","fa");return valid(value)?value:"fa";}
    static int direction(Context context){String value=get(context);return value.equals("en")||value.equals("ku")?View.LAYOUT_DIRECTION_LTR:View.LAYOUT_DIRECTION_RTL;}
    static void apply(Activity activity){activity.getWindow().getDecorView().setLayoutDirection(direction(activity));}
    static synchronized JSONObject catalogue(Context context){if(phrases==null)try(java.io.InputStream input=context.getAssets().open("languages.json")){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1)out.write(buffer,0,n);phrases=new JSONObject(out.toString(StandardCharsets.UTF_8.name())).getJSONObject("phrases");}catch(Exception ignored){phrases=new JSONObject();}return phrases;}
    static String text(Context context,String source){
        if(source==null||get(context).equals("fa"))return source;
        String core=source.replaceAll("^[\\s·؛:«»]+|[\\s·؛:«»]+$","");
        JSONObject row=catalogue(context).optJSONObject(core);
        if(row!=null){int at=source.indexOf(core);return source.substring(0,at)+row.optString(get(context),core)+source.substring(at+core.length());}
        if(source.contains(" · ")){String[] parts=source.split(" · ",-1);for(int i=0;i<parts.length;i++){JSONObject part=catalogue(context).optJSONObject(parts[i].trim());if(part!=null){String value=parts[i].trim();int at=parts[i].indexOf(value);parts[i]=parts[i].substring(0,at)+part.optString(get(context),value)+parts[i].substring(at+value.length());}}return String.join(" · ",parts);}
        return source;
    }
    static String number(Context context,int value){String language=get(context);Locale locale=language.equals("fa")||language.equals("az-Arab")?Locale.forLanguageTag("fa-IR"):language.equals("ckb")?Locale.forLanguageTag("ar-IQ"):Locale.US;return java.text.NumberFormat.getIntegerInstance(locale).format(value);}
}
