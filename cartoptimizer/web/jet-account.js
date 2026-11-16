/* Inspect only visible account controls and delivery labels, never input values,
 * cookies, tokens, account responses or hidden application state. */
(function(){
 'use strict';
 if(location.protocol!=='https:'||!['www.digikalajet.com','digikalajet.com'].includes(location.hostname))return {status:'unknown',location:''};
 const visible=e=>e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const text=e=>String(e.innerText||'').replace(/[\u200c\s]+/g,' ').trim();
 const controls=[...document.querySelectorAll('a,button,[role=button]')].filter(visible).map(text);
 const login=/^\/user\/(?:login|register|confirm-phone)(?:\/|$)/.test(location.pathname)||[...document.querySelectorAll('input[autocomplete=one-time-code]')].some(visible)||([...document.querySelectorAll('input[type=tel]')].some(visible)&&controls.some(s=>/^(?:ادامه|ورود|دریافت کد)/.test(s)));
 const signed=controls.some(s=>/^(?:خروج از حساب(?: کاربری)?|Log out|Sign out)$/.test(s));
 const labels=[...document.querySelectorAll('header *,#root p,#root span')].filter(e=>visible(e)&&/^ارسال به\s+.{3}/.test(text(e))&&text(e).length<=300).map(text).sort((a,b)=>a.length-b.length);
 return {status:login?'login_required':signed?'signed_in':'unknown',location:labels[0]||''};
})
