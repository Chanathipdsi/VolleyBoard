import { t, setLang } from './i18n.js';
import { clamp } from './util.js';

export const S = { me: null, team: null, members: [], docs: {}, ver: {}, ready: false, offline: false };
export const UI = { cal: {}, dlg: null };
const hooks = { onChange: () => {}, onUnauth: () => {} };
export const setHooks = (h) => Object.assign(hooks, h);

/* ---------- api ---------- */
const ERR = {
  unauthenticated: 'กรุณาเข้าสู่ระบบอีกครั้ง', bad_email: 'อีเมลไม่ถูกต้อง', bad_phone: 'เบอร์โทรไม่ถูกต้อง (ใช้ตัวเลข + - ( ) ความยาว 6–24)',
  bad_name: 'กรอกชื่อให้ครบ', bad_team_name: 'ชื่อทีมต้องมีอย่างน้อย 2 ตัวอักษร', bad_country: 'เลือกหรือกรอกประเทศ', email_exists: 'อีเมลนี้ลงทะเบียนแล้ว ให้ใช้ “เข้าสู่ระบบ”',
  no_account: 'ไม่พบบัญชีโค้ชของอีเมลนี้ ลองลงทะเบียนทีมใหม่', too_soon: 'ขอรหัสถี่เกินไป รอสักครู่แล้วลองใหม่', rate_limited: 'ลองบ่อยเกินไป รอสักพักแล้วลองใหม่',
  code_expired: 'รหัสหมดอายุ ขอรหัสใหม่', code_wrong: 'รหัสไม่ถูกต้อง', too_many_attempts: 'ใส่รหัสผิดหลายครั้ง ขอรหัสใหม่',
  invalid_credentials: 'ไอดีทีมหรือไอดีประจำตัวไม่ถูกต้อง', forbidden: 'บทบาทนี้ไม่มีสิทธิ์ทำรายการนี้', code_taken: 'ไอดีนี้ถูกใช้แล้ว เลือกไอดีอื่น',
  bad_code: 'ไอดีใช้ได้เฉพาะ A–Z 0–9 และ - ความยาว 4–24 ตัว', number_taken: 'เบอร์เสื้อนี้มีผู้เล่นใช้แล้ว', mail_not_configured: 'ระบบยังไม่ได้ตั้งค่าการส่งอีเมล (ผู้ดูแลต้องตั้งค่า)',
  mail_failed: 'ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง', db_not_configured: 'ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล', secret_not_configured: 'ระบบยังตั้งค่าไม่ครบ (SESSION_SECRET)',
  confirm_mismatch: 'ไอดีทีมที่พิมพ์ยืนยันไม่ตรง', conflict: 'ข้อมูลถูกแก้ไขโดยผู้อื่นพร้อมกัน', server_error: 'ระบบขัดข้อง ลองใหม่อีกครั้ง', network: 'เชื่อมต่อเครือข่ายไม่ได้', too_large: 'ข้อมูลใหญ่เกินไป'
};
export const errText = (code) => t(ERR[code] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');

export async function api(method, path, body, opts) {
  try {
    const r = await fetch('/api' + path, {
      method, credentials: 'same-origin', cache: 'no-cache',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    S.offline = false;
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* */ }
    if (r.status === 401 && !(opts && opts.quiet401)) hooks.onUnauth();
    return { ok: r.ok, status: r.status, data: data || {}, raw: text };
  } catch {
    S.offline = true;
    return { ok: false, status: 0, data: { error: 'network' }, raw: '' };
  }
}

/* ---------- preferences (local first, synced to account when signed in) ---------- */
const PREF_DEFAULT = { theme: 'system', lang: 'th', size: 'm', accent: 'coral', weekStart: '0', reduceMotion: false, contrast: false, buddhist: true, compact: false };
export let P = Object.assign({}, PREF_DEFAULT);
try { Object.assign(P, JSON.parse(localStorage.getItem('vb-prefs') || '{}')); } catch { /* */ }
if (!localStorage.getItem('vb-prefs')) { P.lang = (navigator.language || 'th').toLowerCase().startsWith('th') ? 'th' : 'en'; }
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
export function applyPrefs() {
  const d = document.documentElement;
  const dark = P.theme === 'dark' || (P.theme === 'system' && mq && mq.matches);
  d.dataset.resolved = dark ? 'dark' : 'light';
  d.dataset.accent = P.accent; d.dataset.size = P.size;
  P.contrast ? d.dataset.contrast = '1' : delete d.dataset.contrast;
  P.compact ? d.dataset.compact = '1' : delete d.dataset.compact;
  P.reduceMotion ? d.dataset.motion = 'off' : delete d.dataset.motion;
  setLang(P.lang);
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = '#2128D0';
}
if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (P.theme === 'system') { applyPrefs(); hooks.onChange(true); } });
export async function setPrefs(patch) {
  Object.assign(P, patch);
  try { localStorage.setItem('vb-prefs', JSON.stringify(P)); } catch { /* */ }
  applyPrefs();
  if (S.me) await api('PATCH', '/members/' + S.me.id, { prefs: P });
}

