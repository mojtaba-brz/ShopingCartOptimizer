/* Read-only adapter for the public Jet search DOM, observed 2026-11-08.
 * Group titles are p.truncate before horizontal product carousels. Never reads
 * account state or click handlers; product/cart buttons are never activated. */
(function(context){
 'use strict';
 context=context||{};
 const allowed=['www.digikalajet.com','digikalajet.com'];
 if(location.protocol!=='https:'||!allowed.includes(location.hostname))return {error:'صفحه دیجی‌کالاجت باز نیست.',products:[],shops:[]};
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const text=e=>(e?.innerText||'').replace(/[\u200c\s]+/g,' ').trim();
 const digits=s=>String(s||'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
 const price=s=>{s=digits(s);if(!/^\d[\d,٬\s]*$/.test(s))return null;const n=Number(s.replace(/[,٬\s]/g,''))*10;return Number.isSafeInteger(n)&&n>0&&n<=1e13?n:null;};
 const productImage=e=>e?.alt?.trim().length>=4&&!['تومان','شگفت انگیز','شگفت‌انگیز'].includes(e.alt.trim())&&!/(?:toman|logo|badge|amazing)\./i.test(e.getAttribute('src')||'');
 const images=e=>[...e.querySelectorAll('img[alt]')].filter(productImage);
 const cardOf=image=>{let node=image.parentElement;for(let d=0;node&&d<9;d++,node=node.parentElement){if(images(node).length!==1)return null;if(node.querySelector('img[src*="/toman."]')&&node.querySelector('button[data-cro-id="add-one-more-to-cart"]'))return node;}return null;};
 const cards=new Map();for(const image of document.querySelectorAll('img[alt]'))if(productImage(image)&&visible(image)){const card=cardOf(image);if(card)cards.set(card,image);}
 const shops=[],groups=[];
 for(const button of document.querySelectorAll('button')){
  if(!visible(button)||text(button)!=='مشاهده همه')continue;
  let group=button.parentElement;
  for(let d=0;group&&d<6;d++,group=group.parentElement){
   const names=[...group.querySelectorAll('p.truncate')].filter(e=>visible(e)&&!e.closest('button')&&text(e)&&text(e).length<=160&&!Array.from(cards.keys()).some(c=>c.contains(e)));
   if(names.length>1)break;
   if(names.length===1&&Array.from(cards.keys()).some(c=>group.contains(c))){const name=text(names[0]),meta=window.CartwiseCatalog?.find('',name)||{};groups.push({node:group,name,button,...meta});shops.push({name,expandable:true,...meta});break;}
  }
 }
 const params=new URLSearchParams(location.search),shopId=params.get('shopId')||'',expected=context.expected_shop_id||'';
 const trustedContext=location.pathname==='/search/shop'&&shopId&&shopId===expected&&typeof context.store_name==='string';
 const products=[],seen=new Set();
 for(const [card,image] of cards){
  const add=card.querySelector('button[data-cro-id="add-one-more-to-cart"]');if(add.disabled||add.getAttribute('aria-disabled')==='true')continue;
  const currency=card.querySelector('img[src*="/toman."]'),row=currency?.parentElement;
  const current=[...(row?.querySelectorAll('p,span')||[])].map(e=>price(text(e))).find(n=>n!==null);if(!current)continue;
  const struck=card.querySelector('.line-through,[class*="strikethrough"]'),normalText=text(struck),original=price(normalText);
  if(normalText&&(!original||original<current))continue;
  const group=groups.find(g=>g.node.contains(card));
  const store_name=group?.name||(trustedContext?context.store_name:'');
  const direct=card.closest('[data-store-name],[data-seller-name]');
  const name=store_name||direct?.getAttribute('data-store-name')||direct?.getAttribute('data-seller-name')||'';
  const store_id=trustedContext?shopId:direct?.getAttribute('data-store-id')||group?.store_id||'';
  const meta=window.CartwiseCatalog?.find(store_id,name)||{};const store_type=window.CartwiseTypes?.type(direct?.getAttribute('data-business')||meta.store_type||group?.store_type||context.store_type)||'unknown';
  let image_url='';for(const value of [image.currentSrc,image.getAttribute('src'),image.getAttribute('data-src')])try{const u=new URL(value,location.origin);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['dkstatics-public.digikala.com','dkstatics-public.digikalajet.ir','images.digikalajet.ir'].includes(u.hostname)){image_url=u.href;break;}}catch{}
  const catalog=window.CartwiseCatalog?.findProduct(store_id,name,image.alt.trim(),current)||{};
  const amazing=catalog.amazing===true||!!card.querySelector('img[src*="amazing"],[data-testid="amazing-badge"]')||/شگفت[\s‌]*انگیز/.test(text(card));
  const regular=catalog.regular_price||original||current,title=image.alt.trim(),url=location.origin+location.pathname+(shopId?'?shopId='+encodeURIComponent(shopId):''),identity=[title,name,store_id,regular,current].join('|');
  if(seen.has(identity))continue;seen.add(identity);
  products.push({store_type,type_source:meta.type_source||(direct?.getAttribute('data-business')?'page':context.type_source||'inferred'),title,regular_price:regular,promo_price:current<regular?current:null,regular_verified:!!catalog.regular_price||!!original||!amazing,amazing,product_id:catalog.product_id||'',post_amazing_price:catalog.post_amazing_verified?catalog.post_amazing_price:amazing?null:current,post_amazing_verified:catalog.post_amazing_verified===true||!amazing,post_amazing_source:catalog.post_amazing_source||'',store_name:name.slice(0,160),store_id,image_url,url,promo_limit:current<regular?1:0,stock:1});
  if(products.length>=1000)break;
 }
 const headers=[...document.querySelectorAll('header *,#root p,#root span,#root div')].filter(e=>visible(e)&&e.children.length<4&&/^ارسال به/.test(text(e))&&text(e).length>8&&text(e).length<=300).map(text).sort((a,b)=>a.length-b.length);
 const editing=location.pathname.includes('/user/add-address')||/[?&]MID=[^&]*(?:address|location)/i.test(location.search)||[...document.querySelectorAll('#modal-root p,#modal-root-v2 p')].some(e=>visible(e)&&/^(?:انتخاب آدرس تحویل|انتخاب از روی نقشه)$/.test(text(e)));
 return {source:'digikala-live-page',retailer:'jet',captured_at:new Date().toISOString(),location:(headers[0]||'').replace(/^ارسال به\s*/,'ارسال به '),location_editing:editing,shipment_type:'on_demand',delivery_modes:[],page_url:location.origin+location.pathname,shop_id:shopId,checkout_quotes:groups.map(g=>({source:'digikala-visible-checkout',page_kind:'store',page_url:location.origin+location.pathname,captured_at:new Date().toISOString(),store_name:g.name,store_id:g.store_id||'',store_type:g.store_type||context.department||'unknown',fields:window.CartwiseSearchAdapters?.fees?.(g.node)||{},notices:[]})).filter(q=>Object.keys(q.fields).length),shops,products,error:products.length?null:'هنوز کالای قابل خواندن در جت پیدا نشده است.'};
})
