"""Bounded exhaustive search over offers, quantities, carts, tiers and coupons.

No assumption that price is constant with quantity. A result is called optimal only
when the complete finite search finishes. Limits return the best feasible plan found.
"""
from collections import Counter
from datetime import datetime, timezone
from itertools import combinations_with_replacement, product
import time

from .models import parse_snapshot


class SearchLimit(Exception):
    pass


def optimize(data, *, time_limit=5.0, state_limit=200_000):
    snapshot = parse_snapshot(data)
    started = time.monotonic()
    offers = [o for o in snapshot.offers if o.confirmed and o.stock]
    warnings = []
    if snapshot.source == 'demo':
        warnings.append('Demonstration prices only. This is not a live Digikala quote.')
    if (datetime.now(timezone.utc) - snapshot.captured_at).total_seconds() > 3600:
        warnings.append('Snapshot is over one hour old. Recheck prices, stock, fees and coupon eligibility.')
    if any(not o.confirmed for o in snapshot.offers):
        warnings.append('Unconfirmed offers were excluded. Review imported prices and quantity limits.')
    warnings.append('Results apply to the supplied location/account snapshot; recheck the checkout total before buying.')
    missing = [name for item, name, qty in snapshot.items
               if sum(o.stock for o in offers if o.item_id == item) < qty]
    if missing:
        return {'status': 'infeasible', 'optimal': True, 'carts': [], 'total': None,
                'warnings': warnings, 'reason': 'Insufficient confirmed stock: ' + ', '.join(missing),
                'states': 0, 'elapsed_seconds': 0}
    states = 0
    best = None
    best_key = None
    baseline = None

    def tick():
        nonlocal states
        states += 1
        if states > state_limit or time.monotonic() - started > time_limit:
            raise SearchLimit()

    def evaluate(stores, chosen, carts):
        nonlocal best, best_key, baseline
        if any(not lines for lines in carts):
            return
        result_carts = []
        for store, coupon, lines in zip(stores, chosen, carts):
            subtotal = sum(line['subtotal'] for line in lines)
            if coupon and subtotal < coupon.minimum_spend:
                return
            discount = coupon.discount(subtotal) if coupon else 0
            basis = subtotal if store.threshold_basis == 'before_coupon' else subtotal - discount
            if basis < store.minimum_order:
                return
            shipping = 0 if store.free_delivery_over is not None and basis >= store.free_delivery_over else store.delivery_fee
            total = subtotal - discount + shipping + store.service_fee
            result_carts.append({'store_id': store.id, 'store': store.name,
                                 'coupon': coupon.code if coupon else None,
                                 'lines': [dict(line) for line in lines], 'subtotal': subtotal,
                                 'coupon_discount': discount, 'delivery_fee': shipping,
                                 'service_fee': store.service_fee, 'total': total})
        total = sum(c['total'] for c in result_carts)
        if len(stores) == 1 and not chosen[0]:
            baseline = total if baseline is None else min(baseline, total)
        key = (total, len(stores))
        if best_key is None or key < best_key:
            best_key = key
            best = {'total': total, 'carts': result_carts}

    def search(stores, chosen):
        carts = [[] for _ in stores]
        stock_used = Counter()
        promo_used = Counter()
        options_by_item = {item: [(slot, offer) for slot, store in enumerate(stores)
                                  for offer in offers if offer.store_id == store.id and offer.item_id == item]
                           for item, _, _ in snapshot.items}
        if any(not options_by_item[item] for item, _, _ in snapshot.items):
            return
        items = sorted(snapshot.items, key=lambda item: (len(options_by_item[item[0]]), item[2]))

        def assign_item(index):
            tick()
            if index == len(items):
                evaluate(stores, chosen, carts)
                return
            item_id, item_name, quantity = items[index]
            options = options_by_item[item_id]

            def allocate(option_index, remaining):
                tick()
                if remaining == 0:
                    assign_item(index + 1)
                    return
                if option_index == len(options):
                    return
                # Capacity bound counts each offer once even if available in several carts.
                remaining_offers = {o.id: o for _, o in options[option_index:]}
                if sum(o.stock - stock_used[o.id] for o in remaining_offers.values()) < remaining:
                    return
                slot, offer = options[option_index]
                maximum = min(remaining, offer.stock - stock_used[offer.id])
                coupon = chosen[slot]
                promo_key = (offer.id, slot if offer.promo_scope == 'cart' else 'account')
                for quantity_here in range(maximum, -1, -1):
                    if quantity_here == 0:
                        allocate(option_index + 1, remaining)
                        continue
                    max_promo = 0
                    if offer.promo_price is not None and not (coupon and coupon.removes_promotions):
                        max_promo = min(quantity_here, offer.promo_limit - promo_used[promo_key])
                    # Promotions apply automatically. Earlier carts consume an
                    # account-wide quota first; customers cannot waive a discount
                    # just to cross a shipping/coupon threshold.
                    for promotional in (max_promo,):
                        tick()
                        subtotal = ((quantity_here - promotional) * offer.regular_price
                                    + promotional * (offer.promo_price or 0))
                        # Partial item spend is a safe lower bound: coupons never discount
                        # more than subtotal, so use no cost pruning without a stronger bound.
                        line = {'offer_id': offer.id, 'item_id': item_id, 'item': item_name,
                                'title': offer.title, 'quantity': quantity_here,
                                'promo_quantity': promotional, 'regular_price': offer.regular_price,
                                'promo_price': offer.promo_price, 'subtotal': subtotal, 'url': offer.url}
                        carts[slot].append(line)
                        stock_used[offer.id] += quantity_here
                        promo_used[promo_key] += promotional
                        allocate(option_index + 1, remaining - quantity_here)
                        promo_used[promo_key] -= promotional
                        stock_used[offer.id] -= quantity_here
                        carts[slot].pop()

            allocate(0, quantity)

        assign_item(0)

    # Seed a feasible plan cheaply before exploring allocations. This also supplies
    # a clearly labelled single-cart/no-coupon comparison when one is available.
    for store in snapshot.stores:
        lines = []
        for item, name, qty in snapshot.items:
            candidates = [o for o in offers if o.item_id == item and o.store_id == store.id and o.stock >= qty]
            if not candidates:
                break
            offer = min(candidates, key=lambda o: o.regular_price * qty -
                        ((o.regular_price - o.promo_price) * min(qty, o.promo_limit) if o.promo_price is not None else 0))
            promotional = min(qty, offer.promo_limit) if offer.promo_price is not None else 0
            lines.append({'offer_id': offer.id, 'item_id': item, 'item': name, 'title': offer.title,
                          'quantity': qty, 'promo_quantity': promotional, 'regular_price': offer.regular_price,
                          'promo_price': offer.promo_price, 'url': offer.url,
                          'subtotal': (qty - promotional) * offer.regular_price + promotional * (offer.promo_price or 0)})
        if len(lines) == len(snapshot.items):
            evaluate((store,), (None,), [lines])

    complete = True
    try:
        for count in range(1, snapshot.max_carts + 1):
            for stores in combinations_with_replacement(snapshot.stores, count):
                choices = [[None] + [c for c in snapshot.coupons if c.store_id == store.id] for store in stores]
                for chosen in product(*choices):
                    tick()
                    used = Counter(c.id for c in chosen if c)
                    if any(used[c.id] > c.max_uses for c in chosen if c):
                        continue
                    search(stores, chosen)
    except SearchLimit:
        complete = False
        warnings.append('Search limit reached. The displayed plan is the best found; optimality is not proven.')
    result = best or {'total': None, 'carts': []}
    result.update({'status': ('optimal' if complete else 'best_found') if best else ('infeasible' if complete else 'limit_no_plan'),
                   'optimal': complete, 'states': states, 'elapsed_seconds': round(time.monotonic() - started, 3),
                   'warnings': warnings, 'baseline_total': baseline,
                   'baseline_label': 'Best single-cart, no-coupon plan found',
                   'savings': baseline - best['total'] if baseline is not None and best else None,
                   'currency': 'IRR', 'context': snapshot.context, 'captured_at': snapshot.captured_at.isoformat()})
    if not best:
        result['reason'] = ('No feasible plan satisfies stock, minimum orders, coupon eligibility and cart limit.'
                            if complete else 'No feasible plan found before the search limit. Reduce choices or raise the cart limit.')
    return result
