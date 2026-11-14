const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const packs=require('../../cartoptimizer/web/package-size.js'),a=require('../../cartoptimizer/web/auto-planner.js'),c=require('../../cartoptimizer/web/comparison.js'),basket=require('../../cartoptimizer/web/basket-planner.js'),types=require('../../cartoptimizer/web/retail-types.js');
const item=(id,name=id,quantity=1,department='supermarket')=>({id,name,quantity,department});
const p=(title,store,base,special=null,type='supermarket')=>({title,store_id:store,store_name:store,store_type:type,regular_price:base+20,promo_price:special??base,amazing:special!==null,post_amazing_price:base,post_amazing_verified:true});
const quote=(id,type='supermarket',fields={})=>({source:'digikala-visible-checkout',page_kind:'store',page_url:'https://www.digikalajet.com/search/shop',store_id:id,store_name:id,store_type:type,captured_at:new Date().toISOString(),fields:{delivery_fee:{value:0},service_fee:{value:0},...fields},notices:[]});
(async()=>{
 assert.equal(types.item({name:'تن ماهی'}),'supermarket');assert.equal(types.item({name:'تخم مرغ'}),'supermarket');
 for(const [title,value] of [['دستمال کاغذی ۲۰۰ برگ دولا بسته ۱۰ عددی',2000],['دستمال کاغذی 200 برگ بسته 10 عددی',2000],['دستمال کاغذی 100 برگ 4 لا بسته 3 عددی',600],['دستمال کاغذی 200 برگ دو لا 10 جعبه',2000]])assert.deepEqual(c.measure(title),{unit:'sheet',value});
 for(const [title,value] of [['تن ماهی ۱۸۰ گرمی بسته ۳ عددی',540],['تن ماهی مجموعه 3 عددی 180 گرم',540],['تن ماهی 3×180 گرم',540],['تن ماهی 180 گرم ×3',540],['ماست ۶ عددی هر عدد ۲۰۰ گرم',1200],['نوشیدنی 6 بطری 1.5 لیتر',9000],['تن ماهی وزن کل 540 گرم بسته 3 عددی',540],['تن ماهی 3 عددی مجموع وزن 540 گرم',540]])assert.equal(packs.amount(title).value,value,title);
 assert.equal(packs.measure('محصول 200 گرم و 300 گرم').unit,'unknown');assert.equal(packs.measure('دستمال کاغذی 100 برگ و 200 برگ').unit,'unknown');assert.equal(packs.measure('دستمال کاغذی بسته 10 عددی').unit,'unknown');
 const tissue=c.options(item('t','دستمال کاغذی'),[{title:'دستمال کاغذی 200 برگ بسته 10 عددی',regular_price:10000,promo_price:null},{title:'دستمال کاغذی 100 برگ',regular_price:1000,promo_price:null}]);assert.equal(tissue[0].unit_price,5);assert.equal(c.plan(item('t','دستمال کاغذی'),tissue).quantity,1);
 assert.equal(a.estimated(p('کالا','a',80),5),400,'Ordinary discount repeats for every package');
 let is=[item('کالا0'),item('کالا1'),item('کالا2')],rs=is.map((i,n)=>({id:i.id,products:[p(i.name,'a',100,n+10)]}));
 let run=await basket.solve(is,rs,[quote('a')]);assert.equal(run.best.total,121);assert.equal(run.best.carts[0].amazing_used,2);assert.equal(run.best.picks.reduce((n,p)=>n+p.amazing_quantity,0),2);assert.equal(run.best.picks.reduce((n,p)=>n+p.cost,0),run.best.total);
 run=await basket.solve([item('کالا','کالا',3)],[{id:'کالا',products:[p('کالا','a',100,10)]}],[quote('a')]);assert.equal(run.best.total,120);assert.equal(run.best.picks[0].quantity,3);
 run=await basket.solve([item('کالا','کالا',3,'pastry')],[{id:'کالا',products:[p('کالا','a',100,10,'pastry')]}],[quote('a','pastry')]);assert.equal(run.best.total,210);assert.equal(run.best.carts[0].amazing_limit,1);
 const scopedItems=[item('m','کالا',3),item('n','کالا',3,'pastry')],scopedRows=[{id:'m',products:[p('کالا','same',100,10)]},{id:'n',products:[p('کالا','same',100,10,'pastry')]}];
 const scoped=await basket.solve(scopedItems,scopedRows,[quote('same'),quote('same','pastry')]);assert.equal(scoped.best.total,330);assert.deepEqual(scoped.best.carts.map(c=>c.amazing_used),[2,1]);
 // A regular discount can beat an individually cheaper amazing offer once the
 // merchant-wide quota is occupied by other lines. No same-store pruning loss.
 rs[2].products.push(p('کالا2 جایگزین','a',30));run=await basket.solve(is,rs,[quote('a')]);assert.equal(run.best.total,51);assert.match(run.best.picks.find(x=>x.item_id==='کالا2').product.title,/جایگزین/);
 const unknown=p('کالا','a',100,10);delete unknown.post_amazing_price;unknown.post_amazing_verified=false;run=await basket.solve([item('کالا','کالا',3)],[{id:'کالا',products:[unknown]}],[quote('a')]);assert.equal(run.best.price_unknown,1);assert.equal(run.best.total,140);
 const noOriginal={title:'کالا',store_id:'a',store_name:'a',store_type:'supermarket',regular_price:10,promo_price:null,amazing:true,regular_verified:false};
 const knownOne=await basket.solve([item('کالا')],[{id:'کالا',products:[noOriginal]}],[quote('a')]);assert.equal(knownOne.best.price_unknown,0);assert.equal(knownOne.best.carts[0].amazing_used,1);
 // Independent exhaustive assignment and quota allocation, including fee/minimum
 // thresholds that can make voluntarily using fewer amazing units cheaper.
 for(let seed=1;seed<=16;seed++){
  const items=[0,1,2].map(n=>item('کالا'+n,'کالا'+n,1+(seed+n)%2)),rows=items.map((i,n)=>({id:i.id,products:['a','b'].map((id,k)=>p(i.name,id,60+(seed*13+n*17+k*19)%70,(seed+n+k)%3?10+(seed+n+k)%30:null))}));
  const fee=25,min=seed%2?0:50,free=seed%3?150:100;
  function storeCost(chosen){const units=[],base=chosen.reduce((sum,{p,q})=>{if(p.amazing)for(let j=0;j<q;j++)units.push(p.post_amazing_price-p.promo_price);return sum+p.post_amazing_price*q;},0);let best=Infinity;const savings=[0,...units];for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)savings.push(units[i]+units[j]);for(const d of savings){const subtotal=base-d;if(subtotal>=min)best=Math.min(best,subtotal+(subtotal>=free?0:fee));}return best;}
  let best=Infinity;for(let mask=0;mask<8;mask++){let total=0;for(const id of ['a','b']){const selected=items.map((it,n)=>({p:rows[n].products[(mask>>n)&1],q:it.quantity})).filter(x=>x.p.store_id===id);if(selected.length)total+=storeCost(selected);}best=Math.min(best,total);}
  const actual=await basket.solve(items,rows,['a','b'].map(id=>quote(id,'supermarket',{delivery_fee:{value:fee},minimum_order:{value:min},free_delivery_over:{value:free}})),{},{},{solve_ms:800,state_limit:80000});assert.equal(actual.best.total,best,'Quota/fee oracle seed '+seed);
 }
 // Only whitelisted public catalogue fields are exposed, with merchant and
 // displayed-current-price agreement. Account/cart prices never enter the index.
 const sandbox={CartwiseTypes:types,fetch:()=>Promise.resolve({}),location:{origin:'https://www.digikalajet.com'},URL,XMLHttpRequest:function(){}};sandbox.XMLHttpRequest.prototype.send=function(){};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('cartoptimizer/web/jet-catalog.js','utf8'),sandbox);
 sandbox.CartwiseCatalog.ingest({products:{result:[{id:'a',title:'الف',business:'supermarket',products:[{id:'p',title:'تن ماهی 180 گرم',price:{price:1500,discount:300},product_first:{aggregated_price:800},badges:{is_amazing:true}}]}]},account:{products:[{id:'secret',title:'راز',price:{price:1,discount:0}}]}});
 const found=sandbox.CartwiseCatalog.findProduct('a','الف','تن ماهی 180 گرم',800);assert.equal(found.post_amazing_price,1200);assert.equal(found.regular_price,1500);assert.equal(found.amazing,true);assert.equal(Object.keys(sandbox.CartwiseCatalog.findProduct('wrong','الف','تن ماهی 180 گرم',800)).length,0);assert.equal(Object.keys(sandbox.CartwiseCatalog.findProduct('a','الف','تن ماهی 180 گرم',900)).length,0);
 sandbox.CartwiseCatalog.ingest({shop:{id:'a',title:'الف',business:'supermarket'},result:[{id:'parts',title:'شیر زنده',price:{price:1529000,discount:585000,vendor_discount:0,brand_discount:0,jet_discount:585000},badges:{is_amazing:true}}]});
 const live=sandbox.CartwiseCatalog.findProduct('a','الف','شیر زنده',944000);assert.equal(live.post_amazing_price,1529000);assert.equal(live.post_amazing_source,'catalogue-components');
 sandbox.CartwiseCatalog.ingest({shop:{id:'a',title:'الف',business:'supermarket'},result:[{id:'parts2',title:'شیر چند تخفیفی',price:{price:1500,discount:700,vendor_discount:200,brand_discount:100,jet_discount:400},badges:{is_amazing:true}}]});assert.equal(sandbox.CartwiseCatalog.findProduct('a','الف','شیر چند تخفیفی',800).post_amazing_price,1200);
 sandbox.CartwiseCatalog.ingest({shop:{id:'a',title:'الف',business:'supermarket'},result:[{id:'bad',title:'شیر ناسازگار',price:{price:1500,discount:700,vendor_discount:200,brand_discount:100,jet_discount:399},badges:{is_amazing:true}}]});assert.equal(sandbox.CartwiseCatalog.findProduct('a','الف','شیر ناسازگار',800).post_amazing_verified,false);
 console.log('Multipacks/tissue sheets, three price tiers, merchant-wide amazing quotas and independent fee/quantity oracle passed');
})().catch(e=>{console.error(e);process.exit(1)});
