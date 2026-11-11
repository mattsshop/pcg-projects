// Demo backend — same interface as backend-firebase.js, stored in this browser's localStorage.
const KEY = 'pcg-projects-demo-v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
}
function save(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch (e) { alert('Demo storage is full (browser limit). Use smaller images, or connect Firebase.'); throw e; }
}
function rid(n = 20) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => a[x % a.length]).join('');
}

// Simple placeholder "plan sheet" drawings for the demo.
function sheetSvg(title, kind) {
  const draw = {
    layout: '<rect x="40" y="60" width="520" height="300" fill="none" stroke="#222" stroke-width="6"/><rect x="40" y="60" width="160" height="120" fill="none" stroke="#222" stroke-width="3"/><text x="70" y="125" font-size="16">BATH</text><rect x="300" y="160" width="180" height="140" fill="#eee" stroke="#555"/><text x="350" y="235" font-size="16">KING BED</text><rect x="40" y="300" width="160" height="60" fill="none" stroke="#555"/><text x="60" y="335" font-size="14">CLOSET</text>',
    electrical: '<rect x="40" y="60" width="520" height="300" fill="none" stroke="#999" stroke-width="4"/>' +
      [[90, 200], [250, 360], [520, 150], [520, 290], [380, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="#c00" stroke-width="3"/><line x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}" stroke="#c00" stroke-width="3"/>`).join('') +
      '<text x="300" y="215" font-size="14" fill="#c00">REC @ 18" AFF (TYP)</text><text x="300" y="240" font-size="14" fill="#c00">TV BOX @ 48" AFF</text>',
    blocking: '<rect x="60" y="80" width="480" height="260" fill="none" stroke="#222" stroke-width="3"/><rect x="200" y="150" width="200" height="30" fill="#f6c76b" stroke="#a66"/><text x="205" y="140" font-size="14">2x10 BLOCKING @ 42"-54" AFF (TV)</text><rect x="90" y="260" width="140" height="24" fill="#f6c76b" stroke="#a66"/><text x="90" y="305" font-size="14">GRAB BAR BLKG @ 33"-36"</text>',
    millwork: '<rect x="100" y="120" width="400" height="200" fill="none" stroke="#222" stroke-width="3"/><line x1="233" y1="120" x2="233" y2="320" stroke="#222"/><line x1="366" y1="120" x2="366" y2="320" stroke="#222"/><text x="140" y="100" font-size="14">VANITY / WARDROBE ELEV — 30" D x 72" W</text>',
    ffe: '<rect x="40" y="60" width="520" height="300" fill="none" stroke="#999" stroke-width="4"/><rect x="300" y="160" width="180" height="140" fill="#dde" stroke="#447"/><text x="330" y="235" font-size="14">F-1 KING BED</text><rect x="90" y="200" width="80" height="60" fill="#dde" stroke="#447"/><text x="95" y="235" font-size="12">F-4 DESK</text><rect x="490" y="120" width="40" height="30" fill="#dde" stroke="#447"/><text x="440" y="115" font-size="12">F-2 NIGHTSTAND</text>',
    floor: Array.from({ length: 12 }, (_, i) => `<rect x="${20 + i * 46}" y="40" width="46" height="120" fill="none" stroke="#333" stroke-width="2"/><text x="${28 + i * 46}" y="105" font-size="12">${i < 6 ? '' : ''}R${101 + i}</text>`).join('') + '<rect x="20" y="160" width="552" height="60" fill="#f2f2f2" stroke="#333"/><text x="250" y="195" font-size="14">CORRIDOR</text>' + Array.from({ length: 12 }, (_, i) => `<rect x="${20 + i * 46}" y="220" width="46" height="120" fill="none" stroke="#333" stroke-width="2"/><text x="${28 + i * 46}" y="285" font-size="12">R${113 + i}</text>`).join('')
  }[kind] || '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" width="1200" height="840"><rect width="600" height="420" fill="#fff"/>${draw}<text x="20" y="400" font-size="16" font-family="Arial" font-weight="bold">${title}</text><text x="420" y="400" font-size="12" fill="#888">DEMO SHEET</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function seed() {
  const s = {};
  const pid = 'demoH2';
  s['users/demo'] = { email: 'demo@example.com', name: 'Demo User', approved: true, role: 'admin' };
  s[`projects/${pid}`] = { name: 'Home 2 Suites Douglasville (DEMO)', code: 'H2D', createdAt: Date.now() };
  const floors = [['f1', 'Level 1', 1], ['f2', 'Level 2', 2]];
  floors.forEach(([id, name, order]) => {
    s[`projects/${pid}/floors/${id}`] = { name, order, plan: { url: sheetSvg(`${name.toUpperCase()} FLOOR PLAN`, 'floor'), path: '' } };
  });
  const types = [['tK', 'King'], ['tQQ', 'Double Queen'], ['tADA', 'ADA King']];
  types.forEach(([id, name]) => {
    s[`projects/${pid}/types/${id}`] = {
      name,
      sheets: ['layout', 'electrical', 'blocking', 'millwork', 'ffe'].map((tab) => ({
        id: rid(8), tab, label: `${name} — ${tab.toUpperCase()}`, url: sheetSvg(`${name.toUpperCase()} — ${tab.toUpperCase()}`, tab), path: ''
      }))
    };
  });
  const roomList = [
    ['101', 'f1', 'tADA', false], ['102', 'f1', 'tK', false], ['103', 'f1', 'tK', true], ['104', 'f1', 'tQQ', false],
    ['201', 'f2', 'tK', false], ['202', 'f2', 'tK', true], ['203', 'f2', 'tQQ', false], ['204', 'f2', 'tQQ', true]
  ];
  roomList.forEach(([num, floorId, typeId, mirrored]) => {
    const id = rid();
    s[`projects/${pid}/rooms/${id}`] = { number: num, floorId, typeId, mirrored, notes: '', token: rid(10), sheets: [] };
  });
  s.__needsPublish = true;
  return s;
}

export async function createBackend() {
  let store = load();
  if (!store) { store = seed(); save(store); }
  let authCb = null;
  const user = { uid: 'demo', email: 'demo@example.com', name: 'Demo User' };

  const be = {
    demo: true,
    async get(path) { return store[path] ? { id: path.split('/').pop(), ...structuredClone(store[path]) } : null; },
    async list(path) {
      const depth = path.split('/').length + 1;
      return Object.keys(store)
        .filter((k) => k.startsWith(path + '/') && k.split('/').length === depth)
        .map((k) => ({ id: k.split('/').pop(), ...structuredClone(store[k]) }));
    },
    async set(path, data, merge = true) {
      store[path] = merge ? { ...(store[path] || {}), ...structuredClone(data) } : structuredClone(data);
      save(store);
    },
    async add(path, data) { const id = rid(); await be.set(`${path}/${id}`, data, false); return id; },
    async remove(path) {
      Object.keys(store).forEach((k) => { if (k === path || k.startsWith(path + '/')) delete store[k]; });
      save(store);
    },
    newId() { return rid(); },
    async upload(path, file) {
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      return { url, path };
    },
    async deleteFile() {},
    onAuth(cb) { authCb = cb; setTimeout(() => cb(user), 0); return () => {}; },
    async signIn() {}, async signUp() {}, async signInGoogle() {}, async resetPassword() {},
    async signOut() { if (confirm('Demo mode: reset all demo data?')) { localStorage.removeItem(KEY); location.reload(); } },
    takeNeedsPublish() { const n = store.__needsPublish; delete store.__needsPublish; save(store); return n; }
  };
  return be;
}
