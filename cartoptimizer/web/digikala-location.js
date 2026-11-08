/* Replay only an unambiguous previously selected address and delivery mode in
 * the retailer's visible picker. No storage, credentials or guessed API writes. */
(function(saved){
 'use strict';
 const visible=e=>e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const norm=s=>String(s||'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').replace(/^ارسال به\s*/,'').trim();
 const text=e=>(e.innerText||'').trim().replace(/\s+/g,' '),wanted=norm(saved.location);
 if(location.protocol!=='https:'||!['www.digikala.com','digikala.com'].includes(location.hostname)||!wanted)return {state:'unavailable'};
 const nodes=Array.from(document.querySelectorAll('button,[role=button],label,p,span')).filter(visible);
 const headers=[...nodes,...document.querySelectorAll('header *,#root p,#root span,#root div')];
 const current=headers.filter(e=>visible(e)&&e.children.length<4&&/^ارسال به/.test(text(e))&&text(e).length<300).map(e=>norm(text(e)));
 if(current.includes(wanted)){
  const mode=saved.shipment_type==='scheduled'?/ارسال زمان.?دار/:/ارسال فوری/;
  const target=nodes.find(e=>e.tagName==='BUTTON'&&mode.test(text(e)));
  if(target&&target.getAttribute('aria-selected')!=='true'&&target.getAttribute('aria-pressed')!=='true'&&!target.classList.contains('bg-v3-primary-fresh-600')){
   if(!target.dataset.cartwiseMode){target.dataset.cartwiseMode='1';target.click();return {state:'selecting-mode'};}
  }
  return {state:'address-matches'};
 }
 const dialog=Array.from(document.querySelectorAll('[role=dialog],dialog[open]')).find(visible);
 const editing=!!dialog||/add-address|[?&]MID=[^&]*(?:address|location)/i.test(location.href);
 if(editing){
  const candidates=nodes.filter(e=>norm(text(e))===wanted).map(e=>e.closest('button,[role=button],label')||e);
  const unique=[...new Set(candidates)].filter(e=>!candidates.some(other=>other!==e&&e.contains(other)));
  if(unique.length===1&&!unique[0].dataset.cartwiseAddress){unique[0].dataset.cartwiseAddress='1';unique[0].click();return {state:'selecting-address'};}
  return {state:unique.length>1?'ambiguous':'needs-location'};
 }
 const opener=nodes.find(e=>e.tagName==='BUTTON'&&/^(?:ارسال به|انتخاب آدرس|تغییر آدرس|انتخاب موقعیت)/.test(text(e))&&text(e).length<300);
 if(opener&&!opener.dataset.cartwiseAddressOpen){opener.dataset.cartwiseAddressOpen='1';opener.click();return {state:'opening-picker'};}
 return {state:'needs-location'};
})
