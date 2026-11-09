"""Desktop retailer driver. Public pages only; no account or purchase actions."""
from __future__ import annotations
import importlib.util
import json
import math
import os
from pathlib import Path
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from .models import ValidationError

HOME = 'https://www.digikalajet.com/'
WEB = Path(__file__).parent / 'web'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def public_json(path):
    request = Request('https://api.digikalajet.ir' + path,
                      headers={'Accept': 'application/json', 'User-Agent': 'Sabadchin/0.10.0'})
    with build_opener(NoRedirect).open(request, timeout=12) as response:
        raw = response.read(524289)
        if len(raw) > 524288 or response.headers.get_content_type() != 'application/json':
            raise ValidationError('پاسخ سرویس نشانی معتبر نیست.')
    data = json.loads(raw)
    if data.get('status') != 200 or 'data' not in data:
        raise ValidationError('سرویس نشانی پاسخ معتبری نداد.')
    return data['data']


def point(value):
    if not isinstance(value, dict):
        raise ValidationError('نشانی معتبر نیست.')
    try:
        lat, lon = value['latitude'], value['longitude']
        if isinstance(lat, bool) or isinstance(lon, bool):
            raise ValueError()
        lat, lon = float(lat), float(lon)
        label = value.get('address') or value.get('title')
        if not (math.isfinite(lat) and math.isfinite(lon) and abs(lat) <= 90 and abs(lon) <= 180
                and isinstance(label, str) and 1 <= len(label.strip()) <= 300):
            raise ValueError()
        return {'latitude': lat, 'longitude': lon, 'address': label.strip(),
                'title': str(value.get('title') or label)[:300]}
    except (KeyError, TypeError, ValueError):
        raise ValidationError('مختصات یا نام نشانی معتبر نیست.')


def validate_items(items):
    if not isinstance(items, list) or not 1 <= len(items) <= 15:
        raise ValidationError('لیست باید بین ۱ تا ۱۵ قلم داشته باشد.')
    seen, result = set(), []
    for item in items:
        if not isinstance(item, dict):
            raise ValidationError('قلم خرید معتبر نیست.')
        identity, name, qty = item.get('id'), item.get('name'), item.get('quantity')
        query = item.get('query', name)
        if (not isinstance(identity, str) or not 1 <= len(identity) <= 100 or identity in seen
                or not isinstance(name, str) or not 1 <= len(name.strip()) <= 300
                or not isinstance(query, str) or not 1 <= len(query.strip()) <= 300
                or type(qty) is not int or not 1 <= qty <= 50):
            raise ValidationError('نام، تعداد یا شناسهٔ قلم خرید معتبر نیست.')
        seen.add(identity)
        result.append({'id': identity, 'name': name, 'quantity': qty, 'query': query})
    return result


