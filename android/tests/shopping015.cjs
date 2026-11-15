// Independent checks of distinct amazing goods and repeated orders with all fees.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const pricing=require('../../cartoptimizer/web/offer-pricing.js'),basket=require('../../cartoptimizer/web/basket-planner.js'),cmp=require('../../cartoptimizer/web/comparison.js'),types=require('../../cartoptimizer/web/retail-types.js');
const item=(id,q=1,type='supermarket')=>({id,name:'کالا'+id,quantity:q,department:type});
const offer=(id,special=10,type='supermarket',extra={})=>({title:'کالا'+id,product_id:id,store_id:'shop',store_name:'فروشگاه',store_type:type,regular_price:100,promo_price:special,amazing:true,post_amazing_price:80,post_amazing_verified:true,...extra});
const quote=(fee=0,fields={},type='supermarket')=>({source:'digikala-visible-checkout',page_kind:'store',page_url:'https://www.digikalajet.com/search/shop',captured_at:new Date().toISOString(),store_id:'shop',store_name:'فروشگاه',store_type:type,fields:{delivery_fee:{value:fee},service_fee:{value:0},...fields},notices:[]});
const resources={state_limit:80000,solve_ms:800};
const run=(items,products,quotes=[quote()],extra={})=>basket.solve(items,items.map((i,n)=>({id:i.id,products:[products[n]]})),quotes,{},{},{...resources,...extra});
function invariant(plan,items){assert.ok(plan);for(const i of items){const parts=plan.carts.flatMap(c=>c.picks).filter(p=>p.item_id===i.id);assert.equal(parts.reduce((n,p)=>n+p.quantity,0),plan.picks.find(p=>p.item_id===i.id).quantity);}
 const used=new Set();for(const c of plan.carts){assert.ok(c.amazing_used<=pricing.limit(c.store_type));for(const p of c.picks)if(p.amazing_quantity){assert.equal(p.amazing_quantity,1);const key=p.store_key+'|'+pricing.identity(p.product);assert.ok(!used.has(key),'Same SKU cannot regain an amazing price through another order');used.add(key);}assert.equal(c.subtotal,c.picks.reduce((n,p)=>n+p.cost,0));}assert.equal(plan.total,plan.carts.reduce((n,c)=>n+c.known_total,0));assert.equal(plan.picks.reduce((n,p)=>n+p.cost,0),plan.carts.reduce((n,c)=>n+c.subtotal,0));}
