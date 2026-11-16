/* Product reuse is short-lived; observed store fee fields persist for seven days. */
(function(root){
 'use strict';
 const feeKey='cartwise.store-fees.v1',feeTTL=604800000;
 function storedFees(context){try{const data=JSON.parse(root.localStorage?.getItem(feeKey)||'null');return data?.context===context&&Array.isArray(data.quotes)?data.quotes.filter(q=>q.page_kind==='store'&&Date.now()-Date.parse(q.captured_at)<feeTTL&&Date.parse(q.captured_at)<=Date.now()+60000):[];}catch{return [];}}
 function saveFees(context,quotes){
  const fields=new Map();for(const q of [...storedFees(context),...quotes].filter(q=>q.page_kind==='store'&&q.store_id&&['digikala-public-store','digikala-visible-checkout'].includes(q.source)).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at))){
   if(!Number.isFinite(Date.parse(q.captured_at))||Date.now()-Date.parse(q.captured_at)>feeTTL)continue;
   for(const key of ['delivery_fee','service_fee','packaging_fee','processing_fee','tax_fee','minimum_order','free_delivery_over']){
    const id=JSON.stringify([q.store_type,q.store_id,key]),unknown=q.unknown_fields?.includes(key),f=q.fields?.[key];
    if(unknown||f&&Number.isSafeInteger(f.value)&&f.value>=0)fields.set(id,{source:q.source,page_kind:'store',page_url:q.page_url,store_id:q.store_id,store_name:q.store_name,store_type:q.store_type,captured_at:q.captured_at,fields:unknown?{}:{[key]:f},unknown_fields:unknown?[key]:[],notices:[]});
   }
  }
  const rows=[...fields.values()].slice(-300);try{root.localStorage?.setItem(feeKey,JSON.stringify({context,quotes:rows}));}catch{}return rows;
 }
 class Session{
  constructor(){this.entries=new Map();this.quotes=[];this.context='';}
  reset(context){this.entries.clear();this.quotes=storedFees(context);this.context=context;}
  key(item){return JSON.stringify([item.query||item.name,item.department||'supermarket']);}
  pending(items,context,all=false,missing=[]){if(all||context!==this.context)this.reset(context);const now=Date.now(),retry=new Set(missing);return items.filter(i=>{const e=this.entries.get(this.key(i));return !e||now-e.time>900000||!e.row.products?.length||retry.has(i.id);});}
  merge(items,result,context){if(this.context&&this.context!==context)this.reset(context);this.context=context;for(const i of items){const e=result.items.find(x=>x.id===i.id);if(e)this.entries.set(this.key(i),{row:e,time:Date.now()});}const fresh=result.checkout_quotes||[];this.quotes=[...saveFees(context,[...this.quotes,...fresh]),...fresh.filter(q=>q.page_kind!=='store')].slice(-300);this.resources=result.resources;}
  result(items,delivery){const keys=new Set(items.map(i=>this.key(i)));for(const k of this.entries.keys())if(!keys.has(k))this.entries.delete(k);return {source:'digikala-automatic',...delivery,captured_at:new Date(Math.min(Date.now(),...items.map(i=>this.entries.get(this.key(i))?.time||Date.now()))).toISOString(),items:items.map(i=>({...this.entries.get(this.key(i))?.row,id:i.id,products:this.entries.get(this.key(i))?.row.products||[]})),checkout_quotes:this.quotes,resources:this.resources};}
 }
 root.CartwiseSearchSession=Session;if(typeof module!=='undefined')module.exports=Session;
})(typeof globalThis!=='undefined'?globalThis:window);
