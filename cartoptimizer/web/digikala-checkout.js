/* Read only visible fee rows, basket notices and explicitly labelled quantities.
 * No cookies, account fields, hidden application state or cart mutations. */
(function(){
  'use strict';
  if(location.protocol!=='https:'||!['www.digikala.com','digikala.com'].includes(location.hostname))return null;
  const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
  const text=e=>(e?.innerText||'').trim().replace(/[\u200c\s]+/g,' ');
  const digits=s=>String(s).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  const rules={delivery_fee:/^هزینه\s*(?:ارسال|پیک)(?:\s|:|\(|$)/,service_fee:/^(?:هزینه\s*(?:خدمات|بسته بندی)|کارمزد)(?:\s|:|\(|$)/,
    minimum_order:/^حداقل\s*(?:مبلغ\s*)?(?:خرید|سفارش)(?:\s|:|$)/,free_delivery_over:/^ارسال رایگان (?:برای|با|از|در) (?:خرید|سفارش|مبلغ)/,
    subtotal:/^(?:قیمت کالاها|جمع کالاها|مبلغ کالاها)(?:\s|:|\(|$)/,total:/^(?:مبلغ قابل پرداخت|جمع کل|جمع سبد خرید)(?:\s|:|\(|$)/};
  function pricedText(node,s){
    if(/تومان|ریال/.test(s))return s;
    const icons=Array.from(node.querySelectorAll?.('img[src*="/toman."], svg[aria-label="تومان"], [data-testid="toman"]')||[]).filter(visible);
    return icons.length===1?s+' تومان':s;
  }
  function monetary(s){
    if(/(?:رایگان|بدون هزینه)/.test(s)&&!/[۰-۹٠-٩0-9]/.test(s))return 0;
    if(/(?:از|حدود)\s*[0-9]|[0-9]\s*تا\s*[0-9]/.test(digits(s)))return null;
    if((digits(s).match(/[0-9][0-9,٬]*(?:\.[0-9])?/g)||[]).length!==1)return null;
    const xs=[...digits(s).matchAll(/([0-9][0-9,٬]*(?:\.[0-9])?)\s*(تومان|ریال)/g)];
    if(xs.length!==1)return null;
    const v=Number(xs[0][1].replace(/[,٬]/g,''))*(xs[0][2]==='تومان'?10:1);
    return Number.isSafeInteger(v)&&v>=0&&v<=1e13?v:null;
  }
  const fields={},notices=[],seen=new Set();for(const key of Object.keys(rules))fields[key]=null;
  const values={};for(const key of Object.keys(rules))values[key]=new Map();
  for(const node of document.querySelectorAll('p,span,div,li,section')){
    if(!visible(node))continue;let s=text(node);if(!s||s.length>180)continue;
    for(const [key,re] of Object.entries(rules))if(re.test(s)){
      let evidence=pricedText(node,s),value=monetary(evidence);
      if(value===null&&node.parentElement&&visible(node.parentElement)){
        const parent=text(node.parentElement);
        if(parent.length<=180&&!Object.entries(rules).some(([other,re])=>other!==key&&new RegExp(re.source.slice(1)).test(parent))){evidence=pricedText(node.parentElement,parent);value=monetary(evidence);}
      }
      if(value!==null)values[key].set(value,{value,evidence:evidence.slice(0,180)});
    }
    if(node.children.length===0&&s.length<=180&&/(?:ناموجود|موجودی.*(?:تغییر|کمتر|کافی)|تغییر.*قیمت|قیمت.*تغییر|حداکثر.*(?:عدد|تعداد)|تعداد.*(?:اصلاح|کاهش|مجاز)|سبد.*به روز)/.test(s)&&!seen.has(s)){seen.add(s);notices.push(s);}
  }
  for(const key of Object.keys(rules))if(values[key].size===1)fields[key]=[...values[key].values()][0];
  let cartUrl='';for(const a of document.querySelectorAll('a[href]'))if(visible(a))try{
    const u=new URL(a.getAttribute('href'),location.href);
    if(u.origin===location.origin&&/^\/supermarket\/(?:[^?#]*\/)?(?:cart|checkout)\/?$/.test(u.pathname)){cartUrl=u.href;break;}
  }catch{}
  const pageKind=/(?:^|\/)(?:cart|checkout)(?:\/|$)/.test(location.pathname)?'cart':/^\/supermarket\/(?:store|shop|seller)\//.test(location.pathname)?'store':'catalog';
  const merchant=location.pathname.match(/\/(?:store|seller)\/([a-zA-Z0-9_-]+)/);
  let reportedUnits=null;
  const counts=new Set();for(const e of document.querySelectorAll('p,span,div'))if(visible(e)){
    const count=digits(text(e)).match(/^(?:تعداد کل کالاها|تعداد کالاها|تعداد کالا)\s*[:：]?\s*([0-9]+)(?:\s*عدد)?$/);
    if(count)counts.add(Number(count[1]));
  }
  if(counts.size===1)reportedUnits=[...counts][0];
  const cartItems=[];let unreadable=0;
  if(pageKind==='cart')for(const image of document.querySelectorAll('img[alt]')){
    if(!visible(image)||image.alt.trim().length<4)continue;
    let row=image.parentElement,quantity=null;
    for(let depth=0;row&&depth<7;depth++,row=row.parentElement){
      if(row.querySelectorAll('img[alt]').length!==1)break;
      const q=row.querySelector('[data-testid="cart-item-quantity"], [aria-label="تعداد"], input[type="number"]');
      const raw=q&&visible(q)?digits(q.value||text(q)):'';
      if(/^\d+$/.test(raw)&&Number(raw)>0&&Number(raw)<=50){quantity=Number(raw);break;}
    }
    if(quantity===null){unreadable++;continue;}
    cartItems.push({title:image.alt.trim().slice(0,300),quantity});
  }
  return {source:'digikala-visible-checkout',page_url:location.origin+location.pathname,page_kind:pageKind,
    merchant_key:merchant?merchant[1]:'',captured_at:new Date().toISOString(),fields,notices:notices.slice(0,20),cart_url:cartUrl,
    // Basket-specific amounts must never be assumed to describe the proposed basket.
    basket_verified:false,cart_items:cartItems,reported_units:reportedUnits,items_complete:pageKind==='cart'&&cartItems.length>0&&unreadable===0&&reportedUnits===cartItems.reduce((n,i)=>n+i.quantity,0)};
})()
