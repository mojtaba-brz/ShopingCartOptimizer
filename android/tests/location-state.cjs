// Location regressions independent of a retailer button label or address header.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('cartoptimizer/web/jet-location.js','utf8');
function page(address){
 const data=new Map([['persist:DKNow',JSON.stringify({user:'{"token":"DO_NOT_COPY"}',address:JSON.stringify(address)})]]);
 const document={documentElement:{dataset:{}},addEventListener(){},querySelectorAll(){return []},cookie:''};
 const localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},sessionStorage={getItem:()=>null,setItem(){}};
 const fn=vm.runInNewContext(source,{document,localStorage,sessionStorage,location:{protocol:'https:',hostname:'www.digikalajet.com',pathname:'/search/v2/result',search:''},getComputedStyle:()=>({visibility:'visible'})});
 return {run:(cmd,saved={})=>fn(cmd,saved),data,document};
}
let p=page({isLocationMode:true,isUsingDefaultLocation:false,defaultAddress:{addressLatitude:35.75,addressLongitude:51.4,addressAddress:'تهران، میدان ونک'}}),s=p.run('read');
assert.equal(s.configured,true,'A registered guest address must be detected without any header or click event');
assert.equal(s.location,'ارسال به تهران، میدان ونک');assert.equal(s.coordinates,'35.75|51.4');assert.ok(!JSON.stringify(s).includes('DO_NOT_COPY'));
const before=p.data.get('persist:DKNow');assert.equal(p.run('restore',{location:'ارسال به آدرس قدیمی',coordinates:'36|52'}).state,'service-set');assert.equal(p.data.get('persist:DKNow'),before,'Restoration must not overwrite the newly selected retailer address');
p=page({isLocationMode:false,isUsingDefaultLocation:false,defaultAddress:{addressId:123,addressLatitude:'35.75',addressLongitude:'51.4',addressAddress:'ونک'}});s=p.run('read');assert.equal(s.configured,true);assert.equal(s.coordinates,'35.75|51.4');assert.ok(!('addressId' in s));
p=page({isLocationMode:true,isUsingDefaultLocation:false,defaultAddress:{addressLatitude:35.780833,addressLongitude:51.464139,addressName:'خ. کلاهدوز، تقاطع خ. اختیاریه جنوبی'}});assert.equal(p.run('read').configured,false,'Jet auto guest default is not a user-selected address');
for(const bad of ['',null,'NaN','0x23',Infinity,91]){p=page({isLocationMode:true,defaultAddress:{addressLatitude:bad,addressLongitude:51.4,addressAddress:'ونک'}});assert.equal(p.run('read').configured,false,String(bad));}
p=page({isLocationMode:false,defaultAddress:{addressId:123,addressLatitude:35.75,addressLongitude:51.4,addressAddress:'ونک',addressIsCoordinatesValid:false}});assert.equal(p.run('read').configured,false);assert.equal(p.run('read').coordinates,'');assert.equal(p.run('read').has_address_record,true);
const invalidBefore=p.data.get('persist:DKNow');assert.equal(p.run('restore',{location:'ارسال به آدرس قدیمی',coordinates:'36|52'}).state,'invalid-address');assert.equal(p.data.get('persist:DKNow'),invalidBefore,'An invalid new service address must not be replaced by an old app bookmark');
console.log('Registered guest/account addresses without header/events, string coordinates, default rejection and preservation of new selections passed');
