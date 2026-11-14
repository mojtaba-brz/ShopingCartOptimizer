/* In-memory, address/mode-bound reuse. Never persisted as an account/history log. */
(function(root){
 'use strict';
 class Session{
  constructor(){this.entries=new Map();this.quotes=[];this.context='';}
  reset(context){this.entries.clear();this.quotes=[];this.context=context;}
  key(item){return JSON.stringify([item.query||item.name,item.department||'supermarket']);}
  pending(items,context,all=false){if(all||context!==this.context)this.reset(context);const now=Date.now();return items.filter(i=>{const e=this.entries.get(this.key(i));return !e||now-e.time>900000||(e.row.error&&!e.row.products?.length);});}
  merge(items,result,context){if(this.context&&this.context!==context)this.reset(context);this.context=context;for(const i of items){const e=result.items.find(x=>x.id===i.id);if(e)this.entries.set(this.key(i),{row:e,time:Date.now()});}this.quotes=[...this.quotes,...(result.checkout_quotes||[])].slice(-100);this.resources=result.resources;}
  result(items,delivery){const keys=new Set(items.map(i=>this.key(i)));for(const k of this.entries.keys())if(!keys.has(k))this.entries.delete(k);return {source:'digikala-automatic',...delivery,captured_at:new Date(Math.min(...items.map(i=>this.entries.get(this.key(i))?.time||Date.now()))).toISOString(),items:items.map(i=>({...this.entries.get(this.key(i))?.row,id:i.id,products:this.entries.get(this.key(i))?.row.products||[]})),checkout_quotes:this.quotes,resources:this.resources};}
 }
 root.CartwiseSearchSession=Session;if(typeof module!=='undefined')module.exports=Session;
})(typeof globalThis!=='undefined'?globalThis:window);
