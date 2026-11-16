const assert=require('node:assert/strict'),basket=require('../../cartoptimizer/web/basket-planner.js');
const items=[{id:'a',name:'کالاa',quantity:1},{id:'b',name:'کالاb',quantity:10},{id:'c',name:'کالاc',quantity:1}];
const products=[90,80,5].map((special,n)=>({title:'کالا'+items[n].id,product_id:items[n].id,store_id:'shop',store_name:'فروشگاه',store_type:'supermarket',regular_price:120,promo_price:special,amazing:true,post_amazing_price:100,post_amazing_verified:true}));
const quote=fields=>({source:'digikala-visible-checkout',page_kind:'store',page_url:'https://www.digikalajet.com/search/shop',store_id:'shop',store_name:'فروشگاه',store_type:'supermarket',captured_at:new Date().toISOString(),fields:{delivery_fee:{value:0},service_fee:{value:0},...fields},notices:[]});
const solve=(is,ps,qs)=>basket.solve(is,is.map((i,n)=>({id:i.id,products:[ps[n]]})),qs,{},{},{repeat_orders:false,solve_ms:800,state_limit:80000});
(async()=>{
 for(const fields of [{},{minimum_order:{value:0}}]){
  const result=await solve(items,products,[quote(fields)]);
  for(const mode of ['best','single','two','three']){const plan=result[mode];assert.equal(plan.total,1085,'Maximize absolute saving, not normalized per-line influence');assert.deepEqual(plan.picks.filter(p=>p.amazing_quantity).map(p=>p.item_id).sort(),['b','c']);const bulk=plan.picks.find(p=>p.item_id==='b');assert.equal(bulk.amazing_quantity,1);assert.equal(bulk.base_quantity,9);assert.equal(bulk.cost,980,'Other units keep the observed post-amazing ordinary discount');}
 }
 const is=items.map(i=>({...i,quantity:1})),ps=products.map((p,n)=>({...p,promo_price:10+n*10}));
 const result=await solve(is,ps,[quote({delivery_fee:{value:50},service_fee:{value:10},packaging_fee:{value:25},free_delivery_over:{value:150},minimum_order:{value:140}})]);
 assert.equal(result.best.total,185);assert.deepEqual(result.best.picks.filter(p=>p.amazing_quantity).map(p=>p.item_id).sort(),['b','c'],'Forgo a bigger item discount when it would lose free delivery');assert.equal(result.best.carts[0].delivery_fee,0);
 const actual={...quote({delivery_fee:{value:0},service_fee:{value:10},packaging_fee:{value:25},subtotal:{value:150},total:{value:185}}),page_kind:'cart',cart_items:is.map(i=>({title:'کالا'+i.id,quantity:1,store_id:'shop',store_name:'فروشگاه',store_type:'supermarket'})),reported_units:3,items_complete:true};
 const quoted=await solve(is,ps,[quote({delivery_fee:{value:50},service_fee:{value:10},packaging_fee:{value:25},free_delivery_over:{value:150}}),actual]);assert.equal(quoted.best.total,185);assert.deepEqual(quoted.best.picks.filter(p=>p.amazing_quantity).map(p=>p.item_id).sort(),['b','c'],'Observed subtotal must agree with the proposed promotion allocation');
 const unavailable=products.map(p=>p.product_id==='c'?{...p,amazing_remaining:0}:p);const noC=await solve(items,unavailable,[quote({})]);assert.equal(noC.best.total,1170);assert.deepEqual(noC.best.picks.filter(p=>p.amazing_quantity).map(p=>p.item_id).sort(),['a','b']);
 const unknown=await solve(items,products,[]);assert.equal(unknown.best.total,1085);assert.equal(unknown.best.unknown_fees,1,'Unobserved charges stay unknown');
 console.log('Absolute amazing savings, unequal quantities, verified discounted fallback, fee/free-delivery thresholds, stock, all store modes and unknown-fee guard passed');
})().catch(e=>{console.error(e);process.exit(1)});
