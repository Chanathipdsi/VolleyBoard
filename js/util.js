export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function randDigits(n) {
  const a = new Uint32Array(n); crypto.getRandomValues(a);
  let s = String(1 + (a[0] % 9));
  for (let i = 1; i < n; i++) s += a[i] % 10;
  return s;
}
export const suggestCode = (role) => (role === 'assistant' ? 'AST' + randDigits(10) : 'PY' + randDigits(9));

/* dates: always local, ISO yyyy-mm-dd */
export const pad2 = (n) => String(n).padStart(2, '0');
export const iso = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
export const parseIso = (s) => { const a = String(s).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); };
export const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const todayIso = () => iso(new Date());
export const dowOf = (s) => parseIso(s).getDay();
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

export const POS = ['S', 'OH', 'MB', 'OP', 'L'];
export const STATUS = ['active', 'injured', 'unavailable'];
export const STATUS_COLOR = { active: '#4ADE80', injured: '#FF6B6B', unavailable: '#FFD23F' };

export function sortBy(arr, f) { return arr.slice().sort((a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; }); }
