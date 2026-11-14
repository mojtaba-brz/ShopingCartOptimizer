const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const geo={getCurrentPosition:()=>{throw Error('Physical GPS must not be read by automated delivery search');}},location={protocol:'https:',hostname:'www.digikalajet.com'};
 let delegated=0;const permissions={query:async()=>{delegated++;return {state:'denied'};}};
 const configure=vm.runInNewContext(fs.readFileSync('cartoptimizer/web/jet-delivery-point.js','utf8'),{location,navigator:{geolocation:geo,permissions},EventTarget});
 assert.equal(configure('35.75|51.4'),true);const p=await new Promise(resolve=>geo.getCurrentPosition(resolve));assert.equal(p.coords.latitude,35.75);assert.equal(p.coords.longitude,51.4);
 assert.equal((await permissions.query({name:'geolocation'})).state,'granted');assert.equal(delegated,0);assert.equal((await permissions.query({name:'camera'})).state,'denied');assert.equal(delegated,1);
 let watched=false;const watch=geo.watchPosition(()=>{watched=true;});geo.clearWatch(watch);await Promise.resolve();assert.equal(watched,false);
 const selected=geo.getCurrentPosition;location.hostname='evil.example';assert.equal(configure('36|52'),false);assert.equal(geo.getCurrentPosition,selected);location.hostname='www.digikalajet.com';assert.equal(configure('|'),false);assert.equal(configure('91|51'),false);
 console.log('Automated guest context uses the selected delivery point without reading GPS; other origins and invalid points are rejected');
})().catch(e=>{console.error(e);process.exit(1)});
