import { t } from './i18n.js';
import { esc } from './util.js';

/* Horizontal bars in plain HTML: thin (<=20px), 4px rounded data end, value at the tip, no gridlines needed. */
export function hbars(items, { color = 'var(--chart-us)', unit = '', empty = 'ยังไม่มีข้อมูล' } = {}) {
  const rows = items.filter((i) => i.value > 0);
  if (!rows.length) return `<p class="muted">${t(empty)}</p>`;
  const max = Math.max(...rows.map((r) => r.value));
  return `<div class="hbars" role="list">` + rows.map((r) => {
    const w = Math.max(2, (r.value / max) * 100);
    const tip = esc(r.tip || `${r.label}: ${r.value}${unit}`);
    return `<div class="hb" role="listitem" tabindex="0" data-tip="${tip}" aria-label="${tip}"><span class="hl">${esc(r.label)}</span><span class="ht"><i style="width:${w}%;background:${r.color || color}"></i></span><span class="hv">${r.value}${unit}${r.share != null ? `<small> · ${r.share}%</small>` : ''}</span></div>`;
  }).join('') + `</div>`;
}

/* Lead over the opponent after each rally (our score minus theirs), set by set. One axis, zero baseline, tooltips per rally. */
export function momentumChart(points, sets) {
  if (!points.length) return `<p class="muted">${t('ยังไม่มีข้อมูล')}</p>`;
  const W = 640, H = 230, L = 36, R = 14, T = 14, B = 30;
  const maxAbs = Math.max(4, ...points.map((p) => Math.abs(p.diff)));
  const m = Math.ceil(maxAbs / 2) * 2;
  const x = (i) => L + (points.length === 1 ? 0.5 : (i / (points.length - 1))) * (W - L - R);
  const y = (v) => T + ((m - v) / (2 * m)) * (H - T - B);
  const y0 = y(0);
  const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.diff).toFixed(1)).join(' ');
  const area = line + ` L${x(points.length - 1).toFixed(1)} ${y0} L${x(0).toFixed(1)} ${y0} Z`;
  const ticks = [m, m / 2, 0, -m / 2, -m].map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" ${v === 0 ? 'style="stroke:var(--muted);opacity:.55"' : ''}></line><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' + v : v}</text>`).join('');
  // set separators and labels
  let seps = '', labels = '', start = 0;
  for (let i = 1; i <= points.length; i++) {
    if (i === points.length || points[i].set !== points[start].set) {
      const mid = (x(start) + x(i - 1)) / 2, s = points[start].set;
      if (i < points.length) seps += `<line class="grid" x1="${(x(i - 1) + x(i)) / 2}" x2="${(x(i - 1) + x(i)) / 2}" y1="${T}" y2="${H - B}" style="stroke-dasharray:none"></line>`;
      labels += `<text x="${mid}" y="${H - 9}" text-anchor="middle">${t('เซ็ต {n}', { n: s })}${sets && sets[s - 1] ? ` ${sets[s - 1].a}–${sets[s - 1].b}` : ''}</text>`;
      start = i;
    }
  }
  const step = (W - L - R) / Math.max(1, points.length - 1);
  const hits = points.map((p, i) => {
    const tip = t('เซ็ต {s} · {a}–{b} ({d}) · {w}', { s: p.set, a: p.a, b: p.b, d: p.diff > 0 ? '+' + p.diff : p.diff, w: p.who === 'us' ? t('เราได้แต้ม') : t('คู่แข่งได้แต้ม') });
    return `<g class="pt" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}"><rect x="${x(i) - step / 2}" y="${T}" width="${Math.max(step, 4)}" height="${H - T - B}" fill="transparent"></rect><circle cx="${x(i)}" cy="${y(p.diff)}" r="4" class="dot" style="fill:${p.diff >= 0 ? 'var(--chart-us)' : 'var(--chart-opp)'};stroke:var(--chart-surface);stroke-width:2"></circle></g>`;
  }).join('');
  const last = points[points.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('กราฟแต้มนำ–ตามรายแต้ม')}">
<defs><clipPath id="cp-up"><rect x="${L}" y="${T}" width="${W - L - R}" height="${y0 - T}"></rect></clipPath><clipPath id="cp-dn"><rect x="${L}" y="${y0}" width="${W - L - R}" height="${H - B - y0}"></rect></clipPath></defs>
${ticks}${seps}
<path d="${area}" clip-path="url(#cp-up)" style="fill:var(--chart-us);opacity:.12"></path><path d="${area}" clip-path="url(#cp-dn)" style="fill:var(--chart-opp);opacity:.14"></path>
<path d="${line}" fill="none" style="stroke:var(--chart-us)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
<circle cx="${x(points.length - 1)}" cy="${y(last.diff)}" r="4.5" style="fill:${last.diff >= 0 ? 'var(--chart-us)' : 'var(--chart-opp)'};stroke:var(--chart-surface);stroke-width:2"></circle>
${labels}${hits}</svg>
<div class="legend"><span><i style="background:var(--chart-us)"></i>${t('เหนือเส้นศูนย์ = ทีมเรานำ')}</span><span><i style="background:var(--chart-opp)"></i>${t('ใต้เส้นศูนย์ = คู่แข่งนำ')}</span></div>`;
}

export function initTooltips() {
  let tip = null;
  const show = (el, x, y) => {
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = el.getAttribute('data-tip'); tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14)) + 'px';
    tip.style.top = Math.min(window.innerHeight - r.height - 8, y + 16) + 'px';
  };
  const hide = () => { if (tip) tip.style.display = 'none'; };
  document.addEventListener('pointermove', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) show(el, e.clientX, e.clientY); else hide(); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
}