(async()=>{
 assert.equal(pricing.estimated(offer('a'),3),170,'One amazing unit; the two others retain the ordinary discount');
 let items=[item('a',3)],products=[offer('a')],r=await run(items,products);assert.equal(r.best.total,170);assert.equal(r.best.order_count,1);assert.equal(r.best.picks[0].amazing_quantity,1);assert.equal(r.best.picks[0].base_quantity,2);invariant(r.best,items);
 const duplicate=[item('a'),{id:'alias',name:'کالاa',quantity:1}];r=await run(duplicate,[offer('a'),offer('a')]);assert.equal(r.best.total,90);assert.equal(r.best.order_count,1);invariant(r.best,duplicate);
 items=['a','b','c'].map(id=>item(id));products=items.map((i,n)=>offer(i.id,10+n*10));
 r=await run(items,products,[quote(10,{packaging_fee:{value:5},processing_fee:{value:2},tax_fee:{value:3}})]);
 for(const mode of ['best','single','two','three']){assert.equal(r[mode].store_count,1);assert.equal(r[mode].order_count,2);assert.equal(r[mode].total,100);invariant(r[mode],items);}assert.deepEqual(r.single.carts.map(c=>c.order_index).sort(),[1,2]);
 const selected=await run(items,products,[quote()],{selected_stores:['supermarket|id:shop']});assert.equal(selected.selected.store_count,1);assert.equal(selected.selected.order_count,2);
 r=await run(items,products,[quote(60)]);assert.equal(r.best.order_count,1);assert.equal(r.best.total,170,'Extra delivery exceeds savings');
 r=await run(items,products,[quote(0,{packaging_fee:{value:60}})]);assert.equal(r.best.order_count,1,'Packaging is charged again too');
 r=await run(items,products,[]);assert.equal(r.best.order_count,1);assert.ok(r.best.unknown_fees,'Unknown fees cannot establish a saving from extra orders');
 r=await run(items,products,[quote(0,{minimum_order:{value:100}})]);assert.equal(r.best.order_count,1);assert.equal(r.best.total,110);assert.equal(r.best.picks.reduce((n,p)=>n+p.quantity,0),3,'Do not add goods to reach minimums');
 r=await run(items,products,[quote(40,{free_delivery_over:{value:100}})]);assert.equal(r.best.order_count,1);assert.equal(r.best.total,110,'Splitting loses free delivery');
 const pastries=items.map(i=>({...i,department:'pastry'}));r=await run(pastries,products.map(p=>({...p,store_type:'pastry'})),[quote(10,{},'pastry')]);assert.equal(r.single.order_count,3);assert.equal(r.single.total,90);invariant(r.single,pastries);
 const four=['a','b','c','d'].map(id=>item(id,1,'pastry')),fourProducts=four.map(i=>offer(i.id,10,'pastry'));
 r=await run(four,fourProducts,[quote(0,{},'pastry')],{workers:2,max_carts:4});assert.equal(r.single.order_count,4);assert.equal(r.single.total,40);
 r=await run(four,fourProducts,[quote(0,{},'pastry')],{workers:2,max_carts:4,auto_expand:false});assert.equal(r.single.order_count,3);assert.equal(r.single.total,110);
 const expired=offer('a',10,'supermarket',{amazing_expires_at:Date.now()-1000});assert.equal(pricing.estimated(expired,2),160);assert.equal(cmp.unitPrice(expired),80);
 const empty=offer('a',10,'supermarket',{amazing_remaining:0});assert.equal(pricing.estimated(empty,2),160);r=await run([item('a')],[empty]);assert.equal(r.best.picks[0].amazing_quantity,0);
 r=await run([item('a')],[offer('a',10,'supermarket',{has_stock:false})]);assert.equal(r.best,null);assert.deepEqual(r.unresolved,['a']);
 const unknown=offer('a',10,'supermarket',{post_amazing_price:null,post_amazing_verified:false});r=await run([item('a',3)],[unknown]);assert.equal(r.best.total,210);assert.equal(r.best.price_unknown,1);assert.equal(r.best.order_count,1);
 const observed={...quote(),page_kind:'cart',fields:{total:{value:100}},cart_items:items.map(i=>({title:'کالا'+i.id,quantity:1,store_id:'shop',store_name:'فروشگاه',store_type:'supermarket'})),reported_units:3,items_complete:true};
 r=await run(items,products,[quote(),observed]);assert.equal(r.best.total,60);assert.equal(r.best.order_count,2);assert.ok(r.best.carts.every(c=>!c.verified),'A single observed checkout cannot verify multiple future checkouts');
 // Brute force physical-package partitions and promo-to-order choices, independently
 // of the implementation's variant helper, greedy seeds or order partitioner.
 for(let seed=1;seed<=12;seed++){
  const qs=[1+seed%2,1,1],base=[80+seed,90+seed,100+seed],special=[10+seed,15+seed,20+seed],fees=seed%4*12,min=seed%3?0:55,free=seed%2?90:150;
  const units=qs.flatMap((q,i)=>Array(q).fill(i)),den=qs.map((q,i)=>base[i]*q-base[i]+special[i]);
  const better=(a,b)=>!b||a.score<b.score-1e-9||Math.abs(a.score-b.score)<1e-9&&(a.total<b.total||a.total===b.total&&a.orders<b.orders);
  function price(bins){let best=null;const choices=[0,1,2].map(i=>[-1,...bins.map((b,k)=>b.includes(i)?k:-1).filter(k=>k>=0)]);
   for(const a of choices[0])for(const b of choices[1])for(const c of choices[2]){const promos=[a,b,c],slots=bins.map((_,k)=>promos.filter(x=>x===k).length);if(slots.some(n=>n>2))continue;let total=0,score=0,valid=true;
    bins.forEach((bin,k)=>{const counts=[0,1,2].map(i=>bin.filter(x=>x===i).length),costs=counts.map((n,i)=>n*base[i]-(promos[i]===k?base[i]-special[i]:0)),subtotal=costs.reduce((n,v)=>n+v,0);if(subtotal<min)valid=false;total+=subtotal+(subtotal>=free?0:fees);score+=costs.reduce((n,v,i)=>n+v/den[i],0);});const v={total,score,orders:bins.length};if(valid&&better(v,best))best=v;
   }return best;
  }
  const baseline=price([units]);let expected=baseline;
  function partition(i,bins){if(i===units.length){const v=price(bins);if(v&&(bins.length===1||v.total<baseline.total)&&better(v,expected))expected=v;return;}for(let k=0;k<=Math.min(bins.length,2);k++){const fresh=k===bins.length;if(fresh)bins.push([]);bins[k].push(units[i]);partition(i+1,bins);bins[k].pop();if(fresh)bins.pop();}}
  partition(0,[]);
  const is=items.map((i,n)=>({...i,quantity:qs[n]})),ps=products.map((p,n)=>({...p,post_amazing_price:base[n],regular_price:base[n]+50,promo_price:special[n]}));
  r=await run(is,ps,[quote(fees,{minimum_order:{value:min},free_delivery_over:{value:free}})]);assert.equal(r.best.total,expected.total,'Independent order/fee oracle '+seed);assert.ok(Math.abs(r.best.unit_score-expected.score)<1e-9);invariant(r.best,is);
 }
 // Public stock/timer fields survive the actual catalogue/offer sanitizers.
 const ctx={CartwiseTypes:types,fetch:()=>Promise.resolve({}),location:{origin:'https://www.digikalajet.com'},URL,XMLHttpRequest:function(){}};ctx.XMLHttpRequest.prototype.send=function(){};vm.createContext(ctx);vm.runInContext(fs.readFileSync('cartoptimizer/web/jet-catalog.js','utf8'),ctx);
 const before=Date.now();ctx.CartwiseCatalog.ingest({shop:{id:'shop',title:'فروشگاه',business:'supermarket'},result:[{id:'a',title:'کالاa',price:{price:100,discount:90,vendor_discount:20,brand_discount:0,jet_discount:70,timer:30},stock:{has_stock:false},dynamic_amazing:{remaining_stock:0},badges:{is_amazing:true}}]});
 const p=ctx.CartwiseCatalog.findProduct('shop','فروشگاه','کالاa',10);assert.equal(p.has_stock,false);assert.equal(p.amazing_remaining,0);assert.ok(p.amazing_expires_at>=before+30000);assert.equal(p.post_amazing_price,80);
 console.log('Distinct amazing SKUs, conserved quantities, repeated merchant orders, all fees/minimums/free delivery, expiry/stock and independent partition oracle passed');
})().catch(e=>{console.error(e);process.exit(1)});
