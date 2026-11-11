// PCG Projects — main app (signed-in team members).
import { APP_VERSION, DEMO, TABS, PIN_CATEGORIES } from './config.js';
import * as api from './api.js';
import { esc, renderRoom, fileUrl } from './roomview.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const app = $('#app');
const state = { user: null, profile: null };

// ---------------- helpers ----------------
function toast(msg, ms = 2200) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
function modal(html) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  return { el: $('.modal', bg), close };
}
function crumbs(parts) {
  $('#crumbs').innerHTML = parts.map(([t, href]) => (href ? `<a href="${href}">${esc(t)}</a>` : esc(t))).join(' › ');
}
async function busy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Working…';
  try { return await fn(); }
  catch (e) { console.error(e); alert('Something went wrong: ' + (e.message || e)); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}
const scanUrl = (token) => new URL('r.html', location.href.split('#')[0]).href + '?t=' + token;
function qrSvg(text) {
  if (!window.qrcode) return '<div class="muted small">QR library did not load</div>';
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2 });
}
const isAdmin = () => state.profile && state.profile.role === 'admin';
const tabLabel = (k) => (TABS.find((t) => t.key === k) || { label: k }).label;
const PIN_COLORS = ['#e87722', '#d4a106', '#8a5a2b', '#6b3fa0', '#1f6fd1', '#1f8a4c', '#5b6470', '#b42318'];
const pinColor = (cat) => PIN_COLORS[Math.max(0, PIN_CATEGORIES.indexOf(cat)) % PIN_COLORS.length];

// Shrink big photos before upload (phones take 4000px+ shots).
async function shrinkImage(file, max = 1800) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  if (s === 1 && file.size < 1.5e6) return file;
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
const fileKey = (name) => `${Date.now()}-${api.randomToken(6)}-${name.replace(/[^\w.-]+/g, '_')}`;

// ---------------- plan package import ----------------
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'js/vendor/jszip.min.js'; sc.onload = () => res(window.JSZip); sc.onerror = () => rej(new Error('Could not load zip reader')); document.head.appendChild(sc); });
}
// Accepts a .zip, or every file from the unzipped folder.
async function readPackage(files) {
  files = Array.from(files);
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(files[0]);
    const entry = (name) => zip.file(name) || zip.file(new RegExp('(^|/)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'))[0];
    const mf = entry('manifest.json');
    if (!mf) throw new Error('manifest.json not found in the zip');
    return { manifest: JSON.parse(await mf.async('string')), file: async (n) => { const e = entry(n); return e ? e.async('blob') : null; } };
  }
  const map = {};
  files.forEach((f) => { const rel = (f.webkitRelativePath || f.name).split('/'); if (rel.length > 1) rel.shift(); map[rel.join('/')] = f; });
  const mf = map['manifest.json'];
  if (!mf) throw new Error('manifest.json not found — pick the package .zip, or the whole unzipped folder.');
  return { manifest: JSON.parse(await mf.text()), file: async (n) => map[n] || null };
}
function importDialog(pid) {
  const m = modal(`<h3>Import plan package</h3>
    <p class="small muted">Loads room types with their sheets, every room, floor plans, and each room's spot on its floor plan. Re-importing an updated package updates in place: QR codes, hands and notes you set are kept.</p>
    <label class="f"><span>Package .zip</span><input id="pz" type="file" accept=".zip"></label>
    <label class="f"><span>…or the unzipped package folder</span><input id="pf" type="file" webkitdirectory multiple></label>
    <div id="pmsg" class="small" style="min-height:1.4em"></div>
    <div class="actions"><button id="x">Close</button><button class="primary" id="ok">Import</button></div>`);
  $('#x', m.el).onclick = m.close;
  $('#ok', m.el).onclick = (e) => busy(e.target, async () => {
    const files = $('#pz', m.el).files.length ? $('#pz', m.el).files : $('#pf', m.el).files;
    if (!files.length) return alert('Choose the package first.');
    const msg = $('#pmsg', m.el);
    msg.textContent = 'Reading package…';
    const pkg = await readPackage(files);
    let target = pid;
    if (!target) target = await api.saveProject({ name: pkg.manifest.project.name, code: pkg.manifest.project.code || '' });
    const r = await api.importPackage(target, pkg, (t) => (msg.textContent = t));
    msg.innerHTML = `<b>Done:</b> ${r.rooms} rooms, ${r.types} room types, ${r.floors} floors, ${r.files} drawings.`;
    toast('Import complete');
    setTimeout(() => { m.close(); location.hash = `#/p/${target}/rooms`; route(); }, 900);
  });
}

