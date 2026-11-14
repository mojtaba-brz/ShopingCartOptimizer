const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:412,height:915}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.CartwiseAndroid={savedDelivery:()=>JSON.stringify({location:'ارسال به ونک',coordinates:'35.7|51.4',shipment_type:'on_demand'}),findAutomatically:raw=>window.testSearches.push(JSON.parse(raw)),openDigikala:()=>{},saveJSON:()=>{},setAppearance:()=>{}};window.testSearches=[];});
 await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>window.CartwisePackages&&window.CartwiseAuto&&document.querySelector('#search-new'));
 await page.evaluate(()=>{localStorage.clear();state=initialState();dirty.clear();save();});
 await page.locator('#item-form [name=name]').fill('پاک شود');await page.locator('#item-form [name=name]').fill('');assert.equal(await page.evaluate(()=>dirty.has('item-form')),false,'Restored form values clear stale dirty state');
 await page.evaluate(()=>dirty.add('settings-form'));
 await page.locator('#item-form [name=name]').fill('دستمال کاغذی');await page.locator('#item-form [name=quantity]').fill('2');await page.locator('#optimize').click();
 assert.equal(await page.evaluate(()=>window.testSearches.length),1);assert.equal(await page.evaluate(()=>state.items[0].quantity),2);assert.equal(await page.evaluate(()=>dirty.has('item-form')),false);
 const first=await page.evaluate(()=>window.testSearches[0][0]);
 const emit=async(items)=>page.evaluate(items=>window.dispatchEvent(new CustomEvent('cartwise:auto-results',{detail:{source:'digikala-automatic',location:'ارسال به ونک',coordinates:'35.7|51.4',shipment_type:'on_demand',items}})),items);
 await emit([{id:first.id,products:[{title:'دستمال کاغذی 200 برگ دولا بسته 10 عددی',store_name:'الف',store_id:'a',store_type:'supermarket',regular_price:100000,promo_price:80000,amazing:false}]}]);
 await page.waitForFunction(()=>document.querySelector('.product-result')?.textContent.includes('برگ دولا'));assert.match(await page.locator('[data-selected-product]').innerText(),/۲/);assert.match(await page.locator('.product-result .unit-price').innerText(),/۴ تومان/);
 await page.locator('[data-tab=list]').click();await page.locator('#item-form [name=name]').fill('تن ماهی');await page.locator('#item-form [name=quantity]').fill('0');await page.locator('#search-new').click();assert.equal(await page.evaluate(()=>window.testSearches.length),1);assert.equal(await page.evaluate(()=>busy),false);
 await page.locator('#item-form [name=quantity]').fill('1');await page.locator('#search-new').click();assert.equal(await page.evaluate(()=>window.testSearches.length),2);assert.equal(await page.evaluate(()=>window.testSearches[1].length),1);
 const second=await page.evaluate(()=>window.testSearches[1][0]);await emit([{id:second.id,products:[{title:'تن ماهی 180 گرمی بسته 3 عددی',store_name:'الف',store_id:'a',store_type:'supermarket',regular_price:120000,promo_price:90000,amazing:false}]}]);await page.waitForFunction(()=>document.querySelectorAll('.product-result').length===2);assert.match(await page.locator('.product-result').nth(1).innerText(),/۰٫۵۴ کیلوگرم/);
 // Android-host flow, same HTML/JS: ordinary discounts repeat and a supermarket's
 // two amazing packages are shared across all three lines.
 await page.evaluate(()=>{state.items=[0,1,2].map(n=>({id:'i'+n,name:'کالا'+n,quantity:1}));dirty.clear();clearForm('item-form');save();});await page.locator('#optimize').click();
 await emit([0,1,2].map(n=>({id:'i'+n,products:[{title:'کالا'+n,store_name:'الف',store_id:'a',store_type:'supermarket',regular_price:1500,promo_price:100+n*10,amazing:true,post_amazing_price:1000,post_amazing_verified:true}]})));
 await page.waitForFunction(()=>document.querySelectorAll('.product-result').length===3);assert.match(await page.locator('.basket-summary .summary-price strong').innerText(),/۱۲۱/);assert.match(await page.locator('.store-basket').innerText(),/شگفت‌انگیز: ۲ از ۲/);assert.match(await page.locator('.product-result').first().innerText(),/پس از سهمیه/);
 // Actual catalogue adapter + DOM integration: three tiers from public data are
 // accepted only when the store and displayed price agree. No cart interaction.
 const ctx=await browser.newContext(),retailer=await ctx.newPage();retailer.on('pageerror',e=>errors.push(e.message));
 const init=fs.readFileSync('cartoptimizer/web/retail-types.js','utf8')+fs.readFileSync('cartoptimizer/web/jet-catalog.js','utf8');await retailer.addInitScript(init);
 const html='<div id="root"><article data-store-name="الف" data-store-id="a"><img alt="تن ماهی 180 گرم" style="width:60px;height:60px"><div><p>80</p><img src="/i/toman.svg"></div><p class="line-through">150</p><p>شگفت‌انگیز</p><button data-cro-id="add-one-more-to-cart" onclick="throw Error(\'must never buy\')">+</button></article></div><script>CartwiseCatalog.ingest({shop:{id:"a",title:"الف",business:"supermarket"},result:[{id:"p",title:"تن ماهی 180 گرم",price:{price:1500,discount:300},product_first:{aggregated_price:800},badges:{is_amazing:true}}]});</script>';
 await ctx.route('https://www.digikalajet.com/**',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html; charset=utf-8',body:html}):r.fulfill({status:404,body:''}));await retailer.goto('https://www.digikalajet.com/search/shop?shopId=a');const data=await retailer.evaluate(`(${fs.readFileSync('cartoptimizer/web/jet-dom.js','utf8')})({store_name:'الف',expected_shop_id:'a'})`);assert.equal(data.products[0].post_amazing_price,1200);assert.equal(data.products[0].promo_price,800);assert.equal(data.products[0].regular_price,1500);assert.equal(data.products[0].post_amazing_verified,true);
 assert.deepEqual(errors,[]);await browser.close();console.log('Draft recovery, unsaved new goods, invalid drafts, tissue/multipack UI and three-tier catalogue/amazing quota integration passed');
})().catch(e=>{console.error(e);process.exit(1)});
