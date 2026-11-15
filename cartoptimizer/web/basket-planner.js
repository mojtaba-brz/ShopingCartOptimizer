/* Cooperative, bounded multi-store planning. All matching offers participate;
 * only unlike units and unidentifiable merchants are excluded from basket grouping. */
(function(root){
 'use strict';
 const cmp=root.CartwiseComparison||(typeof require!=='undefined'?require('./comparison.js'):null),a=root.CartwiseAuto||(typeof require!=='undefined'?require('./auto-planner.js'):null),checkout=root.CartwiseCheckout||(typeof require!=='undefined'?require('./checkout.js'):null);
 const types=root.CartwiseTypes||(typeof require!=='undefined'?require('./retail-types.js'):null);
 const pricing=root.CartwisePricing||(typeof require!=='undefined'?require('./offer-pricing.js'):null);
 const norm=a.normalize,less=(x,y)=>x<y-1e-9,same=(x,y)=>Math.abs(x-y)<1e-9;
 function budget(value={}){const workers=Math.max(1,Math.min(4,Number(value.workers)||1));return {base:3,max:Math.max(3,Math.min(3+workers-1,Number(value.max_carts)||3)),states:Math.max(1000,Math.min(80000,Number(value.state_limit)||20000)),ms:Math.max(50,Math.min(800,Number(value.solve_ms)||200))};}
 async function solveGroup(items,results,quotes=[],selection={},quantities={},resources={},cancelled=()=>false){
  const limits=budget(resources),allowed=resources.auto_expand===false?3:limits.max,started=Date.now(),observations=checkout.clean(quotes),aliases=new Map(),names=new Map();
  for(const e of results)for(const p of e.products||[])if(p.store_name){const name=types.store(p)+'|'+norm(p.store_name);if(!aliases.has(name))aliases.set(name,new Set());if(p.store_id)aliases.get(name).add(p.store_id);if(p.store_id)names.set(types.store(p)+'|id:'+p.store_id,p.store_name);else names.set('name:'+name,p.store_name);}
  function merchant(p){const prefix=types.store(p)+'|';if(p.store_id)return prefix+'id:'+p.store_id;const n=norm(p.store_name),ids=aliases.get(prefix+n);if(!n||ids?.size>1)return '';return ids?.size===1?prefix+'id:'+[...ids][0]:prefix+'name:'+n;}
  const feeCache=new Map();
  function rule(key){if(feeCache.has(key))return feeCache.get(key);const relevant=observations.filter(q=>q.page_kind==='store'&&merchant(q)===key);const latest=relevant[relevant.length-1];const fields=latest?.fields||{};feeCache.set(key,fields);return fields;}
  const priceCache=new Map(),hasAmazing=results.some(e=>(e.products||[]).some(p=>p.amazing===true));
  const hasQuotedCart=observations.some(q=>q.page_kind==='cart'&&q.items_complete&&q.fields.total);
  const required=[],unresolved=[];
  for(const item of items){
   const rows=results.find(x=>x.id===item.id)?.products||[],exact=cmp.options(item,rows),review=selection[item.id]?cmp.options(item,rows,true):[];
   const base=cmp.plan(item,rows,selection[item.id]||'',true,quantities[item.id]??null);
   if(!base){unresolved.push(item.id);continue;}
   const options=[];
   for(const p of [...exact,...review]){
    if(selection[item.id]&&p.key!==selection[item.id])continue;
    if(p.size.unit!==base.unit)continue;
    const picked=cmp.purchase(item,p,quantities[item.id]??null,!!selection[item.id]),key=merchant(p);
    if(!picked||!key)continue;
    picked.item_id=item.id;picked.store_key=key;options.push(picked);
   }
   options.sort((x,y)=>x.effective_unit_price-y.effective_unit_price||x.cost-y.cost||x.product.key.localeCompare(y.product.key));
   if(!options.length){unresolved.push(item.id);continue;}
   // Without quota/threshold interactions, the lowest unit price at the same
   // merchant dominates. Keep every offer in the review UI.
   const seen=new Set(),searchOptions=options.filter(p=>{const f=rule(p.store_key),keep=hasAmazing||hasQuotedCart||f.minimum_order||f.free_delivery_over||!seen.has(p.store_key);seen.add(p.store_key);return keep;});
   required.push({item,options:searchOptions,unitOptions:options});
  }
  const references=new Map(required.map(x=>[x.item.id,Math.min(...x.options.map(p=>p.effective_unit_price).filter(v=>v!==null))]));
  for(const x of required)for(const p of x.unitOptions)p.score_weight=p.total?(['g','ml'].includes(p.unit)?1000:1)/p.total/(references.get(p.item_id)||1):0;
  function score(picks){return picks.reduce((sum,p)=>sum+p.cost*p.score_weight,0);}
  const ordered=[...required].sort((x,y)=>x.options.length-y.options.length);
  let best=null,single=null,two=null,three=null,unit=null,nodes=0,bounded=false,exploredLimit=3;
  let splitBounded=false;const splitCache=new Map();
  function cartOptions(c,split=false){
   const fields=rule(c.id),minimum=fields.minimum_order?.value,free=fields.free_delivery_over?.value,type=c.picks[0].product.store_type||'supermarket';
   const sensitive=minimum!==undefined||free!==undefined||hasQuotedCart||split;
   const cacheKey=JSON.stringify([c.id,split,c.picks.map(p=>[p.item_id,p.product.key,p.quantity]).sort()]);
   if(priceCache.has(cacheKey))return priceCache.get(cacheKey);
   const options=[];
   for(const v of pricing.variants(c.picks,type,sensitive,c.picks.map(p=>p.score_weight))){
    if(minimum!==undefined&&v.subtotal<minimum)continue;
    let delivery=fields.delivery_fee?.value??null;if(free!==undefined&&v.subtotal>=free)delivery=0;
    const service=fields.service_fee?.value??null,extra={};for(const key of ['packaging_fee','processing_fee','tax_fee'])if(fields[key])extra[key]=fields[key].value;
    const lines=v.picks.map(p=>p.line),matched=split?null:observations.map(q=>checkout.reconcile(q,lines)).filter(x=>x.verified).pop();
    options.push({...c,...v,unit_score:score(v.picks),lines,extra_fees:extra,delivery_fee:delivery,service_fee:service,minimum_order:minimum??null,free_delivery_over:free??null,verified:!!matched,unknown_fees:!matched&&(delivery===null||service===null),price_unknown:v.price_unknown,known_total:matched?matched.total:v.subtotal+(delivery??0)+(service??0)+Object.values(extra).reduce((n,v)=>n+v,0)});
   }
   if(priceCache.size>=300)priceCache.clear();priceCache.set(cacheKey,options);return options;
  }
  const cheaper=(x,y)=>!y||less(x.unit_score,y.unit_score)||same(x.unit_score,y.unit_score)&&(x.known_total<y.known_total||x.known_total===y.known_total&&x.price_unknown<y.price_unknown);
  function summary(carts){return {carts,unit_score:carts.reduce((n,c)=>n+c.unit_score,0),known_total:carts.reduce((n,c)=>n+c.known_total,0),price_unknown:carts.reduce((n,c)=>n+c.price_unknown,0)};}
  function portion(p,quantity){return {...p,quantity,total:p.total===null?null:p.total*quantity/p.quantity,cost:p.cost*quantity/p.quantity,line:{...p.line,quantity}};}
  async function merchantPlans(c,maxOrders){
   const cacheKey=JSON.stringify([c.id,maxOrders,c.picks.map(p=>[p.item_id,p.product.key,p.quantity]).sort()]);if(splitCache.has(cacheKey))return splitCache.get(cacheKey);
   let base=null;for(const v of cartOptions(c))if(cheaper(v,base))base=v;
   if(!base)return [];const plans=new Map([[1,summary([base])]]);
   const promo=c.picks.filter(p=>pricing.tiers(p.product).amazing!==null),savings=new Map();
   for(const p of promo){const t=pricing.tiers(p.product),key=pricing.identity(p.product);savings.set(key,Math.max(savings.get(key)||0,t.base-t.amazing));}
   const potential=base.subtotal-c.picks.reduce((n,p)=>n+p.quantity*pricing.tiers(p.product).base,0)+[...savings.values()].reduce((n,v)=>n+v,0);
   if(resources.repeat_orders===false||maxOrders<2||base.unknown_fees||base.price_unknown||!promo.length||potential<=0)return [...plans.values()];
   const until=Math.min(started+limits.ms,Date.now()+Math.max(10,limits.ms/8)),stateCap=Math.max(128,Math.floor(limits.states/8));let steps=0,stopped=false;
   async function tick(){if(cancelled())throw Error('cancelled');if(++steps>stateCap||Date.now()>until){splitBounded=true;stopped=true;return false;}if(steps%64===0)await new Promise(r=>setTimeout(r,0));return true;}
   // No repeated-SKU amazing price across separate orders unless the retailer confirms a new entitlement.
   const remaining=new Map();for(const p of c.picks){const key=pricing.identity(p.product);remaining.set(key,Math.min(remaining.get(key)??1,p.product.amazing_remaining??1));}
   const visited=new Set();
   async function consider(bins){
    if(bins.length<2||!await tick())return;
    const signature=bins.map(b=>b.join(',')).sort().join('|');if(visited.has(signature))return;visited.add(signature);
    const choices=bins.map(b=>cartOptions({...c,picks:c.picks.flatMap((p,i)=>b[i]?[portion(p,b[i])]:[])},true));if(choices.some(v=>!v.length))return;
    let best=null;
    async function allocate(i,carts,used){
     if(!await tick())return;
     if(i===choices.length){const v=summary(carts);if(!carts.some(c=>c.unknown_fees||c.price_unknown)&&v.known_total<base.known_total&&cheaper(v,best))best=v;return;}
     for(const v of choices[i]){const next=new Map(used);let fits=true;for(const p of v.picks)if(p.amazing_quantity){const key=pricing.identity(p.product),n=(next.get(key)||0)+p.amazing_quantity;next.set(key,n);if(n>(remaining.get(key)??Infinity)){fits=false;break;}}if(fits)await allocate(i+1,[...carts,v],next);if(stopped)return;}
    }
    await allocate(0,[],new Map());
    if(best&&cheaper(best,plans.get(bins.length)))plans.set(bins.length,best);
   }
   const count=c.picks.reduce((n,p)=>n+p.quantity,0),cap=Math.min(maxOrders,count);
   // Balanced seeds cover large quantities before bounded package partitioning.
   for(let k=2;k<=cap;k++){const bins=Array.from({length:k},()=>c.picks.map(()=>0));let at=0;for(let i=0;i<c.picks.length;i++)for(let q=0;q<c.picks[i].quantity;q++)bins[at++%k][i]++;await consider(bins);if(stopped)break;}
   async function visit(i,unit,bins,startBin=0){
    if(!await tick())return;if(i===c.picks.length){await consider(bins);return;}
    for(let j=startBin;j<=Math.min(bins.length,cap-1);j++){const fresh=j===bins.length;if(fresh)bins.push(c.picks.map(()=>0));bins[j][i]++;
     if(unit+1===c.picks[i].quantity)await visit(i+1,0,bins,0);else await visit(i,unit+1,bins,j);
     bins[j][i]--;if(fresh)bins.pop();if(stopped)return;
    }
   }
   if(!stopped)await visit(0,0,[]);
   const result=[...plans.values()];if(splitCache.size>=200)splitCache.clear();splitCache.set(cacheKey,result);return result;
  }
  async function evaluate(picks,limit){
   if(!picks.length)return null;const stores=new Map();
   for(const p of picks){let c=stores.get(p.store_key);if(!c){c={id:p.store_key,name:names.get(p.store_key)||p.product.store_name||'فروشگاه',picks:[],lines:[]};stores.set(p.store_key,c);}c.picks.push(p);c.lines.push(p.line);}
   if(stores.size>limit||stores.size>allowed)return null;
   let frontier=new Map([[0,summary([])]]);
   for(const c of stores.values()){
    const variants=await merchantPlans(c,allowed-stores.size+1),next=new Map();
    for(const prior of frontier.values())for(const v of variants){const n=prior.carts.length+v.carts.length;if(n>allowed)continue;const joined=summary([...prior.carts,...v.carts]);if(cheaper(joined,next.get(n)))next.set(n,joined);}
    frontier=next;
   }
   let chosen=null;for(const v of frontier.values())if(cheaper(v,chosen)||chosen&&same(v.unit_score,chosen.unit_score)&&v.known_total===chosen.known_total&&v.carts.length<chosen.carts.length)chosen=v;
   if(!chosen)return null;
   const counts=new Map(),orders=new Map();for(const c of chosen.carts)counts.set(c.id,(counts.get(c.id)||0)+1);
   const finalized=chosen.carts.map(c=>{const index=(orders.get(c.id)||0)+1;orders.set(c.id,index);return {...c,store_key:c.id,id:c.id+'|order:'+index,order_index:index,store_orders:counts.get(c.id)};});
   // UI and checkout comparisons retain the requested total, not the last split.
   const combined=picks.map(p=>{const parts=finalized.flatMap(c=>c.picks).filter(x=>x.item_id===p.item_id),cost=parts.reduce((n,x)=>n+x.cost,0);return {...p,cost,amazing_quantity:parts.reduce((n,x)=>n+x.amazing_quantity,0),base_quantity:parts.reduce((n,x)=>n+x.base_quantity,0),post_amazing_price:parts[0].post_amazing_price,price_unknown:parts.some(x=>x.price_unknown),effective_unit_price:p.total?cost*(['g','ml'].includes(p.unit)?1000:1)/p.total:null,order_count:parts.length,line:{...p.line,subtotal:cost}};});
   return {picks:combined,carts:finalized,store_count:stores.size,order_count:finalized.length,total:chosen.known_total,unit_score:chosen.unit_score,unknown_fees:finalized.filter(c=>c.unknown_fees).length,price_unknown:chosen.price_unknown,complete:unresolved.length===0};
  }

  function better(x,y){return x&&(!y||less(x.unit_score,y.unit_score)||same(x.unit_score,y.unit_score)&&(x.total<y.total||x.total===y.total&&(x.unknown_fees<y.unknown_fees||x.unknown_fees===y.unknown_fees&&x.carts.length<y.carts.length)));}
  function remember(value){if(better(value,best))best=value;if(value?.store_count===1&&better(value,single))single=value;if(value?.store_count<=2&&better(value,two))two=value;if(value?.store_count<=3&&better(value,three))three=value;}
  // Seed across the full candidate list before bounded enumeration, including
  // combinations requiring >3 stores when the hardware budget permits them.
  const priceSeed=required.map(x=>x.options[0]);remember(await evaluate(priceSeed,allowed));
  const unitSeed=required.map(x=>[...x.unitOptions].sort((p,q)=>(p.effective_unit_price??Infinity)-(q.effective_unit_price??Infinity)||p.cost-q.cost)[0]);unit=await evaluate(unitSeed,allowed);remember(unit);
  const keys=new Set(required.flatMap(x=>x.options.map(p=>p.store_key)));
  for(const key of keys){const picks=required.map(x=>x.options.find(p=>p.store_key===key));if(picks.every(Boolean))remember(await evaluate(picks,1));}
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
    for(const [key,picks] of byStore){if(chosen.has(key))continue;let count=0,cost=0;for(let i=0;i<picks.length;i++)if(picks[i]&&!covered.has(i)){count++;cost+=score([picks[i]]);}if(count>coverage||count===coverage&&cost<price){next=key;coverage=count;price=cost;}}
    if(!next||!coverage)break;chosen.add(next);byStore.get(next).forEach((p,i)=>{if(p)covered.add(i);});
   }
   if(covered.size===required.length)remember(await evaluate(required.map(x=>x.options.find(p=>chosen.has(p.store_key))),allowed));
  }
  async function visit(index,picks,stores,limit){
   if(cancelled())throw Error('cancelled');
   if(++nodes>limits.states||Date.now()-started>limits.ms){bounded=true;return;}
   if(nodes%128===0)await new Promise(r=>setTimeout(r,0));
   if(index===ordered.length){remember(await evaluate(picks,limit));return;}
   for(const p of ordered[index].options){const fresh=!stores.has(p.store_key);if(fresh&&stores.size>=limit)continue;if(fresh)stores.add(p.store_key);picks.push(p);await visit(index+1,picks,stores,limit);picks.pop();if(fresh)stores.delete(p.store_key);if(bounded)return;}
  }
  for(let limit=Math.min(3,required.length||1,keys.size||1);limit<=Math.min(allowed,required.length,keys.size);limit++){exploredLimit=limit;await visit(0,[],new Set(),limit);if(bounded)break;}
  return {best,single,two,three,unit,cannot_cover:required.length>0&&!best,unresolved,nodes,bounded:bounded||splitBounded,base_limit:3,hardware_limit:allowed,explored_limit:exploredLimit,elapsed_ms:Date.now()-started,assumptions:['موجودی و سهمیهٔ تخفیف باید در فروشگاه تأیید شوند.','هزینهٔ نامعلوم صفر فرض نشده است؛ مبلغ معلوم جدا نمایش داده می‌شود.']};
 }
 async function solve(items,results,quotes=[],selection={},quantities={},resources={},cancelled=()=>false){
  const groups=new Map();for(const i of items){const t=types.item(i);if(!groups.has(t))groups.set(t,[]);groups.get(t).push(i);}
  const sections=[];
  for(const [department,groupItems] of groups){
   const scoped=groupItems.map(i=>{const entry=results.find(r=>r.id===i.id);return {...entry,id:i.id,products:(entry?.products||[]).filter(p=>types.eligible(i,p)).map(p=>({...p,store_type:types.store(p,department)}))};});
   const qs=quotes.filter(q=>!q.store_type||types.department(types.store(q))===department).map(q=>({...q,store_type:types.store(q,department)}));
   const run=await solveGroup(groupItems,scoped,qs,selection,quantities,resources,cancelled);
   if(Array.isArray(resources.selected_stores)&&resources.selected_stores.length){const allowed=new Set(resources.selected_stores),filtered=scoped.map(e=>({...e,products:e.products.filter(p=>allowed.has(types.key(p)))}));const chosen=await solveGroup(groupItems,filtered,qs,selection,quantities,resources,cancelled);run.selected=chosen.best;}
   for(const key of ['best','single','two','three','unit','selected'])for(const c of run[key]?.carts||[]){c.department=department;c.store_type=c.picks[0]?.product.store_type||department;}
   sections.push({department,label:types.labels[department],...run});
  }
  const aggregate=key=>{const values=sections.map(s=>s[key]).filter(Boolean);if(!values.length)return null;return {picks:values.flatMap(v=>v.picks),carts:values.flatMap(v=>v.carts),store_count:values.reduce((n,v)=>n+v.store_count,0),order_count:values.reduce((n,v)=>n+v.order_count,0),total:values.reduce((n,v)=>n+v.total,0),unit_score:values.reduce((n,v)=>n+v.unit_score,0),unknown_fees:values.reduce((n,v)=>n+v.unknown_fees,0),price_unknown:values.reduce((n,v)=>n+(v.price_unknown||0),0),complete:values.length===sections.length&&values.every(v=>v.complete)};};
  return {groups:sections,best:aggregate('best'),single:aggregate('single'),two:aggregate('two'),three:aggregate('three'),unit:aggregate('unit'),selected:aggregate('selected'),unresolved:sections.flatMap(s=>s.unresolved),cannot_cover:sections.some(s=>s.cannot_cover),bounded:sections.some(s=>s.bounded),hardware_limit:budget(resources).max,nodes:sections.reduce((n,s)=>n+s.nodes,0)};
 }
 const api={solve,budget};root.CartwiseBasket=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
