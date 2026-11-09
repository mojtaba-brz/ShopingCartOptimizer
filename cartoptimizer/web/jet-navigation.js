/* Shared desktop/Android route changes after address-page initialization.
 * Preserve the retailer's live address state; never synthesize a map modal. */
(function(target){
 'use strict';
 try{
  const url=new URL(target),hosts=['www.digikalajet.com','digikalajet.com'];
  if(location.protocol!=='https:'||url.protocol!=='https:'||!hosts.includes(location.hostname)||url.hostname!==location.hostname||url.username||url.password||url.port||!document.getElementById('root'))return false;
  if((!['/','/search/v2/result','/search/shop','/user/add-address'].includes(url.pathname)&&!/^\/(?:.*\/)?(?:cart|carts|checkout)\/?$/.test(url.pathname))||url.searchParams.has('MID'))return false;
  if(location.href===url.href)return true;
  const idx=Number.isInteger(history.state?.idx)?history.state.idx:0;
  history.pushState({usr:null,key:Math.random().toString(36).slice(2,10),idx:idx+1},'',url.pathname+url.search);
  window.dispatchEvent(new PopStateEvent('popstate',{state:history.state}));return true;
 }catch{return false;}
})