// ---------------- auth screens ----------------
function viewLogin() {
  crumbs([]);
  app.innerHTML = `
    <div class="card login">
      <h2>Sign in</h2>
      <p class="muted small">PCG team members. New accounts must be approved before they can use the app.</p>
      <label class="f"><span>Email</span><input id="em" type="email" autocomplete="email"></label>
      <label class="f"><span>Password</span><input id="pw" type="password" autocomplete="current-password"></label>
      <label class="f" id="nmWrap" hidden><span>Your name</span><input id="nm"></label>
      <div class="row"><button class="primary" id="go">Sign in</button><button id="google">Sign in with Google</button></div>
      <p class="small"><button class="link" id="toggle">Create an account</button> · <button class="link" id="forgot">Forgot password</button></p>
    </div>`;
  let creating = false;
  $('#toggle').onclick = () => { creating = !creating; $('#nmWrap').hidden = !creating; $('#go').textContent = creating ? 'Create account' : 'Sign in'; $('#toggle').textContent = creating ? 'I already have an account' : 'Create an account'; };
  const be = api.backend();
  $('#go').onclick = (e) => busy(e.target, async () => {
    const em = $('#em').value.trim(), pw = $('#pw').value;
    if (creating) await be.signUp(em, pw, $('#nm').value.trim()); else await be.signIn(em, pw);
  });
  $('#google').onclick = (e) => busy(e.target, () => be.signInGoogle());
  $('#forgot').onclick = async () => { const em = $('#em').value.trim(); if (!em) return alert('Type your email first.'); await be.resetPassword(em); toast('Reset email sent'); };
}
function viewPending() {
  crumbs([]);
  app.innerHTML = `<div class="card login"><h2>Waiting for approval</h2><p>Your account (${esc(state.user.email)}) has been created. An admin needs to approve it before you can use PCG Projects.</p><button id="re">Check again</button></div>`;
  $('#re').onclick = () => location.reload();
}

// ---------------- projects ----------------
async function viewProjects() {
  crumbs([]);
  const projects = await api.listProjects();
  app.innerHTML = `
    <div class="card">
      <div class="row"><h2 class="grow">Projects</h2><button id="impP">New from plan package</button><button class="primary" id="newP">+ New project</button></div>
      <div class="grid">${projects.map((p) => `<a class="tile" href="#/p/${p.id}"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.code || '')}</div></a>`).join('') || '<p class="muted">No projects yet.</p>'}</div>
    </div>`;
  $('#newP').onclick = () => editProject();
  $('#impP').onclick = () => importDialog(null);
}
function editProject(p = {}) {
  const m = modal(`<h3>${p.id ? 'Project settings' : 'New project'}</h3>
    <label class="f"><span>Project name</span><input id="pn" value="${esc(p.name || '')}" placeholder="Home 2 Suites Douglasville"></label>
    <label class="f"><span>Short code (optional)</span><input id="pc" value="${esc(p.code || '')}" placeholder="H2D"></label>
    <div class="actions"><button id="x">Cancel</button><button class="primary" id="ok">Save</button></div>`);
  $('#x', m.el).onclick = m.close;
  $('#ok', m.el).onclick = (e) => busy(e.target, async () => {
    const name = $('#pn', m.el).value.trim(); if (!name) return alert('Name is required');
    const id = await api.saveProject({ id: p.id, name, code: $('#pc', m.el).value.trim() });
    m.close(); location.hash = `#/p/${id}`; route();
  });
}

// ---------------- project shell ----------------
async function projectShell(pid, tab) {
  const p = await api.getProject(pid);
  if (!p) { app.innerHTML = '<p class="pad">Project not found.</p>'; return null; }
  crumbs([[p.name, `#/p/${pid}`]]);
  const tabs = [['rooms', 'Rooms'], ['types', 'Room Types'], ['floors', 'Floor Layouts'], ['labels', 'QR Labels'], ['settings', 'Settings']];
  app.innerHTML = `<nav class="ptabs">${tabs.map(([k, l]) => `<a href="#/p/${pid}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav><div id="pv"></div>`;
  return { p, el: $('#pv') };
}

