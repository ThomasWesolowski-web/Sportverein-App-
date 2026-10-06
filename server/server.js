'use strict';
/* =========================================================================
   Sportverein-App – Server
   Liefert die Web-App aus und stellt eine API mit Anmeldung, Rollen und
   gemeinsamer SQLite-Datenbank bereit. Keine externen Abhängigkeiten.

   Rollen:
     admin    – Vorstand / Verwaltung: darf alles (inkl. Benutzer, Anlagen, Mannschaften)
     trainer  – darf Trainingszeiten und Termine seiner Mannschaften pflegen
                sowie eigene Termine ohne Mannschaft (z. B. Sportheim-Buchung)
     mitglied – darf alles ansehen, aber nichts ändern
   ========================================================================= */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { Store, COLLECTIONS } = require('./db');
const { demoData } = require('../demo.js');

const scrypt = promisify(crypto.scrypt);

const ROLES = ['admin', 'trainer', 'mitglied'];
const EVENT_TYPES = ['spiel', 'turnier', 'veranstaltung', 'versammlung', 'vermietung', 'wartung', 'sonstiges'];
const KINDS = ['platz', 'halle', 'heim'];
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE = 'sv_session';
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const STATIC_ROOT = path.join(__dirname, '..');
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/demo.js': ['demo.js', 'text/javascript; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
};

/* ---------- Fehler & Validierung ---------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = msg => new HttpError(400, msg);
const forbidden = (msg = 'Keine Berechtigung für diese Aktion.') => new HttpError(403, msg);
const notFound = (msg = 'Nicht gefunden.') => new HttpError(404, msg);

function text(v, max, label, required = false) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(`${label}: Text erwartet.`);
  v = v.trim();
  if (required && !v) throw bad(`${label} fehlt.`);
  if (v.length > max) throw bad(`${label} ist zu lang (max. ${max} Zeichen).`);
  return v;
}
function isDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function date(v, label, required = true) {
  if (!required && (v === undefined || v === null || v === '')) return '';
  if (!isDate(v)) throw bad(`${label}: ungültiges Datum.`);
  return v;
}
function timeRange(start, end) {
  if (!TIME_RE.test(start || '') || !TIME_RE.test(end || '')) throw bad('Ungültige Uhrzeit.');
  if (end <= start) throw bad('Das Ende muss nach dem Beginn liegen.');
  return { start, end };
}
function id(v, label = 'ID') {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw bad(`${label} ungültig.`);
  return v;
}
const newId = () => crypto.randomBytes(6).toString('base64url');

/* ---------- Bereinigung / Prüfung der Datensätze ---------- */
function cleanTeam(input, teamId) {
  const color = typeof input.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color.toLowerCase() : '#16a34a';
  return {
    id: teamId,
    name: text(input.name, 80, 'Name', true),
    sport: text(input.sport, 60, 'Sportart'),
    icon: text(input.icon, 8, 'Symbol') || '🏅',
    color,
    trainer: text(input.trainer, 80, 'Trainer'),
    contact: text(input.contact, 40, 'Kontakt'),
  };
}

function cleanFacility(input, facId) {
  if (!KINDS.includes(input.kind)) throw bad('Ungültiger Anlagentyp.');
  if (!Array.isArray(input.units) || input.units.length < 1) throw bad('Eine Anlage braucht mindestens einen Bereich.');
  if (input.units.length > 30) throw bad('Zu viele Bereiche (max. 30).');
  const seen = new Set();
  const units = input.units.map(u => {
    const uid = u && typeof u.id === 'string' && ID_RE.test(u.id) && !seen.has(u.id) ? u.id : newId();
    seen.add(uid);
    return { id: uid, name: text(u && u.name, 40, 'Bereichsname', true) };
  });
  return {
    id: facId,
    kind: input.kind,
    name: text(input.name, 80, 'Name', true),
    info: text(input.info, 120, 'Beschreibung'),
    icon: text(input.icon, 8, 'Symbol'),
    units,
  };
}

