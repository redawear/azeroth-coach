#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { acquire, requestStop } = require('./instance');
const { stopRuns } = require('./agents');
const { loadConfig } = require('./config');
const { Cache } = require('./cache');
const { jobsFromStrip } = require('./protocol');
const { cleanRuns, fallbackReader } = require('./recovery');
const { Publisher } = require('./publisher');
const { Jobs } = require('./jobs');
const { Capture } = require('./supervisor');
async function start() {
  if (process.platform !== 'win32') throw new Error('The screen companion needs Windows. Logic tests also run on Linux.');
  const cfg = loadConfig();
  if (!fs.existsSync(path.join(cfg.addonDir, 'AzerothCoach', 'AzerothCoach.toc'))) throw new Error('Addon not found. Run npm run setup first.');
  let shutdown = async () => {};
  const instance = await acquire(cfg.runtime, () => shutdown());
  if (!instance) return;
  if (cfg.provider === 'none') { instance.close(); return; }
  try {
    function log(text) {
      const file = path.join(cfg.runtime, 'companion.log');
      if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, file + '.old');
      const line = new Date().toISOString() + ' ' + text; fs.appendFileSync(file, line + '\n');
    }
    // Delete image files left by a crash. No screenshot history survives startup.
    cleanRuns(cfg.runtime);
    const cache = new Cache(path.join(cfg.runtime, 'cache.sqlite'));
    const publisher = new Publisher(cfg, cache, { log });
    const active = new Set();
    const tasks = new Set(); let stopping = false;
    const capture = new Capture(cfg, payload => jobsFromStrip(payload).forEach(accept), log);
    const jobs = new Jobs(cache, { log, screenshot: job => capture.shot(job), progress: (job, text) => publisher.write(job, { chat: job.chat, id: job.id, status: 'working', text }) });
    function accept(job) {
      if (stopping) return;
      const task = handle(job); tasks.add(task);
      task.finally(() => tasks.delete(task));
    }
    async function handle(job) {
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
    let stopped;
    shutdown = () => stopped ||= (async () => {
      stopping = true; jobs.stop();
      clearInterval(presence); clearInterval(fallback);
      await Promise.all([capture.stop(), stopRuns()]);
      await jobs.drain(); await Promise.allSettled([...tasks]);
      publisher.close(); cache.close();
    })();
    const stop = async () => { await shutdown(); instance.close(); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    log(`Azeroth Coach started with ${cfg.provider}. Runtime files: ${cfg.runtime}`);
  } catch (error) { instance.close(); throw error; }
}
async function cli() {
  const { runtimeDir } = require('./config');
  if (process.argv.includes('--stop')) return requestStop(runtimeDir());
  if (process.argv.includes('--restart')) await requestStop(runtimeDir());
  return start();
}
if (require.main === module) cli().catch(error => {
  try { fs.appendFileSync(path.join(require('./config').runtimeDir(), 'companion.log'), new Date().toISOString() + ' ' + error.message + '\n'); } catch {}
  process.exitCode = 1;
});
module.exports = { start };
