const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://www.digikalajet.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<div id="root"><input placeholder="آدرس"></div>'}));
 await page.goto('https://www.digikalajet.com/user/add-address');
 const sources=Object.fromEntries(['retail-types','jet-catalog','jet-navigation','jet-fees','jet-search-task'].map(s=>[s,fs.readFileSync('cartoptimizer/web/'+s+'.js','utf8')]));
 await page.evaluate(s=>{
  (0,eval)(s['retail-types']);(0,eval)(s['jet-catalog']);window.routes=[];
  const navigation=(0,eval)(s['jet-navigation']),fees=(0,eval)(s['jet-fees']);
  window.addEventListener('popstate',()=>{
   routes.push(location.pathname);
   document.getElementById('root').innerHTML=location.pathname==='/v4/shop'?'<h1>فروشگاه الف</h1><div><span>هزینه ارسال</span><span>۴۰٬۴۰۰</span><svg aria-label="تومان"></svg></div><div><span>هزینه خدمات</span><span>۲٬۰۰۰</span><img src="/toman.svg"></div><div>هزینه آماده‌سازی ۱٬۰۰۰ تومان</div><article><img alt="بسته بندی مقوایی"><p>بسته بندی مقوایی</p><p>۹٬۹۹۹ تومان</p></article>':'<p>شیر ۱ لیتر</p>';
   // Public search metadata is followed by a partial header response.
   if(location.pathname==='/search/shop')CartwiseCatalog.ingest({shop:{id:'a',title:'فروشگاه الف',activity_type:'supermarket',delivery:{cost:404000,is_free_by_plus:false}}});
   else CartwiseCatalog.ingest({shop:{id:'a',title:'فروشگاه الف',activity_type:'supermarket',delivery:{estimate_time:46}}});
  });
  const product={title:'شیر ۱ لیتر',regular_price:100000,promo_price:null,store_name:'فروشگاه الف',store_id:'a',store_type:'supermarket'};
  window.CartwiseSearchAdapters={navigation,fees,preference:()=>({configured:true,coordinates:'35.7500|51.4000'}),reader:()=>({products:location.pathname==='/search/shop'?[product]:[],shops:[]}),checkout:()=>({source:'digikala-visible-checkout',page_kind:'catalog',page_url:location.origin+location.pathname,captured_at:new Date().toISOString(),fields:{},notices:[]})};
  (0,eval)(s['jet-search-task']);CartwiseSearchTask.start({kind:'store',url:'https://www.digikalajet.com/search/shop?q=milk&shopId=a',shop_id:'a',store_name:'فروشگاه الف',store_type:'supermarket',coordinates:'35.75|51.4',seconds:15});
 },sources);
 await page.waitForFunction(()=>cartwiseTask.done,{},{timeout:20000});
 const state=await page.evaluate(()=>cartwiseTask),routes=await page.evaluate(()=>routes);assert.equal(state.fatal,undefined);assert.equal(state.result.error,null);assert.equal(state.result.products.length,1,'Storefront items must not leak into search results');assert.deepEqual(routes,['/search/shop','/v4/shop']);
 const quote=state.result.checkout_quotes.at(-1);assert.equal(quote.source,'digikala-public-store');assert.equal(quote.store_id,'a');assert.equal(quote.fields.delivery_fee.value,404000);assert.equal(quote.fields.service_fee.value,20000);assert.equal(quote.fields.processing_fee.value,10000);assert.equal(quote.fields.packaging_fee,undefined,'A product title is not a fee label');
 assert.deepEqual(errors,[]);await browser.close();console.log('Real DOM fee labels/currency icons, public API rials, partial metadata, numeric address guard, v4 storefront route and product isolation passed');
})().catch(e=>{console.error(e);process.exit(1)});
