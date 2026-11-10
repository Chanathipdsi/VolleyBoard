import { fail, HttpError, send, readJson, parseCookies, signToken, verifyToken, hmac, clientIp, cookieHeader, etagOf, uuid, digits, pick } from './http.js';
import { all, one, rateLimit } from './db.js';
import { sendOtp } from './mail.js';

const SESSION_TTL = 60 * 60 * 24 * 30;
const OTP_TTL_MS = 10 * 60 * 1000;
const POS = ['S', 'OH', 'MB', 'OP', 'L'];
const ST = ['active', 'injured', 'unavailable'];
const GRP = ['starter', 'bench'];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const CODE_RE = /^[A-Za-z0-9-]{4,24}$/;
const TEAM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DOC_KEY_RE = /^(court|templates|plans|events|sessions|attendance|live|rec:[A-Za-z0-9_-]{1,40})$/;
const COACH_ONLY = /^(court|templates|plans|events)$/;
const STAFF_DOCS = /^(sessions|attendance|live|rec:.+)$/;

const now = () => Date.now();
const j = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const int = (v, lo, hi, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/* ---------- session helpers ---------- */
async function session(req) {
  const tok = parseCookies(req).vb_session;
  const p = verifyToken(tok);
  if (!p) return null;
  const m = await one('select * from members where id = $1 and team_id = $2', [p.m, p.t]);
  if (!m) return null;
  const team = await one('select * from teams where id = $1', [p.t]);
  if (!team) return null;
  return { m, team };
}
async function need(req) { const s = await session(req); if (!s) throw fail(401, 'unauthenticated'); return s; }
function startSession(res, req, m) {
  const token = signToken({ m: m.id, t: m.team_id }, SESSION_TTL);
  res.setHeader('Set-Cookie', cookieHeader(token, req, SESSION_TTL));
}

/* ---------- shaping ---------- */
function teamOut(t) { return { id: t.id, code: t.code, name: t.name, country: t.country }; }
function memberOut(row, viewer) {
  const data = j(row.data, {});
  const self = row.id === viewer.id;
  const out = { id: row.id, role: row.role, name: row.name, nick: row.nick, data };
  if (viewer.role === 'coach' || self) { out.email = row.email || ''; out.phone = row.phone; out.code = row.code || ''; }
  else if (viewer.role === 'assistant') { out.phone = row.phone; }
  else {
    out.name = row.nick || row.name;
    out.data = { n: data.n, pos: data.pos, pos2: data.pos2, grp: data.grp, st: data.st };
  }
  if (self) out.prefs = j(row.prefs, {});
  return out;
}
function cleanPlayer(d, old) {
  const o = Object.assign({}, old || {});
  d = d || {};
  if (d.n !== undefined) o.n = int(d.n, 0, 99, 0);
  if (d.pos !== undefined && POS.includes(d.pos)) o.pos = d.pos;
  if (d.pos2 !== undefined && POS.includes(d.pos2)) o.pos2 = d.pos2;
  ['h', 'w', 'spike', 'block'].forEach((k) => { if (d[k] !== undefined) o[k] = int(d[k], 0, 400, 0); });
  if (d.grp !== undefined && GRP.includes(d.grp)) o.grp = d.grp;
  if (d.st !== undefined && ST.includes(d.st)) o.st = d.st;
  if (o.pos === undefined) o.pos = 'OH';
  if (o.pos2 === undefined) o.pos2 = 'OP';
  if (o.grp === undefined) o.grp = 'bench';
  if (o.st === undefined) o.st = 'active';
  return o;
}
function cleanPrefs(p) {
  const o = {};
  if (!p || typeof p !== 'object') return o;
  const en = (k, vals) => { if (vals.includes(p[k])) o[k] = p[k]; };
  en('theme', ['system', 'light', 'dark']); en('lang', ['th', 'en']); en('size', ['s', 'm', 'l']);
  en('accent', ['coral', 'amber', 'teal', 'pink']); en('weekStart', ['0', '1']);
  ['reduceMotion', 'contrast', 'buddhist', 'compact'].forEach((k) => { if (typeof p[k] === 'boolean') o[k] = p[k]; });
  return o;
}

/* ---------- ids ---------- */
async function uniqueMemberCode(teamId, role) {
  for (let i = 0; i < 20; i++) {
    const code = role === 'assistant' ? 'AST' + digits(10) : 'PY' + digits(9);
    if (!(await one('select 1 as x from members where team_id = $1 and upper(code) = $2', [teamId, code]))) return code;
  }
  throw fail(500, 'code_generation_failed');
}
async function uniqueTeamCode() {
  for (let i = 0; i < 20; i++) {
    const code = 'VB-' + pick(TEAM_ALPHABET, 6);
    if (!(await one('select 1 as x from teams where upper(code) = $1', [code]))) return code;
  }
  throw fail(500, 'code_generation_failed');
}
function normCode(c) {
  const s = str(c, 24);
  if (!CODE_RE.test(s)) throw fail(400, 'bad_code');
  return s.toUpperCase();
}

/* ---------- handlers ---------- */
async function otpRequest(req, res) {
  const b = await readJson(req);
  const email = str(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) throw fail(400, 'bad_email');
  const mode = b.mode === 'register' ? 'register' : 'login';
  const ip = clientIp(req);
  if (!(await rateLimit('otp-ip:' + ip, 20, 3600)) || !(await rateLimit('otp-mail:' + email, 6, 3600))) throw fail(429, 'rate_limited');
  const existing = await one(`select id from members where role = 'coach' and lower(email) = $1`, [email]);
  let payload = { mode };
  if (mode === 'register') {
    if (existing) throw fail(409, 'email_exists');
    payload = {
      mode, name: str(b.name, 60), teamName: str(b.teamName, 60), country: str(b.country, 60), phone: str(b.phone, 24)
    };
    if (payload.name.length < 2) throw fail(400, 'bad_name');
    if (payload.teamName.length < 2) throw fail(400, 'bad_team_name');
    if (!payload.country) throw fail(400, 'bad_country');
    if (!/^[0-9+\-() ]{6,24}$/.test(payload.phone)) throw fail(400, 'bad_phone');
  } else if (!existing) throw fail(404, 'no_account');
  const prev = await one('select created_at from otps where email = $1', [email]);
  if (prev && now() - prev.created_at < 45_000) throw fail(429, 'too_soon', { wait: Math.ceil((45_000 - (now() - prev.created_at)) / 1000) });
  const code = digits(6);
  await all(
    `insert into otps (email, hash, payload, expires_at, attempts, created_at) values ($1,$2,$3,$4,0,$5)
     on conflict (email) do update set hash = excluded.hash, payload = excluded.payload, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
    [email, hmac('otp:' + email + ':' + code), JSON.stringify(payload), now() + OTP_TTL_MS, now()]);
  await sendOtp(email, code);
  send(res, 200, { ok: true, mode, ttl: OTP_TTL_MS / 1000 });
}

async function otpVerify(req, res) {
  const b = await readJson(req);
  const email = str(b.email, 254).toLowerCase();
  const code = str(b.code, 8).replace(/\D/g, '');
  if (!EMAIL_RE.test(email) || code.length !== 6) throw fail(400, 'bad_code');
  if (!(await rateLimit('otpv-ip:' + clientIp(req), 40, 3600))) throw fail(429, 'rate_limited');
  const row = await one('select * from otps where email = $1', [email]);
  if (!row || row.expires_at < now()) throw fail(400, 'code_expired');
  if (Number(row.attempts) >= 5) throw fail(429, 'too_many_attempts');
  if (hmac('otp:' + email + ':' + code) !== row.hash) {
    await all('update otps set attempts = attempts + 1 where email = $1', [email]);
    throw fail(400, 'code_wrong');
  }
  await all('delete from otps where email = $1', [email]);
  const p = j(row.payload, {});
  let member;
  if (p.mode === 'register') {
    if (await one(`select id from members where role = 'coach' and lower(email) = $1`, [email])) throw fail(409, 'email_exists');
    const teamId = uuid(), mid = uuid(), t = now();
    const teamCode = await uniqueTeamCode();
    await all('insert into teams (id, code, name, country, created_at) values ($1,$2,$3,$4,$5)', [teamId, teamCode, p.teamName, p.country, t]);
    await all(`insert into members (id, team_id, role, code, name, nick, email, phone, data, prefs, created_at, updated_at) values ($1,$2,'coach',null,$3,$4,$5,$6,'{}','{}',$7,$7)`,
      [mid, teamId, p.name, p.name.split(' ')[0].slice(0, 20), email, p.phone, t]);
    member = await one('select * from members where id = $1', [mid]);
  } else {
    member = await one(`select * from members where role = 'coach' and lower(email) = $1`, [email]);
    if (!member) throw fail(404, 'no_account');
  }
  startSession(res, req, member);
  const team = await one('select * from teams where id = $1', [member.team_id]);
  send(res, 200, { ok: true, registered: p.mode === 'register', team: teamOut(team) });
}

async function memberLogin(req, res) {
  const b = await readJson(req);
  const teamCode = str(b.teamCode, 24).toUpperCase(), code = str(b.memberCode, 24).toUpperCase();
  if (!teamCode || !code) throw fail(400, 'missing');
  const ip = clientIp(req);
  if (!(await rateLimit('ml-ip:' + ip + ':' + teamCode, 10, 900)) || !(await rateLimit('ml-team:' + teamCode, 120, 3600))) throw fail(429, 'rate_limited');
  const team = await one('select * from teams where upper(code) = $1', [teamCode]);
  const m = team && await one(`select * from members where team_id = $1 and upper(code) = $2 and role <> 'coach'`, [team.id, code]);
  if (!m) throw fail(401, 'invalid_credentials');
  startSession(res, req, m);
  send(res, 200, { ok: true, role: m.role });
}

async function getData(req, res) {
  const { m, team } = await need(req);
  const rows = await all('select * from members where team_id = $1 order by created_at', [team.id]);
  const docRows = await all('select key, data, version from docs where team_id = $1', [team.id]);
  const docs = {};
  docRows.forEach((d) => {
    if (m.role === 'player' && d.key === 'plans') return;
    docs[d.key] = { data: j(d.data, null), version: Number(d.version) };
  });
  const body = JSON.stringify({ me: memberOut(m, m), team: teamOut(team), members: rows.map((r) => memberOut(r, m)), docs });
  const tag = etagOf(body);
  if (req.headers['if-none-match'] === tag) { res.writeHead(304, { ETag: tag, 'Cache-Control': 'private, no-cache' }); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ETag: tag, 'Cache-Control': 'private, no-cache' });
  res.end(body);
}

async function putDoc(req, res, key) {
  const { m, team } = await need(req);
  if (!DOC_KEY_RE.test(key)) throw fail(400, 'bad_key');
  const allowed = m.role === 'coach' || (m.role === 'assistant' && STAFF_DOCS.test(key));
  if (!allowed || COACH_ONLY.test(key) && m.role !== 'coach') throw fail(403, 'forbidden');
  const b = await readJson(req);
  if (b.data === undefined || b.data === null || typeof b.data !== 'object') throw fail(400, 'bad_data');
  const text = JSON.stringify(b.data);
  if (text.length > 600_000) throw fail(413, 'too_large');
  const base = int(b.version, 0, 1e9, 0), t = now();
  let row;
  if (base === 0) {
    row = await one('insert into docs (team_id, key, data, version, updated_at) values ($1,$2,$3,1,$4) on conflict (team_id, key) do nothing returning version', [team.id, key, text, t]);
  } else {
    row = await one('update docs set data = $3, version = version + 1, updated_at = $4 where team_id = $1 and key = $2 and version = $5 returning version', [team.id, key, text, t, base]);
  }
  if (!row) {
    const cur = await one('select data, version from docs where team_id = $1 and key = $2', [team.id, key]);
    throw fail(409, 'conflict', { current: cur ? { data: j(cur.data, null), version: Number(cur.version) } : null });
  }
  send(res, 200, { ok: true, version: Number(row.version) });
}

async function createMembers(req, res) {
  const { m, team } = await need(req);
  if (m.role !== 'coach') throw fail(403, 'forbidden');
  const b = await readJson(req);
  const items = Array.isArray(b.items) ? b.items.slice(0, 30) : [b];
  const created = [];
  for (const it of items) {
    const role = it.role === 'assistant' ? 'assistant' : it.role === 'player' ? 'player' : null;
    if (!role) throw fail(400, 'bad_role');
    const name = str(it.name, 80), nick = str(it.nick, 24) || name.split(' ')[0].slice(0, 24);
    if (name.length < 1) throw fail(400, 'bad_name');
    const email = str(it.email, 254).toLowerCase();
    if (email && !EMAIL_RE.test(email)) throw fail(400, 'bad_email');
    const code = it.code ? normCode(it.code) : await uniqueMemberCode(team.id, role);
    if (await one('select 1 as x from members where team_id = $1 and upper(code) = $2', [team.id, code])) throw fail(409, 'code_taken');
    let data = {};
    if (role === 'player') {
      data = cleanPlayer(it.data);
      if (await numberTaken(team.id, data.n, null)) throw fail(409, 'number_taken');
    }
    const id = uuid(), t = now();
    await all(`insert into members (id, team_id, role, code, name, nick, email, phone, data, prefs, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}',$10,$10)`,
      [id, team.id, role, code, name, nick, email || null, str(it.phone, 24), JSON.stringify(data), t]);
    created.push(memberOut(await one('select * from members where id = $1', [id]), m));
  }
  send(res, 200, { ok: true, members: created });
}
async function numberTaken(teamId, n, exceptId) {
  if (n === undefined || n === null) return false;
  const rows = await all(`select id, data from members where team_id = $1 and role = 'player'`, [teamId]);
  return rows.some((r) => r.id !== exceptId && j(r.data, {}).n === n);
}

