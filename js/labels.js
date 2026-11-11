// Label images + PDF for thermal label printers (Phomemo M110/M120/M220/M221/D30…).
// Labels are drawn pure black & white at 203 dpi (8 dots per mm), the resolution these printers use,
// then shared to the Phomemo app (Print Master) with the phone's Share sheet, or downloaded.

export const LABEL_SIZES = [
  { key: '50x30', w: 50, h: 30, name: '50 × 30 mm (M110 / M220 common)' },
  { key: '40x30', w: 40, h: 30, name: '40 × 30 mm' },
  { key: '50x25', w: 50, h: 25, name: '50 × 25 mm' },
  { key: '60x40', w: 60, h: 40, name: '60 × 40 mm' },
  { key: '40x40', w: 40, h: 40, name: '40 × 40 mm (square)' },
  { key: '50x50', w: 50, h: 50, name: '50 × 50 mm (square)' },
  { key: '30x20', w: 30, h: 20, name: '30 × 20 mm (small)' },
  { key: 'custom', w: 50, h: 30, name: 'Custom size…' }
];
const DOTS_PER_MM = 8;

function qrMatrix(text) {
  if (!window.qrcode) throw new Error('QR library did not load — check your internet connection and reload.');
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount();
  return { n, dark: (r, c) => q.isDark(r, c) };
}

// Fit text into a width by shrinking the font.
function fitText(ctx, text, maxW, startPx, minPx, weight = '700') {
  let px = startPx;
  do { ctx.font = `${weight} ${px}px Arial, Helvetica, sans-serif`; if (ctx.measureText(text).width <= maxW) break; px -= 1; } while (px > minPx);
  return px;
}

// lab = { url, number, project, type, mirrored }
export function renderLabel(lab, wMm, hMm) {
  const W = Math.round(wMm * DOTS_PER_MM), H = Math.round(hMm * DOTS_PER_MM);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
  const m = Math.round(1.5 * DOTS_PER_MM); // margin
  const { n, dark } = qrMatrix(lab.url);
  const quiet = 2; // modules of white border around the code
  const wide = W / H >= 1.25;
  // QR size: side-by-side uses the full label height; stacked leaves room for the number below
  const qrBox = wide ? H - 2 * m : Math.min(W - 2 * m, H - 2 * m - Math.round(H * 0.24));
  const cell = Math.max(1, Math.floor(qrBox / (n + 2 * quiet)));
  const qrPx = cell * (n + 2 * quiet);
  const qx = wide ? m : Math.round((W - qrPx) / 2), qy = wide ? Math.round((H - qrPx) / 2) : m;
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (dark(r, col)) ctx.fillRect(qx + (col + quiet) * cell, qy + (r + quiet) * cell, cell, cell);

  if (wide) {
    const tx = qx + qrPx + Math.round(DOTS_PER_MM), tw = W - tx - m;
    let y = m;
    if (lab.project) { const px = fitText(ctx, lab.project, tw, Math.round(H * 0.09), 10, '400'); ctx.fillText(lab.project, tx, y); y += px + 6; }
    const lblPx = fitText(ctx, 'ROOM', tw, Math.round(H * 0.08), 10, '700'); ctx.fillText('ROOM', tx, y); y += lblPx + 2;
    const numPx = fitText(ctx, String(lab.number), tw, Math.round(H * 0.38), 16, '900'); ctx.fillText(String(lab.number), tx, y); y += numPx + 4;
    const sub = [lab.type, lab.mirrored ? 'MIRRORED' : ''].filter(Boolean).join(' · ');
    if (sub && y < H - m) { fitText(ctx, sub, tw, Math.round(H * 0.085), 9, '700'); ctx.fillText(sub, tx, y); }
    const hint = 'Scan for plans';
    const hPx = fitText(ctx, hint, tw, Math.round(H * 0.07), 8, '400');
    if (H - m - hPx > y + 10) ctx.fillText(hint, tx, H - m - hPx);
  } else {
    const y = qy + qrPx + 2;
    const txt = `${lab.number}${lab.mirrored ? ' (M)' : ''}`;
    const px = fitText(ctx, txt, W - 2 * m, H - y - m, 12, '900');
    ctx.textAlign = 'center'; ctx.fillText(txt, W / 2, y + Math.max(0, (H - y - m - px) / 2));
  }
  // force pure black/white so the thermal printer doesn't dither grey edges
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < 150 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Minimal PDF writer: one JPEG image per page, page = label size.
export async function canvasesToPdf(canvases, wMm, hMm) {
  const wPt = +(wMm * 72 / 25.4).toFixed(2), hPt = +(hMm * 72 / 25.4).toFixed(2);
  const jpegs = [];
  for (const c of canvases) {
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    jpegs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height });
  }
  const parts = []; let len = 0; const offs = [];
  const enc = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const push = (x) => { const b = typeof x === 'string' ? enc(x) : x; parts.push(b); len += b.length; };
  const obj = (num, body) => { offs[num] = len; push(`${num} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${jpegs.length} /Kids [${jpegs.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`));
  jpegs.forEach((j, i) => {
    const p = 3 + 3 * i;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
    const content = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`;
    obj(p + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(p + 2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>\nstream\n`); push(j.bytes); push('\nendstream'); });
  });
  const count = 2 + 3 * jpegs.length;
  const xref = len;
  let x = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let k = 1; k <= count; k++) x += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

export async function canvasToPngFile(c, name) {
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}

// Share to another app (Phomemo / Print Master) when the browser supports it, otherwise download.
export async function shareOrDownload(files, title) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  for (const f of files) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  return 'downloaded';
}
