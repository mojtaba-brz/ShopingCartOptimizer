"""Read-only smoke check using a public landmark, never the user's location."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from cartoptimizer.desktop import browse

public_fee_fields=[]
async def observe(page):
    async def response(reply):
        url=urlsplit(reply.url)
        if url.hostname!='api.digikalajet.ir' or not url.path.startswith('/shop/'):return
        try:data=await reply.json()
        except Exception:return
        def walk(x,path=''):
            if isinstance(x,list):
                for n,v in enumerate(x[:20]):walk(v,path+'/'+str(n))
            elif isinstance(x,dict):
                for k,v in x.items():
                    if k in ('user','account','address','token','customer','phone','products'):continue
                    if any(t in k for t in ('cost','fee','packing','preparation','vat','tax','shipping')) and type(v) in (int,float,bool) and len(public_fee_fields)<50:
                        public_fee_fields.append({'field':path+'/'+k,'value':v})
                    elif isinstance(v,(dict,list)):walk(v,path+'/'+k)
        walk(data)
    page.on('response',response)

record = {'scope': 'public-guest-catalogue-only', 'status': 'failed',
          'account_checkout_verified': False, 'products': 0, 'stores': 0}
try:
    options = {'executable_path': os.environ['CHROMIUM_PATH'], 'args': ['--no-sandbox']}
    result = browse([{'id': 'milk', 'name': 'شیر', 'query': 'شیر', 'quantity': 1}],
                    {'latitude': 35.757535, 'longitude': 51.40994, 'address': 'تهران، میدان ونک'},
                    lambda **data: print(json.dumps(data, ensure_ascii=False), flush=True),
                    browser_options=options, page_setup=observe, max_stores=1, page_seconds=7, item_seconds=70)
    products = result['items'][0]['products']
    record.update(products=len(products), stores=len({p.get('store_name') for p in products if p.get('store_name')}))
    record['amazing_offers'] = sum(p.get('amazing') is True for p in products)
    record['known_post_amazing_prices'] = sum(p.get('amazing') is True and p.get('post_amazing_verified') is True for p in products)
    record['public_price_samples'] = [{key:p.get(key) for key in ('title','store_name','regular_price','promo_price','amazing','post_amazing_price','post_amazing_verified')} for p in products if p.get('amazing') is True][:3]
    record['store_pages'] = len({p.get('store_id') for p in products if p.get('store_id')})
    quotes = result.get('checkout_quotes', [])
    shipping = [q for q in quotes if q.get('page_kind') == 'store' and isinstance(q.get('fields', {}).get('delivery_fee', {}).get('value'), int)]
    record['public_fee_response_fields'] = public_fee_fields
    record['observed_fee_fields'] = sorted({key for q in quotes for key in q.get('fields',{}) if key.endswith('_fee')})
    record['fee_headers_checked'] = len(result.get('fee_checks',[]))
    record['stores_with_shipping'] = len({q.get('store_id') or q.get('store_name') for q in shipping})
    record['shipping_samples_rials'] = [{key:q.get(key) for key in ('store_id','store_name','store_type')} | {'delivery_fee':q['fields']['delivery_fee']['value']} for q in shipping][-3:]
    assert shipping, 'No public store shipping fee verified'
    record['coverage_notice'] = result['items'][0].get('error')
    assert record['products'] > 0 and record['stores'] > 0, 'No public product/store data verified'
    record['status'] = 'success'
except Exception as exc:
    record['error_type'] = type(exc).__name__
    raise
finally:
    print(json.dumps(record, ensure_ascii=False), flush=True)
    Path('desktop-live-validation.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
