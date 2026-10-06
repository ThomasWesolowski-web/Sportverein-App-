'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/server.js');

let app, base, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-test-'));
  app = createApp({ dataDir: dir, adminPassword: 'admin-passwort', seedDemo: true, log: () => {} });
  await app.ready;
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => {
  app.server.close();
  app.store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Kleiner Client mit Cookie-Speicher */
function client() {
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    // wie die App: Änderungen immer als JSON senden
    if (method !== 'GET' && body === undefined && !headers['Content-Type']) body = {};
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch { /* kein JSON */ }
    return { status: res.status, body: json, headers: res.headers };
  };
  call.login = async (username, password) => {
    const r = await call('POST', '/api/login', { username, password });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.user;
  };
  return call;
}

test('Gesundheitscheck und Schutz ohne Anmeldung', async () => {
  const c = client();
  assert.deepEqual((await c('GET', '/api/health')).body, { ok: true, server: true });
  assert.equal((await c('GET', '/api/data')).status, 401);
});

test('Statische Dateien: nur freigegebene Dateien werden ausgeliefert', async () => {
  const ok = await fetch(base + '/');
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /<title>Sportverein<\/title>/);
  assert.match(ok.headers.get('content-security-policy'), /default-src 'self'/);
  for (const p of ['/server/db.js', '/server/server.js', '/package.json', '/data/sportverein.db', '/../server/db.js', '/.git/config']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
});

test('Anmeldung: falsches Passwort, richtiges Passwort, Daten', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/login', { username: 'admin', password: 'falsch' })).status, 401);
  const user = await c.login('ADMIN', 'admin-passwort'); // Groß-/Kleinschreibung egal
  assert.equal(user.role, 'admin');
  assert.equal(user.pwHash, undefined, 'Passwort-Hash darf nie ausgeliefert werden');
  const d = (await c('GET', '/api/data')).body;
  assert.equal(d.teams.length, 4);
  assert.equal(d.facilities.length, 6);
  assert.ok(d.events.length > 0);
});

