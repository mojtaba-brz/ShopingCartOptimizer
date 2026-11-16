/* Cooperative, bounded multi-store planning. All matching offers participate;
 * only unlike units and unidentifiable merchants are excluded from basket grouping. */
(function(root){
 'use strict';
 const cmp=root.CartwiseComparison||(typeof require!=='undefined'?require('./comparison.js'):null),a=root.CartwiseAuto||(typeof require!=='undefined'?require('./auto-planner.js'):null),checkout=root.CartwiseCheckout||(typeof require!=='undefined'?require('./checkout.js'):null);
 const types=root.CartwiseTypes||(typeof require!=='undefined'?require('./retail-types.js'):null);
 const pricing=root.CartwisePricing||(typeof require!=='undefined'?require('./offer-pricing.js'):null);
 const packages=root.CartwisePackages||(typeof require!=='undefined'?require('./package-size.js'):null);
 const parts=p=>p.parts||[p],storeKeys=p=>[...new Set(parts(p).map(x=>x.store_key))];
 const norm=a.normalize,less=(x,y)=>x<y-1e-9,same=(x,y)=>Math.abs(x-y)<1e-9;
 function budget(value={}){return {base:3,max:Math.max(3,Math.min(6,Number(value.max_carts)||3)),states:Math.max(1000,Math.min(80000,Number(value.state_limit)||20000)),ms:Math.max(50,Math.min(800,Number(value.solve_ms)||200))};}
 async function solveGroup(items,results,quotes=[],selection={},quantities={},resources={},cancelled=()=>false){
  const limits=budget(resources),allowed=resources.auto_expand===false?3:limits.max,started=Date.now(),observations=checkout.clean(quotes),aliases=new Map(),names=new Map();
  for(const e of results)for(const p of e.products||[])if(p.store_name){const name=types.store(p)+'|'+norm(p.store_name);if(!aliases.has(name))aliases.set(name,new Set());if(p.store_id)aliases.get(name).add(p.store_id);if(p.store_id)names.set(types.store(p)+'|id:'+p.store_id,p.store_name);else names.set('name:'+name,p.store_name);}
  function merchant(p){const prefix=types.store(p)+'|';if(p.store_id)return prefix+'id:'+p.store_id;const n=norm(p.store_name),ids=aliases.get(prefix+n);if(!n||ids?.size>1)return '';return ids?.size===1?prefix+'id:'+[...ids][0]:prefix+'name:'+n;}
  const feeCache=new Map();
  function rule(key){if(feeCache.has(key))return feeCache.get(key);const relevant=observations.filter(q=>q.page_kind==='store'&&merchant(q)===key).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at)),fields={};for(const q of relevant){for(const k of q.unknown_fields||[])delete fields[k];Object.assign(fields,q.fields);}feeCache.set(key,fields);return fields;}
  const priceCache=new Map(),hasAmazing=results.some(e=>(e.products||[]).some(p=>p.amazing===true));
  const hasQuotedCart=observations.some(q=>q.page_kind==='cart'&&q.items_complete&&q.fields.total);
  const required=[],unresolved=[];let mixedBounded=false,mixedNodes=0;
  // A line is one demand/score, even when several SKUs supply it. Enumerate
  // whole-package allocations; count requests may never exceed their pieces.
  async function mixtures(item,candidates,options){
   const explicit=cmp.requiredUnit(item),weighted=['g','ml'].includes(explicit),target=weighted?cmp.measure(item.name).value*item.quantity:packages.units(item.name)*item.quantity;
   if(!target||!candidates.length)return;
   const seeds=candidates.map(p=>{const pick=cmp.purchase(item,p,1,true),amount=weighted?p.size.value:packages.units(p.title);return pick&&amount>0&&(!weighted?amount<=target:true)?{...pick,item_id:item.id,store_key:merchant(p),amount}:null;}).filter(p=>p&&p.store_key&&p.total!==null);
   if(seeds.length<2||seeds.every(p=>p.amount>=target))return;
   const seen=new Set(options.map(p=>JSON.stringify([[p.product.key,p.quantity]])));
   function add(chosen){
    if(chosen.length<2)return;const total=chosen.reduce((n,p)=>n+p.total,0),amount=chosen.reduce((n,p)=>n+p.quantity*p.amount,0);
    if(weighted?amount<target||amount-Math.min(...chosen.map(p=>p.amount))>=target:amount!==target)return;
    const signature=JSON.stringify(chosen.map(p=>[p.product.key,p.quantity]).sort());if(seen.has(signature))return;seen.add(signature);
    const merchants=new Map();for(const p of chosen){if(!merchants.has(p.store_key))merchants.set(p.store_key,[]);merchants.get(p.store_key).push(p);}const cost=[...merchants.values()].reduce((n,ps)=>n+pricing.variants(ps,ps[0].product.store_type)[0].subtotal,0),first=chosen[0];options.push({...first,parts:chosen,total,cost,quantity:chosen.reduce((n,p)=>n+p.quantity,0),effective_unit_price:cost*(['g','ml'].includes(first.unit)?1000:1)/total,store_key:storeKeys({parts:chosen}).length===1?first.store_key:''});
   }
   const atQuantity=(p,q)=>({...p,quantity:q,total:p.product.size.value*q,consumer_total:weighted?null:packages.units(p.product.title)*q,cost:pricing.estimated(p.product,q),line:{...p.line,quantity:q}});
   // Seed useful mixtures across every merchant before bounded enumeration.
   // Ordinary-price seeds remain useful when another line uses Amazing slots.
   const groups=[seeds,...[...new Set(seeds.map(p=>p.store_key))].map(k=>seeds.filter(p=>p.store_key===k))];
   for(const rows of groups)for(const ordinary of [false,true]){
    const counts=new Map();let amount=0;for(let q=0;q<50&&amount<target;q++){let next=null,price=Infinity;for(const p of rows){const n=counts.get(p)||0;if(!weighted&&amount+p.amount>target)continue;const t=pricing.tiers(p.product),delta=ordinary?t.base:pricing.estimated(p.product,n+1)-pricing.estimated(p.product,n),value=delta/p.product.size.value;if(value<price){next=p;price=value;}}if(!next)break;counts.set(next,(counts.get(next)||0)+1);amount+=next.amount;}if(amount>=target)add([...counts].map(([p,q])=>atQuantity(p,q)));
   }
   async function visit(start,chosen,amount,count){
    if(cancelled())throw Error('cancelled');if(++mixedNodes>limits.states/3||Date.now()-started>limits.ms/3){mixedBounded=true;return;}if(mixedNodes%128===0)await new Promise(r=>setTimeout(r,0));
    if(amount>=target){add(chosen);return;}if(count>=50)return;
    for(let i=start;i<seeds.length;i++){const p=seeds[i],max=Math.min(50-count,Math.ceil((target-amount)/p.amount));for(let q=1;q<=max;q++){if(!weighted&&amount+q*p.amount>target)break;await visit(i+1,[...chosen,atQuantity(p,q)],amount+q*p.amount,count+q);if(mixedBounded)return;}}
   }
   await visit(0,[],0,0);
  }
  for(const item of items){
   const rows=results.find(x=>x.id===item.id)?.products||[],exact=cmp.options(item,rows),review=selection[item.id]?cmp.options(item,rows,true):[];
   const base=cmp.plan(item,rows,selection[item.id]||'',true,quantities[item.id]??null);
   const dimension=base?.unit||cmp.group(item,exact);
   const options=[],candidates=[];
   for(const p of new Map([...exact,...review].map(p=>[p.key,p])).values()){
    if(selection[item.id]&&p.key!==selection[item.id])continue;
    if(p.size.unit!==dimension)continue;
    candidates.push(p);
    const picked=cmp.purchase(item,p,quantities[item.id]??null,!!selection[item.id]),key=merchant(p);
    if(!picked||!key)continue;
    picked.item_id=item.id;picked.store_key=key;options.push(picked);
   }
   if(!selection[item.id]&&quantities[item.id]==null)await mixtures(item,candidates,options);
   options.sort((x,y)=>x.effective_unit_price-y.effective_unit_price||x.cost-y.cost||x.product.key.localeCompare(y.product.key));
   if(!options.length){unresolved.push(item.id);continue;}
   // Without quota/threshold interactions, the lowest unit price at the same
   // merchant dominates. Keep every offer in the review UI.
   const seen=new Set(),searchOptions=options.filter(p=>{const keys=storeKeys(p),f=keys.length===1?rule(keys[0]):{},signature=keys.sort().join(',');const keep=!!p.parts||hasAmazing||hasQuotedCart||f.minimum_order||f.free_delivery_over||!seen.has(signature);seen.add(signature);return keep;});
   required.push({item,options:searchOptions,unitOptions:options});
  }
  const references=new Map(required.map(x=>[x.item.id,Math.min(...x.options.map(p=>p.effective_unit_price).filter(v=>v!==null))]));
  for(const x of required)for(const p of x.unitOptions){p.score_weight=p.total?(['g','ml'].includes(p.unit)?1000:1)/p.total/(references.get(p.item_id)||1):0;for(const part of parts(p))part.score_weight=p.score_weight;}
  function score(picks){return picks.reduce((sum,p)=>sum+p.cost*p.score_weight,0);}
  const ordered=[...required].sort((x,y)=>x.options.length-y.options.length);
  let best=null,single=null,two=null,three=null,unit=null,nodes=0,bounded=false,exploredLimit=3;
  let splitBounded=false;const splitCache=new Map();
  function cartOptions(c,split=false){
   const fields=rule(c.id),minimum=fields.minimum_order?.value,free=fields.free_delivery_over?.value,type=c.picks[0].product.store_type||'supermarket';
   const sensitive=minimum!==undefined||free!==undefined||hasQuotedCart||split;
   const cacheKey=JSON.stringify([c.id,split,c.picks.map(p=>[p.item_id,p.product.key,p.quantity,p.score_weight]).sort()]);
   if(priceCache.has(cacheKey))return priceCache.get(cacheKey);
   const options=[];
   for(const v of pricing.variants(c.picks,type,sensitive)){
    if(minimum!==undefined&&v.subtotal<minimum)continue;
    const lines=v.picks.map(p=>p.line),matchedQuote=split?null:observations.filter(q=>checkout.reconcile(q,lines).verified).pop(),matched=matchedQuote?checkout.reconcile(matchedQuote,lines):null,amounts={...fields,...matchedQuote?.fields};
    let delivery=amounts.delivery_fee?.value??null;if(!matchedQuote?.fields.delivery_fee&&free!==undefined&&v.subtotal>=free)delivery=0;
    const service=amounts.service_fee?.value??null,extra={};for(const key of ['packaging_fee','processing_fee','tax_fee'])if(amounts[key])extra[key]=amounts[key].value;
    options.push({...c,...v,unit_score:score(v.picks),lines,extra_fees:extra,delivery_fee:delivery,service_fee:service,minimum_order:minimum??null,free_delivery_over:free??null,verified:!!matched,unknown_fees:!matched&&(delivery===null||service===null),price_unknown:v.price_unknown,known_total:matched?matched.total:v.subtotal+(delivery??0)+(service??0)+Object.values(extra).reduce((n,v)=>n+v,0)});
   }
   if(priceCache.size>=300)priceCache.clear();priceCache.set(cacheKey,options);return options;
  }
  // For fixed goods, amazing allocation and order splits minimize payable cost.
  // The outer product/store comparison retains its normalized unit-price score.
  const cheaper=(x,y)=>!y||x.known_total<y.known_total||x.known_total===y.known_total&&(x.price_unknown<y.price_unknown||x.price_unknown===y.price_unknown&&(x.subtotal<y.subtotal||x.subtotal===y.subtotal&&less(x.unit_score,y.unit_score)));
  function summary(carts){return {carts,subtotal:carts.reduce((n,c)=>n+c.subtotal,0),unit_score:carts.reduce((n,c)=>n+c.unit_score,0),known_total:carts.reduce((n,c)=>n+c.known_total,0),price_unknown:carts.reduce((n,c)=>n+c.price_unknown,0)};}
  function portion(p,quantity){return {...p,quantity,total:p.total===null?null:p.total*quantity/p.quantity,cost:p.cost*quantity/p.quantity,line:{...p.line,quantity}};}
  async function merchantPlans(c,maxOrders){
   const cacheKey=JSON.stringify([c.id,maxOrders,c.picks.map(p=>[p.item_id,p.product.key,p.quantity,p.score_weight]).sort()]);if(splitCache.has(cacheKey))return splitCache.get(cacheKey);
   let base=null;for(const v of cartOptions(c))if(cheaper(v,base))base=v;
   if(!base)return [];const plans=new Map([[1,summary([base])]]);
   const promo=c.picks.filter(p=>pricing.tiers(p.product).amazing!==null),savings=new Map();
   for(const p of promo){const t=pricing.tiers(p.product),key=pricing.identity(p.product);savings.set(key,Math.max(savings.get(key)||0,t.base-t.amazing));}
   const potential=base.subtotal-c.picks.reduce((n,p)=>n+p.quantity*pricing.tiers(p.product).base,0)+[...savings.values()].reduce((n,v)=>n+v,0);
   if(resources.repeat_orders===false||maxOrders<2||base.unknown_fees||base.price_unknown||!promo.length||potential<=0)return [...plans.values()];
   let until=started+limits.ms;const stateCap=Math.max(128,Math.floor(limits.states/8));let steps=0,stopped=false;
   async function tick(){if(cancelled())throw Error('cancelled');if(++steps>stateCap||Date.now()>until){splitBounded=true;stopped=true;return false;}if(steps%64===0)await new Promise(r=>setTimeout(r,0));return true;}
   // No repeated-SKU amazing price across separate orders unless the retailer confirms a new entitlement.
   const remaining=new Map();for(const p of c.picks){const key=pricing.identity(p.product);remaining.set(key,Math.min(remaining.get(key)??1,p.product.amazing_remaining??1));}
   const visited=new Set();
   async function consider(bins,seedOnly=false){
    if(bins.length<2||!await tick())return;
    const signature=bins.map(b=>b.join(',')).sort().join('|');if(!seedOnly&&visited.has(signature))return;if(!seedOnly)visited.add(signature);
    const choices=bins.map(b=>cartOptions({...c,picks:c.picks.flatMap((p,i)=>b[i]?[portion(p,b[i])]:[])},true));if(choices.some(v=>!v.length))return;
    let best=null;
    function take(v,used){const next=new Map(used);for(const p of v.picks)if(p.amazing_quantity){const key=pricing.identity(p.product),n=(next.get(key)||0)+p.amazing_quantity;if(n>(remaining.get(key)??Infinity))return null;next.set(key,n);}return next;}
    async function allocate(i,carts,used){
     if(!await tick())return;
     if(i===choices.length){const v=summary(carts);if(!carts.some(c=>c.unknown_fees||c.price_unknown)&&v.known_total<base.known_total&&cheaper(v,best))best=v;return;}
     for(const v of choices[i]){const next=take(v,used);if(next)await allocate(i+1,[...carts,v],next);if(stopped)return;}
    }
    const seen=new Set();let coupled=false;
    for(const rows of choices)for(const key of new Set(rows[0].picks.map(p=>pricing.identity(p.product)))){if(seen.has(key))coupled=true;seen.add(key);}
    // Distinct SKUs in different carts cannot compete for the same entitlement.
    if(seedOnly&&coupled){const carts=[];let used=new Map();for(const rows of choices){let choice=null,nextUsed=null;for(const v of rows){const next=take(v,used);if(next&&cheaper(v,choice)){choice=v;nextUsed=next;}}if(!choice)break;carts.push(choice);used=nextUsed;}const v=summary(carts);if(carts.length===choices.length&&!carts.some(c=>c.unknown_fees||c.price_unknown)&&v.known_total<base.known_total)best=v;}
    else if(!coupled){const carts=choices.map(rows=>rows.reduce((best,v)=>cheaper(v,best)?v:best,null)),v=summary(carts);if(!carts.some(c=>c.unknown_fees||c.price_unknown)&&v.known_total<base.known_total)best=v;}
    else await allocate(0,[],new Map());
    if(best&&cheaper(best,plans.get(bins.length)))plans.set(bins.length,best);
   }
   const count=c.picks.reduce((n,p)=>n+p.quantity,0),cap=Math.min(maxOrders,count);
   // Balanced seeds cover large quantities before bounded package partitioning.
   for(let k=2;k<=cap;k++){const bins=Array.from({length:k},()=>c.picks.map(()=>0));let at=0;for(let i=0;i<c.picks.length;i++)for(let q=0;q<c.picks[i].quantity;q++)bins[at++%k][i]++;await consider(bins,true);if(stopped)break;}
   until=Math.min(started+limits.ms,Date.now()+Math.max(10,limits.ms/8));
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
  async function evaluate(bundles,limit){
   if(!bundles.length)return null;const picks=bundles.flatMap(p=>parts(p).map(x=>({...x,score_weight:p.score_weight}))),stores=new Map();
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
   const combined=picks.map(p=>{const parts=finalized.flatMap(c=>c.picks).filter(x=>x.item_id===p.item_id&&x.store_key===p.store_key&&x.product.key===p.product.key),cost=parts.reduce((n,x)=>n+x.cost,0);return {...p,cost,amazing_quantity:parts.reduce((n,x)=>n+x.amazing_quantity,0),base_quantity:parts.reduce((n,x)=>n+x.base_quantity,0),post_amazing_price:parts[0].post_amazing_price,price_unknown:parts.some(x=>x.price_unknown),effective_unit_price:p.total?cost*(['g','ml'].includes(p.unit)?1000:1)/p.total:null,order_count:parts.length,line:{...p.line,subtotal:cost}};});
   return {picks:combined,carts:finalized,store_count:stores.size,order_count:finalized.length,total:chosen.known_total,unit_score:chosen.unit_score,unknown_fees:finalized.filter(c=>c.unknown_fees).length,price_unknown:chosen.price_unknown,complete:unresolved.length===0};
  }

  function better(x,y){return x&&(!y||less(x.unit_score,y.unit_score)||same(x.unit_score,y.unit_score)&&(x.total<y.total||x.total===y.total&&(x.unknown_fees<y.unknown_fees||x.unknown_fees===y.unknown_fees&&x.carts.length<y.carts.length)));}
  function remember(value){if(better(value,best))best=value;if(value?.store_count===1&&better(value,single))single=value;if(value?.store_count<=2&&better(value,two))two=value;if(value?.store_count<=3&&better(value,three))three=value;}
  // Seed across the full candidate list before bounded enumeration, including
  // combinations requiring >3 stores when the hardware budget permits them.
  const priceSeed=required.map(x=>x.options[0]);remember(await evaluate(priceSeed,allowed));
  const unitSeed=required.map(x=>[...x.unitOptions].sort((p,q)=>(p.effective_unit_price??Infinity)-(q.effective_unit_price??Infinity)||p.cost-q.cost)[0]);unit=await evaluate(unitSeed,allowed);remember(unit);
  const keys=new Set(required.flatMap(x=>x.options.flatMap(storeKeys))),within=(p,keys)=>storeKeys(p).every(k=>keys.has(k));
  for(const key of keys){const picks=required.map(x=>x.options.find(p=>within(p,new Set([key]))));if(picks.every(Boolean))remember(await evaluate(picks,1));}
  // Find useful shared-store covers before enumerating combinations. Otherwise
  // many individually cheap merchants can exhaust the budget before a simple
  // two-store solution is reached. No candidate/store shortlist is imposed.
  const byStore=new Map([...keys].map(key=>[key,required.map(x=>x.options.find(p=>within(p,new Set([key]))))]));
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
   if(covered.size===required.length)remember(await evaluate(required.map(x=>x.options.find(p=>within(p,chosen))),allowed));
  }
  async function visit(index,picks,stores,limit){
   if(cancelled())throw Error('cancelled');
   if(++nodes>limits.states||Date.now()-started>limits.ms){bounded=true;return;}
   if(nodes%128===0)await new Promise(r=>setTimeout(r,0));
   if(index===ordered.length){remember(await evaluate(picks,limit));return;}
   for(const p of ordered[index].options){const fresh=storeKeys(p).filter(k=>!stores.has(k));if(stores.size+fresh.length>limit)continue;fresh.forEach(k=>stores.add(k));picks.push(p);await visit(index+1,picks,stores,limit);picks.pop();fresh.forEach(k=>stores.delete(k));if(bounded)return;}
  }
  for(let limit=Math.min(3,keys.size||1);limit<=Math.min(allowed,keys.size);limit++){exploredLimit=limit;await visit(0,[],new Set(),limit);if(bounded)break;}
  return {best,single,two,three,unit,cannot_cover:required.length>0&&!best,unresolved,nodes,bounded:bounded||splitBounded||mixedBounded,base_limit:3,hardware_limit:allowed,explored_limit:exploredLimit,elapsed_ms:Date.now()-started,assumptions:['موجودی و سهمیهٔ تخفیف باید در فروشگاه تأیید شوند.','هزینهٔ نامعلوم صفر فرض نشده است؛ مبلغ معلوم جدا نمایش داده می‌شود.']};
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
