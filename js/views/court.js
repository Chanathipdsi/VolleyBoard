import { t } from '../i18n.js';
import { esc, clamp } from '../util.js';
import { S, UI, can, doc, commit, players, byId, shortName } from '../store.js';
import { ico } from '../ui.js';
import { ZONES, NEXT, PREV, FORMS, ZONE_NAME, posOf, check, CASES, SUGGESTIONS, answer, isFront, POS_TH, posLabel } from '../rules.js';

const C = () => (UI.ct = UI.ct || { phase: 'serve', demo: null, sel: null, bench: null, chat: [], free: null, moved: false });
const court = () => doc('court');
const FAKE = [['S', 1], ['OH', 2], ['MB', 3], ['OP', 4], ['OH', 5], ['MB', 6]];

function demoLineup(c) {
  const lu = {}; ZONES.forEach((z, i) => { lu[z] = 'demo' + z; });
  if (c.libero) lu[c.libero] = 'demoL';
  return lu;
}
function who(id) {
  if (id === 'demoL') return { n: 'L', name: t('ลิเบอโร'), pos: 'L' };
  if (/^demo\d$/.test(id)) { const z = +id.slice(4), i = ZONES.indexOf(z); return { n: FAKE[i][1] + 10, name: t('ผู้เล่น {n}', { n: z }), pos: FAKE[i][0] }; }
  const m = byId(id); return m ? { n: m.data.n || '–', name: shortName(m), pos: m.data.pos } : null;
}
function state() {
  const c = C(), cr = court();
  const demo = c.demo ? CASES.find((x) => x.id === c.demo) : null;
  const lineup = demo ? demoLineup(demo) : cr.lineup;
  let pos;
  if (demo) pos = demo.pos;
  else if (c.phase === 'free') { c.free = c.free || posOf(cr, cr.formation); pos = c.free; } else pos = posOf(cr, cr.formation);
  return { demo, lineup, pos, res: c.phase === 'serve' || demo ? check(pos, lineup, who) : { faults: [], bad: {} } };
}

