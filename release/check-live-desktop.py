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
                    browser_options=options, max_stores=2, page_seconds=15, item_seconds=55)
    products = result['items'][0]['products']
    record.update(products=len(products), stores=len({p.get('store_name') for p in products if p.get('store_name')}))
    assert record['products'] > 0 and record['stores'] > 0, 'No public product/store data verified'
    record['status'] = 'success'
except Exception as exc:
    record['error_type'] = type(exc).__name__
    raise
finally:
    Path('desktop-live-validation.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
