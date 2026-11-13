#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./config');
const { Cache } = require('./cache');
const { jobsFromStrip } = require('./protocol');
const { cleanRuns, fallbackReader } = require('./recovery');
const { Publisher } = require('./publisher');
const { Jobs } = require('./jobs');
const { Capture } = require('./supervisor');
function start() {
  if (process.platform !== 'win32') throw new Error('The screen companion needs Windows. Logic tests also run on Linux.');
  const cfg = loadConfig();
  if (!fs.existsSync(path.join(cfg.addonDir, 'AzerothCoach', 'AzerothCoach.toc'))) throw new Error('Addon not found. Run npm run setup first.');
  const lock = path.join(cfg.runtime, 'companion.lock');
  try {
    const old = JSON.parse(fs.readFileSync(lock, 'utf8'));
    let alive = false; try { process.kill(old.pid, 0); alive = true; } catch {}
    if (alive) throw new Error('The companion is already running.');
    fs.rmSync(lock, { force: true });
  } catch (error) { if (error.message === 'The companion is already running.') throw error; }
  const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); fs.closeSync(fd);
  function log(text) {
    const file = path.join(cfg.runtime, 'companion.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, file + '.old');
    const line = new Date().toISOString() + ' ' + text; console.log(line); fs.appendFileSync(file, line + '\n');
  }
  // Delete image files left by a crash. No screenshot history survives startup.
  cleanRuns(cfg.runtime);
  const cache = new Cache(path.join(cfg.runtime, 'cache.sqlite'));
  const publisher = new Publisher(cfg, cache, { log });
  const active = new Set();
  const capture = new Capture(cfg, payload => jobsFromStrip(payload).forEach(accept), log);
  const jobs = new Jobs(cache, { log, screenshot: job => capture.shot(job), progress: (job, text) => publisher.write(job, { chat: job.chat, id: job.id, status: 'working', text }) });
  async function accept(job) {
    const key = `${job.session}:${job.id}`;
    try {
      publisher.begin(job.session); publisher.ack(job);
      if (active.has(key)) return;
      const done = cache.get('handled', key);
      if (done) { publisher.write(job, done); return; }
      job.receivedAt = Date.now(); active.add(key);
      publisher.write(job, { chat: job.chat, id: job.id, status: 'working', text: 'Working' });
      const reply = job.trigger === 'hello' ? { chat: job.chat, id: job.id, status: 'done', text: 'PONG', sources: [] } : await jobs.submit(job);
      cache.put('handled', key, reply, 30 * 86400000);
      publisher.cfg.provider = loadConfig().provider;
      publisher.write(job, reply);
      publisher.saveState({ lastMessageAt: new Date().toISOString(), job: job.job, status: reply.status, usage: cache.usage() });
      log(`${job.job}: ${reply.status}; daily use ${JSON.stringify(cache.usage())}`);
    } catch (error) { log('Companion error: ' + error.message); }
    finally { active.delete(key); }
  }
  capture.start(); publisher.presence();
  const presence = setInterval(() => publisher.presence(), 30000);
  // Read only the selected character's file, when configured. Never scan account files.
  const fallback = setInterval(fallbackReader(cfg.savedVariables, () => publisher.session, accept, log), 5000);
  const stop = () => { capture.stop(); publisher.close(); clearInterval(presence); clearInterval(fallback); fs.rmSync(lock, { force: true }); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  log(`Azeroth Coach started with ${cfg.provider}. Runtime files: ${cfg.runtime}`);
}
if (require.main === module) { try { start(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { start };
