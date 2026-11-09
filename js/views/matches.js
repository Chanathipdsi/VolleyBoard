import { t } from '../i18n.js';
import { esc, uid, todayIso, sortBy } from '../util.js';
import { S, UI, can, doc, commit, players, byId, shortName, toast, DEFAULTS } from '../store.js';
import { ico, openDlg, calendar, calState, fmtDate, timeLabel } from '../ui.js';
import { WIN_KINDS, LOSE_KINDS, KIND_LABEL, summarize, sumObj, aggregate } from '../stats.js';
import { hbars, momentumChart } from '../charts.js';

const M = () => (UI.mt = UI.mt || { tab: 'list', sel: null, pid: null });
const events = () => doc('events');
const rec = (id) => (id in S.docs ? S.docs[id] : null);
const recOf = (evId) => { const r = S.docs['rec:' + evId]; return r && !r.deleted ? r : null; };
const TYPES = { friendly: 'กระชับมิตร', league: 'ลีก', cup: 'ถ้วย/ทัวร์นาเมนต์' };
const nm = (id) => { const m = byId(id); return m ? shortName(m) : t('อดีตผู้เล่น'); };
const result = (r) => { const w = (r.sets || []).filter((s) => s.a > s.b).length, l = (r.sets || []).length - w; return { w, l, win: w > l }; };
const need = (live) => Math.ceil((live.bestOf || 5) / 2);

/* ---------- match dialog ---------- */
function evDlg(ev, date) {
  ev = ev || { date, time: '18:00', opp: '', place: '', type: 'friendly', note: '' };
  openDlg({ title: ev.id ? t('แก้ไขแมตช์') : t('เพิ่มแมตช์'), ok: ev.id ? t('บันทึก') : t('เพิ่ม'),
    body: `<label class="fld">${t('คู่แข่ง')}<input class="txt" name="opp" value="${esc(ev.opp)}" required></label><div class="fgrid"><label class="fld">${t('วันที่')}<input class="txt" type="date" name="date" value="${ev.date}" required></label><label class="fld">${t('เวลา')}<input class="txt" type="time" name="time" value="${esc(ev.time)}"></label></div>
<div class="fgrid"><label class="fld">${t('สนาม')}<input class="txt" name="place" value="${esc(ev.place)}"></label><label class="fld">${t('ประเภท')}<select class="txt" name="type">${Object.keys(TYPES).map((k) => `<option value="${k}" ${ev.type === k ? 'selected' : ''}>${t(TYPES[k])}</option>`).join('')}</select></label></div>`,
    onSubmit(fd) {
      if (!(fd.opp || '').trim() || !fd.date) return t('กรอกชื่อคู่แข่งและวันที่');
      const o = { date: fd.date, time: fd.time || '', opp: fd.opp.trim(), place: (fd.place || '').trim(), type: fd.type };
      if (ev.id) Object.assign(events().find((x) => x.id === ev.id), o); else { const n = Object.assign({ id: uid() }, o); events().push(n); M().sel = n.id; }
      commit('events'); calState('match').sel = o.date;
    } });
}
function pastDlg(ev) {
  openDlg({ title: t('ใส่ผลย้อนหลัง'), ok: t('บันทึกผล'), body: `<p class="muted">${t('ใส่คะแนนแต่ละเซ็ต คั่นด้วยจุลภาค เช่น 25-20, 22-25, 25-18 (ไม่มีรายละเอียดรายแต้ม)')}</p><label class="fld">${t('คะแนนเซ็ต (เรา-คู่แข่ง)')}<input class="txt" name="sets" placeholder="25-20, 22-25, 25-18"></label>`,
    onSubmit(fd) {
      const sets = String(fd.sets || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => { const m = x.match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/); return m ? { a: +m[1], b: +m[2] } : null; });
      if (!sets.length || sets.includes(null)) return t('รูปแบบไม่ถูกต้อง เช่น 25-20, 22-25');
      S.docs['rec:' + ev.id] = { eventId: ev.id, sets, log: [], finishedAt: Date.now(), manual: true }; commit('rec:' + ev.id);
    } });
}

