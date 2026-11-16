/* One optional login flow for both hosts. Only status and visible basket quotes
 * cross the retailer bridge; session material stays in the official browser. */
(function(){
 'use strict';
 const r=window.CartwiseRetailer,card=document.getElementById('jet-account');if(!card)return;
 if(!r?.connectAccount){card.hidden=true;return;}
 const note=card.querySelector('[role=status]'),connect=card.querySelector('[data-connect-account]'),read=card.querySelector('[data-read-account]'),logout=card.querySelector('[data-disconnect-account]');
 let working=false,status='disconnected',quote=null;
 const parse=x=>typeof x==='string'?JSON.parse(x):x||{};
 const context=x=>{const p=String(x.coordinates||'').split('|');return JSON.stringify([x.shipment_type||'',p.length===2&&p.every(v=>v.trim()&&Number.isFinite(Number(v)))?p.map(Number):x.location||'']);};
 const labels={disconnected:'حساب جت متصل نشده است.',saved:'نشست جت روی این دستگاه ذخیره شده است؛ ورود هنگام خواندن سبد دوباره بررسی می‌شود.',signed_in:'ورود به حساب جت در صفحهٔ رسمی تأیید شد.',login_required:'نشست جت منقضی شده؛ دوباره وارد شوید.'};
 function paint(text){note.textContent=text||labels[status]||labels.disconnected;connect.disabled=read.disabled=logout.disabled=working;read.disabled=working||!['saved','signed_in'].includes(status);logout.hidden=status==='disconnected';}
 function update(data){if(data.account_status||data.status)status=data.account_status||data.status;working=false;if(status==='disconnected'||status==='login_required')quote=null;paint(data.error||data.notice);}
 function start(method,text){if(busy||working){message('ابتدا عملیات جاری را متوقف کنید یا منتظر پایان آن بمانید.',true);return;}working=true;paint(text);try{const p=r[method]();p?.catch?.(e=>update({error:e.message}));}catch(e){update({error:e.message});}}
 connect.onclick=()=>start('connectAccount','در صفحهٔ رسمی جت وارد شوید؛ پس از ورود به برنامه برگردید.');
 read.onclick=()=>start('readAccountCart','در حال خواندن سبد حساب…');
 logout.onclick=()=>start('disconnectAccount','در حال پاک‌کردن نشست جت…');
 window.CartwiseAccount={get busy(){return working;},quoteFor(delivery){return quote&&context(quote)===context(delivery)&&CartwiseCheckout.clean([quote.checkout]).length?quote.checkout:null;}};
 window.addEventListener('cartwise:account',e=>{try{update(parse(e.detail));}catch{update({error:'بررسی نشست کامل نشد؛ دوباره تلاش کنید.'});}});
 window.addEventListener('cartwise:account-cart',e=>{try{const x=parse(e.detail);if(x.checkout){quote=x;update({...x,notice:x.notice||(x.checkout.delivery_verified===false?'سبد خوانده شد، اما نشانی آن قابل تأیید نبود؛ مبلغ هنوز تأیید نشده است.':'هزینه‌های سبد حساب خوانده شد؛ فقط برای کالاها و تعداد مطابق استفاده می‌شود.')});}else update(x);}catch{update({error:'خواندن سبد حساب کامل نشد؛ مبلغ تأیید نشده است.'});}});
 window.addEventListener('cartwise:auto-results',e=>{try{const x=parse(e.detail);if(x.account_status)update({account_status:x.account_status,notice:x.account_notice});}catch{}});
 Promise.resolve(r.accountStatus?.()).then(x=>update(parse(x))).catch(()=>update({error:'بررسی نشست کامل نشد؛ دوباره تلاش کنید.'}));
})();
