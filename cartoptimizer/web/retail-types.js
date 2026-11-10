/* Public Jet business names, checked against its public activity list.
 * Query classification is editable; observed retailer type takes precedence. */
(function(root){
 'use strict';
 const labels={supermarket:'سوپرمارکت',pastry:'شیرینی و آجیل',produce:'میوه و سبزیجات',meat_shop:'پروتئینی',bakery:'نانوایی',pet_shop:'پت‌شاپ',all_mart:'تازه‌بازار',unknown:'نوع نامشخص'};
 const norm=s=>String(s||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\s]+/g,' ').trim().toLowerCase();
 function type(value){const s=norm(value);if(labels[s])return s;for(const [key,label] of Object.entries(labels))if(s===norm(label))return key;if(/شیرینی|آجیل|خشکبار|pastry/.test(s))return 'pastry';if(/میوه|سبزیجات|produce/.test(s))return 'produce';if(/پروتئین|قصابی|meat/.test(s))return 'meat_shop';if(/نانوایی|bakery/.test(s))return 'bakery';if(/سوپرمارکت|supermarket/.test(s))return 'supermarket';return 'unknown';}
 function infer(name){const s=' '+norm(name)+' ';if(/(?:^| )(شیر|ماست|پنیر|نوشابه|پپسی|کوکاکولا|سس|کنسرو|شکلات|بیسکویت|آبمیوه)(?: |$)/.test(s))return 'supermarket';if(/(?:^| )(تخمه|آجیل|پسته|بادام|فندق|گردو|شیرینی|باقلوا|خشکبار)(?: |$)/.test(s))return 'pastry';if(/(?:^| )(مرغ|گوشت|ماهی|میگو|بوقلمون)(?: |$)/.test(s))return 'meat_shop';if(/(?:^| )(انگور|سیب|پرتقال|موز|خیار|گوجه|سبزی|کاهو|هندوانه|نارنگی|کیوی|لیمو)(?: |$)/.test(s))return 'produce';return 'supermarket';}
 const department=t=>t==='all_mart'?'supermarket':t;
 function item(i){const explicit=type(i.department);return explicit!=='unknown'?department(explicit):infer(i.name);}
 function store(p,fallback='supermarket'){const t=type(p.store_type||p.business||p.activity_description||p.activity_type);return t==='unknown'?type(fallback):t;}
 function eligible(i,p){const t=type(p.store_type);return t==='unknown'||department(t)===item(i);}
 function key(p){const t=store(p),id=String(p.store_id||'');return t+'|'+(id?'id:'+id:'name:'+norm(p.store_name));}
 const api={labels,norm,type,infer,item,store,eligible,key,department};root.CartwiseTypes=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
