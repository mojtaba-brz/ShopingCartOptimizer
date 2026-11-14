/* Read-only DOM adapter for Digikala's current supermarket product cards.
 * Evaluated by a native button in a separate WebView with NO native bridge.
 * Never reads cookies, storage, account details, or changes a retailer cart.
 */
(function () {
  'use strict';
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const text = el => (el?.innerText || '').trim().replace(/\s+/g, ' ');
  const digits = s => String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const price = s => {
    const n = Number(digits(s).replace(/[,٬\s]/g, ''));
    return /^\d[\d,٬\s]*(\.\d)?$/.test(digits(s)) && Number.isSafeInteger(Math.round(n * 10)) && n > 0 && n <= 1e12 ? Math.round(n * 10) : null;
  };
  if (location.protocol !== 'https:' || !['www.digikala.com', 'digikala.com'].includes(location.hostname)) return {error:'Open Digikala Supermarket first.'};
  if (!location.pathname.startsWith('/supermarket')) return {error:'Open the Digikala Supermarket catalog before reading products.'};
  const products = [], seen = new Set();
  function productImage(e){return e&&typeof e.alt==='string'&&e.alt.trim().length>=4&&!/toman\.|amazing\.|logo/i.test(e.getAttribute?.('src')||'')&&!['تومان','شگفت انگیز','شگفت‌انگیز'].includes(e.alt.trim());}
  function publicURL(value,image=false){try{const u=new URL(value,location.origin);if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
    if(image)return ['dkstatics-public.digikala.com','dkstatics-public.digikalajet.ir','images.digikalajet.ir'].includes(u.hostname)?u.href:'';
    return ['www.digikala.com','digikala.com'].includes(u.hostname)&&/\/product\//.test(u.pathname)?u.origin+u.pathname:'';
  }catch{return '';}}
  function storeOf(card){
    let node=card;
    function otherProduct(e,ancestor){let branch=e;while(branch.parentElement&&branch.parentElement!==ancestor)branch=branch.parentElement;let own=card;while(own&&own!==branch)own=own.parentElement;return !own&&Array.from(branch.querySelectorAll?.('img[alt]')||[]).some(productImage);}
    for(let depth=0;node&&depth<4;depth++,node=node.parentElement){
      const names=new Map();
      const direct=node.getAttribute?.('data-store-name')||node.getAttribute?.('data-seller-name');
      if(direct)names.set(direct.trim(),node.getAttribute?.('data-store-id')||node.getAttribute?.('data-seller-id')||'');
      for(const e of Array.from(node.querySelectorAll?.('[data-testid="seller-name"], [data-testid="store-name"], [data-testid="shop-name"], a[href*="/store/"], a[href*="/seller/"], a[href*="/shop/"]')||[])){
        const label=text(e);if(!visible(e)||!label||label.length>160||otherProduct(e,node))continue;
        let identity='';try{const u=new URL(e.getAttribute?.('href'),location.origin);if(u.origin===location.origin)identity=u.pathname;}catch{}
        names.set(label,identity);
      }
      for(const e of Array.from(node.querySelectorAll?.('p,span')||[])){
        if(!visible(e)||otherProduct(e,node))continue;const match=text(e).match(/^(?:فروشگاه|فروشنده|سوپرمارکت)\s*[:：]\s*(.{2,120})$/);if(match)names.set(match[1],'');
      }
      if(names.size===1){const [name,id]=[...names][0];return {name:name.slice(0,160),id:id.slice(0,200)};}
      if(names.size>1)break;
    }
    const selected=document.querySelector?.('[data-testid="selected-store-name"], [data-testid="selected-shop-name"]');
    if(selected&&visible(selected)&&text(selected).length<=160)return {name:text(selected),id:''};
    return {name:'',id:''};
  }
  for (const image of document.querySelectorAll('img[alt]')) {
    if (products.length >= 1000) break;
    if(!productImage(image))continue;
    const title = image.alt.trim();
    if (title.length > 300 || !visible(image)) continue;
    let card = image.parentElement, current = null;
    for (let depth = 0; card && depth < 8; depth++, card = card.parentElement) {
      if(Array.from(card.querySelectorAll('img[alt]')).filter(productImage).length!==1)break;
      const toman = card.querySelector('img[src*="/toman."]');
      if (!toman) continue;
      current = Array.from(toman.parentElement.querySelectorAll('p,span')).map(e => price(text(e))).find(p => p !== null);
      if (current) break;
    }
    if (!card || !current || !card.querySelector('button[data-cro-id="add-one-more-to-cart"]:not(:disabled)')) continue;
    const originalNode = card.querySelector('.line-through, [class*="strikethrough"]');
    const originalText = originalNode ? text(originalNode) : '';
    const original = originalText ? price(originalText) : null;
    if (originalText && (!original || original < current)) continue;
    const regular = original || current, store=storeOf(card);
    const anchor=card.querySelector('a[href*="/product/"]');
    const url=publicURL(anchor?.getAttribute?.('href'))||location.origin+location.pathname;
    const imageURL=[image.currentSrc,image.getAttribute?.('src'),image.getAttribute?.('data-src')].map(x=>publicURL(x,true)).find(Boolean)||'';
    const amazing=/(?:شگفت\s*انگیز|شگفت‌انگیز)/.test(text(card))||!!card.querySelector('[data-testid="amazing-badge"], [data-cro-id="amazing-offer"], img[alt*="شگفت"]');
    const key = title+'\u0000'+store.id+'|'+store.name+'|'+url+'|'+regular+'|'+current;
    if (seen.has(key)) continue;seen.add(key);
    products.push({title, regular_price:regular, promo_price:current < regular ? current : null,
      amazing,regular_verified:!!original||!amazing,store_name:store.name,store_id:store.id,image_url:imageURL,
      promo_limit:current < regular ? 1 : 0,stock:1,url,
      warning:'Remaining stock and promotional quota are not published on this product card.'});
  }
  const locationNodes = Array.from(document.querySelectorAll('header *, #root p, #root span, #root div'))
    .filter(e => visible(e) && e.children.length < 4 && /^ارسال به/.test(text(e)) && text(e).length > 8 && text(e).length <= 300)
    .map(text).sort((a,b) => a.length-b.length);
  const locationLabel = (locationNodes[0] || '').replace(/^ارسال به\s*/, 'ارسال به ');
  const buttons = Array.from(document.querySelectorAll('button')).filter(visible);
  // Keep both label and selected-mode DOM evidence; never assume a default address.
  const modes = buttons.filter(b => /ارسال (فوری|زمان.?دار)/.test(text(b))).map(b => ({label:text(b), selected:b.getAttribute('aria-selected'), pressed:b.getAttribute('aria-pressed'), classes:b.className}));
  const selectedModes=modes.filter(m=>m.selected==='true'||m.pressed==='true'||
    (String(m.classes).split(/\s+/).includes('bg-v3-primary-fresh-600') && String(m.classes).split(/\s+/).includes('text-v3-achromatic-white')));
  const selectedMode=selectedModes.length===1?(/زمان.?دار/.test(selectedModes[0].label)?'scheduled':/فوری/.test(selectedModes[0].label)?'on_demand':null):null;
  const locationEditing=location.pathname.includes('/user/add-address') || /[?&]MID=[^&]*(?:address|location)/i.test(location.search||'');
  return {location_editing:locationEditing, shipment_type:selectedMode, source:'digikala-live-page', captured_at:new Date().toISOString(), location:locationLabel,
    delivery_modes:modes, page_url:location.origin + location.pathname, products,
    error:products.length ? null : 'No readable in-stock products on this page. Search for an item, wait for prices, then tap Read products again.'};
})()
