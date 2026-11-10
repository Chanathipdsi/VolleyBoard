import { t } from '../i18n.js';
import { esc, uid, todayIso, addDays, sortBy } from '../util.js';
import { S, UI, can, doc, commit, players, byId, shortName } from '../store.js';
import { ico, openDlg, calendar, calState, fmtDate, timeLabel } from '../ui.js';

const T = () => (UI.train = UI.train || { att: null });
const FOCUS = ['ทั่วไป', 'เสิร์ฟ/รับเสิร์ฟ', 'เซต/ตบ', 'บล็อก/รับลูกตบ', 'ระบบเกม/ตำแหน่ง', 'ฟิตเนส/ร่างกาย', 'เกมซ้อม'];
const ATT = [['present', 'มา', '#4ADE80'], ['late', 'สาย', '#FFD23F'], ['absent', 'ขาด', '#FF6B6B']];
const sessions = () => doc('sessions'), events = () => doc('events');

function marks(d) { return { t: sessions().filter((s) => s.date === d).length, m: events().filter((e) => e.date === d).length }; }
function form(s, date) {
  s = s || { date, start: '16:00', end: '18:00', title: '', place: '', focus: FOCUS[0], drills: [], note: '' };
  return `<div class="fgrid"><label class="fld">${t('วันที่')}<input class="txt" type="date" name="date" value="${s.date}" required></label><label class="fld">${t('ชื่อการซ้อม')}<input class="txt" name="title" value="${esc(s.title)}" placeholder="${t('เช่น ซ้อมเสิร์ฟ + เกมซ้อม')}"></label></div>
<div class="fgrid"><label class="fld">${t('เริ่ม')}<input class="txt" type="time" name="start" value="${esc(s.start)}"></label><label class="fld">${t('จบ')}<input class="txt" type="time" name="end" value="${esc(s.end)}"></label></div>
<div class="fgrid"><label class="fld">${t('สถานที่')}<input class="txt" name="place" value="${esc(s.place)}"></label><label class="fld">${t('จุดเน้น')}<select class="txt" name="focus">${FOCUS.map((f) => `<option value="${f}" ${s.focus === f ? 'selected' : ''}>${t(f)}</option>`).join('')}</select></label></div>
<label class="fld">${t('แบบฝึก (บรรทัดละ 1 รายการ)')}<textarea class="txt" name="drills">${esc((s.drills || []).join('\n'))}</textarea></label>
<label class="fld">${t('หมายเหตุ')}<input class="txt" name="note" value="${esc(s.note || '')}"></label>`;
}
function readForm(fd) { return { date: fd.date, start: fd.start || '', end: fd.end || '', title: (fd.title || '').trim() || t('ซ้อม'), place: (fd.place || '').trim(), focus: fd.focus, drills: (fd.drills || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30), note: (fd.note || '').trim() }; }
function openEdit(s, date) {
  const rep = !s ? `<fieldset style="display:flex"><legend>${t('ทำซ้ำ')}</legend><span style="font-weight:600">${t('ทำซ้ำทุกสัปดาห์')}</span><select class="txt" name="rep" style="width:auto"><option value="0">${t('ไม่ทำซ้ำ')}</option>${[4, 8, 12, 26, 52].map((n) => `<option value="${n}">${t('อีก {n} สัปดาห์', { n })}</option>`).join('')}</select></fieldset>` : '';
  openDlg({ title: s ? t('แก้ไขวันซ้อม') : t('เพิ่มวันซ้อม'), ok: s ? t('บันทึก') : t('เพิ่ม'), body: form(s, date) + rep,
    onSubmit(fd) {
      if (!fd.date) return t('เลือกวันที่');
      const o = readForm(fd);
      if (s) Object.assign(s, o);
      else { const n = Math.min(52, parseInt(fd.rep, 10) || 0); for (let i = 0; i <= n; i++) sessions().push(Object.assign({ id: uid() }, o, { date: addDays(o.date, i * 7) })); }
      commit('sessions'); calState('train').sel = o.date;
    } });
}
function attendance(s) {
  const a = (doc('attendance')[s.id] = doc('attendance')[s.id] || {});
  const ppl = players();
  if (!ppl.length) return `<p class="muted">${t('ยังไม่มีผู้เล่น')}</p>`;
  const sum = ATT.map(([k, l]) => `${t(l)} ${ppl.filter((p) => a[p.id] === k).length}`).join(' · ');
  return `<div class="col" style="gap:6px"><p class="muted">${ATT.map(([k, l, c]) => `<span class="pill" style="background:${c}">${t(l)} ${ppl.filter((p) => a[p.id] === k).length}</span>`).join(' ')}</p>${ppl.map((p) => `<div class="split" style="align-items:center"><span><b>#${p.data.n || '–'}</b> ${esc(shortName(p))}</span><span class="chips" role="group" aria-label="${esc(p.name)}">${ATT.map(([k, l]) => `<button class="tab st" style="--c:${ATT.find((x) => x[0] === k)[2]}" data-act="attSet" data-s="${s.id}" data-p="${p.id}" data-v="${k}" aria-pressed="${a[p.id] === k}">${t(l)}</button>`).join('')}</span></div>`).join('')}</div>`;
}
function sessCard(s) {
  const edit = can('train'), open = T().att === s.id, mine = doc('attendance')[s.id] && doc('attendance')[s.id][S.me.id];
  const my = !edit && mine ? ATT.find((x) => x[0] === mine) : null;
  return `<div class="col" style="gap:8px"><div class="sess" ${open ? 'aria-current="true"' : ''}><div class="grow"><b>${esc(s.title)}</b><br><small class="muted">${timeLabel(s.start)}${s.end ? '–' + timeLabel(s.end) : ''}${s.place ? ' · ' + esc(s.place) : ''} · ${t(s.focus)}</small></div>
${my ? `<span class="pill" style="background:${my[2]}">${t(my[1])}</span>` : ''}${edit ? `<button class="btn sm" data-act="attOpen" data-s="${s.id}" aria-expanded="${open}">${t('เช็กชื่อ')}</button><button class="icon" data-act="sessEdit" data-s="${s.id}" aria-label="${t('แก้ไข')}">${ico('edit', 18)}</button><button class="icon" data-act="sessDel" data-s="${s.id}" aria-label="${t('ลบ')}">${ico('del', 18)}</button>` : ''}</div>
${(s.drills || []).length ? `<ul style="margin:0;padding-left:22px">${s.drills.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}${s.note ? `<p class="muted">${esc(s.note)}</p>` : ''}${open && edit ? attendance(s) : ''}</div>`;
}
export function render() {
  const st = calState('train'), edit = can('train'), day = sessions().filter((s) => s.date === st.sel).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const dayEv = events().filter((e) => e.date === st.sel);
  const up = sortBy(sessions().filter((s) => s.date >= todayIso()), (s) => s.date + (s.start || '')).slice(0, 6);
  const total = sessions().length;
  return `<section class="hero"><div><h1>${t('ฝึกซ้อม')}</h1><p>${t('วางตารางซ้อมล่วงหน้าได้ไม่จำกัด — มุมมองรายเดือน / 3 เดือน / ทั้งปี')}</p></div>${edit ? `<button class="btn main" data-act="sessAdd" data-d="${st.sel}">${ico('plus', 18)} ${t('เพิ่มวันซ้อม')}</button>` : ''}</section>
<div class="row"><section class="card" style="flex:2 1 420px">${calendar('train', marks)}</section>
<section class="card" style="flex:1 1 300px"><div class="split"><h2>${fmtDate(st.sel, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2></div>
${dayEv.map((e) => `<div class="hint"><span>${t('แมตช์')}: ${esc(e.opp)} ${e.time ? timeLabel(e.time) : ''}</span></div>`).join('')}
${day.length ? day.map(sessCard).join('') : `<div class="empty"><b>${t('ไม่มีซ้อมวันนี้')}</b>${edit ? `<button class="btn main" data-act="sessAdd" data-d="${st.sel}">${ico('plus', 18)} ${t('เพิ่มซ้อมในวันนี้')}</button>` : ''}</div>`}
${edit && day.length ? `<button class="btn" data-act="sessAdd" data-d="${st.sel}">${ico('plus', 18)} ${t('เพิ่มอีกรายการในวันนี้')}</button>` : ''}</section></div>
<section class="card"><h2>${t('การซ้อมที่จะถึง')}</h2>${up.length ? up.map((s) => `<button class="rowbtn" data-act="calsel" data-ns="train" data-d="${s.date}">${fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${timeLabel(s.start)} · ${esc(s.title)}</button>`).join('') : `<p class="muted">${total ? t('ไม่มีการซ้อมที่จะถึง') : t('ยังไม่มีตารางซ้อม')}</p>`}</section>`;
}
export const actions = {
  sessAdd(d) { openEdit(null, d.d); return false; },
  sessEdit(d) { const s = sessions().find((x) => x.id === d.s); if (s) openEdit(s); return false; },
  sessDel(d) {
    const s = sessions().find((x) => x.id === d.s); if (!s) return false;
    openDlg({ title: t('ลบ “{n}”?', { n: s.title }), danger: true, ok: t('ลบ'), body: `<p>${t('ลบเฉพาะรายการนี้ รวมถึงข้อมูลเช็กชื่อของวันนั้น')}</p>`, onSubmit() { doc('sessions').splice(sessions().indexOf(s), 1); delete doc('attendance')[s.id]; commit('sessions'); commit('attendance'); } });
    return false;
  },
  attOpen(d) { T().att = T().att === d.s ? null : d.s; },
  attSet(d) { const a = (doc('attendance')[d.s] = doc('attendance')[d.s] || {}); a[d.p] = a[d.p] === d.v ? undefined : d.v; if (a[d.p] === undefined) delete a[d.p]; commit('attendance'); }
};
