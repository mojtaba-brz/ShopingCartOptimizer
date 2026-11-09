"""Exercise the actual Python collector against offline HTTPS retailer fixtures."""
import os
from pathlib import Path
from cartoptimizer.desktop import browse


def main():
    root = Path(__file__).resolve().parents[1]
    html = (root / 'android/app/src/androidTest/assets/jet-search.html').read_text(encoding='utf-8')
    def setup(page):
        page.route('**/*', lambda route: route.fulfill(content_type='text/html; charset=utf-8', body=html)
                   if route.request.is_navigation_request() else route.fulfill(status=404, body=''))
    progress = []
    result = browse([{'id': 'milk', 'name': 'شیر', 'query': 'شیر', 'quantity': 1}],
                    {'latitude': 35.75, 'longitude': 51.4, 'address': 'تهران، ونک'},
                    lambda **data: progress.append(data), page_setup=setup,
                    browser_options={'executable_path': os.environ['CHROMIUM_PATH'], 'args': ['--no-sandbox']})
    products = result['items'][0]['products']
    assert len(products) > 4, len(products)
    assert {'فروشگاه الف', 'فروشگاه ب'} <= {p['store_name'] for p in products}
    assert any('مشاهده' not in p['title'] for p in products)
    assert progress and result['location'] == 'ارسال به تهران، ونک'
    print('Python desktop collector: verified address + multiple stores + beyond first four results passed')


if __name__ == '__main__':
    main()
