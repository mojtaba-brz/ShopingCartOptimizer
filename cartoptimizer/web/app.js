'use strict';
const $ = (id) => document.getElementById(id);
const STORAGE = 'cartoptimizer.workspace.v1';
const moneyFormat = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1});
const money = (rials) => moneyFormat.format(rials / 10);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id = () => crypto.randomUUID();
const dirty = new Set();
let plan = null;
let busy = false;
let importedMetadata = null;

function initialState() {
  return {schema_version: 1, currency: 'IRR', source: 'manual', captured_at: new Date().toISOString(),
    context: 'Unspecified location — verify delivery rules', max_carts: 1, items: [], offers: [], coupons: [],
    stores: [{id: 'digikala', name: 'Digikala Supermarket', delivery_fee: 0, service_fee: 0,
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
  if (!/^\d+(\.\d)?$/.test(String(value))) throw new Error('Enter prices in toman with at most one decimal place.');
  const rials = Math.round(Number(value) * 10);
  if (!Number.isSafeInteger(rials) || rials > 1e13) throw new Error('Price is too large.');
  return rials;
}
function number(value) { return Number(value); }
async function api(path, data) {
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
function save() {
  plan = null;
  $('export-plan').hidden = true;
  $('results').innerHTML = '<div class="empty card"><span class="empty-icon">▤</span><h3>Ready for a fresh comparison.</h3><p>Your inputs changed. Find the best cart again to update the plan.</p></div>';
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  catch { message('Browser storage is unavailable. Export your JSON snapshot to keep these changes.', true); }
  render();
}
function showTab(name) {
  if (!['list','offers','rules','results'].includes(name)) return;
  document.querySelectorAll('.tab-panel').forEach((el) => { el.hidden = el.id !== `tab-${name}`; });
  document.querySelectorAll('.nav').forEach((el) => el.classList.toggle('active', el.dataset.tab === name));
  $('tab-label').textContent = {list:'Shopping list', offers:'Product offers', rules:'Coupons & delivery', results:'Your cart plan'}[name];
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
  $('source-badge').textContent = state.source === 'demo' ? 'DEMO · invented prices' : `${state.source} snapshot`;
  $('source-badge').classList.toggle('demo', state.source === 'demo');
  $('snapshot-time').textContent = `Captured ${new Date(state.captured_at).toLocaleString()}`;
  $('items').innerHTML = state.items.length ? state.items.map((item, i) => `<div class="item-row"><span class="item-number">${String(i + 1).padStart(2, '0')}</span><div class="item-name"><strong dir="auto">${escapeHTML(item.name)}</strong><small>${state.offers.filter((o) => o.item_id === item.id).length} offers linked</small></div><input type="number" class="item-quantity" min="1" max="50" value="${item.quantity}" data-quantity="${escapeHTML(item.id)}" aria-label="Quantity for ${escapeHTML(item.name)}"><button class="icon-button" data-remove-item="${escapeHTML(item.id)}" aria-label="Remove ${escapeHTML(item.name)}">×</button></div>`).join('') : '<div class="empty"><span class="empty-icon">＋</span><h3>A fresh list starts here.</h3><p>Add your first item above, or load the demo to try a complete example.</p></div>';
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
    return `<article class="card offer-card"><div class="offer-meta"><span>${escapeHTML(item?.name)} · ${escapeHTML(store?.name)}</span><span class="badge ${offer.confirmed ? '' : 'demo'}">${offer.confirmed ? 'Reviewed' : 'Needs review'}</span></div><h3 dir="auto">${escapeHTML(offer.title)}</h3><p class="price">${money(promotional ? offer.promo_price : offer.regular_price)} <small>toman</small>${promotional ? `<del>${money(offer.regular_price)}</del>` : ''}</p><p>${promotional ? `${offer.promo_limit} promotional unit(s) ${offer.promo_scope === 'account' ? 'across all carts' : 'per cart'}` : 'Normal unit price'} · ${offer.stock} units available</p><div class="offer-actions"><button class="secondary" data-edit-offer="${escapeHTML(offer.id)}">Edit</button><button class="quiet danger" data-remove-offer="${escapeHTML(offer.id)}">Remove</button>${link ? `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Product ↗</a>` : ''}</div></article>`;
  }).join('');
  $('coupons').innerHTML = state.coupons.map((coupon) => `<article class="card offer-card"><span class="badge">${escapeHTML(state.stores.find((s) => s.id === coupon.store_id)?.name)}</span><h3>${escapeHTML(coupon.code)}</h3><p class="price">${coupon.kind === 'percent' ? `${coupon.value / 100}%` : `${money(coupon.value)} toman`}</p><p>From ${money(coupon.minimum_spend)} toman · ${coupon.max_uses} total use(s)${coupon.maximum_discount !== null ? ` · cap ${money(coupon.maximum_discount)} toman` : ''}</p><p>${coupon.removes_promotions ? 'Replaces promotional item prices' : 'Combines with promotional prices'}</p><div class="offer-actions"><button class="secondary" data-edit-coupon="${escapeHTML(coupon.id)}">Edit</button><button class="quiet danger" data-remove-coupon="${escapeHTML(coupon.id)}">Remove</button></div></article>`).join('');
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
  dirty.delete(formId);
  if (formId === 'offer-form') { importedMetadata = null; $('offer-form-title').textContent = 'Add an offer'; }
  if (formId === 'coupon-form') $('coupon-form-title').textContent = 'Add a coupon';
}
function editOffer(offerId) {
  const offer = state.offers.find((o) => o.id === offerId);
  const form = $('offer-form');
  importedMetadata = {captured_at: offer.captured_at, source: offer.source};
  for (const key of ['id','item_id','store_id','title','promo_limit','promo_scope','stock','url']) form.elements[key].value = offer[key] ?? '';
  for (const key of ['regular_price','promo_price']) form.elements[key].value = offer[key] === null ? '' : offer[key] / 10;
  form.elements.confirmed.checked = offer.confirmed;
  $('offer-form-title').textContent = 'Edit offer';
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
  $('coupon-form-title').textContent = 'Edit coupon';
  showTab('rules');
  form.scrollIntoView({behavior:'smooth', block:'start'});
}
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderPlan(result) {
  $('export-plan').hidden = !result.carts.length;
  const warnings = `<div class="warning-list">${result.warnings.map((w) => `<p>• ${escapeHTML(w)}</p>`).join('')}</div>`;
  if (!result.carts.length) {
    $('results').innerHTML = `<div class="card empty"><h3>${result.status === 'limit_no_plan' ? 'Search needs more time.' : 'No feasible cart yet.'}</h3><p>${escapeHTML(result.reason)}</p></div>${warnings}`;
    return;
  }
  const savings = result.savings;
  $('results').innerHTML = `<div class="metrics"><div class="card metric featured"><small>Total to pay</small><strong>${money(result.total)}<span>toman</span></strong><p>${result.carts.length} checkout${result.carts.length > 1 ? 's' : ''}, fees included</p></div><div class="card metric"><small>Compared with no coupon</small><strong>${savings === null ? '—' : money(savings)}<span>${savings === null ? '' : 'toman saved'}</span></strong><p>Best single-cart comparison found</p></div><div class="card metric"><small>Search result</small><strong>${result.optimal ? 'Optimal' : 'Best found'}</strong><p>${result.optimal ? 'Exhaustive search completed' : 'Search limit reached; may improve'}</p></div></div><p class="result-info">${escapeHTML(result.context)} · Snapshot: ${escapeHTML(result.captured_at)} · ${result.states.toLocaleString()} search states · ${result.elapsed_seconds}s. Purchase carts in the order shown.</p>${result.carts.map((cart, i) => `<article class="card"><div class="plan-header"><h3>Cart ${i + 1} <span class="slash">/</span> ${escapeHTML(cart.store)}</h3><span class="badge">${cart.coupon ? `Coupon: ${escapeHTML(cart.coupon)}` : 'Item offers · no coupon'}</span></div><div class="table-scroll"><table><thead><tr><th>PRODUCT</th><th>QTY</th><th>PROMOTIONAL / NORMAL UNITS</th><th>LINE TOTAL (TOMAN)</th></tr></thead><tbody>${cart.lines.map((line) => `<tr><td><span dir="auto">${escapeHTML(line.title)}</span><small dir="auto">${escapeHTML(line.item)}</small>${safeURL(line.url) ? `<a href="${escapeHTML(safeURL(line.url))}" target="_blank" rel="noopener noreferrer">View product ↗</a>` : ''}</td><td>${line.quantity}</td><td>${line.promo_quantity} / ${line.quantity - line.promo_quantity}<small>${line.promo_quantity ? `${money(line.promo_price)} promo · ` : ''}${money(line.regular_price)} normal</small></td><td>${money(line.subtotal)}</td></tr>`).join('')}</tbody></table></div><div class="totals"><div><span>Items subtotal</span><span>${money(cart.subtotal)}</span></div><div><span>Coupon discount</span><span>−${money(cart.coupon_discount)}</span></div><div><span>Delivery</span><span>${money(cart.delivery_fee)}</span></div><div><span>Service fee</span><span>${money(cart.service_fee)}</span></div><div class="grand-total"><span>Cart total</span><span>${money(cart.total)} toman</span></div></div></article>`).join('')}${warnings}`;
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
    if (!Number.isInteger(value) || value < 1 || value > 50) { message('Quantity must be between 1 and 50.', true); render(); return; }
    state.items.find((i) => i.id === event.target.dataset.quantity).quantity = value; save();
  }
});
for (const formId of ['item-form','offer-form','store-form','coupon-form','settings-form']) {
  $(formId).addEventListener('input', () => dirty.add(formId));
}
function submit(formId, handler) {
  $(formId).addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    try { await handler(new FormData($(formId))); message('Saved. Your cart plan will use these inputs.'); }
    catch (error) { message(error.message, true); }
  });
}
submit('item-form', (form) => {
  if (state.items.length >= 15) throw new Error('This version supports up to 15 shopping-list items.');
  const name = form.get('name').trim();
  if (!name) throw new Error('Enter an item name.');
  state.items.push({id: id(), name, quantity: number(form.get('quantity'))});
  clearForm('item-form'); save();
});
submit('offer-form', async (form) => {
  if (!form.get('item_id')) throw new Error('Add a shopping-list item first.');
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
});
submit('settings-form', (form) => {
  const context = form.get('context').trim();
  if (!context) throw new Error('Enter the location or account context.');
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
  if (state.stores.length === 1) return message('Keep at least one store. Edit its settings instead.', true);
  if (state.offers.some((o) => o.store_id === storeId) || state.coupons.some((c) => c.store_id === storeId)) return message('Remove this group’s offers and coupons first.', true);
  state.stores = state.stores.filter((s) => s.id !== storeId); dirty.delete('store-form'); save();
});
function replaceWorkspace(value) {
  state = value; dirty.clear();
  ['item-form','offer-form','coupon-form'].forEach(clearForm);
  save(); showTab('list');
}
$('demo').addEventListener('click', async () => {
  if ((state.items.length || dirty.size) && !confirm('Replace this workspace with invented demonstration prices? Export first to keep a copy.')) return;
  try { replaceWorkspace(await (await fetch('/api/demo')).json()); message('Demo loaded. All example prices and coupon codes are invented.'); }
  catch (error) { message(error.message, true); }
});
$('reset').addEventListener('click', () => {
  if (confirm('Clear the saved workspace? Export first to keep a backup.')) { replaceWorkspace(initialState()); message('Workspace cleared.'); }
});
$('export').addEventListener('click', () => download(state, 'cartoptimizer-snapshot.json'));
$('export-plan').addEventListener('click', () => { if (plan) download({snapshot: state, plan}, 'cartoptimizer-plan.json'); });
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('Snapshot exceeds the 1 MB limit.');
    const value = JSON.parse(await file.text());
    const validated = await api('/api/validate', value);
    if ((state.items.length || dirty.size) && !confirm('Replace this workspace with the imported snapshot?')) return;
    replaceWorkspace(validated.snapshot); message('Snapshot imported. Check the source, timestamp and location before planning.');
  } catch (error) { message(error.message, true); }
  finally { event.target.value = ''; }
});
$('link-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  if (!state.items.length) return message('Add a shopping-list item before importing a product.', true);
  $('fetch-product').disabled = true; $('fetch-product').textContent = 'Reading page…';
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
  finally { $('fetch-product').disabled = false; $('fetch-product').textContent = 'Read product page ↗'; }
});
$('optimize').addEventListener('click', async () => {
  if (busy) return;
  if (dirty.size) return message('Save or clear your edited forms before finding a cart. Unsaved form changes are not included.', true);
  if (!state.items.length || !state.offers.some((o) => o.confirmed)) return message('Add your shopping list and at least one reviewed offer first.', true);
  busy = true; $('optimize').textContent = 'Comparing cart plans…';
  const controls = [...document.querySelectorAll('button,input,select')].filter((el) => !el.disabled);
  controls.forEach((el) => { el.disabled = true; });
  message('Comparing quantities, promotional limits, coupons and fees…');
  try { plan = await api('/api/optimize', state); renderPlan(plan); showTab('results'); message(plan.carts.length ? 'Comparison complete. Review the cart order and checkout totals below.' : plan.reason, !plan.carts.length); }
  catch (error) { message(error.message, true); }
  finally { busy = false; controls.forEach((el) => { el.disabled = false; }); $('optimize').innerHTML = 'Find the best cart <span>→</span>'; }
});
(async () => {
  try {
    const cached = localStorage.getItem(STORAGE);
    if (cached) { const value = JSON.parse(cached); state = (await api('/api/validate', value)).snapshot; }
  } catch { message('The saved workspace could not be restored. Import a backup or start a fresh list.', true); }
  render();
})();
