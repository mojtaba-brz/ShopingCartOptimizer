const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 for(const native of [false,true]){
  const page=await browser.newPage();page.on('dialog',d=>d.accept());
  if(native)await page.addInitScript(()=>window.CartwiseAndroid={saveJSON:(name,json)=>window.backupJSON=json,findAutomatically:()=>{},savedDelivery:()=> '{}',openDigikala:()=>{}});
  await page.goto('http://127.0.0.1:8765');await page.waitForSelector('#my-lists');
  await page.evaluate(()=>{localStorage.clear();state=initialState();state.items=[{id:'m',name:'شیر',quantity:2}];save();localStorage.setItem('cartwise.lists.v1',JSON.stringify([{name:'هفتگی',items:state.items},{name:'میوه',items:[{id:'g',name:'انگور',quantity:1,department:'produce'}]}]));localStorage.setItem('test-private-state','not-for-export');});
  let raw;if(native){await page.evaluate(()=>document.getElementById('export').click());raw=await page.evaluate(()=>backupJSON);}else{const downloaded=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('export').click());const d=await downloaded,stream=await d.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);raw=Buffer.concat(chunks).toString();}
  const data=JSON.parse(raw);assert.equal(data.app_backup.lists.length,2);assert.doesNotMatch(raw,/not-for-export/);
  await page.evaluate(raw=>{localStorage.removeItem('cartwise.lists.v1');state=initialState();save();window.dispatchEvent(new CustomEvent('cartwise:import',{detail:raw}));},raw);
  await page.waitForFunction(()=>state.items[0]?.name==='شیر'&&JSON.parse(localStorage.getItem('cartwise.lists.v1')||'[]').length===2);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cartwise.lists.v1'))[1].items[0].department),'produce');
  const invalid=JSON.parse(raw);invalid.app_backup.lists[0].items[0].quantity=0;
  const rejected=await page.evaluate(async value=>{try{await restoreBackup(value);return false;}catch{return true;}},invalid);assert.equal(rejected,true);assert.equal(await page.evaluate(()=>state.items[0].quantity),2);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cartwise.lists.v1'))[0].items[0].quantity),2);
  const old={...data};delete old.app_backup;await page.evaluate(async data=>restoreBackup(data),old);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cartwise.lists.v1')).length),2,'Legacy snapshot preserves existing named lists');
  await page.evaluate(()=>{window.confirm=()=>false;});await page.evaluate(async data=>restoreBackup({...data,items:[{id:'b',name:'نان',quantity:1}]}),data);assert.equal(await page.evaluate(()=>state.items[0].name),'شیر');
  await page.close();
 }
 await browser.close();console.log('Desktop/native full-list backup, private-state exclusion, invalid input, legacy import and cancelled restore passed');
})().catch(e=>{console.error(e);process.exit(1)});
