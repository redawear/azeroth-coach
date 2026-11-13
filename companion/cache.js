'use strict';
const { DatabaseSync } = require('node:sqlite');
class Cache {
  constructor(file, clock = Date.now) {
    this.clock = clock;
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entries(kind TEXT, key TEXT, value TEXT, expires INTEGER, PRIMARY KEY(kind,key));
      CREATE TABLE IF NOT EXISTS history_v2(id INTEGER PRIMARY KEY, session TEXT, role TEXT, text TEXT, extra TEXT);
      CREATE TABLE IF NOT EXISTS usage(id INTEGER PRIMARY KEY, at INTEGER, job TEXT, tokens INTEGER DEFAULT 0);`);
    this.db.prepare('DELETE FROM entries WHERE expires < ?').run(clock());
    this.db.prepare('DELETE FROM usage WHERE at < ?').run(clock() - 31 * 86400000);
  }
  get(kind, key) {
    const row = this.db.prepare('SELECT value FROM entries WHERE kind=? AND key=? AND expires>?').get(kind, key, this.clock());
    return row ? JSON.parse(row.value) : null;
  }
  put(kind, key, value, ttl) {
    this.db.prepare('INSERT OR REPLACE INTO entries VALUES(?,?,?,?)').run(kind, key, JSON.stringify(value), this.clock() + ttl);
    return value;
  }
  reserve(job, limit) {
    const rows = this.db.prepare('SELECT at FROM usage WHERE job=? AND at>? ORDER BY at').all(job, this.clock() - 3600000);
    if (rows.length >= limit) return { ok: false, minutes: rows.length ? Math.max(1, Math.ceil((rows[0].at + 3600000 - this.clock()) / 60000)) : 60 };
    const result = this.db.prepare('INSERT INTO usage(at,job) VALUES(?,?)').run(this.clock(), job);
    return { ok: true, id: Number(result.lastInsertRowid) };
  }
  tokens(id, count) { this.db.prepare('UPDATE usage SET tokens=? WHERE id=?').run(Number(count) || 0, id); }
  addHistory(role, text, extra = {}, session = '') {
    this.db.prepare('INSERT INTO history_v2(session,role,text,extra) VALUES(?,?,?,?)').run(session, role, text, JSON.stringify(extra));
    this.db.prepare('DELETE FROM history_v2 WHERE session=? AND id NOT IN (SELECT id FROM history_v2 WHERE session=? ORDER BY id DESC LIMIT 50)').run(session, session);
  }
  history(limit = 50, session = '') {
    return this.db.prepare('SELECT role,text,extra FROM history_v2 WHERE session=? ORDER BY id DESC LIMIT ?').all(session, limit).reverse().map(row => ({ role: row.role, text: row.text, ...JSON.parse(row.extra) }));
  }
  usage() { return this.db.prepare('SELECT job, COUNT(*) AS runs, SUM(tokens) AS tokens FROM usage WHERE at>? GROUP BY job').all(this.clock() - 86400000); }
  close() { this.db.close(); }
}
module.exports = { Cache };
