/* Only the address preference schema observed in Jet's public x-app bundle.
 * Never exports the persisted root, user/account fields, cookies or credentials.
 * Restoration changes address preferences only; no API, new address or cart write. */
(function(command,saved){
 'use strict';
 saved=saved||{};
 if(location.protocol!=='https:'||!['www.digikalajet.com','digikalajet.com'].includes(location.hostname))return {state:'wrong-origin'};
 const key='persist:DKNow',valid=(lat,lon)=>typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 function root(){const raw=localStorage.getItem(key);if(raw&&raw.length>2000000)throw Error('Preference too large');return raw?JSON.parse(raw):{};}
 function address(all){return typeof all.address==='string'?JSON.parse(all.address):{};}
 function listen(){if(!document.documentElement){document.addEventListener('DOMContentLoaded',listen,{once:true});return;}if(document.documentElement.dataset.cartwiseLocationListener)return;document.documentElement.dataset.cartwiseLocationListener='1';document.addEventListener('click',e=>{if(!e.isTrusted)return;const b=e.target.closest('button');if(b&&/^(?:تایید|تأیید|ثبت) (?:موقعیت مکانی|موقعیت|آدرس)/.test((b.innerText||'').trim()))document.documentElement.dataset.cartwiseLocationIntent=String(Date.now());},true);}
 try{
  listen();
  if(command==='read'){
   const a=address(root()),p=a.defaultAddress||{},lat=p.addressLatitude,lon=p.addressLongitude;
   return {coordinates:valid(lat,lon)?lat+'|'+lon:'',user_event:!!document.documentElement.dataset.cartwiseLocationIntent,preference_present:valid(lat,lon),restored:document.documentElement.dataset.cartwiseLocationRestored==='1'};
  }
  if(command!=='restore')return {state:'listening'};
  const rawParts=String(saved.coordinates||'').split('|'),parts=rawParts.map(Number);if(rawParts.some(p=>!p.trim())||parts.length!==2||!valid(parts[0],parts[1])||!saved.location)return {state:'missing-coordinates'};
  const all=root(),a=address(all),p=a.defaultAddress||{};
  const same=p.addressLatitude===parts[0]&&p.addressLongitude===parts[1]&&a.isLocationMode===true;
  if(!same){const label=String(saved.location).replace(/^ارسال به\s*/,'').slice(0,300),point={addressLatitude:parts[0],addressLongitude:parts[1],addressAddress:label,addressName:label,addressTitle:label};
   a.defaultAddress=point;a.approxAddress={addressLatitude:parts[0],addressLongitude:parts[1],addressAddress:label};a.isLocationMode=true;a.isUsingDefaultLocation=false;a.isAddressListInitCompleted=false;
   all.address=JSON.stringify(a);localStorage.setItem(key,JSON.stringify(all));
   // First-load cache depends on the old area and must be revalidated by Jet.
   localStorage.removeItem('jet:first-load');
  }
  sessionStorage.setItem('jet:is-address-selected','1');
  const attrs='; Path=/; Max-Age=31536000; SameSite=Lax; Secure';
  document.cookie='latitude='+parts[0]+attrs;document.cookie='longitude='+parts[1]+attrs;document.cookie='locationMode=true'+attrs;
  if(document.documentElement)document.documentElement.dataset.cartwiseLocationRestored='1';else document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.cartwiseLocationRestored='1';},{once:true});
  return {state:same?'already-set':'restored',changed:!same};
 }catch{return {state:'unreadable-preference'};}
})
