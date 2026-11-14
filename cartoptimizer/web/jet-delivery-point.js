/* Delivery input for the automated Jet guest session, not a GPS sensor reading.
 * Only a previously chosen/verified point is supplied. Manual map mode starts
 * a fresh document without this provider and uses normal device permissions. */
(function(coordinates){
 'use strict';
 if(location.protocol!=='https:'||!['www.digikalajet.com','digikalajet.com'].includes(location.hostname)||!navigator.geolocation)return false;
 const xy=String(coordinates||'').split('|');if(xy.length!==2||xy.some(x=>!x.trim()||!Number.isFinite(Number(x))))return false;
 const [latitude,longitude]=xy.map(Number);if(Math.abs(latitude)>90||Math.abs(longitude)>180)return false;
 const position=()=>({coords:{latitude,longitude,accuracy:0,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()});
 const getCurrentPosition=success=>{if(typeof success!=='function')throw new TypeError('A position callback is required');Promise.resolve().then(()=>success(position()));};
 const watches=new Set();let sequence=0;
 try{
  Object.defineProperty(navigator.geolocation,'getCurrentPosition',{value:getCurrentPosition,configurable:true,writable:true});
  Object.defineProperty(navigator.geolocation,'watchPosition',{value:success=>{if(typeof success!=='function')throw new TypeError('A position callback is required');const id=++sequence;watches.add(id);Promise.resolve().then(()=>{if(watches.has(id))success(position());});return id;},configurable:true,writable:true});
  Object.defineProperty(navigator.geolocation,'clearWatch',{value:id=>watches.delete(id),configurable:true,writable:true});
  // The isolated context supplies a delivery input, so its location capability
  // is available even when physical GPS is denied. OS/WebView permission grants
  // are not changed or remembered; unrelated permission queries are delegated.
  if(navigator.permissions?.query){const query=navigator.permissions.query.bind(navigator.permissions);const status=new EventTarget();Object.defineProperties(status,{state:{value:'granted'},name:{value:'geolocation'},onchange:{value:null,writable:true}});Object.defineProperty(navigator.permissions,'query',{value:descriptor=>descriptor?.name==='geolocation'?Promise.resolve(status):query(descriptor),configurable:true,writable:true});}
  return true;
 }catch{return false;}
})
