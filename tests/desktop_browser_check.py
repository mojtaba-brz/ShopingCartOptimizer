"""Exercise the actual Python collector against offline HTTPS retailer fixtures."""
import os
from pathlib import Path
from cartoptimizer.desktop import browse


def main():
    root = Path(__file__).resolve().parents[1]
    html = (root / 'android/app/src/androidTest/assets/jet-search.html').read_text(encoding='utf-8')
    html = html.replace('فروشگاه ${', 'فروشگاه‌${')
    # A cold search document resets the guest point. Address bootstrap + SPA
    # routes must avoid this real retailer behavior rather than accepting it.
    html = """<script>if(location.pathname==='/user/add-address')sessionStorage.setItem('fixture-address-ready','1');else if(!sessionStorage.getItem('fixture-address-ready')){const r=JSON.parse(localStorage.getItem('persist:DKNow'));r.address=JSON.stringify({defaultAddress:{addressAddress:'اشتباه',addressLatitude:36,addressLongitude:52}});localStorage.setItem('persist:DKNow',JSON.stringify(r));}</script>""" + html + """<script>if(location.pathname==='/user/add-address')document.getElementById('root').insertAdjacentHTML('beforeend','<input placeholder="جستجوی آدرس">');</script>"""
    def setup(page):
        page.route('**/*', lambda route: route.fulfill(content_type='text/html; charset=utf-8', body=html)
                   if route.request.is_navigation_request() else route.fulfill(status=404, body=''))
    progress = []
    result = browse([{'id': 'milk', 'name': 'شیر', 'query': 'شیر', 'quantity': 1}],
                    {'latitude': 35.75, 'longitude': 51.4, 'address': 'تهران، ونک'},
                    lambda **data: progress.append(data), page_setup=setup,
                    browser_options=({'executable_path': os.environ['CHROMIUM_PATH'], 'args': ['--no-sandbox']}
                                     if os.environ.get('CHROMIUM_PATH') else {}))
    products = result['items'][0]['products']
    assert len(products) > 4, len(products)
    assert {'فروشگاه الف', 'فروشگاه ب'} <= {p['store_name'] for p in products}
    assert any(p['store_name'] == 'فروشگاه ب' and p['regular_price'] == 200 for p in products)
    assert progress and result['location'] == 'ارسال به تهران، ونک'
    print('Python desktop collector: verified address + multiple stores + beyond first four results passed')


if __name__ == '__main__':
    main()
