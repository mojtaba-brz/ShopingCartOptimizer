/* Cooperative, bounded multi-store planning. All matching offers participate;
 * only unlike units and unidentifiable merchants are excluded from basket grouping. */
(function(root){
 'use strict';
 const cmp=root.CartwiseComparison||(typeof require!=='undefined'?require('./comparison.js'):null),a=root.CartwiseAuto||(typeof require!=='undefined'?require('./auto-planner.js'):null),checkout=root.CartwiseCheckout||(typeof require!=='undefined'?require('./checkout.js'):null);
 const norm=a.normalize;
 function budget(value={}){const workers=Math.max(1,Math.min(4,Number(value.workers)||1));return {base:3,max:Math.max(3,Math.min(3+workers-1,Number(value.max_carts)||3)),states:Math.max(1000,Math.min(80000,Number(value.state_limit)||20000)),ms:Math.max(50,Math.min(800,Number(value.solve_ms)||200))};}
 async function solve(items,results,quotes=[],selection={},quantities={},resources={},cancelled=()=>false){
  const limits=budget(resources),started=Date.now(),observations=checkout.clean(quotes),aliases=new Map(),names=new Map();
  for(const e of results)for(const p of e.products||[])if(p.store_name){const name=norm(p.store_name);if(!aliases.has(name))aliases.set(name,new Set());if(p.store_id)aliases.get(name).add(p.store_id);if(p.store_id)names.set('id:'+p.store_id,p.store_name);else names.set('name:'+name,p.store_name);}
  function merchant(p){if(p.store_id)return 'id:'+p.store_id;const n=norm(p.store_name),ids=aliases.get(n);if(!n||ids?.size>1)return '';return ids?.size===1?'id:'+[...ids][0]:'name:'+n;}
  function rule(key){const relevant=observations.filter(q=>q.page_kind==='store'&&merchant(q)===key);const latest=relevant[relevant.length-1];return latest?.fields||{};}
  const hasQuotedCart=observations.some(q=>q.page_kind==='cart'&&q.items_complete&&q.fields.total);
  const required=[],unresolved=[];
  for(const item of items){
   const rows=results.find(x=>x.id===item.id)?.products||[],exact=cmp.options(item,rows),review=selection[item.id]?cmp.options(item,rows,true):[];
   const base=cmp.plan(item,rows,selection[item.id]||'',true,quantities[item.id]??null);
   if(!base){unresolved.push(item.id);continue;}
   // A vague physical request has no common target. Expose the reference amount
   // chosen by unit price, then compare whole-package costs for that same amount.
   const inferred=!cmp.requiredUnit(item)&&['g','ml'].includes(base.unit),targetItem=inferred?{...item,name:cmp.query(item.name)+' '+base.product.size.value+' '+(base.unit==='g'?'گرم':'میلی لیتر')}:item;
   const options=[];
   for(const p of [...exact,...review]){
    if(selection[item.id]&&p.key!==selection[item.id])continue;
    if(p.size.unit!==base.unit)continue;
    const picked=cmp.purchase(targetItem,p,quantities[item.id]??null),key=merchant(p);
    if(!picked||!key)continue;
    picked.inferred_target=inferred;picked.item_id=item.id;picked.store_key=key;options.push(picked);
   }
   options.sort((x,y)=>x.cost-y.cost||x.total-y.total||x.product.key.localeCompare(y.product.key));
   if(!options.length){unresolved.push(item.id);continue;}
   // With no observed order/free-shipping threshold, a dearer product at the
   // same merchant cannot improve the cost objective. Keep every offer in the
   // UI and in the unit-price alternative; prune only this dominated search branch.
   const costOptions=[],seenStores=new Set();
   for(const p of options){const fields=rule(p.store_key);if(hasQuotedCart||fields.minimum_order||fields.free_delivery_over||!seenStores.has(p.store_key))costOptions.push(p);seenStores.add(p.store_key);}
   required.push({item,options:costOptions,unitOptions:options,baseline:base});
  }
  // Return partial proposals explicitly; never present a missing item as fulfilled.
  const ordered=[...required].sort((x,y)=>x.options.length-y.options.length),suffix=Array(ordered.length+1).fill(0);
  for(let i=ordered.length-1;i>=0;i--)suffix[i]=suffix[i+1]+ordered[i].options[0].cost;
  let best=null,single=null,unit=null,nodes=0,bounded=false,exploredLimit=3;
  function evaluate(picks,limit){
   if(!picks.length)return null;const carts=new Map();
   for(const pick of picks){let c=carts.get(pick.store_key);if(!c){c={id:pick.store_key,name:names.get(pick.store_key)||pick.product.store_name||'فروشگاه',picks:[],lines:[],subtotal:0};carts.set(pick.store_key,c);}c.picks.push(pick);c.lines.push(pick.line);c.subtotal+=pick.cost;}
   if(carts.size>limit)return null;
   let amount=0,unknown=0;
   for(const c of carts.values()){
    const fields=rule(c.id),minimum=fields.minimum_order?.value;if(minimum!==undefined&&c.subtotal<minimum)return null;
    let delivery=fields.delivery_fee?.value??null;const free=fields.free_delivery_over?.value;
    if(free!==undefined&&c.subtotal>=free)delivery=0;
    const service=fields.service_fee?.value??null;c.delivery_fee=delivery;c.service_fee=service;c.minimum_order=minimum??null;
    const matched=observations.map(q=>checkout.reconcile(q,c.lines)).filter(x=>x.verified).pop();
    c.verified=!!matched;c.unknown_fees=!matched&&(delivery===null||service===null);if(c.unknown_fees)unknown++;
    c.known_total=matched?matched.total:c.subtotal+(delivery??0)+(service??0);amount+=c.known_total;
   }
   return {picks,carts:[...carts.values()],total:amount,unknown_fees:unknown,complete:unresolved.length===0};
  }
  function better(x,y){return x&&(!y||x.total<y.total||x.total===y.total&&(x.unknown_fees<y.unknown_fees||x.unknown_fees===y.unknown_fees&&x.carts.length<y.carts.length));}
  function remember(value){if(better(value,best))best=value;if(value?.carts.length===1&&better(value,single))single=value;}
  const allowed=resources.auto_expand===false?3:limits.max;
  // Seed across the full candidate list before bounded enumeration, including
  // combinations requiring >3 stores when the hardware budget permits them.
  const costSeed=required.map(x=>x.options[0]);remember(evaluate(costSeed,allowed));
  const unitSeed=required.map(x=>[...x.unitOptions].sort((p,q)=>(p.unit_price??Infinity)-(q.unit_price??Infinity)||p.cost-q.cost)[0]);unit=evaluate(unitSeed,allowed);remember(unit);
  const keys=new Set(required.flatMap(x=>x.options.map(p=>p.store_key)));
  for(const key of keys){const picks=required.map(x=>x.options.find(p=>p.store_key===key));if(picks.every(Boolean))remember(evaluate(picks,1));}
  // Find useful shared-store covers before enumerating combinations. Otherwise
  // many individually cheap merchants can exhaust the budget before a simple
  // two-store solution is reached. No candidate/store shortlist is imposed.
  const byStore=new Map([...keys].map(key=>[key,required.map(x=>x.options.find(p=>p.store_key===key))]));
  let seeds=0;
  for(const first of [null,...keys]){
   if(seeds++%8===0)await new Promise(r=>setTimeout(r,0));
   if(Date.now()-started>limits.ms/2)break;
   if(cancelled())throw Error('cancelled');
   const chosen=new Set(first?[first]:[]),covered=new Set();
   if(first)byStore.get(first).forEach((p,i)=>{if(p)covered.add(i);});
   while(covered.size<required.length&&chosen.size<allowed){
    let next=null,coverage=0,price=Infinity;
    for(const [key,picks] of byStore){if(chosen.has(key))continue;let count=0,cost=0;for(let i=0;i<picks.length;i++)if(picks[i]&&!covered.has(i)){count++;cost+=picks[i].cost;}if(count>coverage||count===coverage&&cost<price){next=key;coverage=count;price=cost;}}
    if(!next||!coverage)break;chosen.add(next);byStore.get(next).forEach((p,i)=>{if(p)covered.add(i);});
   }
   if(covered.size===required.length)remember(evaluate(required.map(x=>x.options.find(p=>chosen.has(p.store_key))),allowed));
  }
  const hasBasketDiscount=hasQuotedCart;
  async function visit(index,picks,stores,cost,limit){
   if(cancelled())throw Error('cancelled');
   if(++nodes>limits.states||Date.now()-started>limits.ms){bounded=true;return;}
   if(nodes%128===0)await new Promise(r=>setTimeout(r,0));
   // Basket totals can include retailer discounts beyond observed item prices.
   if(!hasBasketDiscount&&best&&cost+suffix[index]>best.total)return;
   if(index===ordered.length){remember(evaluate(picks,limit));return;}
   for(const p of ordered[index].options){const fresh=!stores.has(p.store_key);if(fresh&&stores.size>=limit)continue;if(fresh)stores.add(p.store_key);picks.push(p);await visit(index+1,picks,stores,cost+p.cost,limit);picks.pop();if(fresh)stores.delete(p.store_key);if(bounded)return;}
  }
  for(let limit=Math.min(3,required.length||1);limit<=Math.min(allowed,required.length,keys.size);limit++){exploredLimit=limit;await visit(0,[],new Set(),0,limit);if(bounded)break;}
  return {best,single,unit,cannot_cover:required.length>0&&!best,unresolved,nodes,bounded,base_limit:3,hardware_limit:allowed,explored_limit:exploredLimit,elapsed_ms:Date.now()-started,assumptions:['موجودی و سهمیهٔ تخفیف باید در فروشگاه تأیید شوند.','هزینهٔ نامعلوم صفر فرض نشده است؛ مبلغ معلوم جدا نمایش داده می‌شود.']};
 }
 const api={solve,budget};root.CartwiseBasket=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
