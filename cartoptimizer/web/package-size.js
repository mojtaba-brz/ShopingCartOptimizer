/* Package contents, shared by search and unit-price comparisons. No network. */
(function(root){
 'use strict';
 const words={'یک و نیم':'1.5','نیم':'0.5','یک':'1','دو':'2','سه':'3','چهار':'4','پنج':'5','شش':'6','هفت':'7','هشت':'8','نه':'9','ده':'10','دوازده':'12'};
 function text(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/٫/g,'.').replace(/[‌\s]+/g,' ').replace(/سی\s*سی|\bcc\b/gu,' میلی لیتر ').replace(/(^|\s)(یک و نیم|دوازده|چهار|پنج|هفت|هشت|شش|سه|دو|ده|نه|یک|نیم)(?=\s*(?:کیلو|گرم|لیتر|میلی|عدد|تایی|جعبه|بسته|برگ|لا))/g,(_,gap,w)=>gap+words[w]);}
 const physical=/(\d+(?:\.\d+)?)\s*(کیلوگرم|کیلو|گرم|میلی\s*لیتر|لیتر|kg|ml|g|l)(?:ی)?(?![\p{L}])/gu;
 const unknown=()=>({unit:'unknown',value:null});
 const valid=n=>Number.isFinite(n)&&n>0&&n<=10000000;
 function contents(title){
  const s=text(title),weights=[...s.matchAll(physical)],tissue=/(?:دستمال|tissue)/u.test(s)&&!/(?:مرطوب|حوله|کاغذ توالت)/u.test(s);
  if(tissue){
   const sheets=[...s.matchAll(/(\d+)\s*(?:برگ(?:ی)?|دستمال)(?![\p{L}])/gu)].map(m=>Number(m[1]));
   if(sheets.length){
    const unique=[...new Set(sheets)];if(unique.length!==1)return unknown();
    const plyMatches=[...s.matchAll(/(\d+)\s*لا(?:یه)?(?:ی)?(?![\p{L}])/gu)],ply=plyMatches.length?Number(plyMatches[0][1]):2;
    if(plyMatches.some(m=>Number(m[1])!==ply)||!Number.isInteger(ply)||ply<1||ply>6)return unknown();
    const boxes=[...s.matchAll(/(\d+)\s*(?:جعبه(?:ای)?|بسته(?:ای)?|عددی|تایی|عدد)(?![\p{L}])/gu)].map(m=>Number(m[1]));
    if(new Set(boxes).size>1)return unknown();const count=boxes[0]||1;
    const total=/(?:مجموع|جمع|در کل|کل بسته|total)\s*(?:تعداد|برگ|:)?\s*\d/.test(s)?unique[0]:unique[0]*count;
    return valid(total*ply/2)?{unit:'sheet',value:total*ply/2,boxes:count,sheets:unique[0],ply}:unknown();
   }
   return unknown(); // A box count alone is not a tissue-sheet count.
  }
  if(weights.length){
   if(weights.length!==1)return unknown();
   const m=weights[0],n=Number(m[1]),u=m[2].replace(/\s/g,''),unit=['کیلوگرم','کیلو','گرم','kg','g'].includes(u)?'g':'ml',scale=['کیلوگرم','کیلو','kg','لیتر','l'].includes(u)?1000:1;
   const before=s.slice(0,m.index),after=s.slice(m.index+m[0].length);
   const left=before.match(/(\d+)\s*[x×*]\s*$/),right=after.match(/^\s*[x×*]\s*(\d+)(?![\d.])/);
   const counts=[...s.matchAll(/(\d+)\s*(?:عددی|تایی|عدد|قوطی|بطری|ساشه|جعبه(?:ای)?|بسته(?:ای)?|پک)(?![\p{L}])/gu)].map(x=>Number(x[1]));
   if(left)counts.push(Number(left[1]));if(right)counts.push(Number(right[1]));
   if(new Set(counts).size>1)return unknown();
   const isTotal=/(?:وزن|حجم)\s*(?:خالص\s*)?(?:کل|مجموع|نهایی|بسته)|(?:مجموع|جمع|total)(?:\s|:|$)\s*(?:وزن|حجم)?|هر بسته\s*\d/.test(s);
   const count=isTotal?1:counts[0]||1,value=n*scale*count;
   return valid(value)&&Number.isInteger(count)&&count<=1000?{unit,value,items:count,each:n*scale,total_explicit:isTotal}:unknown();
  }
  if(/\d\s*(?:کیلو|گرم|لیتر|میلی\s*لیتر|kg\b|ml\b|g\b|l\b)/u.test(s))return unknown();
  const nested=s.match(/(\d+)\s*(?:بسته|جعبه)\s*(?:ی\s*)?(\d+)\s*(?:عددی|تایی|عدد)/u);
  if(nested){const value=Number(nested[1])*Number(nested[2]);return valid(value)?{unit:'count',value}:unknown();}
  const counts=[...s.matchAll(/(\d+)\s*(?:عددی|تایی|عدد)(?![\p{L}])/gu)];
  if(counts.length>1)return unknown();
  if(counts.length)return valid(Number(counts[0][1]))?{unit:'count',value:Number(counts[0][1])}:unknown();
  return {unit:'count',value:1};
 }
 function measure(title){const p=contents(title);return {unit:p.unit,value:p.value};}
 function amount(title){const p=measure(title);return ['g','ml'].includes(p.unit)?{value:p.value,unit:p.unit}:null;}
 function explicit(title){const s=text(title);return /\d+\s*(?:برگ|عددی|تایی|عدد)/u.test(s)||[...s.matchAll(physical)].length>0;}
 function query(title){return text(title).replace(/\d+\s*[x×*]\s*(?=\d)/g,'').replace(physical,' ').replace(/(?:بسته(?: بندی)?|پک|مجموعه)?\s*\d+\s*(?:عددی|تایی|عدد|جعبه(?:ای)?|برگ(?:ی)?|لا(?:یه)?)(?![\p{L}])/gu,' ').replace(/\s+/g,' ').trim();}
 const api={text,contents,measure,amount,explicit,query};root.CartwisePackages=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