async function patchMember(req, res, id) {
  const { m, team } = await need(req);
  const row = await one('select * from members where id = $1 and team_id = $2', [id, team.id]);
  if (!row) throw fail(404, 'not_found');
  const self = row.id === m.id;
  if (m.role !== 'coach' && !self) throw fail(403, 'forbidden');
  const b = await readJson(req);
  const sets = [], vals = [];
  const add = (col, v) => { vals.push(v); sets.push(col + ' = $' + (vals.length + 2)); };
  if (b.name !== undefined) { const n = str(b.name, 80); if (!n) throw fail(400, 'bad_name'); add('name', n); }
  if (b.nick !== undefined) add('nick', str(b.nick, 24));
  if (b.phone !== undefined) { const p = str(b.phone, 24); if (p && !/^[0-9+\-() ]{6,24}$/.test(p)) throw fail(400, 'bad_phone'); add('phone', p); }
  if (b.prefs !== undefined && self) add('prefs', JSON.stringify(cleanPrefs(b.prefs)));
  if (m.role === 'coach' && row.role !== 'coach') {
    if (b.email !== undefined) { const e = str(b.email, 254).toLowerCase(); if (e && !EMAIL_RE.test(e)) throw fail(400, 'bad_email'); add('email', e || null); }
    if (b.code !== undefined) {
      const c = normCode(b.code);
      if (await one('select 1 as x from members where team_id = $1 and upper(code) = $2 and id <> $3', [team.id, c, row.id])) throw fail(409, 'code_taken');
      add('code', c);
    }
    if (row.role === 'player' && b.data !== undefined) {
      const d = cleanPlayer(b.data, j(row.data, {}));
      if (await numberTaken(team.id, d.n, row.id)) throw fail(409, 'number_taken');
      add('data', JSON.stringify(d));
    }
  }
  if (!sets.length) return send(res, 200, { ok: true, member: memberOut(row, m) });
  vals.push(now()); sets.push('updated_at = $' + (vals.length + 2));
  await all(`update members set ${sets.join(', ')} where id = $1 and team_id = $2`, [id, team.id, ...vals]);
  send(res, 200, { ok: true, member: memberOut(await one('select * from members where id = $1', [id]), m) });
}

