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
document.getElementById('toggle').onclick = () => panel.classList.toggle('closed');
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

// Scalloped frame
const frame = document.getElementById('frame'), outline = document.querySelector('#outline path');
function scallop() {
  const w = frame.clientWidth, h = frame.clientHeight, t = Math.max(36, w / 14);
  const nh = Math.max(2, Math.round((w - t) / t)), nv = Math.max(2, Math.round((h - t) / t));
  const rh = w / nh / 2, rv = h / nv / 2;
  const x0 = rv, x1 = w - rv, y0 = rh, y1 = h - rh;
  const dx = (x1 - x0) / nh, dy = (y1 - y0) / nv;
  let d = `M${x0} ${y0}`;
  for (let i = 0; i < nh; i++) d += `A${dx / 2} ${rh} 0 0 1 ${x0 + dx * (i + 1)} ${y0}`;
  for (let i = 0; i < nv; i++) d += `A${rv} ${dy / 2} 0 0 1 ${x1} ${y0 + dy * (i + 1)}`;
  for (let i = 0; i < nh; i++) d += `A${dx / 2} ${rh} 0 0 1 ${x1 - dx * (i + 1)} ${y1}`;
  for (let i = 0; i < nv; i++) d += `A${rv} ${dy / 2} 0 0 1 ${x0} ${y1 - dy * (i + 1)}`;
  d += 'Z';
  outline.setAttribute('d', d);
  document.getElementById('map').style.clipPath = `path('${d}')`;
  map.invalidateSize();
}
addEventListener('resize', scallop);
scallop();