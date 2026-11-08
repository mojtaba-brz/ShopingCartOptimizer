/* Offer comparison by displayed price per kg/litre/item, never by package subtotal.
 * Unlike units stay in separate groups. Missing or ambiguous sizes are explicit. */
(function(root){
 'use strict';
 const a=root.CartwiseAuto||(typeof require!=='undefined'?require('./auto-planner.js'):null);
 const digits=s=>String(s||'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/٫/g,'.');
 function measure(title){
  const s=digits(title).toLowerCase(),multi=s.match(/(\d+)\s*[×x*]\s*(\d+(?:\.\d+)?)\s*(کیلوگرم|کیلو|گرم|میلی\s*لیتر|لیتر|kg|g|ml|l)(?![a-zآ-ی])/u);
  if(multi){const single=a.amount(multi[2]+' '+multi[3]);if(single&&Number(multi[1])>0&&Number(multi[1])<=1000)return {unit:single.unit,value:single.value*Number(multi[1])};}
  const physical=a.amount(s);if(physical)return Number.isFinite(physical.value)&&physical.value>0&&physical.value<=10000000?physical:{unit:'unknown',value:null};
  if(/\d\s*(?:کیلو|گرم|لیتر|میلی\s*لیتر|kg\b|ml\b|g\b|l\b)/u.test(s))return {unit:'unknown',value:null};
  const packs=[...s.matchAll(/(\d+)\s*(?:عددی|تایی|عدد)(?![آ-ی])/gu)];
  if(packs.length===1&&Number(packs[0][1])>0&&Number(packs[0][1])<=1000)return {unit:'count',value:Number(packs[0][1])};
  if(packs.length>1)return {unit:'unknown',value:null};
  return {unit:'count',value:1};
 }
 function key(p){return encodeURIComponent([a.normalize(p.title),p.store_id||a.normalize(p.store_name||''),p.url||''].join('|'));}
 function unitPrice(p,regular=false){if(regular&&p.regular_verified===false)return null;const size=measure(p.title);if(!size.value)return null;return (regular?p.regular_price:(p.promo_price??p.regular_price))*(size.unit==='count'?1:1000)/size.value;}
 function query(name){return a.searchTerm(name).replace(/(?:بسته|پک)?\s*[۰-۹٠-٩0-9]+\s*(?:عددی|تایی|عدد)/gu,' ').replace(/\s+/g,' ').trim();}
 function options(item,rows,review=false){
  const q={...item,name:query(item.name)||item.name};
  const candidates=review?a.suggestions(q,rows):a.rank(q,rows,1000),seen=new Map();
  for(const raw of candidates){const p={...raw,key:key(raw),size:measure(raw.title)};p.unit_price=unitPrice(p);p.regular_unit_price=unitPrice(p,true);const old=seen.get(p.key);if(!old||(p.promo_price??p.regular_price)<(old.promo_price??old.regular_price))seen.set(p.key,p);}
  const order={g:0,ml:1,count:2,unknown:3};
  return [...seen.values()].sort((x,y)=>order[x.size.unit]-order[y.size.unit]||(x.unit_price??Infinity)-(y.unit_price??Infinity)||(x.promo_price??x.regular_price)-(y.promo_price??y.regular_price)||x.key.localeCompare(y.key));
 }
 function requiredUnit(item){return a.amount(item.name)||/\d+\s*(?:عددی|تایی|عدد)/u.test(digits(item.name))?measure(item.name).unit:null;}
 function group(item,rows){if(requiredUnit(item))return requiredUnit(item);
  const counts=new Map();for(const p of rows)if(p.size.unit!=='unknown')counts.set(p.size.unit,(counts.get(p.size.unit)||0)+1);
  return [...counts].sort((x,y)=>y[1]-x[1]||({g:0,ml:1,count:2}[x[0]]-{g:0,ml:1,count:2}[y[0]]))[0]?.[0]||'unknown';
 }
 function plan(item,rows,selected='',allowReview=false,override=null){
  const choices=options(item,rows),reviews=allowReview?options(item,rows,true):[];
  const dimension=group(item,choices),p=selected?[...choices,...reviews].find(p=>p.key===selected):choices.find(p=>{if(p.size.unit!==dimension||p.unit_price===null)return false;const required=measure(item.name),n=requiredUnit(item)?Math.ceil(required.value*item.quantity/p.size.value):p.size.unit==='count'?Math.ceil(item.quantity/p.size.value):item.quantity;return n>=1&&n<=50;});
  if(!p)return null;
  const requested=measure(item.name),explicit=!!a.amount(item.name)||/\d+\s*(?:عددی|تایی|عدد)/u.test(digits(item.name));
  if(explicit&&requested.unit!==p.size.unit)return null;
  let quantity=item.quantity,target=null;
  if(explicit){target=requested.value*item.quantity;quantity=Math.ceil(target/p.size.value);}
  else if(p.size.unit==='count'){target=item.quantity;quantity=Math.ceil(target/p.size.value);}
  if(override!==null)quantity=override;
  if(!Number.isInteger(quantity)||quantity<1||quantity>50)return null;
  const cost=a.estimated(p,quantity),total=p.size.value?quantity*p.size.value:null;
  return {product:p,quantity,target,total,unit:p.size.unit,cost,unit_price:p.unit_price,
   effective_unit_price:total?cost*(p.size.unit==='count'?1:1000)/total:null,
   line:{item_id:item.id,title:p.title,quantity,subtotal:cost,url:p.url,store_name:p.store_name,store_id:p.store_id,image_url:p.image_url}};
 }
 const api={measure,unitPrice,key,query,options,requiredUnit,group,plan};root.CartwiseComparison=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
