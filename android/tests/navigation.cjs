const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const location={protocol:'https:',hostname:'www.digikalajet.com',href:'https://www.digikalajet.com/user/add-address'},events=[];
const history={state:{idx:3},pushState(state,unused,path){this.state=state;location.href='https://www.digikalajet.com'+path;}};
const nav=vm.runInNewContext(fs.readFileSync('cartoptimizer/web/jet-navigation.js','utf8'),{URL,location,history,document:{getElementById:()=>({})},window:{dispatchEvent:e=>events.push(e)},PopStateEvent:function(type,{state}){this.type=type;this.state=state;}});
assert.equal(nav('https://www.digikalajet.com/search/v2/result?q=milk'),true);assert.equal(history.state.idx,4);assert.equal(events.length,1);assert.equal(events[0].state,history.state);
assert.equal(nav('https://www.digikalajet.com/user/add-address?MID=add-address-map'),false);assert.equal(nav('https://evil.example/search/v2/result'),false);assert.equal(events.length,1);
assert.equal(nav('https://www.digikalajet.com/checkout/cart/'),true);assert.equal(history.state.idx,5);
console.log('Shared routes retain router history, allow read-only basket navigation and reject synthetic map modals/other origins');
