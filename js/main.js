import { t, getLang } from './i18n.js';
import { esc, $ } from './util.js';
import { S, UI, P, can, role, load, flush, startPolling, stopPolling, resetSession, setHooks, applyPrefs, api, toast, hasPending } from './store.js';
import { ico, initDialog, setRefresh, closeDlg, dlgOpen, calActions } from './ui.js';
import { initTooltips } from './charts.js';
import * as auth from './views/auth.js';
import * as court from './views/court.js';
import * as roster from './views/roster.js';
import * as matches from './views/matches.js';
import * as training from './views/training.js';
import * as roles from './views/roles.js';
import * as settings from './views/settings.js';

const VIEWS = { court, roster, matches, training, roles, settings };
const NAV = [['court', 'กระดานสนาม', 'court'], ['roster', 'ผู้เล่น', 'roster'], ['matches', 'แมตช์', 'matches'], ['training', 'ฝึกซ้อม', 'training'], ['roles', 'สิทธิ์ผู้ใช้', 'roles'], ['settings', 'ตั้งค่า', 'settings']];
const ROLE_NAME = { coach: 'โค้ช', assistant: 'ผู้ช่วยโค้ช', player: 'ผู้เล่น' };
const root = document.getElementById('root');
let booted = false;

const route = () => { const h = (location.hash || '').replace(/^#\/?/, '').split('?')[0]; return VIEWS[h] ? h : (S.me && S.me.role === 'coach' ? 'roster' : 'court'); };

function shell(cur) {
  const v = VIEWS[cur];
  const nav = NAV.map(([id, label, ic]) => `<a class="nav" href="#/${id}" ${cur === id ? 'aria-current="page"' : ''}>${ico(ic, 20)}<span>${t(label)}</span></a>`).join('');
  const ini = esc((S.me.nick || S.me.name || '?').trim().slice(0, 1).toUpperCase());
  return `<div class="app"><aside class="side"><img class="logo" src="/logo.png" alt="VolleyBoard"><nav class="menu" aria-label="${t('เมนูหลัก')}">${nav}</nav>
<div class="who"><div class="who-row"><span class="avatar" aria-hidden="true">${ini}</span><div><b>${esc(S.me.name)}</b><small>${t(ROLE_NAME[S.me.role])} · ${esc(S.team.name)}</small></div></div><button class="btn" data-act="logout">${ico('logout', 18)} ${t('ออกจากระบบ')}</button></div></aside>
<main id="main" tabindex="-1">${S.offline ? `<p class="err" role="alert">${t('ออฟไลน์ — เชื่อมต่อเครือข่ายไม่ได้ การแก้ไขล่าสุดอาจยังไม่ถูกบันทึก')}</p>` : ''}${v.render()}</main></div>`;
}

let renderQueued = false;
function render() {
  const keep = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
  const sy = window.scrollY;
  applyPrefs();
  document.title = 'VolleyBoard' + (S.me && S.team ? ' · ' + S.team.name : '');
  let cur = null;
  if (!S.me) root.innerHTML = auth.render();
  else { cur = route(); root.innerHTML = shell(cur); }
  if (cur && VIEWS[cur].after) VIEWS[cur].after();
  window.scrollTo(0, sy);
  if (keep) { const el = document.querySelector(`[data-fk="${CSS.escape(keep)}"]`); if (el) el.focus({ preventScroll: true }); }
}
const schedule = () => { if (renderQueued) return; renderQueued = true; queueMicrotask(() => { renderQueued = false; render(); }); };
setRefresh(schedule);

const allActions = () => Object.assign({}, auth.actions, calActions, ...Object.values(VIEWS).map((v) => v.actions || {}), {
  async logout() { await flush(); await api('POST', '/auth/logout', {}); resetSession(); stopPolling(); UI.auth = null; location.hash = ''; }
});
const allForms = () => Object.assign({}, auth.forms);
const allInputs = () => Object.assign({}, ...Object.values(VIEWS).map((v) => v.inputs || {}));

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  if (el.dataset.act === 'dlgCancel') { closeDlg(); return; }
  const fn = allActions()[el.dataset.act]; if (!fn) return;
  const r = await fn(el.dataset, el, e);
  if (r !== false) schedule();
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault(); const fn = allForms()[f.dataset.form]; if (fn) await fn();
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.bind) { auth.bind(el.dataset.bind, el.value); return; }
  if (el.dataset && el.dataset.in) { const fn = allInputs()[el.dataset.in]; if (fn) fn(el.dataset, el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.ch) { const fn = allInputs()[el.dataset.ch]; if (fn) { const r = fn(el.dataset, el, e); if (r !== false) schedule(); } }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); const fn = allActions()[e.target.dataset.enter]; if (fn) Promise.resolve(fn(e.target.dataset, e.target, e)).then(schedule); }
});
window.addEventListener('hashchange', () => { if (S.me) { schedule(); window.scrollTo(0, 0); const m = $('#main'); if (m) m.focus({ preventScroll: true }); } });
window.addEventListener('beforeunload', (e) => { if (hasPending()) { e.preventDefault(); e.returnValue = ''; } });

UI.onPoll = () => { if (dlgOpen()) return; const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; schedule(); };
setHooks({
  onChange: (force) => { if (force || !dlgOpen()) schedule(); },
  onUnauth: () => { if (S.me) { resetSession(); stopPolling(); toast(t('กรุณาเข้าสู่ระบบอีกครั้ง'), 'bad'); schedule(); } }
});

(async function boot() {
  applyPrefs(); initDialog(); initTooltips();
  const r = await load(true);
  if (S.me) startPolling(UI.onPoll);
  booted = true; render();
})();
document.addEventListener('vb-refresh', schedule);
