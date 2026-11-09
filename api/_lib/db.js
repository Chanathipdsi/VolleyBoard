// Dialect-neutral SQL (works on Postgres/Neon and SQLite): JSON is stored as TEXT,
// timestamps as epoch-ms in double precision, ids generated in JS.
import { fail } from './http.js';

let driver = null;
let ready = null;
export function setDriver(d) { driver = d; ready = ensureSchema(d); }

const SCHEMA = [
  `create table if not exists teams (id text primary key, code text not null, name text not null, country text not null default '', created_at double precision not null)`,
  `create unique index if not exists teams_code_uq on teams (upper(code))`,
  `create table if not exists members (id text primary key, team_id text not null references teams(id) on delete cascade, role text not null, code text, name text not null, nick text not null default '', email text, phone text not null default '', data text not null default '{}', prefs text not null default '{}', created_at double precision not null, updated_at double precision not null)`,
  `create unique index if not exists members_code_uq on members (team_id, upper(code)) where code is not null`,
  `create unique index if not exists members_coach_email_uq on members (lower(email)) where role = 'coach' and email is not null`,
  `create index if not exists members_team_idx on members (team_id)`,
  `create table if not exists docs (team_id text not null references teams(id) on delete cascade, key text not null, data text not null, version integer not null default 1, updated_at double precision not null, primary key (team_id, key))`,
  `create table if not exists otps (email text primary key, hash text not null, payload text not null default '{}', expires_at double precision not null, attempts integer not null default 0, created_at double precision not null)`,
  `create table if not exists rate_limits (key text primary key, hits integer not null, reset_at double precision not null)`
];

async function ensureSchema(d) {
  for (const s of SCHEMA) await d.query(s, []);
}

async function getDriver() {
  if (driver) { await ready; return driver; }
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw fail(503, 'db_not_configured');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  setDriver({ query: (text, params) => sql.query(text, params) });
  await ready;
  return driver;
}

export async function all(text, params = []) { const d = await getDriver(); return d.query(text, params); }
export async function one(text, params = []) { const r = await all(text, params); return r[0] || null; }

// Atomic fixed-window rate limiter. Returns true when the call is allowed.
export async function rateLimit(key, limit, windowSec) {
  const now = Date.now();
  const r = await one(
    `insert into rate_limits (key, hits, reset_at) values ($1, 1, $2)
     on conflict (key) do update set
       hits = case when rate_limits.reset_at < $3 then 1 else rate_limits.hits + 1 end,
       reset_at = case when rate_limits.reset_at < $3 then $2 else rate_limits.reset_at end
     returning hits`, [key, now + windowSec * 1000, now]);
  return Number(r.hits) <= limit;
}
