'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseOutbox } = require('./protocol');

function cleanRuns(runtime) {
  for (const entry of fs.readdirSync(runtime, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    if (entry.name === 'shots' || /^run-[A-Za-z0-9]{6}$/.test(entry.name)) {
      fs.rmSync(path.join(runtime, entry.name), { recursive: true, force: true });
    }
  }
}

function fallbackReader(file, session, accept, log) {
  let mtime = -1;
  const seen = new Set();
  return () => {
    if (!file || !fs.existsSync(file)) return;
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs === mtime || stat.size >= 5_000_000) return;
      mtime = stat.mtimeMs;
      for (const job of parseOutbox(fs.readFileSync(file, 'utf8'))) {
        const key = `${job.session}:${job.id}`;
        if (seen.has(key) || (session() && session() !== job.session)) continue;
        seen.add(key);
        accept(job);
      }
    } catch { log('Cannot read the reload fallback file.'); }
  };
}
module.exports = { cleanRuns, fallbackReader };