class DesktopService:
    def __init__(self, directory=None, runner=None):
        base = Path(os.environ.get('LOCALAPPDATA') or Path.home() / '.local' / 'share')
        self.directory = Path(directory) if directory else base / 'Sabadchin'
        self.location_file = self.directory / 'delivery.json'
        self.location = None
        self.jobs = {}
        self.lock = threading.RLock()
        self.runner = runner or browse
        try:
            self.location = point(json.loads(self.location_file.read_text(encoding='utf-8')))
        except (OSError, ValueError, ValidationError):
            pass

    def addresses(self, query):
        if not isinstance(query, str) or not 2 <= len(query.strip()) <= 200:
            raise ValidationError('نام شهر و خیابان را وارد کنید.')
        rows = public_json('/map/search/?' + urlencode({'q': query.strip()}))
        if not isinstance(rows, list):
            raise ValidationError('نتیجهٔ جست‌وجوی نشانی معتبر نیست.')
        results = []
        for row in rows[:100]:
            try:
                results.append(point(row))
            except ValidationError:
                continue
        return results

    def select(self, value):
        selected = point(value)
        reply = public_json('/map/reverse/no-modal/?' + urlencode({
            'latitude': selected['latitude'], 'longitude': selected['longitude']}))
        if not isinstance(reply, dict) or reply.get('is_in_service_range') is not True:
            raise ValidationError('جت پوشش خدمات در این نقطه را تأیید نکرد؛ نشانی دیگری انتخاب کنید.')
        with self.lock:
            if any(j['state'] == 'running' for j in self.jobs.values()):
                raise ValidationError('ابتدا جست‌وجوی جاری را متوقف کنید.')
            self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            temp = self.location_file.with_suffix('.tmp')
            temp.write_text(json.dumps(selected, ensure_ascii=False), encoding='utf-8')
            try:
                temp.chmod(0o600)
            except OSError:
                pass
            temp.replace(self.location_file)
            self.location = selected
        return self.delivery()

    def delivery(self):
        with self.lock:
            return {'location': 'ارسال به ' + self.location['address'], 'shipment_type': 'on_demand'} if self.location else {}

    def start(self, items):
        items = validate_items(items)
        with self.lock:
            if not self.location:
                raise ValidationError('ابتدا موقعیت تحویل را انتخاب کنید.')
            if any(j['state'] == 'running' for j in self.jobs.values()):
                raise ValidationError('یک جست‌وجو در حال اجراست.')
            if self.runner is browse and importlib.util.find_spec('playwright') is None:
                raise ValidationError('اتصال دسکتاپ نصب نیست. در پوشهٔ پروژه اجرا کنید: py -m pip install -e ".[live]"')
            self.jobs = {}  # Retain only the current result, not search history.
            key = uuid.uuid4().hex
            job = {'id': key, 'state': 'running', 'completed': 0, 'total': len(items),
                   'detail': 'آماده‌سازی جست‌وجوی جت…', 'products': 0, 'stores': 0}
            self.jobs[key] = job
            location = dict(self.location)
            threading.Thread(target=self._run, args=(key, items, location), daemon=True).start()
            return {'id': key}

    def _run(self, key, items, location):
        def report(**fields):
            with self.lock:
                if self.jobs.get(key, {}).get('state') != 'running':
                    raise InterruptedError()
                self.jobs[key].update(fields)
        try:
            result = self.runner(items, location, report)
            report(result=result, state='done', completed=len(items), detail='مقایسه آماده است.')
        except InterruptedError:
            pass
        except Exception as exc:
            with self.lock:
                if self.jobs.get(key, {}).get('state') == 'running':
                    self.jobs[key].update(state='error', error=str(exc) if isinstance(exc, ValidationError) else
                                         'اتصال به جت کامل نشد؛ اینترنت و دسترسی Chrome یا Edge را بررسی کنید.')

    def status(self, key):
        with self.lock:
            if key not in self.jobs:
                raise ValidationError('جست‌وجو پیدا نشد؛ دوباره شروع کنید.')
            return dict(self.jobs[key])

    def cancel(self, key):
        if not isinstance(key, str) or len(key) != 32:
            raise ValidationError('شناسهٔ جست‌وجو معتبر نیست.')
        with self.lock:
            if key in self.jobs and self.jobs[key]['state'] == 'running':
                self.jobs[key].update(state='cancelled', detail='جست‌وجو متوقف شد.')
        return {'cancelled': True}

    def clear(self):
        with self.lock:
            self.location_file.unlink(missing_ok=True)
            self.location = None
            self.jobs.clear()
        return {'cleared': True}


SCROLL = """() => {let more=false;for(const e of [document.scrollingElement,...document.querySelectorAll('*')])if(e&&e.clientHeight>200&&e.scrollHeight>e.clientHeight+200&&(e===document.scrollingElement||['auto','scroll'].includes(getComputedStyle(e).overflowY))){e.scrollTop+=Math.max(400,e.clientHeight*.8);more ||= e.scrollTop+e.clientHeight<e.scrollHeight-20;}return more;}"""
EXPAND = """name => {for(const p of document.querySelectorAll('p.truncate'))if(p.innerText.trim()===name){let e=p.parentElement;for(let i=0;e&&i<6;i++,e=e.parentElement){const b=[...e.querySelectorAll('button')].find(b=>b.innerText.trim()==='مشاهده همه');if(b){b.click();return true;}}}return false;}"""


