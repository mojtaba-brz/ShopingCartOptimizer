'use strict';
const p=new URLSearchParams(location.search),map=CartwiseMap.mount(document.getElementById('map'),{latitude:Number(p.get('lat')),longitude:Number(p.get('lon'))});
document.getElementById('choose').onclick=()=>{const point=map.point();if(window.CartwiseMapBridge)CartwiseMapBridge.select(String(point.latitude),String(point.longitude));};
