import { t, getLang } from '../i18n.js';
import { esc } from '../util.js';
import { S, UI, P, api, errText, load, setPrefs, applyPrefs, startPolling } from '../store.js';
import { ico, openDlg, rerender } from '../ui.js';

const A = () => (UI.auth = UI.auth || { tab: 'coach', mode: 'login', step: 'form', email: '', name: '', teamName: '', country: '', phone: '', code: '', teamCode: '', memberCode: '', err: '', busy: false, wait: 0 });
const COUNTRIES = ['ไทย', 'Thailand', 'ลาว', 'กัมพูชา', 'เมียนมา', 'เวียดนาม', 'มาเลเซีย', 'สิงคโปร์', 'อินโดนีเซีย', 'ฟิลิปปินส์', 'ญี่ปุ่น', 'เกาหลีใต้', 'จีน', 'อินเดีย', 'ออสเตรเลีย', 'United Kingdom', 'United States'];
let timer = null;
function tick() {
  clearInterval(timer);
  timer = setInterval(() => { const a = A(); if (a.wait > 0) { a.wait--; const b = document.getElementById('resend'); if (b) { b.disabled = a.wait > 0; b.textContent = a.wait > 0 ? t('ขอรหัสใหม่ได้ใน {s} วิ', { s: a.wait }) : t('ขอรหัสใหม่'); } } else clearInterval(timer); }, 1000);
}

