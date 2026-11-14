/* Small in-app slippy map. Only visible tiles are requested, with normal HTTP
 * caching and visible OSM attribution. No SDK, WebGL, GPS or Jet map dependency. */
(function(root){
 'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function project(lat,lon,z){const n=256*2**z,r=clamp(lat,-85,85)*Math.PI/180;return {x:(lon+180)/360*n,y:(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n};}
 function unproject(x,y,z){const n=256*2**z;return {latitude:clamp(Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI,-85,85),longitude:((x/n*360)%360+360)%360-180};}
 function mount(element,point,onChange){
  let latitude=Number(point?.latitude)||35.6892,longitude=Number(point?.longitude)||51.389,z=14,drag=null,closed=false,timer;
  element.classList.add('app-map');element.setAttribute('role','application');element.setAttribute('aria-label','نقشهٔ انتخاب موقعیت');element.tabIndex=0;
  const tiles=document.createElement('div');tiles.className='map-tiles';const marker=document.createElement('span');marker.className='map-marker';marker.textContent='📍';const controls=document.createElement('div');controls.className='map-controls';
  const status=document.createElement('p');status.className='map-status';status.textContent='نقشه را جابه‌جا کنید؛ نشانگر وسط، موقعیت انتخابی است.';
  const credit=document.createElement('a');credit.className='map-credit';credit.textContent='© OpenStreetMap contributors';credit.href='https://www.openstreetmap.org/copyright';credit.target='_blank';credit.rel='noopener';
  for(const [label,delta] of [['بزرگ‌نمایی',1],['کوچک‌نمایی',-1]]){const b=document.createElement('button');b.type='button';b.textContent=delta>0?'+':'−';b.setAttribute('aria-label',label);b.onclick=()=>{z=clamp(z+delta,5,18);paint();};controls.appendChild(b);}
  element.replaceChildren(tiles,marker,controls,status,credit);
  function paint(){if(closed)return;const w=element.clientWidth||320,h=element.clientHeight||320,center=project(latitude,longitude,z),left=center.x-w/2,top=center.y-h/2;tiles.replaceChildren();let count=0;for(let x=Math.floor(left/256);x<=Math.floor((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h)/256);y++){if(y<0||y>=2**z||count++>24)continue;const img=document.createElement('img');img.alt='';img.draggable=false;img.className='map-tile';img.referrerPolicy='origin';img.src=`https://tile.openstreetmap.org/${z}/${(x%2**z+2**z)%2**z}/${y}.png`;img.style.left=(x*256-left)+'px';img.style.top=(y*256-top)+'px';img.onerror=()=>{status.textContent='تصاویر نقشه دریافت نشد؛ انتخاب مختصات و جست‌وجوی متنی همچنان در دسترس‌اند.';};tiles.appendChild(img);}onChange?.({latitude,longitude});}
  function move(dx,dy){const p=project(latitude,longitude,z),next=unproject(p.x-dx,p.y-dy,z);latitude=next.latitude;longitude=next.longitude;clearTimeout(timer);timer=setTimeout(paint,150);}
  element.onpointerdown=e=>{if(e.target.closest('button,a'))return;drag={x:e.clientX,y:e.clientY};element.setPointerCapture(e.pointerId);};
  element.onpointerup=e=>{if(!drag)return;const d=drag;drag=null;move(e.clientX-d.x,e.clientY-d.y);};element.onpointercancel=()=>{drag=null;};
  element.onkeydown=e=>{const keys={ArrowLeft:[80,0],ArrowRight:[-80,0],ArrowUp:[0,80],ArrowDown:[0,-80]};if(keys[e.key]){e.preventDefault();move(...keys[e.key]);}};
  paint();return {point:()=>({latitude,longitude}),close(){closed=true;clearTimeout(timer);element.replaceChildren();}};
 }
 const api={mount,project,unproject};root.CartwiseMap=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
