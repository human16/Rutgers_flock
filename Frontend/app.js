// Rutgers–New Brunswick campus center (College Ave)
const CENTER = [40.5008, -74.4474];
const map = L.map('map', { zoomControl: true, minZoom: 11, maxZoom: 18 }).setView(CENTER, 14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);
map.zoomControl.setPosition('topright');

const daffodil = () => L.divIcon({
  className: 'dm',
  html: '<svg viewBox="0 0 100 100"><use href="#daffodil"/></svg>',
  iconSize: [44, 44],
  iconAnchor: [22, 40],
  popupAnchor: [0, -36]
});
const personIcon = L.divIcon({
  className: 'me',
  html: '<svg viewBox="0 0 40 50"><use href="#person"/></svg>',
  iconSize: [34, 42],
  iconAnchor: [17, 42]
});

const pins = L.layerGroup().addTo(map);

function addMemory(title, lat, lng, text) {
  const el = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = title;
  const p = document.createElement('span');
  p.textContent = text;
  el.append(b, p);
  L.marker([lat, lng], { icon: daffodil() }).addTo(pins).bindPopup(el);
}

async function loadMemories() {
  try {
    const res = await fetch('memories.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const memories = await res.json();
    memories.forEach(m => addMemory(m.title, m.lat, m.lng, m.text));
  } catch (err) {
    console.error('Failed to load memories.json:', err);
  }
}
loadMemories();

// ---- Historical buildings: main decade slider + per-building timeline ----
const bLayer=L.layerGroup().addTo(map);
const sel=document.getElementById('decade'),note=document.getElementById('eranote'),label=document.getElementById('decadeLabel');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const THIS_YEAR=new Date().getFullYear();
let selected=null;           // currently opened building (object from the API)
let markers=new Map();       // name -> marker

async function loadBuildings(){
  bLayer.clearLayers();markers=new Map();
  try{
    const r=await fetch('/api/buildings?decade='+encodeURIComponent(sel.value));
    const {buildings,unmapped}=await r.json();
    buildings.forEach(b=>{
      const m=L.marker([b.lat,b.lng],{icon:L.divIcon({className:'bm'+(b.year_demolished?' gone':'')+(selected&&selected.name===b.name?' sel':''),
        html:'<i></i>',iconSize:[20,20],iconAnchor:[10,10]}),title:b.name}).addTo(bLayer);
      m.on('click',()=>openBuilding(b));
      markers.set(b.name,m);
    });
    note.textContent=`${buildings.length} building${buildings.length===1?'':'s'} shown`+(unmapped?` (${unmapped} not yet located)`:'')+'. Click a dot to open its card.';
  }catch{note.textContent='Could not load buildings.';}
}
let t;
function syncLabel(){
  label.textContent=sel.value+'s';
  // the further back in time, the more the map "ages" (sepia + vignette, see style.css)
  const age=Math.min(1,Math.max(0,(2020-Number(sel.value))/260));
  document.documentElement.style.setProperty('--age',age.toFixed(3));
}
sel.oninput=()=>{
  syncLabel();clearTimeout(t);t=setTimeout(loadBuildings,120);
  if(selected) setYear(Number(sel.value)); // keep the building timeline in step with the main slider
};
syncLabel();loadBuildings();

// ---- Building panel (outside the clipped map so nothing is cut off) ----
const panelB=document.getElementById('bpanel'),bBody=document.getElementById('bbody');
document.getElementById('bclose').onclick=()=>{panelB.hidden=true;selected=null;markers.forEach(m=>m.getElement()?.classList.remove('sel'));};
let bMin=0,bMax=0;
// stable, made-up "accession number" per building (a nod to archive cards)
const accNo=n=>String(100+[...n].reduce((s,c)=>(s*31+c.charCodeAt(0))%900,7)).padStart(3,'0');
function openBuilding(b){
  selected=b;
  markers.forEach((m,n)=>m.getElement()?.classList.toggle('sel',n===b.name));
  const dated=b.images.filter(i=>i.year).sort((x,y)=>x.year-y.year);
  const years=[b.year_built,...dated.map(i=>i.year)].filter(Boolean);
  bMin=Math.min(...years,Number(sel.value));bMax=b.year_demolished||THIS_YEAR;
  bMin=Math.floor(bMin/10)*10;                    // start on a decade so it lines up with the main slider
  const undated=b.images.filter(i=>!i.year);
  bBody.innerHTML=`<p class="acc">Acc. no. ${accNo(b.name)} · ${esc(b.campus)}</p><h3>${esc(b.name)}</h3>
    <div class="yrs">${b.year_built?'Built '+b.year_built:'Build year unknown'}${b.year_demolished?' · Razed '+b.year_demolished:''}<span class="tag">${b.year_demolished?'Lost':'Standing'}</span></div>
    <p>${esc(b.description)}</p>
    <div class="tl"><div class="tlhead"><span>Year<b id="tlYear"></b></span><span id="tlStatus" class="status"></span></div>
      <input type="range" id="tlSlider" min="${bMin}" max="${bMax}" step="1" aria-label="Year for ${esc(b.name)}">
      <div class="ticks"><span>${bMin}</span><span>${bMax}</span></div>
      <div class="tlmarks">${dated.map(i=>`<button data-y="${i.year}" title="Photo from ${i.year}">${i.year}</button>`).join('')||'<em>No dated photos yet.</em>'}</div>
    </div>
    <figure id="tlFig"></figure>
    ${undated.length?`<div class="undated"><b>Undated photos</b>${undated.map(i=>`<figure><img loading="lazy" src="${esc(i.url)}" alt="${esc(b.name)}"><figcaption>${esc(i.credit)} · <a href="${esc(i.page)}" target="_blank" rel="noopener">${esc(i.license)}</a></figcaption></figure>`).join('')}</div>`:''}`;
  const slider=document.getElementById('tlSlider');
  slider.oninput=()=>renderYear(Number(slider.value));
  bBody.querySelectorAll('.tlmarks button').forEach(btn=>btn.onclick=()=>setYear(Number(btn.dataset.y)));
  panelB.hidden=false;
  if(innerWidth<1100) document.getElementById('panel').classList.add('closed');
  setYear(Number(sel.value));
}
function setYear(y){
  const s=document.getElementById('tlSlider');if(!s)return;
  y=Math.min(Math.max(y,bMin),bMax);s.value=y;renderYear(y);
}
function renderYear(y){
  const b=selected;if(!b)return;
  document.getElementById('tlYear').textContent=y;
  let st='Standing',cls='ok';
  if(b.year_built&&y<b.year_built){st='Not yet built';cls='no';}
  else if(b.year_demolished&&y>=b.year_demolished){st='Demolished';cls='gone';}
  else if(!b.year_built){st='Build year unknown';cls='no';}
  const el=document.getElementById('tlStatus');el.textContent=st;el.className='status '+cls;
  const dated=b.images.filter(i=>i.year).sort((x,z)=>x.year-z.year);
  const fig=document.getElementById('tlFig');
  if(!dated.length){fig.innerHTML='<div class="noimg">No dated photo available yet.</div>';return;}
  const past=dated.filter(i=>i.year<=y);
  const img=past.length?past[past.length-1]:dated[0];       // latest photo not after the chosen year
  const early=!past.length;
  const gap=Math.abs(img.year-y);
  fig.innerHTML=`<img src="${esc(img.url)}" alt="${esc(b.name)} in ${img.year}">
    <figcaption><b>Photo from ${img.year}</b>${early?' (earliest photo we have)':gap?` (closest earlier photo, ${gap} yr before)`:''}<br>
    ${esc(img.credit)} · <a href="${esc(img.page)}" target="_blank" rel="noopener">${esc(img.license)}</a></figcaption>`;
}

// ---- Decorative contour lines ("topology") behind the header ----
(function contours(){
  const svg=document.getElementById('contours');if(!svg)return;
  const NS='http://www.w3.org/2000/svg',W=620,H=340,cx=420,cy=150;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  for(let k=1;k<=16;k++){
    const r=k*17,pts=[];
    for(let i=0;i<=64;i++){
      const t=i/64*Math.PI*2;
      const wob=1+.16*Math.sin(3*t+k*.35)+.09*Math.sin(5*t-k*.2)+.05*Math.sin(9*t+k);
      pts.push([cx+Math.cos(t)*r*1.55*wob,cy+Math.sin(t)*r*wob]);
    }
    const p=document.createElementNS(NS,'path');
    p.setAttribute('d','M'+pts.map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join('L')+'Z');
    svg.appendChild(p);
  }
})();

// Locate me
let meMarker = null;
function placeMe(lat, lng, fly = true) {
  if (meMarker) meMarker.setLatLng([lat, lng]);
  else meMarker = L.marker([lat, lng], { icon: personIcon, zIndexOffset: 1000 }).addTo(map);
  if (fly) map.flyTo([lat, lng], 16);
}
document.getElementById('locate').onclick = () => {
  if (!navigator.geolocation) return alert('Geolocation not supported.');
  navigator.geolocation.getCurrentPosition(
    p => placeMe(p.coords.latitude, p.coords.longitude),
    () => alert('Could not get your location.')
  );
};
let watchId = null;
document.getElementById('inperson').onclick = () => {
  const st = document.getElementById('ipstate');
  if (watchId === null) {
    if (!navigator.geolocation) return alert('Geolocation not supported.');
    watchId = navigator.geolocation.watchPosition(
      p => placeMe(p.coords.latitude, p.coords.longitude, false),
      () => {}
    );
    st.textContent = 'On';
  } else {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    st.textContent = 'Off';
  }
};

// Add memory panel
const panel = document.getElementById('panel'), hint = document.getElementById('hint');
let pick = null, pickMarker = null;
document.getElementById('toggle').onclick = () => {
  panel.classList.toggle('closed');
  if (!panel.classList.contains('closed') && innerWidth < 1100) document.getElementById('bclose').click();
};
map.on('click', e => {
  if (panel.classList.contains('closed')) return;
  pick = e.latlng;
  if (pickMarker) pickMarker.setLatLng(pick);
  else pickMarker = L.marker(pick, { icon: daffodil(), opacity: .6 }).addTo(map);
  hint.textContent = 'Location pinned ✓';
  hint.classList.add('ok');
});

document.getElementById('form').onsubmit = async e => {
  e.preventDefault();
  if (!pick) {
    hint.textContent = 'Please click the map to pin a location first.';
    return;
  }
  const f = new FormData(e.target);
  const newMemory = {
    title: f.get('title').trim(),
    lat: pick.lat,
    lng: pick.lng,
    text: f.get('text').trim()
  };

  // Save to memories.json via backend (falls back to in-memory if running read-only)
  try {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMemory)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn('Could not persist to memories.json (read-only mode):', err);
  }

  addMemory(newMemory.title, newMemory.lat, newMemory.lng, newMemory.text);
  map.removeLayer(pickMarker);
  pickMarker = null;
  pick = null;
  e.target.reset();
  hint.textContent = 'Click the map to pin where this memory happened.';
  hint.classList.remove('ok');
  panel.classList.add('closed');
};

// Plain rectangular map: just keep Leaflet sized to its container
addEventListener('resize', () => map.invalidateSize());
map.invalidateSize();
