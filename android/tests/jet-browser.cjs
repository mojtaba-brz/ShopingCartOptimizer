const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const reader=fs.readFileSync('cartoptimizer/web/jet-dom.js','utf8'),pref=fs.readFileSync('cartoptimizer/web/jet-location.js','utf8');
 let html=fs.readFileSync('android/app/src/androidTest/assets/jet-search.html','utf8');
 await context.route('https://www.digikalajet.com/**',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html; charset=utf-8',body:html}):r.fulfill({status:404,body:''}));
 await context.route('https://dkstatics-public.digikala.com/**',r=>r.fulfill({status:404,body:''}));
 await page.goto('https://www.digikalajet.com/search/v2/result?q=%D8%B4%DB%8C%D8%B1');
 let data=await page.evaluate(`(${reader})({})`);assert.equal(data.products.length,4);assert.deepEqual(data.shops.map(x=>x.name),['فروشگاه الف','فروشگاه ب']);assert.deepEqual(data.products.map(x=>x.store_name),['فروشگاه الف','فروشگاه الف','فروشگاه ب','فروشگاه ب']);
 await page.getByRole('button',{name:'مشاهده همه',exact:true}).nth(1).click();
 assert.match(page.url(),/\/search\/shop\?q=.*&shopId=b/);
 data=await page.evaluate(`(${reader})({store_name:'فروشگاه ب',expected_shop_id:'b'})`);assert.equal(data.products.length,12);assert.equal(data.products[11].regular_price,200);assert.equal(data.products[11].store_name,'فروشگاه ب');assert.equal(data.products[11].store_id,'b');
 assert.ok((await page.evaluate(`(${reader})({store_name:'wrong',expected_shop_id:'a'})`)).products.every(p=>p.store_name===''));
 const originalUser=JSON.stringify({token:'NEVER_EXPORT_ACCOUNT_STATE',phone:'NEVER_EXPORT_PHONE'});
 await page.evaluate(user=>{localStorage.setItem('persist:DKNow',JSON.stringify({user,address:JSON.stringify({defaultAddress:{addressLatitude:36,addressLongitude:52},addressList:[]})}));localStorage.setItem('jet:first-load','old-public-area-cache');},originalUser);
 const saved={location:'ارسال به ونک',coordinates:'35.7|51.4'};
 let state=await page.evaluate(`(${pref})('restore',${JSON.stringify(saved)})`);assert.equal(state.state,'restored');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('persist:DKNow')).user),originalUser);
 assert.equal(await page.evaluate(()=>localStorage.getItem('jet:first-load')),null);
 state=await page.evaluate(`(${pref})('read',{})`);assert.equal(state.coordinates,'35.7|51.4');assert.ok(!JSON.stringify(state).includes('NEVER_EXPORT'));
 assert.equal((await page.evaluate(`(${pref})('restore',${JSON.stringify(saved)})`)).changed,false);
 assert.equal((await page.evaluate(`(${pref})('restore',{location:'x',coordinates:'|'})`)).state,'service-set','An existing Jet choice takes precedence even over an invalid old bookmark');
 await page.evaluate(()=>localStorage.setItem('persist:DKNow',JSON.stringify({address:JSON.stringify({defaultAddress:{}})})));assert.equal((await page.evaluate(`(${pref})('restore',{location:'x',coordinates:'|'})`)).state,'missing-coordinates');
 await page.evaluate(()=>localStorage.setItem('persist:DKNow','broken-json'));assert.equal((await page.evaluate(`(${pref})('restore',${JSON.stringify(saved)})`)).state,'unreadable-preference');assert.equal(await page.evaluate(()=>localStorage.getItem('persist:DKNow')),'broken-json');
 await page.evaluate(()=>localStorage.removeItem('persist:DKNow'));
 // Document-start restoration must work before documentElement exists and before
 // the retailer initializes its own persisted address state.
 await page.addInitScript(`(${pref})('restore',${JSON.stringify(saved)})`);
 html=`<div id="root"><p id="address"></p></div><script>const point=JSON.parse(JSON.parse(localStorage.getItem('persist:DKNow')).address).defaultAddress;document.getElementById('address').textContent='ارسال به '+point.addressAddress;</script>`;
 await page.goto('https://www.digikalajet.com/');assert.match(await page.locator('#address').innerText(),/ونک/);assert.equal((await page.evaluate(`(${pref})('read',{})`)).coordinates,'35.7|51.4');assert.equal(await page.evaluate(()=>Array.isArray(JSON.parse(JSON.parse(localStorage.getItem('persist:DKNow')).address).addressList)),true);

 // A generic/missing header and a stale add-address URL must not hide a committed
 // guest selection; a visible picker must still block automatic completion.
 await context.clearCookies();const check=await context.newPage();
 html=`<div id="root"><p>ارسال به آدرس انتخابی</p></div><div id="modal-root"><p>انتخاب از روی نقشه</p></div>`;
 await check.goto('https://www.digikalajet.com/user/add-address');
 await check.evaluate(()=>localStorage.setItem('persist:DKNow',JSON.stringify({address:JSON.stringify({isLocationMode:true,isUsingDefaultLocation:false,defaultAddress:{addressAddress:'میدان ونک',addressLatitude:'35.75',addressLongitude:'51.4'}})})));
 let found=await check.evaluate(`(${pref})('read',{})`);assert.equal(found.configured,true);assert.equal(found.map_open,true);assert.equal(found.location,'ارسال به میدان ونک');
 await check.evaluate(()=>document.getElementById('modal-root').remove());found=await check.evaluate(`(${pref})('read',{})`);assert.equal(found.editing,false,'Stale URL alone must not block the registered address');
 // A document reload must preserve a different valid retailer selection rather
 // than writing the older address bookmarked by the app.
 await check.addInitScript(`(${pref})('restore',${JSON.stringify(saved)})`);await check.reload();
 found=await check.evaluate(`(${pref})('read',{})`);assert.equal(found.coordinates,'35.75|51.4');
 assert.deepEqual(errors,[]);await browser.close();console.log('Jet grouped merchants, view-all navigation, beyond-carousel results, scoped identity, startup preference restore and account isolation passed');
})().catch(e=>{console.error(e);process.exit(1)});