test('CSRF-Schutz: Änderungen nur mit JSON', async () => {
  const c = client();
  await c.login('admin', 'admin-passwort');
  const r = await c('PUT', '/api/club', undefined, { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(r.status, 415);
});

test('Rollen: Trainer darf nur eigene Mannschaft, Mitglied nur lesen', async () => {
  const admin = client();
  await admin.login('admin', 'admin-passwort');
  assert.equal((await admin('POST', '/api/users', { username: 'lena', displayName: 'Lena', role: 'trainer', teamIds: ['bb'], password: 'trainer-pw-1' })).status, 200);
  assert.equal((await admin('POST', '/api/users', { username: 'max', role: 'mitglied', password: 'mitglied-pw' })).status, 200);
  assert.equal((await admin('POST', '/api/users', { username: 'lena', role: 'mitglied', password: 'xxxxxxxx' })).status, 400, 'doppelter Name');
  assert.equal((await admin('POST', '/api/users', { username: 'kurz', role: 'mitglied', password: 'kurz' })).status, 400, 'zu kurzes Passwort');

  const trainer = client();
  await trainer.login('lena', 'trainer-pw-1');
  const ev = { title: 'Testspiel', type: 'spiel', teamId: 'bb', facilityId: 'h1', unitIds: ['h1-1'], date: '2030-05-04', start: '10:00', end: '12:00' };
  const created = await trainer('POST', '/api/events', ev);
  assert.equal(created.status, 200);
  assert.equal(created.body.item.createdByName, 'Lena');
  assert.equal((await trainer('POST', '/api/events', { ...ev, teamId: 'fb1' })).status, 403);
  assert.equal((await trainer('PUT', `/api/events/${created.body.item.id}`, { ...ev, teamId: 'fb1' })).status, 403, 'nicht auf fremde Mannschaft umbuchen');
  assert.equal((await trainer('PUT', '/api/events/e1', { ...ev, teamId: 'bb' })).status, 403, 'fremden Termin nicht ändern');
  // Eigene Buchung ohne Mannschaft (z. B. Sportheim) ist erlaubt und bleibt änderbar
  const own = await trainer('POST', '/api/events', { ...ev, teamId: null, facilityId: 'heim', unitIds: ['heim-1'] });
  assert.equal(own.status, 200);
  assert.equal((await trainer('DELETE', `/api/events/${own.body.item.id}`)).status, 200);

  assert.equal((await trainer('PUT', '/api/teams/bb', { name: 'X' })).status, 403);
  assert.equal((await trainer('POST', '/api/trainings/t5/skip', { date: '2030-05-06', skip: true })).status, 200);
  assert.equal((await trainer('POST', '/api/trainings/t1/skip', { date: '2030-05-07', skip: true })).status, 403);
  assert.equal((await trainer('GET', '/api/users')).status, 403);

  const member = client();
  await member.login('max', 'mitglied-pw');
  assert.equal((await member('GET', '/api/data')).status, 200);
  assert.equal((await member('POST', '/api/events', ev)).status, 403);
  assert.equal((await member('POST', '/api/trainings/t5/skip', { date: '2030-05-06', skip: false })).status, 403);
});

test('Validierung von Terminen', async () => {
  const c = client();
  await c.login('admin', 'admin-passwort');
  const ev = { title: 'X', type: 'spiel', teamId: null, facilityId: 'p1', unitIds: ['p1-1'], date: '2030-01-01', start: '10:00', end: '12:00' };
  assert.equal((await c('POST', '/api/events', { ...ev, end: '09:00' })).status, 400);
  assert.equal((await c('POST', '/api/events', { ...ev, unitIds: ['h1-1'] })).status, 400);
  assert.equal((await c('POST', '/api/events', { ...ev, date: '2030-02-30' })).status, 400);
  assert.equal((await c('POST', '/api/events', { ...ev, type: 'quatsch' })).status, 400);
  assert.equal((await c('POST', '/api/events', { ...ev, title: '   ' })).status, 400);
  const ok = await c('POST', '/api/events', { ...ev, title: '<script>alert(1)</script>' });
  assert.equal(ok.status, 200, 'Text wird gespeichert (die App gibt ihn escaped aus)');
});

test('Bereiche entfernen passt Buchungen an, Mannschaft löschen räumt auf, Version steigt', async () => {
  const c = client();
  await c.login('admin', 'admin-passwort');
  const v0 = (await c('GET', '/api/version')).body.version;
  const p1 = (await c('GET', '/api/data')).body.facilities.find(f => f.id === 'p1');
  const r = await c('PUT', '/api/facilities/p1', { ...p1, units: p1.units.filter(u => u.id !== 'p1-2') });
  assert.equal(r.status, 200);
  let d = (await c('GET', '/api/data')).body;
  assert.deepEqual(d.events.find(e => e.id === 'e1').unitIds, ['p1-1']);
  assert.ok(d.version > v0);

  assert.equal((await c('DELETE', '/api/teams/kendo')).status, 200);
  d = (await c('GET', '/api/data')).body;
  assert.equal(d.trainings.filter(t => t.teamId === 'kendo').length, 0);
  assert.equal(d.events.find(e => e.id === 'e6').teamId, null);
});

test('Passwort ändern meldet andere Geräte ab', async () => {
  const admin = client();
  await admin.login('admin', 'admin-passwort');
  await admin('POST', '/api/users', { username: 'pwtest', role: 'mitglied', password: 'erstes-pw' });
  const a = client(), b = client();
  await a.login('pwtest', 'erstes-pw');
  await b.login('pwtest', 'erstes-pw');
  assert.equal((await a('PUT', '/api/me/password', { current: 'falsch', next: 'zweites-pw' })).status, 400);
  assert.equal((await a('PUT', '/api/me/password', { current: 'erstes-pw', next: 'zweites-pw' })).status, 200);
  assert.equal((await a('GET', '/api/me')).status, 200, 'aktuelles Gerät bleibt angemeldet');
  assert.equal((await b('GET', '/api/me')).status, 401, 'anderes Gerät wird abgemeldet');
  await client().login('pwtest', 'zweites-pw');
});

test('Letzter Administrator kann nicht entfernt werden, Abmelden beendet Sitzung', async () => {
  const c = client();
  const me = await c.login('admin', 'admin-passwort');
  assert.equal((await c('PUT', `/api/users/${me.id}`, { username: 'admin', role: 'mitglied' })).status, 400);
  assert.equal((await c('DELETE', `/api/users/${me.id}`)).status, 400);
  assert.equal((await c('POST', '/api/logout', {})).status, 200);
  assert.equal((await c('GET', '/api/me')).status, 401);
});

test('Import und Beispieldaten', async () => {
  const c = client();
  await c.login('admin', 'admin-passwort');
  const snap = (await c('GET', '/api/data')).body;
  assert.equal((await c('POST', '/api/import', { teams: 'kaputt' })).status, 400);
  const broken = { ...snap, trainings: [...snap.trainings, { id: 'x1', teamId: 'gibtsnicht', weekday: 1, start: '10:00', end: '11:00', facilityId: 'p1', unitIds: ['p1-1'] }] };
  assert.equal((await c('POST', '/api/import', broken)).status, 400);
  assert.equal((await c('GET', '/api/data')).body.events.length, snap.events.length, 'fehlgeschlagener Import ändert nichts');
  assert.equal((await c('POST', '/api/reset-demo', {})).status, 200);
  const d = (await c('GET', '/api/data')).body;
  assert.equal(d.teams.length, 4);
});

test('Begrenzung der Anmeldeversuche', async () => {
  const c = client();
  for (let i = 0; i < 10; i++) await c('POST', '/api/login', { username: 'admin', password: 'falsch' + i });
  assert.equal((await c('POST', '/api/login', { username: 'admin', password: 'admin-passwort' })).status, 429);
});
