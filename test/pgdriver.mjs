// Test-only driver: runs the app's SQL on a real PostgreSQL through psql (no npm deps available here).
import { execFileSync } from 'node:child_process';
const lit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
export function pgDriver({ host, port, db = 'vbtest', user = 'claude' }) {
  const run = (sql) => execFileSync('psql', ['-h', host, '-p', String(port), '-U', user, '-d', db, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  return {
    async query(text, params) {
      const sql = text.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
      if (/^\s*select/i.test(sql) || /returning/i.test(sql)) {
        const out = run(`with q as (${sql}) select coalesce(json_agg(q), '[]'::json) from q`);
        return JSON.parse(out.trim());
      }
      run(sql); return [];
    }
  };
}
