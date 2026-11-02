package com.mojtababrz.cartoptimizer;

import android.content.Context;
import android.content.SharedPreferences;

/** Only a user-confirmed short address label and delivery mode; no credentials. */
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
        prefs.edit().putString("label",label(location)).putString("mode",mode).apply();
    }
    String mode() {return prefs.getString("mode","");}
    boolean locationApproved() {return prefs.getBoolean("gps-approved",false);}
    void approveLocation() {prefs.edit().putBoolean("gps-approved",true).apply();}
}
