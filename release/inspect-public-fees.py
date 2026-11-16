import asyncio,json,os
from urllib.parse import urlsplit
from cartoptimizer.desktop import browse
samples=[];texts=set()
async def setup(page):
 async def response(reply):
  u=urlsplit(reply.url)
  if u.hostname!='api.digikalajet.ir' or not u.path.startswith(('/shop/','/v2/search/','/search/shop/')):return
  try:data=await reply.json()
  except Exception:return
  def walk(x):
   if isinstance(x,list):
    for y in x[:100]:walk(y)
   elif isinstance(x,dict):
    if x.get('id') is not None and isinstance(x.get('title'),str) and 'delivery' in x and len(samples)<10:
     keys=[k for k in x if any(w in k.lower() for w in ('fee','delivery','minimum','packag','service','order','payment'))]
     samples.append({'path':u.path,'shop':x['title'],'fields':{k:x[k] for k in keys}})
    for k,v in x.items():
     if k not in ('account','user','address','cart','token','customer'):walk(v)
  walk(data)
 page.on('response',response)
 await page.expose_binding('reportPublicFeeLabels',lambda source,rows:texts.update(rows))
 await page.add_init_script("""setInterval(()=>{const rows=[...document.querySelectorAll('p,span,div,li,button,a')].filter(e=>e.getClientRects().length&&e.children.length<4).map(e=>e.innerText?.replace(/[\\u200c\\s]+/g,' ').trim()).filter(s=>s&&s.length<160&&/(ارسال|بسته بندی|خدمات|کارمزد|حداقل)/.test(s));if(rows.length)window.reportPublicFeeLabels([...new Set(rows)].slice(0,40));},1000);""")
r=browse([{'id':'milk','name':'شیر','query':'شیر','quantity':1}],{'latitude':35.757535,'longitude':51.40994,'address':'Tehran Vanak public test point'},lambda **x:None,page_setup=setup,browser_options={'executable_path':os.environ['CHROMIUM_PATH'],'args':['--no-sandbox']},max_stores=2,page_seconds=12,item_seconds=65,workers=1)
print(json.dumps({'catalogue_shop_delivery':samples,'visible_fee_labels':list(texts)[:70],'observed_quotes':r['checkout_quotes'][:15]},ensure_ascii=False))