export function render() {
  const c = C(), cr = court(), edit = can('lineup'), s = state(), onCourt = new Set(ZONES.map((z) => cr.lineup[z]).filter(Boolean));
  const bench = players().filter((p) => !onCourt.has(p.id));
  const tok = ZONES.map((z) => {
    const id = s.lineup[z], p = id ? who(id) : null, [x, y] = s.pos[z], bad = s.res.bad[z];
    const lib = p && p.pos === 'L';
    return `<button class="tok${c.sel === z ? ' sel' : ''}" data-z="${z}" data-act="ctTok" data-fk="tk${z}" style="left:${x}%;top:${y}%" ${s.demo || !edit ? '' : ''} aria-label="${t('โซน {z}', { z })}: ${p ? esc(p.name) : t('ว่าง')}${bad ? ' — ' + t('ยืนผิดตำแหน่ง') : ''}">
<span class="disc"><span class="n" style="${p ? (lib ? 'background:#FFD23F;color:#0B0F63' : 'background:#fff;color:#1A20B8') : 'background:transparent;border:2px dashed #fff;color:#fff'}${c.sel === z ? ';outline:3px solid #FFD23F;outline-offset:2px' : ''}${bad ? ';box-shadow:0 0 0 3px #FFD23F' : ''}">${p ? esc(p.n) : '+'}</span><span class="zone">${z}</span>${bad ? '<span class="warnmark" aria-hidden="true">!</span>' : ''}</span>${p ? `<span class="tname">${p.pos ? `<b>${esc(p.pos)}</b> ` : ''}${esc(p.name)}</span>` : ''}</button>`;
  }).join('');
  const ghosts = ZONES.map((z) => `<span class="ghost" style="left:${s.pos[z][0]}%;top:${s.pos[z][1]}%">${z}</span>`).join('');
  const forms = Object.keys(FORMS).map((f) => `<button class="tab" data-fk="fm${f}" data-act="ctForm" data-v="${f}" aria-pressed="${cr.formation === f}" ${c.phase === 'free' || s.demo ? 'disabled' : ''}>${t(FORMS[f].label)}</button>`).join('');
  const phase = `<div class="chips" role="group" aria-label="${t('ช่วงของเกม')}"><button class="tab" data-fk="ph1" data-act="ctPhase" data-v="serve" aria-pressed="${c.phase === 'serve'}">${t('ตอนเสิร์ฟ (ตรวจกติกา)')}</button><button class="tab" data-fk="ph2" data-act="ctPhase" data-v="free" aria-pressed="${c.phase === 'free'}">${t('หลังเสิร์ฟ (ลากอิสระ)')}</button></div>`;
  const faults = s.res.faults.length ? s.res.faults.map((f) => `<div class="fault"><b>⚠ ${esc(f.title)}</b>${t('เพราะ')}: ${esc(f.why)}<br><i>${esc(f.fix)}</i></div>`).join('') : `<div class="ok">${c.phase === 'free' && !s.demo ? t('โหมดหลังเสิร์ฟ: ผู้เล่นยืนอิสระ ไม่ตรวจกติกา') : (Object.values(s.lineup).filter(Boolean).length < 6 && !s.demo ? t('ยังไม่ครบ 6 คน — ตรวจเท่าที่มี ยังไม่พบจุดผิด') : t('ตำแหน่งถูกต้องตามกติกา'))}</div>`;
  const cases = CASES.map((x) => `<button class="tab" data-fk="cs${x.id}" data-act="ctCase" data-v="${x.id}" aria-pressed="${c.demo === x.id}" title="${esc(t(x.desc))}">${t(x.title)}</button>`).join('');
  const chat = c.chat.map((m) => `<div class="msg ${m.me ? 'me' : 'bot'}">${esc(m.text)}</div>`).join('');
  return `<section class="hero"><div><h1>${t('กระดานสนาม')}</h1><p>${edit ? t('ลากผู้เล่นไปยืนตามต้องการ ระบบเตือนทันทีถ้ายืนผิดกติกา พร้อมเหตุผล') : t('ดูตำแหน่งที่โค้ชจัดไว้ — เฉพาะโค้ชที่แก้ไขได้')}</p></div></section>
${s.demo ? `<div class="demo-banner"><span>${t('กำลังดูตัวอย่าง: {n} (ไม่บันทึก)', { n: t(s.demo.title) })}</span><button class="btn sm" data-act="ctCase" data-v="${s.demo.id}">${t('ออกจากตัวอย่าง')}</button></div>` : ''}
<div class="row"><section class="card" style="flex:2 1 440px">${phase}<div class="chips" role="group" aria-label="${t('ฟอร์เมชัน')}">${forms}</div>
<div class="court" id="court"><div class="floor"></div><div class="net"></div><span class="lbl" style="left:50%;top:3%;transform:translateX(-50%)">${t('ตาข่าย')}</span>${ghosts}${tok}</div>
<div class="chips">${edit && !s.demo ? `<button class="btn sm" data-act="ctRot" data-v="1">${ico('cw', 16)} ${t('หมุนตามเข็ม')}</button><button class="btn sm" data-act="ctRot" data-v="-1">${t('หมุนย้อน')}</button><button class="btn sm" data-act="ctOut" ${c.sel ? '' : 'disabled'}>${t('นำออกจากสนาม')}</button><button class="btn sm" data-act="ctReset">${t('รีเซ็ตตำแหน่ง')}</button><button class="btn sm" data-act="ctAuto">${t('จัดตัวจริงอัตโนมัติ')}</button>` : ''}</div>
<div class="faultbox" aria-live="polite">${faults}</div></section>
<div class="col" style="flex:1 1 320px"><section class="card"><h2>${t('ผู้เล่นสำรอง / นอกสนาม')}</h2>${edit ? `<p class="muted">${t('เลือกผู้เล่น แล้วแตะวงกลมในสนามเพื่อใส่')}</p>` : ''}<div class="bgrid">${bench.map((p) => `<button class="bench" data-fk="bn${p.id}" data-act="ctBench" data-id="${p.id}" aria-pressed="${c.bench === p.id}" ${edit && !s.demo ? '' : 'disabled'}><span class="num-badge">${p.data.n || '–'}</span><span><b>${esc(shortName(p))}</b><br><small>${p.data.pos ? posLabel(p.data.pos) : ''}</small></span></button>`).join('') || `<p class="muted">${players().length ? t('ทุกคนอยู่ในสนามแล้ว') : t('ยังไม่มีผู้เล่น — เพิ่มในหน้า “ผู้เล่น”')}</p>`}</div></section>
<section class="card"><h2>${ico('spark', 20)} ${t('ผู้ช่วยกติกา')}</h2><p class="muted">${t('ตอบจากกติกาที่ตั้งไว้ในระบบ (ไม่ใช่ AI สร้างข้อความอิสระ) จึงตอบได้ตรงและฟรี')}</p><div class="chat" id="chat" aria-live="polite">${chat || `<div class="msg bot">${t('ถามได้เลย เช่น “ทำไมตอนนี้ผิดตำแหน่ง” หรือ “โซน 3 ต้องยืนยังไง”')}</div>`}</div>
<div class="chips">${SUGGESTIONS.map((q) => `<button class="tab" data-act="ctAsk" data-q="${esc(t(q))}">${t(q)}</button>`).join('')}</div>
<div class="idrow"><input class="txt" id="ct-q" data-enter="ctAsk" placeholder="${t('พิมพ์คำถามเกี่ยวกับกติกา')}" aria-label="${t('คำถาม')}"><button class="icon" data-act="ctAsk" aria-label="${t('ส่ง')}">${ico('send', 20)}</button></div></section></div></div>
<section class="card"><h2>${t('ตัวอย่างการยืนผิด / ถูก')}</h2><p class="muted">${t('กดเพื่อดูตัวอย่างบนสนาม ระบบจะอธิบายเหตุผล')}</p><div class="chips">${cases}</div></section>`;
}

