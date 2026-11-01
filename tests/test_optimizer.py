import copy
from datetime import datetime, timezone
from itertools import product
import json
from pathlib import Path
import random
import unittest

from cartoptimizer.models import ValidationError, parse_snapshot
from cartoptimizer.optimizer import optimize


def sample():
    return {'schema_version': 1, 'currency': 'IRR', 'source': 'manual',
            'captured_at': datetime.now(timezone.utc).isoformat(), 'context': 'Test context', 'max_carts': 1,
            'stores': [{'id': 'dk', 'name': 'Digikala', 'delivery_fee': 0, 'service_fee': 0,
                        'minimum_order': 0, 'free_delivery_over': None, 'threshold_basis': 'before_coupon'}],
            'items': [{'id': 'milk', 'name': 'Milk', 'quantity': 3}],
            'offers': [{'id': 'a', 'item_id': 'milk', 'store_id': 'dk', 'title': 'Milk 1L',
                        'regular_price': 1000, 'promo_price': 600, 'promo_limit': 1,
                        'promo_scope': 'account', 'stock': 3, 'confirmed': True}], 'coupons': []}


def coupon(**kwargs):
    return dict({'id': 'coupon', 'store_id': 'dk', 'code': 'TEST', 'kind': 'fixed', 'value': 500,
                 'minimum_spend': 0, 'maximum_discount': None, 'max_uses': 1, 'removes_promotions': True}, **kwargs)


def oracle(data):
    """Independent unit-assignment oracle for tiny randomized test instances."""
    best = None
    units = [item['id'] for item in data['items'] for _ in range(item['quantity'])]
    for count in range(1, data['max_carts'] + 1):
        for stores in product(data['stores'], repeat=count):
            options = [[(slot, o) for slot, s in enumerate(stores) for o in data['offers']
                        if o['item_id'] == item and o['store_id'] == s['id'] and o['confirmed']]
                       for item in units]
            for assigned in product(*options):
                used = {o['id']: sum(a[1]['id'] == o['id'] for a in assigned) for o in data['offers']}
                if any(used[o['id']] > o['stock'] for o in data['offers']):
                    continue
                if any(not any(slot == c for slot, _ in assigned) for c in range(count)):
                    continue
                choices = [[None] + [c for c in data['coupons'] if c['store_id'] == s['id']] for s in stores]
                for coupons in product(*choices):
                    if any(sum(c is not None and c['id'] == coupon['id'] for c in coupons) > coupon['max_uses'] for coupon in data['coupons']):
                        continue
                    total = 0
                    promo_used = {}
                    for slot, (store, c) in enumerate(zip(stores, coupons)):
                        subtotal = 0
                        for offer in data['offers']:
                            qty = sum(a_slot == slot and a['id'] == offer['id'] for a_slot, a in assigned)
                            key = (offer['id'], slot if offer.get('promo_scope', 'account') == 'cart' else 'all')
                            promo = 0
                            if offer.get('promo_price') is not None and not (c and c['removes_promotions']):
                                promo = min(qty, offer['promo_limit'] - promo_used.get(key, 0))
                            promo_used[key] = promo_used.get(key, 0) + promo
                            subtotal += (qty - promo) * offer['regular_price'] + promo * (offer.get('promo_price') or 0)
                        if c and subtotal < c['minimum_spend']:
                            break
                        discount = 0
                        if c:
                            discount = c['value'] if c['kind'] == 'fixed' else subtotal * c['value'] // 10000
                            discount = min(subtotal, discount, c['maximum_discount'] if c['maximum_discount'] is not None else subtotal)
                        basis = subtotal if store['threshold_basis'] == 'before_coupon' else subtotal - discount
                        if basis < store['minimum_order']:
                            break
                        delivery = 0 if store['free_delivery_over'] is not None and basis >= store['free_delivery_over'] else store['delivery_fee']
                        total += subtotal - discount + delivery + store['service_fee']
                    else:
                        best = total if best is None else min(best, total)
    return best


