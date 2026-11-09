import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra || {}; }
}
export const fail = (status, code, extra) => new HttpError(status, code, extra);

export function send(res, status, body, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {});
  res.writeHead(status, h);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return req.body ? JSON.parse(req.body) : {}; } catch { throw fail(400, 'bad_json'); } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8') || '{}'); } catch { throw fail(400, 'bad_json'); } }
    return req.body;
  }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 1_000_000) throw fail(413, 'too_large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'bad_json'); }
}

export function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('='); if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

const b64u = (b) => Buffer.from(b).toString('base64url');
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) throw fail(503, 'secret_not_configured');
  return s;
}
export function signToken(payload, ttlSec) {
  const body = b64u(JSON.stringify(Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + ttlSec })));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}
export function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const exp = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; }
}
export function hmac(text) { return crypto.createHmac('sha256', secret()).update(text).digest('hex'); }
export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip').split(',')[0].trim();
}
export function cookieHeader(token, req, maxAge) {
  const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') || process.env.NODE_ENV === 'production';
  return 'vb_session=' + encodeURIComponent(token || '') + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (token ? maxAge : 0) + (secure ? '; Secure' : '');
}
export function etagOf(text) { return 'W/"' + crypto.createHash('md5').update(text).digest('hex') + '"'; }
export const uuid = () => crypto.randomUUID();
export function digits(n) {
  let s = String(crypto.randomInt(1, 10));
  for (let i = 1; i < n; i++) s += crypto.randomInt(0, 10);
  return s;
}
export function pick(alphabet, n) {
  let s = ''; for (let i = 0; i < n; i++) s += alphabet[crypto.randomInt(0, alphabet.length)];
  return s;
}
