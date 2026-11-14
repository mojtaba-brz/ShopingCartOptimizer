"""Exercise the actual Python collector against offline HTTPS retailer fixtures."""
import os
import asyncio
from pathlib import Path
from cartoptimizer.desktop import browse


def main():
    root = Path(__file__).resolve().parents[1]
    html = (root / 'android/app/src/androidTest/assets/jet-search.html').read_text(encoding='utf-8')
    html = html.replace('فروشگاه ${', 'فروشگاه‌${')
    # A cold search document resets the guest point. Address bootstrap + SPA
    # routes must avoid this real retailer behavior rather than accepting it.
    html = """<script>if(location.pathname==='/user/add-address')sessionStorage.setItem('fixture-address-ready','1');else if(!sessionStorage.getItem('fixture-address-ready')){const r=JSON.parse(localStorage.getItem('persist:DKNow'));r.address=JSON.stringify({defaultAddress:{addressAddress:'اشتباه',addressLatitude:36,addressLongitude:52}});localStorage.setItem('persist:DKNow',JSON.stringify(r));}</script>""" + html + """<script>if(location.pathname==='/user/add-address')document.getElementById('root').insertAdjacentHTML('beforeend','<input placeholder="جستجوی آدرس">');</script>"""
    # A route can change while old store cards remain visible. Delayed public
    # responses must settle before a product gets the next merchant's identity.
    html += """<script>const initialRender=render;window.removeEventListener('popstate',initialRender);render=()=>{const route=location.href;fetch('/fixture-delay').then(()=>{if(location.href===route)initialRender()})};window.addEventListener('popstate',render);</script>"""
    async def setup(page):
        async def route(request):
            if request.request.is_navigation_request():
                await request.fulfill(content_type='text/html; charset=utf-8',body=html)
            elif request.request.url.endswith('/fixture-delay'):
                await asyncio.sleep(1.2)
                await request.fulfill(content_type='application/json',body='{}')
            else:
                await request.fulfill(status=404,body='')
        await page.route('**/*',route)
    progress = []
    result = browse([{'id': 'milk', 'name': 'شیر', 'query': 'شیر', 'quantity': 1}, {'id': 'milk2', 'name': 'شیر 2 لیتر', 'query': 'شیر', 'quantity': 1}],
                    {'latitude': 35.75, 'longitude': 51.4, 'address': 'تهران، ونک'},
                    lambda **data: progress.append(data), page_setup=setup, workers=2,
                    browser_options=({'executable_path': os.environ['CHROMIUM_PATH'], 'args': ['--no-sandbox']}
                                     if os.environ.get('CHROMIUM_PATH') else {}))
    products = result['items'][0]['products']
    assert len(products) > 4, len(products)
    assert {'فروشگاه الف', 'فروشگاه ب'} <= {p['store_name'] for p in products}
    assert any(p['store_name'] == 'فروشگاه ب' and p['regular_price'] == 200 for p in products)
    assert not any(p['store_name']=='فروشگاه الف' and p['regular_price']==200 for p in products), 'Stale store cards were relabelled'
    assert len(result['items'])==2 and len(result['items'][1]['products'])==24
    assert result['resources']['workers']==2
    assert max(x.get('active_workers',0) for x in progress)==2
    assert progress and result['location'] == 'ارسال به تهران، ونک'
    print('Python desktop collector: verified address + multiple stores + beyond first four results passed')


if __name__ == '__main__':
    main()
