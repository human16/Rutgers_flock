// Rutgers–New Brunswick campus center (College Ave)
const CENTER=[40.5008,-74.4474];
const map=L.map('map',{zoomControl:true,minZoom:11,maxZoom:18}).setView(CENTER,14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
map.zoomControl.setPosition('topright');

const daffodil=()=>L.divIcon({className:'dm',html:'<svg viewBox="0 0 100 100"><use href="#daffodil"/></svg>',iconSize:[44,44],iconAnchor:[22,40],popupAnchor:[0,-36]});
const personIcon=L.divIcon({className:'me',html:'<svg viewBox="0 0 40 50"><use href="#person"/></svg>',iconSize:[34,42],iconAnchor:[17,42]});

const seed=[
 ['College Ave Student Center',40.5030,-74.4510,'Late-night study sessions with bad coffee.'],
 ['Voorhees Mall',40.4996,-74.4472,'Frisbee on the first warm day of spring.'],
 ['Old Queens',40.4985,-74.4467,'Convocation. Everyone was nervous and excited.'],
 ['The Yard',40.5017,-74.4486,'Free food, loud music, new friends.'],
 ['Rutgers Gardens',40.4738,-74.4220,'A quiet walk when finals got too loud.'],
 ['Busch Student Center',40.5222,-74.4590,'First hackathon — 24 hours, zero sleep.'],
 ['Livingston Plaza',40.5236,-74.4358,'Orientation week.'],
 ['Cook Campus Farm',40.4790,-74.4330,'Picking tomatoes between classes.'],
 ['Douglass Library',40.4850,-74.4390,'My favorite corner desk.'],
 ['Rutgers Stadium',40.5140,-74.4650,'Game day tailgate with the whole dorm.'],
 ['Passion Puddle',40.4803,-74.4366,'Skipping rocks and talking for hours.'],
 ['Easton Ave',40.4972,-74.4440,'Bagel run after an 8:40 exam.'],
 ['George St',40.4948,-74.4455,'Where I met my best friend.'],
 ['Hill Center',40.5233,-74.4635,'Calc II survivors.'],
 ['Rutgers Student Health',40.4948,-74.4440,'Learned how to adult.'],
 ['Raritan River Towpath',40.4955,-74.4460,'Sunset walks by the river.']
];
const pins=L.layerGroup().addTo(map);
function addMemory(t,lat,lng,txt){
  const el=document.createElement('div');
  const b=document.createElement('b');b.textContent=t;
  const p=document.createElement('span');p.textContent=txt;
  el.append(b,p);
  L.marker([lat,lng],{icon:daffodil()}).addTo(pins).bindPopup(el);
}
// cluster-ish extras around the core of campus for the dense "bouquet" look
seed.forEach(s=>addMemory(...s));
for(let i=0;i<40;i++){
  addMemory('A memory',CENTER[0]+(Math.random()-.5)*.012,CENTER[1]+(Math.random()-.5)*.016,'Left by a fellow Scarlet Knight.');
}

// Locate me
let meMarker=null;
function placeMe(lat,lng,fly=true){
  if(meMarker)meMarker.setLatLng([lat,lng]);else meMarker=L.marker([lat,lng],{icon:personIcon,zIndexOffset:1000}).addTo(map);
  if(fly)map.flyTo([lat,lng],16);
}
document.getElementById('locate').onclick=()=>{
  if(!navigator.geolocation)return alert('Geolocation not supported.');
  navigator.geolocation.getCurrentPosition(p=>placeMe(p.coords.latitude,p.coords.longitude),
    ()=>alert('Could not get your location.'));
};
let watchId=null;
document.getElementById('inperson').onclick=()=>{
  const st=document.getElementById('ipstate');
  if(watchId===null){
    if(!navigator.geolocation)return alert('Geolocation not supported.');
    watchId=navigator.geolocation.watchPosition(p=>placeMe(p.coords.latitude,p.coords.longitude,false),()=>{});
    st.textContent='On';
  }else{navigator.geolocation.clearWatch(watchId);watchId=null;st.textContent='Off';}
};

// Add memory panel
const panel=document.getElementById('panel'),hint=document.getElementById('hint');
let pick=null,pickMarker=null;
document.getElementById('toggle').onclick=()=>panel.classList.toggle('closed');
map.on('click',e=>{
  if(panel.classList.contains('closed'))return;
  pick=e.latlng;
  if(pickMarker)pickMarker.setLatLng(pick);else pickMarker=L.marker(pick,{icon:daffodil(),opacity:.6}).addTo(map);
  hint.textContent='Location pinned ✓';hint.classList.add('ok');
});
document.getElementById('form').onsubmit=e=>{
  e.preventDefault();
  if(!pick){hint.textContent='Please click the map to pin a location first.';return;}
  const f=new FormData(e.target);
  addMemory(f.get('title'),pick.lat,pick.lng,f.get('text'));
  map.removeLayer(pickMarker);pickMarker=null;pick=null;e.target.reset();
  hint.textContent='Click the map to pin where this memory happened.';hint.classList.remove('ok');
  panel.classList.add('closed');
};

// Scalloped frame
const frame=document.getElementById('frame'),outline=document.querySelector('#outline path');
function scallop(){
  const w=frame.clientWidth,h=frame.clientHeight,t=Math.max(36,w/14);
  const nh=Math.max(2,Math.round((w-t)/t)),nv=Math.max(2,Math.round((h-t)/t));
  const rh=(w)/nh/2,rv=(h)/nv/2; // bulge sizes
  const x0=rv,x1=w-rv,y0=rh,y1=h-rh;
  const dx=(x1-x0)/nh,dy=(y1-y0)/nv;
  let d=`M${x0} ${y0}`;
  for(let i=0;i<nh;i++)d+=`A${dx/2} ${rh} 0 0 1 ${x0+dx*(i+1)} ${y0}`;
  for(let i=0;i<nv;i++)d+=`A${rv} ${dy/2} 0 0 1 ${x1} ${y0+dy*(i+1)}`;
  for(let i=0;i<nh;i++)d+=`A${dx/2} ${rh} 0 0 1 ${x1-dx*(i+1)} ${y1}`;
  for(let i=0;i<nv;i++)d+=`A${rv} ${dy/2} 0 0 1 ${x0} ${y1-dy*(i+1)}`;
  d+='Z';
  outline.setAttribute('d',d);
  document.getElementById('map').style.clipPath=`path('${d}')`;
  map.invalidateSize();
}
addEventListener('resize',scallop);scallop();
