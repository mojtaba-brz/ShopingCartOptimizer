"""Ensure the Android JavaScript engine agrees with the desktop Python engine."""
import copy
import json
from pathlib import Path
import random
import shutil
import subprocess
import unittest

from cartoptimizer.optimizer import optimize
from tests.test_optimizer import sample, coupon

ROOT = Path(__file__).parents[1]


@unittest.skipUnless(shutil.which('node'), 'Node.js is needed for Android engine parity')
class MobileEngineTests(unittest.TestCase):
    def test_android_python_pricing_parity(self):
        rng = random.Random(271828)
        fixtures = [json.loads((ROOT / 'cartoptimizer/demo.json').read_text())]
        for case in range(60):
            data = sample(); data['max_carts'] = rng.choice([1, 2])
            data['items'][0]['quantity'] = rng.randint(1, 3)
            store = data['stores'][0]
            store.update(delivery_fee=rng.randint(0, 700), service_fee=rng.randint(0, 100),
                         free_delivery_over=rng.choice([None, 2000, 3000]), minimum_order=rng.choice([0, 1000]),
                         threshold_basis=rng.choice(['before_coupon', 'after_coupon']))
            if case % 3 == 0:
                data['stores'].append(dict(store, id='second'))
            data['offers'][0].update(promo_scope=rng.choice(['cart', 'account']), stock=rng.randint(1, 5))
            data['offers'].append(dict(data['offers'][0], id='b', store_id=data['stores'][-1]['id'], regular_price=900, promo_price=500))
            if case % 2 == 0:
                data['items'].append({'id':'rice', 'name':'برنج', 'quantity':1})
                data['offers'].append(dict(data['offers'][0], id='r', item_id='rice', regular_price=1500, promo_price=1200))
            data['coupons'] = [coupon(kind=rng.choice(['fixed','percent']), value=rng.randint(100, 900),
                                      minimum_spend=rng.choice([0, 1000, 3000]), maximum_discount=rng.choice([None, 700]),
                                      max_uses=rng.choice([1, 2]), removes_promotions=rng.choice([True, False]))]
            fixtures.append(data)
        large = sample()
        large['items'][0]['quantity'] = 50
        large['offers'][0].update(regular_price=10**13, promo_price=None, promo_limit=0, stock=50)
        large['coupons'] = [coupon(kind='percent', value=3333)]
        fixtures.append(large)
        process = subprocess.run(['node', str(ROOT / 'android/tests/run-engine.cjs')], input=json.dumps(fixtures),
                                 text=True, encoding='utf-8', capture_output=True, timeout=60, check=True)
        results = json.loads(process.stdout)
        for index, (data, actual) in enumerate(zip(fixtures, results)):
            with self.subTest(fixture=index):
                expected = optimize(copy.deepcopy(data), time_limit=30, state_limit=1000000)
                for field in ['total','status','optimal','baseline_total','savings','states','carts']:
                    self.assertEqual(actual.get(field), expected.get(field), field)
        self.assertEqual(len(results), len(fixtures))


if __name__ == '__main__':
    unittest.main()
