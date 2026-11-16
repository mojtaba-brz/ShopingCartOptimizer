"""An app-owned persistent Jet browser. No cookie/token extraction or cart writes."""
import asyncio
from pathlib import Path
from urllib.parse import urlsplit
from .models import ValidationError

HOME = 'https://www.digikalajet.com/'
LOGIN = HOME+'user/login'
CART = HOME+'checkout/cart'
WEB = Path(__file__).parent/'web'
CHANNELS = ('chrome', 'msedge', None)


async def open_context(engine, directory, *, headless=True, channel=None, options=None):
    directory=Path(directory)
    directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    context=await engine.chromium.launch_persistent_context(str(directory),headless=headless,
        timeout=20000,accept_downloads=False,**({'channel':channel} if channel else {}),**(options or {}))
    return context


def connect(directory, report, *, preferred=None, options=None, setup=None, headless=False):
    return asyncio.run(_connect(directory,report,preferred=preferred,options=options,setup=setup,headless=headless))


async def _connect(directory,report,*,preferred,options,setup,headless):
    from playwright.async_api import async_playwright
    inspect=(WEB/'jet-account.js').read_text(encoding='utf-8')
    async with async_playwright() as engine:
        context=None;chosen=None
        for candidate in ([preferred] if preferred in ('chrome','msedge','chromium') else CHANNELS):
            channel=None if candidate=='chromium' else candidate
            try:
                context=await open_context(engine,Path(directory)/(channel or 'chromium'),headless=headless,channel=channel,options=options)
                chosen=channel or 'chromium';break
            except Exception:
                continue
        if context is None:raise ValidationError('مرورگر ورود باز نشد؛ Chrome یا Edge را نصب کنید و دوباره تلاش کنید.')
        closed=asyncio.Event();context.on('close',lambda *_:closed.set())
        last='login_required'
        try:
            page=await context.new_page()
            # The login window is restricted to the official Jet origin.
            async def allowed(route):
                req=route.request;url=urlsplit(req.url)
                if req.is_navigation_request() and req.frame.parent_frame is None and (url.scheme!='https' or url.hostname not in ('www.digikalajet.com','digikalajet.com')):
                    await route.abort()
                else:await route.continue_()
            await context.route('**/*',allowed)
            if setup:await setup(page)
            await page.goto(LOGIN,wait_until='domcontentloaded',timeout=30000)
            for _ in range(1200):
                report(detail='در صفحهٔ رسمی جت وارد شوید؛ پس از ورود پنجره را ببندید.')
                if closed.is_set() or page.is_closed():
                    if last=='login_required':raise ValidationError('ورود کامل نشد؛ دوباره «ورود به جت» را بزنید.')
                    return {'status':'saved','channel':chosen}
                try:last=(await page.evaluate('('+inspect+')()')).get('status','unknown')
                except Exception:
                    if not closed.is_set():last='unknown'
                if last=='signed_in':return {'status':'signed_in','channel':chosen}
                await asyncio.sleep(.5)
            raise ValidationError('زمان ورود تمام شد؛ دوباره «ورود به جت» را بزنید.')
        finally:
            if not closed.is_set():await context.close()


async def read_cart(context,delivery,*,setup=None):
    page=await context.new_page()
    try:
        if setup:await setup(page)
        await page.goto(CART,wait_until='domcontentloaded',timeout=20000)
        account=(WEB/'jet-account.js').read_text(encoding='utf-8')
        checkout=(WEB/'digikala-checkout.js').read_text(encoding='utf-8')
        for _ in range(20):
            info=await page.evaluate('('+account+')()')
            if info.get('status')=='login_required':return {'account_status':'login_required','checkout':None}
            quote=await page.evaluate(checkout)
            if quote and quote.get('page_kind')=='cart' and (quote.get('fields',{}).get('total') is not None or quote.get('cart_items')):
                if not quote.get('cart_items') and quote.get('fields',{}).get('total',{}).get('value')==0:return {'account_status':'saved','checkout':None,'notice':'سبد حساب خالی است.'}
                norm=lambda s:' '.join(str(s).replace('\u200c',' ').replace('ي','ی').replace('ك','ک').split())
                quote['delivery_verified']=bool(info.get('location')) and norm(info['location'])==norm(delivery.get('location'))
                return {'account_status':'saved','checkout':quote}
            await asyncio.sleep(.5)
        return {'account_status':'saved','checkout':None,'notice':'خواندن سبد حساب کامل نشد؛ مبلغ تأیید نشده است.'}
    finally:await page.close()
