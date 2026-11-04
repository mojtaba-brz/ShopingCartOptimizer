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
const ranked=a.rank(item,rows);assert.equal(ranked.length,2);assert.equal(a.estimated(ranked[0],3),2500);
const built=a.build([item],[{id:'milk',products:rows}],'تهران','scheduled');
assert.deepEqual(built.missing,[]);assert.equal(built.snapshot.offers[0].stock,3);assert.equal(built.snapshot.offers[0].promo_limit,1);
assert.deepEqual(a.build([item],[{id:'milk',products:[]}],'تهران','scheduled').missing,['شیر کم چرب']);
console.log('Automatic matching and estimated pricing tests passed');
