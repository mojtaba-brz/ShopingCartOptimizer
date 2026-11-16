// Virtual time reproduces a debounced catalogue request that outlives the old
// empty-page timeout, and verifies bounded retries without a real retailer.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('cartoptimizer/web/jet-search-task.js','utf8');
async function run(mode){
 let now=0,timers=[],requests=0,products=[],routes=[],root;
 const schedule=(fn,ms)=>{timers.push({at:now+ms,fn});};
 const location={href:'https://www.digikalajet.com/user/add-address',pathname:'/user/add-address',search:'',origin:'https://www.digikalajet.com'};
 const product={title:'شیر 1 لیتر',store_name:'فروشگاه',store_id:'a',regular_price:100,promo_price:null};
 class XHR{send(){}addEventListener(){}}
 root={URL,URLSearchParams,Promise,Date:class extends Date{static now(){return now;}},setTimeout:schedule,XMLHttpRequest:XHR,location,document:{querySelector:()=>({}),querySelectorAll:()=>[],scrollingElement:null,body:{innerText:mode==='challenge'?'captcha':''}},getComputedStyle:()=>({}),fetch:()=>new Promise(resolve=>schedule(()=>{products=mode==='slow'||mode==='recover'&&requests===2?[product]:[];resolve({});},mode==='slow'?9000:500))};
 root.CartwiseSearchAdapters={preference:()=>({configured:true,coordinates:mode==='location'?'36|52':'35|51'}),reader:()=>({products,shops:[],error:mode==='challenge'?'challenge':null}),checkout:()=>null,fees:()=>({}),navigation:url=>{routes.push(url);Object.assign(location,{href:url,pathname:new URL(url).pathname,search:new URL(url).search});products=[];if(location.pathname==='/search/v2/result'){requests++;schedule(()=>root.fetch('/fixture'),1000);}return true;}};
 vm.runInNewContext(source,root);root.CartwiseSearchTask.start({url:'https://www.digikalajet.com/search/v2/result?q=milk',kind:'global',query:'milk',coordinates:'35|51',seconds:30});if(mode==='cancel')schedule(()=>root.cartwiseTask.cancelled=true,1600);
 for(let n=0;!root.cartwiseTask.done&&n<1000;n++){timers.sort((a,b)=>a.at-b.at);const timer=timers.shift();assert.ok(timer,'Task must make bounded progress');now=timer.at;timer.fn();await new Promise(setImmediate);}
 assert.ok(root.cartwiseTask.done);assert.ok(now<=31000);return {...root.cartwiseTask,requests,routes,now};
}
(async()=>{
 const slow=await run('slow');assert.equal(slow.result.products.length,1);assert.equal(slow.requests,1,'A slow pending response must not be mistaken for an empty result');assert.equal(slow.result.error,null);
 const recovered=await run('recover');assert.equal(recovered.result.products.length,1);assert.equal(recovered.requests,2);assert.equal(recovered.result.error,null,'A recovered empty-page warning must disappear');assert.equal(recovered.routes.filter(u=>new URL(u).pathname==='/user/add-address').length,1,'Same-URL retry must re-enter the route');
 const empty=await run('empty');assert.equal(empty.requests,2);assert.equal(empty.result.products.length,0);assert.ok(empty.result.error);
 for(const mode of ['challenge','location']){const blocked=await run(mode);assert.ok(blocked.fatal);assert.equal(blocked.requests,1,'Location or human checks must stop, not retry');}
 const cancelled=await run('cancel');assert.equal(cancelled.requests,1);assert.ok(!cancelled.fatal);
 console.log('Delayed catalogue response, one fresh empty-result retry, recovered warning cleanup, deadline, cancellation and fatal address/challenge guards passed');
})().catch(e=>{console.error(e);process.exit(1)});
