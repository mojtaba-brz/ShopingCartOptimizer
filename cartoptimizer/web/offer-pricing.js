/* Three price tiers. Amazing quotas belong to each typed merchant basket. */
(function(root){
 'use strict';
 const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e13;
 function tiers(p){
  const current=p.promo_price??p.regular_price,amazing=p.amazing===true;
  const candidate=p.post_amazing_price??p.discount_price;
  const verified=amazing?money(candidate)&&candidate>=current&&candidate<=p.regular_price&&p.post_amazing_verified!==false:true;
  return {regular:p.regular_price,amazing:amazing?current:null,base:amazing?(verified?candidate:p.regular_price):current,base_verified:verified,discounted:!amazing&&p.promo_price!==null};
 }
 function limit(type){return type==='supermarket'?2:1;}
 function estimated(p,q){const t=tiers(p),n=t.amazing===null?0:Math.min(q,limit(p.store_type||'supermarket'));return q*t.base-n*Math.max(0,t.base-t.amazing);}
 function variants(picks,type,thresholds=false){
  const cap=limit(type),base=picks.map(x=>tiers(x.product)),units=[];
  base.forEach((t,i)=>{if(t.amazing!==null)for(let n=0;n<Math.min(cap,picks[i].quantity);n++)units.push({i,n,saving:t.base-t.amazing});});
  units.sort((a,b)=>b.saving-a.saving||a.i-b.i||a.n-b.n);
  const combos=thresholds?[[],...units.map(x=>[x])]:[units.slice(0,cap)];
  if(thresholds&&cap===2)for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)combos.push([units[i],units[j]]);
  const seen=new Set(),out=[];
  for(const combo of combos){const counts=picks.map(()=>0);combo.forEach(x=>counts[x.i]++);const k=counts.join(',');if(seen.has(k))continue;seen.add(k);let subtotal=0,unknown=0;
   const priced=picks.map((pick,i)=>{const t=base[i],special=counts[i],rest=pick.quantity-special,cost=special*(t.amazing??t.base)+rest*t.base;subtotal+=cost;if(rest&&!t.base_verified)unknown++;
    return {...pick,cost,amazing_quantity:special,base_quantity:rest,post_amazing_price:t.base,price_unknown:rest>0&&!t.base_verified,effective_unit_price:pick.total?cost*(['g','ml'].includes(pick.unit)?1000:1)/pick.total:null,line:{...pick.line,subtotal:cost}};
   });out.push({picks:priced,subtotal,price_unknown:unknown,amazing_used:combo.length,amazing_limit:cap});
  }
  return out;
 }
 const api={tiers,limit,estimated,variants};root.CartwisePricing=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
