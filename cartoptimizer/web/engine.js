/* Offline pricing engine. Kept equivalent to the Python engine by parity tests. */
(function (root) {
  'use strict';
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const integer = (v, field, low = 0, high = 1e13) => {
    if (!Number.isSafeInteger(v) || v < low || v > high) throw Error(`${field}: expected an integer between ${low} and ${high}`);
    return v;
  };
  const label = (v, field, maximum = 300) => {
    if (typeof v !== 'string' || !v.trim() || [...v].length > maximum) throw Error(`${field}: expected nonempty text (up to ${maximum} characters)`);
    return v.trim();
  };
  const flag = (v, field) => { if (typeof v !== 'boolean') throw Error(`${field}: expected true or false`); return v; };
  const oneOf = (v, choices, field) => { if (!choices.includes(v)) throw Error(`${field}: must be ${choices.join(' or ')}`); return v; };
  function records(data, field, maximum, required = true) {
    const rows = data[field] ?? [];
    if (!Array.isArray(rows) || rows.length > maximum || (required && !rows.length) || rows.some((r) => !object(r))) throw Error(`${field}: invalid record list`);
    const ids = rows.map((r) => label(r.id, `${field}.id`, 100));
    if (new Set(ids).size !== ids.length || rows.some((r, i) => r.id !== ids[i])) throw Error(`${field}: IDs must be unique and have no surrounding whitespace`);
    return rows;
  }
  function normalize(data, draft = true) {
    if (!object(data)) throw Error('Snapshot must be a JSON object');
    if (data.schema_version !== 1) throw Error('schema_version must be 1');
    if (data.currency !== 'IRR') throw Error('currency must be IRR; 1 toman = 10 rials');
    const source = label(data.source, 'source', 100), context = label(data.context, 'context');
    if (typeof data.captured_at !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(data.captured_at) || !Number.isFinite(Date.parse(data.captured_at)) || Date.parse(data.captured_at) - Date.now() > 300000) throw Error('captured_at must be an ISO timestamp with timezone, not in the future');
    const stores = records(data, 'stores', 6).map((s) => ({id:s.id, name:label(s.name, 'stores.name'),
      delivery_fee:integer(s.delivery_fee ?? 0, 'delivery_fee'), service_fee:integer(s.service_fee ?? 0, 'service_fee'),
      minimum_order:integer(s.minimum_order ?? 0, 'minimum_order'),
      free_delivery_over:s.free_delivery_over == null ? null : integer(s.free_delivery_over, 'free_delivery_over'),
      threshold_basis:oneOf(s.threshold_basis ?? 'before_coupon', ['before_coupon','after_coupon'], 'threshold_basis')}));
    const items = records(data, 'items', 15, !draft).map((i) => ({id:i.id, name:label(i.name, 'items.name'), quantity:integer(i.quantity, 'items.quantity', 1, 50),...(i.department===undefined?{}:{department:oneOf(i.department,['supermarket','pastry','produce','meat_shop','bakery','pet_shop','all_mart'],'department')})}));
    const storeIds = new Set(stores.map((s) => s.id)), itemIds = new Set(items.map((i) => i.id));
    const offers = records(data, 'offers', 80, !draft).map((o) => {
      if (!storeIds.has(o.store_id) || !itemIds.has(o.item_id)) throw Error('Each offer must reference an existing store and shopping-list item');
      const regular = integer(o.regular_price, 'regular_price', 1), promo = o.promo_price == null ? null : integer(o.promo_price, 'promo_price', 0, regular);
      const limit = integer(o.promo_limit ?? 0, 'promo_limit', 0, 50);
      if (promo === null && limit) throw Error('A promo_limit requires a promo_price');
      const url = o.url ?? '';
      if (typeof url !== 'string' || url.length > 2000) throw Error('offer.url must be text of at most 2000 characters');
      return {...o, title:label(o.title, 'offers.title'), regular_price:regular, promo_price:promo, promo_limit:limit,
        promo_scope:oneOf(o.promo_scope ?? 'account', ['account','cart'], 'promo_scope'), stock:integer(o.stock, 'stock', 0, 500),
        confirmed:flag(o.confirmed ?? false, 'offers.confirmed'), url};
    });
    const coupons = records(data, 'coupons', 8, false).map((c) => {
      if (!storeIds.has(c.store_id)) throw Error('Coupon references an unknown store');
      const kind = oneOf(c.kind ?? 'fixed', ['fixed','percent'], 'coupon.kind');
      return {id:c.id, store_id:c.store_id, code:label(c.code, 'coupon.code', 100), kind,
        value:integer(c.value, 'coupon.value', 1, kind === 'percent' ? 10000 : 1e13),
        minimum_spend:integer(c.minimum_spend ?? 0, 'coupon.minimum_spend'),
        maximum_discount:c.maximum_discount == null ? null : integer(c.maximum_discount, 'coupon.maximum_discount'),
        max_uses:integer(c.max_uses ?? 1, 'coupon.max_uses', 1, 3), removes_promotions:flag(c.removes_promotions ?? true, 'coupon.removes_promotions')};
    });
    return {...data, source, context, stores, items, offers, coupons, max_carts:integer(data.max_carts ?? 1, 'max_carts', 1, 3)};
  }
  function* combinations(rows, count, start = 0, prefix = []) {
    if (!count) { yield prefix; return; }
    for (let i = start; i < rows.length; i++) yield* combinations(rows, count - 1, i, [...prefix, rows[i]]);
  }
  function* cartesian(rows, index = 0, prefix = []) {
    if (index === rows.length) { yield prefix; return; }
    for (const row of rows[index]) yield* cartesian(rows, index + 1, [...prefix, row]);
  }
  const get = (m, k) => m.get(k) || 0;
  const add = (m, k, n) => m.set(k, get(m, k) + n);
  const discount = (c, subtotal) => {
    // BigInt avoids multiplying a large rial subtotal beyond Number's exact range.
    const raw = c.kind === 'fixed' ? c.value : Number(BigInt(subtotal) * BigInt(c.value) / 10000n);
    return Math.min(subtotal, raw, c.maximum_discount ?? subtotal);
  };
  async function optimize(data, settings = {}) {
    const s = normalize(data, false), started = Date.now();
    const timeLimit = settings.timeLimit ?? 5000, stateLimit = settings.stateLimit ?? 200000;
    const offers = s.offers.filter((o) => o.confirmed && o.stock), warnings = [];
    if (s.source === 'demo') warnings.push('Demonstration prices only. This is not a live Digikala quote.');
    if (Date.now() - Date.parse(s.captured_at) > 3600000) warnings.push('Snapshot is over one hour old. Recheck prices, stock, fees and coupon eligibility.');
    if (s.offers.some((o) => !o.confirmed)) warnings.push('Unconfirmed offers were excluded. Review imported prices and quantity limits.');
    warnings.push('Results apply to the supplied location/account snapshot; recheck the checkout total before buying.');
    const missing = s.items.filter((i) => offers.filter((o) => o.item_id === i.id).reduce((n, o) => n + o.stock, 0) < i.quantity);
    if (missing.length) return {status:'infeasible', optimal:true, carts:[], total:null, warnings, reason:`Insufficient confirmed stock: ${missing.map((i) => i.name).join(', ')}`, states:0, elapsed_seconds:0};
    let states = 0, best = null, baseline = null;
    const limit = Symbol('search-limit');
    async function tick() {
      states++;
      if (states > stateLimit || Date.now() - started > timeLimit) throw limit;
      if (states % 1024 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    function evaluate(stores, chosen, carts) {
      if (carts.some((c) => !c.length)) return;
      const result = [];
      for (let slot = 0; slot < stores.length; slot++) {
        const store = stores[slot], c = chosen[slot], lines = carts[slot];
        const subtotal = lines.reduce((n, l) => n + l.subtotal, 0);
        if (c && subtotal < c.minimum_spend) return;
        const off = c ? discount(c, subtotal) : 0;
        const basis = store.threshold_basis === 'before_coupon' ? subtotal : subtotal - off;
        if (basis < store.minimum_order) return;
        const delivery = store.free_delivery_over !== null && basis >= store.free_delivery_over ? 0 : store.delivery_fee;
        result.push({store_id:store.id, store:store.name, coupon:c?.code ?? null, lines:lines.map((l) => ({...l})),
          subtotal, coupon_discount:off, delivery_fee:delivery, service_fee:store.service_fee, total:subtotal - off + delivery + store.service_fee});
      }
      const total = result.reduce((n, c) => n + c.total, 0);
      if (stores.length === 1 && !chosen[0]) baseline = baseline === null ? total : Math.min(baseline, total);
      if (best === null || total < best.total || (total === best.total && stores.length < best.carts.length)) best = {total, carts:result};
    }
    const line = (o, item, quantity, promo) => ({offer_id:o.id, item_id:item.id, item:item.name, title:o.title, quantity,
      promo_quantity:promo, regular_price:o.regular_price, promo_price:o.promo_price, url:o.url,
      subtotal:(quantity - promo) * o.regular_price + promo * (o.promo_price || 0)});
    for (const store of s.stores) {
      const lines = [];
      for (const item of s.items) {
        const candidates = offers.filter((o) => o.item_id === item.id && o.store_id === store.id && o.stock >= item.quantity);
        const cost = (o) => o.regular_price * item.quantity - (o.promo_price === null ? 0 : (o.regular_price - o.promo_price) * Math.min(item.quantity, o.promo_limit));
        candidates.sort((a, b) => cost(a) - cost(b));
        if (!candidates.length) break;
        const o = candidates[0]; lines.push(line(o, item, item.quantity, o.promo_price === null ? 0 : Math.min(item.quantity, o.promo_limit)));
      }
      if (lines.length === s.items.length) evaluate([store], [null], [lines]);
    }
    async function search(stores, chosen) {
      const carts = stores.map(() => []), stock = new Map(), quotas = new Map(), options = new Map();
      for (const item of s.items) options.set(item.id, stores.flatMap((store, slot) => offers.filter((o) => o.item_id === item.id && o.store_id === store.id).map((offer) => ({slot, offer}))));
      if (s.items.some((i) => !options.get(i.id).length)) return;
      const items = [...s.items].sort((a, b) => options.get(a.id).length - options.get(b.id).length || a.quantity - b.quantity);
      async function assign(index) {
        await tick();
        if (index === items.length) { evaluate(stores, chosen, carts); return; }
        const item = items[index], choices = options.get(item.id);
        async function allocate(optionIndex, remaining) {
          await tick();
          if (!remaining) { await assign(index + 1); return; }
          if (optionIndex === choices.length) return;
          const remainingOffers = new Map(choices.slice(optionIndex).map(({offer:o}) => [o.id, o]));
          if ([...remainingOffers.values()].reduce((n, o) => n + o.stock - get(stock, o.id), 0) < remaining) return;
          const {slot, offer:o} = choices[optionIndex], c = chosen[slot];
          const maximum = Math.min(remaining, o.stock - get(stock, o.id));
          const key = JSON.stringify([o.id, o.promo_scope === 'cart' ? slot : 'account']);
          for (let qty = maximum; qty >= 0; qty--) {
            if (!qty) { await allocate(optionIndex + 1, remaining); continue; }
            const promo = o.promo_price !== null && !(c && c.removes_promotions) ? Math.min(qty, o.promo_limit - get(quotas, key)) : 0;
            await tick();
            carts[slot].push(line(o, item, qty, promo)); add(stock, o.id, qty); add(quotas, key, promo);
            await allocate(optionIndex + 1, remaining - qty);
            add(quotas, key, -promo); add(stock, o.id, -qty); carts[slot].pop();
          }
        }
        await allocate(0, item.quantity);
      }
      await assign(0);
    }
    let complete = true;
    try {
      for (let count = 1; count <= s.max_carts; count++) {
        for (const stores of combinations(s.stores, count)) {
          const choices = stores.map((store) => [null, ...s.coupons.filter((c) => c.store_id === store.id)]);
          for (const chosen of cartesian(choices)) {
            await tick();
            const uses = new Map(); chosen.filter(Boolean).forEach((c) => add(uses, c.id, 1));
            if (chosen.some((c) => c && get(uses, c.id) > c.max_uses)) continue;
            await search(stores, chosen);
          }
        }
      }
    } catch (error) {
      if (error !== limit) throw error;
      complete = false; warnings.push('Search limit reached. The displayed plan is the best found; optimality is not proven.');
    }
    const result = {...(best || {total:null, carts:[]}), status:best ? (complete ? 'optimal' : 'best_found') : (complete ? 'infeasible' : 'limit_no_plan'),
      optimal:complete, states, elapsed_seconds:(Date.now() - started) / 1000, warnings,
      baseline_total:baseline, baseline_label:'Best single-cart, no-coupon plan found', savings:baseline !== null && best ? baseline - best.total : null,
      currency:'IRR', context:s.context, captured_at:s.captured_at};
    if (!best) result.reason = complete ? 'No feasible plan satisfies stock, minimum orders, coupon eligibility and cart limit.' : 'No feasible plan found before the search limit. Reduce choices or raise the cart limit.';
    return result;
  }
  const engine = {normalize, optimize};
  root.CartwiseEngine = engine;
  if (typeof module !== 'undefined') module.exports = engine;
})(typeof globalThis !== 'undefined' ? globalThis : window);
