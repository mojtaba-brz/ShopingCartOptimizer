const assert=require('node:assert/strict');
const a=require('../../cartoptimizer/web/auto-planner.js');
assert.equal(a.matches('شیر کم چرب ۱ لیتری','شیر کم‌چرب کاله 1 لیتر'),true);
assert.equal(a.matches('شیر','شیرینی شکلاتی'),false);
assert.equal(a.matches('شیر 1 لیتر','شیر 200 میلی لیتر'),false);
assert.equal(a.matches('پنیر کاله','پنیر هراز'),false);
assert.deepEqual(a.amount('شیر ۱.۵ لیتری'),{value:1500,unit:'ml'});
assert.deepEqual(a.amount('شیر یک و نیم لیتر'),{value:1500,unit:'ml'});
assert.deepEqual(a.amount('برنج ۲ کیلوگرم'),{value:2000,unit:'g'});
assert.deepEqual(a.amount('ماست بسته ۶ عددی هر عدد 200 گرم'),{value:1200,unit:'g'});
assert.equal(a.amount('ماست بسته ۶ عددی 200 گرم'),null);
assert.equal(a.amount('ماست 6 عددی 200 گرم'),null);
assert.equal(a.amount('ماست 6×200 گرم'),null);
assert.equal(a.amount('محصول 200 گرم و 300 گرم'),null);
assert.equal(a.searchTerm('شیر کم چرب ۲ لیتر'),'شیر کم چرب');
const sizePlans=a.amountPlans({id:'m',name:'شیر ۲ لیتر',quantity:1},[
  {title:'شیر الف 1 لیتر',regular_price:500,promo_price:null},
  {title:'شیر ب 1.5 لیتر',regular_price:600,promo_price:null},
  {title:'شیر پ 500 میلی لیتر',regular_price:200,promo_price:null},
  {title:'پنیر 2 کیلوگرم',regular_price:10,promo_price:null}
]);
assert.equal(sizePlans.target,2000);assert.equal(sizePlans.plans[0].cost,800);
assert.equal(sizePlans.plans[0].total,2000);assert.equal(sizePlans.complete,true);
assert.ok(sizePlans.plans.some(p=>p.quantity===2&&p.cost===800));
assert.ok(sizePlans.plans.some(p=>p.total===1500));
const item={id:'milk',name:'شیر کم چرب',quantity:3};
const rows=[{title:'شیر کم چرب الف 1 لیتر',regular_price:1000,promo_price:500,url:''},{title:'شیر کم چرب ب 1 لیتر',regular_price:900,promo_price:null,url:''},{title:'پنیر ب',regular_price:100,promo_price:null,url:''}];
assert.equal(a.suggestions(item,rows).length,0);
const pasta={id:'pasta',name:'ماکارونی',quantity:1};
const p=(title,price=100)=>({title,regular_price:price,promo_price:null});
const aliases=[p('پاستا زر 500 گرم'),p('پنیر آزمون'),p('بیسکویت با شیر'),p('ماکارونی ساده')];
assert.deepEqual(a.suggestions(pasta,aliases).map(p=>p.title),['پاستا زر 500 گرم']);
assert.equal(a.build([pasta],[{id:'pasta',products:aliases}],'تهران','scheduled').snapshot.offers[0].title,'ماکارونی ساده');
assert.equal(a.build([pasta],[{id:'pasta',products:aliases}],'تهران','scheduled',{pasta:'review:پاستا زر 500 گرم'}).snapshot.offers[0].title,'پاستا زر 500 گرم');
assert.equal(a.build([pasta],[{id:'pasta',products:aliases}],'تهران','scheduled',{pasta:'review:پنیر آزمون'}).missing.length,1);
assert.equal(a.build([pasta],[{id:'pasta',products:aliases}],'تهران','scheduled',{pasta:'review:کالای ساختگی'}).missing.length,1);
assert.equal(a.rank({name:'شیر',quantity:1},[p('بیسکویت با شیر')]).length,0);
assert.equal(a.suggestions({name:'شیر',quantity:1},[p('بیسکویت با شیر')]).length,0);
assert.equal(a.suggestions({name:'ماکارونی سبوسدار',quantity:1},[p('پاستا سبوسدار'),p('پاستا سبوسدا')]).length,2);
assert.equal(a.suggestions({name:'ماکارونی سبوسدار',quantity:1},[p('پاستا سفید')]).length,0);
assert.equal(a.suggestions({name:'ماکارونی سبوسدار سبوسدا',quantity:1},[p('پاستا سبوسدار')]).length,0);
assert.equal(a.suggestions({name:'ماکارونی کاله',quantity:1},[p('پاستا میهن'),p('پاستا کاله')]).length,1);
assert.equal(a.suggestions({name:'ماکارونی 500 گرم',quantity:1},[p('پاستا 1 لیتر'),p('پاستا 1 کیلوگرم')]).length,1);
assert.equal(a.suggestions({name:'ماکارونی 5 عدد',quantity:1},[p('پاستا 6 عدد')]).length,0);
assert.equal(a.suggestions({name:'ماکارونی بدون گلوتن',quantity:1},[p('پاستا گلوتن'),p('پاستا بدون گلوتن')]).length,1);
assert.equal(a.suggestions(item,[p('شیر کاکائو')]).length,0);
assert.equal(a.rank(item,[p('شیر پرچرب')]).length,0);
assert.equal(a.rank(item,[p('شیر کمچرب')]).length,1);
assert.deepEqual(a.suggestions(pasta,[p('پاستا',200),p('پاستا',100)]).map(x=>x.regular_price),[100]);
assert.equal(a.rank(item,[{title:'شیر کم چرب کاکائو',regular_price:100,promo_price:null}]).length,0);
const ranked=a.rank(item,rows);assert.equal(ranked.length,2);assert.equal(a.estimated(ranked[0],3),2500);
const built=a.build([item],[{id:'milk',products:rows}],'تهران','scheduled');
assert.deepEqual(built.missing,[]);assert.equal(built.snapshot.offers[0].stock,3);assert.equal(built.snapshot.offers[0].promo_limit,1);
assert.deepEqual(a.build([item],[{id:'milk',products:[]}],'تهران','scheduled').missing,['شیر کم چرب']);
console.log('Automatic matching and estimated pricing tests passed');

