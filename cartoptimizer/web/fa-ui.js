(function(){
  'use strict';
  const key='cartwise.theme.v1', themes=['simple','modern','traditional'];
  function theme(value){if(!themes.includes(value))value='simple';window.CartwiseAndroid?.setAppearance?.(value);document.documentElement.dataset.theme=value;for(const input of document.querySelectorAll('[name=theme]'))input.checked=input.value===value;try{localStorage.setItem(key,value);}catch{}}
  let saved='simple';try{saved=localStorage.getItem(key)||saved;}catch{}theme(saved);
  document.querySelectorAll('[name=theme]').forEach(input=>input.addEventListener('change',()=>theme(input.value)));
  document.getElementById('clear-private-data')?.addEventListener('click',()=>{
    if(window.CartwiseRetailer?.clearPrivateData)window.CartwiseRetailer.clearPrivateData();
    else if(confirm('لیست و تنظیمات روی این مرورگر پاک شوند؟')){localStorage.clear();location.reload();}
  });
  // Normalize keyboard and pasted Persian numerals before number fields reject them.
  const digits=s=>s.replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/٫/g,'.');
  document.addEventListener('beforeinput',e=>{if(e.target.matches('input[type=number]')&&e.data&&digits(e.data)!==e.data){e.preventDefault();const next=(e.target.value||'')+digits(e.data);e.target.value=next;e.target.dispatchEvent(new Event('input',{bubbles:true}));}});
  document.addEventListener('paste',e=>{if(e.target.matches('input[type=number]')){const raw=e.clipboardData?.getData('text')||'';if(digits(raw)!==raw){e.preventDefault();e.target.value=digits(raw);e.target.dispatchEvent(new Event('input',{bubbles:true}));e.target.dispatchEvent(new Event('change',{bubbles:true}));}}});
  window.CartwiseAppearance={setTheme:theme};
})();
