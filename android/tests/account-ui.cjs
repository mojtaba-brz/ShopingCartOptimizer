const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.calls=[];const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));window.CartwiseAndroid={openDigikala:()=>{},findAutomatically:()=>{},savedDelivery:()=>JSON.stringify({location:'ارسال به ونک',coordinates:'35.75|51.4',shipment_type:'on_demand'}),accountStatus:()=>JSON.stringify({status:'disconnected'}),connectAccount:()=>calls.push('connect'),disconnectAccount:()=>emit('cartwise:account',{status:'disconnected'}),readAccountCart:()=>calls.push('read')};});
 await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>Boolean(window.CartwiseAccount));
 const connect=page.locator('[data-connect-account]'),read=page.locator('[data-read-account]'),logout=page.locator('[data-disconnect-account]');assert.equal(await read.isDisabled(),true);
 await page.evaluate(()=>document.querySelector('#jet-account').scrollIntoView());await page.evaluate(()=>document.querySelector('[data-connect-account]').click());
 assert.equal(await page.evaluate(()=>CartwiseAccount.busy),true);assert.equal(await connect.isDisabled(),true);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cartwise:account',{detail:{status:'saved'}})));assert.equal(await read.isDisabled(),false);assert.equal(await page.evaluate(()=>CartwiseAccount.busy),false);
 const q={source:'digikala-visible-checkout',page_url:'https://www.digikalajet.com/checkout/cart',page_kind:'cart',captured_at:new Date().toISOString(),fields:{total:{value:20000}},delivery_verified:true,cart_items:[{title:'شیر',quantity:1}],reported_units:1,items_complete:true};
 await page.evaluate(q=>window.dispatchEvent(new CustomEvent('cartwise:account-cart',{detail:{account_status:'saved',location:'ارسال به ونک',coordinates:'35.75|51.4',shipment_type:'on_demand',checkout:q}})),q);
 assert.equal(await page.evaluate(()=>!!CartwiseAccount.quoteFor({coordinates:'35.75|51.4',shipment_type:'on_demand'})),true);assert.equal(await page.evaluate(()=>CartwiseAccount.quoteFor({coordinates:'35.76|51.4',shipment_type:'on_demand'})),null);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cartwise:account',{detail:{status:'login_required'}})));assert.equal(await read.isDisabled(),true);assert.equal(await page.evaluate(()=>CartwiseAccount.quoteFor({coordinates:'35.75|51.4',shipment_type:'on_demand'})),null);
 await page.evaluate(()=>document.querySelector('[data-disconnect-account]').click());assert.equal(await logout.isHidden(),true);assert.deepEqual(errors,[]);await browser.close();console.log('Optional account controls, busy guard, context-bound quote, expiry and disconnect passed');
})().catch(e=>{console.error(e);process.exit(1)});