async function regenCode(req, res, id) {
  const { m, team } = await need(req);
  if (m.role !== 'coach') throw fail(403, 'forbidden');
  const row = await one('select * from members where id = $1 and team_id = $2', [id, team.id]);
  if (!row || row.role === 'coach') throw fail(404, 'not_found');
  const code = await uniqueMemberCode(team.id, row.role);
  await all('update members set code = $3, updated_at = $4 where id = $1 and team_id = $2', [id, team.id, code, now()]);
  send(res, 200, { ok: true, code });
}

async function deleteMember(req, res, id) {
  const { m, team } = await need(req);
  if (m.role !== 'coach') throw fail(403, 'forbidden');
  const row = await one('select * from members where id = $1 and team_id = $2', [id, team.id]);
  if (!row || row.role === 'coach') throw fail(404, 'not_found');
  await all('delete from members where id = $1 and team_id = $2', [id, team.id]);
  send(res, 200, { ok: true });
}

async function patchTeam(req, res) {
  const { m, team } = await need(req);
  if (m.role !== 'coach') throw fail(403, 'forbidden');
  const b = await readJson(req);
  const sets = [], vals = [];
  const add = (c, v) => { vals.push(v); sets.push(c + ' = $' + (vals.length + 1)); };
  if (b.name !== undefined) { const n = str(b.name, 60); if (n.length < 2) throw fail(400, 'bad_team_name'); add('name', n); }
  if (b.country !== undefined) { const c = str(b.country, 60); if (!c) throw fail(400, 'bad_country'); add('country', c); }
  if (b.code !== undefined) {
    const c = normCode(b.code);
    if (await one('select 1 as x from teams where upper(code) = $1 and id <> $2', [c, team.id])) throw fail(409, 'code_taken');
    add('code', c);
  }
  if (sets.length) await all(`update teams set ${sets.join(', ')} where id = $1`, [team.id, ...vals]);
  send(res, 200, { ok: true, team: teamOut(await one('select * from teams where id = $1', [team.id])) });
}