/* ---------- roles ---------- */
export const role = () => (S.me ? S.me.role : null);
export const can = (what) => {
  const r = role();
  if (what === 'lineup' || what === 'members' || what === 'schedule' || what === 'plan' || what === 'team') return r === 'coach';
  if (what === 'stats' || what === 'train') return r === 'coach' || r === 'assistant';
  return false;
};
export const players = () => S.members.filter((m) => m.role === 'player').sort((a, b) => (a.data.n || 0) - (b.data.n || 0));
export const assistants = () => S.members.filter((m) => m.role === 'assistant');
export const coach = () => S.members.find((m) => m.role === 'coach');
export const byId = (id) => S.members.find((m) => m.id === id) || null;
export const shortName = (m) => (m ? m.nick || m.name : '');

/* ---------- documents ---------- */
const emptyLineup = () => ({ 1: null, 2: null, 3: null, 4: null, 5: null, 6: null });
export const DEFAULTS = {
  court: () => ({ lineup: emptyLineup(), rot: 1, formation: 'base', custom: {}, libFor: null }),
  templates: () => [], events: () => [], plans: () => ({}), sessions: () => [], attendance: () => ({}),
  live: () => ({ eventId: null, set: 1, a: 0, b: 0, to: 2, sub: 6, sets: [], log: [] })
};
export function doc(key) {
  if (!(key in S.docs)) S.docs[key] = key.startsWith('rec:') ? null : DEFAULTS[key]();
  return S.docs[key];
}
const dirty = new Set(); let timer = null, flushing = false;
export function commit(key) { dirty.add(key); clearTimeout(timer); timer = setTimeout(flush, 350); }
export async function flush() {
  if (flushing) { timer = setTimeout(flush, 300); return; }
  flushing = true;
  try {
    for (const key of Array.from(dirty)) {
      const r = await api('PUT', '/docs/' + encodeURIComponent(key), { data: S.docs[key], version: S.ver[key] || 0 });
      if (r.ok) { S.ver[key] = r.data.version; dirty.delete(key); }
      else if (r.status === 409) {
        dirty.delete(key);
        if (r.data.current) { S.docs[key] = r.data.current.data; S.ver[key] = r.data.current.version; } else { delete S.docs[key]; delete S.ver[key]; }
        toast(t('มีคนแก้ข้อมูลส่วนนี้พร้อมกัน ระบบโหลดข้อมูลล่าสุดแล้ว กรุณาทำรายการซ้ำ'), 'bad'); hooks.onChange(true);
      } else if (r.status === 403) { dirty.delete(key); toast(errText('forbidden'), 'bad'); await load(); }
      else if (r.status !== 401) { toast(errText(r.data.error), 'bad'); dirty.delete(key); }
      else dirty.delete(key);
    }
  } finally { flushing = false; }
}
export const hasPending = () => dirty.size > 0 || flushing;

let lastRaw = '';
export async function load(first) {
  const r = await api('GET', '/data', undefined, { quiet401: first });
  if (!r.ok) return first ? r : false;
  if (r.raw === lastRaw && S.ready) return false;
  lastRaw = r.raw;
  const d = r.data;
  S.me = d.me; S.team = d.team; S.members = d.members;
  Object.keys(d.docs).forEach((k) => {
    if (dirty.has(k)) return;
    if (S.ver[k] !== d.docs[k].version) { S.docs[k] = d.docs[k].data; S.ver[k] = d.docs[k].version; }
  });
  S.ready = true;
  if (S.me && S.me.prefs && Object.keys(S.me.prefs).length && first) {
    Object.assign(P, S.me.prefs); try { localStorage.setItem('vb-prefs', JSON.stringify(P)); } catch { /* */ } applyPrefs();
  }
  return true;
}
export function resetSession() { S.me = null; S.team = null; S.members = []; S.docs = {}; S.ver = {}; S.ready = false; lastRaw = ''; dirty.clear(); }

let pollTimer = null;
export function startPolling(onUpdate) {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (document.hidden || hasPending()) return;
    const changed = await load();
    if (changed) onUpdate();
  }, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) load().then((c) => c && onUpdate()); });
}
export function stopPolling() { clearInterval(pollTimer); }

/* ---------- toast ---------- */
export function toast(msg, kind) {
  const box = document.getElementById('toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = 'toast' + (kind === 'bad' ? ' bad' : ''); el.textContent = msg;
  box.appendChild(el); setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3200);
}
export { clamp };
