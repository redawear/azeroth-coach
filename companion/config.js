'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
function runtimeDir() {
  const dir = process.env.AZEROTH_COACH_HOME || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'AzerothCoach');
  const resolved = path.resolve(dir);
  if (resolved === ROOT || resolved.startsWith(ROOT + path.sep)) throw new Error('Keep runtime files outside the checkout.');
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  return resolved;
}
const defaults = {
  provider: 'claude', addonDir: '', savedVariables: '',
  jobs: { coach: { model: 'sonnet', effort: 'low', timeout: 45 }, chat: { model: 'opus', effort: 'medium', timeout: 120 }, deep: { model: 'opus', effort: 'high', timeout: 300 } },
  limits: { coach: 6, chat: 20, deep: 5, shots: 6 },
  capture: { process: 'Wow', clientFolder: '_forever_', intervalMs: 250 }
};
function loadConfig(dir = runtimeDir()) {
  const file = path.join(dir, 'config.json');
  const input = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (input.provider && !['claude', 'codex'].includes(input.provider)) throw new Error('Set provider to claude or codex.');
  const cfg = { ...defaults, ...input, limits: { ...defaults.limits, ...input.limits }, capture: { ...defaults.capture, ...input.capture }, jobs: {} };
  for (const key of Object.keys(defaults.jobs)) {
    cfg.jobs[key] = { ...defaults.jobs[key], ...(cfg.provider === 'codex' ? { model: '' } : {}), ...input.jobs?.[key] };
    if (!['low', 'medium', 'high', 'xhigh'].includes(cfg.jobs[key].effort)) throw new Error(`Bad effort for ${key}.`);
    if (!Number.isFinite(cfg.jobs[key].timeout) || cfg.jobs[key].timeout < 1 || cfg.jobs[key].timeout > 600) throw new Error(`Bad timeout for ${key}.`);
  }
  for (const [key, value] of Object.entries(cfg.limits)) if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`Bad limit: ${key}.`);
  cfg.runtime = dir;
  return cfg;
}
function atomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.tmp';
  fs.writeFileSync(temp, data, { mode: 0o600 });
  fs.renameSync(temp, file);
}
module.exports = { ROOT, runtimeDir, loadConfig, defaults, atomic };
