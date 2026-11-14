'use strict';
const $ = (id) => document.getElementById(id);
const STORAGE = 'cartoptimizer.workspace.v1';
const moneyFormat = new Intl.NumberFormat('fa-IR', {maximumFractionDigits: 1});
const money = (rials) => moneyFormat.format(rials / 10);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id = () => typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
const dirty = new Set();
const formBaselines = new Map();
function formSignature(form) { return JSON.stringify(Array.from(form.elements).filter(e=>e.name).map(e=>[e.name,e.type==='checkbox'?e.checked:e.value])); }
function rememberForm(formId) { const form=$(formId); if(form)formBaselines.set(formId,formSignature(form)); }
let plan = null;
let busy = false;
let importedMetadata = null;

function initialState() {
  return {schema_version: 1, currency: 'IRR', source: 'manual', captured_at: new Date().toISOString(),
    context: 'آدرس انتخاب نشده', max_carts: 1, items: [], offers: [], coupons: [],
    stores: [{id: 'digikala', name: 'سوپرمارکت دیجی‌کالا', delivery_fee: 0, service_fee: 0,
      minimum_order: 0, free_delivery_over: null, threshold_basis: 'before_coupon'}]};
}
let state = initialState();

function message(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
  $('message').hidden = !text;
}
function safeURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}
function amount(value, optional = false) {
  if (value === '' && optional) return null;
  if (!/^\d+(\.\d)?$/.test(String(value))) throw new Error('قیمت را به تومان و حداکثر با یک رقم اعشار وارد کنید.');
  const rials = Math.round(Number(value) * 10);
  if (!Number.isSafeInteger(rials) || rials > 1e13) throw new Error('قیمت بیش از حد مجاز است.');
  return rials;
}
function number(value) { return Number(value); }
async function api(path, data) {
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'درخواست انجام نشد.');
  return body;
}
function save() {
  plan = null;
  $('export-plan').hidden = true;
  $('results').innerHTML = '<div class="empty card"><span class="empty-icon">▤</span><h3>آماده مقایسه قیمت‌ها</h3><p>لیست تغییر کرد؛ برای به‌روزرسانی نتیجه دوباره جست‌وجو کنید.</p></div>';
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  catch { message('ذخیره‌سازی در دسترس نیست؛ از لیست پشتیبان بگیرید.', true); }
  render();
}
function showTab(name) {
  if (!['list','offers','rules','results','settings'].includes(name)) return;
  document.querySelectorAll('.tab-panel').forEach((el) => { el.hidden = el.id !== `tab-${name}`; });
  document.querySelectorAll('.nav').forEach((el) => el.classList.toggle('active', el.dataset.tab === name));
  $('tab-label').textContent = {list:'لیست خرید', offers:'گزینه‌های کالا', rules:'ارسال و تخفیف', results:'سبد پیشنهادی',settings:'تنظیمات'}[name];
}
function selectOptions(element, rows, nameKey) {
  const value = element.value;
  element.innerHTML = rows.map((row) => `<option value="${escapeHTML(row.id)}">${escapeHTML(row[nameKey])}</option>`).join('');
  if (rows.some((row) => row.id === value)) element.value = value;
}
function render() {
  $('list-count').textContent = state.items.length;
  $('offer-count').textContent = state.offers.length;
  $('summary').textContent = `${state.items.length} items · ${state.offers.filter((o) => o.confirmed).length} confirmed offers`;
  $('run-hint').textContent = state.items.length ? `Up to ${state.max_carts} cart${state.max_carts > 1 ? 's' : ''} · delivery rules supplied by you` : 'Add your list and prices to get started.';
  $('source-badge').textContent = state.source === 'demo' ? 'نمونه · قیمت‌های ساختگی' : `${state.source} snapshot`;
  $('source-badge').classList.toggle('demo', state.source === 'demo');
  $('snapshot-time').textContent = `Captured ${new Date(state.captured_at).toLocaleString()}`;
  $('items').innerHTML = state.items.length ? state.items.map((item, i) => `<div class="item-row"><span class="item-number">${new Intl.NumberFormat('fa-IR',{minimumIntegerDigits:2}).format(i+1)}</span><div class="item-name"><strong dir="auto">${escapeHTML(item.name)}</strong><small>${state.offers.filter((o) => o.item_id === item.id).length} گزینه مرتبط</small></div><input type="number" class="item-quantity" min="1" max="50" value="${item.quantity}" data-quantity="${escapeHTML(item.id)}" aria-label="تعداد ${escapeHTML(item.name)}"><button class="icon-button" data-remove-item="${escapeHTML(item.id)}" aria-label="حذف ${escapeHTML(item.name)}">×</button></div>`).join('') : '<div class="empty"><span class="empty-icon">＋</span><h3>خرید بعدی را از اینجا شروع کنید.</h3><p>اولین کالا را بنویسید؛ مثلاً شیر کم‌چرب یک لیتر.</p></div>';
  selectOptions($('offer-item'), state.items, 'name');
  ['offer-store','coupon-store','store-edit'].forEach((key) => selectOptions($(key), state.stores, 'name'));
  if (!dirty.has('store-form')) fillStore();
  if (!dirty.has('settings-form')) {
    $('settings-form').elements.context.value = state.context;
    $('settings-form').elements.max_carts.value = state.max_carts;
  }
  $('offers').innerHTML = state.offers.map((offer) => {
    const promotional = offer.promo_price !== null && offer.promo_limit > 0;
    const item = state.items.find((i) => i.id === offer.item_id);
    const store = state.stores.find((s) => s.id === offer.store_id);
    const link = safeURL(offer.url);
    return `<article class="card offer-card"><div class="offer-meta"><span>${escapeHTML(item?.name)} · ${escapeHTML(store?.name)}</span><span class="badge ${offer.confirmed ? '' : 'demo'}">${offer.confirmed ? 'بررسی‌شده' : 'نیازمند بررسی'}</span></div><h3 dir="auto">${escapeHTML(offer.title)}</h3><p class="price">${money(promotional ? offer.promo_price : offer.regular_price)} <small>تومان</small>${promotional ? `<del>${money(offer.regular_price)}</del>` : ''}</p><p>${promotional ? `${offer.promo_limit} promotional unit(s) ${offer.promo_scope === 'account' ? 'across all carts' : 'per cart'}` : 'قیمت عادی'} · ${offer.stock} units available</p><div class="offer-actions"><button class="secondary" data-edit-offer="${escapeHTML(offer.id)}">ویرایش</button><button class="quiet danger" data-remove-offer="${escapeHTML(offer.id)}">حذف</button>${link ? `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">صفحه کالا</a>` : ''}</div></article>`;
  }).join('');
  $('coupons').innerHTML = state.coupons.map((coupon) => `<article class="card offer-card"><span class="badge">${escapeHTML(state.stores.find((s) => s.id === coupon.store_id)?.name)}</span><h3>${escapeHTML(coupon.code)}</h3><p class="price">${coupon.kind === 'percent' ? `${coupon.value / 100}%` : `${money(coupon.value)} تومان`}</p><p>From ${money(coupon.minimum_spend)} تومان · ${coupon.max_uses} total use(s)${coupon.maximum_discount !== null ? ` · cap ${money(coupon.maximum_discount)} تومان` : ''}</p><p>${coupon.removes_promotions ? 'جایگزین تخفیف کالاها می‌شود' : 'همراه تخفیف کالاها اعمال می‌شود'}</p><div class="offer-actions"><button class="secondary" data-edit-coupon="${escapeHTML(coupon.id)}">ویرایش</button><button class="quiet danger" data-remove-coupon="${escapeHTML(coupon.id)}">حذف</button></div></article>`).join('');
  for(const key of ['item-form','offer-form','store-form','coupon-form','settings-form'])if(!dirty.has(key))rememberForm(key);
}
function fillStore() {
  const form = $('store-form');
  const store = state.stores.find((s) => s.id === form.elements.id.value) || state.stores[0];
  if (!store) return;
  for (const key of ['name','threshold_basis']) form.elements[key].value = store[key];
  for (const key of ['delivery_fee','service_fee','minimum_order','free_delivery_over']) form.elements[key].value = store[key] === null ? '' : store[key] / 10;
}
function clearForm(formId) {
  $(formId).reset();
  if ($(formId).elements.id && formId !== 'store-form') $(formId).elements.id.value = '';
  dirty.delete(formId);rememberForm(formId);
  if (formId === 'offer-form') { importedMetadata = null; $('offer-form-title').textContent = 'افزودن گزینه'; }
  if (formId === 'coupon-form') $('coupon-form-title').textContent = 'افزودن کد تخفیف';
}
function editOffer(offerId) {
  const offer = state.offers.find((o) => o.id === offerId);
  const form = $('offer-form');
  importedMetadata = {captured_at: offer.captured_at, source: offer.source};
  for (const key of ['id','item_id','store_id','title','promo_limit','promo_scope','stock','url']) form.elements[key].value = offer[key] ?? '';
  for (const key of ['regular_price','promo_price']) form.elements[key].value = offer[key] === null ? '' : offer[key] / 10;
  form.elements.confirmed.checked = offer.confirmed;
  $('offer-form-title').textContent = 'ویرایش گزینه';
  showTab('offers');
  form.scrollIntoView({behavior: 'smooth', block: 'start'});
}
function editCoupon(couponId) {
  const coupon = state.coupons.find((c) => c.id === couponId);
  const form = $('coupon-form');
  for (const key of ['id','store_id','code','kind','max_uses']) form.elements[key].value = coupon[key];
  form.elements.value.value = coupon.kind === 'fixed' ? coupon.value / 10 : coupon.value / 100;
  for (const key of ['minimum_spend','maximum_discount']) form.elements[key].value = coupon[key] === null ? '' : coupon[key] / 10;
  form.elements.removes_promotions.checked = coupon.removes_promotions;
  $('coupon-form-title').textContent = 'ویرایش کد تخفیف';
  showTab('rules');
  form.scrollIntoView({behavior:'smooth', block:'start'});
}
function download(value, filename) {
  if (window.CartwiseAndroid) {
    window.CartwiseAndroid.saveJSON(filename, JSON.stringify(value, null, 2));
    return;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderPlan(result) {
  $('export-plan').hidden = !result.carts.length;
  const warnings = `<div class="warning-list">${result.warnings.map((w) => `<p>• ${escapeHTML(w)}</p>`).join('')}</div>`;
  if (!result.carts.length) {
    $('results').innerHTML = `<div class="card empty"><h3>${result.status === 'limit_no_plan' ? 'محاسبه به زمان بیشتری نیاز دارد.' : 'سبد مناسبی پیدا نشد.'}</h3><p>${escapeHTML(result.reason)}</p></div>${warnings}`;
    return;
  }
  const savings = result.savings;
  $('results').innerHTML = `<div class="metrics"><div class="card metric featured"><small>مبلغ پرداخت</small><strong>${money(result.total)}<span>تومان</span></strong><p>${result.carts.length} checkout${result.carts.length > 1 ? 's' : ''}, fees included</p></div><div class="card metric"><small>مقایسه با خرید بدون کد</small><strong>${savings === null ? '—' : money(savings)}<span>${savings === null ? '' : 'تومان saved'}</span></strong><p>بهترین مقایسه تک‌سبدی پیدا‌شده</p></div><div class="card metric"><small>نتیجه محاسبه</small><strong>${result.optimal ? 'بهینه' : 'بهترین نتیجه'}</strong><p>${result.optimal ? 'مقایسه کامل شد' : 'محاسبه به سقف مجاز رسید؛ ممکن است نتیجه بهتر وجود داشته باشد.'}</p></div></div><p class="result-info">${escapeHTML(result.context)} · Snapshot: ${escapeHTML(result.captured_at)} · ${result.states.toLocaleString()} search states · ${result.elapsed_seconds}s. Purchase carts in the order shown.</p>${result.carts.map((cart, i) => `<article class="card"><div class="plan-header"><h3>Cart ${i + 1} <span class="slash">/</span> ${escapeHTML(cart.store)}</h3><span class="badge">${cart.coupon ? `Coupon: ${escapeHTML(cart.coupon)}` : 'Item offers · no coupon'}</span></div><div class="table-scroll"><table><thead><tr><th>کالا</th><th>تعداد</th><th>تعداد تخفیف‌دار / عادی</th><th>جمع ردیف (تومان)</th></tr></thead><tbody>${cart.lines.map((line) => `<tr><td><span dir="auto">${escapeHTML(line.title)}</span><small dir="auto">${escapeHTML(line.item)}</small>${safeURL(line.url) ? `<a href="${escapeHTML(safeURL(line.url))}" target="_blank" rel="noopener noreferrer">صفحه کالا</a>` : ''}</td><td>${line.quantity}</td><td>${line.promo_quantity} / ${line.quantity - line.promo_quantity}<small>${line.promo_quantity ? `${money(line.promo_price)} promo · ` : ''}${money(line.regular_price)} normal</small></td><td>${money(line.subtotal)}</td></tr>`).join('')}</tbody></table></div><div class="totals"><div><span>مبلغ کالاها</span><span>${money(cart.subtotal)}</span></div><div><span>تخفیف کد</span><span>−${money(cart.coupon_discount)}</span></div><div><span>ارسال</span><span>${money(cart.delivery_fee)}</span></div><div><span>خدمات</span><span>${money(cart.service_fee)}</span></div><div class="grand-total"><span>جمع سبد</span><span>${money(cart.total)} تومان</span></div></div></article>`).join('')}${warnings}`;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || busy) return;
  if (button.dataset.tab) showTab(button.dataset.tab);
  const data = button.dataset;
  if (data.removeItem) {
    state.items = state.items.filter((i) => i.id !== data.removeItem);
    state.offers = state.offers.filter((o) => o.item_id !== data.removeItem);
    clearForm('offer-form'); save();
  }
  if (data.editOffer) editOffer(data.editOffer);
  if (data.editCoupon) editCoupon(data.editCoupon);
  if (data.removeOffer) { state.offers = state.offers.filter((o) => o.id !== data.removeOffer); clearForm('offer-form'); save(); }
  if (data.removeCoupon) { state.coupons = state.coupons.filter((c) => c.id !== data.removeCoupon); clearForm('coupon-form'); save(); }
});
document.addEventListener('change', (event) => {
  if (event.target.dataset.quantity) {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 1 || value > 50) { message('تعداد باید بین ۱ و ۵۰ باشد.', true); render(); return; }
    state.items.find((i) => i.id === event.target.dataset.quantity).quantity = value; save();
  }
});
for (const formId of ['item-form','offer-form','store-form','coupon-form','settings-form']) {
  $(formId).addEventListener('input', () => {if(formSignature($(formId))===formBaselines.get(formId))dirty.delete(formId);else dirty.add(formId);});
}
function submit(formId, handler) {
  $(formId).addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    try { await handler(new FormData($(formId))); message('ذخیره شد.'); }
    catch (error) { message(error.message, true); }
  });
}
function addShoppingItem(form) {
  if (state.items.length >= 15) throw new Error('در این نسخه می‌توانید حداکثر ۱۵ قلم کالا اضافه کنید.');
  const name = String(form.get('name')||'').trim(),quantity=number(form.get('quantity'));
  if (!name||name.length>300) throw new Error('نام کالا را وارد کنید.');
  if(!Number.isInteger(quantity)||quantity<1||quantity>50)throw new Error('تعداد باید بین ۱ و ۵۰ باشد.');
  state.items.push({id:id(),name,quantity});clearForm('item-form');
}
submit('item-form', form=>{addShoppingItem(form);save();});
// Automatic search uses the actual shopping inputs. Unrelated hidden legacy
// drafts never block it, and valid unsubmitted goods are included without refresh.
function commitShoppingDraft() {
  const edits=Array.from($('items').querySelectorAll('[data-quantity]')).map(input=>({input,item:state.items.find(i=>i.id===input.dataset.quantity),value:Number(input.value)}));
  const invalid=edits.find(x=>!Number.isInteger(x.value)||x.value<1||x.value>50);
  if(invalid){showTab('list');invalid.input.focus();throw Error('تعداد باید بین ۱ و ۵۰ باشد.');}
  const form=$('item-form'),pending=form.elements.name.value.trim();
  if(pending){if(!form.checkValidity()){showTab('list');form.reportValidity();throw Error('نام و تعداد کالای جدید را کامل کنید.');}addShoppingItem(new FormData(form));}
  let changed=!!pending;for(const x of edits)if(x.item&&x.item.quantity!==x.value){x.item.quantity=x.value;changed=true;}
  if(changed)save();
}
submit('offer-form', async (form) => {
  if (!form.get('item_id')) throw new Error('ابتدا کالا را به لیست اضافه کنید.');
  const offer = {id: form.get('id') || id(), item_id: form.get('item_id'), store_id: form.get('store_id'), title: form.get('title').trim(),
    regular_price: amount(form.get('regular_price')), promo_price: amount(form.get('promo_price'), true),
    promo_limit: number(form.get('promo_limit')), promo_scope: form.get('promo_scope'), stock: number(form.get('stock')),
    confirmed: form.has('confirmed'), url: form.get('url'), ...importedMetadata};
  const next = {...state, offers: [...state.offers.filter((o) => o.id !== offer.id), offer]};
  await api('/api/validate', next); state = next; clearForm('offer-form'); save();
});
submit('store-form', async (form) => {
  const store = {id: form.get('id'), name: form.get('name').trim(), delivery_fee: amount(form.get('delivery_fee')),
    service_fee: amount(form.get('service_fee')), minimum_order: amount(form.get('minimum_order')),
    free_delivery_over: amount(form.get('free_delivery_over'), true), threshold_basis: form.get('threshold_basis')};
  const next = {...state, stores: state.stores.map((s) => s.id === store.id ? store : s)};
  await api('/api/validate', next); state = next; dirty.delete('store-form'); save();
  window.dispatchEvent(new CustomEvent('cartwise:store-saved',{detail:{store,checked:form.has('live_fees_checked')}}));
});
submit('settings-form', (form) => {
  const context = form.get('context').trim();
  if (!context) throw new Error('آدرس یا شرایط خرید را وارد کنید.');
  state.context = context; state.max_carts = number(form.get('max_carts')); dirty.delete('settings-form'); save();
});
submit('coupon-form', async (form) => {
  const kind = form.get('kind');
  const value = kind === 'fixed' ? amount(form.get('value')) : Math.round(Number(form.get('value')) * 100);
  const coupon = {id: form.get('id') || id(), store_id: form.get('store_id'), code: form.get('code').trim(), kind, value,
    minimum_spend: amount(form.get('minimum_spend')), maximum_discount: amount(form.get('maximum_discount'), true),
    max_uses: number(form.get('max_uses')), removes_promotions: form.has('removes_promotions')};
  const next = {...state, coupons: [...state.coupons.filter((c) => c.id !== coupon.id), coupon]};
  await api('/api/validate', next); state = next; clearForm('coupon-form'); save();
});
$('store-edit').addEventListener('change', () => { dirty.delete('store-form'); fillStore(); });
$('cancel-offer').addEventListener('click', () => clearForm('offer-form'));
$('cancel-coupon').addEventListener('click', () => clearForm('coupon-form'));
$('add-store').addEventListener('click', () => {
  if (state.stores.length >= 6) return message('Up to six fulfilment groups are supported.', true);
  const store = {...initialState().stores[0], id: id(), name: `Fulfilment group ${state.stores.length + 1}`};
  state.stores.push(store); dirty.delete('store-form'); save(); $('store-edit').value = store.id; fillStore();
});
$('delete-store').addEventListener('click', () => {
  const storeId = $('store-edit').value;
  if (state.stores.length === 1) return message('حداقل یک فروشگاه باید باقی بماند؛ تنظیمات آن را ویرایش کنید.', true);
  if (state.offers.some((o) => o.store_id === storeId) || state.coupons.some((c) => c.store_id === storeId)) return message('ابتدا گزینه‌ها و کدهای این گروه را حذف کنید.', true);
  state.stores = state.stores.filter((s) => s.id !== storeId); dirty.delete('store-form'); save();
});
function replaceWorkspace(value) {
  state = value; dirty.clear();
  ['item-form','offer-form','coupon-form'].forEach(clearForm);
  save(); showTab('list');
}
$('demo').addEventListener('click', async () => {
  if ((state.items.length || dirty.size) && !confirm('نمونه با قیمت‌های ساختگی جایگزین لیست فعلی شود؟ در صورت نیاز ابتدا پشتیبان بگیرید.')) return;
  try { replaceWorkspace(await (await fetch('/api/demo')).json()); message('نمونه بارگذاری شد؛ همه قیمت‌ها و کدها ساختگی‌اند.'); }
  catch (error) { message(error.message, true); }
});
$('reset').addEventListener('click', () => {
  if (confirm('لیست خرید پاک شود؟ در صورت نیاز ابتدا پشتیبان بگیرید.')) { replaceWorkspace(initialState()); message('لیست خرید پاک شد.'); }
});
$('export').addEventListener('click', () => download(state, 'cartoptimizer-snapshot.json'));
$('export-plan').addEventListener('click', () => { if (plan) download({snapshot: state, plan}, 'cartoptimizer-plan.json'); });
$('import').addEventListener('click', () => {
  if (window.CartwiseAndroid) window.CartwiseAndroid.pickSnapshot();
  else $('file').click();
});
window.addEventListener('cartwise:import', async (event) => {
  try {
    const validated = await api('/api/validate', JSON.parse(event.detail));
    if ((state.items.length || dirty.size) && !confirm('فایل پشتیبان جایگزین لیست فعلی شود؟')) return;
    replaceWorkspace(validated.snapshot); message('پشتیبان بازیابی شد؛ تاریخ قیمت‌ها و آدرس را پیش از خرید بررسی کنید.');
  } catch (error) { message(error.message, true); }
});
$('file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('حجم پشتیبان نباید بیش از یک مگابایت باشد.');
    const value = JSON.parse(await file.text());
    const validated = await api('/api/validate', value);
    if ((state.items.length || dirty.size) && !confirm('فایل پشتیبان جایگزین لیست فعلی شود؟')) return;
    replaceWorkspace(validated.snapshot); message('پشتیبان بازیابی شد؛ تاریخ قیمت‌ها و آدرس را پیش از خرید بررسی کنید.');
  } catch (error) { message(error.message, true); }
  finally { event.target.value = ''; }
});
$('link-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  if (!state.items.length) return message('ابتدا کالا را به لیست اضافه کنید.', true);
  $('fetch-product').disabled = true; $('fetch-product').textContent = 'در حال خواندن صفحه…';
  try {
    const product = await api('/api/product', {url: new FormData($('link-form')).get('url')});
    clearForm('offer-form');
    const form = $('offer-form');
    form.elements.title.value = product.title; form.elements.url.value = product.url;
    form.elements.regular_price.value = product.observed_price / 10;
    form.elements.stock.value = ''; form.elements.confirmed.checked = false;
    importedMetadata = {captured_at: product.captured_at, source: 'digikala-public-page'};
    dirty.add('offer-form'); message(product.warnings.join(' '));
    form.scrollIntoView({behavior:'smooth',block:'start'});
  } catch (error) { message(error.message, true); }
  finally { $('fetch-product').disabled = false; $('fetch-product').textContent = 'خواندن صفحه کالا'; }
});
$('optimize').addEventListener('click', async () => {
  if (busy) return;
  if (dirty.size) return message('ابتدا تغییرات فرم را ذخیره یا پاک کنید.', true);
  const liveError=window.CartwiseLive?.checkBeforeOptimize(state);
  if(liveError) return message(liveError,true);
  if (!state.items.length || !state.offers.some((o) => o.confirmed)) return message('ابتدا لیست و گزینه‌های تأییدشده را اضافه کنید.', true);
  busy = true; $('optimize').textContent = 'در حال مقایسه سبدها…';
  const controls = [...document.querySelectorAll('button,input,select')].filter((el) => !el.disabled);
  controls.forEach((el) => { el.disabled = true; });
  message('در حال مقایسه تعداد، تخفیف‌ها و هزینه‌ها…');
  try { plan = await api('/api/optimize', state); renderPlan(plan); showTab('results'); message(plan.carts.length ? 'مقایسه تمام شد؛ نتیجه و مبلغ پرداخت را مرور کنید.' : plan.reason, !plan.carts.length); }
  catch (error) { message(error.message, true); }
  finally { busy = false; controls.forEach((el) => { el.disabled = false; }); $('optimize').innerHTML = 'پیدا کردن سبد خرید <span>→</span>'; }
});
(async () => {
  try {
    const cached = localStorage.getItem(STORAGE);
    if (cached) { const value = JSON.parse(cached); state = (await api('/api/validate', value)).snapshot; }
  } catch { message('لیست قبلی بازیابی نشد؛ پشتیبان را باز کنید یا لیست جدیدی بسازید.', true); }
  render();
})();
