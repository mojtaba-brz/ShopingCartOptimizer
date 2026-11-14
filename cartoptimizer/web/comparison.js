/* Offer comparison by displayed price per kg/litre/item, never by package subtotal.
 * Unlike units stay in separate groups. Missing or ambiguous sizes are explicit. */
(function(root){
 'use strict';
 const a=root.CartwiseAuto||(typeof require!=='undefined'?require('./auto-planner.js'):null);
 const packages=root.CartwisePackages||(typeof require!=='undefined'?require('./package-size.js'):null);
 const measure=packages.measure;

 function key(p){return encodeURIComponent([p.store_type||'supermarket',a.normalize(p.title),p.store_id||a.normalize(p.store_name||''),p.url||''].join('|'));}
 function unitPrice(p,regular=false){if(regular&&p.regular_verified===false)return null;const size=measure(p.title);if(!size.value)return null;return (regular?p.regular_price:(p.promo_price??p.regular_price))*(['g','ml'].includes(size.unit)?1000:1)/size.value;}
 function query(name){return a.searchTerm(name).replace(/(?:بسته|پک)?\s*[۰-۹٠-٩0-9]+\s*(?:عددی|تایی|عدد)/gu,' ').replace(/\s+/g,' ').trim();}
 function options(item,rows,review=false){
  const q={...item,name:query(item.name)||item.name};
  const candidates=review?a.suggestions(q,rows):a.rank(q,rows,1000),seen=new Map();
  for(const raw of candidates){const p={...raw,key:key(raw),size:measure(raw.title)};p.unit_price=unitPrice(p);p.regular_unit_price=unitPrice(p,true);const old=seen.get(p.key);if(!old||(p.promo_price??p.regular_price)<(old.promo_price??old.regular_price))seen.set(p.key,p);}
  const order={g:0,ml:1,count:2,sheet:3,unknown:4};
  return [...seen.values()].sort((x,y)=>order[x.size.unit]-order[y.size.unit]||(x.unit_price??Infinity)-(y.unit_price??Infinity)||(x.promo_price??x.regular_price)-(y.promo_price??y.regular_price)||x.key.localeCompare(y.key));
 }
 function requiredUnit(item){return packages.explicit(item.name)?measure(item.name).unit:null;}
 function group(item,rows){if(requiredUnit(item))return requiredUnit(item);
  const counts=new Map();for(const p of rows)if(p.size.unit!=='unknown')counts.set(p.size.unit,(counts.get(p.size.unit)||0)+1);
  return [...counts].sort((x,y)=>y[1]-x[1]||({g:0,ml:1,count:2,sheet:3}[x[0]]-{g:0,ml:1,count:2,sheet:3}[y[0]]))[0]?.[0]||'unknown';
 }
 function plan(item,rows,selected='',allowReview=false,override=null){
  const choices=options(item,rows),reviews=allowReview?options(item,rows,true):[];
  const dimension=group(item,choices),p=selected?[...choices,...reviews].find(p=>p.key===selected):choices.find(p=>{if(p.size.unit!==dimension||p.unit_price===null)return false;const required=measure(item.name),n=requiredUnit(item)?Math.ceil(required.value*item.quantity/p.size.value):p.size.unit==='count'?Math.ceil(item.quantity/p.size.value):item.quantity;return n>=1&&n<=50;});
  return purchase(item,p,override);
 }
 function purchase(item,p,override=null){
  if(!p)return null;
  const requested=measure(item.name),explicit=packages.explicit(item.name);
  if(explicit&&requested.unit!==p.size.unit)return null;
  let quantity=item.quantity,target=null;
  if(explicit){target=requested.value*item.quantity;quantity=Math.ceil(target/p.size.value);}
  else if(p.size.unit==='count'){target=item.quantity;quantity=Math.ceil(target/p.size.value);}
  if(override!==null)quantity=override;
  if(!Number.isInteger(quantity)||quantity<1||quantity>50)return null;
  const cost=a.estimated(p,quantity),total=p.size.value?quantity*p.size.value:null;
  return {product:p,quantity,target,total,unit:p.size.unit,cost,unit_price:p.unit_price,
   effective_unit_price:total?cost*(['g','ml'].includes(p.size.unit)?1000:1)/total:null,
   line:{item_id:item.id,title:p.title,quantity,subtotal:cost,url:p.url,store_name:p.store_name,store_id:p.store_id,store_type:p.store_type||'supermarket',image_url:p.image_url}};
 }
 const api={measure,unitPrice,key,query,options,requiredUnit,group,plan,purchase};root.CartwiseComparison=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
