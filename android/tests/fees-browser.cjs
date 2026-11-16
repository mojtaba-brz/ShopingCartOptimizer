const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://www.digikalajet.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<div id="root"><input placeholder="آدرس"></div>'}));
 await page.goto('https://www.digikalajet.com/user/add-address');
 const sources=Object.fromEntries(['retail-types','jet-catalog','jet-navigation','jet-fees','digikala-checkout','jet-search-task'].map(s=>[s,fs.readFileSync('cartoptimizer/web/'+s+'.js','utf8')]));
 await page.evaluate(s=>{
  (0,eval)(s['retail-types']);(0,eval)(s['jet-catalog']);window.routes=[];
  const navigation=(0,eval)(s['jet-navigation']),fees=(0,eval)(s['jet-fees']);
  window.addEventListener('popstate',()=>{
   routes.push(location.pathname);
   document.getElementById('root').innerHTML=location.pathname==='/v4/shop'?'<h1>فروشگاه الف</h1><div><span>هزینه ارسال</span><span>۴۰٬۴۰۰</span><svg aria-label="تومان"></svg></div><div><span>هزینه خدمات</span><span>۲٬۰۰۰</span><img src="/toman.svg"></div><div>هزینه توسعه خدمات ۱٬۰۰۰ تومان</div><article><img alt="بسته بندی مقوایی"><p>بسته بندی مقوایی</p><p>۹٬۹۹۹ تومان</p></article>':'<p>شیر ۱ لیتر</p>';
   // Public search metadata is followed by a partial header response.
   if(location.pathname==='/search/shop')CartwiseCatalog.ingest({shop:{id:'a',title:'فروشگاه الف',activity_type:'supermarket',delivery:{cost:404000,is_free_by_plus:false}}});
   else CartwiseCatalog.ingest({shop:{id:'a',title:'فروشگاه الف',activity_type:'supermarket',delivery:{estimate_time:46}}});
  });
  const product={title:'شیر ۱ لیتر',regular_price:100000,promo_price:null,store_name:'فروشگاه الف',store_id:'a',store_type:'supermarket'};
  window.CartwiseSearchAdapters={navigation,fees,preference:()=>({configured:true,coordinates:'35.7500|51.4000'}),reader:()=>({products:location.pathname==='/search/shop'?[product]:[],shops:[]}),checkout:()=>(0,eval)(s['digikala-checkout'])};
  (0,eval)(s['jet-search-task']);CartwiseSearchTask.start({kind:'store',url:'https://www.digikalajet.com/search/shop?q=milk&shopId=a',shop_id:'a',store_name:'فروشگاه الف',store_type:'supermarket',coordinates:'35.75|51.4',seconds:15});
 },sources);
 await page.waitForFunction(()=>cartwiseTask.done,{},{timeout:20000});
 const state=await page.evaluate(()=>cartwiseTask),routes=await page.evaluate(()=>routes);assert.equal(state.fatal,undefined);assert.equal(state.result.error,null);assert.equal(state.result.products.length,1,'Storefront items must not leak into search results');assert.deepEqual(routes,['/v4/shop','/search/shop']);
 const quote=state.result.checkout_quotes.find(q=>q.fields.service_fee?.value===20000);assert.equal(quote.source,'digikala-public-store');assert.equal(quote.store_id,'a');assert.equal(quote.fields.delivery_fee.value,404000);assert.equal(quote.fields.service_fee.value,20000);assert.equal(quote.fields.processing_fee.value,10000);assert.equal(quote.fields.packaging_fee,undefined,'A product title is not a fee label');
 // A second search must still scan products, but reuse the previously inspected storefront.
 const checks=state.result.fee_checks;assert.equal(checks.length,1);assert.equal(checks[0].observed,true);
 async function repeat(cache,expected,seconds=15){await page.evaluate(({cache,seconds})=>{history.replaceState({},'', '/user/add-address');document.getElementById('root').innerHTML='<input placeholder=آدرس>';window.routes=[];CartwiseSearchTask.start({kind:'store',url:'https://www.digikalajet.com/search/shop?q=milk&shopId=a',shop_id:'a',store_name:'فروشگاه الف',store_type:'supermarket',coordinates:'35.75|51.4',seconds,fee_cache:cache});},{cache,seconds});await page.waitForFunction(()=>cartwiseTask.done,{},{timeout:20000});const x=await page.evaluate(()=>({routes,result:cartwiseTask.result}));assert.deepEqual(x.routes,expected);assert.equal(x.result.products.length,1);return x;}
 const cache={coordinates:'35.7500|51.4000',shipment_type:'on_demand',checks};
 const reused=await repeat(cache,['/search/shop']);assert.equal(reused.result.fee_checks.length,0,'Reusing evidence must not renew its date');
 await repeat({...cache,coordinates:'35.76|51.4'},['/v4/shop','/search/shop']);
 await repeat({...cache,checks:checks.map(c=>({...c,captured_at:new Date(Date.now()-8*86400000).toISOString()}))},['/v4/shop','/search/shop']);
 await repeat({...cache,shipment_type:'scheduled'},['/v4/shop','/search/shop']);
 await repeat({...cache,checks:checks.map(c=>({...c,store_type:'produce'}))},['/v4/shop','/search/shop']);
 const bounded=await repeat(null,['/v4/shop','/search/shop'],2.5);assert.equal(bounded.result.fee_checks.length,1);assert.ok(bounded.result.checkout_quotes.some(q=>q.fields.service_fee?.value===20000),'A product scan timeout must not erase observed fees');
 // A long global carousel must retain verified store tasks on timeout.
 await page.evaluate(()=>{history.replaceState({},'', '/user/add-address');document.body.style.minHeight='100000px';document.getElementById('root').innerHTML='<input placeholder=آدرس>';window.savedReader=CartwiseSearchAdapters.reader;CartwiseSearchAdapters.reader=()=>location.pathname==='/search/v2/result'?{products:[{title:'شیر یک لیتر',regular_price:100000,store_name:'فروشگاه الف',store_id:'a'}],shops:[{name:'فروشگاه الف'}]}:{products:[],shops:[]};CartwiseSearchTask.start({kind:'global',query:'milk',url:'https://www.digikalajet.com/search/v2/result?q=milk',coordinates:'35.75|51.4',seconds:2.5,max_stores:1});});
 await page.waitForFunction(()=>cartwiseTask.done,{},{timeout:10000});
 const boundedDiscovery=await page.evaluate(()=>cartwiseTask.result);assert.match(boundedDiscovery.error,/بودجه/);assert.equal(boundedDiscovery.store_tasks.length,1,'A global timeout must not discard already verified merchants');assert.equal(new URL(boundedDiscovery.store_tasks[0].url).searchParams.get('shopId'),'a');assert.equal(new URL(boundedDiscovery.store_tasks[0].url).searchParams.get('q'),'milk');
 await page.evaluate(()=>{CartwiseSearchAdapters.reader=window.savedReader;document.body.style.minHeight='';});
 // The shared app must label the actual winning SKUs, not every amazing offer.
 await page.addInitScript(()=>{window.CartwiseAndroid={findAutomatically:()=>{},savedDelivery:()=>JSON.stringify({location:'ارسال به ونک',shipment_type:'on_demand'}),openDigikala:()=>{},setAppearance:()=>{}};});
 await page.goto('http://127.0.0.1:8765');await page.waitForSelector('#search-new');await page.evaluate(()=>{localStorage.clear();state=initialState();state.items=[1,10,1].map((quantity,n)=>({id:'i'+n,name:'کالا'+n,quantity}));save();});await page.click('#optimize');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cartwise:auto-results',{detail:{source:'digikala-automatic',location:'ارسال به ونک',shipment_type:'on_demand',items:[90,80,5].map((price,n)=>({id:'i'+n,products:[{title:'کالا'+n,product_id:'p'+n,store_id:'a',store_name:'فروشگاه الف',store_type:'supermarket',regular_price:120,promo_price:price,amazing:true,post_amazing_price:100,post_amazing_verified:true}]})),checkout_quotes:[{source:'digikala-public-store',page_kind:'store',page_url:'https://www.digikalajet.com/v4/shop',captured_at:new Date().toISOString(),store_name:'فروشگاه الف',store_id:'a',store_type:'supermarket',fields:{delivery_fee:{value:404000}},notices:[]}]}})));
 await page.waitForSelector('.store-basket');assert.equal(await page.locator('.store-basket').count(),1);assert.equal(await page.locator('.store-basket li').filter({hasText:'کالا0'}).locator('.cart-promo').count(),0);for(const title of ['کالا1','کالا2'])assert.equal(await page.locator('.store-basket li').filter({hasText:title}).locator('.cart-promo').count(),1);
 assert.match(await page.locator('.store-basket .checkout-fields').innerText(),/۴۰[٬,]۴۰۰/);assert.match(await page.locator('.store-basket').innerText(),/سایر هزینه‌ها\s*تأیید نشده/);fs.mkdirSync('/tmp/cartwise-ui',{recursive:true});await page.screenshot({path:'/tmp/cartwise-ui/amazing-shipping0171.png',fullPage:true});
 assert.deepEqual(errors,[]);await browser.close();console.log('Real DOM fee labels/currency icons, public API rials, partial metadata, numeric address guard, v4 storefront route and product isolation passed');
})().catch(e=>{console.error(e);process.exit(1)});
