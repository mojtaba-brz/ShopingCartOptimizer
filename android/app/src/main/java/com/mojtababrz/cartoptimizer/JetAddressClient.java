package com.mojtababrz.cartoptimizer;

import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/** The same public, read-only map search/range endpoints used by Jet's website.
 * No cookies, credentials, account identifiers, telemetry or address creation. */
final class JetAddressClient {
    interface Transport {String get(String path)throws Exception;}
    static final class Point {
        final String title,label,coordinates;
        Point(String title,String label,String coordinates){this.title=title;this.label=label;this.coordinates=coordinates;}
    }
    static final class Verified {
        final Point point;final boolean inService;
        Verified(Point point,boolean inService){this.point=point;this.inService=inService;}
    }
    private final Transport transport;
    JetAddressClient(){this(JetAddressClient::download);}
    JetAddressClient(Transport transport){this.transport=transport;}
    private static Object payload(String body)throws Exception{
        JSONObject root=new JSONObject(body);
        if(root.optInt("status",0)!=200||!root.has("data"))throw new IOException("Invalid address response");
        return root.get("data");
    }
    private static String clean(Object value){return value instanceof String?DeliveryChoice.label((String)value):"";}
    private static String number(Object value)throws Exception{
        if(!(value instanceof Number)&&!(value instanceof String))throw new IOException("Missing coordinates");
        String s=value.toString().trim();if(!s.matches("-?\\d+(?:\\.\\d+)?"))throw new IOException("Invalid coordinates");return s;
    }
    List<Point> search(String query)throws Exception{
        query=DeliveryChoice.label(query);if(query.length()<2||query.length()>200)throw new IOException("Invalid query");
        Object data=payload(transport.get("/map/search/?q="+Uri.encode(query)));if(!(data instanceof JSONArray))throw new IOException("Invalid search response");
        JSONArray rows=(JSONArray)data;List<Point> out=new ArrayList<>();HashSet<String> seen=new HashSet<>();
        for(int i=0;i<rows.length()&&i<100;i++)try{
            JSONObject p=rows.getJSONObject(i);String title=clean(p.opt("title")),label=clean(p.opt("address"));if(label.isEmpty())label=title;
            String point=number(p.opt("latitude"))+"|"+number(p.opt("longitude"));
            if(!DeliveryChoice.validCoordinates(point)||!DeliveryChoice.usableLabel(label)||!seen.add(point+"|"+label))continue;
            out.add(new Point(title.isEmpty()?label:title,label,point));
        }catch(Exception ignored){}
        return out;
    }
    Verified verify(Point point)throws Exception{
        if(point==null||!DeliveryChoice.validCoordinates(point.coordinates)||!DeliveryChoice.usableLabel(point.label))throw new IOException("Invalid point");
        String[] xy=point.coordinates.split("\\|");Object data=payload(transport.get("/map/reverse/no-modal/?latitude="+Uri.encode(xy[0])+"&longitude="+Uri.encode(xy[1])));
        if(!(data instanceof JSONObject))throw new IOException("Invalid range response");JSONObject p=(JSONObject)data;
        if(!(p.opt("is_in_service_range") instanceof Boolean))throw new IOException("Missing range confirmation");
        String label=clean(p.opt("approximate_address"));if(label.isEmpty())label=clean(p.opt("address"));if(label.isEmpty())label=point.label;
        String city=clean(p.opt("city_name"));if(!city.isEmpty()&&!label.startsWith(city))label=city+"، "+label;
        if(!DeliveryChoice.usableLabel(label))throw new IOException("Missing address");
        return new Verified(new Point(point.title,label,point.coordinates),p.getBoolean("is_in_service_range"));
    }
    private static String download(String path)throws Exception{
        if(!(path.startsWith("/map/search/?q=")||path.startsWith("/map/reverse/no-modal/?latitude=")))throw new IOException("Unsupported address request");
        HttpURLConnection c=(HttpURLConnection)new URL("https://api.digikalajet.ir"+path).openConnection();
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(8000);c.setReadTimeout(8000);c.setRequestProperty("Accept","application/json");c.setRequestProperty("User-Agent","Sabadchin/0.13.0");
        try{
            String mime=c.getContentType();if(c.getResponseCode()!=200||mime==null||!mime.toLowerCase(java.util.Locale.ROOT).startsWith("application/json")||c.getContentLengthLong()>524288)throw new IOException("Address service unavailable");
            ByteArrayOutputStream out=new ByteArrayOutputStream();try(InputStream in=c.getInputStream()){
                byte[] bytes=new byte[8192];int n;while((n=in.read(bytes))!=-1){if(Thread.currentThread().isInterrupted()||out.size()+n>524288)throw new IOException("Address request cancelled");out.write(bytes,0,n);}
            }return out.toString(StandardCharsets.UTF_8.name());
        }finally{c.disconnect();}
    }
}
