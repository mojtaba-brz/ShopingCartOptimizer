package com.mojtababrz.cartoptimizer;

import android.content.Context;
import android.content.SharedPreferences;

/** Only a user-confirmed short address label, catalog coordinates and delivery mode; no credentials. */
final class DeliveryChoice {
    private final SharedPreferences prefs;
    DeliveryChoice(Context context) {prefs=context.getSharedPreferences("digikala-delivery",Context.MODE_PRIVATE);}
    static String label(String value) {return value==null?"":value.trim().replaceAll("\\s+"," ");}
    boolean matches(String location,String mode) {
        return RetailerSession.mode(mode) && !label(location).isEmpty()
            && label(location).equals(prefs.getString("label","")) && mode.equals(prefs.getString("mode",""));
    }
    void remember(String location,String mode) {
        if(!RetailerSession.mode(mode) || label(location).isEmpty()) return;
        SharedPreferences.Editor edit=prefs.edit();
        if(!matches(location,mode))edit.remove("coordinates");
        if(!matches(location,mode)||prefs.getLong("updated-at",0)==0)edit.putLong("updated-at",System.currentTimeMillis());
        edit.putString("label",label(location)).putString("mode",mode).apply();
    }
    String coordinates(){return prefs.getString("coordinates","");}
    boolean isJet(){return "jet".equals(prefs.getString("retailer",""));}
    void rememberJet(String location,String coordinates){
        remember(location,"on_demand");
        prefs.edit().putString("retailer","jet").apply();rememberCoordinates(coordinates);
    }
    long updatedAt() {return prefs.getLong("updated-at",0);}
    String location() {return prefs.getString("label","");}
    void rememberCoordinates(String coordinates) {
        if(!location().isEmpty() && validCoordinates(coordinates)) prefs.edit().putString("coordinates",coordinates).apply();
    }
    static boolean validCoordinates(String value) {
        try {String[] parts=value.split("\\|",-1);if(parts.length!=2)return false;
            double lat=Double.parseDouble(parts[0]),lon=Double.parseDouble(parts[1]);
            return Double.isFinite(lat)&&Double.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
        }catch(Exception e){return false;}
    }
    static boolean sameCoordinates(String a,String b) {
        if(!validCoordinates(a)||!validCoordinates(b))return false;
        String[] x=a.split("\\|"),y=b.split("\\|");
        return Double.compare(Double.parseDouble(x[0]),Double.parseDouble(y[0]))==0&&Double.compare(Double.parseDouble(x[1]),Double.parseDouble(y[1]))==0;
    }
    String restoreFromCatalog(String coordinates,String mode) {
        return validCoordinates(coordinates)&&sameCoordinates(coordinates,prefs.getString("coordinates",""))&&matches(location(),mode)?location():"";
    }
    void clear() {prefs.edit().clear().apply();}
    String mode() {return prefs.getString("mode","");}
    boolean locationApproved() {return prefs.getBoolean("gps-approved",false);}
    void approveLocation() {prefs.edit().putBoolean("gps-approved",true).apply();}
}
