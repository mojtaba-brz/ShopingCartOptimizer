/* Read-only public catalogue metadata and price tiers. Never observes account,
 * address, cart endpoints, request headers or credentials; no persistence. */
(function(root){
 'use strict';if(root.CartwiseCatalog)return;
 const rows=new Map(),products=new Map(),types=root.CartwiseTypes;
 const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e13;
 function find(id,name){const found=[...rows.values()].filter(x=>(!id||x.store_id===String(id))&&(!name||types.norm(x.store_name)===types.norm(name)));return found.length===1?found[0]:{};}
 function merchant(x){if(!x||x.id==null||typeof x.title!=='string')return null;const candidates=[x.business,x.activity_type,x.activity_description].map(types.type),store_type=candidates.find(t=>t!=='unknown')||find(x.id,x.title).store_type||'unknown';return {store_id:String(x.id),store_name:x.title.slice(0,160),store_type,type_source:store_type==='unknown'?'unknown':'catalogue'};}
 function remember(shop,x){
  if(!shop)return;const key=shop.store_type+'|'+shop.store_id,old=rows.get(key),fields={...old?.fee_fields},unknown=new Set(old?.unknown_fee_fields||[]),delivery=x?.delivery,plus=typeof delivery?.is_free_by_plus==='boolean'?delivery.is_free_by_plus:old?.shipping_plus_only===true;
  if(delivery&&typeof delivery==='object')for(const [field,property,label] of [['delivery_fee','cost','هزینه ارسال'],['free_delivery_over','free_shipping_price','حد ارسال رایگان']]){
   if(!Object.prototype.hasOwnProperty.call(delivery,property)&&!plus)continue;
   const value=delivery[property];if(!plus&&money(value)&&(field!=='free_delivery_over'||value>0)){fields[field]={value,evidence:label+': '+value+' ریال'};unknown.delete(field);}else{delete fields[field];unknown.add(field);}
  }
  rows.set(key,{...shop,fee_fields:fields,unknown_fee_fields:[...unknown],shipping_plus_only:plus});
 }
 function ingest(value){let count=0;const seen=new WeakSet();function walk(x,parent){if(!x||typeof x!=='object'||seen.has(x)||++count>15000)return;seen.add(x);
  let shop=parent;
  if(!Array.isArray(x)){
   if(x.shop){shop=merchant(x.shop)||shop;remember(shop,x.shop);}
   if(x.id!=null&&typeof x.title==='string'&&(Array.isArray(x.products)||x.delivery&&x.activity_type!=null)){shop=merchant(x)||shop;remember(shop,x);}
   if(shop&&typeof x.title==='string'&&x.id!=null&&x.price&&money(x.price.price)&&money(x.price.discount)&&x.price.discount<=x.price.price){
    // Jet's public formatter uses price.price - price.discount as the ordinary
    // payable price and product_first.aggregated_price for its special selection.
    const base=x.price.price-x.price.discount,first=x.product_first?.aggregated_price,hasFirst=money(first)&&first<=base,amazing=hasFirst||x.badges?.is_amazing===true||x.badges?.is_dynamic_amazing===true;
    const current=hasFirst?first:base;let post=hasFirst?base:amazing?null:base,price_source=hasFirst?'catalogue-product-first':'catalogue-ordinary';
    // The live public price splits ordinary vendor/brand discounts from Jet's
    // amazing contribution. Accept this derivation only when the components
    // are complete, nonnegative and reconcile exactly with the displayed total.
    const components=[x.price.vendor_discount,x.price.brand_discount,x.price.jet_discount];
    if(amazing&&!hasFirst&&components.every(money)&&components[2]>0&&components.reduce((n,v)=>n+v,0)===x.price.discount){post=x.price.price-components[0]-components[1];price_source='catalogue-components';}
    const seconds=x.price.timer,remaining=x.dynamic_amazing?.remaining_stock;
    const p={...shop,has_stock:typeof x.stock?.has_stock==='boolean'?x.stock.has_stock:null,amazing_remaining:Number.isSafeInteger(remaining)&&remaining>=0?remaining:null,amazing_expires_at:Number.isFinite(seconds)&&seconds>=0&&seconds<=2592000?Date.now()+seconds*1000:null,product_id:String(x.id),title:x.title.slice(0,300),regular_price:x.price.price,current_price:current,amazing,post_amazing_price:post,post_amazing_verified:post!==null,post_amazing_source:post!==null?price_source:''};
    const key=shop.store_type+'|'+shop.store_id+'|'+p.product_id;products.set(key,p);
   }
  }
  for(const [key,v] of Object.entries(x))if(!['user','customer','account','address','token','cart','cart_items'].includes(key)&&v&&typeof v==='object')walk(v,shop);
 }walk(value,null);while(products.size>12000)products.delete(products.keys().next().value);}
 function allowed(url){try{const u=new URL(url,location.origin);return u.origin==='https://api.digikalajet.ir'&&/^\/(?:v2\/search\/|search\/shop\/|products\/search\/|shop\/|v3\/main-page\/)/.test(u.pathname);}catch{return false;}}
 const fetch=root.fetch.bind(root);root.fetch=function(...args){return fetch(...args).then(r=>{if(allowed(r.url))r.clone().json().then(ingest).catch(()=>{});return r;});};
 const send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(...args){this.addEventListener('load',()=>{if(!allowed(this.responseURL))return;try{ingest(this.responseType==='json'?this.response:JSON.parse(this.responseText));}catch{}},{once:true});return send.apply(this,args);};
 root.CartwiseCatalog={ingest,find,findProduct(id,name,title,current){if(!id&&!name)return {};const found=[...products.values()].filter(p=>(!id||p.store_id===String(id))&&(!name||types.norm(p.store_name)===types.norm(name))&&types.norm(p.title)===types.norm(title)&&p.current_price===current);const variants=new Set(found.map(p=>JSON.stringify([p.store_type,p.store_id,p.product_id,p.regular_price,p.post_amazing_price,p.amazing])));return variants.size===1?found[0]:{};}};
})(globalThis);
