import { t, getLang, locale } from './i18n.js';
import { esc, iso, parseIso, todayIso, daysInMonth, pad2 } from './util.js';
import { P, UI, toast } from './store.js';

let refresh = () => {};
export const setRefresh = (f) => { refresh = f; };
export const rerender = () => refresh();

/* ---------- icons ---------- */
const IC = {
  court: '<rect x="3" y="4" width="18" height="16" rx="1.5"></rect><path d="M3 9h18M12 9v11"></path>',
  roster: '<circle cx="9" cy="8" r="3.2"></circle><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.2a3.2 3.2 0 010 5.6M18 14.2c1.8.8 3 2.6 3 5.8"></path>',
  matches: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
  training: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4h6v3H9zM9 12l2 2 4-4"></path>',
  roles: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"></path>',
  settings: '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>', edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"></path>',
  del: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"></path>', x: '<path d="M6 6l12 12M18 6L6 18"></path>',
  cw: '<path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5"></path>', back: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"></path>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>', l: '<path d="M15 6l-6 6 6 6"></path>', r: '<path d="M9 6l6 6-6 6"></path>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 012-2h9"></path>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="9" cy="9" r="1" fill="currentColor"></circle><circle cx="15" cy="15" r="1" fill="currentColor"></circle><circle cx="15" cy="9" r="1" fill="currentColor"></circle><circle cx="9" cy="15" r="1" fill="currentColor"></circle>',
  logout: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 8l-4 4 4 4M6 12h10"></path>',
  warn: '<path d="M12 3l10 18H2zM12 10v5M12 18v.5"></path>', spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path>',
  send: '<path d="M4 12l16-8-6 16-3-7z"></path>', chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"></path>', user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>', undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"></path>'
};
export const ico = (n, sz = 22) => `<svg aria-hidden="true" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;

/* ---------- dialog ---------- */
const dlg = () => document.getElementById('dlg');
let dlgSubmit = null, dlgBack = null;
export function openDlg({ title, body, ok, onSubmit, noCancel, danger }) {
  const d = dlg(); dlgBack = document.activeElement; dlgSubmit = onSubmit;
  d.innerHTML = `<form id="dlg-form" novalidate><h2 id="dlg-title">${esc(title)}</h2>${body}<p class="err" id="dlg-err" role="alert" hidden></p>
<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end">${noCancel ? '' : `<button type="button" class="btn sm" data-act="dlgCancel">${t('ยกเลิก')}</button>`}${ok ? `<button type="submit" class="btn ${danger ? 'danger' : 'main'}" style="min-height:46px">${esc(ok)}</button>` : ''}</div></form>`;
  if (!d.open) { try { d.showModal(); } catch { d.setAttribute('open', ''); } }
  const f = d.querySelector('input:not([type=hidden]),select,textarea'); if (f) f.focus();
}
export function closeDlg() {
  const d = dlg(); try { d.close(); } catch { d.removeAttribute('open'); }
  dlgSubmit = null; if (dlgBack && dlgBack.isConnected) { try { dlgBack.focus({ preventScroll: true }); } catch { /* */ } }
}
export const dlgOpen = () => dlg().open;
export function dlgError(msg) { const e = document.getElementById('dlg-err'); if (e) { e.textContent = msg; e.hidden = !msg; } }
export function initDialog() {
  const d = dlg();
  d.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = {}; new FormData(e.target).forEach((v, k) => { fd[k] = v; });
    const btn = e.target.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
    const err = dlgSubmit ? await dlgSubmit(fd) : null;
    if (btn) btn.disabled = false;
    if (err) { dlgError(err); return; }
    closeDlg(); refresh();
  });
  d.addEventListener('click', (e) => { if (e.target === d) closeDlg(); });
  d.addEventListener('close', () => { dlgSubmit = null; });
}

export async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg || t('คัดลอกแล้ว')); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(msg || t('คัดลอกแล้ว')); } catch { toast(t('คัดลอกไม่ได้ ให้เลือกข้อความแล้วคัดลอกเอง'), 'bad'); }
    ta.remove();
  }
}

