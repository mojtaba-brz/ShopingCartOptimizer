/* Main Android flow: list + location -> automatic candidates -> review. */
(function(){
  'use strict';
  if(!window.CartwiseAndroid?.findAutomatically || !window.CartwiseAuto)return;
  document.body.classList.add('automatic');
  document.querySelector('#tab-list .section-heading h2').textContent='لیست خرید شما';
  document.querySelector('#tab-list .section-heading p:last-child').textContent='نام و تعداد را وارد کنید. اگر وزن یا حجم بنویسید، تعداد در آن ضرب می‌شود؛ مثلاً ۲ × شیر ۱ لیتر یعنی ۲ لیتر.';
  document.querySelector('#tab-results .section-heading h2').textContent='بررسی سبد پیشنهادی';
  document.querySelector('#tab-results .section-heading p:last-child').textContent='کالاها و محدودیت‌های برآورد را بررسی کنید.';
  const itemForm=$('item-form');itemForm.elements.name.placeholder='مثلاً شیر کم چرب ۱ لیتر';
  itemForm.querySelector('label.grow').firstChild.textContent='نام کالا';
  itemForm.querySelector('.qty-field').firstChild.textContent='تعداد';
  itemForm.querySelector('button').textContent='افزودن';
  const live=$('live-card');live.querySelector('h3').textContent='موقعیت تحویل';
  live.querySelectorAll('.hint')[0].textContent='فهرست را وارد کنید و دکمه پیدا کردن سبد را بزنید؛ برنامه خودش کالاها و قیمت‌ها را جست‌وجو می‌کند.';
  live.querySelectorAll('.hint')[1].textContent='در صورت نیاز، موقعیت تحویل را یک‌بار انتخاب کنید.';
  const locationButton=$('live-location-button');
  const oldRender=render;
  render=function(){oldRender();if(locationButton)locationButton.textContent=metaLabel();
    $('summary').textContent=state.items.length+' قلم کالا';$('run-hint').textContent='جست‌وجو و محاسبه خودکار';};
  function metaLabel(){return $('live-location')?.textContent.includes('Choose an address')?'انتخاب موقعیت':'تغییر موقعیت';}
  const originalMessage=message;
  message=function(text,error){originalMessage(text==='Saved. Your cart plan will use these inputs.'?'ذخیره شد.':text,error);};
  const oldButton=$('optimize'),button=oldButton.cloneNode(false);button.id='optimize';button.textContent='پیدا کردن سبد خرید';oldButton.replaceWith(button);
  let requested=[], lastResult=null, selected={};
  function currentItems(){
    const rows=[],byName=new Map();
    for(const item of state.items){
      const key=CartwiseAuto.normalize(item.name);if(!key)throw Error('نام کالا را وارد کنید.');
      if(byName.has(key)){const row=byName.get(key);row.quantity+=item.quantity;if(row.quantity>50)throw Error('تعداد هر کالا حداکثر ۵۰ عدد است.');}
      else {const query=CartwiseAuto.amount(item.name)?CartwiseAuto.searchTerm(item.name):item.name;const row={id:item.id,name:item.name,quantity:item.quantity,query:query||item.name};rows.push(row);byName.set(key,row);}
    }
    return rows;
  }
  button.addEventListener('click',()=>{
    if(busy)return;if(dirty.size)return message('ابتدا تغییرات فرم را ذخیره کنید.',true);
    try{requested=currentItems();if(!requested.length)throw Error('ابتدا کالاهای مورد نیاز را به لیست اضافه کنید.');
      selected={};lastResult=null;busy=true;button.disabled=true;button.textContent='در حال جست‌وجو…';
      message('در حال آماده‌سازی جست‌وجوی خودکار…');window.CartwiseAndroid.findAutomatically(JSON.stringify(requested));
    }catch(e){busy=false;button.disabled=false;button.textContent='پیدا کردن سبد خرید';message(e.message,true);}
  });
  function done(){busy=false;button.disabled=false;button.textContent='جست‌وجو و محاسبه دوباره';}
  window.addEventListener('cartwise:auto-cancelled',()=>{done();message('جست‌وجو متوقف شد.');});
  window.addEventListener('cartwise:auto-results',async e=>{
    try{
      const payload=typeof e.detail==='string'?JSON.parse(e.detail):e.detail;
      if(payload?.error)throw Error(payload.error);
      if(!payload||payload.source!=='digikala-automatic'||typeof payload.location!=='string'||!payload.location.trim()||
        !['scheduled','on_demand'].includes(payload.shipment_type)||!Array.isArray(payload.items)||payload.items.length!==requested.length)
        throw Error('نتایج فروشگاه ناقص است. دوباره تلاش کنید.');
      if(JSON.stringify(currentItems())!==JSON.stringify(requested))throw Error('لیست تغییر کرده است؛ جست‌وجو را دوباره اجرا کنید.');
      lastResult=payload;await calculate();
    }catch(error){message(error.message||'جست‌وجو ناموفق بود.',true);}
    finally{done();}
  });
  async function calculate(){
    if(!lastResult)return;
    const amountItems=requested.filter(i=>CartwiseAuto.amount(i.name)), countItems=requested.filter(i=>!CartwiseAuto.amount(i.name));
    const amountResults=new Map(amountItems.map(i=>[i.id,CartwiseAuto.amountPlans(i,lastResult.items.find(r=>r.id===i.id)?.products)]));
    const {missing,snapshot}=CartwiseAuto.build(countItems,lastResult.items,lastResult.location,lastResult.shipment_type,selected);
    for(const item of amountItems)if(!amountResults.get(item.id)?.plans.length)missing.push(item.name);
    const location=escapeHTML(lastResult.location),mode=lastResult.shipment_type==='scheduled'?'زمان‌دار':'فوری';
    const incomplete=lastResult.items.filter(i=>i.error).map(i=>requested.find(x=>x.id===i.id)?.name||i.id);
    const warning='<div class="auto-notice">هزینه ارسال، کوپن‌های قابل استفاده، موجودی دقیق و سهمیه تخفیف در داده‌های خوانده‌شده مشخص نیستند؛ این جمع فقط برآورد قیمت کالاهاست. برای کالای تخفیف‌دار، یک عدد با قیمت تخفیف و بقیه با قیمت عادی فرض شده است. قیمت واحد فقط وقتی اندازه بسته قابل تشخیص باشد نشان داده می‌شود.</div>'+(countItems.length?'<div class="auto-notice">برای اقلام بدون وزن یا حجم، انتخاب خودکار حداکثر پنج گزینه را محاسبه می‌کند؛ گزینه‌های بیشتر در فهرست انتخاب هستند.</div>':'')+(incomplete.length?`<div class="auto-notice">جست‌وجوی این اقلام ممکن است کامل نباشد: ${incomplete.map(escapeHTML).join('، ')}</div>`:'');
    if(missing.length){$('results').innerHTML=`<section class="card" dir="rtl"><h3>برای بعضی اقلام نتیجه قابل اتکا پیدا نشد</h3><p>${missing.map(escapeHTML).join('، ')}</p><p>نام، وزن یا برند را دقیق‌تر بنویسید و دوباره جست‌وجو کنید.</p>${warning}</section>`;showTab('results');$('tab-label').textContent='نتیجه';message('جست‌وجو کامل نشد؛ اقلام بالا بررسی شوند.',true);return;}
    const result=countItems.length?await CartwiseEngine.optimize(snapshot,{timeLimit:5000,stateLimit:200000}):{total:0,carts:[],warnings:[]};
    if(countItems.length&&!result.carts.length)throw Error(result.reason||'سبدی پیدا نشد.');
    result.optimal=false;result.status='estimate';result.warnings=[...(result.warnings||[]),'Shipping fees, coupon eligibility, stock and promotion limits were not verified.'];
    plan=result;
    const lines=result.carts.flatMap(c=>c.lines);
    let total=result.total;
    const details=requested.map(item=>{
      const byAmount=amountResults.get(item.id);
      if(byAmount){
        const ix=Math.max(0,Math.min(byAmount.plans.length-1,Number(selected[item.id]||0)||0)), chosen=byAmount.plans[ix];total+=chosen.cost;
        const unit=byAmount.unit==='g'?'گرم':'میلی‌لیتر';
        const choices=byAmount.plans.map((p,n)=>`<option value="${n}" ${n===ix?'selected':''}>${p.total<byAmount.target?'کمتر از مقدار درخواستی':n===0?'کمترین هزینه پیدا شده':'گزینه '+(n+1)} · ${p.total} ${unit} · ${p.quantity} بسته · ${money(p.cost)} تومان</option>`).join('');
        const purchased=chosen.lines.map(l=>`<li>${escapeHTML(l.title)} × ${l.quantity} — ${money(l.subtotal)} تومان</li>`).join('');
        return `<article class="auto-result-item"><h4>${escapeHTML(item.name)} · نیاز: ${byAmount.target} ${unit}</h4><ul>${purchased}</ul><p>مقدار پیشنهادی: ${chosen.total} ${unit}${chosen.total<byAmount.target?' (کمتر از نیاز)':''} · میانگین هر ${byAmount.unit==='g'?'کیلوگرم':'لیتر'}: ${money(chosen.cost*1000/chosen.total)} تومان</p><label>گزینه‌های مقدار و قیمت<select data-auto-item="${escapeHTML(item.id)}">${choices}</select></label>${byAmount.complete?'':'<p>مقایسه به محدودیت محاسباتی رسید و ممکن است گزینه بهتری وجود داشته باشد.</p>'}</article>`;
      }
      const options=CartwiseAuto.rank(item,lastResult.items.find(r=>r.id===item.id)?.products,1000), chosen=lines.filter(l=>l.item_id===item.id);
      const choices=options.map(o=>{const a=CartwiseAuto.amount(o.title), unit=a?` · هر ${a.unit==='g'?'کیلوگرم':'لیتر'}: ${money(CartwiseAuto.estimated(o,item.quantity)*1000/(a.value*item.quantity))} تومان`:'';return `<option value="${escapeHTML(o.title)}" ${selected[item.id]===o.title?'selected':''}>${escapeHTML(o.title)} — ${money(CartwiseAuto.estimated(o,item.quantity))} تومان${unit}</option>`;}).join('');
      const purchased=chosen.map(l=>`<li>${escapeHTML(l.title)} × ${l.quantity} — ${money(l.subtotal)} تومان</li>`).join('');
      return `<article class="auto-result-item"><h4>${escapeHTML(item.name)} · ${item.quantity} عدد</h4><ul>${purchased}</ul><label>تغییر انتخاب (در صورت نیاز)<select data-auto-item="${escapeHTML(item.id)}"><option value="">انتخاب خودکار</option>${choices}</select></label></article>`;
    }).join('');
    $('results').innerHTML=`<section class="card" dir="rtl"><h3>سبد پیشنهادی</h3><p>${location} · ارسال ${mode}</p><p class="auto-total">${money(total)} <small>تومان، برآورد قیمت کالاها</small></p>${warning}${details}<p class="hint">فقط کالاهای خوانده‌شده بررسی شده‌اند. نام و اندازه کالاها را پیش از خرید مرور کنید.</p></section>`;
    $('results').querySelectorAll('[data-auto-item]').forEach(el=>el.addEventListener('change',async()=>{selected[el.dataset.autoItem]=el.value;try{await calculate();}catch(e){message(e.message,true);}}));
    $('export-plan').hidden=true;showTab('results');$('tab-label').textContent='نتیجه';message('سبد پیشنهادی آماده است.');
  }
  render();
})();
