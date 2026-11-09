const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 let location={};
 const products=Array.from({length:12},(_,i)=>({title:`شیر کم چرب ۱ لیتر شماره ${i}`,regular_price:100000+i*10000,promo_price:null,store_name:'فروشگاه ونک',store_id:'1',image_url:'',amazing:false,regular_verified:true,url:'https://www.digikalajet.com/search/shop?shopId=1',stock:1,promo_limit:0}));
 await page.route('**/api/live/**',route=>{const req=route.request(),path=new URL(req.url()).pathname,body=req.postDataJSON();let data;
  if(path.endsWith('/location')&&req.method()==='GET')data=location;
  else if(path.endsWith('/addresses'))data=[{title:'ونک',address:'تهران، ونک',latitude:35.75,longitude:51.4}];
  else if(path.endsWith('/location'))data=location={location:'ارسال به تهران، ونک',shipment_type:'on_demand'};
  else if(path.endsWith('/search')){requests.push(body);data={id:'fixture'};}
  else if(path.endsWith('/status'))data={state:'done',completed:1,total:1,detail:'آماده',products:12,stores:1,result:{source:'digikala-automatic',...location,items:[{id:requests[0].items[0].id,products}],checkout_quotes:[]}};
  else data={};return route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>document.body.classList.contains('automatic'));
 assert.equal(await page.evaluate(()=>Boolean(window.CartwiseAndroid)),false,'Desktop must use its own provider');
 await page.evaluate(()=>{state=initialState();state.items=[{id:'milk',name:'شیر کم چرب ۱ لیتر',quantity:1}];dirty.clear();save();});
 await page.locator('#optimize').click();await page.getByRole('dialog',{name:'انتخاب موقعیت تحویل'}).waitFor();
 await page.getByRole('searchbox',{name:'جست‌وجوی نشانی'}).fill('تهران ونک');await page.getByRole('button',{name:'جست‌وجوی نشانی',exact:true}).click();
 await page.getByRole('button',{name:'ونک — تهران، ونک',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.product-result').length===1);
 assert.equal(requests.length,1);assert.equal(requests[0].items[0].name,'شیر کم چرب ۱ لیتر');assert.ok(!('offers' in requests[0]));
 assert.match(await page.locator('#results').innerText(),/فروشگاه ونک/);assert.match(await page.locator('#results').innerText(),/۱۲ نتیجه/);
 await page.locator('[data-change-item]').click();assert.equal(await page.locator('.offer-option').count(),12);
 assert.ok(!(await page.locator('body').innerText()).includes('ابتدا لیست و گزینه‌های تأییدشده'));
 assert.deepEqual(errors,[]);await browser.close();console.log('Desktop list + location starts automatic search without reviewed offers; shared results include all 12 options');
})().catch(e=>{console.error(e);process.exit(1)});
