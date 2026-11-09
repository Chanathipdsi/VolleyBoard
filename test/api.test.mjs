import test from 'node:test';
import assert from 'node:assert/strict';
import { useSqlite, startServer, Client, lastCode } from './helpers.mjs';

useSqlite();
const srv = await startServer();
test.after(() => srv.close());

const E = 'coach@example.com';
const coach = new Client(srv.base);
let team, assistant, player;

test('health', async () => { assert.equal((await coach.get('/health')).status, 200); });

test('unauthenticated data is 401', async () => { assert.equal((await new Client(srv.base).get('/data')).status, 401); });

test('register validation + OTP flow', async () => {
  let r = await coach.post('/auth/otp/request', { mode: 'register', email: 'bad', name: 'A', teamName: 'T', country: 'TH', phone: '0812345678' });
  assert.equal(r.json.error, 'bad_email');
  r = await coach.post('/auth/otp/request', { mode: 'register', email: E, name: 'โค้ช ทดสอบ', teamName: 'ทีมทดสอบ', country: 'ไทย', phone: 'abc' });
  assert.equal(r.json.error, 'bad_phone');
  r = await coach.post('/auth/otp/request', { mode: 'register', email: E, name: 'โค้ช ทดสอบ', teamName: 'ทีมทดสอบ', country: 'ไทย', phone: '081-234-5678' });
  assert.equal(r.status, 200);
  const code = lastCode(E);
  assert.match(code, /^\d{6}$/);
  r = await coach.post('/auth/otp/verify', { email: E, code: code === '111111' ? '222222' : '111111' });
  assert.equal(r.json.error, 'code_wrong');
  r = await coach.post('/auth/otp/verify', { email: E, code });
  assert.equal(r.status, 200);
  assert.equal(r.json.registered, true);
  team = r.json.team;
  assert.match(team.code, /^VB-[A-Z2-9]{6}$/);
  assert.ok(coach.cookie.startsWith('vb_session='));
  // code is single use
  assert.equal((await coach.post('/auth/otp/verify', { email: E, code })).json.error, 'code_expired');
});

test('cannot register the same email twice; resend cooldown', async () => {
  const c2 = new Client(srv.base);
  const r = await c2.post('/auth/otp/request', { mode: 'register', email: E, name: 'xx', teamName: 'yy', country: 'th', phone: '0812345678' });
  assert.equal(r.json.error, 'email_exists');
  const r2 = await c2.post('/auth/otp/request', { mode: 'login', email: E });
  assert.equal(r2.status, 200);
  const r3 = await c2.post('/auth/otp/request', { mode: 'login', email: E });
  assert.equal(r3.json.error, 'too_soon');
});

test('coach adds assistant + players with auto ids; ids are editable and unique', async () => {
  let r = await coach.post('/members', { role: 'assistant', name: 'ผู้ช่วย หนึ่ง', phone: '0899999999' });
  assert.equal(r.status, 200);
  assistant = r.json.members[0];
  assert.match(assistant.code, /^AST\d{10}$/);
  r = await coach.post('/members', { role: 'player', name: 'ผู้เล่น หนึ่ง', nick: 'หนึ่ง', data: { n: 7, pos: 'OH', pos2: 'OP', grp: 'starter' } });
  player = r.json.members[0];
  assert.match(player.code, /^PY\d{9}$/);
  assert.equal(player.data.n, 7);
  r = await coach.post('/members', { role: 'player', name: 'ซ้ำเบอร์', data: { n: 7 } });
  assert.equal(r.json.error, 'number_taken');
  r = await coach.patch('/members/' + player.id, { code: assistant.code });
  assert.equal(r.json.error, 'code_taken');
  r = await coach.patch('/members/' + player.id, { code: 'py675432234' });
  assert.equal(r.json.member.code, 'PY675432234');
  player.code = 'PY675432234';
  r = await coach.patch('/members/' + player.id, { code: '!!' });
  assert.equal(r.json.error, 'bad_code');
  r = await coach.post('/members/' + assistant.id + '/regen');
  assistant.code = r.json.code; assert.match(assistant.code, /^AST\d{10}$/);
  r = await coach.post('/members', { items: [{ role: 'player', name: 'a1', data: { n: 20 } }, { role: 'player', name: 'a2', data: { n: 21 } }] });
  assert.equal(r.json.members.length, 2);
});

test('team code editable, unique across teams', async () => {
  // second team
  const c2 = new Client(srv.base);
  await c2.post('/auth/otp/request', { mode: 'register', email: 'b@example.com', name: 'Coach B', teamName: 'Team B', country: 'Japan', phone: '+66 81 234 5678' });
  const v = await c2.post('/auth/otp/verify', { email: 'b@example.com', code: lastCode('b@example.com') });
  assert.equal(v.status, 200);
  let r = await c2.patch('/team', { code: team.code.toLowerCase() });
  assert.equal(r.json.error, 'code_taken');
  r = await c2.post('/team/check-code', { code: team.code });
  assert.equal(r.json.ok, false);
  r = await coach.patch('/team', { code: 'my-team-2026', name: 'ทีมใหม่' });
  assert.equal(r.json.team.code, 'MY-TEAM-2026');
  team = r.json.team;
  assert.equal((await coach.patch('/team', { code: 'ab' })).json.error, 'bad_code');
});