class PricingTests(unittest.TestCase):
    def test_limited_promotion_excess_full_price(self):
        self.assertEqual(optimize(sample())['total'], 2600)

    def test_coupon_removes_promotions(self):
        data = sample(); data['coupons'] = [coupon(value=700)]
        result = optimize(data)
        self.assertEqual(result['total'], 2300)
        self.assertEqual(result['carts'][0]['lines'][0]['promo_quantity'], 0)

    def test_coupon_can_stack_when_explicit(self):
        data = sample(); data['coupons'] = [coupon(removes_promotions=False)]
        self.assertEqual(optimize(data)['total'], 2100)

    def test_recalculate_coupon_eligibility_on_normal_prices(self):
        data = sample(); data['coupons'] = [coupon(value=1000, minimum_spend=3000)]
        self.assertEqual(optimize(data)['total'], 2000)

    def test_ineligible_coupon_is_not_used(self):
        data = sample(); data['coupons'] = [coupon(value=1000, minimum_spend=3001)]
        self.assertIsNone(optimize(data)['carts'][0]['coupon'])

    def test_percentage_cap_and_rounding(self):
        data = sample(); data['coupons'] = [coupon(kind='percent', value=3333, maximum_discount=800)]
        self.assertEqual(optimize(data)['total'], 2200)
        data['coupons'][0].update(maximum_discount=None, removes_promotions=False)
        self.assertEqual(optimize(data)['total'], 1734)

    def test_cannot_waive_promo_to_get_free_delivery(self):
        data = sample(); data['stores'][0].update(delivery_fee=900, free_delivery_over=3000)
        self.assertEqual(optimize(data)['total'], 3500)

    def test_shipping_threshold_before_and_after_coupon(self):
        data = sample(); data['stores'][0].update(delivery_fee=500, free_delivery_over=3000)
        data['coupons'] = [coupon(value=700)]
        self.assertEqual(optimize(data)['total'], 2300)
        data['stores'][0]['threshold_basis'] = 'after_coupon'
        self.assertEqual(optimize(data)['total'], 2800)

    def test_promo_limits_shared_across_carts(self):
        data = sample(); data['max_carts'] = 3
        self.assertEqual(optimize(data)['total'], 2600)
        data['offers'][0]['promo_scope'] = 'cart'
        result = optimize(data)
        self.assertEqual(result['total'], 1800)
        self.assertEqual(len(result['carts']), 3)

    def test_coupon_usage_shared_across_carts(self):
        data = sample(); data['max_carts'] = 3; data['offers'][0].update(promo_price=None, promo_limit=0)
        data['coupons'] = [coupon(value=1500)]
        self.assertEqual(optimize(data)['total'], 1500)
        data['coupons'][0]['max_uses'] = 3
        self.assertEqual(optimize(data)['total'], 0)

    def test_stock_is_shared_across_carts(self):
        data = sample(); data['max_carts'] = 3; data['items'][0]['quantity'] = 4
        self.assertEqual(optimize(data)['status'], 'infeasible')

    def test_unconfirmed_excluded(self):
        data = sample(); data['offers'][0]['confirmed'] = False
        result = optimize(data)
        self.assertEqual(result['status'], 'infeasible')
        self.assertTrue(any('Unconfirmed' in s for s in result['warnings']))

    def test_minimum_order_and_cart_cap(self):
        data = sample(); data['stores'][0]['minimum_order'] = 3000
        self.assertEqual(optimize(data)['status'], 'infeasible')

    def test_substitute_brands_can_share_quantity(self):
        data = sample()
        data['offers'].append(dict(data['offers'][0], id='b', regular_price=900, promo_price=None, promo_limit=0))
        self.assertEqual(optimize(data)['total'], 2400)

    def test_demo_split_is_cheaper_than_single_cart(self):
        data = json.loads((Path(__file__).parents[1] / 'cartoptimizer/demo.json').read_text())
        result = optimize(data)
        self.assertEqual(result['total'], 3750000)
        self.assertEqual(len(result['carts']), 2)
        self.assertEqual(result['baseline_total'], 4200000)
        self.assertTrue(result['optimal'])

    def test_search_limit_never_claims_optimal(self):
        result = optimize(sample(), state_limit=1)
        self.assertEqual(result['status'], 'best_found')
        self.assertFalse(result['optimal'])
        self.assertEqual(result['total'], 2600)

    def test_limit_without_seed_is_not_infeasible(self):
        data = sample(); data['max_carts'] = 2
        data['stores'].append(dict(data['stores'][0], id='second'))
        data['offers'][0]['stock'] = 2
        data['offers'].append(dict(data['offers'][0], id='b', store_id='second'))
        self.assertEqual(optimize(data, state_limit=1)['status'], 'limit_no_plan')

    def test_randomized_against_independent_unit_oracle(self):
        rng = random.Random(20261101)
        for case in range(40):
            with self.subTest(case=case):
                data = sample(); data['max_carts'] = 2; data['items'][0]['quantity'] = rng.randint(1, 3)
                store = data['stores'][0]
                store.update(delivery_fee=rng.randint(0, 500), service_fee=rng.randint(0, 100),
                             free_delivery_over=rng.choice([None, 2000, 3000]),
                             minimum_order=rng.choice([0, 800]), threshold_basis=rng.choice(['before_coupon', 'after_coupon']))
                data['stores'].append(dict(store, id='second'))
                data['offers'][0].update(promo_scope=rng.choice(['cart','account']), stock=rng.randint(1, 3))
                data['offers'].append(dict(data['offers'][0], id='b', store_id='second', regular_price=900, promo_price=500))
                data['coupons'] = [coupon(value=rng.randint(100, 900), minimum_spend=rng.choice([0, 1500]),
                                          max_uses=rng.choice([1, 2]), removes_promotions=rng.choice([True, False]))]
                self.assertEqual(optimize(data)['total'], oracle(data))


class ValidationTests(unittest.TestCase):
    def test_money_must_be_integer_rials(self):
        for invalid in [True, '1000', 10.5, -1]:
            data = sample(); data['offers'][0]['regular_price'] = invalid
            with self.subTest(value=invalid), self.assertRaises(ValidationError): parse_snapshot(data)

    def test_invalid_reference_and_boolean(self):
        for key, value in [('store_id', ['dk']), ('item_id', 'missing'), ('confirmed', 'yes')]:
            data = sample(); data['offers'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValidationError): parse_snapshot(data)

    def test_duplicate_ids(self):
        data = sample(); data['offers'].append(copy.deepcopy(data['offers'][0]))
        with self.assertRaises(ValidationError): parse_snapshot(data)

    def test_timezone_is_required(self):
        data = sample(); data['captured_at'] = '2026-01-01T08:00:00'
        with self.assertRaises(ValidationError): parse_snapshot(data)

    def test_empty_draft_roundtrips(self):
        data = sample(); data['items'] = []; data['offers'] = []
        parse_snapshot(data, allow_draft=True)
        with self.assertRaises(ValidationError): parse_snapshot(data)


if __name__ == '__main__':
    unittest.main()