/* ---------- date formatting ---------- */
export function fmtDate(s, o) {
  const d = typeof s === 'string' ? parseIso(s) : s;
  return new Intl.DateTimeFormat(locale(P.buddhist), o || { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
export const monthName = (m, o) => new Intl.DateTimeFormat(locale(P.buddhist), { month: o || 'long' }).format(new Date(2026, m, 1));
export const yearLabel = (y) => (getLang() === 'th' && P.buddhist ? y + 543 : y);
export function weekdayShort(ws) {
  const th = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'], en = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const base = getLang() === 'th' ? th : en, out = [];
  for (let i = 0; i < 7; i++) out.push(base[(i + ws) % 7]);
  return out;
}
export const timeLabel = (s) => (s || '').slice(0, 5);

/* ---------- calendar (month / 3 months / whole year) ---------- */
export function calState(ns) {
  if (!UI.cal[ns]) { const d = new Date(); UI.cal[ns] = { view: 'month', y: d.getFullYear(), m: d.getMonth(), sel: todayIso() }; }
  return UI.cal[ns];
}
function monthHTML(ns, y, m, marks, st, mini) {
  const ws = parseInt(P.weekStart, 10) || 0, first = (new Date(y, m, 1).getDay() - ws + 7) % 7, n = daysInMonth(y, m), today = todayIso();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (let d = 1; d <= n; d++) {
    const di = y + '-' + pad2(m + 1) + '-' + pad2(d), mk = marks(di) || {}, sel = st.sel === di;
    const label = fmtDate(di, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (mk.t ? ' · ' + t('มีซ้อม {n}', { n: mk.t }) : '') + (mk.m ? ' · ' + t('มีแมตช์ {n}', { n: mk.m }) : '') + (di === today ? ' · ' + t('วันนี้') : '');
    cells += `<button class="day${di === today ? ' today' : ''}${di < today ? ' past' : ''}" data-fk="cd${di}" data-act="calsel" data-ns="${ns}" data-d="${di}" aria-pressed="${sel}" aria-label="${esc(label)}"><span>${d}</span><span class="dots">${mk.t ? '<i class="t"></i>' : ''}${mk.m ? '<i class="m"></i>' : ''}</span></button>`;
  }
  const dow = weekdayShort(ws).map((x) => `<span>${x}</span>`).join('');
  const head = mini ? `<h3>${monthName(m)} ${yearLabel(y)}</h3>` : '';
  return `<div class="${mini ? 'mini' : ''}">${head}<div class="cal dow" aria-hidden="true">${dow}</div><div class="cal">${cells}</div></div>`;
}
export function calendar(ns, marks) {
  const st = calState(ns);
  let title, body;
  if (st.view === 'month') { title = `${monthName(st.m)} ${yearLabel(st.y)}`; body = monthHTML(ns, st.y, st.m, marks, st, false); }
  else if (st.view === '3m') {
    const a = new Date(st.y, st.m, 1), z = new Date(st.y, st.m + 2, 1);
    title = `${monthName(a.getMonth(), 'short')} ${yearLabel(a.getFullYear())} – ${monthName(z.getMonth(), 'short')} ${yearLabel(z.getFullYear())}`;
    body = '<div class="minigrid">' + [0, 1, 2].map((i) => { const d = new Date(st.y, st.m + i, 1); return monthHTML(ns, d.getFullYear(), d.getMonth(), marks, st, true); }).join('') + '</div>';
  } else {
    title = t('ปี {y}', { y: yearLabel(st.y) });
    body = '<div class="minigrid">' + Array.from({ length: 12 }, (_, i) => monthHTML(ns, st.y, i, marks, st, true)).join('') + '</div>';
  }
  const views = [['month', 'รายเดือน'], ['3m', '3 เดือน'], ['year', 'ทั้งปี']].map((v) => `<button class="tab" data-fk="cv${v[0]}" data-act="calview" data-ns="${ns}" data-v="${v[0]}" aria-pressed="${st.view === v[0]}">${t(v[1])}</button>`).join('');
  return `<div class="split" style="align-items:center"><h2>${title}</h2><div style="display:flex;gap:6px;align-items:center"><button class="icon" data-act="calnav" data-ns="${ns}" data-d="-1" aria-label="${t('ก่อนหน้า')}">${ico('l', 18)}</button><button class="tab" data-act="calnav" data-ns="${ns}" data-d="0">${t('วันนี้')}</button><button class="icon" data-act="calnav" data-ns="${ns}" data-d="1" aria-label="${t('ถัดไป')}">${ico('r', 18)}</button></div></div>
<div class="chips" role="group" aria-label="${t('มุมมองปฏิทิน')}">${views}</div>${body}
<div class="legend"><span><i style="background:var(--ev-train)"></i>${t('วันซ้อม')}</span><span><i style="background:var(--ev-match)"></i>${t('วันแข่ง')}</span><span><i style="border:2px solid var(--text);background:transparent"></i>${t('วันนี้')}</span></div>`;
}
export const calActions = {
  calnav(d) {
    const st = calState(d.ns), n = +d.d;
    if (n === 0) { const x = new Date(); st.y = x.getFullYear(); st.m = x.getMonth(); st.sel = todayIso(); return; }
    const step = st.view === 'month' ? 1 : st.view === '3m' ? 3 : 12;
    const x = new Date(st.y, st.m + n * step, 1); st.y = x.getFullYear(); st.m = x.getMonth();
  },
  calview(d) { const st = calState(d.ns); st.view = d.v; if (d.v === 'year') st.m = 0; else { const s = parseIso(st.sel); st.y = s.getFullYear(); st.m = s.getMonth(); } },
  calsel(d) { const st = calState(d.ns); st.sel = d.d; if (st.view === 'month') { const s = parseIso(d.d); st.y = s.getFullYear(); st.m = s.getMonth(); } }
};
