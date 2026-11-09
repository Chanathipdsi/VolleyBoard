import { t } from '../i18n.js';
import { esc } from '../util.js';
import { S, UI, P, can, api, errText, load, setPrefs, toast, doc, resetSession, stopPolling } from '../store.js';
import { ico, openDlg, copyText } from '../ui.js';

const ACC = { coral: '#FF6B4A', amber: '#FFB020', teal: '#14B8A6', pink: '#F472B6' };
const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button class="tab" data-fk="p-${k}-${v}" data-act="setPref" data-k="${k}" data-v="${v}" aria-pressed="${String(P[k]) === String(v)}">${l}</button>`).join('')}</div>`;
const sw = (k, label, hint) => `<div class="switch"><div><b>${label}</b>${hint ? `<span class="muted">${hint}</span>` : ''}</div><input type="checkbox" data-fk="p-${k}" data-ch="togPref" data-k="${k}" ${P[k] ? 'checked' : ''} aria-label="${label}"></div>`;

export function render() {
  const me = S.me, coach = can('team');
  return `<section class="hero"><div><h1>${t('ตั้งค่า')}</h1><p>${t('ปรับข้อมูล หน้าตา และภาษาให้ใช้งานสบายที่สุด')}</p></div></section>
<div class="row"><section class="card" style="flex:1 1 340px"><h2>${t('ข้อมูลของฉัน')}</h2>
<label class="fld">${t('ชื่อ-นามสกุล')}<input class="txt" id="pf-name" value="${esc(me.name)}"></label><div class="fgrid"><label class="fld">${t('ชื่อเล่น')}<input class="txt" id="pf-nick" value="${esc(me.nick)}"></label><label class="fld">${t('เบอร์โทร')}<input class="txt" id="pf-phone" type="tel" value="${esc(me.phone || '')}"></label></div>
${me.role === 'coach' ? `<label class="fld">${t('อีเมล (ใช้เข้าสู่ระบบ)')}<input class="txt" value="${esc(me.email)}" disabled></label>` : `<label class="fld">${t('ไอดีประจำตัว')}<input class="txt code" value="${esc(me.code)}" disabled><span class="hintline">${t('ขอให้โค้ชเปลี่ยนให้ได้ถ้าต้องการ')}</span></label>`}
<button class="btn main" data-act="saveProfile">${t('บันทึกข้อมูล')}</button></section>
${coach ? `<section class="card" style="flex:1 1 340px"><h2>${t('ทีม')}</h2><label class="fld">${t('ชื่อทีม')}<input class="txt" id="tm-name" value="${esc(S.team.name)}"></label><label class="fld">${t('ประเทศ')}<input class="txt" id="tm-country" value="${esc(S.team.country)}"></label>
<label class="fld">${t('ไอดีทีม (ใช้เข้าสู่ระบบ ห้ามซ้ำกับทีมอื่น)')}<span class="idrow"><input class="txt code" id="tm-code" value="${esc(S.team.code)}" autocapitalize="characters"><button class="icon" data-act="copyTeam" aria-label="${t('คัดลอก')}">${ico('copy', 18)}</button></span></label>
<button class="btn main" data-act="saveTeam">${t('บันทึกทีม')}</button></section>` : `<section class="card" style="flex:1 1 340px"><h2>${t('ทีม')}</h2><dl class="dl"><div><dt>${t('ชื่อทีม')}</dt><dd>${esc(S.team.name)}</dd></div><div><dt>${t('ประเทศ')}</dt><dd>${esc(S.team.country)}</dd></div></dl></section>`}</div>
<section class="card"><h2>${t('หน้าตาและการใช้งาน')}</h2>
<div class="setrow"><div><b>${t('ภาษา')}</b></div>${seg('lang', [['th', 'ไทย'], ['en', 'English']])}</div>
<div class="setrow"><div><b>${t('โหมดสี')}</b></div>${seg('theme', [['system', t('ตามอุปกรณ์')], ['light', t('สว่าง')], ['dark', t('มืด')]])}</div>
<div class="setrow"><div><b>${t('สีเน้น')}</b></div><div class="seg">${Object.keys(ACC).map((k) => `<button class="swatch" data-fk="ac${k}" data-act="setPref" data-k="accent" data-v="${k}" aria-pressed="${P.accent === k}" aria-label="${k}" style="background:${ACC[k]}"></button>`).join('')}</div></div>
<div class="setrow"><div><b>${t('ขนาดตัวอักษร')}</b></div>${seg('size', [['s', t('เล็ก')], ['m', t('กลาง')], ['l', t('ใหญ่')]])}</div>
<div class="setrow"><div><b>${t('เริ่มสัปดาห์ในปฏิทิน')}</b></div>${seg('weekStart', [['0', t('วันอาทิตย์')], ['1', t('วันจันทร์')]])}</div>
${sw('contrast', t('ความคมชัดสูง'))}${sw('compact', t('แสดงแบบกระชับ'))}${sw('reduceMotion', t('ลดการเคลื่อนไหว'))}${sw('buddhist', t('ใช้ปีพุทธศักราช (ภาษาไทย)'))}</section>
<div class="row"><section class="card" style="flex:1 1 340px"><h2>${t('เกี่ยวกับ / ช่วยเหลือ')}</h2><p>VolleyBoard 2.0</p>
<p class="muted">${t('โค้ชเข้าด้วยอีเมล + รหัส OTP ผู้ช่วยโค้ชและผู้เล่นเข้าด้วยไอดีทีม + ไอดีประจำตัว (ไม่มีรหัสผ่าน จึงอย่าแชร์ไอดีให้คนนอกทีม) ข้อมูลทีมเก็บในฐานข้อมูลของระบบ และซิงก์ถึงทุกเครื่องของทีมอัตโนมัติ')}</p>
<p class="muted">${t('ผู้ช่วยกติกาในหน้ากระดานสนามตอบจากกติกาที่ตั้งไว้ ไม่ใช่โมเดล AI ทั่วไป')}</p></section>
<section class="card" style="flex:1 1 340px"><h2>${t('บัญชี')}</h2><div class="chips"><button class="btn" data-act="logout">${ico('logout', 18)} ${t('ออกจากระบบ')}</button>${coach ? `<button class="btn" data-act="exportData">${t('ดาวน์โหลดข้อมูลทีม (JSON)')}</button><button class="btn danger" data-act="delTeam">${t('ลบทีมถาวร')}</button>` : ''}</div></section></div>`;
}
export const actions = {
  setPref(d) { setPrefs({ [d.k]: d.v }); },
  copyTeam() { copyText(S.team.code); return false; },
  async saveProfile() {
    const v = (id) => document.getElementById(id).value.trim();
    const r = await api('PATCH', '/members/' + S.me.id, { name: v('pf-name'), nick: v('pf-nick'), phone: v('pf-phone') });
    if (!r.ok) { toast(errText(r.data.error), 'bad'); return false; } await load(); toast(t('บันทึกแล้ว'));
  },
  async saveTeam() {
    const v = (id) => document.getElementById(id).value.trim();
    const r = await api('PATCH', '/team', { name: v('tm-name'), country: v('tm-country'), code: v('tm-code') });
    if (!r.ok) { toast(errText(r.data.error), 'bad'); return false; } await load(); toast(t('บันทึกแล้ว'));
  },
  exportData() {
    const out = { team: S.team, members: S.members, docs: S.docs, exportedAt: new Date().toISOString() };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); a.download = 'volleyboard-' + S.team.code + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return false;
  },
  delTeam() {
    openDlg({ title: t('ลบทีมถาวร?'), danger: true, ok: t('ลบทีมและข้อมูลทั้งหมด'), body: `<p>${t('ข้อมูลทีม ผู้เล่น ตาราง และสถิติทั้งหมดจะถูกลบและกู้คืนไม่ได้ พิมพ์ไอดีทีม {c} เพื่อยืนยัน', { c: S.team.code })}</p><input class="txt code" name="confirm" autocomplete="off">`,
      async onSubmit(fd) { const r = await api('DELETE', '/team', { confirm: fd.confirm }); if (!r.ok) return errText(r.data.error); resetSession(); stopPolling(); location.hash = ''; } });
    return false;
  }
};
export const inputs = {
  togPref(d, el) { setPrefs({ [d.k]: el.checked }); }
};
