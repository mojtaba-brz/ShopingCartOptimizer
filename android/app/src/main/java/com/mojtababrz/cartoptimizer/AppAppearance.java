package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.view.View;

/** Shared light/dark preference for app-owned native screens and dialogs. */
final class AppAppearance {
    static boolean night(Context context){return context.getSharedPreferences("cartwise-preferences",Context.MODE_PRIVATE).getBoolean("night",false);}
    static String theme(Context context){return context.getSharedPreferences("cartwise-preferences",Context.MODE_PRIVATE).getString("theme","simple");}
    static int paper(Context context){String theme=theme(context);return Color.parseColor(night(context)?theme.equals("modern")?"#101621":theme.equals("traditional")?"#191b19":"#121b18":theme.equals("modern")?"#EDF1F8":theme.equals("traditional")?"#F6EEDF":"#F4F6F3");}
    static int accent(Context context){String theme=theme(context);return Color.parseColor(night(context)?theme.equals("modern")?"#8CB5FF":theme.equals("traditional")?"#8FCEC8":"#85C8A3":theme.equals("modern")?"#165DCE":theme.equals("traditional")?"#164C78":"#286349");}
    static void apply(Activity activity){
        activity.setTheme(night(activity)?R.style.AppThemeDark:R.style.AppTheme);
        activity.getWindow().setStatusBarColor(paper(activity));activity.getWindow().setNavigationBarColor(paper(activity));
        int flags=activity.getWindow().getDecorView().getSystemUiVisibility();
        flags=night(activity)?flags&~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR:flags|View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if(android.os.Build.VERSION.SDK_INT>=26)flags=night(activity)?flags&~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:flags|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        activity.getWindow().getDecorView().setSystemUiVisibility(flags);
    }
}
