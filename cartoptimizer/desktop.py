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
                      headers={'Accept': 'application/json', 'User-Agent': 'Sabadchin/0.13.0'})
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
        if item.get('department','supermarket') not in ('supermarket','pastry','produce','meat_shop','bakery','pet_shop','all_mart'): raise ValidationError('نوع فروشگاه معتبر نیست.')
        identity, name, qty = item.get('id'), item.get('name'), item.get('quantity')
        query = item.get('query', name)
        if (not isinstance(identity, str) or not 1 <= len(identity) <= 100 or identity in seen
                or not isinstance(name, str) or not 1 <= len(name.strip()) <= 300
                or not isinstance(query, str) or not 1 <= len(query.strip()) <= 300
                or type(qty) is not int or not 1 <= qty <= 50):
            raise ValidationError('نام، تعداد یا شناسهٔ قلم خرید معتبر نیست.')
        seen.add(identity)
        result.append({'id': identity, 'name': name, 'quantity': qty, 'query': query, 'department': item.get('department','supermarket')})
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
        label=reply.get('approximate_address') or reply.get('address')
        if isinstance(label,str) and 1<=len(label.strip())<=300:selected['address']=label.strip()
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
            return {'location': 'ارسال به ' + self.location['address'], 'shipment_type': 'on_demand','coordinates':f"{self.location['latitude']}|{self.location['longitude']}"} if self.location else {}

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
SCROLL_TOP = """() => {for(const e of [document.scrollingElement,...document.querySelectorAll('*')])if(e&&e.clientHeight>200&&e.scrollHeight>e.clientHeight+200&&(e===document.scrollingElement||['auto','scroll'].includes(getComputedStyle(e).overflowY)))e.scrollTop=0;}"""

def resource_budget():
    """Conservative available-memory budget; never start unlimited browsers."""
    cpu, mb = os.cpu_count() or 1, 512
    try:
        if os.name == 'nt':
            import ctypes
            class Memory(ctypes.Structure):
                _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [(n, ctypes.c_ulonglong) for n in
                    ['total', 'available', 'page_total', 'page_available', 'virtual_total', 'virtual_available', 'extended']]
            m = Memory(); m.length = ctypes.sizeof(m)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
                mb = m.available // 1048576
        else:
            mb = os.sysconf('SC_AVPHYS_PAGES') * os.sysconf('SC_PAGE_SIZE') // 1048576
    except (AttributeError, ValueError, OSError):
        pass
    workers = 4 if cpu >= 12 and mb >= 4096 else 3 if cpu >= 8 and mb >= 2048 else 2 if cpu >= 4 and mb >= 1024 else 1
    return {'workers': workers, 'base_carts': 3, 'max_carts': 3 + workers - 1,
            'state_limit': 20000 * workers, 'solve_ms': 200 * workers}


def browse(items, location, report, *, channel=None, page_setup=None, browser_options=None,
           max_stores=40, page_seconds=20, item_seconds=30, workers=None):
    import asyncio
    return asyncio.run(_browse(items, location, report, channel=channel, page_setup=page_setup,
        browser_options=browser_options, max_stores=max_stores, page_seconds=page_seconds,
        item_seconds=item_seconds, workers=workers))


