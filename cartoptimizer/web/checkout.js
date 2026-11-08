/* Checkout observations are tied to one location/mode and never treated as general fee rules. */
(function(root){
  'use strict';
  const keys=['delivery_fee','service_fee','minimum_order','free_delivery_over','subtotal','total'];
  function clean(rows){
    const quotes=[],seen=new Set();
    for(const q of Array.isArray(rows)?rows:[]){
      if(!q||q.source!=='digikala-visible-checkout'||!['cart','store','catalog'].includes(q.page_kind))continue;
      let url;try{url=new URL(q.page_url);if(url.protocol!=='https:'||!['www.digikala.com','digikala.com','www.digikalajet.com','digikalajet.com'].includes(url.hostname)||url.username||url.password||url.port)continue;}catch{continue;}
      const date=Date.parse(q.captured_at);if(!Number.isFinite(date)||Math.abs(Date.now()-date)>1800000)continue;
      const fields={};for(const key of keys){const f=q.fields?.[key];if(f&&Number.isSafeInteger(f.value)&&f.value>=0&&f.value<=1e13)fields[key]={value:f.value,evidence:String(f.evidence||'').slice(0,180)};}
      const notices=(Array.isArray(q.notices)?q.notices:[]).filter(n=>typeof n==='string'&&n.length<=180).slice(0,20);
      if(!Object.keys(fields).length&&!notices.length)continue;
      const cartItems=(Array.isArray(q.cart_items)?q.cart_items:[]).filter(i=>i&&typeof i.title==='string'&&i.title.length<=300&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=50).slice(0,1000).map(i=>({title:i.title,quantity:i.quantity,store_name:typeof i.store_name==='string'?i.store_name.trim().slice(0,160):'',store_id:typeof i.store_id==='string'?i.store_id.slice(0,200):''}));
      const signature=JSON.stringify([q.page_kind,url.pathname,fields,notices,cartItems]);if(seen.has(signature))continue;seen.add(signature);
      quotes.push({page_kind:q.page_kind,page_url:url.origin+url.pathname,captured_at:q.captured_at,fields,notices,cart_items:cartItems,reported_units:q.reported_units,items_complete:q.items_complete===true&&cartItems.length===q.cart_items?.length&&Number.isInteger(q.reported_units)&&q.reported_units===cartItems.reduce((n,i)=>n+i.quantity,0)});
    }
    return quotes.slice(-8);
  }
  function reconcile(quote,proposed){
    if(quote?.page_kind!=='cart'||!quote.items_complete||!quote.fields?.total||!proposed?.length)return {verified:false};
    const norm=s=>String(s).normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').trim();
    const combined=[...quote.cart_items,...proposed],hasStores=combined.some(x=>x.store_name||x.store_id);
    let field='';if(hasStores){if(combined.every(x=>x.store_name))field='store_name';else if(combined.every(x=>x.store_id))field='store_id';else return {verified:false};}
    function quantities(rows){const m=new Map();for(const x of rows){const key=JSON.stringify([norm(x.title),field?norm(x[field]):'']);m.set(key,(m.get(key)||0)+x.quantity);}return m;}
    const actual=quantities(quote.cart_items),wanted=quantities(proposed);
    if(actual.size!==wanted.size||[...wanted].some(([title,n])=>actual.get(title)!==n))return {verified:false};
    return {verified:true,total:quote.fields.total.value,notices:quote.notices};
  }
  const api={clean,reconcile};root.CartwiseCheckout=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
