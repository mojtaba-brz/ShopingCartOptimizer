/* Pure automatic matching/planning helpers. Values remain integer rials. */
(function(root){
  'use strict';
  function normalize(text){
    return String(text||'').normalize('NFKC').toLowerCase()
      .replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c))
      .replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[\u064b-\u065f\u0670\u200c]/g,' ')
      .replace(/لیتری/g,'لیتر').replace(/کیلویی/g,'کیلوگرم').replace(/گرمی/g,'گرم')
      .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  function tokens(s){return normalize(s).split(/\s+/).filter(Boolean);}
  function matches(query,title){
    const terms=tokens(query), product=new Set(tokens(title));
    return terms.length>0 && terms.every(t=>product.has(t));
  }
  function product(p){
    if(!p || typeof p.title!=='string' || !p.title.trim() || p.title.length>300 ||
      !Number.isSafeInteger(p.regular_price) || p.regular_price<1 || p.regular_price>1e13) return null;
    if(p.promo_price!==null && (!Number.isSafeInteger(p.promo_price) || p.promo_price<0 || p.promo_price>=p.regular_price)) return null;
    return {title:p.title,regular_price:p.regular_price,promo_price:p.promo_price,url:typeof p.url==='string'&&p.url.startsWith('https://www.digikala.com/')?p.url:''};
  }
  function rank(item,rows){
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).map(product).filter(p=>{
      if(!p||!matches(item.name,p.title)||seen.has(normalize(p.title)))return false;
      seen.add(normalize(p.title));return true;
    }).sort((a,b)=>estimated(a,item.quantity)-estimated(b,item.quantity)).slice(0,5);
  }
  // Unknown stock and quota are assumptions: one discounted unit, remaining at the displayed regular price.
  function estimated(p,quantity){return p.regular_price*quantity-(p.promo_price===null?0:p.regular_price-p.promo_price);}
  function build(items,results,location,mode){
    const offers=[],missing=[];let counter=0;
    for(const item of items){
      const entry=results.find(r=>r.id===item.id), choices=rank(item,entry?.products);
      if(!choices.length){missing.push(item.name);continue;}
      for(const p of choices)offers.push({id:'auto-'+(++counter),item_id:item.id,store_id:'digikala-auto',title:p.title,
        regular_price:p.regular_price,promo_price:p.promo_price,promo_limit:p.promo_price===null?0:1,
        promo_scope:'account',stock:item.quantity,confirmed:true,url:p.url});
    }
    return {missing, snapshot:{schema_version:1,currency:'IRR',source:'digikala-automatic-estimate',captured_at:new Date().toISOString(),
      context:location+' · '+mode,max_carts:1,items:items.map(({id,name,quantity})=>({id,name,quantity})),offers,coupons:[],
      stores:[{id:'digikala-auto',name:'Digikala Supermarket',delivery_fee:0,service_fee:0,minimum_order:0,free_delivery_over:null,threshold_basis:'before_coupon'}]}};
  }
  const api={normalize,matches,rank,build,estimated};root.CartwiseAuto=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
