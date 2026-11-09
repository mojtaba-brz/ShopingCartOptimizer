/* One read-only search task, shared by Playwright and Android WebViews.
 * The host schedules independent global/store tasks across a bounded page pool.
 * Adapters are installed by the host from the same bundled, reviewed sources. */
(function(root){
 'use strict';
 root.CartwiseSearchTask={start(options){
  const state={done:false,products:0,stores:0,detail:'آماده‌سازی صفحه…'};
  root.cartwiseTask=state;
  const a=root.CartwiseSearchAdapters,rows=new Map(),shops=new Set(),quotes=[],tasks=[],warnings=[];
  const deadline=Date.now()+Math.max(1000,Math.min(180000,options.seconds*1000||60000));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const check=()=>{if(state.cancelled)throw Error('cancelled');if(Date.now()>deadline)throw Error('budget');};
  const scroll=top=>{let more=false;for(const e of [document.scrollingElement,...document.querySelectorAll('*')])if(e&&e.clientHeight>200&&e.scrollHeight>e.clientHeight+200&&(e===document.scrollingElement||['auto','scroll'].includes(getComputedStyle(e).overflowY))){e.scrollTop=top?0:e.scrollTop+Math.max(400,e.clientHeight*.8);more||=e.scrollTop+e.clientHeight<e.scrollHeight-20;}return more;};
  const collect=()=>{
   check();
   const pref=a.preference('read',{}),xy=String(pref.coordinates||'').split('|').map(Number),expected=String(options.coordinates||'').split('|').map(Number);
   if(!pref.configured||xy.length!==2||expected.length!==2||xy.some((x,i)=>!Number.isFinite(x)||Math.abs(x-expected[i])>1e-7))throw Error('location');
   const d=a.reader({store_name:options.store_name||'',expected_shop_id:options.shop_id||''});
   if(d.error&&/verify you are human|checking your browser|unusual traffic|captcha/i.test(document.body.innerText.slice(0,2000)))throw Error('challenge');
   for(const p of d.products||[]){const key=JSON.stringify([p.title,p.store_name,p.store_id,p.regular_price,p.promo_price]);if(rows.size<1000||rows.has(key))rows.set(key,p);}
   for(const s of d.shops||[])if(s.name)shops.add(s.name);
   const q=a.checkout();if(q&&Object.keys(q.fields||{}).length&&quotes.length<20){if(options.kind==='store'&&location.pathname==='/search/shop'&&new URLSearchParams(location.search).get('shopId')===options.shop_id&&q.page_kind!=='cart'){q.page_kind='store';q.store_name=options.store_name;q.store_id=options.shop_id;}const key=JSON.stringify([q.page_kind,q.fields,q.store_name,q.store_id]);if(!quotes.some(x=>x.key===key))quotes.push({key,quote:q});}
   state.products=rows.size;state.stores=shops.size;state.detail=options.store_name||'شناسایی کالاها و فروشگاه‌ها';
   return d;
  };
  const navigate=async url=>{check();if(!a.navigation(url))throw Error('navigation');await sleep(500);};
  async function scan(){
   let quiet=0,prior='',empty=0;
   for(let step=0;step<120;step++){
    const d=collect(),fp=JSON.stringify((d.products||[]).map(p=>[p.title,p.regular_price,p.promo_price,p.store_name]));
    const more=scroll(false);quiet=fp===prior&&!more?quiet+1:0;prior=fp;
    if(d.products?.length&&quiet>=3)return;
    if(!d.products?.length&&++empty>=18){warnings.push('صفحه در زمان بررسی کالای قابل خواندن نشان نداد.');return;}
    if(rows.size>=1000){warnings.push('سقف حافظهٔ این جست‌وجو رسید؛ نتایج ممکن است کامل نباشند.');return;}
    await sleep(400);
   }
   warnings.push('سقف پیمایش رسید؛ پوشش کامل تأیید نیست.');
  }
  (async()=>{
   try{
    for(let n=0;(!document.querySelector('#root')||(location.pathname==='/user/add-address'&&!document.querySelector('#root input[placeholder]')))&&n<80;n++){check();await sleep(250);}
    await navigate(options.url);await scan();
    if(options.kind!=='store')for(const name of shops){
     if(tasks.length>=(options.max_stores||40)){warnings.push('سقف بررسی فروشگاه‌ها رسید.');break;}
     await navigate(options.url);scroll(true);await sleep(100);let opened=false;
     for(let n=0;n<120;n++){
      check();if(a.expand(name)){opened=true;break;}if(!scroll(false))break;await sleep(250);
     }
     if(!opened){warnings.push('صفحهٔ کامل «'+name+'» باز نشد.');continue;}
     for(let n=0;n<20&&location.pathname!=='/search/shop';n++){check();await sleep(250);}
     const u=new URL(location.href),id=u.searchParams.get('shopId');
     if(u.protocol==='https:'&&['www.digikalajet.com','digikalajet.com'].includes(u.hostname)&&u.pathname==='/search/shop'&&id&&u.searchParams.get('q')===options.query)tasks.push({kind:'store',url:u.href,shop_id:id,store_name:name});
     else warnings.push('شناسهٔ فروشگاه «'+name+'» تأیید نشد.');
    }
   }catch(e){
    if(e.message==='location'||e.message==='challenge')state.fatal=e.message==='location'?'موقعیت جت تغییر کرد؛ جست‌وجو متوقف شد.':'جت درخواست تأیید انسانی داد؛ جست‌وجو متوقف شد.';
    else if(e.message!=='cancelled')warnings.push(e.message==='budget'?'بودجهٔ زمانی جست‌وجو تمام شد؛ نتایج بررسی‌شده نمایش داده می‌شوند.':'خواندن بخشی از صفحه کامل نشد.');
   }finally{
    state.result={products:[...rows.values()],store_tasks:tasks,checkout_quotes:quotes.map(x=>x.quote),error:[...new Set(warnings)].join('؛ ')||null};state.done=true;
   }
  })();
  return true;
 }};
})(globalThis);