export function render() {
  const a = A(), th = getLang() === 'th';
  const feats = ['โค้ชลงทะเบียนด้วยอีเมล + รหัส OTP แล้วได้ไอดีทีม', 'ผู้ช่วยโค้ชและผู้เล่นเข้าด้วยไอดีทีม + ไอดีประจำตัว', 'กระดานสนามพร้อมตัวตรวจตำแหน่งยืนผิดกติกา', 'ตารางซ้อม/แมตช์ล่วงหน้า และสถิติรายแต้มแบบแดชบอร์ด'];
  const side = `<div class="authside"><img src="/logo.png" alt="VolleyBoard"><div><h1>VolleyBoard</h1><p style="margin:8px 0 0;font-size:1.0625rem">${t('ระบบจัดการทีมวอลเลย์บอลสำหรับโค้ช ผู้ช่วย และผู้เล่น')}</p></div><ul>${feats.map((f) => `<li>${ico('ok', 18)}<span>${t(f)}</span></li>`).join('')}</ul></div>`;
  const tools = `<div class="authtools"><button class="tab" data-act="authLang" aria-label="${t('เปลี่ยนภาษา')}">${th ? 'EN' : 'ไทย'}</button><button class="tab" data-act="authTheme" aria-label="${t('สลับโหมดมืด/สว่าง')}">${document.documentElement.dataset.resolved === 'dark' ? t('โหมดสว่าง') : t('โหมดมืด')}</button></div>`;
  const tabs = `<div class="chips" role="tablist" aria-label="${t('ประเภทผู้ใช้')}"><button class="tab" role="tab" data-fk="at-coach" data-act="authTab" data-v="coach" aria-selected="${a.tab === 'coach'}">${t('โค้ช')}</button><button class="tab" role="tab" data-fk="at-member" data-act="authTab" data-v="member" aria-selected="${a.tab === 'member'}">${t('ผู้ช่วยโค้ช / ผู้เล่น')}</button></div>`;
  const err = `<p class="err" role="alert" ${a.err ? '' : 'hidden'}>${esc(a.err)}</p>`;
  let body;
  if (a.tab === 'member') {
    body = `<form data-form="memberLogin" novalidate class="col"><h2>${t('เข้าสู่ระบบสมาชิก')}</h2><p class="muted">${t('ใช้ไอดีทีมที่โค้ชแจ้ง และไอดีประจำตัวของคุณ ระบบจะรู้เองว่าคุณเป็นผู้ช่วยโค้ชหรือผู้เล่น')}</p>
<label class="fld">${t('ไอดีทีม')}<input class="txt code" data-bind="teamCode" value="${esc(a.teamCode)}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="VB-AB12CD" required></label>
<label class="fld">${t('ไอดีประจำตัว')}<input class="txt code" data-bind="memberCode" value="${esc(a.memberCode)}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="PY675432234 / AST6923547780" required></label>${err}
<button class="btn main" type="submit" ${a.busy ? 'disabled' : ''}>${t('เข้าสู่ระบบ')}</button><p class="muted">${t('ลืมไอดี? ถามโค้ชของคุณ โค้ชดูและแก้ไขไอดีได้ในหน้า “ผู้เล่น”')}</p></form>`;
  } else if (a.step === 'otp') {
    body = `<form data-form="otpVerify" novalidate class="col"><h2>${t('ใส่รหัสยืนยัน')}</h2><p class="muted">${t('เราส่งรหัส 6 หลักไปที่ {e} (ใช้ได้ 10 นาที) ตรวจในกล่องจดหมายและสแปมด้วย', { e: a.email })}</p>
<label class="fld"><span class="sr">${t('รหัส 6 หลัก')}</span><input class="txt otp" data-bind="code" value="${esc(a.code)}" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="${t('รหัส 6 หลัก')}"></label>${err}
<button class="btn main" type="submit" ${a.busy ? 'disabled' : ''}>${t('ยืนยัน')}</button>
<div class="split"><button type="button" class="btn sm" data-act="authBack">${t('แก้ไขอีเมล')}</button><button type="button" id="resend" class="btn sm" data-act="otpResend" ${a.wait > 0 ? 'disabled' : ''}>${a.wait > 0 ? t('ขอรหัสใหม่ได้ใน {s} วิ', { s: a.wait }) : t('ขอรหัสใหม่')}</button></div></form>`;
  } else {
    const reg = a.mode === 'register';
    body = `<form data-form="otpRequest" novalidate class="col"><h2>${reg ? t('ลงทะเบียนทีมใหม่') : t('โค้ชเข้าสู่ระบบ')}</h2>
<div class="chips"><button type="button" class="tab" data-fk="am-login" data-act="authMode" data-v="login" aria-pressed="${!reg}">${t('เข้าสู่ระบบ')}</button><button type="button" class="tab" data-fk="am-reg" data-act="authMode" data-v="register" aria-pressed="${reg}">${t('ลงทะเบียนทีมใหม่')}</button></div>
${reg ? `<label class="fld">${t('ชื่อโค้ช')}<input class="txt" data-bind="name" value="${esc(a.name)}" autocomplete="name" required></label>
<div class="fgrid"><label class="fld">${t('ชื่อทีม')}<input class="txt" data-bind="teamName" value="${esc(a.teamName)}" required></label>
<label class="fld">${t('ประเทศ')}<input class="txt" data-bind="country" value="${esc(a.country)}" list="countries" autocomplete="country-name" required></label></div><datalist id="countries">${COUNTRIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>` : ''}
<label class="fld">${t('อีเมล')}<input class="txt" type="email" data-bind="email" value="${esc(a.email)}" autocomplete="email" inputmode="email" required></label>
${reg ? `<label class="fld">${t('เบอร์โทร')}<input class="txt" type="tel" data-bind="phone" value="${esc(a.phone)}" autocomplete="tel" inputmode="tel" placeholder="08x-xxx-xxxx" required><span class="hintline">${t('เก็บไว้เป็นข้อมูลติดต่อ — รหัส OTP ส่งทางอีเมล (SMS มีค่าใช้จ่าย จึงยังไม่เปิดใช้)')}</span></label>` : ''}${err}
<button class="btn main" type="submit" ${a.busy ? 'disabled' : ''}>${t('ส่งรหัส OTP ทางอีเมล')}</button>
${reg ? `<p class="muted">${t('เมื่อลงทะเบียน ระบบจะสร้างไอดีทีมให้อัตโนมัติ (แก้ไขได้ภายหลังในหน้าตั้งค่า)')}</p>` : ''}</form>`;
  }
  return `<div class="authwrap"><div class="authbox">${side}<div class="authmain">${tools}${a.step === 'otp' && a.tab === 'coach' ? '' : tabs}${body}</div></div></div>`;
}

async function afterLogin(registered) {
  await load(true);
  if (!S.me) return;
  startPolling(UI.onPoll);
  UI.auth = null;
  location.hash = '#/' + (S.me.role === 'coach' ? 'roster' : 'court');
  if (registered) {
    openDlg({ title: t('ลงทะเบียนสำเร็จ 🎉'), noCancel: true, ok: t('เริ่มใช้งาน'), onSubmit: () => null, body: `<p>${t('ไอดีทีมของคุณคือ')}</p><p class="code" style="font-size:1.5rem;font-weight:700">${esc(S.team.code)}</p><p class="muted">${t('ให้ผู้ช่วยโค้ชและผู้เล่นใช้ไอดีนี้คู่กับไอดีประจำตัว เปลี่ยนไอดีทีมได้ที่ ตั้งค่า → ทีม ถัดไปให้เพิ่มผู้เล่นและผู้ช่วยในหน้า “ผู้เล่น”')}</p>` });
  }
}

export const forms = {
  async otpRequest() {
    const a = A(); a.err = '';
    a.email = (a.email || '').trim();
    if (!a.email) { a.err = errText('bad_email'); return; }
    a.busy = true; rerender();
    const r = await api('POST', '/auth/otp/request', { mode: a.mode, email: a.email, name: a.name, teamName: a.teamName, country: a.country, phone: a.phone }, { quiet401: true });
    a.busy = false;
    if (!r.ok) { a.err = errText(r.data.error) + (r.data.detail ? ' [' + r.data.detail + ']' : ''); if (r.data.error === 'too_soon') { a.step = 'otp'; a.wait = r.data.wait || 45; tick(); } rerender(); return; }
    a.step = 'otp'; a.code = ''; a.wait = 45; tick(); rerender();
  },
  async otpVerify() {
    const a = A(); a.err = '';
    a.busy = true; rerender();
    const r = await api('POST', '/auth/otp/verify', { email: a.email, code: a.code }, { quiet401: true });
    a.busy = false;
    if (!r.ok) { a.err = errText(r.data.error); rerender(); return; }
    await afterLogin(!!r.data.registered); rerender();
  },
  async memberLogin() {
    const a = A(); a.err = '';
    a.busy = true; rerender();
    const r = await api('POST', '/auth/member', { teamCode: a.teamCode, memberCode: a.memberCode }, { quiet401: true });
    a.busy = false;
    if (!r.ok) { a.err = errText(r.data.error); rerender(); return; }
    await afterLogin(false); rerender();
  }
};
export const actions = {
  authTab(d) { const a = A(); a.tab = d.v; a.err = ''; a.step = 'form'; },
  authMode(d) { const a = A(); a.mode = d.v; a.err = ''; },
  authBack() { const a = A(); a.step = 'form'; a.err = ''; },
  authLang() { setPrefs({ lang: getLang() === 'th' ? 'en' : 'th' }); },
  authTheme() { setPrefs({ theme: document.documentElement.dataset.resolved === 'dark' ? 'light' : 'dark' }); },
  async otpResend() { A().step = 'form'; await forms.otpRequest(); }
};
export const bind = (name, v) => { A()[name] = v; };
