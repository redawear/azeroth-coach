#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadConfig, atomic } = require('../companion/config');
const { resolveCommand, run, inspectCodex } = require('../companion/agents');
const { tipSchema } = require('../companion/prompts');
const { Cache } = require('../companion/cache');
const { Sources } = require('../companion/sources');
const { captureArgs } = require('../companion/supervisor');
const { pad3 } = require('../companion/protocol');
let failures = 0;
function report(state, name, detail = '') { console.log(`${state} ${name}${detail ? ': ' + detail : ''}`); if (state === 'FAIL') failures++; }
async function loginCheck(cfg, key = 'chat', timeout = 15, runner = run) {
  const work = fs.mkdtempSync(path.join(cfg.runtime, 'doctor-'));
  try {
    atomic(path.join(work, 'job.json'), JSON.stringify({ cache: path.join(cfg.runtime, 'cache.sqlite'), facts: {}, audit: path.join(work, 'sources.json') }));
    atomic(path.join(work, 'mcp.json'), '{"mcpServers":{}}');
    atomic(path.join(work, 'schema.json'), JSON.stringify(tipSchema));
    fs.mkdirSync(path.join(work, 'empty'));
    const limited = { ...cfg, policyTimeoutMs: 3000, jobs: { ...cfg.jobs, [key]: { ...cfg.jobs[key], timeout } } };
    const result = await runner(limited, { job: key }, { cwd: path.join(work, 'empty'), mcp: path.join(work, 'mcp.json'), schema: path.join(work, 'schema.json'), job: path.join(work, 'job.json') }, key === 'coach' ? 'Return JSON with only text equal to PONG.' : 'Return only PONG. Do not use tools.');
    return result.text.includes('PONG');
  } finally { fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
async function checkInstall(cfg = loadConfig(), runner = run) {
  if (!require('../companion/install').questieCompatible(path.join(cfg.addonDir, 'QuestieDB'))) return { status: 'questiedb_failed' };
  if (cfg.provider === 'none') return { status: 'ready' };
  try { return { status: await loginCheck(cfg, 'chat', 15, runner) ? 'ready' : 'ai_not_signed_in' }; }
  catch { return { status: 'ai_not_signed_in' }; }
}
async function doctor() {
  const cfg = loadConfig();
  const [major, minor] = process.versions.node.split('.').map(Number);
  report(major > 22 || major === 22 && minor >= 16 ? 'PASS' : 'FAIL', 'Node', process.version + '; need 22.16 or later.');
  let cache;
  try { cache = new Cache(path.join(cfg.runtime, 'cache.sqlite')); report('PASS', 'SQLite and runtime folder', cfg.runtime); }
  catch { report('FAIL', 'SQLite', 'Install Node 22.16 or later.'); }
  report(fs.existsSync(path.join(cfg.addonDir, '..', '..', 'Wow.exe')) ? 'PASS' : 'FAIL', 'Client folder', 'Run npm run setup if the path is wrong.');
  const addon = path.join(cfg.addonDir, 'AzerothCoach');
  report(fs.existsSync(path.join(addon, 'AzerothCoach.toc')) ? 'PASS' : 'FAIL', 'Addon', 'Run npm run setup to install it.');
  let slots = true;
  for (let i = 1; i <= 200; i++) {
    const name = 'AzerothCoach_S' + pad3(i);
    for (const file of [path.join(cfg.addonDir, name, name + '.toc'), path.join(cfg.addonDir, name, 'Inbox.lua'), path.join(addon, 'ack', pad3(i) + '.wav'), path.join(addon, 'sig', pad3(i) + '.wav')]) if (!fs.existsSync(file)) slots = false;
  }
  for (const file of ['ctl/empty.wav', 'ctl/valid.wav', 'presence/0001.wav', 'presence/2000.wav']) if (!fs.existsSync(path.join(addon, file))) slots = false;
  report(cfg.provider === 'none' ? 'SKIP' : slots ? 'PASS' : 'FAIL', 'Slots and signal files', 'Run npm run setup, then restart the game if files are missing.');
  report(fs.existsSync(path.join(cfg.addonDir, 'QuestieDB')) ? 'PASS' : 'FAIL', 'QuestieDB folder', 'Install QuestieDB from its GitHub releases. Check contract 4 with /coach doctor.');
  let command;
  if (cfg.provider !== 'none') try {
    command = resolveCommand(cfg.provider, cfg.cliPath);
    const version = spawnSync(command.file, [...command.args, '--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    report(version.status === 0 ? 'PASS' : 'FAIL', 'CLI', (version.stdout || '').trim() || 'Run the CLI in a terminal and sign in.');
    if (cfg.provider === 'codex') {
      const policy = inspectCodex(command);
      report('PASS', 'Codex tool policy', `${policy.features.length} features off; ${policy.servers.length} inherited MCP servers off. No credentials printed.`);
    }
    const help = spawnSync(command.file, [...command.args, ...(cfg.provider === 'codex' ? ['exec'] : []), '--help'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    const flags = cfg.provider === 'claude' ? ['--strict-mcp-config', '--setting-sources', '--no-session-persistence', '--effort', '--tools', '--allowedTools', '--json-schema'] : ['--ephemeral', '--sandbox', '--image', '--output-schema', '--disable'];
    for (const flag of flags) report((help.stdout || '').includes(flag) ? 'PASS' : 'FAIL', flag, 'Update the CLI if this flag is missing.');
  } catch (error) { report('FAIL', 'CLI', error.message); }
  if (process.argv.includes('--live') && command) {
    for (const key of Object.keys(cfg.jobs)) {
      try { report(await loginCheck(cfg, key, cfg.jobs[key].timeout) ? 'PASS' : 'FAIL', `${key} model and login`, 'This test uses the CLI plan.'); }
      catch (error) { report('FAIL', `${key} model and login`, error.code || error.message); }
    }
  } else report('SKIP', 'Login and model runs', 'Run npm run doctor -- --live. It uses your CLI plan.');
  if (process.argv.includes('--live') && cache) {
    try {
      const sources = new Sources(cache, { q: { 1: { name: 'The Green Hills of Stranglethorn' } } });
      const result = await sources.wiki_lookup({ quest_id: 1 }); report(result.missing ? 'SKIP' : 'PASS', 'Wiki API', result.missing ? 'This page is missing.' : 'The API answered.');
    } catch (error) { report('FAIL', 'Wiki API', error.message); }
  } else report('SKIP', 'Wiki API', 'Use --live for one API request.');
  if (process.platform === 'win32' && process.argv.includes('--capture')) {
    console.log('Type /coach ping in the foreground game. The doctor waits up to 15 seconds.');
    const result = spawnSync('powershell.exe', captureArgs(cfg), { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 100000 });
    report(/"text"\s*:/.test(result.stdout || '') ? 'PASS' : 'FAIL', 'Game window and pixel strip', 'Use windowed or borderless mode. Keep the top-left corner visible.');
  } else report('SKIP', 'Game capture', 'Use --capture on Windows, with the game open.');
  report('SKIP', 'Fullscreen, HDR, and display scale', 'Check these in Windows. Use windowed mode, SDR, and 100% scale for the first test.');
  report('SKIP', 'Game APIs and sound self-test', 'Run /coach doctor in the game.');
  if (cache) cache.close(); process.exitCode = failures ? 1 : 0;
}
if (require.main === module) doctor().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { doctor, loginCheck, checkInstall };