// Later results and combinations must participate, rather than a five-offer shortlist.
const seven=Array.from({length:7},(_,i)=>p('شیر '+i,1000));seven.forEach(x=>x.promo_price=0);
assert.equal(a.countPlan({id:'m',name:'شیر',quantity:7},seven).cost,0);
assert.equal(a.countPlan({id:'m',name:'شیر',quantity:7},seven).lines.length,7);
assert.equal(a.countPlan({id:'m',name:'شیر',quantity:2},[{...p('شیر الف',100),promo_price:80},{...p('شیر ب',200),promo_price:0}]).cost,80);
assert.equal(a.countPlan(pasta,aliases,'review:پنیر آزمون'),null);
assert.equal(a.countPlan(pasta,aliases,'review:پاستا زر 500 گرم').lines[0].title,'پاستا زر 500 گرم');
// Independent enumeration of purchase quantities for small price cases.
for(let seed=1;seed<=20;seed++)for(let wanted=1;wanted<=4;wanted++){
 const rows=Array.from({length:3},(_,i)=>{const regular=50+((seed*17+i*23)%80);return {...p('شیر '+i,regular),promo_price:(seed+i)%2?null:(seed*7+i*3)%50};});
 let best=Infinity;
 for(let x=0;x<=wanted;x++)for(let y=0;y<=wanted-x;y++){
  const quantities=[x,y,wanted-x-y];let cost=0;
  for(let i=0;i<3;i++)if(quantities[i])cost+=rows[i].regular_price*(quantities[i]-1)+(rows[i].promo_price??rows[i].regular_price);
  best=Math.min(best,cost);
 }
 assert.equal(a.countPlan({id:'m',name:'شیر',quantity:wanted},rows).cost,best);
}
console.log('All-result quantity allocation agrees with exhaustive pricing oracle');
