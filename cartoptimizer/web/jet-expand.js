/* The same unambiguous public view-all control on desktop and Android. */
(function(name){
 'use strict';
 const text=e=>String(e?.innerText||'').replace(/[\u200c\s]+/g,' ').trim(),matches=[];
 for(const b of document.querySelectorAll('button'))if(text(b)==='مشاهده همه'){
  let group=b.parentElement;
  for(let depth=0;group&&depth<6;depth++,group=group.parentElement){
   const titles=[...group.querySelectorAll('p.truncate')].filter(p=>p.getClientRects().length&&!p.closest('button'));
   if(titles.length>1)break;
   if(titles.length===1&&text(titles[0])===name&&group.querySelector('button[data-cro-id=add-one-more-to-cart]')){matches.push(b);break;}
  }
 }
 if(matches.length!==1)return false;matches[0].click();return true;
})
