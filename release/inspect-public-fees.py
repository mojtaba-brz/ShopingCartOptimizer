"""Probe the public anonymous guest validation contract, without account/cart mutation."""
import asyncio,json,os
from pathlib import Path
from urllib.parse import urlsplit
from cartoptimizer.desktop import browse
samples=[];done=False;results=[]
async def setup(page):
 async def response(reply):
  global done
  if done or urlsplit(reply.url).hostname!='api.digikalajet.ir' or not urlsplit(reply.url).path.startswith('/v2/search/'):return
  try:data=await reply.json()
  except Exception:return
  def walk(x):
   if isinstance(x,list):
    for v in x:walk(v)
   elif isinstance(x,dict):
    if isinstance(x.get('products'),list) and x.get('id'):
     ps=[p['id'] for p in x['products'] if p.get('id') and p.get('stock',{}).get('has_stock')]
     if ps:samples.append({'shop':x['id'],'products':ps[:2]})
    for k,v in x.items():
     if k not in ('user','account','token','address'):walk(v)
  walk(data)
  if not samples:return
  done=True
  for sample in samples[:2]:
   for count in [1,2]:
    payload={'shop_products':[{'id':p,'quantity':count,'extensions':[]} for p in sample['products']],'latitude':35.757535,'longitude':51.40994}
    result=await page.evaluate("""async payload=>{try{const r=await fetch('https://api.digikalajet.ir/cart/guest/validate/',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();const fields=[];function walk(x,path=''){if(Array.isArray(x))x.slice(0,10).forEach((v,n)=>walk(v,path+'/'+n));else if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){if(['user','account','address','token','customer','phone'].includes(k))continue;if(/price|cost|fee|packing|preparation|vat|tax|shipping|shop_id|minimum/.test(k)&&(!v||typeof v!=='object'))fields.push({field:path+'/'+k,value:v});if(v&&typeof v==='object')walk(v,path+'/'+k);}}walk(d);return {http:r.status,status:d.status,fields};}catch(e){return{error:e.name}}}""",payload)
    results.append({'shop':sample['shop'],'quantity':count,'result':result})
 page.on('response',response)
r=browse([{'id':'milk','name':'شیر','query':'شیر','quantity':1}],{'latitude':35.757535,'longitude':51.40994,'address':'Tehran Vanak public test point'},lambda **x:None,page_setup=setup,browser_options={'executable_path':os.environ['CHROMIUM_PATH'],'args':['--no-sandbox']},max_stores=1,page_seconds=20,item_seconds=70,workers=1)
print(json.dumps({'public_guest_validation':results},ensure_ascii=False))
