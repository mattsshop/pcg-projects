// Renders a room's scan page (used by r.html and the in-app preview).
import { TABS } from './config.js?v=0.6.0';

// Demo mode stores files locally; this turns their references into viewable URLs.
export const fileUrl = (u) => (window.__resolveUrl ? window.__resolveUrl(u) : u);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderRoom(el, scan, { appLink = '' } = {}) {
  const tabs = TABS.filter((t) => scan.sheets.some((s) => s.tab === t.key));
  if (scan.notes) tabs.push({ key: '__notes', label: 'Notes' });
  let active = tabs[0] ? tabs[0].key : null;
  let flip = false;

  const draw = () => {
    const sheets = scan.sheets.filter((s) => s.tab === active);
    el.innerHTML = `
      <div class="rv-head">
        <div class="rv-proj">${esc(scan.projectName)}</div>
        <div class="rv-room">Room ${esc(scan.roomNumber)}</div>
        <div class="rv-meta">
          ${scan.floorName ? `<span>${esc(scan.floorName)}</span>` : ''}
          ${scan.typeName ? `<span>${esc(scan.typeName)}</span>` : ''}
          ${scan.mirrored ? '<span class="badge warn">MIRRORED — opposite hand of plan</span>' : ''}
        </div>
      </div>
      ${tabs.length ? `<nav class="rv-tabs">${tabs.map((t) => `<button data-tab="${t.key}" class="${t.key === active ? 'on' : ''}">${esc(t.label)}</button>`).join('')}</nav>` : '<p class="muted pad">No sheets have been attached to this room yet.</p>'}
      <div class="rv-body">
        ${active === '__notes' ? `<div class="rv-notes">${esc(scan.notes).replace(/\n/g, '<br>')}</div>` : ''}
        ${scan.mirrored && active !== '__notes' && sheets.some((s) => s.source === 'type') ? `<label class="rv-flip"><input type="checkbox" ${flip ? 'checked' : ''} data-flip> Flip drawings to match this room (text will read backwards)</label>` : ''}
        ${sheets.map((s) => `
          <figure class="rv-sheet">
            ${s.label ? `<figcaption>${esc(s.label)}</figcaption>` : ''}
            <a href="${esc(fileUrl(s.url))}" target="_blank" rel="noopener"><img src="${esc(fileUrl(s.url))}" alt="${esc(s.label)}" class="${flip && s.source === 'type' ? 'flipped' : ''}" loading="lazy"></a>
            <div class="muted small">Tap the drawing to open it full size and zoom.</div>
          </figure>`).join('')}
      </div>
      ${appLink ? `<p class="pad"><a class="btn" href="${esc(appLink)}">Open in PCG Projects</a></p>` : ''}`;
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { active = b.dataset.tab; draw(); }));
    const f = el.querySelector('[data-flip]');
    if (f) f.onchange = () => { flip = f.checked; draw(); };
  };
  draw();
}
