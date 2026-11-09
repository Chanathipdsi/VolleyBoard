import { t } from '../i18n.js';
import { esc, POS, STATUS, STATUS_COLOR, suggestCode, sortBy } from '../util.js';
import { S, UI, can, role, players, assistants, byId, api, errText, load, toast } from '../store.js';
import { ico, openDlg, closeDlg, copyText } from '../ui.js';
import { POS_TH } from '../rules.js';

const R = () => (UI.roster = UI.roster || { tab: 'player' });
const ST_TH = { active: 'พร้อมเล่น', injured: 'บาดเจ็บ', unavailable: 'ไม่พร้อม' };
const SAMPLE = [['สมชาย ใจดี', 'ชาย', 'S'], ['วิชัย เก่งกาจ', 'วิชัย', 'OH'], ['ณัฐพล รักกีฬา', 'พล', 'OH'], ['ธนากร สู้ไม่ถอย', 'ธน', 'MB'], ['กิตติ มั่นใจ', 'กิต', 'MB'], ['อนุชา ว่องไว', 'ชา', 'OP'], ['ปิยะ รับแม่น', 'ปิยะ', 'L'], ['ภานุ ตบแรง', 'ภานุ', 'OH'], ['ศุภกร บล็อกเก่ง', 'กร', 'MB'], ['เจษฎา เซตสวย', 'เจ', 'S']];

function nextNumber() { const used = new Set(players().map((p) => p.data.n)); for (let i = 1; i < 100; i++) if (!used.has(i)) return i; return 0; }
function form(m, kind) {
  const pl = kind === 'player', d = (m && m.data) || {};
  const code = m ? m.code : suggestCode(kind);
  return `<label class="fld">${t('ชื่อ-นามสกุล')}<input class="txt" name="name" value="${esc(m ? m.name : '')}" required></label>
<div class="fgrid"><label class="fld">${t('ชื่อเล่น')}<input class="txt" name="nick" value="${esc(m ? m.nick : '')}" maxlength="24"></label>
<label class="fld">${t('เบอร์โทร')}<input class="txt" name="phone" type="tel" value="${esc(m ? m.phone : '')}"></label></div>
<label class="fld">${t('อีเมล (ไม่บังคับ)')}<input class="txt" name="email" type="email" value="${esc(m ? m.email : '')}"></label>
${pl ? `<div class="fgrid"><label class="fld">${t('เบอร์เสื้อ')}<input class="txt" name="n" type="number" min="0" max="99" value="${m ? d.n || '' : nextNumber()}"></label>
<label class="fld">${t('ตำแหน่ง')}<select class="txt" name="pos">${POS.map((p) => `<option value="${p}" ${d.pos === p ? 'selected' : ''}>${p} · ${t(POS_TH[p])}</option>`).join('')}</select></label></div>
<div class="fgrid"><label class="fld">${t('สถานะ')}<select class="txt" name="st">${STATUS.map((s) => `<option value="${s}" ${(d.st || 'active') === s ? 'selected' : ''}>${t(ST_TH[s])}</option>`).join('')}</select></label>
<label class="fld">${t('กลุ่ม')}<select class="txt" name="grp"><option value="starter" ${d.grp === 'starter' ? 'selected' : ''}>${t('ตัวจริง')}</option><option value="bench" ${d.grp !== 'starter' ? 'selected' : ''}>${t('ตัวสำรอง')}</option></select></label></div>` : ''}
<label class="fld">${t('ไอดีประจำตัว (ใช้เข้าสู่ระบบ)')}<span class="idrow"><input class="txt code" id="f-code" name="code" value="${esc(code)}" autocapitalize="characters" spellcheck="false"><button type="button" class="icon" data-act="rosterDice" data-kind="${kind}" aria-label="${t('สุ่มไอดีใหม่')}">${ico('dice', 20)}</button></span><span class="hintline">${t('แก้ไขได้ ใช้ A–Z 0–9 และ - (4–24 ตัว) ห้ามซ้ำกับคนอื่นในทีม')}</span></label>`;
}
function payload(fd, kind) {
  const o = { name: (fd.name || '').trim(), nick: (fd.nick || '').trim(), phone: (fd.phone || '').trim(), email: (fd.email || '').trim(), code: (fd.code || '').trim() };
  if (kind === 'player') o.data = { n: parseInt(fd.n, 10) || 0, pos: fd.pos, st: fd.st, grp: fd.grp };
  return o;
}
function editDlg(m, kind) {
  openDlg({
    title: m ? t('แก้ไข: {n}', { n: m.name }) : (kind === 'player' ? t('เพิ่มผู้เล่น') : t('เพิ่มผู้ช่วยโค้ช')), ok: m ? t('บันทึก') : t('เพิ่ม'), body: form(m, kind),
    async onSubmit(fd) {
      const b = payload(fd, kind);
      if (!b.name) return errText('bad_name');
      const r = m ? await api('PATCH', '/members/' + m.id, b) : await api('POST', '/members', Object.assign({ role: kind }, b));
      if (!r.ok) return errText(r.data.error);
      await load(); toast(m ? t('บันทึกแล้ว') : t('เพิ่มแล้ว — ไอดี: {c}', { c: b.code }));
    }
  });
}
function infoDlg(m) {
  const txt = `VolleyBoard\n${t('ไอดีทีม')}: ${S.team.code}\n${t('ไอดีประจำตัว')}: ${m.code}`;
  openDlg({ title: t('ข้อมูลเข้าสู่ระบบของ {n}', { n: m.name }), noCancel: true, ok: t('ปิด'), onSubmit: () => null, body: `<pre class="code" style="white-space:pre-wrap;background:var(--soft);padding:12px;border-radius:12px;margin:0">${esc(txt)}</pre><button type="button" class="btn" data-act="copyInfo" data-t="${esc(txt)}">${ico('copy', 18)} ${t('คัดลอก')}</button><p class="muted">${t('ส่งให้เจ้าตัวทาง LINE/ข้อความ — เข้าที่หน้าแรก แท็บ “ผู้ช่วยโค้ช / ผู้เล่น”')}</p>` });
}
function pick(id) { return byId(id); }