function checkPlace(store, facilityId, unitIds) {
  const fac = typeof facilityId === 'string' ? store.get('facilities', facilityId) : null;
  if (!fac) throw bad('Unbekannte Anlage.');
  if (!Array.isArray(unitIds) || !unitIds.length) throw bad('Bitte mindestens einen Bereich wählen.');
  const valid = new Set(fac.units.map(u => u.id));
  const units = [...new Set(unitIds)];
  if (units.some(u => !valid.has(u))) throw bad('Unbekannter Bereich.');
  return units;
}

function cleanTraining(store, input, trId) {
  const team = typeof input.teamId === 'string' ? store.get('teams', input.teamId) : null;
  if (!team) throw bad('Unbekannte Mannschaft.');
  const weekday = Number(input.weekday);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw bad('Ungültiger Wochentag.');
  const { start, end } = timeRange(input.start, input.end);
  const validFrom = date(input.validFrom, 'Gültig ab', false);
  const validTo = date(input.validTo, 'Gültig bis', false);
  if (validFrom && validTo && validTo < validFrom) throw bad('„Gültig bis“ liegt vor „Gültig ab“.');
  const skipDates = Array.isArray(input.skipDates) ? [...new Set(input.skipDates.filter(isDate))].sort().slice(-500) : [];
  return {
    id: trId, teamId: team.id, weekday, start, end,
    facilityId: input.facilityId, unitIds: checkPlace(store, input.facilityId, input.unitIds),
    validFrom, validTo, skipDates, note: text(input.note, 500, 'Notiz'),
  };
}

function cleanEvent(store, input, evId) {
  let teamId = null;
  if (input.teamId) {
    if (!store.get('teams', input.teamId)) throw bad('Unbekannte Mannschaft.');
    teamId = input.teamId;
  }
  if (!EVENT_TYPES.includes(input.type)) throw bad('Ungültige Terminart.');
  const { start, end } = timeRange(input.start, input.end);
  return {
    id: evId,
    title: text(input.title, 120, 'Titel', true),
    type: input.type,
    teamId,
    facilityId: input.facilityId,
    unitIds: checkPlace(store, input.facilityId, input.unitIds),
    date: date(input.date, 'Datum'),
    start, end,
    note: text(input.note, 1000, 'Notiz'),
  };
}

/* ---------- Abhängige Daten bei Löschungen bereinigen ---------- */
function removeTeam(store, teamId) {
  store.del('teams', teamId);
  for (const t of store.all('trainings')) if (t.teamId === teamId) store.del('trainings', t.id);
  for (const e of store.all('events')) if (e.teamId === teamId) store.put('events', { ...e, teamId: null });
}
function removeFacility(store, facId) {
  store.del('facilities', facId);
  for (const col of ['trainings', 'events']) {
    for (const x of store.all(col)) if (x.facilityId === facId) store.del(col, x.id);
  }
}
/** Nach Änderung der Bereiche: Buchungen auf entfernte Bereiche anpassen bzw. löschen */
function stripUnits(store, fac) {
  const valid = new Set(fac.units.map(u => u.id));
  for (const col of ['trainings', 'events']) {
    for (const x of store.all(col)) {
      if (x.facilityId !== fac.id) continue;
      const units = x.unitIds.filter(u => valid.has(u));
      if (!units.length) store.del(col, x.id);
      else if (units.length !== x.unitIds.length) store.put(col, { ...x, unitIds: units });
    }
  }
}

/* ---------- Berechtigungen ---------- */
const isAdmin = u => u.role === 'admin';
const ownsTeam = (u, teamId) => u.role === 'trainer' && !!teamId && u.teamIds.includes(teamId);
const canTraining = (u, t) => isAdmin(u) || ownsTeam(u, t.teamId);
const canEvent = (u, e) => isAdmin(u) || ownsTeam(u, e.teamId) ||
  (u.role === 'trainer' && !e.teamId && e.createdBy === u.id);
