package com.mojtababrz.cartoptimizer;

import android.net.Uri;
import android.webkit.WebResourceResponse;
import android.util.LruCache;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;

/** Public product images only. No retailer cookies, login headers or referrer. */
final class ProductImages {
    private static final int LIMIT=2*1024*1024;
    private static final LruCache<String,Entry> cache=new LruCache<String,Entry>(8*1024*1024){
        @Override protected int sizeOf(String key,Entry value){return value.bytes.length;}
    };
    private static final class Entry {final byte[] bytes;final String mime;Entry(byte[] b,String m){bytes=b;mime=m;}}
    static boolean allowed(String value){
        try{Uri u=Uri.parse(value);String h=u.getHost();return "https".equals(u.getScheme())&&u.getUserInfo()==null&&(u.getPort()==-1||u.getPort()==443)
            &&("dkstatics-public.digikala.com".equals(h)||"dkstatics-public.digikalajet.ir".equals(h)||"images.digikalajet.ir".equals(h));}
        catch(Exception e){return false;}
    }
    static void clear(){cache.evictAll();}
    static WebResourceResponse read(String address){
        if(!allowed(address))return missing();
        Entry hit=cache.get(address);if(hit!=null)return response(hit);
        String current=address;
        try{for(int redirect=0;redirect<3;redirect++){
            if(!allowed(current))return missing();
            HttpURLConnection c=(HttpURLConnection)new URL(current).openConnection();
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(4000);c.setReadTimeout(4000);c.setRequestProperty("Accept","image/webp,image/jpeg,image/png,image/avif");
            try{
                int code=c.getResponseCode();
                if(code>=300&&code<400){String next=c.getHeaderField("Location");if(next==null)return missing();current=new URL(new URL(current),next).toString();continue;}
                String mime=c.getContentType();if(mime==null)return missing();mime=mime.split(";",2)[0].toLowerCase(java.util.Locale.ROOT);
                if(code!=200||!(mime.equals("image/jpeg")||mime.equals("image/png")||mime.equals("image/webp")||mime.equals("image/avif"))||c.getContentLengthLong()>LIMIT)return missing();
                ByteArrayOutputStream out=new ByteArrayOutputStream();try(InputStream in=c.getInputStream()){
                    byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>LIMIT)return missing();out.write(b,0,n);}
                }
                if(out.size()==0)return missing();Entry entry=new Entry(out.toByteArray(),mime);cache.put(address,entry);return response(entry);
            }finally{c.disconnect();}
        }}catch(Exception ignored){}
        return missing();
    }
    private static WebResourceResponse response(Entry e){
        HashMap<String,String> headers=new HashMap<>();headers.put("X-Content-Type-Options","nosniff");headers.put("Cache-Control","private, max-age=86400");
        return new WebResourceResponse(e.mime,null,200,"OK",headers,new ByteArrayInputStream(e.bytes));
    }
    private static WebResourceResponse missing(){return new WebResourceResponse("image/png",null,404,"Not available",null,new ByteArrayInputStream(new byte[0]));}
}
