'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { subsystemOffset } = require('./patch-pe');
const { requestStop, endpoint } = require('../companion/instance');
const net = require('node:net');
const [app, client, work] = process.argv.slice(2);
const runtime = path.join(process.env.LOCALAPPDATA, 'AzerothCoach');
const exe = path.join(app, 'AzerothCoach.exe'); const main = path.join(app, 'companion', 'main.js');
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
async function ready() {
  for (let i = 0; i < 150; i++) {
    const live = await new Promise(resolve => { const socket = net.connect(endpoint(runtime)); socket.on('connect', () => { socket.destroy(); resolve(true); }); socket.on('error', () => resolve(false)); });
    if (live && fs.existsSync(path.join(runtime, 'companion.log'))) return;
    await pause();
  }
  throw new Error('The companion did not start.');
}
async function verify() {
  const pe = fs.readFileSync(exe); assert.equal(pe.readUInt16LE(subsystemOffset(pe)), 2);
  assert.ok(fs.existsSync(path.join(app, 'node.exe')));
  const addons = path.join(client, 'Interface', 'AddOns');
  assert.ok(fs.existsSync(path.join(addons, 'AzerothCoach', 'AzerothCoach.toc')));
  assert.equal(fs.existsSync(path.join(addons, 'AzerothCoach_S001')), false);
  const cfgFile = path.join(runtime, 'config.json'); const cfg = JSON.parse(fs.readFileSync(cfgFile));
  assert.equal(cfg.provider, 'none'); assert.equal(cfg.addonDir.toLowerCase(), addons.toLowerCase());
  const resultFile = path.join(work, 'gui-mcp.json');
  const mcp = spawnSync(exe, [path.resolve(__dirname, '../tests/windows-runtime.js'), app, resultFile], { timeout: 30000, windowsHide: true, encoding: 'utf8' });
  assert.equal(mcp.status, 0, mcp.stderr); assert.equal(JSON.parse(fs.readFileSync(resultFile)).status, 'ready');
  // Make the reply slots before the companion starts. The game does not create them.
  require(path.join(app, 'companion', 'install-slots')).installSlots(addons);
  cfg.provider = 'claude'; cfg.jobs.chat.model = 'keep-this-model'; cfg.limits.chat = 2;
  fs.writeFileSync(cfgFile, JSON.stringify(cfg)); fs.writeFileSync(path.join(runtime, 'state.json'), '{"keep":true}');
  const launch = () => {
    const child = spawn(exe, [main], { windowsHide: true, stdio: 'ignore' });
    child.on('error', error => { throw error; }); return child;
  };
  const first = launch();
  try {
    await ready(); await pause();
    const duplicate = spawnSync(exe, [main], { windowsHide: true, timeout: 10000 });
    assert.equal(duplicate.status, 0);
    assert.equal(first.exitCode, null);
    const stop = spawnSync(exe, [main, '--stop'], { windowsHide: true, timeout: 20000 }); assert.equal(stop.status, 0);
    await new Promise(resolve => first.exitCode === null ? first.once('exit', resolve) : resolve());
    assert.equal(spawnSync(exe, [main, '--stop'], { windowsHide: true, timeout: 20000 }).status, 0);
    const second = launch(); await ready(); await pause();
    assert.equal(await requestStop(runtime), true);
    await new Promise(resolve => second.exitCode === null ? second.once('exit', resolve) : resolve());
    // Leave one instance running. The upgrade must stop it before it replaces the app.
    const upgradeTarget = launch(); await ready(); upgradeTarget.unref();
  } finally { if (first.exitCode === null) await requestStop(runtime); }
}
verify().catch(async error => { console.error(error); await requestStop(runtime).catch(() => {}); process.exitCode = 1; });