async def _browse(items, location, report, *, channel, page_setup, browser_options,
                  max_stores, page_seconds, item_seconds, workers):
    import asyncio
    import inspect
    from playwright.async_api import async_playwright
    from urllib.parse import parse_qs
    budget = resource_budget()
    if workers is not None:
        budget['workers'] = max(1, min(4, int(workers)))
    sources = {key: (WEB / file).read_text(encoding='utf-8') for key, file in {
        'reader':'jet-dom.js', 'preference':'jet-location.js', 'checkout':'digikala-checkout.js',
        'navigation':'jet-navigation.js', 'expand':'jet-expand.js', 'fees':'jet-fees.js'}.items()}
    adapters = 'window.CartwiseSearchAdapters={' + ','.join(key+':'+(('()=>('+value+')') if key=='checkout' else '('+value+')') for key,value in sources.items()) + '};'
    metadata_script=(WEB/'retail-types.js').read_text(encoding='utf-8')+(WEB/'jet-catalog.js').read_text(encoding='utf-8')
    worker_script = (WEB / 'jet-search-task.js').read_text(encoding='utf-8')
    coordinates = f"{location['latitude']}|{location['longitude']}"
    saved = {'location':'ارسال به '+location['address'], 'coordinates':coordinates}
    result = {'source':'digikala-automatic', 'location':saved['location'], 'shipment_type':'on_demand','coordinates':coordinates,
        'items':[], 'checkout_quotes':[], 'resources':budget}
    entries, pending, aliases, queries = {}, {}, {}, {}
    queue = asyncio.Queue(); quote_keys = set(); active_tasks = 0; deadlines = {}; task_states = {}
    for item in items:
        query_key=(item['query'],item.get('department','supermarket'))
        if query_key in queries:
            aliases[queries[query_key]].append(item['id']); continue
        queries[query_key] = item['id']; aliases[item['id']] = [item['id']]
        entries[item['id']] = {'id':item['id'], 'products':[], 'error':None}; pending[item['id']] = 1
        await queue.put({**item, 'kind':'global', 'url':HOME+'search/v2/result?'+urlencode({'q':item['query']})})
    def progress(detail):
        report(completed=sum(len(aliases[k]) for k,n in pending.items() if n==0), products=sum(len(e['products']) for e in entries.values()),
            stores=len({p.get('store_name') for e in entries.values() for p in e['products'] if p.get('store_name')}),
            active_workers=active_tasks,tasks=list(task_states.values()), detail=detail)
    async with async_playwright() as engine:
        browser = None
        for candidate in ([channel] if channel else ['chrome', 'msedge', None]):
            try:
                browser = await engine.chromium.launch(headless=True, **({'channel':candidate} if candidate else {}), **(browser_options or {})); break
            except Exception:
                continue
        if browser is None:
            raise ValidationError('مرورگر جست‌وجو در دسترس نیست. Chrome یا Edge نصب کنید، یا اجرا کنید: py -m playwright install chromium')
        context = await browser.new_context(geolocation={k:location[k] for k in ('latitude','longitude')})
        await context.grant_permissions(['geolocation'], origin=HOME)
        await context.add_init_script(script=metadata_script+f'({sources["preference"]})("restore",{json.dumps(saved,ensure_ascii=False)})')
        async def lightweight(route):
            if route.request.resource_type in ('image','media','font'):
                await route.abort()
            else:
                await route.continue_()
        await context.route('**/*', lightweight)
        async def run_worker():
            nonlocal active_tasks
            page = await context.new_page(); page.set_default_timeout(10000)
            try:
                if page_setup:
                    value = page_setup(page)
                    if inspect.isawaitable(value): await value
                await page.goto(HOME+'user/add-address', wait_until='domcontentloaded', timeout=30000)
                await page.locator('#root input[placeholder]').first.wait_for(state='attached', timeout=20000)
                await page.evaluate(adapters + worker_script)
                while True:
                    task = await queue.get(); active_tasks += 1
                    slot=str(id(page)); task_states[slot]={'id':slot,'name':task['name'],'store':task.get('store_name',''),'kind':task['kind'],'products':0,'detail':'در حال دریافت'}
                    try:
                        deadlines.setdefault(task['id'], time.monotonic()+120)
                        remaining = deadlines[task['id']]-time.monotonic()
                        if remaining < 1:
                            entries[task['id']]['error']='بودجهٔ زمانی این قلم تمام شد؛ پوشش کامل تأیید نیست.'
                            pending[task['id']]-=1
                            progress('پایان بودجهٔ بررسی · '+task['name'])
                            continue
                        options = {**task, 'coordinates':coordinates, 'seconds':min(remaining,page_seconds if task['kind']=='store' else item_seconds), 'max_stores':max_stores}
                        await page.evaluate('(x)=>CartwiseSearchTask.start(x)', options)
                        until = time.monotonic() + options['seconds'] + 10
                        while True:
                            state = await page.evaluate('()=>window.cartwiseTask')
                            task_states[slot].update(products=state.get('products',0),detail=state.get('detail',''))
                            progress('جست‌وجوی موازی · '+task['name']+' · '+state.get('detail',''))
                            if state.get('fatal'): raise ValidationError(state['fatal'])
                            if state.get('done'): break
                            if time.monotonic()>until: raise ValidationError('صفحهٔ فروشگاه در مهلت بررسی پاسخ نداد.')
                            await asyncio.sleep(.35)
                        data = state['result']; entry = entries[task['id']]
                        products = data.get('products',[])
                        if task['kind']=='store' and products:
                            entry['products'] = [p for p in entry['products'] if p.get('store_name')!=task['store_name']]
                        seen = {json.dumps([p['title'],p.get('store_id'),p.get('store_name'),p['regular_price'],p.get('promo_price')]) for p in entry['products']}
                        for p in products:
                            key=json.dumps([p['title'],p.get('store_id'),p.get('store_name'),p['regular_price'],p.get('promo_price')])
                            if key not in seen and len(entry['products'])<1000: entry['products'].append(p);seen.add(key)
                        if data.get('error'): entry['error']='؛ '.join(filter(None,[entry['error'],data['error']]))
                        for q in data.get('checkout_quotes',[]):
                            key=json.dumps({k:v for k,v in q.items() if k!='captured_at'},sort_keys=True)
                            if key not in quote_keys and len(result['checkout_quotes'])<100: quote_keys.add(key);result['checkout_quotes'].append(q)
                        for child in data.get('store_tasks',[]):
                            u=urlsplit(child['url']); params=parse_qs(u.query)
                            if u.scheme!='https' or u.hostname!='www.digikalajet.com' or u.path!='/search/shop' or params.get('q')!=[task['query']]: continue
                            pending[task['id']]+=1
                            await queue.put({**task,**child})
                        pending[task['id']]-=1
                        progress('صفحه بررسی شد · '+task['name'])
                    finally:
                        active_tasks -= 1
                        task_states.pop(slot,None)
                        queue.task_done()
            finally:
                await page.close()
        running=[asyncio.create_task(run_worker()) for _ in range(budget['workers'])]
        join=asyncio.create_task(queue.join())
        try:
            done,_=await asyncio.wait([join,*running],return_when=asyncio.FIRST_COMPLETED)
            for job in done:
                if job is not join: await job
            await join
            result['items']=[{**entries[queries[(i['query'],i.get('department','supermarket'))]],'id':i['id']} for i in items]
            result['captured_at']=datetime.now(timezone.utc).isoformat()
            return result
        finally:
            join.cancel()
            for job in running: job.cancel()
            await asyncio.gather(*running,return_exceptions=True)
            await browser.close()

