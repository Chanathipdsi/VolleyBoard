import { t } from './i18n.js';
import { esc } from './util.js';
import { summarize, sumObj, KIND_LABEL, WIN_KINDS, LOSE_KINDS } from './stats.js';

const TYPE = { friendly: 'กระชับมิตร', league: 'ลีก', cup: 'ถ้วย/ทัวร์นาเมนต์' };

/* Everything the three formats need, computed once. */
export function reportData(team, ev, rec, who) {
  const s = summarize(rec.log, rec.sets), sets = rec.sets || [];
  const w = sets.filter((x) => x.a > x.b).length, l = sets.length - w;
  const rows = Object.values(s.players).map((p) => ({ id: p.id, ...who(p.id), kill: p.kill, tip: p.tip, ace: p.ace, block: p.block, pts: p.pts, err: p.err })).sort((a, b) => b.pts - a.pts);
  const detail = (rec.log || []).some((e) => e.k === 'pt');
  const ours = s.win.kill + s.win.tip, gifts = s.win.o_serve + s.win.o_atk + s.win.o_fault;
  const log = (rec.log || []).filter((e) => e.k === 'pt').map((e, i) => ({ i: i + 1, set: e.set, a: e.a, b: e.b, who: e.who === 'us' ? t('เราได้แต้ม') : t('เราเสียแต้ม'), kind: t(KIND_LABEL[e.kind] || e.kind), player: e.pid ? who(e.pid).name : '' }));
  return { team, ev, sets, w, l, win: w > l, detail, s, rows, ours, gifts, log, best: rows[0] || null, type: t(TYPE[ev.type] || '') };
}

/* ---------- tables (shared by CSV and XLSX) ---------- */
export function tables(d) {
  const info = [[t('รายงานผลการแข่งขัน'), ''], [t('ทีม'), d.team.name], [t('คู่แข่ง'), d.ev.opp], [t('วันที่'), d.ev.date], [t('เวลา'), d.ev.time || ''], [t('สนาม'), d.ev.place || ''], [t('ประเภท'), d.type], [t('ผล'), `${d.w}–${d.l} ${d.win ? t('ชนะ') : t('แพ้')}`]];
  if (d.detail) info.push([t('แต้มรวม (เรา–คู่แข่ง)'), `${d.s.us}–${d.s.opp}`]);
  const setT = [[t('เซ็ต'), d.team.name, d.ev.opp, t('ผล')]].concat(d.sets.map((x, i) => [i + 1, x.a, x.b, x.a > x.b ? t('ชนะ') : t('แพ้')]));
  const out = { summary: { name: t('สรุป'), rows: info.concat([[]], setT) } };
  if (!d.detail) return out;
  out.players = { name: t('ผู้เล่น'), rows: [['#', t('ชื่อ'), t('ตำแหน่ง'), t('ตบ'), t('หลอก'), t('เอซ'), t('บล็อก'), t('รวมแต้ม'), t('เสียแต้ม')]].concat(d.rows.map((p) => [p.n, p.name, p.pos || '', p.kill, p.tip, p.ace, p.block, p.pts, p.err]), [[t('รวมทีม'), '', '', d.s.win.kill, d.s.win.tip, d.s.win.ace, d.s.win.block, d.s.us, d.s.opp]]) };
  out.points = { name: t('ที่มาของแต้ม'), rows: [[t('เราได้แต้มจาก'), t('จำนวน'), '%']].concat(WIN_KINDS.map((k) => [t(k.label), d.s.win[k.id], d.s.us ? Math.round(d.s.win[k.id] / d.s.us * 100) : 0]), [[]], [[t('เราเสียแต้มจาก'), t('จำนวน'), '%']], LOSE_KINDS.map((k) => [t(k.label), d.s.lose[k.id], d.s.opp ? Math.round(d.s.lose[k.id] / d.s.opp * 100) : 0])) };
  out.log = { name: t('รายแต้ม'), rows: [['#', t('เซ็ต'), t('เรา'), t('คู่แข่ง'), t('ผล'), t('วิธี'), t('ผู้เล่น')]].concat(d.log.map((r) => [r.i, r.set, r.a, r.b, r.who, r.kind, r.player])) };
  return out;
}

