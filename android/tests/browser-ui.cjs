// Run against the local server. Product pages are deterministic DOM fixtures, not live quotes.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:1});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.CartwiseAndroid={findAutomatically:()=>{},readCheckout:()=>{},savedDelivery:()=>JSON.stringify({location:'ارسال به تهران، انقلاب',shipment_type:'scheduled'}),openDigikala:()=>{},saveJSON:()=>{}};});
 await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>window.CartwiseAppearance&&document.querySelector('#live-card'));
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert.match(await page.locator('#live-location').innerText(),/انقلاب/);
 await page.evaluate(()=>{localStorage.clear();state=initialState();state.items=[{id:'milk',name:'شیر کم چرب ۲ لیتر',quantity:1},{id:'rice',name:'برنج ایرانی ۱ کیلوگرم',quantity:1}];save();});
 fs.mkdirSync('/tmp/cartwise-ui',{recursive:true});
 for(const theme of ['simple','modern','traditional']){
  await page.evaluate(t=>CartwiseAppearance.setTheme(t),theme);await page.screenshot({path:'/tmp/cartwise-ui/'+theme+'.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
 }
 await page.reload();await page.waitForFunction(()=>window.CartwiseAppearance&&document.querySelectorAll('.item-row').length===2);assert.equal(await page.locator('html').getAttribute('data-theme'),'traditional');
 await page.click('[data-tab=settings]');assert.ok(await page.locator('#tab-settings').isVisible());
 await page.click('[data-tab=list]');await page.click('#optimize');
 const quote={source:'digikala-visible-checkout',captured_at:new Date().toISOString(),page_kind:'cart',page_url:'https://www.digikala.com/supermarket/cart/',fields:{delivery_fee:{value:250000,evidence:'هزینه ارسال ۲۵۰۰۰ تومان'},total:{value:1050000,evidence:'مبلغ قابل پرداخت ۱۰۵۰۰۰ تومان'}},notices:['قیمت کالا تغییر کرده است'],cart_items:[{title:'شیر کم چرب ۱ لیتر',quantity:2},{title:'برنج ایرانی ۱ کیلوگرم',quantity:1}],reported_units:3,items_complete:true};
 await page.evaluate(q=>window.dispatchEvent(new CustomEvent('cartwise:auto-results',{detail:{source:'digikala-automatic',location:'ارسال به تهران، انقلاب',shipment_type:'scheduled',checkout_quotes:[q],items:[{id:'milk',products:[{title:'شیر کم چرب ۱ لیتر',regular_price:100000,promo_price:null}]},{id:'rice',products:[{title:'برنج ایرانی ۱ کیلوگرم',regular_price:600000,promo_price:null}]}]}})),quote);
 await page.waitForFunction(()=>document.querySelector('#results')?.textContent.includes('مبلغ سبد مطابق'));
 assert.match(await page.locator('#results').innerText(),/۱۰۵٬۰۰۰/);assert.match(await page.locator('#results').innerText(),/قیمت کالا تغییر/);
 await page.screenshot({path:'/tmp/cartwise-ui/results.png'});
 await page.evaluate(()=>CartwiseLive.rememberAutomatic({location:'ارسال به ونک',shipment_type:'scheduled',captured_at:new Date().toISOString()}));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#live-location')?.textContent.includes('ونک'));
 // Exercise the actual retailer reader against representative visible DOM.
 await context.route('https://www.digikala.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<p>تعداد کالاها ۲</p><div><p>هزینه ارسال</p><span>۲۵٬۰۰۰ تومان</span></div><p>هزینه خدمات ۱۰۰۰ تومان</p><p>مبلغ قابل پرداخت ۱۳۶٬۰۰۰ تومان</p><p>قیمت کالا تغییر کرده است</p><div><img alt="شیر کم چرب"><span data-testid="cart-item-quantity">2</span></div>`}));
 const retailer=await context.newPage();await retailer.goto('https://www.digikala.com/supermarket/cart/');
 const capture=await retailer.evaluate(fs.readFileSync('cartoptimizer/web/digikala-checkout.js','utf8'));
 assert.equal(capture.fields.delivery_fee?.value,250000,JSON.stringify(capture));assert.equal(capture.cart_items[0].quantity,2);assert.equal(capture.items_complete,true);
 assert.deepEqual(errors,[]);await browser.close();console.log('Persian mobile UI, three persistent themes, saved address, checkout reading and matching passed');
})().catch(e=>{console.error(e);process.exit(1)});
