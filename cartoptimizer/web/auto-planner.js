/* Pure automatic matching/planning helpers. Values remain integer rials. */
(function(root){
  'use strict';
  const packages=root.CartwisePackages||(typeof require!=='undefined'?require('./package-size.js'):null),pricing=root.CartwisePricing||(typeof require!=='undefined'?require('./offer-pricing.js'):null);
  function normalize(text){
    return String(text||'').normalize('NFKC').toLowerCase()
      .replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c))
      .replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[\u064b-\u065f\u0670\u200c]/g,' ')
      .replace(/کمچرب/g,'کم چرب').replace(/پرچرب/g,'پر چرب').replace(/بدونلاکتوز/g,'بدون لاکتوز')
      .replace(/لیتری/g,'لیتر').replace(/کیلویی/g,'کیلوگرم').replace(/گرمی/g,'گرم')
      .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  function tokens(s){return normalize(s).split(/\s+/).filter(Boolean);}
  function searchTerm(text){return packages.query(text);}
  // Return the amount per package in grams or millilitres when the label is clear.
  function amount(title){return packages.amount(title);}

  function matches(query,title){
    const terms=tokens(query), product=new Set(tokens(title));
    return terms.length>0 && terms.every(t=>product.has(t));
  }
  function product(p){
    if(!p || typeof p.title!=='string' || !p.title.trim() || p.title.length>300 ||
      !Number.isSafeInteger(p.regular_price) || p.regular_price<1 || p.regular_price>1e13) return null;
    if(p.promo_price!==null && (!Number.isSafeInteger(p.promo_price) || p.promo_price<0 || p.promo_price>=p.regular_price)) return null;
    const url=typeof p.url==='string'&&/^https:\/\/(?:www\.)?(?:digikala|digikalajet)\.com\//.test(p.url)?p.url:'';
    let image='';try{const u=new URL(p.image_url);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['dkstatics-public.digikala.com','dkstatics-public.digikalajet.ir','images.digikalajet.ir'].includes(u.hostname))image=u.href;}catch{}
    return {store_type:typeof p.store_type==='string'?p.store_type:'',type_source:p.type_source||'',title:p.title,regular_price:p.regular_price,promo_price:p.promo_price,url,
      image_url:image,store_name:typeof p.store_name==='string'?p.store_name.trim().slice(0,160):'',store_id:typeof p.store_id==='string'?p.store_id.slice(0,200):'',
      regular_verified:p.regular_verified!==false,amazing:p.amazing===true,discounted:p.promo_price!==null,
      product_id:typeof p.product_id==='string'?p.product_id:'',post_amazing_price:Number.isSafeInteger(p.post_amazing_price)&&p.post_amazing_price>=0&&p.post_amazing_price<=p.regular_price?p.post_amazing_price:null,post_amazing_verified:p.post_amazing_verified===true,post_amazing_source:['catalogue-components','catalogue-product-first','catalogue-ordinary'].includes(p.post_amazing_source)?p.post_amazing_source:''};
  }
  function rank(item,rows,limit=5){
    const best=new Map();
    for(const p of (Array.isArray(rows)?rows:[]).map(product)){
      if(!p||!matches(item.name,p.title)||conflicting(item.name,p.title)||!sameCategory(item.name,p.title))continue;
      const key=(p.store_type||'supermarket')+'|'+normalize(p.title)+'|'+p.store_id+'|'+p.store_name+'|'+p.url, old=best.get(key);
      if(!old||estimated(p,item.quantity)<estimated(old,item.quantity))best.set(key,p);
    }
    return [...best.values()].sort((a,b)=>estimated(a,item.quantity)-estimated(b,item.quantity)).slice(0,limit);
  }
  function conflicting(query,title){
    const q=normalize(query),t=normalize(title),flavours=['کاکائو','شکلات','شکلاتی','موزی','وانیلی','توت فرنگی'];
    if(tokens(query).includes('شیر'))for(const f of flavours)if(t.includes(f)&&!q.includes(f))return true;
    if(q.includes('کم چرب') && t.includes('پر چرب'))return true;
    if(q.includes('پر چرب') && t.includes('کم چرب'))return true;
    return false;
  }
  // These small dictionaries and edit checks run locally; uncertain matches need review.
  const categories=[['شیر'],['ماست'],['پنیر'],['برنج'],['ماکارونی','پاستا','اسپاگتی'],
    ['بیسکویت','بیسکوئیت'],['سس'],['شکر'],['قند'],['تخم مرغ'],['نان'],['روغن'],
    ['عدس'],['لوبیا'],['نخود'],['چای'],['قهوه'],['کره'],['خامه'],['دوغ'],['آبمیوه'],
    ['مایع ظرفشویی'],['مایع دستشویی'],['پودر لباسشویی']];
  const brands=new Set(tokens('کاله میهن پگاه هراز دومینو رامک پاک صباح دامداران چوپان'));
  function category(text){
    const t=' '+normalize(text)+' ';let found=null;
    categories.forEach((aliases,id)=>aliases.forEach(alias=>{const at=t.indexOf(' '+alias+' ');if(at>=0&&(!found||at<found.at))found={id,alias,at};}));
    return found;
  }
  function sameCategory(query,title){const q=category(query),t=category(title);return !q||(t&&q.id===t.id);}
  function oneEdit(a,b){
    if(Math.abs(a.length-b.length)>1)return false;
    let i=0,j=0,edits=0;
    while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;
      if(a.length>=b.length)i++;if(b.length>=a.length)j++;
    }
    return edits+(i<a.length||j<b.length?1:0)<=1;
  }
  function suggestions(item,rows){
    const query=amount(item.name)?searchTerm(item.name):item.name,q=category(query);if(!q)return [];
    const wanted=tokens(normalize(query).replace(q.alias,' ')),best=new Map();
    for(const p of (Array.isArray(rows)?rows:[]).map(product)){
      if(!p||matches(query,p.title)||conflicting(query,p.title))continue;
      const t=category(p.title);if(!t||t.id!==q.id)continue;
      const size=amount(item.name),available=amount(p.title);if(size&&(!available||size.unit!==available.unit))continue;
      const remaining=tokens(normalize(p.title).replace(t.alias,' '));let edits=0,valid=true;
      // Exact tokens first, then at most one edit in a non-brand word of >=5 letters.
      const missing=[];for(const word of wanted){const i=remaining.indexOf(word);if(i>=0)remaining.splice(i,1);else missing.push(word);}
      for(const word of missing){
        if(brands.has(word)||/\d/.test(word)||word.length<5||['لاکتوز','گلوتن','بدون'].includes(word)){valid=false;break;}
        const i=remaining.findIndex(x=>!brands.has(x)&&!/[0-9]/.test(x)&&oneEdit(word,x));
        if(i<0||++edits>1){valid=false;break;}remaining.splice(i,1);
      }
      if(!valid)continue;
      const score=edits*2+(q.alias===t.alias?0:1),key=(p.store_type||'supermarket')+'|'+normalize(p.title)+'|'+p.store_id+'|'+p.store_name+'|'+p.url,old=best.get(key);
      if(!old||estimated(p,item.quantity)<estimated(old.p,item.quantity))best.set(key,{p,score});
    }
    return [...best.values()].sort((a,b)=>a.score-b.score||estimated(a.p,item.quantity)-estimated(b.p,item.quantity)||a.p.title.localeCompare(b.p.title)).map(x=>x.p);
  }
  // Ordinary discounts repeat; standalone amazing estimates use the typed quota.
  // The basket planner reallocates that quota jointly across merchant lines.
  function estimated(p,quantity){return pricing.estimated(p,quantity);}
  const api={normalize,matches,rank,suggestions,estimated,amount,searchTerm};root.CartwiseAuto=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