/* ---------- CSV ---------- */
const csvCell = (v) => { let x = v == null ? '' : String(v); if (/^[=+\-@]/.test(x) && isNaN(Number(x))) x = "'" + x; return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
export function toCSV(d) {
  const tb = tables(d);
  const text = Object.values(tb).map((s) => [s.name].concat(s.rows.map((r) => r.map(csvCell).join(','))).join('\r\n')).join('\r\n\r\n');
  return new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
}

/* ---------- XLSX (minimal OOXML in a store-only zip, no dependencies) ---------- */
const enc = new TextEncoder();
const CRC = (() => { const t0 = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t0[n] = c >>> 0; } return t0; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const parts = [], cen = []; let off = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  files.forEach(([name, text]) => {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const lh = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)]);
    parts.push(lh, nm, data);
    cen.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
    off += lh.length + nm.length + data.length;
  });
  const cenLen = cen.reduce((n, p) => n + p.length, 0);
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cenLen), ...u32(off), 0, 0]);
  return new Blob([...parts, ...cen, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const col = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const xml = (x) => String(x).replace(/[&<>"\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || ''));
function sheetXml(rows) {
  const body = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
    const ref = col(ci) + (ri + 1), head = ri === 0 || (r.length === 1 && v !== '');
    if (v === '' || v == null) return '';
    const st = head ? ' s="1"' : '';
    return typeof v === 'number' ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  const w = Math.max(0, ...rows.map((r) => r.length));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${Array.from({ length: w }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 1 ? 26 : 16}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>`;
}
export function toXLSX(d) {
  const sheets = Object.values(tables(d)).map((s) => ({ name: String(s.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), rows: s.rows }));
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]
  ].concat(sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]));
  return zip(files);
}

/* ---------- PDF: a print-ready A4 page; the browser's "Save as PDF" makes the file ---------- */
export function reportHTML(d) {
  const tb = (head, rows, cls = '') => `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const s = d.s, spike = s.win.kill + s.win.tip;
  const setsT = tb([t('ทีม'), ...d.sets.map((_, i) => i + 1), t('รวม')], [[d.team.name, ...d.sets.map((x) => x.a), d.sets.reduce((n, x) => n + x.a, 0)], [d.ev.opp, ...d.sets.map((x) => x.b), d.sets.reduce((n, x) => n + x.b, 0)]], 'c');
  const perf = d.detail ? tb([t('ทักษะ'), t('ได้แต้ม'), t('เสียแต้ม')], [
    [t('ตบ/หลอก'), spike, s.lose.atk_out + s.lose.atk_net + s.lose.blocked], [t('บล็อก'), s.win.block, s.lose.blocked], [t('เสิร์ฟ'), s.win.ace, s.lose.serve_err],
    [t('รับ/ตั้งรับ'), '', s.lose.rec_err + s.lose.dig_err], [t('เซ็ต'), '', s.lose.set_err], [t('คู่แข่งผิดพลาด'), d.gifts, ''], [t('รวม'), s.us, s.opp]], 'c') : '';
  const players = d.detail ? tb(['#', t('ชื่อ'), t('ตำแหน่ง'), t('ตบ'), t('หลอก'), t('เอซ'), t('บล็อก'), t('รวมแต้ม'), t('เสียแต้ม')], d.rows.map((p) => [p.n, p.name, p.pos || '', p.kill, p.tip, p.ace, p.block, p.pts, p.err]), 'c') : `<p>${esc(t('ไม่มีสถิติรายแต้ม (ใส่ผลย้อนหลัง)'))}</p>`;
  const pts = d.detail ? tb([t('เราได้แต้มจาก'), t('จำนวน')], WIN_KINDS.map((k) => [t(k.label), s.win[k.id]]), 'c') + tb([t('เราเสียแต้มจาก'), t('จำนวน')], LOSE_KINDS.map((k) => [t(k.label), s.lose[k.id]]), 'c') : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.team.name)} vs ${esc(d.ev.opp)}</title><style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px/1.45 "IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif;color:#111;margin:0}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:16px 0 6px;border-bottom:2px solid #2128D0;padding-bottom:2px}.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #2128D0;padding-bottom:8px}
.badge{display:inline-block;padding:2px 10px;border-radius:99px;font-weight:700;color:#fff;background:${d.win ? '#15803D' : '#B91C1C'}}
table{border-collapse:collapse;width:100%;margin:4px 0 8px}th,td{border:1px solid #999;padding:3px 6px;text-align:left}th{background:#E8EAFE}table.c td:not(:first-child),table.c th:not(:first-child){text-align:center}
.info{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 16px}.info b{display:block;font-size:10px;color:#555;font-weight:500}.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
.foot{margin-top:14px;font-size:10px;color:#666}</style></head><body>
<div class="top"><div><h1>${esc(t('รายงานผลการแข่งขัน'))}</h1><div>${esc(d.team.name)} — ${esc(d.ev.opp)}</div></div><div style="text-align:right"><span class="badge">${d.w}–${d.l} ${esc(d.win ? t('ชนะ') : t('แพ้'))}</span><div>VolleyBoard</div></div></div>
<h2>${esc(t('ข้อมูลการแข่งขัน'))}</h2><div class="info"><div><b>${esc(t('วันที่'))}</b>${esc(d.ev.date)}</div><div><b>${esc(t('เวลา'))}</b>${esc(d.ev.time || '–')}</div><div><b>${esc(t('สนาม'))}</b>${esc(d.ev.place || '–')}</div><div><b>${esc(t('ประเภท'))}</b>${esc(d.type || '–')}</div><div><b>${esc(t('ประเทศ'))}</b>${esc(d.team.country)}</div>${d.detail ? `<div><b>${esc(t('แต้มรวม (เรา–คู่แข่ง)'))}</b>${s.us}–${s.opp}</div>` : ''}</div>
<h2>${esc(t('คะแนนรายเซ็ต'))}</h2>${setsT}
<h2>${esc(t('ผู้เล่น'))}</h2>${players}
${d.detail ? `<div class="cols"><div><h2>${esc(t('สรุปทักษะ'))}</h2>${perf}</div><div><h2>${esc(t('ที่มาของแต้ม'))}</h2>${pts}</div></div>` : ''}
${d.best ? `<h2>${esc(t('ผู้ทำแต้มสูงสุด'))}</h2><p><b>#${esc(d.best.n)} ${esc(d.best.name)}</b> — ${d.best.pts} ${esc(t('แต้ม'))} (${esc(t('ตบ'))} ${d.best.kill}, ${esc(t('หลอก'))} ${d.best.tip}, ${esc(t('เอซ'))} ${d.best.ace}, ${esc(t('บล็อก'))} ${d.best.block})</p>` : ''}
<div class="foot">${esc(t('สร้างโดย VolleyBoard'))} · ${new Date().toLocaleString()}</div></body></html>`;
}
export function printPDF(d) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
  f.onload = () => { setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 60000); } }, 300); };
  f.srcdoc = reportHTML(d);
}

export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const fileBase = (d) => `${d.team.name}-vs-${d.ev.opp}-${d.ev.date}`.replace(/[^\p{L}\p{N}._-]+/gu, '_');