export function render() {
  const r = R(), coach = can('members'), isPl = r.tab === 'player';
  const list = isPl ? players() : sortBy(assistants(), (m) => m.name);
  const head = `<section class="hero"><div><h1>${t('ทีม {n}', { n: esc(S.team.name) })}</h1><p>${esc(S.team.country)} · ${t('ไอดีทีม')} <span class="code"><b>${esc(S.team.code)}</b></span></p></div>${coach ? `<div class="chips"><button class="btn main" data-act="rosterAdd" data-kind="${r.tab}">${ico('plus', 18)} ${isPl ? t('เพิ่มผู้เล่น') : t('เพิ่มผู้ช่วยโค้ช')}</button></div>` : ''}</section>`;
  const tabs = `<div class="chips" role="tablist"><button class="tab" role="tab" data-fk="rt-p" data-act="rosterTab" data-v="player" aria-selected="${isPl}">${t('ผู้เล่น')} (${players().length})</button><button class="tab" role="tab" data-fk="rt-a" data-act="rosterTab" data-v="assistant" aria-selected="${!isPl}">${t('ผู้ช่วยโค้ช')} (${assistants().length})</button></div>`;
  let body;
  if (!list.length) body = `<div class="empty"><b>${isPl ? t('ยังไม่มีผู้เล่น') : t('ยังไม่มีผู้ช่วยโค้ช')}</b><span>${coach ? t('กดปุ่ม “เพิ่ม” ระบบจะสร้างไอดีประจำตัวให้อัตโนมัติ แก้ไขได้') : t('โค้ชยังไม่ได้เพิ่มรายชื่อ')}</span>${coach ? `<button class="btn main" data-act="rosterAdd" data-kind="${r.tab}">${ico('plus', 18)} ${t('เพิ่ม')}</button>${isPl ? `<button class="btn" data-act="rosterSample">${t('เพิ่มผู้เล่นตัวอย่าง 10 คน')}</button>` : ''}` : ''}</div>`;
  else body = `<div class="scroll"><table><thead><tr>${isPl ? `<th>#</th>` : ''}<th>${t('ชื่อ')}</th>${isPl ? `<th>${t('ตำแหน่ง')}</th><th>${t('สถานะ')}</th>` : ''}<th>${t('เบอร์โทร')}</th>${coach || role() !== 'coach' ? `<th>${t('ไอดี')}</th>` : ''}${coach ? `<th><span class="sr">${t('จัดการ')}</span></th>` : ''}</tr></thead><tbody>${list.map((m) => {
    const d = m.data || {}, self = S.me.id === m.id;
    return `<tr>${isPl ? `<td><span class="num-badge" style="width:34px;height:34px;flex-basis:34px;font-size:1rem">${d.n || '–'}</span></td>` : ''}<td class="wrap"><b>${esc(m.name)}</b>${m.nick && m.nick !== m.name ? `<br><small class="muted">${esc(m.nick)}</small>` : ''}${self ? ` <span class="pill" style="background:var(--ok)">${t('คุณ')}</span>` : ''}</td>${isPl ? `<td>${d.pos ? `${d.pos} · ${t(POS_TH[d.pos])}` : '–'}</td><td><span class="pill" style="background:${STATUS_COLOR[d.st || 'active']}">${t(ST_TH[d.st || 'active'])}</span></td>` : ''}<td>${m.phone ? esc(m.phone) : '–'}</td>${coach || role() !== 'coach' ? `<td class="code">${m.code ? esc(m.code) : '–'}</td>` : ''}${coach ? `<td style="white-space:nowrap"><button class="icon" data-act="rosterInfo" data-id="${m.id}" aria-label="${t('ข้อมูลเข้าสู่ระบบ')}">${ico('copy', 18)}</button> <button class="icon" data-act="rosterEdit" data-id="${m.id}" aria-label="${t('แก้ไข')}">${ico('edit', 18)}</button> <button class="icon" data-act="rosterDel" data-id="${m.id}" aria-label="${t('ลบ')}">${ico('del', 18)}</button></td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
  return `${head}<section class="card">${tabs}${body}${coach && list.length ? `<p class="muted">${t('ผู้เล่นเห็นเฉพาะข้อมูลติดต่อและไอดีของตัวเอง ผู้ช่วยโค้ชเห็นเบอร์โทรแต่ไม่เห็นไอดี/อีเมลของผู้อื่น')}</p>` : ''}</section>`;
}
export const actions = {
  rosterTab(d) { R().tab = d.v; },
  rosterAdd(d) { editDlg(null, d.kind); return false; },
  rosterEdit(d) { const m = pick(d.id); if (m) editDlg(m, m.role); return false; },
  rosterInfo(d) { const m = pick(d.id); if (m) infoDlg(m); return false; },
  copyInfo(d) { copyText(d.t); return false; },
  rosterDice(d) { const i = document.getElementById('f-code'); if (i) i.value = suggestCode(d.kind); return false; },
  rosterDel(d) {
    const m = pick(d.id); if (!m) return false;
    openDlg({ title: t('ลบ {n}?', { n: m.name }), danger: true, ok: t('ลบ'), body: `<p>${t('ผู้ใช้นี้จะเข้าสู่ระบบไม่ได้อีก และถูกนำออกจากสนาม/สถิติรายคน (สถิติทีมยังอยู่)')}</p>`, async onSubmit() { const r = await api('DELETE', '/members/' + m.id); if (!r.ok) return errText(r.data.error); await load(); toast(t('ลบแล้ว')); } });
    return false;
  },
  async rosterSample() {
    const items = SAMPLE.map((s, i) => ({ role: 'player', name: s[0], nick: s[1], phone: '', data: { n: i + 1, pos: s[2], st: 'active', grp: i < 6 ? 'starter' : 'bench' } }));
    const r = await api('POST', '/members', { items });
    if (!r.ok) toast(errText(r.data.error), 'bad'); else { await load(); toast(t('เพิ่มผู้เล่นตัวอย่างแล้ว — แก้ไขชื่อจริงได้')); }
  }
};
