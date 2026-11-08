package com.mojtababrz.cartoptimizer;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native address selection works even when Jet's map/WebGL/GPS does not. */
final class JetAddressPicker {
    interface Listener {void selected(JetAddressClient.Verified address);void map();void cancelled();}
    private final Activity activity;private final JetAddressClient client;private final Listener listener;
    private final Handler main=new Handler(Looper.getMainLooper());private final ExecutorService io=Executors.newFixedThreadPool(2);
    private final AlertDialog dialog;private final EditText query;private final Button search;private Button confirm;private final TextView message;private final LinearLayout results;private final ProgressBar progress;
    private JetAddressClient.Point selected;private int generation;private boolean closed,verifying;
    private final Runnable delayedSearch=this::search;
    JetAddressPicker(Activity activity,JetAddressClient client,Listener listener){
        this.activity=activity;this.client=client;this.listener=listener;
        LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);body.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);body.setPadding(28,16,28,8);
        TextView hint=new TextView(activity);hint.setText("شهر، محله یا خیابان را جست‌وجو کنید. برای انتخاب نشانی، نیازی به GPS یا بازشدن نقشه نیست.");hint.setTextSize(15);body.addView(hint);
        query=new EditText(activity);query.setId(R.id.address_query);query.setSingleLine(true);query.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(200)});query.setHint("مثلاً تهران، میدان ونک");query.setImeOptions(EditorInfo.IME_ACTION_SEARCH);body.addView(query,new LinearLayout.LayoutParams(-1,-2));
        search=button("جست‌وجوی نشانی",R.id.address_search);body.addView(search);search.setOnClickListener(v->search());
        progress=new ProgressBar(activity);progress.setVisibility(View.GONE);body.addView(progress,new LinearLayout.LayoutParams(56,56));
        message=new TextView(activity);message.setId(R.id.address_message);message.setPadding(0,12,0,12);message.setText("یک نشانی را از نتایج انتخاب کنید.");body.addView(message);
        ScrollView scroll=new ScrollView(activity);results=new LinearLayout(activity);results.setOrientation(LinearLayout.VERTICAL);results.setId(R.id.address_results);scroll.addView(results);body.addView(scroll,new LinearLayout.LayoutParams(-1,(int)(220*activity.getResources().getDisplayMetrics().density)));
        confirm=button("تأیید این موقعیت",R.id.address_confirm);confirm.setEnabled(false);
        Button map=button("انتخاب از نقشهٔ جت",R.id.address_map);body.addView(map);map.setOnClickListener(v->{dismiss();listener.map();});
        ScrollView content=new ScrollView(activity);content.addView(body);
        dialog=new AlertDialog.Builder(activity).setTitle("موقعیت تحویل").setView(content).setPositiveButton("تأیید این موقعیت",null).setNegativeButton("انصراف",(d,w)->listener.cancelled()).create();
        dialog.setOnCancelListener(d->listener.cancelled());dialog.setOnDismissListener(d->close());
        query.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_SEARCH){search();return true;}return false;});
        query.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){
            if(verifying)return;generation++;selected=null;confirm.setEnabled(false);results.removeAllViews();progress.setVisibility(View.GONE);main.removeCallbacks(delayedSearch);
            if(DeliveryChoice.label(s.toString()).length()>=2)main.postDelayed(delayedSearch,650);
        }public void afterTextChanged(Editable e){}});
    }
    private Button button(String text,int id){Button b=new Button(activity);b.setText(text);b.setId(id);b.setTextColor(Color.rgb(22,76,60));return b;}
    void show(){dialog.show();confirm=dialog.getButton(AlertDialog.BUTTON_POSITIVE);confirm.setId(R.id.address_confirm);confirm.setEnabled(false);confirm.setOnClickListener(v->verify());dialog.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);}
    boolean isShowing(){return !closed&&dialog.isShowing();}
    void dismiss(){dialog.dismiss();close();}
    private boolean current(int ticket){return !closed&&ticket==generation&&!activity.isFinishing()&&!activity.isDestroyed();}
    private void close(){if(closed)return;closed=true;generation++;main.removeCallbacksAndMessages(null);io.shutdownNow();}
    private void search(){
        if(closed||verifying)return;main.removeCallbacks(delayedSearch);String text=DeliveryChoice.label(query.getText().toString());
        if(text.length()<2||text.length()>200){message.setText("نام شهر و خیابان را وارد کنید.");return;}
        int ticket=++generation;selected=null;confirm.setEnabled(false);results.removeAllViews();progress.setVisibility(View.VISIBLE);message.setText("در حال جست‌وجوی نشانی در جت…");
        io.execute(()->{try{List<JetAddressClient.Point> points=client.search(text);main.post(()->{
            if(!current(ticket))return;progress.setVisibility(View.GONE);message.setText(points.isEmpty()?"نشانی پیدا نشد؛ نام شهر و خیابان را کامل‌تر بنویسید.":"نشانی موردنظر را انتخاب کنید.");
            for(JetAddressClient.Point point:points){Button row=button(point.title+"\n"+point.label,View.NO_ID);row.setAllCaps(false);results.addView(row);row.setOnClickListener(v->{if(verifying)return;selected=point;confirm.setEnabled(true);message.setText("انتخاب شما: "+point.label);android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)activity.getSystemService(Activity.INPUT_METHOD_SERVICE);if(keyboard!=null)keyboard.hideSoftInputFromWindow(query.getWindowToken(),0);});}
        });}catch(Exception e){main.post(()->{if(current(ticket)){progress.setVisibility(View.GONE);message.setText("پاسخی از جت دریافت نشد؛ دوباره جست‌وجو کنید یا از نقشه استفاده کنید.");}});}});
    }
    private void verify(){
        if(closed||verifying||selected==null)return;JetAddressClient.Point choice=selected;int ticket=++generation;verifying=true;query.setEnabled(false);search.setEnabled(false);confirm.setEnabled(false);progress.setVisibility(View.VISIBLE);message.setText("در حال بررسی خدمات جت در این موقعیت…");
        io.execute(()->{try{JetAddressClient.Verified result=client.verify(choice);main.post(()->{
            if(!current(ticket))return;idle();if(!result.inService){message.setText("جت این نقطه را خارج از محدودهٔ خدمات اعلام کرده است؛ نشانی دیگری انتخاب کنید.");return;}
            dismiss();listener.selected(result);
        });}catch(Exception e){main.post(()->{if(current(ticket)){idle();message.setText("بررسی موقعیت کامل نشد؛ دوباره تأیید کنید یا نشانی دیگری انتخاب کنید.");}});}});
    }
    private void idle(){verifying=false;query.setEnabled(true);search.setEnabled(true);confirm.setEnabled(selected!=null);progress.setVisibility(View.GONE);}
}
