"""Isolated public guest fee probe. No account, login, purchase or payment."""
import asyncio,json,os,re
from pathlib import Path
from urllib.parse import urlsplit
from cartoptimizer.desktop import browse
started=False;report=[];money=[]
async def setup(page):
 async def response(reply):
  u=urlsplit(reply.url)
  if u.hostname!='api.digikalajet.ir' or not u.path.startswith('/cart/guest/'):return
  try:data=await reply.json()
  except Exception:return
  def walk(x,path=''):
   if isinstance(x,list):
    for n,v in enumerate(x[:8]):walk(v,path+'/'+str(n))
   elif isinstance(x,dict):
    for k,v in x.items():
     if k in ('user','account','address','token','customer','phone'):continue
     if re.search('price|cost|fee|packing|preparation|vat|tax|shipping|shop_id',k) and isinstance(v,(str,int,float,bool,type(None))):money.append({'field':path+'/'+k,'value':v})
     if isinstance(v,(dict,list)):walk(v,path+'/'+k)
  walk(data)
 async def probe():
  global started
  if started:return
  started=True
  info=await page.context.new_page();info.on('response',response)
  try:
   await info.goto('https://www.digikalajet.com/user/add-address',wait_until='domcontentloaded');await info.locator('#root input[placeholder]').first.wait_for(timeout=20000)
   nav=Path('cartoptimizer/web/jet-navigation.js').read_text()
   await info.evaluate('(u)=>('+nav+')(u)','https://www.digikalajet.com/search/v2/result?q=%D8%B4%DB%8C%D8%B1')
   add=info.locator('button[data-cro-id="add-one-more-to-cart"]:enabled').first
   await add.wait_for(timeout=20000);await add.click();await info.wait_for_timeout(4000)
   report.append({'stage':'after_guest_add','text':(await info.locator('body').inner_text())[-2500:],'links':await info.locator('a[href]').evaluate_all("es=>es.map(e=>({text:e.innerText,url:e.getAttribute('href')})).filter(x=>/cart|checkout/.test(x.url))"),'buttons':await info.locator('button').evaluate_all("es=>es.map(e=>({text:e.innerText,id:e.getAttribute('data-cro-id')})).filter(x=>x.text||x.id).slice(-20)")})
   button=info.locator('[data-cro-id="checkout_display_cart_sheet"]')
   if await button.count():await button.first.click();await info.wait_for_timeout(2500)
   else:await info.evaluate('(u)=>('+nav+')(u)','https://www.digikalajet.com/cart/');await info.wait_for_timeout(2500)
   report.append({'stage':'guest_cart','path':urlsplit(info.url).path,'text':(await info.locator('body').inner_text())[-5000:],'buttons':await info.locator('button').evaluate_all("es=>es.map(e=>({text:e.innerText,id:e.getAttribute('data-cro-id')})).filter(x=>x.text||x.id).slice(-20)")})
  except Exception as e:report.append({'error':type(e).__name__,'message':str(e)[:180]})
  finally:await info.close()
 await page.expose_binding('startFeeProbe',lambda source:probe())
 await page.add_init_script("setInterval(()=>{if(document.querySelector('button[data-cro-id=\"add-one-more-to-cart\"]:enabled'))window.startFeeProbe();},1000)")
r=browse([{'id':'milk','name':'شیر','query':'شیر','quantity':1}],{'latitude':35.757535,'longitude':51.40994,'address':'Tehran Vanak public test point'},lambda **x:None,page_setup=setup,browser_options={'executable_path':os.environ['CHROMIUM_PATH'],'args':['--no-sandbox']},max_stores=2,page_seconds=20,item_seconds=80,workers=1)
print(json.dumps({'report':report,'guest_fee_fields':money[:150]},ensure_ascii=False))
