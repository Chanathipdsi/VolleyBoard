// Local development server: static files + /api using SQLite (node:sqlite) and console mail. Not used on Vercel.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-dev-secret-dev-secret-dev';
process.env.MAIL_PROVIDER = process.env.MAIL_PROVIDER || 'console';
const { useSqlite, } = await import('./test/helpers.mjs');
const { handle } = await import('./api/_lib/app.js');
const { outbox } = await import('./api/_lib/mail.js');
process.env.NODE_ENV = 'development';
useSqlite(process.env.DEV_DB || ':memory:');
const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__otp') { const e = u.searchParams.get('email'); const m = [...outbox].reverse().find((x) => x.to === e); res.end(m ? m.code : ''); return; }
  if (u.pathname.startsWith('/api')) return handle(req, res);
  let p = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  try { const buf = await readFile(join(root, p)); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(buf); }
  catch { res.writeHead(404); res.end('not found'); }
});
const port = +process.env.PORT || 3000;
server.listen(port, () => console.log('VolleyBoard dev on http://localhost:' + port));
