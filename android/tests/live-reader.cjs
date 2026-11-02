// DOM contract tests for the read-only retailer adapter, no browser dependency.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../../cartoptimizer/web/digikala-capture.js'),'utf8');
function capture(rows,{host='www.digikala.com',pathname='/supermarket/search/shop',address='ارسال بهمیدان تجریش',buttons=[]}={}) {
  const node=(text='')=>({innerText:text,children:[{}],getClientRects:()=>[{}]});
  const images=rows.map(({title='شیر کم چرب',current='135,300',regular='165,000',enabled=true,hidden=false})=>{
    const image={...node(),alt:title};
    if(hidden)image.getClientRects=()=>[];
    const toman={parentElement:{querySelectorAll:()=>[node(current)]}};
    const card={querySelectorAll:()=>[image],querySelector:q=>q.includes('toman')?toman:q.includes('line-through')?node(regular):q.includes('add-one-more')&&enabled?{}:null};
    image.parentElement=card;return image;
  });
  const document={querySelectorAll:s=>s==='img[alt]'?images:s==='button'?buttons:[node(address)]};
  return vm.runInNewContext(script,{document,location:{hostname:host,protocol:'https:',pathname,origin:'https://'+host},getComputedStyle:()=>({visibility:'visible'}),Date});
}
let r=capture([{}, {title:'شیر ساده',current:'130,000',regular:''}]);
assert.equal(r.products.length,2);assert.equal(r.products[0].promo_price,1353000);assert.equal(r.products[0].regular_price,1650000);
assert.equal(r.products[0].stock,1);assert.equal(r.products[0].promo_limit,1);assert.equal(r.products[1].promo_price,null);
assert.equal(r.location,'ارسال به میدان تجریش');
r=capture([{current:'۱۳۵٬۳۰۰',regular:'۱۶۵٬۰۰۰'}]);assert.equal(r.products[0].promo_price,1353000);
assert.equal(capture([{current:'١٣٥٬٣٠٠',regular:'١٦٥٬٠٠٠'}]).products[0].promo_price,1353000);
assert.equal(capture([{},{}]).products.length,1);
for(const row of [{current:'not a price'},{regular:'broken'},{regular:'100,000'},{enabled:false},{hidden:true},{current:'99999999999999'}])assert.equal(capture([row]).products.length,0);
assert.ok(capture([]).error);assert.ok(capture([{}],{host:'digikala.com.evil.invalid'}).error);
assert.ok(capture([{}],{pathname:'/profile/'}).error);
assert.equal(capture(Array.from({length:70},(_,i)=>({title:'شیر شماره '+i}))).products.length,60);
const button=(label,active)=>({innerText:label,className:active?'bg-v3-primary-fresh-600 text-v3-achromatic-white':'bg-v2-object-transparent',getClientRects:()=>[{}],getAttribute:()=>null});
assert.equal(capture([{}],{buttons:[button('ارسال فوری',true),button('ارسال زمان‌دار',false)]}).shipment_type,'on_demand');
assert.equal(capture([{}],{buttons:[button('ارسال فوری',false),button('ارسال زمان‌دار',true)]}).shipment_type,'scheduled');
assert.equal(capture([{}],{buttons:[button('ارسال فوری',true),button('ارسال زمان‌دار',true)]}).shipment_type,null);
assert.equal(capture([{}]).shipment_type,null);
const missingHeader=capture([{}],{address:''});
assert.equal(missingHeader.products.length,1);assert.equal(missingHeader.location,'');assert.equal(missingHeader.error,null);
assert.equal(capture([{}],{pathname:'/supermarket/user/add-address'}).location_editing,true);
console.log('Live reader contract checks passed, including products without an address header');