def browse(items, location, report, *, channel=None, page_setup=None, browser_options=None):
    from playwright.sync_api import sync_playwright
    reader = (WEB / 'jet-dom.js').read_text(encoding='utf-8')
    preference = (WEB / 'jet-location.js').read_text(encoding='utf-8')
    checkout = (WEB / 'digikala-checkout.js').read_text(encoding='utf-8')
    stamp = lambda: datetime.now(timezone.utc).isoformat()
    result = {'source': 'digikala-automatic', 'location': 'ارسال به ' + location['address'],
              'shipment_type': 'on_demand', 'captured_at': stamp(), 'items': [], 'checkout_quotes': []}
    with sync_playwright() as engine:
        browser = None
        for candidate in ([channel] if channel else ['chrome', 'msedge', None]):
            try:
                browser = engine.chromium.launch(headless=True, **({'channel': candidate} if candidate else {}), **(browser_options or {}))
                break
            except Exception:
                continue
        if browser is None:
            raise ValidationError('مرورگر جست‌وجو در دسترس نیست. Chrome یا Edge نصب کنید، یا اجرا کنید: py -m playwright install chromium')
        try:
            context = browser.new_context()
            saved = {'location': result['location'], 'coordinates': f"{location['latitude']}|{location['longitude']}"}
            context.add_init_script(script=f'({preference})("restore",{json.dumps(saved, ensure_ascii=False)})')
            page = context.new_page()
            page.set_default_timeout(10000)
            if page_setup:
                page_setup(page)
            quote_keys = set()
            for index, item in enumerate(items):
                deadline = time.monotonic() + 180
                report(completed=index, detail=f'جست‌وجوی «{item["name"]}»', products=0, stores=0)
                search_url = HOME + 'search/v2/result?' + urlencode({'q': item['query']})
                products, seen, shops, expanded, warnings = [], set(), set(), set(), []

                def collect(store='', shop_id=''):
                    current = urlsplit(page.url)
                    if current.scheme != 'https' or current.hostname not in ('www.digikalajet.com', 'digikalajet.com'):
                        raise ValidationError('جت جست‌وجو را به صفحهٔ دیگری هدایت کرد؛ داده‌ای وارد نشد.')
                    selected = page.evaluate(f'({preference})("read",{{}})')
                    if not selected.get('configured') or selected.get('coordinates') != f"{float(location['latitude']):g}|{float(location['longitude']):g}":
                        # Compare numbers rather than rounded coordinate strings.
                        xy = selected.get('coordinates', '').split('|')
                        if not selected.get('configured') or len(xy) != 2 or tuple(map(float, xy)) != (location['latitude'], location['longitude']):
                            raise ValidationError('موقعیت جت با موقعیت انتخاب‌شده یکسان نیست؛ جست‌وجو متوقف شد.')
                    data = page.evaluate(f'({reader})', {'store_name': store, 'expected_shop_id': shop_id})
                    for p in data.get('products', []):
                        identity = (p['title'], p.get('store_name'), p.get('store_id'), p['regular_price'], p.get('promo_price'))
                        if identity not in seen and len(products) < 1000:
                            seen.add(identity)
                            products.append(p)
                    for s in data.get('shops', []):
                        shops.add(s['name'])
                    quote = page.evaluate(checkout)
                    if quote and quote.get('fields'):
                        key = json.dumps({k: v for k, v in quote.items() if k != 'captured_at'}, sort_keys=True)
                        if key not in quote_keys and len(result['checkout_quotes']) < 100:
                            quote_keys.add(key)
                            result['checkout_quotes'].append(quote)
                    report(products=len(products), stores=len(shops), detail=f'«{item["name"]}» · {store or "یافتن فروشگاه‌ها"} · {len(products)} کالا')
                    if not data.get('products'):
                        text = page.locator('body').inner_text()[:1500].lower()
                        if any(t in text for t in ('verify you are human', 'checking your browser', 'unusual traffic', 'captcha')):
                            raise ValidationError('جت برای این اتصال درخواست تأیید انسانی داده است؛ جست‌وجوی خودکار متوقف شد.')
                    return data

                def scan(store='', shop_id=''):
                    quiet, started = 0, time.monotonic()
                    for step in range(120):
                        count = len(products)
                        data = collect(store, shop_id)
                        more = page.evaluate(SCROLL)
                        page.wait_for_timeout(700)
                        quiet = quiet + 1 if count == len(products) and not more else 0
                        if quiet >= 4 and (products or time.monotonic() - started > 15):
                            return data
                        if time.monotonic() - started > 90 or time.monotonic() > deadline or len(products) >= 1000:
                            break
                    warnings.append('پیمایش به سقف زمانی رسید؛ پوشش کامل تأیید نشده است.')
                    return data

                page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
                scan()
                while shops - expanded:
                    if len(expanded) >= 40 or time.monotonic() > deadline or len(products) >= 1000:
                        warnings.append('جست‌وجو به سقف تعداد یا زمان رسید؛ پوشش کامل تأیید نیست.')
                        break
                    name = sorted(shops - expanded)[0]
                    expanded.add(name)
                    # Let Jet's own view-all control choose the real store URL.
                    if page.url != search_url:
                        page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
                    opened = False
                    for _ in range(120):
                        if time.monotonic() > deadline:
                            break
                        collect()
                        if page.evaluate(EXPAND, name):
                            opened = True
                            break
                        if not page.evaluate(SCROLL):
                            break
                        page.wait_for_timeout(500)
                    if not opened:
                        warnings.append(f'صفحهٔ کامل فروشگاه {name} باز نشد.')
                        continue
                    try:
                        page.wait_for_url('**/search/shop?**', timeout=10000)
                    except Exception:
                        warnings.append(f'صفحهٔ کامل فروشگاه {name} پاسخ نداد.')
                        continue
                    from urllib.parse import parse_qs
                    shop_id = parse_qs(urlsplit(page.url).query).get('shopId', [''])[0]
                    if not shop_id:
                        warnings.append('شناسهٔ فروشگاه خوانده نشد.')
                        continue
                    scan(name, shop_id)
                result['items'].append({'id': item['id'], 'products': products,
                                        'error': '؛ '.join(warnings) or (None if products else 'کالای قابل خواندن پیدا نشد؛ دسترسی جت یا عبارت جست‌وجو را بررسی کنید.')})
            result['captured_at'] = stamp()
            return result
        finally:
            browser.close()