test('assistant & player log in with team id + personal id and get the right role', async () => {
  assistant = Object.assign(assistant, {});
  const a = new Client(srv.base);
  let r = await a.post('/auth/member', { teamCode: team.code.toLowerCase(), memberCode: assistant.code });
  assert.equal(r.json.role, 'assistant');
  const p = new Client(srv.base);
  r = await p.post('/auth/member', { teamCode: team.code, memberCode: player.code });
  assert.equal(r.json.role, 'player');
  assert.equal((await new Client(srv.base).post('/auth/member', { teamCode: team.code, memberCode: 'PY000' })).status, 401);
  assert.equal((await new Client(srv.base).post('/auth/member', { teamCode: 'NOPE-1', memberCode: player.code })).status, 401);

  // data shaping
  const ad = (await a.get('/data')).json;
  assert.equal(ad.me.role, 'assistant');
  assert.ok(!ad.members.find((m) => m.role === 'player').code, 'assistant must not see player ids');
  const pd = (await p.get('/data')).json;
  assert.equal(pd.me.code, player.code);
  const others = pd.members.filter((m) => m.id !== pd.me.id);
  assert.ok(others.every((m) => !m.phone && !m.email && !m.code), 'player must not see others contact/ids');
  assert.equal(pd.members.find((m) => m.id === assistant.id).data && Object.keys(pd.members.find((m) => m.id === assistant.id).data).length, 0);

  // permissions
  assert.equal((await a.post('/members', { role: 'player', name: 'x' })).status, 403);
  assert.equal((await p.patch('/members/' + assistant.id, { nick: 'x' })).status, 403);
  assert.equal((await p.patch('/members/' + player.id, { code: 'HACK1234' })).json.member.code, player.code, 'player cannot change own id');
  assert.equal((await p.patch('/members/' + player.id, { nick: 'ใหม่', phone: '0811111111', prefs: { theme: 'dark', lang: 'en', evil: 1 } })).json.member.nick, 'ใหม่');
  const me2 = (await p.get('/data')).json.me;
  assert.deepEqual(me2.prefs, { theme: 'dark', lang: 'en' });
});

test('docs: versioned writes, conflicts, role permissions, player cannot see plans', async () => {
  const a = new Client(srv.base), p = new Client(srv.base);
  await a.post('/auth/member', { teamCode: team.code, memberCode: assistant.code });
  await p.post('/auth/member', { teamCode: team.code, memberCode: player.code });
  let r = await coach.put('/docs/plans', { data: { x: 1 }, version: 0 });
  assert.equal(r.json.version, 1);
  r = await coach.put('/docs/plans', { data: { x: 2 }, version: 1 });
  assert.equal(r.json.version, 2);
  r = await coach.put('/docs/plans', { data: { x: 3 }, version: 1 });
  assert.equal(r.status, 409); assert.equal(r.json.current.version, 2);
  assert.equal((await coach.put('/docs/plans', { data: { x: 3 }, version: 0 })).status, 409);
  assert.equal((await coach.put('/docs/evil', { data: {}, version: 0 })).status, 400);
  assert.equal((await a.put('/docs/events', { data: [], version: 0 })).status, 403);
  assert.equal((await a.put('/docs/sessions', { data: [{ id: 's1' }], version: 0 })).status, 200);
  assert.equal((await a.put('/docs/rec:abc', { data: { sets: [] }, version: 0 })).status, 200);
  assert.equal((await p.put('/docs/sessions', { data: [], version: 1 })).status, 403);
  const pd = (await p.get('/data')).json;
  assert.ok(!pd.docs.plans); assert.ok(pd.docs.sessions);
  const cd = (await coach.get('/data')).json;
  assert.deepEqual(cd.docs.plans.data, { x: 2 });
  // etag
  const first = await coach.get('/data');
  const second = await coach.get('/data', { 'if-none-match': first.headers.get('etag') });
  assert.equal(second.status, 304);
});

test('rate limit on member login', async () => {
  const c = new Client(srv.base);
  let last;
  for (let i = 0; i < 12; i++) last = await c.post('/auth/member', { teamCode: team.code, memberCode: 'AST' + i + '9999' });
  assert.equal(last.status, 429);
});

test('deleting a member revokes their session; deleting the team removes everything', async () => {
  const p = new Client(srv.base);
  await p.call('POST', '/auth/member', { teamCode: team.code, memberCode: player.code }, { 'x-forwarded-for': '9.9.9.9' });
  assert.equal((await p.get('/data')).status, 200);
  assert.equal((await coach.del('/members/' + player.id)).status, 200);
  assert.equal((await p.get('/data')).status, 401);
  assert.equal((await coach.del('/team', { confirm: 'wrong' })).json.error, 'confirm_mismatch');
  assert.equal((await coach.del('/team', { confirm: team.code })).status, 200);
  assert.equal((await coach.get('/data')).status, 401);
  assert.equal((await new Client(srv.base).call('POST', '/auth/member', { teamCode: team.code, memberCode: assistant.code }, { 'x-forwarded-for': '8.8.8.8' })).status, 401);
});

test('bad origin is rejected for mutations', async () => {
  const c = new Client(srv.base);
  const r = await c.call('POST', '/auth/logout', {}, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});
