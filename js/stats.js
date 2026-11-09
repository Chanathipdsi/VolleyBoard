// Point log -> statistics. A log entry: {k:'pt', set, who:'us'|'opp', kind, pid, a, b} (a,b = score after the point), or {k:'to'|'sub', set, a, b}.
export const WIN_KINDS = [
  { id: 'kill', label: 'ตบทำแต้ม', pl: true }, { id: 'tip', label: 'หลอก/แตะทำแต้ม', pl: true }, { id: 'ace', label: 'เสิร์ฟเอซ', pl: true }, { id: 'block', label: 'บล็อกทำแต้ม', pl: true },
  { id: 'o_serve', label: 'คู่แข่งเสิร์ฟเสีย', pl: false }, { id: 'o_atk', label: 'คู่แข่งตบเสีย (ออก/ติดเน็ต)', pl: false }, { id: 'o_fault', label: 'คู่แข่งทำผิดกติกา', pl: false }
];
export const LOSE_KINDS = [
  { id: 'atk_out', label: 'ตบออกนอก', pl: true }, { id: 'atk_net', label: 'ตบติดเน็ต', pl: true }, { id: 'blocked', label: 'ถูกบล็อก', pl: true },
  { id: 'serve_err', label: 'เสิร์ฟเสีย', pl: true }, { id: 'rec_err', label: 'รับเสิร์ฟพลาด', pl: true }, { id: 'dig_err', label: 'รับลูกตบ/ตั้งรับพลาด', pl: true },
  { id: 'set_err', label: 'เซตพลาด', pl: true }, { id: 'net', label: 'ทัชเน็ต', pl: true }, { id: 'dbl', label: 'ลูกสองจังหวะ/ถือลูก', pl: true }, { id: 'rot', label: 'ยืนผิดตำแหน่ง/หมุนผิด', pl: true },
  { id: 'opp_kill', label: 'คู่แข่งตบทำแต้ม', pl: false }, { id: 'opp_ace', label: 'คู่แข่งเสิร์ฟเอซ', pl: false }
];
export const KIND_LABEL = {}; WIN_KINDS.concat(LOSE_KINDS).forEach((k) => { KIND_LABEL[k.id] = k.label; });
export const isWinKind = (id) => WIN_KINDS.some((k) => k.id === id);
export const PLAYER_ERR = LOSE_KINDS.filter((k) => k.pl).map((k) => k.id);

export function summarize(log, sets) {
  const win = {}, lose = {}, players = {}, momentum = [];
  WIN_KINDS.forEach((k) => { win[k.id] = 0; }); LOSE_KINDS.forEach((k) => { lose[k.id] = 0; });
  const pl = (id) => (players[id] = players[id] || { id, kill: 0, tip: 0, ace: 0, block: 0, pts: 0, err: 0, errs: {} });
  let us = 0, opp = 0, i = 0;
  (log || []).forEach((e) => {
    if (e.k !== 'pt') return;
    i++;
    if (e.who === 'us') { us++; win[e.kind] = (win[e.kind] || 0) + 1; if (e.pid) { const p = pl(e.pid); p[e.kind] = (p[e.kind] || 0) + 1; p.pts++; } }
    else { opp++; lose[e.kind] = (lose[e.kind] || 0) + 1; if (e.pid) { const p = pl(e.pid); p.err++; p.errs[e.kind] = (p.errs[e.kind] || 0) + 1; } }
    momentum.push({ i, set: e.set, a: e.a, b: e.b, diff: e.a - e.b, who: e.who, kind: e.kind });
  });
  const setsWon = (sets || []).filter((s) => s.a > s.b).length, setsLost = (sets || []).length - setsWon;
  return { us, opp, win, lose, players, momentum, setsWon, setsLost };
}
export const sumObj = (o) => Object.keys(o).reduce((t, k) => t + o[k], 0);
export function aggregate(records) {
  const log = [], sets = [];
  records.forEach((r) => { (r.log || []).forEach((e) => log.push(e)); (r.sets || []).forEach((s) => sets.push(s)); });
  return summarize(log, sets);
}
