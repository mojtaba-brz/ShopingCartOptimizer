/* Only Jet's address preference is exported. No account fields, identifiers,
 * credentials or cookies are read/exported. A visible header/click event is not
 * required: guest map selections have addressAddress but often no addressName.
 * Restore a prior choice only when Jet has no configured address of its own. */
(function(command,saved){
 'use strict';saved=saved||{};
 if(location.protocol!=='https:'||!['www.digikalajet.com','digikalajet.com'].includes(location.hostname))return {state:'wrong-origin'};
 const key='persist:DKNow';
 const norm=s=>String(s||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ue000-\uf8ff]/g,'').trim();
 const clean=s=>{if(typeof s!=='string')return '';s=norm(s).replace(/^ارسال\s*به\s*/,'').trim();return s&&s.length<=300&&!/^(?:آدرس انتخابی|انتخاب آدرس|انتخاب موقعیت|آدرس تحویل|موقعیت انتخابی)$/.test(s)?'ارسال به '+s:'';};
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const text=e=>norm(e?.innerText||'');
 function number(n){if(typeof n==='number')return Number.isFinite(n)?n:null;if(typeof n==='string'&&/^-?\d+(?:\.\d+)?$/.test(n.trim()))return Number(n);return null;}
 const valid=(lat,lon)=>lat!==null&&lon!==null&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 function root(){const raw=localStorage.getItem(key);if(raw&&raw.length>2000000)throw Error('Preference too large');const value=raw?JSON.parse(raw):{};if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid preference');return value;}
 function address(all){if(all.address===undefined)return {};const a=typeof all.address==='string'?JSON.parse(all.address):all.address;if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Invalid address preference');return a;}
 function controls(){
  const captions=[...document.querySelectorAll('p,h1,h2,h3,button')].filter(visible).map(text);
  const map=captions.includes('انتخاب از روی نقشه'),picker=captions.includes('انتخاب آدرس تحویل');
  const form=[...document.querySelectorAll('input[placeholder]')].some(e=>visible(e)&&/جستجوی? آدرس|جست.?جوی? آدرس، محله|محله یا خیابان/.test(norm(e.getAttribute('placeholder'))));
  let header='';for(const p of document.querySelectorAll('header p,#root p'))if(visible(p)&&/^ارسال\s*به/.test(text(p))){header=clean(text(p));if(!header&&/^ارسال\s*به$/.test(text(p)))header=clean(text(p.nextElementSibling));if(header)break;}
  return {header,editing:map||picker||form,map_open:map,picker_open:picker,form_open:form};
 }
 function selected(a,ui){
  const p=a.defaultAddress||{},lat=number(p.addressLatitude),lon=number(p.addressLongitude),ok=valid(lat,lon)&&p.addressIsCoordinatesValid!==false;
  const label=clean(p.addressAddress)||clean(p.addressName)||clean(p.addressTitle)||ui.header;
  const id=p.addressId,account=typeof id==='number'?Number.isSafeInteger(id)&&id>0:typeof id==='string'&&/^\d+$/.test(id)&&Number(id)>0;
  // Jet's automatic guest fallback has only name/title + coordinates. It is
  // not a user selection. A committed map address has addressAddress instead.
  const configured=ok&&!!label&&a.isUsingDefaultLocation!==true&&(!!clean(p.addressAddress)||account||norm(p.addressName)==='اطراف من');
  return {coordinates:ok?lat+'|'+lon:'',label,configured,account_address:account,preference_present:ok};
 }
 let ui=controls();
 try{
  const all=root(),a=address(all),p=selected(a,ui);
  if(command==='read')return {...ui,...p,state:'ok',location:p.configured?p.label:ui.header,restored:document.documentElement?.dataset.cartwiseLocationRestored==='1'};
  if(command!=='restore')return {state:'listening'};
  if(p.configured)return {state:'service-set',changed:false};
  const parts=String(saved.coordinates||'').split('|').map(number);if(parts.length!==2||!valid(parts[0],parts[1])||!clean(saved.location))return {state:'missing-coordinates'};
  // Read an alternate address representation, but never guess its write schema.
  if(all.address!==undefined&&typeof all.address!=='string')return {state:'unreadable-preference'};
  const label=clean(saved.location).replace(/^ارسال به\s*/,''),point={addressLatitude:parts[0],addressLongitude:parts[1],addressAddress:label,addressName:label,addressTitle:label};
  if(!Array.isArray(a.addressList))a.addressList=[];a.defaultAddress=point;a.approxAddress={addressLatitude:parts[0],addressLongitude:parts[1],addressAddress:label};a.isLocationMode=true;a.isUsingDefaultLocation=false;a.isAddressListInitCompleted=false;
  all.address=JSON.stringify(a);localStorage.setItem(key,JSON.stringify(all));localStorage.removeItem('jet:first-load');sessionStorage.setItem('jet:is-address-selected','1');
  const attrs='; Path=/; Max-Age=31536000; SameSite=Lax; Secure';document.cookie='latitude='+parts[0]+attrs;document.cookie='longitude='+parts[1]+attrs;document.cookie='locationMode=true'+attrs;
  const mark=()=>{if(document.documentElement)document.documentElement.dataset.cartwiseLocationRestored='1';};if(document.documentElement)mark();else document.addEventListener('DOMContentLoaded',mark,{once:true});
  return {state:'restored',changed:true};
 }catch{return {...ui,state:'unreadable-preference',configured:false,coordinates:'',location:ui.header};}
})
