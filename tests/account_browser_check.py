"""Synthetic first-party login session persists without exporting its contents."""
import asyncio,json,os,tempfile
from pathlib import Path
from cartoptimizer.account import connect,open_context,read_cart,HOME

LOGIN='''<div id="root"><button>خروج از حساب</button></div><script>localStorage.setItem('fixture-session','1');localStorage.setItem('fixture-private','not-for-export');history.replaceState({},'', '/profile')</script>'''
CART='''<div id="root"><p>ارسال به ونک</p><p>تعداد کالاها ۲</p><div data-store-name="ونک" data-store-id="1"><img alt="شیر یک لیتری"><span data-testid="cart-item-quantity">2</span></div><p>جمع کالاها ۲۰٬۰۰۰ تومان</p><p>هزینه ارسال ۳٬۰۰۰ تومان</p><p>هزینه بسته بندی ۱٬۰۰۰ تومان</p><p>مبلغ قابل پرداخت ۲۴٬۰۰۰ تومان</p></div><script>if(localStorage.getItem('fixture-session')!=='1'){document.getElementById('root').innerHTML='<input type="tel"><button>ادامه</button>';history.replaceState({},'', '/user/login')}</script>'''

async def setup(page,login=False):
    async def route(r):
        if r.request.is_navigation_request():await r.fulfill(content_type='text/html; charset=utf-8',body=LOGIN if login else CART)
        else:await r.fulfill(status=404,body='')
    await page.route('**/*',route)

async def check(folder,options):
    from playwright.async_api import async_playwright
    async with async_playwright() as engine:
        context=await open_context(engine,Path(folder)/'chromium',options=options)
        try:
            delivery={'location':'ارسال به ونک','coordinates':'35.75|51.4','shipment_type':'on_demand'}
            result=await read_cart(context,delivery,setup=setup)
            assert result['checkout']['fields']['packaging_fee']['value']==10000,result
            assert result['checkout']['delivery_verified'] is True
            assert result['checkout']['items_complete'] is True
            assert 'not-for-export' not in json.dumps(result)
            other=await read_cart(context,{**delivery,'location':'ارسال به انقلاب'},setup=setup)
            assert other['checkout']['delivery_verified'] is False
            page=await context.new_page();await setup(page);await page.goto(HOME);await page.evaluate("localStorage.removeItem('fixture-session')");await page.close()
            expired=await read_cart(context,delivery,setup=setup)
            assert expired=={'account_status':'login_required','checkout':None},expired
        finally:await context.close()

def main():
    options={'executable_path':os.environ['CHROMIUM_PATH'],'args':['--no-sandbox']}
    with tempfile.TemporaryDirectory() as folder:
        async def login_setup(page):await setup(page,True)
        result=connect(folder,lambda **x:None,preferred='chromium',options=options,setup=login_setup,headless=True)
        assert result=={'status':'signed_in','channel':'chromium'},result
        asyncio.run(check(folder,options))
    print('App-owned persistent login, read-only cart fees, delivery mismatch, session expiry and private-state exclusion passed')
if __name__=='__main__':main()
