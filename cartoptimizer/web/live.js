/* Android's official-site browser imports only visible product-card data. */
(function () {
  'use strict';
  if (!window.CartwiseAndroid?.openDigikala) return;
  const KEY = 'cartwise.live.v1';
  let meta = {context:'', location:'', shipment_type:'', fees:{}, offers:{}};
  let candidates = [], candidateContext = null;
  try { const saved=JSON.parse(localStorage.getItem(KEY)); if(saved && typeof saved==='object' && saved.offers && saved.fees) meta=saved; } catch {}
  const persist = () => { try {localStorage.setItem(KEY,JSON.stringify(meta));} catch {message('Could not save live-price details. Export a backup.',true);} };
  const hash = s => { let h=2166136261; for (const c of s) h=Math.imul(h^c.codePointAt(0),16777619); return (h>>>0).toString(16); };
  function open(item, locationOnly=false) {
    if (busy) return;
    if (dirty.size) return message('Save or clear the forms you are editing before opening Digikala.',true);
    window.CartwiseAndroid.openDigikala(item?.id || '',item?.name || '',locationOnly);
  }
  const card=document.createElement('section'); card.className='card live-card'; card.id='live-card';
  card.innerHTML='<div class="section-heading"><div><p class="eyebrow">قیمت‌های روز</p><h3>Choose your delivery location.</h3><p id="live-location">آدرس را با جست‌وجو یا نقشه دیجی‌کالاجت انتخاب کنید.</p></div><button class="secondary" id="live-location-button">انتخاب آدرس روی نقشه</button></div><p class="hint">Then tap جست‌وجوی دیجی‌کالاجت beside a list item. Your selected delivery area is reused. Wait for Digikala’s product prices, then tap Read products. Back here, choose the brands and package sizes you accept. Prices fill automatically.</p><p class="hint">The page does not publish stock counts or promotional quotas. Imported products are capped at one unit each across all carts. Delivery fees and coupon terms still need your checkout values.</p><div id="live-candidates" hidden></div>';
  $('tab-list').insertBefore(card,$('tab-list').querySelector('.workspace-grid'));
  $('live-location-button').onclick=()=>open(null,true);
  $('tab-list').querySelector('.guide').innerHTML='<div class="icon-disc">↗</div><h3>Search real products.</h3><p>Add your shopping-list item, then tap جست‌وجوی دیجی‌کالاجت beside it. Select your delivery area on Digikala and read the prices into this planner.</p><hr><p>You choose acceptable brands and package sizes from the imported results. The app fills their prices automatically.</p>';
  $('tab-offers').querySelector('.import-card').innerHTML='<h3>Find live prices from your list</h3><p>جست‌وجوی دیجی‌کالاجت next to an item on your shopping list. Its location picker and catalog open inside Cartwise.</p><button class="secondary" id="live-go-list">Go to shopping list →</button><p class="hint">The form below is available for manual corrections or imported JSON snapshots.</p>';
  $('live-go-list').onclick=()=>showTab('list');
  document.querySelectorAll('a[href="https://www.digikalajet.com/"]').forEach(a=>a.href='https://www.digikalajet.com/');
  function paint() {
    for(const item of state.items) {
      const row=Array.from($('items').querySelectorAll('.item-row')).find(r=>r.querySelector('[data-quantity]')?.dataset.quantity===item.id);
      if(row && !row.querySelector('[data-live-search]')) {
        const b=document.createElement('button');b.className='secondary live-search';b.type='button';b.dataset.liveSearch=item.id;b.textContent='جست‌وجوی دیجی‌کالاجت';
        b.onclick=()=>open(item);row.insertBefore(b,row.lastElementChild);
      }
    }
    $('live-location-button').textContent=meta.location?'تغییر آدرس روی نقشه':'انتخاب آدرس روی نقشه';
    $('live-location').textContent=meta.location ? `${meta.location} · ${meta.shipment_type==='scheduled'?'ارسال زمان‌دار':'ارسال فوری'}` : 'آدرس را با جست‌وجو یا نقشه دیجی‌کالاجت انتخاب کنید.';
    for(const node of $('offers').querySelectorAll('.offer-card')) {
      const offerId=node.querySelector('[data-edit-offer]')?.dataset.editOffer;
      if(meta.offers[offerId] && !node.querySelector('.live-price-note')) {
        node.querySelector('.badge').textContent=state.offers.find(o=>o.id===offerId)?.confirmed?'Live · 1-unit cap':'Refresh location';
        node.querySelector('.price').nextElementSibling.textContent='Planning cap: 1 unit · remaining stock and promotional quota unknown';
        const p=document.createElement('p');p.className='hint live-price-note';
        p.textContent=`Read ${new Date(meta.offers[offerId].captured_at).toLocaleString()} · 1-unit planning cap · ${meta.offers[offerId].location}`;node.appendChild(p);
      }
    }
  }
  new MutationObserver(paint).observe($('items'),{childList:true});
  new MutationObserver(()=>{paint();}).observe($('offers'),{childList:true});
  function validatePayload(raw) {
    const x=typeof raw==='string'?JSON.parse(raw):raw;
    if(!x || x.source!=='digikala-live-page' || !Array.isArray(x.products) || x.products.length>1000) throw Error('Invalid Digikala reader result.');
    if(typeof x.location!=='string' || !x.location.trim() || x.location.length>300) throw Error('Select a delivery address on Digikala first.');
    if(!['on_demand','scheduled'].includes(x.shipment_type)) throw Error('Choose your delivery mode on Digikala.');
    const date=Date.parse(x.captured_at);if(!Number.isFinite(date) || Math.abs(Date.now()-date)>300000) throw Error('This page result has expired. Read current prices again.');
    return x;
  }
  function adoptContext(x) {
    meta.updated_at=Date.parse(x.captured_at)||Date.now();
    const key=x.location+' | '+x.shipment_type;
    if(meta.context!==key) {
      // Site address is the authority. Never combine offers from different areas/modes.
      for(const offer of state.offers) if(meta.offers[offer.id]) offer.confirmed=false;
      candidates=[];candidateContext=null;$('live-candidates').hidden=true;
      meta.context=key;meta.location=x.location;meta.shipment_type=x.shipment_type;
      meta.fees={};state.context=key.slice(0,300);save();
    }
    // The planner may have been reset while the retained delivery session is
    // unchanged. Rebind the workspace even when the retailer context matches.
    if(state.context!==key.slice(0,300)) {state.context=key.slice(0,300);save();}
    persist();paint();return key;
  }
  window.addEventListener('cartwise:live',e=>{
    try {
      const x=validatePayload(e.detail), key=adoptContext(x);
      if(x.location_only) {message('آدرس ذخیره شد؛ حالا لیست خرید را جست‌وجو کنید.');return;}
      if(!state.items.some(i=>i.id===x.item_id)) throw Error('The shopping-list item no longer exists. Search again from your list.');
      candidates=x.products.map(p=>validateProduct(p,x)).filter(Boolean);
      if(!candidates.length) throw Error('No valid product prices were found. Search on Digikala and read the page again.');
      candidateContext={...x,key};drawCandidates();showTab('list');
      message(`${candidates.length} live products read. Choose acceptable brands and package sizes below.`);
      $('live-candidates').scrollIntoView({behavior:'smooth',block:'start'});
    } catch(error) {message(error.message,true);}
  });
  function validateProduct(p,x) {
    const ok=n=>Number.isSafeInteger(n)&&n>0&&n<=1e13;
    if(!p || typeof p.title!=='string' || !p.title.trim() || p.title.length>300 || !ok(p.regular_price)) return null;
    if(p.promo_price!==null && (!ok(p.promo_price)||p.promo_price>=p.regular_price)) return null;
    return {title:p.title,regular_price:p.regular_price,promo_price:p.promo_price,stock:1,promo_limit:p.promo_price===null?0:1,url:x.page_url};
  }
  function drawCandidates() {
    const el=$('live-candidates'), item=state.items.find(i=>i.id===candidateContext?.item_id);
    if(!item) {el.hidden=true;return;}
    el.hidden=false;el.innerHTML=`<hr><h3>Choose options for ${escapeHTML(item.name)}</h3><p class="hint">Read ${escapeHTML(new Date(candidateContext.captured_at).toLocaleString())}. Each accepted product can supply at most one unit. Select only products whose size and quality match your need.</p><div class="live-result-grid">${candidates.map((p,i)=>`<article class="live-result"><h4 dir="auto">${escapeHTML(p.title)}</h4><p class="price">${money(p.promo_price??p.regular_price)} <small>toman</small></p>${p.promo_price!==null?`<p class="hint">Normal: ${money(p.regular_price)} · Discount capped at 1 unit</p>`:''}<button class="secondary" data-live-add="${i}">Add option</button></article>`).join('')}</div>`;
    el.querySelectorAll('[data-live-add]').forEach(b=>b.onclick=()=>addCandidate(Number(b.dataset.liveAdd),b));
  }
  function addCandidate(index,button) {
    try {
      if(busy || dirty.size) throw Error('Save or clear your form edits first.');
      const x=candidateContext,p=candidates[index];
      if(!x || x.key!==meta.context || Date.now()-Date.parse(x.captured_at)>1800000) throw Error('Read the current page again before adding this product.');
      if(!state.items.some(i=>i.id===x.item_id)) throw Error('This shopping-list item was removed. Search again.');
      const storeId='live-'+hash(x.key);
      let store=state.stores.find(s=>s.id===storeId);
      if(!store) {
        if(state.stores.length>=6) throw Error('Remove an unused delivery group before adding this location.');
        store={id:storeId,name:'Digikala · '+(x.shipment_type==='scheduled'?'Scheduled':'Instant'),delivery_fee:0,service_fee:0,minimum_order:0,free_delivery_over:null,threshold_basis:'before_coupon'};state.stores.push(store);
      }
      // Product identity is shared across items; duplicate mappings would multiply stock/promos.
      const identity=hash(x.key+'\u0000'+p.title), existing=state.offers.find(o=>o.id==='live-'+identity);
      if(existing && existing.item_id!==x.item_id) throw Error('This product is already assigned to another list item. Combine the items or remove the old option first.');
      if(!existing && state.offers.length>=80) throw Error('Maximum 80 product options. Remove an unused option first.');
      const offer={...p,id:'live-'+identity,item_id:x.item_id,store_id:storeId,promo_scope:'account',confirmed:true};
      if(existing) state.offers[state.offers.indexOf(existing)]=offer; else state.offers.push(offer);
      meta.offers[offer.id]={captured_at:x.captured_at,context:x.key,location:x.location,title:p.title};
      state.source=state.offers.some(o=>!meta.offers[o.id])?'mixed-live-and-manual':'digikala-live-page';state.captured_at=x.captured_at;
      save();persist();paint();button.textContent='Added ✓';
      message('Live price added. This product is capped at 1 unit. Check delivery fees for this group under Coupons & delivery before planning.');
    } catch(error) {message(error.message,true);}
  }
  const feeLabel=document.createElement('label');feeLabel.className='checkbox';feeLabel.innerHTML='<input type="checkbox" id="live-fees-checked" name="live_fees_checked"> I checked this location’s delivery fee, service fee, minimum order and free-delivery threshold at checkout.';
  $('store-form').insertBefore(feeLabel,$('store-form').querySelector('.form-actions'));
  $('store-edit').addEventListener('change',()=>{$('live-fees-checked').checked=!!meta.fees[$('store-edit').value];});
  window.addEventListener('cartwise:store-saved',e=>{
    const {store,checked}=e.detail;
    if(store.id.startsWith('live-')) {meta.fees[store.id]=checked?JSON.stringify(store):null;persist();}
  });
  const originalRender=render;
  render=function(){originalRender();paint();};
  window.CartwiseLive={
    rememberAutomatic(x) {meta.updated_at=Date.parse(x.captured_at)||Date.now();meta.location=x.location;meta.shipment_type=x.shipment_type;meta.context=x.location+' | '+x.shipment_type;persist();paint();},
    checkBeforeOptimize(snapshot) {
      const live=snapshot.offers.filter(o=>o.confirmed&&o.id.startsWith('live-'));
      for(const o of live) {
        const m=meta.offers[o.id];
        if(!m || m.title!==o.title || m.context!==meta.context) return 'Refresh live products for the current delivery location and mode before planning.';
        if(Date.now()-Date.parse(m.captured_at)>1800000) return 'Live prices are older than 30 minutes. Search and read the current prices again.';
        if(meta.fees[o.store_id]!==JSON.stringify(snapshot.stores.find(s=>s.id===o.store_id))) return 'Check the delivery and order rules for each live delivery group, tick the checkout-verification box, then save the delivery rules.';
        if(o.stock!==1 || (o.promo_price!==null && o.promo_limit!==1) || o.promo_scope!=='account') return 'Live product stock and promotional quotas are capped at one unit. Read the live product again, or remove it and add a separately reviewed manual option.';
      }
      return '';
    }
  };
  try {const x=JSON.parse(window.CartwiseAndroid.savedDelivery?.()||'{}');if(x.location&&(!meta.location||Number(x.updated_at||0)>Number(meta.updated_at||0))){meta.location=x.location;meta.shipment_type=x.shipment_type;meta.updated_at=Number(x.updated_at)||0;
    const context=x.location+' | '+x.shipment_type;if(meta.context!==context){meta.context=context;meta.fees={};}persist();}}catch{}
  paint();
})();
