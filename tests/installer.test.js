'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { patch, subsystemOffset } = require('../scripts/patch-pe');
const { detect, install, validateClient, mergeConfig, questieCompatible, uninstall } = require('../companion/install');
const { acquire, requestStop } = require('../companion/instance');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azeroth-install-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const client = path.join(dir, '_forever_'); fs.mkdirSync(client); fs.writeFileSync(path.join(client, 'Wow.exe'), '');
  return { dir, client };
}
test('the PE patch changes only the x64 subsystem field and rejects invalid files', () => {
  const input = Buffer.alloc(512); input.writeUInt16LE(0x5a4d); input.writeUInt32LE(128, 0x3c); input.writeUInt32LE(0x4550, 128);
  input.writeUInt16LE(0x8664, 132); input.writeUInt16LE(240, 148); input.writeUInt16LE(0x20b, 152); input.writeUInt16LE(3, 220);
  assert.equal(subsystemOffset(input), 220);
  const output = patch(input); assert.equal(output.readUInt16LE(220), 2);
  output.writeUInt16LE(3, 220); assert.deepEqual(output, input);
  assert.equal(input.readUInt16LE(220), 3);
  assert.throws(() => patch(Buffer.alloc(0)));
  input.writeUInt32LE(10000, 0x3c); assert.throws(() => patch(input));
});
test('detection uses the registry first, filters client folders, and checks both CLIs', t => {
  const { dir, client } = fixture(t);
  const result = detect({ registry: [dir], env: {}, resolve: provider => { if (provider === 'codex') throw new Error('Absent'); } });
  assert.equal(result.client, client); assert.deepEqual(result.clients, [client]);
  assert.equal(result.claude, true); assert.equal(result.codex, false);
  const roots = detect({ registry: ['/registry'], env: { ProgramFiles: '/programs' }, exists: () => true, resolve: () => {} });
  assert.equal(roots.clients[0], '/registry'); assert.ok(roots.clients.includes(path.join('/programs', 'World of Warcraft', '_forever_')));
});
test('folder checks reject the wrong folder and an open game', t => {
  const { dir, client } = fixture(t);
  assert.equal(validateClient(dir).status, 'invalid_client');
  assert.equal(validateClient(client, { running: () => true }).status, 'game_running');
  assert.equal(validateClient(client, { running: () => false }).status, 'ready');
});
test('unattended setup writes JSON, installs no-AI addons, and preserves upgrade settings', t => {
  const { dir, client } = fixture(t); const runtime = path.join(dir, 'runtime');
  const resultFile = path.join(dir, 'result.json');
  const invoke = provider => spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/setup.js'), '--client', client, '--provider', provider, '--result', resultFile], {
    env: { ...process.env, AZEROTH_COACH_HOME: runtime }, encoding: 'utf8', timeout: 30000, windowsHide: true
  });
  assert.equal(invoke('none').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(resultFile)).status, 'ready');
  const addons = path.join(client, 'Interface', 'AddOns');
  assert.ok(fs.existsSync(path.join(addons, 'AzerothCoach', 'AzerothCoach.toc')));
  assert.equal(fs.existsSync(path.join(addons, 'AzerothCoach_S001')), false);
  const configFile = path.join(runtime, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(configFile)); cfg.extra = 'keep'; cfg.jobs.chat.model = 'custom'; cfg.limits.chat = 2;
  fs.writeFileSync(configFile, JSON.stringify(cfg));
  fs.writeFileSync(path.join(runtime, 'cache.sqlite'), 'keep');
  assert.equal(invoke('codex').status, 0);
  const upgraded = JSON.parse(fs.readFileSync(configFile));
  assert.deepEqual(upgraded, { ...cfg, provider: 'codex' });
  assert.equal(fs.readFileSync(path.join(runtime, 'cache.sqlite'), 'utf8'), 'keep');
  for (let i = 1; i <= 200; i++) assert.ok(fs.existsSync(path.join(addons, 'AzerothCoach_S' + String(i).padStart(3, '0'), 'Inbox.lua')));
  fs.mkdirSync(path.join(addons, 'QuestieDB')); fs.writeFileSync(path.join(addons, 'QuestieDB', 'keep'), 'keep');
  uninstall(addons);
  assert.equal(fs.existsSync(path.join(addons, 'AzerothCoach')), false);
  assert.equal(fs.readdirSync(addons).filter(name => name.startsWith('AzerothCoach_S')).length, 0);
  assert.ok(fs.existsSync(path.join(addons, 'QuestieDB', 'keep')));
});
test('config merge changes only the client path and provider on upgrade', () => {
  const cfg = { provider: 'claude', addonDir: 'old', unknown: { keep: true }, jobs: { coach: { model: 'chosen' } } };
  assert.deepEqual(mergeConfig(cfg, 'new', 'none'), { ...cfg, provider: 'none', addonDir: path.join('new', 'Interface', 'AddOns') });
});
test('detection CLI returns JSON without a prompt', t => {
  const { dir } = fixture(t);
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/setup.js'), '--detect'], { env: { ...process.env, AZEROTH_COACH_HOME: path.join(dir, 'runtime') }, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0); const data = JSON.parse(result.stdout);
  assert.ok(Array.isArray(data.clients)); assert.equal(typeof data.claude, 'boolean'); assert.equal(typeof data.codex, 'boolean');
});
test('QuestieDB checks the Forever TOC and the supported contract range', t => {
  const { dir } = fixture(t); const folder = path.join(dir, 'questie'); fs.mkdirSync(path.join(folder, 'src'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'QuestieDB_Forever.toc'), '## X-Flavor: Forever\n## X-Contract-Version: 4\n');
  const config = path.join(folder, 'src', 'config.lua');
  fs.writeFileSync(config, 'config.contractVersion = 4\nconfig.minSupportedContract = 1'); assert.equal(questieCompatible(folder), true);
  fs.writeFileSync(config, 'config.contractVersion = 5\nconfig.minSupportedContract = 5'); assert.equal(questieCompatible(folder), false);
});
test('the instance lock handles a second start, stop, and a new start', async t => {
  const { dir } = fixture(t); let stopped = 0;
  const first = await acquire(dir, () => { stopped++; });
  t.after(() => { if (first.listening) first.close(); });
  assert.ok(first); assert.equal(await acquire(dir, () => {}), null);
  assert.equal(await requestStop(dir), true); assert.equal(stopped, 1);
  await new Promise(resolve => first.close(resolve));
  assert.equal(await requestStop(dir), false);
  const second = await acquire(dir, () => {}); assert.ok(second); await new Promise(resolve => second.close(resolve));
});
test('the finish check returns each supported status without a game or a live login', async t => {
  const { dir, client } = fixture(t);
  const cfg = { ...require('../companion/config').defaults, runtime: dir, provider: 'none', addonDir: path.join(client, 'Interface', 'AddOns') };
  const { checkInstall } = require('../scripts/doctor');
  assert.equal((await checkInstall(cfg)).status, 'questiedb_failed');
  const questie = path.join(cfg.addonDir, 'QuestieDB'); fs.mkdirSync(path.join(questie, 'src'), { recursive: true });
  fs.writeFileSync(path.join(questie, 'QuestieDB_Forever.toc'), '## X-Flavor: Forever\n## X-Contract-Version: 4\n');
  fs.writeFileSync(path.join(questie, 'src', 'config.lua'), 'config.contractVersion=4\nconfig.minSupportedContract=1');
  assert.equal((await checkInstall(cfg)).status, 'ready');
  cfg.provider = 'claude';
  assert.equal((await checkInstall(cfg, async () => ({ text: 'PONG' }))).status, 'ready');
  assert.equal((await checkInstall(cfg, async () => { throw new Error('No login'); })).status, 'ai_not_signed_in');
});
test('the quest download checks its digest and contract before it replaces an addon', async t => {
  const { dir, client } = fixture(t);
  const { downloadQuestie } = require('../companion/install');
  const data = Buffer.from('A fictional archive.');
  const asset = { name: 'QuestieDB-1.0.0-Forever.zip', browser_download_url: 'https://github.com/Questie/QuestieDB/releases/download/v1.0.0/QuestieDB-1.0.0-Forever.zip', digest: 'sha256:' + require('node:crypto').createHash('sha256').update(data).digest('hex') };
  const destination = path.join(client, 'Interface', 'AddOns', 'QuestieDB');
  fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, 'old'), 'keep');
  let extracts = 0;
  const deps = {
    fetchFile: async (_url, _limit, json) => json ? { assets: [asset] } : data,
    extract: (_archive, extracted) => {
      extracts++; const source = path.join(extracted, 'QuestieDB'); fs.mkdirSync(path.join(source, 'src'), { recursive: true });
      fs.writeFileSync(path.join(source, 'QuestieDB_Forever.toc'), '## X-Flavor: Forever\n## X-Contract-Version: 4\n');
      fs.writeFileSync(path.join(source, 'src', 'config.lua'), 'config.contractVersion=4\nconfig.minSupportedContract=1');
    }
  };
  assert.equal((await downloadQuestie(client, { ...deps, fetchFile: async (_url, _limit, json) => json ? { assets: [asset] } : Buffer.from('Wrong') })).status, 'questiedb_failed');
  assert.equal(extracts, 0); assert.ok(fs.existsSync(path.join(destination, 'old')));
  assert.equal((await downloadQuestie(client, { ...deps, extract: () => {} })).status, 'questiedb_failed');
  assert.ok(fs.existsSync(path.join(destination, 'old')));
  assert.equal((await downloadQuestie(client, deps)).status, 'ready');
  assert.equal(questieCompatible(destination), true); assert.equal(extracts, 1);
  assert.equal((await downloadQuestie(client, { fetchFile: () => { throw new Error('Do not fetch twice'); } })).status, 'ready');
});
