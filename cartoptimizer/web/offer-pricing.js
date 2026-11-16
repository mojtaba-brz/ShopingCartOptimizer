/* Three price tiers. Amazing quotas belong to each typed merchant basket. */
(function(root){
 'use strict';
 const packages=root.CartwisePackages||(typeof require!=='undefined'?require('./package-size.js'):null);
 const identity=p=>p.product_id?'id:'+p.product_id:'title:'+packages.text(p.title);
 const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e13;
 function tiers(p){
  const current=p.promo_price??p.regular_price,amazing=p.amazing===true;
  const candidate=p.post_amazing_price??p.discount_price;
  const verified=amazing?money(candidate)&&candidate>=current&&candidate<=p.regular_price&&p.post_amazing_verified!==false:true;
  const expired=amazing&&Number.isFinite(p.amazing_expires_at)&&p.amazing_expires_at<=Date.now(),eligible=amazing&&!expired&&p.amazing_remaining!==0;
  return {regular:p.regular_price,expired,amazing:eligible?current:null,base:amazing?(verified?candidate:p.regular_price):current,base_verified:verified,discounted:!amazing&&p.promo_price!==null};
 }
 function limit(type){return type==='supermarket'?2:1;}
 function estimated(p,q){const t=tiers(p),n=t.amazing===null?0:Math.min(q,1);return q*t.base-n*Math.max(0,t.base-t.amazing);}
 function variants(picks,type,thresholds=false){
  const cap=limit(type),base=picks.map(x=>tiers(x.product)),units=[];
  base.forEach((t,i)=>{if(t.amazing!==null&&picks[i].quantity>0)units.push({i,n:0,key:identity(picks[i].product),saving:t.base-t.amazing});});
  units.sort((a,b)=>b.saving-a.saving||a.i-b.i);
  const unique=new Set(),greedy=units.filter(x=>{if(unique.has(x.key))return false;unique.add(x.key);return true;}).slice(0,cap);
  const combos=thresholds?[[],...units.map(x=>[x])]:[greedy];
  if(thresholds&&cap===2)for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)if(units[i].key!==units[j].key)combos.push([units[i],units[j]]);
  const seen=new Set(),out=[];
  for(const combo of combos){const counts=picks.map(()=>0);combo.forEach(x=>counts[x.i]++);const k=counts.join(',');if(seen.has(k))continue;seen.add(k);let subtotal=0,unknown=0;
   const priced=picks.map((pick,i)=>{const t=base[i],special=counts[i],rest=pick.quantity-special,cost=special*(t.amazing??t.base)+rest*t.base;subtotal+=cost;if(rest&&!t.base_verified)unknown++;
    return {...pick,cost,amazing_quantity:special,base_quantity:rest,post_amazing_price:t.base,price_unknown:rest>0&&!t.base_verified,effective_unit_price:pick.total?cost*(['g','ml'].includes(pick.unit)?1000:1)/pick.total:null,line:{...pick.line,subtotal:cost}};
   });out.push({picks:priced,subtotal,price_unknown:unknown,amazing_used:combo.length,amazing_limit:cap});
  }
  return out;
 }
 const api={tiers,limit,estimated,variants,identity};root.CartwisePricing=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
