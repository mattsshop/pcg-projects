// Data layer used by the app. Picks the demo or Firebase backend and adds project/room logic.
import { DEMO, TABS } from './config.js?v=0.3.1';

let be = null;

export async function initBackend(opts = {}) {
  if (be) return be;
  const mod = DEMO ? await import('./backend-demo.js?v=0.3.1') : await import('./backend-firebase.js?v=0.3.1');
  be = await mod.createBackend(opts);
  return be;
}
export const backend = () => be;

export function randomToken(n = 10) {
  // Unambiguous characters (no 0/O/1/l/I) so a token can be read off a label if needed.
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => a[x % a.length]).join('');
}

const byNum = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });

// ---------- users ----------
export async function ensureProfile(u) {
  const p = await be.get(`users/${u.uid}`);
  if (p) return p;
  const prof = { email: u.email || '', name: u.name || '', approved: false, role: 'member', createdAt: Date.now() };
  await be.set(`users/${u.uid}`, prof, false);
  return { id: u.uid, ...prof };
}
export const listUsers = () => be.list('users');
export const updateUser = (uid, patch) => be.set(`users/${uid}`, patch);

// ---------- projects ----------
export async function listProjects() {
  return (await be.list('projects')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
export const getProject = (pid) => be.get(`projects/${pid}`);
export async function saveProject(p) {
  const { id, ...data } = p;
  if (id) {
    await be.set(`projects/${id}`, data);
    if ('name' in data) await republish(id);
    return id;
  }
  return be.add('projects', { ...data, createdAt: Date.now() });
}

// ---------- floors ----------
export async function listFloors(pid) {
  return (await be.list(`projects/${pid}/floors`)).sort((a, b) => (a.order || 0) - (b.order || 0));
}
export async function saveFloor(pid, f) {
  const { id, ...data } = f;
  if (id) {
    await be.set(`projects/${pid}/floors/${id}`, data);
    if ('name' in data) await republish(pid, (r) => r.floorId === id);
    return id;
  }
  return be.add(`projects/${pid}/floors`, data);
}
export async function deleteFloor(pid, fid) {
  const pins = await be.list(`projects/${pid}/floors/${fid}/pins`);
  for (const p of pins) await be.remove(`projects/${pid}/floors/${fid}/pins/${p.id}`);
  await be.remove(`projects/${pid}/floors/${fid}`);
}

// ---------- pins on floor layouts ----------
export const listPins = (pid, fid) => be.list(`projects/${pid}/floors/${fid}/pins`);
export async function savePin(pid, fid, pin) {
  const { id, ...data } = pin;
  if (id) { await be.set(`projects/${pid}/floors/${fid}/pins/${id}`, data); return id; }
  return be.add(`projects/${pid}/floors/${fid}/pins`, data);
}
export const deletePin = (pid, fid, id) => be.remove(`projects/${pid}/floors/${fid}/pins/${id}`);

// ---------- room types ----------
export async function listTypes(pid) {
  return (await be.list(`projects/${pid}/types`)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
export async function saveType(pid, t) {
  const { id, ...data } = t;
  let tid = id;
  if (id) await be.set(`projects/${pid}/types/${id}`, data);
  else tid = await be.add(`projects/${pid}/types`, data);
  await republish(pid, (r) => r.typeId === tid);
  return tid;
}
export async function deleteType(pid, tid) {
  await be.remove(`projects/${pid}/types/${tid}`);
  const rooms = await listRooms(pid);
  for (const r of rooms.filter((x) => x.typeId === tid)) await saveRoom(pid, { ...r, typeId: '' });
}

// ---------- rooms ----------
export async function listRooms(pid) {
  return (await be.list(`projects/${pid}/rooms`)).sort(byNum);
}
export const getRoom = (pid, rid) => be.get(`projects/${pid}/rooms/${rid}`);

export async function saveRoom(pid, r) {
  const { id, ...data } = r;
  if (!data.token) data.token = randomToken();
  if (!data.sheets) data.sheets = [];
  let roomId = id;
  if (id) await be.set(`projects/${pid}/rooms/${id}`, data, false);
  else roomId = await be.add(`projects/${pid}/rooms`, data);
  await publishRoom(pid, { id: roomId, ...data });
  return roomId;
}
export async function deleteRoom(pid, r) {
  if (r.token) await be.remove(`scans/${r.token}`);
  await be.remove(`projects/${pid}/rooms/${r.id}`);
}
// New QR code for a room: the old label stops working.
export async function regenerateToken(pid, r) {
  if (r.token) await be.remove(`scans/${r.token}`);
  const token = randomToken();
  await saveRoom(pid, { ...r, token });
  return token;
}

// ---------- public scan pages ----------
// Each room is copied to scans/{token}: the only thing someone without an account can read.
async function buildScan(pid, r, cache = {}) {
  const project = cache.project || (await getProject(pid));
  const type = r.typeId ? (cache.types ? cache.types.find((t) => t.id === r.typeId) : await be.get(`projects/${pid}/types/${r.typeId}`)) : null;
  const floor = r.floorId ? (cache.floors ? cache.floors.find((f) => f.id === r.floorId) : await be.get(`projects/${pid}/floors/${r.floorId}`)) : null;
  const order = (tab) => { const i = TABS.findIndex((t) => t.key === tab); return i < 0 ? 99 : i; };
  const sheets = [...((type && type.sheets) || []).map((s) => ({ ...s, source: 'type' })), ...(r.sheets || []).map((s) => ({ ...s, source: 'room' }))]
    .sort((a, b) => order(a.tab) - order(b.tab) || (a.source === 'room' ? -1 : 0) - (b.source === 'room' ? -1 : 0))
    .map(({ tab, label, url, source }) => ({ tab, label: label || '', url, source }));
  return {
    projectId: pid, roomId: r.id,
    projectName: project ? project.name : '',
    roomNumber: r.number, floorName: floor ? floor.name : '',
    typeName: type ? type.name : '', mirrored: !!r.mirrored,
    notes: r.notes || '', sheets, updatedAt: Date.now()
  };
}
export async function publishRoom(pid, r, cache) {
  if (!r.token) return;
  await be.set(`scans/${r.token}`, await buildScan(pid, r, cache), false);
}
export async function republish(pid, filter = () => true) {
  const [project, types, floors, rooms] = await Promise.all([getProject(pid), listTypes(pid), listFloors(pid), listRooms(pid)]);
  const cache = { project, types, floors };
  for (const r of rooms.filter(filter)) await publishRoom(pid, r, cache);
}
export const getScan = (token) => be.get(`scans/${token}`);

// ---------- files ----------
export function upload(path, file) { return be.upload(path, file); }
export function deleteFile(path) { return be.deleteFile(path); }

// ---------- plan package import ----------
// pkg = { manifest, file(name) -> Promise<Blob> }. Matches existing floors/types by name and rooms by number,
// so re-importing an updated package updates in place and keeps every room's QR code.
export async function importPackage(pid, pkg, progress = () => {}) {
  const m = pkg.manifest;
  if (!m || m.format !== 'pcg-projects-package') throw new Error('This is not a PCG Projects plan package (manifest.json missing or wrong).');
  const uploaded = {};
  const names = new Set();
  m.floors.forEach((f) => f.plan && names.add(f.plan));
  m.types.forEach((t) => t.sheets.forEach((s) => names.add(s.file)));
  m.rooms.forEach((r) => (r.sheets || []).forEach((s) => names.add(s.file)));
  let done = 0;
  const stamp = Date.now();
  for (const name of names) {
    progress(`Uploading drawings ${++done} of ${names.size}…`);
    const blob = await pkg.file(name);
    if (!blob) throw new Error('Missing file in package: ' + name);
    const file = new File([blob], name.split('/').pop(), { type: 'image/jpeg' });
    uploaded[name] = await be.upload(`projects/${pid}/package/${stamp}/${name}`, file);
  }
  const sheetsOf = (list) => (list || []).map((s) => ({ id: randomToken(8), tab: s.tab, label: s.label || '', url: uploaded[s.file].url, path: uploaded[s.file].path }));

  progress('Saving floors…');
  const floors = await listFloors(pid);
  const floorId = {};
  for (const f of m.floors) {
    const ex = floors.find((x) => (x.name || '').toLowerCase() === f.name.toLowerCase());
    const data = { name: f.name, order: f.order, plan: f.plan ? { ...uploaded[f.plan], label: f.label || '' } : (ex && ex.plan) || null };
    if (ex) { await be.set(`projects/${pid}/floors/${ex.id}`, data); floorId[f.key] = ex.id; }
    else floorId[f.key] = await be.add(`projects/${pid}/floors`, data);
  }

  progress('Saving room types…');
  const types = await listTypes(pid);
  const typeId = {};
  for (const t of m.types) {
    const ex = types.find((x) => (x.name || '').toLowerCase() === t.name.toLowerCase());
    const data = { name: t.name, sheets: sheetsOf(t.sheets) };
    if (ex) { await be.set(`projects/${pid}/types/${ex.id}`, data); typeId[t.key] = ex.id; }
    else typeId[t.key] = await be.add(`projects/${pid}/types`, data);
  }

  const rooms = await listRooms(pid);
  let i = 0;
  for (const r of m.rooms) {
    progress(`Saving rooms ${++i} of ${m.rooms.length}…`);
    const ex = rooms.find((x) => String(x.number) === String(r.number));
    const data = {
      number: String(r.number), floorId: floorId[r.floor] || '', typeId: typeId[r.type] || '',
      mirrored: ex ? !!ex.mirrored : !!r.mirrored,            // keep a hand you already set
      // keep notes you typed; replace notes that came from an earlier package
      notes: ex && ex.notes && ex.notes !== (ex.pkgNotes ?? (ex.notes.startsWith('ADA COMMUNICATING FEATURES room') ? ex.notes : null)) ? ex.notes : (r.notes || ''),
      pkgNotes: r.notes || '',
      planX: r.planX ?? null, planY: r.planY ?? null,
      sheets: [...sheetsOf(r.sheets), ...((ex && ex.sheets) || []).filter((s) => !s.fromPackage)].map((s, k) => (k < (r.sheets || []).length ? { ...s, fromPackage: true } : s)),
      token: ex && ex.token ? ex.token : randomToken()
    };
    if (ex) await be.set(`projects/${pid}/rooms/${ex.id}`, data, false);
    else await be.add(`projects/${pid}/rooms`, data);
  }
  progress('Publishing scan pages…');
  await republish(pid);
  return { floors: m.floors.length, types: m.types.length, rooms: m.rooms.length, files: names.size };
}

// ---------- delete a whole project ----------
// Removes rooms (and their public scan pages, so old QR labels stop working), room types,
// floors and pins, plus every uploaded drawing/photo, then the project itself.
export async function deleteProject(pid, progress = () => {}) {
  const paths = new Set();
  const addSheets = (list) => (list || []).forEach((s) => s.path && paths.add(s.path));
  const [rooms, types, floors] = await Promise.all([listRooms(pid), listTypes(pid), listFloors(pid)]);
  let i = 0;
  for (const r of rooms) {
    progress(`Deleting rooms ${++i} of ${rooms.length}…`);
    addSheets(r.sheets);
    if (r.token) await be.remove(`scans/${r.token}`);
    await be.remove(`projects/${pid}/rooms/${r.id}`);
  }
  progress('Deleting room types…');
  for (const t of types) { addSheets(t.sheets); await be.remove(`projects/${pid}/types/${t.id}`); }
  progress('Deleting floors and pins…');
  for (const f of floors) {
    if (f.plan && f.plan.path) paths.add(f.plan.path);
    const pins = await be.list(`projects/${pid}/floors/${f.id}/pins`);
    for (const p of pins) { if (p.photo && p.photo.path) paths.add(p.photo.path); await be.remove(`projects/${pid}/floors/${f.id}/pins/${p.id}`); }
    await be.remove(`projects/${pid}/floors/${f.id}`);
  }
  i = 0;
  for (const path of paths) { progress(`Deleting files ${++i} of ${paths.size}…`); await be.deleteFile(path); }
  await be.remove(`projects/${pid}`);
}
