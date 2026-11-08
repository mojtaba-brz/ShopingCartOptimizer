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
      else if (path === '/api/product') throw Error('Live product import is not available in this offline Android version. Open Digikala in your browser, then enter and confirm the current prices and stock.');
      else throw Error('Unknown local operation');
      return new Response(JSON.stringify(result), {status:200, headers:{'Content-Type':'application/json'}});
    } catch (error) { return new Response(JSON.stringify({error:error.message}), {status:400, headers:{'Content-Type':'application/json'}}); }
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('android-app');
    document.querySelector('.market small').textContent = 'Offline Android workspace';
    document.querySelector('.sidebar-foot').innerHTML = '<span class="local-dot"></span> Stored on this device<small>Export a JSON snapshot to keep a backup.</small><a href="https://www.digikala.com/fresh/" target="_blank" rel="noopener noreferrer">Open Digikala ↗</a>';
    document.querySelector('#link-form').closest('.import-card').innerHTML = '<h3>Use current Digikala prices</h3><p class="hint">Open Digikala in your browser, choose your delivery location, and enter the prices and stock below. This app optimizes reviewed snapshots offline.</p><a class="text-button" href="https://www.digikala.com/fresh/" target="_blank" rel="noopener noreferrer">Open Digikala ↗</a>';
  });
})();
