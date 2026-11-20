import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, 'memories.db'));
db.exec(`CREATE TABLE IF NOT EXISTS memories(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, text TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

if (db.prepare('SELECT COUNT(*) c FROM memories').get().c === 0) {
  const ins = db.prepare('INSERT INTO memories(title,text,lat,lng) VALUES(?,?,?,?)');
  [
    ['College Ave Student Center', 'Late-night study sessions with bad coffee.', 40.5030, -74.4510],
    ['Voorhees Mall', 'Frisbee on the first warm day of spring.', 40.4996, -74.4472],
    ['Old Queens', 'Convocation. Everyone was nervous and excited.', 40.4985, -74.4467],
    ['The Yard', 'Free food, loud music, new friends.', 40.5017, -74.4486],
    ['Rutgers Gardens', 'A quiet walk when finals got too loud.', 40.4738, -74.4220],
    ['Busch Student Center', 'First hackathon — 24 hours, zero sleep.', 40.5222, -74.4590],
    ['Passion Puddle', 'Skipping rocks and talking for hours.', 40.4803, -74.4366],
    ['George St', 'Where I met my best friend.', 40.4948, -74.4455],
  ].forEach(r => ins.run(...r));
}

// ---- Historical buildings (loaded from data/buildings.csv at startup) ----
const DATA_DIR = path.join(__dirname, '..', 'data');
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
function loadBuildings() {
  const map = new Map();
  for (const r of parseCSV(fs.readFileSync(path.join(DATA_DIR, 'buildings.csv'), 'utf8'))) {
    let b = map.get(r.name);
    if (!b) {
      b = { name: r.name, campus: r.campus, description: r.description,
        lat: r.lat ? Number(r.lat) : null, lng: r.lng ? Number(r.lng) : null,
        year_built: r.year_built ? Number(r.year_built) : null,
        year_demolished: r.year_demolished ? Number(r.year_demolished) : null, images: [] };
      map.set(r.name, b);
    }
    if (r.image_file) b.images.push({ url: '/images/' + encodeURIComponent(r.image_file),
      year: r.image_year ? Number(r.image_year) : null, credit: r.image_credit,
      license: r.image_license, page: r.source_url });
  }
  return [...map.values()];
}
const buildings = loadBuildings();

const app = express();
app.use('/images', express.static(path.join(DATA_DIR, 'images')));

// ?decade=1960 returns buildings that existed at any point in 1960-1969.
// No decade (or "all") returns every building. Buildings without coordinates are counted, not listed.
app.get('/api/buildings', (req, res) => {
  const d = req.query.decade;
  let list = buildings;
  if (d && d !== 'all') {
    const start = parseInt(d, 10);
    if (!Number.isInteger(start)) return res.status(400).json({ error: 'decade must be a year like 1960' });
    const end = start + 9;
    list = list.filter(b => b.year_built !== null && b.year_built <= end &&
      (b.year_demolished === null || b.year_demolished >= start));
  }
  res.json({ buildings: list.filter(b => b.lat !== null), unmapped: list.filter(b => b.lat === null).length });
});

app.use(express.json({ limit: '10kb' }));

// New Brunswick-area bounds
const IN_BOUNDS = (lat, lng) => lat > 40.43 && lat < 40.56 && lng > -74.55 && lng < -74.37;

app.get('/api/memories', (_req, res) => {
  res.json(db.prepare('SELECT id,title,text,lat,lng,created_at FROM memories ORDER BY id').all());
});

app.post('/api/memories', (req, res) => {
  const { title, text, lat, lng } = req.body ?? {};
  if (typeof title !== 'string' || typeof text !== 'string' ||
      !title.trim() || !text.trim() || title.length > 80 || text.length > 1000)
    return res.status(400).json({ error: 'Invalid title or text.' });
  if (typeof lat !== 'number' || typeof lng !== 'number' || !IN_BOUNDS(lat, lng))
    return res.status(400).json({ error: 'Location must be in the New Brunswick area.' });
  const r = db.prepare('INSERT INTO memories(title,text,lat,lng) VALUES(?,?,?,?)')
    .run(title.trim(), text.trim(), lat, lng);
  res.status(201).json(db.prepare('SELECT * FROM memories WHERE id=?').get(r.lastInsertRowid));
});

app.use(express.static(path.join(__dirname, '..', 'Frontend')));
const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`http://localhost:${port}`));
