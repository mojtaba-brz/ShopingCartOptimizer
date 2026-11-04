/* Pure automatic matching/planning helpers. Values remain integer rials. */
(function(root){
  'use strict';
  function normalize(text){
    return String(text||'').normalize('NFKC').toLowerCase()
      .replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c))
      .replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[\u064b-\u065f\u0670\u200c]/g,' ')
      .replace(/لیتری/g,'لیتر').replace(/کیلویی/g,'کیلوگرم').replace(/گرمی/g,'گرم')
      .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  function tokens(s){return normalize(s).split(/\s+/).filter(Boolean);}
  const amountPattern=/(\d+(?:\.\d+)?)\s*(کیلوگرم|کیلو|گرم|میلی\s*لیتر|لیتر|kg|g|ml|l)(?:ی)?(?![\p{L}])/gu;
  function digits(text){return String(text||'').normalize('NFKC').toLowerCase().replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/٫/g,'.').replace(/ك/g,'ک').replace(/ي/g,'ی')
    .replace(/(?:^|\s)(یک و نیم|یک|دو|سه|چهار|نیم)\s*(?=کیلوگرم|کیلو|گرم|میلی\s*لیتر|لیتر)/g,(_,word)=>' '+({'یک و نیم':'1.5','یک':'1','دو':'2','سه':'3','چهار':'4','نیم':'0.5'}[word])+' ');}
  function searchTerm(text){return digits(text).replace(amountPattern,' ').replace(/\s+/g,' ').trim();}
  // Return the amount per package in grams or millilitres when the label is clear.
  function amount(title){
    const s=digits(title);
    const matches=[...s.matchAll(amountPattern)];
    if(matches.length!==1)return null;
    const n=Number(matches[0][1]), unit=matches[0][2].replace(/\s/g,'');
    if(!Number.isFinite(n)||n<=0)return null;
    const mass=['کیلوگرم','کیلو','گرم','kg','g'].includes(unit);
    const scale=['کیلوگرم','کیلو','kg','لیتر','l'].includes(unit)?1000:1;
    const pack=s.match(/(?:بسته|پک)?\s*(\d+)\s*(?:عددی|عدد)/);
    if(/\d+\s*[x×*]\s*\d+/i.test(s))return null;
    // Multi-packs often state the total package weight; do not guess whether
    // an unqualified amount applies to one unit or the entire pack.
    if(pack&&!/(?:هر\s*عدد|هر\s*بسته|each)/.test(s))return null;
    if(pack&&/هر\s*بسته/.test(s))return {value:n*scale,unit:mass?'g':'ml'};
    return {value:n*scale*(pack?Number(pack[1]):1),unit:mass?'g':'ml'};
  }
  function matches(query,title){
    const terms=tokens(query), product=new Set(tokens(title));
    return terms.length>0 && terms.every(t=>product.has(t));
  }
  function product(p){
    if(!p || typeof p.title!=='string' || !p.title.trim() || p.title.length>300 ||
      !Number.isSafeInteger(p.regular_price) || p.regular_price<1 || p.regular_price>1e13) return null;
    if(p.promo_price!==null && (!Number.isSafeInteger(p.promo_price) || p.promo_price<0 || p.promo_price>=p.regular_price)) return null;
    return {title:p.title,regular_price:p.regular_price,promo_price:p.promo_price,url:typeof p.url==='string'&&p.url.startsWith('https://www.digikala.com/')?p.url:''};
  }
  function rank(item,rows,limit=5){
    const best=new Map();
    for(const p of (Array.isArray(rows)?rows:[]).map(product)){
      if(!p||!matches(item.name,p.title))continue;
      const key=normalize(p.title), old=best.get(key);
      if(!old||estimated(p,item.quantity)<estimated(old,item.quantity))best.set(key,p);
    }
    return [...best.values()].sort((a,b)=>estimated(a,item.quantity)-estimated(b,item.quantity)).slice(0,limit);
  }
  function suggestions(item,rows,titles){
    const allowed=new Set(Array.isArray(titles)?titles:[]),seen=new Set();
    return (Array.isArray(rows)?rows:[]).map(product).filter(p=>p&&allowed.has(p.title)&&!matches(item.name,p.title)&&!seen.has(p.title)&&!!seen.add(p.title));
  }
  // Unknown stock and quota are assumptions: one discounted unit, remaining at the displayed regular price.
  function estimated(p,quantity){return p.regular_price*quantity-(p.promo_price===null?0:p.regular_price-p.promo_price);}
  // Minimise estimated merchandise cost for a target amount, with bounded search.
  // Each distinct product may have one discounted package; inventory is unknown.
  function amountPlans(item,rows,approvedTitle=''){
    const targetUnit=amount(item.name);if(!targetUnit)return null;
    const target=targetUnit.value*item.quantity;
    if(!Number.isSafeInteger(target)||target<=0||target>10000000)return {plans:[],complete:false};
    const query=searchTerm(item.name);if(!query)return {plans:[],complete:false};
    const found=approvedTitle?(Array.isArray(rows)?rows:[]).map(product).filter(p=>p&&p.title===approvedTitle):rank({...item,name:query},rows,1000);
    const candidates=found.map(p=>({...p,size:amount(p.title)}))
      .filter(p=>p.size&&p.size.unit===targetUnit.unit&&Number.isSafeInteger(p.size.value)&&p.size.value>0&&p.size.value<=10000000);
    if(!candidates.length)return {plans:[],complete:true};
    let states=new Map([['0:0',{total:0,quantity:0,cost:0,lines:[]}]]), complete=true, iterations=0;
    const upper=target+Math.max(...candidates.map(p=>p.size.value))-1;
    for(const p of candidates){
      const next=new Map(states);
      for(const state of states.values()){
        const max=Math.min(50-state.quantity,Math.ceil((upper-state.total)/p.size.value));
        for(let q=1;q<=max;q++){
          if(++iterations>400000){complete=false;break;}
          const total=state.total+q*p.size.value;if(total>upper)break;
          const cost=state.cost+estimated(p,q), count=state.quantity+q, key=total+':'+count;
          const old=next.get(key);
          if(!old||cost<old.cost)next.set(key,{total,quantity:count,cost,lines:[...state.lines,{title:p.title,quantity:q,subtotal:estimated(p,q),amount:p.size.value,url:p.url}]});
        }
        if(!complete)break;
      }
      states=next;if(!complete)break;
    }
    // Individual-product plans include later candidates even when the search was bounded.
    for(const p of candidates){const q=Math.ceil(target/p.size.value);if(q>50)continue;const total=q*p.size.value,cost=estimated(p,q),key=total+':'+q,old=states.get(key);if(!old||cost<old.cost)states.set(key,{total,quantity:q,cost,lines:[{title:p.title,quantity:q,subtotal:cost,amount:p.size.value,url:p.url}]});}
    const valid=[...states.values()].filter(s=>s.total>=target);
    const order=[(a,b)=>a.cost-b.cost||a.total-b.total,(a,b)=>a.total-b.total||a.cost-b.cost,(a,b)=>a.quantity-b.quantity||a.cost-b.cost];
    const plans=[];for(const cmp of order){const p=[...valid].sort(cmp)[0];if(p&&!plans.some(x=>JSON.stringify(x.lines)===JSON.stringify(p.lines)))plans.push(p);}
    // Offer the nearest smaller amount explicitly as an optional shortfall.
    const smaller=[...states.values()].filter(s=>s.total>0&&s.total<target).sort((a,b)=>b.total-a.total||a.cost-b.cost)[0];
    if(smaller)plans.push(smaller);
    return {target,unit:targetUnit.unit,plans,complete,candidates:candidates.length};
  }
  function build(items,results,location,mode,selection={},ai={}){
    const offers=[],missing=[];let counter=0;
    for(const item of items){
      const entry=results.find(r=>r.id===item.id), all=rank(item,entry?.products,1000);
      const chosen=selection[item.id]||'',aiTitle=chosen.startsWith('ai:')?chosen.slice(3):'';
      const choices=aiTitle?suggestions(item,entry?.products,ai[item.id]).filter(p=>p.title===aiTitle):chosen?all.filter(p=>p.title===chosen):all.slice(0,5);
      if(!choices.length){missing.push(item.name);continue;}
      for(const p of choices)offers.push({id:'auto-'+(++counter),item_id:item.id,store_id:'digikala-auto',title:p.title,
        regular_price:p.regular_price,promo_price:p.promo_price,promo_limit:p.promo_price===null?0:1,
        promo_scope:'account',stock:item.quantity,confirmed:true,url:p.url});
    }
    return {missing, snapshot:{schema_version:1,currency:'IRR',source:'digikala-automatic-estimate',captured_at:new Date().toISOString(),
      context:location+' · '+mode,max_carts:1,items:items.map(({id,name,quantity})=>({id,name,quantity})),offers,coupons:[],
      stores:[{id:'digikala-auto',name:'Digikala Supermarket',delivery_fee:0,service_fee:0,minimum_order:0,free_delivery_over:null,threshold_basis:'before_coupon'}]}};
  }
  const api={normalize,matches,rank,suggestions,build,estimated,amount,searchTerm,amountPlans};root.CartwiseAuto=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
