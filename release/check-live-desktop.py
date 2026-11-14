"""Read-only smoke check using a public landmark, never the user's location."""
import json
import os
from pathlib import Path
from cartoptimizer.desktop import browse

record = {'scope': 'public-guest-catalogue-only', 'status': 'failed',
          'account_checkout_verified': False, 'products': 0, 'stores': 0}
try:
    options = {'executable_path': os.environ['CHROMIUM_PATH'], 'args': ['--no-sandbox']}
    result = browse([{'id': 'milk', 'name': 'شیر', 'query': 'شیر', 'quantity': 1}],
                    {'latitude': 35.757535, 'longitude': 51.40994, 'address': 'تهران، میدان ونک'},
                    lambda **data: print(json.dumps(data, ensure_ascii=False), flush=True),
                    browser_options=options, max_stores=1, page_seconds=7, item_seconds=70)
    products = result['items'][0]['products']
    record.update(products=len(products), stores=len({p.get('store_name') for p in products if p.get('store_name')}))
    record['amazing_offers'] = sum(p.get('amazing') is True for p in products)
    record['known_post_amazing_prices'] = sum(p.get('amazing') is True and p.get('post_amazing_verified') is True for p in products)
    record['public_price_samples'] = [{key:p.get(key) for key in ('title','store_name','regular_price','promo_price','amazing','post_amazing_price','post_amazing_verified')} for p in products if p.get('amazing') is True][:3]
    record['store_pages'] = len({p.get('store_id') for p in products if p.get('store_id')})
    record['coverage_notice'] = result['items'][0].get('error')
    assert record['products'] > 0 and record['stores'] > 0, 'No public product/store data verified'
    record['status'] = 'success'
except Exception as exc:
    record['error_type'] = type(exc).__name__
    raise
finally:
    print(json.dumps(record, ensure_ascii=False), flush=True)
    Path('desktop-live-validation.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
