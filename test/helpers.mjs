import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import { setDriver } from '../api/_lib/db.js';
import { handle } from '../api/_lib/app.js';
import { outbox } from '../api/_lib/mail.js';
import { pgDriver } from './pgdriver.mjs';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-test-secret-test-secret';
process.env.MAIL_PROVIDER = 'console';
process.env.NODE_ENV = 'test';

export function useSqlite(file = ':memory:') {
  if (process.env.PG_SOCKET) { setDriver(pgDriver({ host: process.env.PG_SOCKET, port: process.env.PG_PORT || 5432 })); return null; }
  const db = new DatabaseSync(file);
  db.exec('pragma foreign_keys = on');
  setDriver({
    async query(text, params) {
      const t = text.replace(/\$(\d+)/g, '?$1');
      const stmt = db.prepare(t);
      if (/^\s*(select|insert|update|delete)/i.test(t) && /returning|^\s*select/i.test(t)) return stmt.all(...params).map((r) => ({ ...r }));
      stmt.run(...params);
      return [];
    }
  });
  return db;
}

export async function startServer() {
  const server = http.createServer((req, res) => handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

export class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async call(method, path, body, headers) {
    const r = await fetch(this.base + '/api' + path, {
      method, headers: Object.assign({ 'content-type': 'application/json', cookie: this.cookie }, headers || {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
    const text = await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
    return { status: r.status, json, headers: r.headers };
  }
  get(p, h) { return this.call('GET', p, undefined, h); }
  post(p, b) { return this.call('POST', p, b || {}); }
  put(p, b) { return this.call('PUT', p, b); }
  patch(p, b) { return this.call('PATCH', p, b); }
  del(p, b) { return this.call('DELETE', p, b || {}); }
}
export const lastCode = (email) => [...outbox].reverse().find((m) => m.to === email)?.code;