export function after() {
  const el = document.getElementById('court'); if (!el) return;
  const chat = document.getElementById('chat'); if (chat) chat.scrollTop = chat.scrollHeight;
  if (!can('lineup')) return;
  el.querySelectorAll('.tok').forEach((b) => {
    const z = +b.dataset.z;
    b.addEventListener('pointerdown', (e) => {
      if (C().demo) return;
      const r = el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY; let moved = false;
      b.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        moved = true; C().moved = true; b.classList.add('drag');
        const x = clamp((ev.clientX - r.left) / r.width * 100, 7, 93), y = clamp((ev.clientY - r.top) / r.height * 100, 9, 95);
        b.style.left = x + '%'; b.style.top = y + '%'; b._p = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      };
      const up = () => {
        b.removeEventListener('pointermove', mv); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); b.classList.remove('drag');
        if (moved && b._p) { setPos(z, b._p); setTimeout(() => { C().moved = false; }, 0); document.dispatchEvent(new CustomEvent('vb-refresh')); }
      };
      b.addEventListener('pointermove', mv); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
    b.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key]; if (!d || C().demo) return;
      e.preventDefault(); const p = state().pos[z]; setPos(z, [clamp(p[0] + d[0], 7, 93), clamp(p[1] + d[1], 9, 95)]); document.dispatchEvent(new CustomEvent('vb-refresh'));
    });
  });
}
function setPos(z, p) {
  const c = C(), cr = court();
  if (c.phase === 'free') { c.free = c.free || posOf(cr, cr.formation); c.free[z] = p; return; }
  cr.custom = cr.custom || {}; (cr.custom[cr.formation] = cr.custom[cr.formation] || {})[z] = p; commit('court');
}
function ctx() { const s = state(); return { faults: s.res.faults, lineup: s.lineup, who, phase: C().phase === 'free' && !s.demo ? 'free' : 'serve' }; }
function ask(q) { const c = C(); q = (q || '').trim(); if (!q) return; c.chat.push({ me: true, text: q }, { me: false, text: answer(q, ctx()) }); if (c.chat.length > 40) c.chat.splice(0, 2); }

export const actions = {
  ctTok(d) {
    const c = C(), cr = court(), z = +d.z;
    if (c.moved || c.demo || !can('lineup')) return false;
    if (c.bench) { cr.lineup[z] = c.bench; c.bench = null; commit('court'); return; }
    if (c.sel && c.sel !== z) { const a = cr.lineup[c.sel]; cr.lineup[c.sel] = cr.lineup[z]; cr.lineup[z] = a; c.sel = null; commit('court'); return; }
    c.sel = c.sel === z ? null : z;
  },
  ctBench(d) { const c = C(); c.bench = c.bench === d.id ? null : d.id; c.sel = null; },
  ctOut() { const c = C(); if (c.sel) { court().lineup[c.sel] = null; c.sel = null; commit('court'); } },
  ctForm(d) { court().formation = d.v; commit('court'); C().free = null; },
  ctPhase(d) { const c = C(); c.phase = d.v; c.free = null; },
  ctCase(d) { const c = C(); c.demo = c.demo === d.v ? null : d.v; c.sel = null; c.bench = null; },
  ctRot(d) {
    const cr = court(), n = {}; ZONES.forEach((z) => { n[(+d.v > 0 ? NEXT : PREV)[z]] = cr.lineup[z]; }); cr.lineup = n; cr.rot = ((cr.rot + (+d.v) + 5) % 6) + 1; commit('court');
  },
  ctReset() { const cr = court(); delete (cr.custom || {})[cr.formation]; commit('court'); C().free = null; },
  ctAuto() {
    const cr = court(), used = new Set(Object.values(cr.lineup).filter(Boolean));
    const pool = players().filter((p) => !used.has(p.id) && (p.data.st || 'active') === 'active' && p.data.pos !== 'L').sort((a, b) => (a.data.grp === 'starter' ? 0 : 1) - (b.data.grp === 'starter' ? 0 : 1));
    ZONES.forEach((z) => { if (!cr.lineup[z] && pool.length) cr.lineup[z] = pool.shift().id; }); commit('court');
  },
  ctAsk(d) { const inp = document.getElementById('ct-q'); const q = d.q || (inp ? inp.value : ''); if (!d.q && inp) inp.value = ''; ask(q); }
};
