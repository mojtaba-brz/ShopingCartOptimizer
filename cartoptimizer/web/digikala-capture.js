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
  for (const image of document.querySelectorAll('img[alt]')) {
    if (products.length >= 60) break;
    const title = image.alt.trim();
    if (title.length < 4 || title.length > 300 || !visible(image)) continue;
    let card = image.parentElement, current = null;
    for (let depth = 0; card && depth < 6; depth++, card = card.parentElement) {
      // A card has exactly one product image and a toman-marked price.
      if (card.querySelectorAll('img[alt]').length !== 1) break;
      const toman = card.querySelector('img[src*="/toman."]');
      if (!toman) continue;
      current = Array.from(toman.parentElement.querySelectorAll('p,span')).map(e => price(text(e))).find(p => p !== null);
      if (current) break;
    }
    if (!card || !current || !card.querySelector('button[data-cro-id="add-one-more-to-cart"]:not(:disabled)')) continue;
    const originalNode = card.querySelector('.line-through, [class*="strikethrough"]');
    const originalText = originalNode ? text(originalNode) : '';
    const original = originalText ? price(originalText) : null;
    // Ambiguous crossed-out prices fail closed, rather than silently lose a promo.
    if (originalText && (!original || original < current)) continue;
    const regular = original || current;
    const key = title + '\u0000' + regular + '\u0000' + current;
    if (seen.has(key)) continue;
    seen.add(key);
    products.push({title, regular_price:regular, promo_price:current < regular ? current : null,
      promo_limit:current < regular ? 1 : 0, stock:1, url:location.origin + location.pathname,
      warning:'Page shows availability, not remaining stock or promotional quota. Planning is capped at 1 unit of this product across all carts.'});
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
