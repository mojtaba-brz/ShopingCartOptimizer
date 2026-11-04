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
      else if (path === '/api/product') throw Error('Use Search Digikala next to your shopping-list item to read current supermarket prices.');
      else throw Error('Unknown local operation');
      return new Response(JSON.stringify(result), {status:200, headers:{'Content-Type':'application/json'}});
    } catch (error) { return new Response(JSON.stringify({error:error.message}), {status:400, headers:{'Content-Type':'application/json'}}); }
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('android-app');
    document.querySelector('.market small').textContent = 'Live Digikala + on-device planner';
    document.querySelector('.sidebar-foot').innerHTML = '<span class="local-dot"></span> Stored on this device<small>Live prices come from Digikala. Export JSON to keep a backup.</small>';
  });
})();
