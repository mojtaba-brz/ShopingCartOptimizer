/* Shared shell: persistent navigation and one wide-screen shopping workspace. */
(function(){
 'use strict';
 const list=document.getElementById('tab-list'),results=document.getElementById('tab-results');
 const workspace=document.createElement('div');workspace.className='shopping-workspace';workspace.id='shopping-workspace';list.before(workspace);workspace.append(list,results);
 const original=showTab;let current=document.querySelector('.nav.active')?.dataset.tab||'list';
 const wide=matchMedia('(min-width:1280px)');
 function layout(){const combined=wide.matches&&!document.body.classList.contains('android-app');document.body.classList.toggle('wide-workspace',combined);workspace.dataset.open=String(['list','results'].includes(current));if(combined&&workspace.dataset.open==='true'){list.hidden=false;results.hidden=false;}else{list.hidden=current!=='list';results.hidden=current!=='results';}}
 showTab=function(name){original(name);current=name;document.body.dataset.view=name;document.querySelectorAll('.nav').forEach(n=>{if(n.dataset.tab===name)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});layout();};
 wide.addEventListener('change',()=>showTab(current));document.addEventListener('DOMContentLoaded',()=>showTab(current));showTab(current);
 const paths={list:'M5 5h14v15H5z M9 3v4h6V3 M8 11h8 M8 15h6',results:'M4 8h16l-1 12H5z M8 8V6a4 4 0 0 1 8 0v2',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2'};
 for(const button of document.querySelectorAll('.nav')){const span=button.querySelector('span'),path=paths[button.dataset.tab];if(span&&path){span.className='nav-icon';span.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;}}
 const toolbar=document.querySelector('.toolbar'),settings=document.getElementById('tab-settings');
 const utilities=document.createElement('details');utilities.className='card utility-actions';utilities.innerHTML='<summary>پشتیبان‌گیری و مدیریت لیست</summary><div class="utility-buttons"></div>';for(const id of ['import','export','reset','file'])utilities.querySelector('div').append(document.getElementById(id));settings.append(utilities);document.getElementById('demo').hidden=true;
 const language=document.createElement('label');language.className='locale-control';language.innerHTML='<span>زبان</span><select id="app-language" aria-label="زبان برنامه"><option value="fa">فارسی</option><option value="en">English</option><option value="ckb">کوردی · سۆرانی</option><option value="ku">Kurdî · Kurmancî</option><option value="az-Arab">تۆرکجه · آذربایجانی</option></select>';toolbar.append(language);
})();
