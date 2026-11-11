// Label images + PDF for thermal label printers (Phomemo M110/M120/M220/M221/D30…).
// Labels are drawn pure black & white at 203 dpi (8 dots per mm), the resolution these printers use,
// then shared to the Phomemo app (Print Master) with the phone's Share sheet, or downloaded.

export const LABEL_SIZES = [
  { key: '50x80', w: 50, h: 80, name: '50 × 80 mm (tall)' },
  { key: '50x50', w: 50, h: 50, name: '50 × 50 mm' },
  { key: '40x40', w: 40, h: 40, name: '40 × 40 mm' },
  { key: '50.8x50.8', w: 50.8, h: 50.8, name: '2" × 2" (50.8 mm)' },
  { key: '50x30', w: 50, h: 30, name: '50 × 30 mm' },
  { key: '40x30', w: 40, h: 30, name: '40 × 30 mm' },
  { key: '60x40', w: 60, h: 40, name: '60 × 40 mm' },
  { key: 'custom', w: 50, h: 80, name: 'Custom size…' }
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
  const drawQR = (x0, y0, side) => {
    const cell = Math.max(1, Math.floor(side / (n + 2 * quiet))), px = cell * (n + 2 * quiet);
    const ox = Math.round(x0 + (side - px) / 2), oy = Math.round(y0 + (side - px) / 2);
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (dark(r, col)) ctx.fillRect(ox + (col + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
  };
  const sub = [lab.type, lab.floor].filter(Boolean).join(' · ');

  if (W / H >= 1.25) {
    // wide label: QR left, text right
    const side = H - 2 * m; drawQR(m, m, side);
    const tx = m + side + Math.round(DOTS_PER_MM), tw = W - tx - m;
    let y = m;
    if (lab.project) { const px = fitText(ctx, lab.project, tw, Math.round(H * 0.09), 10, '400'); ctx.fillText(lab.project, tx, y); y += px + 6; }
    const lblPx = fitText(ctx, 'ROOM', tw, Math.round(H * 0.08), 10, '700'); ctx.fillText('ROOM', tx, y); y += lblPx + 2;
    const numPx = fitText(ctx, String(lab.number), tw, Math.round(H * 0.38), 16, '900'); ctx.fillText(String(lab.number), tx, y); y += numPx + 4;
    const t2 = [lab.type, lab.mirrored ? 'MIRRORED' : ''].filter(Boolean).join(' · ');
    if (t2 && y < H - m) { fitText(ctx, t2, tw, Math.round(H * 0.085), 9, '700'); ctx.fillText(t2, tx, y); }
    const hint = 'Scan for plans';
    const hPx = fitText(ctx, hint, tw, Math.round(H * 0.07), 8, '400');
    if (H - m - hPx > y + 10) ctx.fillText(hint, tx, H - m - hPx);
  } else {
    // square or tall label (50×50, 40×40, 50×80…): "Room 214" on top, details, QR centered, footer
    ctx.textAlign = 'center';
    const pad = Math.round(W * 0.05);
    let y = pad;
    const big = 'Room ' + lab.number;
    const bigPx = fitText(ctx, big, W - 2 * pad, Math.round(Math.min(H * 0.13, W * 0.2)), 12, '900'); ctx.fillText(big, W / 2, y); y += bigPx + 4;
    if (sub) { const sp = fitText(ctx, sub, W - 2 * pad, Math.round(Math.min(H * 0.05, W * 0.075)), 9, '400'); ctx.fillText(sub, W / 2, y); y += sp + 3; }
    if (lab.mirrored) { const mp = fitText(ctx, 'MIRRORED', W - 2 * pad, Math.round(Math.min(H * 0.05, W * 0.075)), 9, '700'); ctx.fillText('MIRRORED', W / 2, y); y += mp + 3; }
    const foot = [String(lab.project || '').replace(/\s+Suites\b/i, ''), 'scan for room plans'].filter(Boolean).join(' · ');
    const footPx = Math.round(Math.min(H * 0.042, W * 0.065));
    const avail = H - y - footPx - pad;
    const side = Math.max(40, Math.min(W - 2 * Math.round(pad * 0.4), avail));
    drawQR(Math.round((W - side) / 2), y + Math.max(0, (avail - side) / 2), side);
    fitText(ctx, foot, W - 2 * pad, footPx, 8, '400'); ctx.fillText(foot, W / 2, H - pad * 0.7 - footPx);
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

export async function canvasToJpegFile(c, name) {
  // JPEG, not PNG: the Phomemo app opens a shared PNG but doesn't load the picture
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
  return new File([blob], name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

const TOUCH = matchMedia('(pointer: coarse)').matches;
const canShareType = (type, ext) => { try { return TOUCH && !!navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.' + ext, { type })] }); } catch (e) { return false; } };
export const CAN_SHARE_PDF = canShareType('application/pdf', 'pdf');
export const CAN_SHARE_JPG = canShareType('image/jpeg', 'jpg');
export const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