// ---------------- rooms list ----------------
async function viewRooms(pid, floorFilter = '') {
  const sh = await projectShell(pid, 'rooms'); if (!sh) return;
  const [rooms, floors, types] = await Promise.all([api.listRooms(pid), api.listFloors(pid), api.listTypes(pid)]);
  const fName = (id) => (floors.find((f) => f.id === id) || {}).name || '—';
  const tName = (id) => (types.find((t) => t.id === id) || {}).name || '<span class="badge bad">no type</span>';
  const tSheets = (id) => ((types.find((t) => t.id === id) || {}).sheets || []).length;
  const shown = floorFilter ? rooms.filter((r) => r.floorId === floorFilter) : rooms;
  sh.el.innerHTML = `
    <div class="card">
      <div class="row">
        <h2 class="grow">Rooms <span class="muted small">(${shown.length})</span></h2>
        <select id="ff" style="width:auto"><option value="">All floors</option>${floors.map((f) => `<option value="${f.id}" ${f.id === floorFilter ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
        <button id="bulk">Bulk add</button><button class="primary" id="add">+ Room</button>
      </div>
      ${!types.length ? '<p class="muted small">Tip: set up Room Types first (King, Double Queen, ADA…) and attach their sheets once — every room of that type gets them.</p>' : ''}
      <table class="list"><thead><tr><th>Room</th><th>Floor</th><th>Type</th><th class="hide-sm">Hand</th><th class="hide-sm">Sheets</th></tr></thead>
      <tbody>${shown.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.number)}</b></td><td>${esc(fName(r.floorId))}</td><td>${r.typeId ? esc(tName(r.typeId)) : tName('')}</td><td class="hide-sm">${r.mirrored ? '<span class="badge warn">Mirrored</span>' : 'As drawn'}</td><td class="hide-sm">${tSheets(r.typeId) + (r.sheets || []).length}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No rooms yet.</td></tr>'}</tbody></table>
    </div>`;
  $('#ff').onchange = (e) => viewRooms(pid, e.target.value);
  $('#add').onclick = () => roomForm(pid, {}, floors, types);
  $('#bulk').onclick = () => bulkRooms(pid, floors, types, rooms);
  $$('tr.click', sh.el).forEach((tr) => (tr.onclick = () => (location.hash = `#/p/${pid}/room/${tr.dataset.id}`)));
}
function roomFields(r, floors, types) {
  return `
    <div class="row"><label class="f grow"><span>Room number</span><input id="rn" value="${esc(r.number || '')}"></label>
    <label class="f grow"><span>Floor</span><select id="rf"><option value="">—</option>${floors.map((f) => `<option value="${f.id}" ${f.id === r.floorId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label></div>
    <div class="row"><label class="f grow"><span>Room type</span><select id="rt"><option value="">— unique / none —</option>${types.map((t) => `<option value="${t.id}" ${t.id === r.typeId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label class="f grow"><span>Hand</span><select id="rm"><option value="0">As drawn</option><option value="1" ${r.mirrored ? 'selected' : ''}>Mirrored (opposite hand)</option></select></label></div>
    <label class="f"><span>Notes shown on the scan page (optional)</span><textarea id="rno">${esc(r.notes || '')}</textarea></label>`;
}
const readRoomFields = (el) => ({ number: $('#rn', el).value.trim(), floorId: $('#rf', el).value, typeId: $('#rt', el).value, mirrored: $('#rm', el).value === '1', notes: $('#rno', el).value.trim() });

function roomForm(pid, r, floors, types) {
  const m = modal(`<h3>New room</h3>${roomFields(r, floors, types)}<div class="actions"><button id="x">Cancel</button><button class="primary" id="ok">Save</button></div>`);
  $('#x', m.el).onclick = m.close;
  $('#ok', m.el).onclick = (e) => busy(e.target, async () => {
    const d = readRoomFields(m.el); if (!d.number) return alert('Room number is required');
    const id = await api.saveRoom(pid, d); m.close(); location.hash = `#/p/${pid}/room/${id}`;
  });
}
function bulkRooms(pid, floors, types, existing) {
  const m = modal(`<h3>Bulk add rooms</h3>
    <p class="small muted">One room per line: <b>number, type, M</b> — the M is optional and means mirrored. Type must match a Room Type name. Existing room numbers are updated instead of duplicated.</p>
    <textarea id="bt" style="min-height:180px" placeholder="101, ADA King\n102, King\n103, King, M\n104, Double Queen"></textarea>
    <label class="f"><span>Floor</span><select id="bf"><option value="__auto">Auto from room number (2xx → Level 2)</option>${floors.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></label>
    <div id="bmsg" class="small"></div>
    <div class="actions"><button id="x">Cancel</button><button class="primary" id="ok">Add rooms</button></div>`);
  $('#x', m.el).onclick = m.close;
  $('#ok', m.el).onclick = (e) => busy(e.target, async () => {
    const lines = $('#bt', m.el).value.split('\n').map((l) => l.trim()).filter(Boolean);
    const fsel = $('#bf', m.el).value, problems = [];
    let added = 0, updated = 0;
    for (const line of lines) {
      const [num, tname = '', hand = ''] = line.split(/[,\t]/).map((s) => s.trim());
      if (!num) continue;
      const type = types.find((t) => t.name.toLowerCase() === tname.toLowerCase());
      if (tname && !type) problems.push(`${num}: no room type named "${tname}"`);
      let floorId = fsel;
      if (fsel === '__auto') {
        const lvl = parseInt(num.replace(/\D/g, '').slice(0, -2) || '0', 10);
        const f = floors.find((x) => Number(x.order) === lvl);
        floorId = f ? f.id : '';
        if (!f) problems.push(`${num}: no floor with order ${lvl}`);
      }
      const ex = existing.find((x) => String(x.number) === num);
      const data = { number: num, floorId, typeId: type ? type.id : (ex ? ex.typeId : ''), mirrored: /^m/i.test(hand) };
      if (ex) { await api.saveRoom(pid, { ...ex, ...data }); updated++; } else { await api.saveRoom(pid, data); added++; }
    }
    toast(`${added} added, ${updated} updated`);
    if (problems.length) { $('#bmsg', m.el).innerHTML = '<b>Check these:</b><br>' + problems.map(esc).join('<br>'); }
    else { m.close(); viewRooms(pid); }
  });
}

// ---------------- single room ----------------
async function viewRoom(pid, rid) {
  const sh = await projectShell(pid, 'rooms'); if (!sh) return;
  const [r, floors, types, rooms] = await Promise.all([api.getRoom(pid, rid), api.listFloors(pid), api.listTypes(pid), api.listRooms(pid)]);
  if (!r) { sh.el.innerHTML = '<p class="pad">Room not found.</p>'; return; }
  crumbs([[sh.p.name, `#/p/${pid}`], [`Room ${r.number}`]]);
  const i = rooms.findIndex((x) => x.id === rid), prev = rooms[i - 1], next = rooms[i + 1];
  const url = scanUrl(r.token);
  sh.el.innerHTML = `
    <div class="row pad no-print">
      ${prev ? `<a class="btn" href="#/p/${pid}/room/${prev.id}">‹ ${esc(prev.number)}</a>` : ''}
      <h2 class="grow" style="margin:0">Room ${esc(r.number)}</h2>
      ${next ? `<a class="btn" href="#/p/${pid}/room/${next.id}">${esc(next.number)} ›</a>` : ''}
    </div>
    <div class="card">
      ${roomFields(r, floors, types)}
      <div class="row"><button class="primary" id="save">Save room</button><button class="danger" id="del">Delete room</button></div>
    </div>
    <div class="card">
      <h3>Sheets just for this room</h3>
      <p class="small muted">Sheets from the room type are added automatically. Use this for anything unique to room ${esc(r.number)}.</p>
      <div id="sheets"></div>
    </div>
    <div class="card">
      <h3>QR code</h3>
      <div class="row" style="align-items:flex-start">
        <div class="qr-box" style="width:170px">${qrSvg(url)}</div>
        <div class="grow">
          <p class="small" style="word-break:break-all"><a href="${esc(url)}" target="_blank">${esc(url)}</a></p>
          <div class="row"><a class="btn" href="${esc(url)}" target="_blank">Open scan page</a><button id="copy">Copy link</button><button id="regen">Issue new QR code</button></div>
          <p class="small muted">Anyone who scans this label can see this room only — nothing else, and they can't change anything. "Issue new QR code" turns the old label off (use it if a label gets copied or misplaced).</p>
        </div>
      </div>
    </div>
    <div class="card"><h3>Preview</h3><div id="pre" style="border:1px solid var(--line);border-radius:10px;overflow:hidden"></div></div>`;
  sheetsEditor($('#sheets'), r.sheets || [], `projects/${pid}/rooms/${rid}`, async (sheets) => { r.sheets = sheets; await api.saveRoom(pid, r); refreshPreview(); });
  const refreshPreview = async () => { const s = await api.getScan(r.token); if (s) renderRoom($('#pre'), s); };
  refreshPreview();
  $('#save').onclick = (e) => busy(e.target, async () => { Object.assign(r, readRoomFields(sh.el)); await api.saveRoom(pid, r); toast('Saved'); viewRoom(pid, rid); });
  $('#del').onclick = (e) => { if (confirm(`Delete room ${r.number}? Its QR label will stop working.`)) busy(e.target, async () => { await api.deleteRoom(pid, r); location.hash = `#/p/${pid}/rooms`; }); };
  $('#copy').onclick = async () => { await navigator.clipboard.writeText(url); toast('Link copied'); };
  $('#regen').onclick = (e) => { if (confirm('Issue a new QR code? The current label for this room will stop working and you will need to print a new one.')) busy(e.target, async () => { await api.regenerateToken(pid, r); toast('New QR issued'); viewRoom(pid, rid); }); };
}

// Sheet uploader grouped by tab. onChange(sheets) is called after every change.
function sheetsEditor(el, sheets, storagePrefix, onChange) {
  const draw = () => {
    el.innerHTML = TABS.map((t) => {
      const list = sheets.filter((s) => s.tab === t.key);
      return `<div style="margin-bottom:14px">
        <div class="row"><b class="grow">${t.label} <span class="muted small">(${list.length})</span></b>
        <label class="btn small">+ Add<input type="file" accept="image/*" multiple hidden data-up="${t.key}"></label></div>
        ${list.length ? `<div class="sheet-thumbs" style="margin-top:6px">${list.map((s) => `
          <div class="sheet-thumb"><a href="${esc(fileUrl(s.url))}" target="_blank"><img src="${esc(fileUrl(s.url))}" alt=""></a>
          <input value="${esc(s.label || '')}" placeholder="Label (e.g. A-501 King elev.)" data-lbl="${s.id}">
          <button class="link" data-del="${s.id}" style="color:var(--bad)">Remove</button></div>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    $$('[data-up]', el).forEach((inp) => (inp.onchange = async () => {
      const files = Array.from(inp.files); if (!files.length) return;
      toast(`Uploading ${files.length}…`, 4000);
      try {
        for (const f of files) {
          const path = `${storagePrefix}/${fileKey(f.name)}`;
          const up = await api.upload(path, f);
          sheets.push({ id: api.randomToken(8), tab: inp.dataset.up, label: f.name.replace(/\.\w+$/, ''), url: up.url, path: up.path });
        }
        await onChange(sheets); toast('Uploaded'); draw();
      } catch (e) { console.error(e); alert('Upload failed: ' + e.message); }
    }));
    $$('[data-lbl]', el).forEach((inp) => (inp.onchange = async () => {
      const s = sheets.find((x) => x.id === inp.dataset.lbl); s.label = inp.value.trim(); await onChange(sheets); toast('Label saved');
    }));
    $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
      if (!confirm('Remove this sheet?')) return;
      const i = sheets.findIndex((x) => x.id === b.dataset.del); const [s] = sheets.splice(i, 1);
      await onChange(sheets); api.deleteFile(s.path); draw();
    }));
  };
  draw();
}

// ---------------- room types ----------------
async function viewTypes(pid) {
  const sh = await projectShell(pid, 'types'); if (!sh) return;
  const [types, rooms] = await Promise.all([api.listTypes(pid), api.listRooms(pid)]);
  sh.el.innerHTML = `
    <div class="card">
      <div class="row"><h2 class="grow">Room Types</h2><button class="primary" id="add">+ Room type</button></div>
      <p class="small muted">Attach the typical-room sheets once per type (layout, electrical, blocking, millwork, FF&amp;E). Every room of that type shows them; mirrored rooms are flagged on the scan page.</p>
      <div class="grid">${types.map((t) => `<a class="tile" href="#/p/${pid}/type/${t.id}"><div class="t">${esc(t.name)}</div><div class="s">${rooms.filter((r) => r.typeId === t.id).length} rooms · ${(t.sheets || []).length} sheets</div></a>`).join('') || '<p class="muted">No room types yet.</p>'}</div>
    </div>`;
  $('#add').onclick = () => {
    const m = modal(`<h3>New room type</h3><label class="f"><span>Name</span><input id="tn" placeholder="King, Double Queen, ADA King, Suite…"></label><div class="actions"><button id="x">Cancel</button><button class="primary" id="ok">Create</button></div>`);
    $('#x', m.el).onclick = m.close;
    $('#ok', m.el).onclick = (e) => busy(e.target, async () => {
      const name = $('#tn', m.el).value.trim(); if (!name) return;
      const id = await api.saveType(pid, { name, sheets: [] }); m.close(); location.hash = `#/p/${pid}/type/${id}`;
    });
  };
}
async function viewType(pid, tid) {
  const sh = await projectShell(pid, 'types'); if (!sh) return;
  const t = (await api.listTypes(pid)).find((x) => x.id === tid);
  if (!t) { sh.el.innerHTML = '<p class="pad">Room type not found.</p>'; return; }
  const rooms = (await api.listRooms(pid)).filter((r) => r.typeId === tid);
  crumbs([[sh.p.name, `#/p/${pid}`], ['Room Types', `#/p/${pid}/types`], [t.name]]);
  sh.el.innerHTML = `
    <div class="card">
      <div class="row"><label class="f grow"><span>Room type name</span><input id="tn" value="${esc(t.name)}"></label><button id="ren">Rename</button><button class="danger" id="del">Delete type</button></div>
      <p class="small muted">Used by ${rooms.length} room(s): ${rooms.map((r) => `<a href="#/p/${pid}/room/${r.id}">${esc(r.number)}${r.mirrored ? '(M)' : ''}</a>`).join(', ') || 'none yet'}</p>
    </div>
    <div class="card"><h3>Sheets</h3><div id="sheets"></div></div>`;
  t.sheets = t.sheets || [];
  sheetsEditor($('#sheets'), t.sheets, `projects/${pid}/types/${tid}`, (sheets) => api.saveType(pid, { ...t, sheets }));
  $('#ren').onclick = (e) => busy(e.target, async () => { t.name = $('#tn').value.trim(); await api.saveType(pid, t); toast('Renamed'); viewType(pid, tid); });
  $('#del').onclick = (e) => { if (confirm(`Delete room type "${t.name}"? Rooms using it will be left without a type.`)) busy(e.target, async () => { await api.deleteType(pid, tid); location.hash = `#/p/${pid}/types`; }); };
}

// ---------------- floors ----------------
async function viewFloors(pid) {
  const sh = await projectShell(pid, 'floors'); if (!sh) return;
  const [floors, rooms] = await Promise.all([api.listFloors(pid), api.listRooms(pid)]);
  sh.el.innerHTML = `
    <div class="card">
      <div class="row"><h2 class="grow">Floor Layouts</h2><button class="primary" id="add">+ Floor</button></div>
      <p class="small muted">Upload the full floor plan for each level, then drop pins where items were placed.</p>
      <div class="grid">${floors.map((f) => `<a class="tile" href="#/p/${pid}/floor/${f.id}">
        ${f.plan ? `<img src="${esc(fileUrl(f.plan.url))}" style="width:100%;height:120px;object-fit:contain;background:#fff">` : ''}
        <div class="t">${esc(f.name)}</div><div class="s">${rooms.filter((r) => r.floorId === f.id).length} rooms${f.plan ? '' : ' · no plan uploaded'}</div></a>`).join('') || '<p class="muted">No floors yet.</p>'}</div>
    </div>`;
  $('#add').onclick = () => floorForm(pid, { order: floors.length + 1 });
}
function floorForm(pid, f) {
  const m = modal(`<h3>${f.id ? 'Edit floor' : 'New floor'}</h3>
    <div class="row"><label class="f grow"><span>Name</span><input id="fn" value="${esc(f.name || '')}" placeholder="Level 1"></label>
    <label class="f" style="width:110px"><span>Level #</span><input id="fo" type="number" value="${esc(f.order ?? '')}"></label></div>
    <p class="small muted">Level # is used to match rooms by number (2xx → level 2).</p>
    <label class="f"><span>Floor plan image ${f.plan ? '(leave empty to keep current)' : ''}</span><input id="fp" type="file" accept="image/*"></label>
    <div class="actions">${f.id ? '<button class="danger left" id="del">Delete floor</button>' : ''}<button id="x">Cancel</button><button class="primary" id="ok">Save</button></div>`);
  $('#x', m.el).onclick = m.close;
  $('#ok', m.el).onclick = (e) => busy(e.target, async () => {
    const data = { id: f.id, name: $('#fn', m.el).value.trim() || 'Floor', order: Number($('#fo', m.el).value) || 0 };
    const file = $('#fp', m.el).files[0];
    if (file) {
      const up = await api.upload(`projects/${pid}/floors/${fileKey(file.name)}`, file);
      if (f.plan) api.deleteFile(f.plan.path);
      data.plan = up;
    }
    const id = await api.saveFloor(pid, data); m.close(); location.hash = `#/p/${pid}/floor/${id}`; route();
  });
  if (f.id) $('#del', m.el).onclick = (e) => { if (confirm('Delete this floor and all its pins?')) busy(e.target, async () => { await api.deleteFloor(pid, f.id); m.close(); location.hash = `#/p/${pid}/floors`; }); };
}

async function viewFloor(pid, fid) {
  const sh = await projectShell(pid, 'floors'); if (!sh) return;
  const f = (await api.listFloors(pid)).find((x) => x.id === fid);
  if (!f) { sh.el.innerHTML = '<p class="pad">Floor not found.</p>'; return; }
  crumbs([[sh.p.name, `#/p/${pid}`], ['Floor Layouts', `#/p/${pid}/floors`], [f.name]]);
  let pins = await api.listPins(pid, fid);
  const floorRooms = (await api.listRooms(pid)).filter((r) => r.floorId === fid && r.planX != null);
  let showRooms = true;
  pins.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  let zoom = 1, adding = false;
  const hidden = new Set();
  sh.el.innerHTML = `
    <div class="plan-tools no-print">
      <b>${esc(f.name)}</b>
      <button id="addPin" class="primary">+ Drop pin</button>
      <button id="zo">−</button><button id="zi">+</button><button id="zf">Fit</button>
      <button id="ed">Floor settings</button>
      ${floorRooms.length ? '<label class="inline-check"><input type="checkbox" id="sr" checked> Rooms</label>' : ''}
      <span class="grow"></span>
      <div class="legend" id="legend"></div>
    </div>
    ${f.plan ? `<div class="plan-scroll" id="scroll"><div class="plan-stage" id="stage"><img id="plan" src="${esc(fileUrl(f.plan.url))}" alt=""><div id="rms"></div><div id="pins"></div></div></div>` : '<p class="pad">No floor plan uploaded yet. Use <b>Floor settings</b> to add one.</p>'}
    <div class="card"><h3>Pins <span class="muted small">(${pins.length})</span></h3><table class="list"><thead><tr><th>#</th><th>Item</th><th>Category</th><th class="hide-sm">Room</th><th class="hide-sm">Added</th></tr></thead><tbody id="pinList"></tbody></table></div>`;
  $('#ed').onclick = () => floorForm(pid, f);
  if (!f.plan) return;
  const img = $('#plan'), stage = $('#stage'), scroll = $('#scroll');
  const applyZoom = () => { if (!img.naturalWidth) return; img.style.width = img.naturalWidth * zoom + 'px'; };
  const fit = () => { if (img.naturalWidth) { zoom = (scroll.clientWidth - 4) / img.naturalWidth; applyZoom(); } };
  img.onload = fit; if (img.complete) fit();
  $('#zi').onclick = () => { zoom *= 1.25; applyZoom(); };
  $('#zo').onclick = () => { zoom /= 1.25; applyZoom(); };
  $('#zf').onclick = fit;
  $('#addPin').onclick = () => { adding = !adding; stage.classList.toggle('adding', adding); $('#addPin').textContent = adding ? 'Tap the plan…' : '+ Drop pin'; };

  const drawRooms = () => {
    $('#rms').innerHTML = showRooms ? floorRooms.map((r) => `<a class="room-tag" href="#/p/${pid}/room/${r.id}" style="left:${r.planX * 100}%;top:${r.planY * 100}%" title="Room ${esc(r.number)}">${esc(r.number)}</a>`).join('') : '';
  };
  if ($('#sr')) $('#sr').onchange = (e) => { showRooms = e.target.checked; drawRooms(); };
  drawRooms();
  const drawPins = () => {
    $('#legend').innerHTML = PIN_CATEGORIES.filter((c) => pins.some((p) => p.category === c)).map((c) => `<label class="inline-check"><input type="checkbox" data-cat="${esc(c)}" ${hidden.has(c) ? '' : 'checked'}><i style="background:${pinColor(c)}"></i>${esc(c)}</label>`).join('');
    $$('[data-cat]').forEach((cb) => (cb.onchange = () => { cb.checked ? hidden.delete(cb.dataset.cat) : hidden.add(cb.dataset.cat); drawPins(); }));
    $('#pins').innerHTML = pins.map((p, i) => hidden.has(p.category) ? '' : `<div class="pin" data-pin="${p.id}" title="${esc(p.label)}" style="left:${p.x * 100}%;top:${p.y * 100}%;background:${pinColor(p.category)}"><span>${i + 1}</span></div>`).join('');
    $$('[data-pin]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); pinForm(pins.find((p) => p.id === el.dataset.pin)); }));
    $('#pinList').innerHTML = pins.map((p, i) => `<tr class="click" data-row="${p.id}"><td><span class="badge" style="background:${pinColor(p.category)};color:#fff">${i + 1}</span></td><td>${esc(p.label)}${p.photo ? ' 📷' : ''}</td><td>${esc(p.category)}</td><td class="hide-sm">${esc(p.room || '')}</td><td class="hide-sm small muted">${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''} ${esc(p.createdBy || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No pins yet. Click "+ Drop pin", then tap the plan.</td></tr>';
    $$('[data-row]').forEach((tr) => (tr.onclick = () => pinForm(pins.find((p) => p.id === tr.dataset.row))));
  };
  stage.onclick = (e) => {
    if (!adding) return;
    const b = img.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    adding = false; stage.classList.remove('adding'); $('#addPin').textContent = '+ Drop pin';
    pinForm({ x, y, category: PIN_CATEGORIES[0] });
  };
  const pinForm = (p) => {
    const m = modal(`<h3>${p.id ? 'Pin' : 'New pin'}</h3>
      <label class="f"><span>What was placed</span><input id="pl" value="${esc(p.label || '')}" placeholder="Ice machine, ADA grab bar blocking, access panel…"></label>
      <div class="row"><label class="f grow"><span>Category</span><select id="pc">${PIN_CATEGORIES.map((c) => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="f grow"><span>Room / area (optional)</span><input id="pr" value="${esc(p.room || '')}"></label></div>
      <label class="f"><span>Notes</span><textarea id="pn">${esc(p.note || '')}</textarea></label>
      ${p.photo ? `<a href="${esc(fileUrl(p.photo.url))}" target="_blank"><img src="${esc(fileUrl(p.photo.url))}" style="max-width:100%;max-height:220px;border-radius:8px"></a>` : ''}
      <label class="f"><span>${p.photo ? 'Replace photo' : 'Photo (optional)'}</span><input id="pp" type="file" accept="image/*" capture="environment"></label>
      ${p.id ? `<p class="small muted">Added ${p.createdAt ? new Date(p.createdAt).toLocaleString() : ''} ${esc(p.createdBy || '')}</p>` : ''}
      <div class="actions">${p.id ? '<button class="danger left" id="del">Delete</button>' : ''}<button id="x">Cancel</button><button class="primary" id="ok">Save</button></div>`);
    $('#x', m.el).onclick = m.close;
    $('#ok', m.el).onclick = (e) => busy(e.target, async () => {
      const d = { ...p, label: $('#pl', m.el).value.trim() || 'Item', category: $('#pc', m.el).value, room: $('#pr', m.el).value.trim(), note: $('#pn', m.el).value.trim() };
      const file = $('#pp', m.el).files[0];
      if (file) {
        const small = await shrinkImage(file);
        const up = await api.upload(`projects/${pid}/floors/${fid}/pins/${fileKey(small.name)}`, small);
        if (p.photo) api.deleteFile(p.photo.path);
        d.photo = up;
      }
      if (!d.id) { d.createdAt = Date.now(); d.createdBy = state.profile.name || state.user.email || ''; }
      d.updatedAt = Date.now();
      const id = await api.savePin(pid, fid, d);
      if (!d.id) { d.id = id; pins.push(d); } else { pins[pins.findIndex((x) => x.id === id)] = d; }
      m.close(); drawPins();
    });
    if (p.id) $('#del', m.el).onclick = (e) => { if (confirm('Delete this pin?')) busy(e.target, async () => { await api.deletePin(pid, fid, p.id); if (p.photo) api.deleteFile(p.photo.path); pins = pins.filter((x) => x.id !== p.id); m.close(); drawPins(); }); };
  };
  drawPins();
}

// ---------------- QR labels ----------------
async function viewLabels(pid, floorFilter = '') {
  const sh = await projectShell(pid, 'labels'); if (!sh) return;
  const [rooms, floors, types] = await Promise.all([api.listRooms(pid), api.listFloors(pid), api.listTypes(pid)]);
  const shown = floorFilter ? rooms.filter((r) => r.floorId === floorFilter) : rooms;
  const tName = (id) => (types.find((t) => t.id === id) || {}).name || '';
  sh.el.innerHTML = `
    <div class="card no-print"><div class="row">
      <h2 class="grow">QR Labels <span class="muted small">(${shown.length})</span></h2>
      <select id="ff" style="width:auto"><option value="">All floors</option>${floors.map((f) => `<option value="${f.id}" ${f.id === floorFilter ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
      <button class="primary" onclick="window.print()">Print labels</button></div>
      <p class="small muted">Prints 2 across × 5 down, sized for Avery 5163/8163 (2"×4") labels — do a test print on plain paper and hold it behind the label sheet first. Use weatherproof labels if they'll be in the room through drywall and paint.</p>
    </div>
    <div class="card"><div class="labels">${shown.map((r) => `
      <div class="label"><div class="qr-box">${qrSvg(scanUrl(r.token))}</div>
      <div><div class="lp">${esc(sh.p.name)}</div><div class="ln">${esc(r.number)}</div>
      <div class="lt">${esc(tName(r.typeId))}${r.mirrored ? ' · MIRRORED' : ''}</div><div class="lh">Scan for room layout, electrical, blocking, millwork &amp; FF&amp;E</div></div></div>`).join('')}</div></div>`;
  $('#ff').onchange = (e) => viewLabels(pid, e.target.value);
}

// ---------------- settings ----------------
async function viewSettings(pid) {
  const sh = await projectShell(pid, 'settings'); if (!sh) return;
  sh.el.innerHTML = `
    <div class="card"><h3>${esc(sh.p.name)}</h3><p class="muted">${esc(sh.p.code || '')}</p><button id="ed">Edit name / code</button></div>
    <div class="card"><h3>Plan package</h3><p class="small muted">Import a plan package (room types, rooms, floor plans) prepared from the drawing set.</p><button id="imp" class="primary">Import plan package</button></div>
    ${isAdmin() ? `<div class="card" style="border-color:#f0c2bd"><h3 style="color:var(--bad)">Delete project</h3><p class="small muted">Permanently deletes this project: all rooms, room types, floor layouts, pins, photos and drawings. Every QR label for this project stops working. This can't be undone.</p><button class="danger" id="delP">Delete project</button></div>` : ''}
    <div class="card"><h3>Scan pages</h3><p class="small muted">Scan pages update automatically when you change rooms, types or floors. Use this only if something looks out of date.</p><button id="rp">Refresh all scan pages</button></div>`;
  $('#ed').onclick = () => editProject(sh.p);
  $('#imp').onclick = () => importDialog(pid);
  if ($('#delP')) $('#delP').onclick = () => {
    const m = modal(`<h3 style="color:var(--bad)">Delete ${esc(sh.p.name)}?</h3>
      <p>This permanently deletes every room, room type, floor layout, pin, photo and drawing in this project, and turns off all of its QR labels.</p>
      <label class="f"><span>Type the project name to confirm: <b>${esc(sh.p.name)}</b></span><input id="cn" autocomplete="off"></label>
      <div id="dmsg" class="small" style="min-height:1.4em"></div>
      <div class="actions"><button id="x">Cancel</button><button class="danger" id="ok" disabled>Delete forever</button></div>`);
    const cn = $('#cn', m.el), ok = $('#ok', m.el);
    cn.oninput = () => { ok.disabled = cn.value.trim() !== sh.p.name.trim(); };
    $('#x', m.el).onclick = m.close;
    ok.onclick = () => busy(ok, async () => {
      await api.deleteProject(pid, (t) => ($('#dmsg', m.el).textContent = t));
      m.close(); toast('Project deleted'); location.hash = '#/'; route();
    });
  };
  $('#rp').onclick = (e) => busy(e.target, async () => { await api.republish(pid); toast('All scan pages refreshed'); });
}

// ---------------- users (admin) ----------------
async function viewUsers() {
  crumbs([['Users']]);
  if (!isAdmin()) { app.innerHTML = '<p class="pad">Admins only.</p>'; return; }
  const users = (await api.listUsers()).sort((a, b) => Number(a.approved) - Number(b.approved) || (a.email || '').localeCompare(b.email || ''));
  app.innerHTML = `<div class="card"><h2>Users</h2>
    <table class="list"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th></tr></thead><tbody>
    ${users.map((u) => `<tr><td>${esc(u.name || '')}</td><td>${esc(u.email)}</td>
      <td>${u.approved ? '<span class="badge ok">Approved</span>' : '<span class="badge warn">Waiting</span>'} <button data-ap="${u.id}">${u.approved ? 'Remove access' : 'Approve'}</button></td>
      <td><select data-role="${u.id}" style="width:auto" ${u.id === state.user.uid ? 'disabled' : ''}><option value="member">Member</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></td></tr>`).join('')}
    </tbody></table></div>`;
  $$('[data-ap]').forEach((b) => (b.onclick = () => busy(b, async () => { const u = users.find((x) => x.id === b.dataset.ap); if (u.id === state.user.uid) return alert("You can't remove your own access."); await api.updateUser(u.id, { approved: !u.approved }); viewUsers(); })));
  $$('[data-role]').forEach((s) => (s.onchange = async () => { await api.updateUser(s.dataset.role, { role: s.value }); toast('Role updated'); }));
}

// ---------------- router ----------------
async function route() {
  if (!state.profile || !state.profile.approved) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  $$('.modal-bg').forEach((m) => m.remove());
  window.scrollTo(0, 0);
  try {
    if (parts[0] === 'users') return await viewUsers();
    if (parts[0] === 'p' && parts[1]) {
      const pid = parts[1], sub = parts[2] || 'rooms';
      if (sub === 'room' && parts[3]) return await viewRoom(pid, parts[3]);
      if (sub === 'type' && parts[3]) return await viewType(pid, parts[3]);
      if (sub === 'floor' && parts[3]) return await viewFloor(pid, parts[3]);
      if (sub === 'types') return await viewTypes(pid);
      if (sub === 'floors') return await viewFloors(pid);
      if (sub === 'labels') return await viewLabels(pid);
      if (sub === 'settings') return await viewSettings(pid);
      return await viewRooms(pid);
    }
    return await viewProjects();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><h3>Could not load this page</h3><p class="muted small">${esc(e.message || e)}</p></div>`;
  }
}

// ---------------- start ----------------
(async function start() {
  $('#ver').textContent = 'v' + APP_VERSION + (DEMO ? ' (demo)' : '');
  if (DEMO) $('#demo').hidden = false;
  const be = await api.initBackend();
  if (be.demo && be.takeNeedsPublish()) {
    for (const p of await api.listProjects()) await api.republish(p.id);
  }
  window.addEventListener('hashchange', route);
  $('#signout').onclick = () => be.signOut();
  be.onAuth(async (u) => {
    state.user = u; state.profile = null;
    $('#signout').hidden = !u; $('#usersLink').hidden = true; $('#who').textContent = '';
    if (!u) return viewLogin();
    try { state.profile = await api.ensureProfile(u); }
    catch (e) { console.error(e); app.innerHTML = `<div class="card"><h3>Could not load your account</h3><p class="small muted">${esc(e.message)}</p></div>`; return; }
    $('#who').textContent = state.profile.name || u.email;
    $('#usersLink').hidden = !isAdmin();
    if (!state.profile.approved) return viewPending();
    route();
  });
})();
