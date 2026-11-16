/* Opt-in update checks; installation is handled by the original distributor. */
(function(root){
 'use strict';
 const releases='https://api.github.com/repos/mojtaba-brz/ShopingCartOptimizer/releases?per_page=10',home='https://github.com/mojtaba-brz/ShopingCartOptimizer/releases';
 const parse=s=>/^\d+\.\d+\.\d+$/.test(s)?s.split('.').map(Number):null;
 function newer(a,b){const x=parse(a),y=parse(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
 function latest(rows,current,preview){return (Array.isArray(rows)?rows:[]).filter(r=>!r.draft&&(preview||!r.prerelease)&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)&&newer(r.tag_name.slice(1),current)).sort((a,b)=>newer(a.tag_name.slice(1),b.tag_name.slice(1))?-1:1)[0];}
 const api={newer,latest};if(typeof module!=='undefined')module.exports=api;if(!root.document)return;
 const label=document.getElementById('app-version');if(!label)return;
 const block=document.createElement('div');block.className='update-controls';block.innerHTML='<button type="button" class="secondary" id="check-update">بررسی به‌روزرسانی</button><p role="status" aria-live="polite"></p><a class="secondary" hidden rel="noopener noreferrer">دریافت نسخهٔ جدید</a>';label.after(block);
 const button=block.querySelector('button'),status=block.querySelector('p'),link=block.querySelector('a');
 const version=fetch('/assets/release.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(x=>{if(!parse(x.version))throw Error();label.textContent='نسخهٔ '+x.version;return x;}).catch(()=>{label.textContent='شمارهٔ نسخه در دسترس نیست';return null;});
 button.onclick=async()=>{
  button.disabled=true;link.hidden=true;status.textContent='در حال بررسی نسخهٔ جدید…';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const current=await version;if(!current)throw Error();let installer='';try{installer=root.CartwiseAndroid?.updateSource?.()||'';}catch{}
   if(['play','bazaar'].includes(installer)){link.href=installer==='play'?'https://play.google.com/store/apps/details?id=com.mojtababrz.cartoptimizer':'https://cafebazaar.ir/app/com.mojtababrz.cartoptimizer';link.hidden=false;status.textContent='به‌روزرسانی از فروشگاهی که برنامه را نصب کرده‌اید انجام می‌شود.';return;}
   const response=await fetch(releases,{signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw Error();const release=latest(await response.json(),current.version,current.channel!=='stable');
   if(release){link.href=home+'/tag/'+release.tag_name;link.hidden=false;status.textContent='نسخهٔ جدید آماده است: '+release.tag_name.slice(1);}else status.textContent='نسخهٔ جدیدتری در کانال انتشار شما موجود نیست.';
  }catch{status.textContent='بررسی به‌روزرسانی انجام نشد؛ اتصال اینترنت را بررسی کنید.';}finally{clearTimeout(timer);button.disabled=false;}
 };
})(globalThis);