async function checkTeamCode(req, res) {
  const { m, team } = await need(req);
  if (m.role !== 'coach') throw fail(403, 'forbidden');
  const b = await readJson(req);
  let c; try { c = normCode(b.code); } catch { return send(res, 200, { ok: false, reason: 'format' }); }
  const taken = await one('select 1 as x from teams where upper(code) = $1 and id <> $2', [c, team.id]);
  send(res, 200, { ok: !taken, reason: taken ? 'taken' : null });
}

async function deleteTeam(req, res) {
  const { m, team } = await need(req);
  if (m.role !== 'coach') throw fail(403, 'forbidden');
  const b = await readJson(req);
  if (str(b.confirm, 24).toUpperCase() !== team.code.toUpperCase()) throw fail(400, 'confirm_mismatch');
  await all('delete from members where team_id = $1', [team.id]);
  await all('delete from docs where team_id = $1', [team.id]);
  await all('delete from teams where id = $1', [team.id]);
  res.setHeader('Set-Cookie', cookieHeader('', req, 0));
  send(res, 200, { ok: true });
}

/* ---------- router ---------- */
export async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    const viaRewrite = url.searchParams.get('__p');
    const path = (viaRewrite !== null ? '/' + viaRewrite : url.pathname.replace(/^\/api/, '')).replace(/\/+$/, '') || '/';
    const method = req.method;
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin) {
        let h = ''; try { h = new URL(origin).host; } catch { /* */ }
        const ok = new Set([req.headers.host, String(req.headers['x-forwarded-host'] || '').split(',')[0].trim(), process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL].filter(Boolean));
        if (!ok.has(h)) { console.error('bad_origin', h, [...ok].join('|')); throw fail(403, 'bad_origin'); }
      }
    }
    let mt;
    if (path === '/health') return send(res, 200, { ok: true });
    if (method === 'POST' && path === '/auth/otp/request') return await otpRequest(req, res);
    if (method === 'POST' && path === '/auth/otp/verify') return await otpVerify(req, res);
    if (method === 'POST' && path === '/auth/member') return await memberLogin(req, res);
    if (method === 'POST' && path === '/auth/logout') { res.setHeader('Set-Cookie', cookieHeader('', req, 0)); return send(res, 200, { ok: true }); }
    if (method === 'GET' && path === '/data') return await getData(req, res);
    if ((mt = path.match(/^\/docs\/(.+)$/)) && method === 'PUT') return await putDoc(req, res, decodeURIComponent(mt[1]));
    if (method === 'POST' && path === '/members') return await createMembers(req, res);
    if ((mt = path.match(/^\/members\/([^/]+)$/))) {
      if (method === 'PATCH') return await patchMember(req, res, mt[1]);
      if (method === 'DELETE') return await deleteMember(req, res, mt[1]);
    }
    if ((mt = path.match(/^\/members\/([^/]+)\/regen$/)) && method === 'POST') return await regenCode(req, res, mt[1]);
    if (path === '/team' && method === 'PATCH') return await patchTeam(req, res);
    if (path === '/team' && method === 'DELETE') return await deleteTeam(req, res);
    if (path === '/team/check-code' && method === 'POST') return await checkTeamCode(req, res);
    throw fail(404, 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, Object.assign({ error: e.code }, e.extra));
    console.error('api error', e && e.message);
    return send(res, 500, { error: 'server_error' });
  }
}