function requireAdmin(u) { if (!isAdmin(u)) throw forbidden('Nur für Administratoren.'); }

const publicUser = u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, teamIds: u.teamIds });

/* ---------- Passwörter & Sitzungen ---------- */
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(String(pw), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
function checkNewPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw bad('Das Passwort muss mindestens 8 Zeichen lang sein.');
  if (pw.length > 200) throw bad('Das Passwort ist zu lang.');
  return pw;
}
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* ---------- App ---------- */
function createApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const store = new Store(opts.dbFile || path.join(dataDir, 'sportverein.db'));
  const log = opts.log || (msg => console.log(msg));
  const trustProxy = opts.trustProxy ?? process.env.TRUST_PROXY === '1';
  const secureCookie = opts.secureCookie ?? process.env.COOKIE_SECURE;
  const ready = init();

  async function init() {
    if (!store.getMeta('initialized')) {
      const seed = opts.seedDemo ?? process.env.SEED_DEMO !== '0';
      store.tx(() => {
        if (seed) {
          const demo = demoData();
          store.setMeta('club_name', demo.club.name);
          for (const c of COLLECTIONS) demo[c].forEach(x => store.put(c, x));
        } else {
          store.setMeta('club_name', 'Mein Sportverein');
        }
        store.setMeta('initialized', '1');
        store.bump();
      });
    }
    if (store.userCount() === 0) {
      const given = opts.adminPassword || process.env.ADMIN_PASSWORD;
      const pw = given || crypto.randomBytes(9).toString('base64url');
      store.insertUser({ id: newId(), username: 'admin', displayName: 'Administrator', role: 'admin', teamIds: [], pwHash: await hashPassword(pw) });
      log(given
        ? 'Administrator „admin“ wurde mit dem Passwort aus ADMIN_PASSWORD angelegt.'
        : `\n  Erster Start: Administrator angelegt\n  Benutzer: admin\n  Passwort: ${pw}\n  Bitte nach der ersten Anmeldung unter ⚙️ Einstellungen ändern.\n`);
    }
    store.purgeSessions();
  }

  /* Anmeldeversuche begrenzen (pro IP) */
  const attempts = new Map();
  const LIMIT = 10, WINDOW = 15 * 60 * 1000;
  function clientIp(req) {
    if (trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    return req.socket.remoteAddress || '';
  }
  function checkRate(ip) {
    const a = attempts.get(ip);
    if (a && a.until > Date.now() && a.n >= LIMIT) throw new HttpError(429, 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');
  }
  function failRate(ip) {
    const a = attempts.get(ip);
    if (!a || a.until < Date.now()) attempts.set(ip, { n: 1, until: Date.now() + WINDOW });
    else a.n++;
  }

  function isHttps(req) {
    if (secureCookie === '1' || secureCookie === true) return true;
    if (secureCookie === '0' || secureCookie === false) return false;
    return trustProxy && req.headers['x-forwarded-proto'] === 'https';
  }
  function sessionCookie(req, token, maxAgeSec) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isHttps(req) ? '; Secure' : ''}`;
  }

  function mutated() { store.bump(); return { ok: true, version: store.version() }; }

  /* ---------- Routen ---------- */
  const routes = [];
  const route = (method, pattern, handler, auth = true) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, auth });
  };

  route('GET', '/api/health', () => ({ ok: true, server: true }), false);

  route('POST', '/api/login', async (req, { body }) => {
    const ip = clientIp(req);
    checkRate(ip);
    const user = typeof body.username === 'string' ? store.userByName(body.username.trim()) : null;
    // Auch bei unbekanntem Benutzer rechnen, damit die Antwortzeit nichts verrät
    const ok = await verifyPassword(body.password || '', user ? user.pwHash : 'scrypt$00$' + '00'.repeat(64));
    if (!user || !ok) { failRate(ip); throw new HttpError(401, 'Benutzername oder Passwort falsch.'); }
    attempts.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    store.createSession(sha256(token), user.id, Date.now() + SESSION_MS);
    return { status: 200, body: { user: publicUser(user) }, headers: { 'Set-Cookie': sessionCookie(req, token, SESSION_MS / 1000) } };
  }, false);

  route('POST', '/api/logout', (req, { token }) => {
    if (token) store.deleteSession(sha256(token));
    return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': sessionCookie(req, '', 0) } };
  }, false);

  route('GET', '/api/me', (req, { user }) => ({ user: publicUser(user) }));

  route('PUT', '/api/me/password', async (req, { user, body, token }) => {
    if (!(await verifyPassword(body.current || '', user.pwHash))) throw bad('Das aktuelle Passwort ist falsch.');
    user.pwHash = await hashPassword(checkNewPassword(body.next));
    store.updateUser(user);
    store.deleteUserSessions(user.id, sha256(token));
    return { ok: true };
  });

  route('GET', '/api/version', () => ({ version: store.version() }));
  route('GET', '/api/data', () => store.snapshot());

  route('PUT', '/api/club', (req, { user, body }) => {
    requireAdmin(user);
    store.setMeta('club_name', text(body.name, 80, 'Vereinsname', true));
    return mutated();
  });

  /* Mannschaften */
  route('POST', '/api/teams', (req, { user, body }) => {
    requireAdmin(user);
    const team = store.put('teams', cleanTeam(body, newId()));
    return { ...mutated(), item: team };
  });
  route('PUT', '/api/teams/:id', (req, { user, body, params }) => {
    requireAdmin(user);
    if (!store.get('teams', params.id)) throw notFound();
    const team = store.put('teams', cleanTeam(body, params.id));
    return { ...mutated(), item: team };
  });
  route('DELETE', '/api/teams/:id', (req, { user, params }) => {
    requireAdmin(user);
    if (!store.get('teams', params.id)) throw notFound();
    store.tx(() => removeTeam(store, params.id));
    return mutated();
  });

  /* Anlagen */
  route('POST', '/api/facilities', (req, { user, body }) => {
    requireAdmin(user);
    const fac = store.put('facilities', cleanFacility(body, newId()));
    return { ...mutated(), item: fac };
  });
  route('PUT', '/api/facilities/:id', (req, { user, body, params }) => {
    requireAdmin(user);
    if (!store.get('facilities', params.id)) throw notFound();
    const fac = cleanFacility(body, params.id);
    store.tx(() => { store.put('facilities', fac); stripUnits(store, fac); });
    return { ...mutated(), item: fac };
  });
  route('DELETE', '/api/facilities/:id', (req, { user, params }) => {
    requireAdmin(user);
    if (!store.get('facilities', params.id)) throw notFound();
    store.tx(() => removeFacility(store, params.id));
    return mutated();
  });

  /* Trainingszeiten */
  route('POST', '/api/trainings', (req, { user, body }) => {
    const tr = cleanTraining(store, body, newId());
    if (!canTraining(user, tr)) throw forbidden('Du darfst nur Trainingszeiten deiner Mannschaften anlegen.');
    store.put('trainings', tr);
    return { ...mutated(), item: tr };
  });
  route('PUT', '/api/trainings/:id', (req, { user, body, params }) => {
    const old = store.get('trainings', params.id);
    if (!old) throw notFound();
    const tr = cleanTraining(store, { skipDates: old.skipDates, ...body }, params.id);
    if (!canTraining(user, old) || !canTraining(user, tr)) throw forbidden();
    store.put('trainings', tr);
    return { ...mutated(), item: tr };
  });
  route('DELETE', '/api/trainings/:id', (req, { user, params }) => {
    const old = store.get('trainings', params.id);
    if (!old) throw notFound();
    if (!canTraining(user, old)) throw forbidden();
    store.del('trainings', params.id);
    return mutated();
  });
  route('POST', '/api/trainings/:id/skip', (req, { user, body, params }) => {
    const tr = store.get('trainings', params.id);
    if (!tr) throw notFound();
    if (!canTraining(user, tr)) throw forbidden();
    const d = date(body.date, 'Datum');
    const set = new Set(tr.skipDates || []);
    if (body.skip) set.add(d); else set.delete(d);
    tr.skipDates = [...set].sort().slice(-500);
    store.put('trainings', tr);
    return { ...mutated(), item: tr };
  });

  /* Termine / Buchungen */
  route('POST', '/api/events', (req, { user, body }) => {
    if (user.role === 'mitglied') throw forbidden();
    const ev = { ...cleanEvent(store, body, newId()), createdBy: user.id, createdByName: user.displayName || user.username };
    if (!canEvent(user, ev)) throw forbidden('Du darfst nur Termine für deine Mannschaften anlegen.');
    store.put('events', ev);
    return { ...mutated(), item: ev };
  });
  route('PUT', '/api/events/:id', (req, { user, body, params }) => {
    const old = store.get('events', params.id);
    if (!old) throw notFound();
    const ev = { ...cleanEvent(store, body, params.id), createdBy: old.createdBy || null, createdByName: old.createdByName || '' };
    if (!canEvent(user, old) || !canEvent(user, ev)) throw forbidden();
    store.put('events', ev);
    return { ...mutated(), item: ev };
  });
  route('DELETE', '/api/events/:id', (req, { user, params }) => {
    const old = store.get('events', params.id);
    if (!old) throw notFound();
    if (!canEvent(user, old)) throw forbidden();
    store.del('events', params.id);
    return mutated();
  });

  /* Benutzerverwaltung */
  function cleanUserInput(body, existing) {
    const username = text(body.username, 40, 'Benutzername', true);
    if (!/^[A-Za-z0-9._@-]+$/.test(username)) throw bad('Benutzername: nur Buchstaben, Ziffern und . _ - @ erlaubt.');
    const other = store.userByName(username);
    if (other && (!existing || other.id !== existing.id)) throw bad('Dieser Benutzername ist bereits vergeben.');
    if (!ROLES.includes(body.role)) throw bad('Ungültige Rolle.');
    const teamIds = body.role === 'trainer' && Array.isArray(body.teamIds)
      ? [...new Set(body.teamIds.filter(t => typeof t === 'string' && store.get('teams', t)))] : [];
    return { username, displayName: text(body.displayName, 80, 'Name'), role: body.role, teamIds };
  }
  route('GET', '/api/users', (req, { user }) => {
    requireAdmin(user);
    return { users: store.listUsers().map(publicUser) };
  });
  route('POST', '/api/users', async (req, { user, body }) => {
    requireAdmin(user);
    const u = { id: newId(), ...cleanUserInput(body, null), pwHash: await hashPassword(checkNewPassword(body.password)) };
    store.insertUser(u);
    return { ok: true, user: publicUser(u) };
  });
  route('PUT', '/api/users/:id', async (req, { user, body, params }) => {
    requireAdmin(user);
    const u = store.userById(params.id);
    if (!u) throw notFound();
    const next = { ...u, ...cleanUserInput(body, u) };
    const admins = store.listUsers().filter(x => x.role === 'admin');
    if (u.role === 'admin' && next.role !== 'admin' && admins.length <= 1) throw bad('Es muss mindestens einen Administrator geben.');
    if (body.password) next.pwHash = await hashPassword(checkNewPassword(body.password));
    store.updateUser(next);
    if (body.password || next.role !== u.role) store.deleteUserSessions(u.id, '');
    return { ok: true, user: publicUser(next) };
  });
  route('DELETE', '/api/users/:id', (req, { user, params }) => {
    requireAdmin(user);
    const u = store.userById(params.id);
    if (!u) throw notFound();
    if (u.id === user.id) throw bad('Du kannst dich nicht selbst löschen.');
    store.deleteUser(u.id);
    return { ok: true };
  });

  /* Import / Beispieldaten */
  function replaceAll(src) {
    if (!src || !Array.isArray(src.teams) || !Array.isArray(src.facilities)) throw bad('Ungültiges Dateiformat.');
    store.tx(() => {
      store.clearData();
      store.setMeta('club_name', text(src.club && src.club.name, 80, 'Vereinsname') || 'Sportverein');
      src.facilities.forEach(f => store.put('facilities', cleanFacility(f, id(f.id, 'Anlagen-ID'))));
      src.teams.forEach(t => store.put('teams', cleanTeam(t, id(t.id, 'Mannschafts-ID'))));
      (src.trainings || []).forEach(t => store.put('trainings', cleanTraining(store, t, id(t.id, 'Trainings-ID'))));
      (src.events || []).forEach(e => store.put('events', {
        ...cleanEvent(store, e, id(e.id, 'Termin-ID')),
        createdBy: typeof e.createdBy === 'string' ? e.createdBy : null,
        createdByName: typeof e.createdByName === 'string' ? e.createdByName.slice(0, 80) : '',
      }));
    });
  }
  route('POST', '/api/import', (req, { user, body }) => {
    requireAdmin(user);
    replaceAll(body);
    return mutated();
  });
  route('POST', '/api/reset-demo', (req, { user }) => {
    requireAdmin(user);
    replaceAll(demoData());
    return mutated();
  });

  /* ---------- HTTP-Verarbeitung ---------- */
  const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  };

  function send(res, status, body, headers = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(payload);
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', c => {
        size += c.length;
        if (size > limit) { reject(new HttpError(413, 'Anfrage zu groß.')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    const entry = STATIC_FILES[pathname];
    if (!entry || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden');
      return;
    }
    fs.readFile(path.join(STATIC_ROOT, entry[0]), (err, buf) => {
      if (err) { res.writeHead(500); res.end(); return; }
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': entry[1], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  async function handle(req, res) {
    await ready;
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    try {
      const match = routes.map(r => ({ r, m: r.method === req.method && pathname.match(r.re) })).find(x => x.m);
      if (!match) throw notFound('Unbekannte API-Adresse.');
      const { r, m } = match;

      let body = {};
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // Schutz vor CSRF: Änderungen nur per JSON (fremde Seiten können das nicht ohne Erlaubnis senden)
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'JSON erwartet.');
        const raw = await readBody(req, pathname === '/api/import' ? 5 * 1024 * 1024 : 256 * 1024);
        if (raw) {
          try { body = JSON.parse(raw); } catch { throw bad('Ungültiges JSON.'); }
          if (!body || typeof body !== 'object') throw bad('Ungültige Anfrage.');
        }
      }

      const token = parseCookies(req.headers.cookie)[COOKIE] || '';
      const user = token ? store.sessionUser(sha256(token)) : null;
      if (r.auth && !user) throw new HttpError(401, 'Bitte anmelden.');

      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      const result = await r.handler(req, { user, body, params, token });
      if (result && result.status) send(res, result.status, result.body, result.headers);
      else send(res, 200, result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      log(`Fehler bei ${req.method} ${pathname}: ${err && err.stack || err}`);
      send(res, 500, { error: 'Interner Fehler.' });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      log(`Unerwarteter Fehler: ${err && err.stack || err}`);
      if (!res.headersSent) { res.writeHead(500); res.end(); }
    });
  });
  setInterval(() => store.purgeSessions(), 6 * 60 * 60 * 1000).unref();

  return { server, store, ready };
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const { server } = createApp();
  server.listen(port, host, () => console.log(`Sportverein-App läuft auf http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