/* ---------- live scoring ---------- */
function liveCounts(live) { const c = { to: 0, sub: 0 }; live.log.forEach((e) => { if (e.set === live.set && (e.k === 'to' || e.k === 'sub')) c[e.k]++; }); return c; }
function addPoint(who, kind, pid) {
  const live = doc('live'); if (who === 'us') live.a++; else live.b++;
  const e = { k: 'pt', set: live.set, who, kind, a: live.a, b: live.b }; if (pid) e.pid = pid; live.log.push(e);
  const target = live.set >= (live.bestOf || 5) ? 15 : 25;
  if ((live.a >= target || live.b >= target) && Math.abs(live.a - live.b) >= 2) {
    e.end = true; live.sets.push({ a: live.a, b: live.b }); live.set++; live.a = 0; live.b = 0;
    const r = result({ sets: live.sets });
    toast(r.w >= need(live) || r.l >= need(live) ? t('จบแมตช์แล้ว — กด “จบแมตช์และบันทึก”') : t('จบเซ็ต {n}', { n: live.set - 1 }));
  }
  commit('live');
}
function undo() {
  const live = doc('live'), e = live.log.pop(); if (!e) return;
  if (e.k === 'pt') { if (e.end) { live.sets.pop(); live.set = e.set; } const prev = [...live.log].reverse().find((x) => x.k === 'pt' && x.set === live.set); live.a = prev ? prev.a : 0; live.b = prev ? prev.b : 0; }
  commit('live');
}
function finish(live) {
  const sets = live.sets.slice(); if (live.a + live.b > 0) sets.push({ a: live.a, b: live.b });
  S.docs['rec:' + live.eventId] = { eventId: live.eventId, sets, log: live.log.slice(), finishedAt: Date.now() }; commit('rec:' + live.eventId);
  S.docs.live = DEFAULTS.live(); commit('live'); M().sel = live.eventId; M().tab = 'list';
}
function liveView() {
  const live = doc('live'), m = M();
  if (!can('stats')) return `<section class="card"><div class="empty"><b>${t('เฉพาะโค้ชและผู้ช่วยโค้ชที่บันทึกสดได้')}</b></div></section>`;
  if (!live.eventId) {
    const open = sortBy(events().filter((e) => !recOf(e.id)), (e) => e.date);
    return `<section class="card"><h2>${t('เริ่มบันทึกเกมสด')}</h2><p class="muted">${t('เลือกแมตช์ที่จะบันทึก ระบบนับแต้ม เซ็ต เวลานอก และการเปลี่ยนตัวให้')}</p>${open.length ? open.map((e) => `<div class="sess"><div class="grow"><b>${esc(e.opp)}</b><br><small class="muted">${fmtDate(e.date)} ${timeLabel(e.time)}</small></div><button class="btn main sm" data-act="liveStart" data-id="${e.id}">${t('เริ่ม')}</button></div>`).join('') : `<div class="empty"><b>${t('ยังไม่มีแมตช์ที่รอแข่ง')}</b>${can('schedule') ? `<button class="btn main" data-act="evAdd" data-d="${todayIso()}">${ico('plus', 18)} ${t('เพิ่มแมตช์')}</button>` : ''}</div>`}</section>`;
  }
  const ev = events().find((e) => e.id === live.eventId), c = liveCounts(live), r = result({ sets: live.sets });
  const roster = players().filter((p) => (p.data.st || 'active') !== 'unavailable');
  const cnt = (id) => live.log.filter((e) => e.k === 'pt' && e.kind === id).length;
  const kindBtn = (k, who) => `<button class="kind ${who === 'us' ? 'win' : 'lose'}" data-act="livePt" data-who="${who}" data-k="${k.id}">${t(k.label)}<small>${k.pl ? t('ต้องเลือกผู้เล่น') : t('ไม่ระบุผู้เล่น')} · ${cnt(k.id)}</small></button>`;
  const lastPt = [...live.log].reverse().find((e) => e.k === 'pt');
  return `<section class="card"><div class="split"><h2>${t('เทียบกับ {o}', { o: esc(ev ? ev.opp : '?') })}</h2><span class="muted">${t('เซ็ต {n}', { n: live.set })} · ${t('ชนะเซ็ต {a}–{b}', { a: r.w, b: r.l })} · ${t('เป็นผู้ชนะเมื่อได้ {n} เซ็ต', { n: need(live) })}</span></div>
<div class="row" style="flex-wrap:nowrap"><div class="score us"><span>${t('ทีมเรา')}</span><b>${live.a}</b></div><div class="score opp"><span>${t('คู่แข่ง')}</span><b>${live.b}</b></div></div>
${live.sets.length ? `<div class="chips">${live.sets.map((s, i) => `<span class="pill" style="background:${s.a > s.b ? 'var(--ok)' : 'var(--warn)'}">${t('เซ็ต {n}', { n: i + 1 })}: ${s.a}–${s.b}</span>`).join('')}</div>` : ''}
<div class="chips"><button class="btn sm" data-act="liveUndo" ${live.log.length ? '' : 'disabled'}>${ico('undo', 16)} ${t('ย้อนกลับ')}</button><button class="btn sm" data-act="liveTo" ${c.to >= 2 ? 'disabled' : ''}>${t('เวลานอก')} (${c.to}/2)</button><button class="btn sm" data-act="liveSub" ${c.sub >= 6 ? 'disabled' : ''}>${t('เปลี่ยนตัว')} (${c.sub}/6)</button><button class="btn sm" data-act="liveEndSet">${t('จบเซ็ตนี้')}</button><button class="btn sm main" data-act="liveFinish">${t('จบแมตช์และบันทึก')}</button><button class="btn sm danger" data-act="liveCancel">${t('ยกเลิกเกมสด')}</button></div></section>
<section class="card"><h2>${t('1) เลือกผู้เล่นที่เกี่ยวข้องกับแต้ม')}</h2><div class="pchips" role="group" aria-label="${t('ผู้เล่น')}">${roster.map((p) => `<button class="pchip" data-fk="pc${p.id}" data-act="livePid" data-id="${p.id}" aria-pressed="${m.pid === p.id}"><b>${p.data.n || '–'}</b>${esc(shortName(p))}</button>`).join('') || `<span class="muted">${t('ยังไม่มีผู้เล่น')}</span>`}</div>
<h2>${t('2) เราได้แต้มจาก…')}</h2><div class="kinds">${WIN_KINDS.map((k) => kindBtn(k, 'us')).join('')}</div>
<h2>${t('3) เราเสียแต้มจาก…')}</h2><div class="kinds">${LOSE_KINDS.map((k) => kindBtn(k, 'opp')).join('')}</div>
${lastPt ? `<p class="muted">${t('แต้มล่าสุด')}: ${lastPt.who === 'us' ? t('เราได้') : t('เราเสีย')} · ${t(KIND_LABEL[lastPt.kind])}${lastPt.pid ? ' · ' + esc(nm(lastPt.pid)) : ''}</p>` : ''}</section>`;
}

