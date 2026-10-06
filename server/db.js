'use strict';
/* Datenbankschicht (SQLite, in Node.js eingebaut – keine externen Pakete nötig) */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const COLLECTIONS = ['teams', 'facilities', 'trainings', 'events'];

class Store {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items (
        collection TEXT NOT NULL,
        id         TEXT NOT NULL,
        sort       INTEGER NOT NULL,
        data       TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE TABLE IF NOT EXISTS users (
        id           TEXT PRIMARY KEY,
        username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL DEFAULT '',
        role         TEXT NOT NULL,
        team_ids     TEXT NOT NULL DEFAULT '[]',
        pw_hash      TEXT NOT NULL,
        created_at   INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      PRAGMA foreign_keys = ON;
    `);
  }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /* ---------- Meta ---------- */
  getMeta(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : fallback;
  }
  setMeta(key, value) {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
  }
  version() { return Number(this.getMeta('data_version', '0')); }
  bump() { this.setMeta('data_version', this.version() + 1); }

  /* ---------- Vereinsdaten ---------- */
  all(col) {
    return this.db.prepare('SELECT data FROM items WHERE collection = ? ORDER BY sort, rowid').all(col).map(r => JSON.parse(r.data));
  }
  get(col, id) {
    const row = this.db.prepare('SELECT data FROM items WHERE collection = ? AND id = ?').get(col, id);
    return row ? JSON.parse(row.data) : null;
  }
  put(col, item) {
    const existing = this.db.prepare('SELECT sort FROM items WHERE collection = ? AND id = ?').get(col, item.id);
    const sort = existing ? existing.sort
      : (this.db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM items WHERE collection = ?').get(col).s);
    this.db.prepare(`INSERT INTO items (collection, id, sort, data) VALUES (?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data`).run(col, item.id, sort, JSON.stringify(item));
    return item;
  }
  del(col, id) {
    return this.db.prepare('DELETE FROM items WHERE collection = ? AND id = ?').run(col, id).changes > 0;
  }
  clearData() { this.db.prepare('DELETE FROM items').run(); }

  snapshot() {
    const out = { version: this.version(), club: { name: this.getMeta('club_name', 'Sportverein') } };
    for (const c of COLLECTIONS) out[c] = this.all(c);
    return out;
  }

  /* ---------- Benutzer ---------- */
  userCount() { return this.db.prepare('SELECT COUNT(*) AS n FROM users').get().n; }
  listUsers() { return this.db.prepare('SELECT * FROM users ORDER BY username').all().map(rowToUser); }
  userById(id) { return rowToUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id)); }
  userByName(name) { return rowToUser(this.db.prepare('SELECT * FROM users WHERE username = ?').get(name)); }
  insertUser(u) {
    this.db.prepare(`INSERT INTO users (id, username, display_name, role, team_ids, pw_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(u.id, u.username, u.displayName, u.role, JSON.stringify(u.teamIds), u.pwHash, Date.now());
  }
  updateUser(u) {
    this.db.prepare('UPDATE users SET username = ?, display_name = ?, role = ?, team_ids = ?, pw_hash = ? WHERE id = ?')
      .run(u.username, u.displayName, u.role, JSON.stringify(u.teamIds), u.pwHash, u.id);
  }
  deleteUser(id) { this.db.prepare('DELETE FROM users WHERE id = ?').run(id); }

  /* ---------- Sitzungen ---------- */
  createSession(tokenHash, userId, expiresAt) {
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt);
  }
  sessionUser(tokenHash) {
    const row = this.db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash, Date.now());
    return rowToUser(row);
  }
  deleteSession(tokenHash) { this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); }
  deleteUserSessions(userId, exceptHash = '') {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, exceptHash);
  }
  purgeSessions() { this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()); }

  close() { this.db.close(); }
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id, username: row.username, displayName: row.display_name, role: row.role,
    teamIds: JSON.parse(row.team_ids || '[]'), pwHash: row.pw_hash, createdAt: row.created_at,
  };
}

module.exports = { Store, COLLECTIONS };
