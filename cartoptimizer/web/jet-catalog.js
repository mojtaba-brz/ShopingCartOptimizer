/* Observe public catalogue merchant metadata only. No account/cart endpoints,
 * request headers, cookies, credentials or response persistence. */
(function(root){
 'use strict';if(root.CartwiseCatalog)return;
 const rows=new Map(),types=root.CartwiseTypes;
 function ingest(value){let count=0;function walk(x){if(!x||typeof x!=='object'||++count>15000)return;if(!Array.isArray(x)&&x.id!=null&&typeof x.title==='string'&&(Array.isArray(x.products)||x.delivery&&x.activity_type!=null)){
  const store_type=types.type(x.business||x.activity_description||x.activity_type),id=String(x.id);rows.set(id,{store_id:id,store_name:x.title.slice(0,160),store_type,type_source:store_type==='unknown'?'unknown':'catalogue'});
 }for(const [key,v] of Object.entries(x))if(!['user','customer','account','address','token'].includes(key))if(v&&typeof v==='object')walk(v);}walk(value);}
 function allowed(url){try{const u=new URL(url,location.origin);return u.origin==='https://api.digikalajet.ir'&&/^\/(?:v2\/search\/|search\/shop\/|shop\/|v3\/main-page\/)/.test(u.pathname);}catch{return false;}}
 const fetch=root.fetch.bind(root);root.fetch=function(...args){return fetch(...args).then(r=>{if(allowed(r.url))r.clone().json().then(ingest).catch(()=>{});return r;});};
 const send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(...args){this.addEventListener('load',()=>{if(!allowed(this.responseURL))return;try{ingest(this.responseType==='json'?this.response:JSON.parse(this.responseText));}catch{}},{once:true});return send.apply(this,args);};
 root.CartwiseCatalog={ingest,find(id,name){if(id&&rows.has(String(id)))return rows.get(String(id));const found=[...rows.values()].filter(x=>types.norm(x.store_name)===types.norm(name));return found.length===1?found[0]:{};}};
})(globalThis);