/* ---------- dashboard ---------- */
function dashboard(r, title) {
  const s = summarize(r.log, r.sets), res = result(r), detail = (r.log || []).some((e) => e.k === 'pt');
  const setTable = `<div class="scroll"><table><thead><tr><th>${t('เซ็ต')}</th><th>${t('เรา')}</th><th>${t('คู่แข่ง')}</th><th>${t('ผล')}</th></tr></thead><tbody>${(r.sets || []).map((x, i) => `<tr><td>${i + 1}</td><td>${x.a}</td><td>${x.b}</td><td>${x.a > x.b ? t('ชนะ') : t('แพ้')}</td></tr>`).join('')}</tbody></table></div>`;
  const kpi = `<div class="kpis"><div class="kpi"><span>${t('ผลการแข่ง')}</span><b>${res.w}–${res.l}</b><small>${res.win ? t('ชนะ') : t('แพ้')}</small></div>${detail ? `<div class="kpi"><span>${t('แต้มรวม')}</span><b>${s.us}–${s.opp}</b><small>${t('เรา–คู่แข่ง')}</small></div>` : ''}${detail ? `<div class="kpi"><span>${t('ได้แต้มจากการเล่น')}</span><b>${s.win.kill + s.win.tip + s.win.ace + s.win.block}</b><small>${t('ตบ/หลอก/เอซ/บล็อก')}</small></div><div class="kpi"><span>${t('คู่แข่งให้แต้ม')}</span><b>${s.win.o_serve + s.win.o_atk + s.win.o_fault}</b><small>${t('จากความผิดพลาดของคู่แข่ง')}</small></div><div class="kpi"><span>${t('เสียแต้มจากเราเอง')}</span><b>${sumObj(s.lose) - s.lose.opp_kill - s.lose.opp_ace}</b><small>${t('ผิดพลาดของทีม')}</small></div>` : ''}</div>`;
  if (!detail) return `${kpi}<h3>${t('คะแนนรายเซ็ต')}</h3>${setTable}<p class="muted">${t('แมตช์นี้ใส่ผลย้อนหลัง จึงไม่มีสถิติรายแต้ม — ใช้ “บันทึกเกมสด” ในครั้งต่อไปเพื่อดูกราฟละเอียด')}</p>`;
  const winRows = WIN_KINDS.map((k) => ({ label: t(k.label), value: s.win[k.id], share: s.us ? Math.round(s.win[k.id] / s.us * 100) : 0 }));
  const loseRows = LOSE_KINDS.map((k) => ({ label: t(k.label), value: s.lose[k.id], share: s.opp ? Math.round(s.lose[k.id] / s.opp * 100) : 0 })).sort((a, b) => b.value - a.value);
  const pl = Object.values(s.players), top = pl.slice().sort((a, b) => b.pts - a.pts), errs = pl.slice().sort((a, b) => b.err - a.err);
  const insights = [];
  const bw = winRows.slice().sort((a, b) => b.value - a.value)[0], bl = loseRows[0];
  if (bw && bw.value) insights.push(t('ทีมได้แต้มจาก “{k}” มากที่สุด {n} แต้ม ({p}%)', { k: bw.label, n: bw.value, p: bw.share }));
  if (bl && bl.value) insights.push(t('เสียแต้มจาก “{k}” มากที่สุด {n} แต้ม ({p}%)', { k: bl.label, n: bl.value, p: bl.share }));
  if (top[0] && top[0].pts) insights.push(t('ผู้ทำแต้มสูงสุด: {n} {p} แต้ม', { n: nm(top[0].id), p: top[0].pts }));
  const gift = s.win.o_serve + s.win.o_atk + s.win.o_fault, own = sumObj(s.lose) - s.lose.opp_kill - s.lose.opp_ace;
  insights.push(t('คู่แข่งให้แต้มเรา {a} แต้ม ขณะที่เราให้แต้มคู่แข่ง {b} แต้ม', { a: gift, b: own }));
  const ptab = `<div class="scroll"><table><thead><tr><th>${t('ผู้เล่น')}</th><th>${t('ตบ')}</th><th>${t('หลอก')}</th><th>${t('เอซ')}</th><th>${t('บล็อก')}</th><th>${t('รวมแต้ม')}</th><th>${t('เสียแต้ม')}</th></tr></thead><tbody>${top.map((p) => `<tr><td><b>${esc(nm(p.id))}</b></td><td>${p.kill}</td><td>${p.tip}</td><td>${p.ace}</td><td>${p.block}</td><td><b>${p.pts}</b></td><td>${p.err}</td></tr>`).join('')}</tbody></table></div>`;
  return `${kpi}<div class="col" style="gap:8px">${insights.map((x) => `<div class="insight">${esc(x)}</div>`).join('')}</div>
<div class="vizgrid"><div class="viz"><h3>${t('เราได้แต้มจากอะไร')}</h3>${hbars(winRows.sort((a, b) => b.value - a.value), { color: 'var(--chart-us)', unit: '' })}</div>
<div class="viz"><h3>${t('เราเสียแต้มไปกับอะไร')}</h3>${hbars(loseRows, { color: 'var(--chart-opp)' })}</div>
<div class="viz"><h3>${t('ผู้ทำแต้มสูงสุด')}</h3>${hbars(top.map((p) => ({ label: nm(p.id), value: p.pts, tip: `${nm(p.id)}: ${t('ตบ')} ${p.kill}, ${t('หลอก')} ${p.tip}, ${t('เอซ')} ${p.ace}, ${t('บล็อก')} ${p.block}` })).slice(0, 8))}</div>
<div class="viz"><h3>${t('ผู้เล่นที่เสียแต้มมากสุด')}</h3>${hbars(errs.map((p) => ({ label: nm(p.id), value: p.err, tip: Object.keys(p.errs).map((k) => `${t(KIND_LABEL[k])} ${p.errs[k]}`).join(', ') })).slice(0, 8), { color: 'var(--chart-opp)' })}</div></div>
<div class="viz"><h3>${t('แต้มนำ–ตามตลอดเกม')}</h3>${momentumChart(s.momentum, r.sets)}</div>
<h3>${t('สถิติรายบุคคล')}</h3>${ptab}<h3>${t('คะแนนรายเซ็ต')}</h3>${setTable}`;
}
function season() {
  const recs = events().map((e) => recOf(e.id)).filter(Boolean);
  if (!recs.length) return `<section class="card"><div class="empty"><b>${t('ยังไม่มีแมตช์ที่จบแล้ว')}</b><span>${t('บันทึกเกมสดหรือใส่ผลย้อนหลังเพื่อดูภาพรวมทั้งฤดูกาล')}</span></div></section>`;
  const w = recs.filter((r) => result(r).win).length;
  return `<section class="card"><h2>${t('ภาพรวมทุกแมตช์')} (${recs.length}) · ${t('ชนะ')} ${w} ${t('แพ้')} ${recs.length - w}</h2>${dashboard(Object.assign(aggregate(recs), { sets: recs.flatMap((r) => r.sets || []), log: recs.flatMap((r) => r.log || []) }))}</section>`;
}

