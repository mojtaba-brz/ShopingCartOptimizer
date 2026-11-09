const assert=require('node:assert/strict'),basket=require('../../cartoptimizer/web/basket-planner.js');
const item=(id,name)=>({id,name,quantity:1}),product=(title,store,price)=>({title,store_name:store,store_id:store,regular_price:price,promo_price:null,url:'https://www.digikalajet.com/search/shop?shopId='+store});
const quote=(store,delivery=200,extra={})=>({source:'digikala-visible-checkout',page_kind:'store',store_name:store,store_id:store,page_url:'https://www.digikalajet.com/search/shop',captured_at:new Date().toISOString(),fields:{delivery_fee:{value:delivery},service_fee:{value:0},...extra},notices:[]});
(async()=>{
 const items=[item('m','شیر 1 لیتر'),item('b','نان 1 کیلوگرم')],results=[{id:'m',products:[product('شیر 1 لیتر','a',50),product('شیر 1 لیتر','b',130)]},{id:'b',products:[product('نان 1 کیلوگرم','a',1000),product('نان 1 کیلوگرم','b',100)]}];
 const first=await basket.solve(items,results,[quote('a'),quote('b')]);
 assert.equal(first.best.total,430);assert.equal(first.best.carts.length,1);assert.equal(first.best.carts[0].name,'b');assert.equal(first.best.unknown_fees,0);
 assert.equal(first.unit.carts.length,2);assert.equal(first.unit.total,550);
 const unknown=await basket.solve(items,results,[]);assert.ok(unknown.best.unknown_fees>0);assert.equal(unknown.best.carts[0].delivery_fee,null);
 const stale=quote('a');stale.captured_at=new Date(Date.now()-3600000).toISOString();assert.ok((await basket.solve(items,results,[stale])).best.unknown_fees);
 const many=Array.from({length:35},(_,n)=>product('شیر 1 لیتر نمونه '+n,'a',n===34?10:1000));
 assert.equal((await basket.solve([items[0]],[{id:'m',products:many}],[quote('a',0)])).best.total,10,'No top-20 truncation');
 const four=[item('a','شیر'),item('b','نان'),item('c','پنیر'),item('d','ماست')],separate=four.map(i=>({id:i.id,products:[product(i.name,i.id,100)]}));
 assert.equal((await basket.solve(four,separate,[],{},{},{workers:1,max_carts:3})).best,null);
 const adaptive=await basket.solve(four,separate,[],{},{},{workers:2,max_carts:4});assert.equal(adaptive.best.carts.length,4);
 assert.equal((await basket.solve(four,separate,[],{},{},{workers:2,max_carts:4,auto_expand:false})).best,null);
 const minimum=await basket.solve([items[0]],[{id:'m',products:[product('شیر 1 لیتر کم','a',50),product('شیر 1 لیتر کافی','a',150)]}],[quote('a',20,{minimum_order:{value:100}})]);assert.equal(minimum.best.total,170);
 // Independent enumeration: merchant assignment + separately charged store fees.
 for(let seed=1;seed<=15;seed++){
  const is=[item('m','شیر'),item('b','نان'),item('c','پنیر')],rs=is.map((i,n)=>({id:i.id,products:['a','b','c'].map((store,k)=>product(i.name,store,10+(seed*17+n*13+k*29)%100))}));
  let expected=Infinity;for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++){const picks=[a,b,c],stores=new Set(picks);const cost=picks.reduce((sum,k,n)=>sum+rs[n].products[k].regular_price,0)+stores.size*30;expected=Math.min(expected,cost);}
  const got=await basket.solve(is,rs,['a','b','c'].map(s=>quote(s,30)),{},{},{state_limit:80000,solve_ms:800});assert.equal(got.best.total,expected);
 }
 const large=Array.from({length:15},(_,n)=>item('item'+n,'کالا'+n)),largeRows=large.map((i,n)=>({id:i.id,products:[product(i.name,'unique'+n,1),product(i.name,n<8?'sharedA':'sharedB',2)]}));
 const cover=await basket.solve(large,largeRows,[],{},{},{state_limit:1000,solve_ms:50});assert.ok(cover.best);assert.ok(cover.best.carts.length<=3,'Shared-store seed prevents a false no-plan result');
 const free=await basket.solve(items,results,[quote('a',200,{free_delivery_over:{value:1000}}),quote('b',200,{free_delivery_over:{value:200}})]);assert.equal(free.best.carts[0].delivery_fee,0);
 await assert.rejects(basket.solve(items,results,[],{},{},{},()=>true),/cancelled/);
 console.log('Multi-store fees, whole quantities, >20 candidates, minimum orders, hardware expansion and independent assignment oracle passed');
})().catch(e=>{console.error(e);process.exit(1)});
