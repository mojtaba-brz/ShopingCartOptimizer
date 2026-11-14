/* Only active inside the Android container. Desktop keeps its Python API. */
(function () {
  'use strict';
  if (!window.CartwiseAndroid) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (url, options = {}) => {
    const path = typeof url === 'string' ? url : url.url;
    if (!path.startsWith('/api/')) return originalFetch(url, options);
    try {
      const data = options.body ? JSON.parse(options.body) : null;
      let result;
      if (path === '/api/validate') result = {valid:true, snapshot:CartwiseEngine.normalize(data)};
      else if (path === '/api/optimize') result = await CartwiseEngine.optimize(data);
      else if (path === '/api/demo') return originalFetch('/assets/demo.json');
      else if (path === '/api/product') throw Error('برای خواندن قیمت‌های روز، جست‌وجوی خودکار را اجرا کنید.');
      else throw Error('این عملیات در دسترس نیست.');
      return new Response(JSON.stringify(result), {status:200, headers:{'Content-Type':'application/json'}});
    } catch (error) { return new Response(JSON.stringify({error:error.message}), {status:400, headers:{'Content-Type':'application/json'}}); }
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('android-app');
    document.querySelector('.market small').textContent = 'جست‌وجوی دیجی‌کالا؛ محاسبه روی گوشی';
    document.querySelector('.sidebar-foot').innerHTML = '<span class="local-dot"></span> ذخیره روی این گوشی<small>قیمت‌ها از دیجی‌کالا خوانده می‌شوند. از لیست خود پشتیبان بگیرید.</small>';
  });
})();