/* ---------- views ---------- */
function marks(d) { return { t: doc('sessions').filter((s) => s.date === d).length, m: events().filter((e) => e.date === d).length }; }
function row(e) {
  const r = recOf(e.id), res = r && result(r);
  return `<button class="bench" data-act="mtOpen" data-id="${e.id}" style="min-height:60px"><span class="num-badge" style="${res ? `background:${res.win ? 'var(--ok)' : 'var(--warn)'};color:#0B0F63` : ''}">${res ? res.w + '–' + res.l : '–'}</span><span><b>${esc(e.opp)}</b><br><small>${fmtDate(e.date)} ${timeLabel(e.time)} ${e.place ? '· ' + esc(e.place) : ''}</small></span></button>`;
}
function detail() {
  const m = M(), ev = events().find((e) => e.id === m.sel); if (!ev) { m.sel = null; return ''; }
  const r = recOf(ev.id), edit = can('schedule');
  const plan = (doc('plans')[ev.id] || {}).note || '';
  return `<section class="card"><div class="split"><button class="btn sm" data-act="mtBack">${ico('l', 16)} ${t('กลับ')}</button><span class="chips">${edit ? `<button class="btn sm" data-act="evEdit" data-id="${ev.id}">${ico('edit', 16)} ${t('แก้ไข')}</button><button class="btn sm danger" data-act="evDel" data-id="${ev.id}">${ico('del', 16)} ${t('ลบ')}</button>` : ''}</span></div>
<h2>${t('พบ {o}', { o: esc(ev.opp) })}</h2><p class="muted">${fmtDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} ${timeLabel(ev.time)} · ${esc(ev.place || '–')} · ${t(TYPES[ev.type] || '')}</p>
${r ? dashboard(r) : `<div class="empty"><b>${t('ยังไม่มีผลการแข่ง')}</b>${can('stats') ? `<div class="chips"><button class="btn main" data-act="liveStart" data-id="${ev.id}">${t('เริ่มบันทึกเกมสด')}</button><button class="btn" data-act="pastRes" data-id="${ev.id}">${t('ใส่ผลย้อนหลัง')}</button></div>` : ''}</div>`}
${r && can('stats') ? `<button class="btn sm danger" data-act="recDel" data-id="${ev.id}">${t('ลบผลการแข่งนี้')}</button>` : ''}
${edit && !r ? `<label class="fld">${t('แผนการเล่น/หมายเหตุของโค้ช (ผู้เล่นไม่เห็น)')}<textarea class="txt" data-ch="planNote" data-id="${ev.id}">${esc(plan)}</textarea></label>` : ''}</section>`;
}
export function render() {
  const m = M(), st = calState('match'), edit = can('schedule');
  const tabs = [['list', 'แมตช์'], ['live', 'บันทึกเกมสด'], ['season', 'ภาพรวมฤดูกาล']].filter((x) => x[0] !== 'live' || can('stats'));
  const hero = `<section class="hero"><div><h1>${t('แมตช์')}</h1><p>${t('ตารางแข่ง บันทึกคะแนนรายแต้ม และแดชบอร์ดสรุปผล')}</p></div>${edit ? `<button class="btn main" data-act="evAdd" data-d="${st.sel}">${ico('plus', 18)} ${t('เพิ่มแมตช์')}</button>` : ''}</section>`;
  const tb = `<div class="chips" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" data-fk="mt-${k}" data-act="mtTab" data-v="${k}" aria-selected="${m.tab === k}">${t(l)}${k === 'live' && doc('live').eventId ? ' •' : ''}</button>`).join('')}</div>`;
  let body;
  if (m.sel) body = detail();
  else if (m.tab === 'live') body = liveView();
  else if (m.tab === 'season') body = season();
  else {
    const day = events().filter((e) => e.date === st.sel), all = sortBy(events(), (e) => e.date + (e.time || ''));
    const up = all.filter((e) => !recOf(e.id)), past = all.filter((e) => recOf(e.id)).reverse();
    body = `<div class="row"><section class="card" style="flex:2 1 420px">${calendar('match', marks)}</section><section class="card" style="flex:1 1 300px"><h2>${fmtDate(st.sel, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>${day.length ? day.map(row).join('') : `<div class="empty"><b>${t('ไม่มีแมตช์ในวันนี้')}</b>${edit ? `<button class="btn main" data-act="evAdd" data-d="${st.sel}">${ico('plus', 18)} ${t('เพิ่มแมตช์วันนี้')}</button>` : ''}</div>`}</section></div>
<div class="row"><section class="card" style="flex:1 1 320px"><h2>${t('กำลังจะแข่ง / ยังไม่มีผล')}</h2>${up.length ? up.map(row).join('') : `<p class="muted">${t('ไม่มีรายการ')}</p>`}</section><section class="card" style="flex:1 1 320px"><h2>${t('แมตช์ที่ผ่านมา — กดเพื่อดูสรุป')}</h2>${past.length ? past.map(row).join('') : `<p class="muted">${t('ยังไม่มีผลการแข่ง')}</p>`}</section></div>`;
  }
  return hero + (m.sel ? '' : tb) + body;
}
export const actions = {
  mtTab(d) { M().tab = d.v; M().sel = null; },
  mtOpen(d) { M().sel = d.id; },
  mtBack() { M().sel = null; },
  evAdd(d) { evDlg(null, d.d); return false; },
  evEdit(d) { evDlg(events().find((e) => e.id === d.id)); return false; },
  evDel(d) {
    const e = events().find((x) => x.id === d.id);
    openDlg({ title: t('ลบแมตช์กับ {o}?', { o: e.opp }), danger: true, ok: t('ลบ'), body: `<p>${t('ผลการแข่งของแมตช์นี้ (ถ้ามี) จะยังเก็บไว้ในระบบ แต่จะไม่แสดงในรายการ')}</p>`, onSubmit() { events().splice(events().indexOf(e), 1); commit('events'); M().sel = null; } });
    return false;
  },
  pastRes(d) { pastDlg(events().find((e) => e.id === d.id)); return false; },
  recDel(d) {
    openDlg({ title: t('ลบผลการแข่ง?'), danger: true, ok: t('ลบ'), body: `<p>${t('สถิติรายแต้มของแมตช์นี้จะหายไป')}</p>`, onSubmit() { S.docs['rec:' + d.id] = { eventId: d.id, sets: [], log: [], deleted: true }; commit('rec:' + d.id); } });
    return false;
  },
  liveStart(d) {
    const live = doc('live');
    if (live.eventId && live.eventId !== d.id && live.log.length) { toast(t('มีเกมสดอื่นค้างอยู่ — จบหรือยกเลิกก่อน'), 'bad'); return; }
    S.docs.live = Object.assign(DEFAULTS.live(), { eventId: d.id, bestOf: 5 }); commit('live'); M().tab = 'live'; M().sel = null;
  },
  livePid(d) { M().pid = M().pid === d.id ? null : d.id; },
  livePt(d) {
    const k = (d.who === 'us' ? WIN_KINDS : LOSE_KINDS).find((x) => x.id === d.k), m = M();
    if (k.pl && !m.pid) { toast(t('เลือกผู้เล่นก่อน'), 'bad'); return; }
    addPoint(d.who, d.k, k.pl ? m.pid : null);
  },
  liveUndo() { undo(); },
  liveTo() { const l = doc('live'); l.log.push({ k: 'to', set: l.set }); commit('live'); },
  liveSub() { const l = doc('live'); l.log.push({ k: 'sub', set: l.set }); commit('live'); },
  liveEndSet() { const l = doc('live'); if (l.a + l.b === 0) { toast(t('ยังไม่มีแต้มในเซ็ตนี้'), 'bad'); return; } l.sets.push({ a: l.a, b: l.b }); l.set++; l.a = 0; l.b = 0; commit('live'); },
  liveFinish() {
    const l = doc('live');
    if (!l.sets.length && l.a + l.b === 0) { toast(t('ยังไม่มีคะแนน'), 'bad'); return false; }
    openDlg({ title: t('จบแมตช์และบันทึกผล?'), ok: t('บันทึก'), body: `<p>${t('ระบบจะบันทึกสถิติทั้งหมดและเปิดแดชบอร์ดสรุปให้')}</p>`, onSubmit() { finish(l); } });
    return false;
  },
  liveCancel() { openDlg({ title: t('ยกเลิกเกมสด?'), danger: true, ok: t('ยกเลิกและทิ้งข้อมูล'), body: `<p>${t('คะแนนที่บันทึกไว้ในเกมนี้จะหายไป')}</p>`, onSubmit() { S.docs.live = DEFAULTS.live(); commit('live'); } }); return false; }
};
export const inputs = {
  planNote(d, el) { const p = doc('plans'); p[d.id] = Object.assign(p[d.id] || {}, { note: el.value }); commit('plans'); return false; }
};
