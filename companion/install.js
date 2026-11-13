'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ROOT, runtimeDir, defaults, atomic } = require('./config');
const { installSlots } = require('./install-slots');
const { resolveCommand } = require('./agents');
const INVALID_CLIENT = 'Choose the `_forever_` folder. It holds Wow.exe.';
const NO_WRITE = 'Windows does not let this installer write to the game folder. Close the installer, then right-click it and select Run as administrator.';
function powershell(action, env = {}) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'install-windows.ps1'), action], {
    windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 2_000_000, env: { ...process.env, ...env }
  });
  if (result.error || result.status !== 0) throw new Error(`Install check failed: ${action}.`);
  return (result.stdout || '').trim();
}
function validClient(client) {
  return path.basename(client).toLowerCase() === '_forever_' && fs.existsSync(path.join(client, 'Wow.exe')) && fs.statSync(path.join(client, 'Wow.exe')).isFile();
}
function detect({ env = process.env, registry, exists = validClient, resolve = resolveCommand } = {}) {
  if (!registry) {
    try { registry = process.platform === 'win32' ? JSON.parse(powershell('registry')) : []; } catch { registry = []; }
  }
  const candidates = registry.flatMap(dir => [dir, path.join(dir, '_forever_')]);
  for (const root of [env['ProgramFiles(x86)'], env.ProgramFiles, 'C:\\Games', 'D:\\Games', 'D:\\', 'C:\\'].filter(Boolean)) {
    for (const name of ['World of Warcraft', 'World of Warcraft Forever', 'WoW']) candidates.push(path.join(root, name, '_forever_'));
  }
  const clients = [...new Set(candidates.filter(exists))];
  const found = provider => { try { resolve(provider); return true; } catch { return false; } };
  return { clients, client: clients[0] || '', claude: found('claude'), codex: found('codex') };
}
function validateClient(client, { running = () => process.platform === 'win32' && powershell('running', { AC_CLIENT: client }) === 'true' } = {}) {
  if (!validClient(client)) return { status: 'invalid_client', message: INVALID_CLIENT };
  if (running()) return { status: 'game_running', message: 'World of Warcraft is open. Close it, then click Retry.' };
  try {
    const addons = path.join(client, 'Interface', 'AddOns'); fs.mkdirSync(addons, { recursive: true });
    const probe = path.join(addons, '.azeroth-write-' + crypto.randomUUID());
    fs.writeFileSync(probe, '', { flag: 'wx' }); fs.unlinkSync(probe);
  } catch { return { status: 'no_write', message: NO_WRITE }; }
  return { status: 'ready' };
}
function mergeConfig(existing, client, provider) {
  if (Object.keys(existing).length) return { ...existing, addonDir: path.join(client, 'Interface', 'AddOns'), provider };
  const cfg = { ...defaults, provider, addonDir: path.join(client, 'Interface', 'AddOns') };
  cfg.jobs = Object.fromEntries(Object.entries(defaults.jobs).map(([key, spec]) => [key, { ...spec, ...(provider === 'codex' ? { model: '' } : {}) }]));
  return cfg;
}
function install({ client, provider, noSlots = false, link = false, dir = runtimeDir(), root = ROOT, validate = validateClient }) {
  if (!['claude', 'codex', 'none'].includes(provider)) throw new Error('Use claude, codex, or none.');
  const check = validate(client); if (check.status !== 'ready') throw new Error(check.message);
  const addons = path.join(client, 'Interface', 'AddOns');
  const file = path.join(dir, 'config.json');
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const upgrade = fs.existsSync(path.join(addons, 'AzerothCoach'));
  const target = path.join(addons, 'AzerothCoach');
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('The addon uses a junction. Move it before a copy install.');
  if (link) {
    if (fs.existsSync(target)) throw new Error('AzerothCoach already exists. Move it before you use --link.');
    fs.symlinkSync(path.join(root, 'addon', 'AzerothCoach'), target, 'junction');
  } else fs.cpSync(path.join(root, 'addon', 'AzerothCoach'), target, { recursive: true });
  if (!noSlots && provider !== 'none') installSlots(addons);
  atomic(file, JSON.stringify(mergeConfig(existing, client, provider), null, 2) + '\n');
  return { status: 'ready', upgrade, client, provider };
}
function questieCompatible(folder) {
  try {
    const toc = fs.readFileSync(path.join(folder, 'QuestieDB_Forever.toc'), 'utf8');
    const config = fs.readFileSync(path.join(folder, 'src', 'config.lua'), 'utf8');
    const current = Number(config.match(/config\.contractVersion\s*=\s*(\d+)/)?.[1]);
    const minimum = Number(config.match(/config\.minSupportedContract\s*=\s*(\d+)/)?.[1]);
    return current >= 4 && minimum >= 1 && minimum <= 4 && /^## X-Flavor:\s*Forever\s*$/m.test(toc) && Number(toc.match(/^## X-Contract-Version:\s*(\d+)/m)?.[1]) === current;
  } catch { return false; }
}
async function fetchBounded(url, maxBytes, json = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'AzerothCoach-Installer', Accept: json ? 'application/vnd.github+json' : 'application/octet-stream' } });
  if (!response.ok) throw new Error('The quest data did not download.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > maxBytes) throw new Error('The quest data download is too large.'); chunks.push(chunk); }
  const data = Buffer.concat(chunks); return json ? JSON.parse(data) : data;
}
async function downloadQuestie(client) {
  const addons = path.join(client, 'Interface', 'AddOns');
  const destination = path.join(addons, 'QuestieDB');
  if (questieCompatible(destination)) return { status: 'ready' };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'azeroth-questie-'));
  try {
    const release = await fetchBounded('https://api.github.com/repos/Questie/QuestieDB/releases/latest', 2_000_000, true);
    const asset = release.assets.find(asset => /^QuestieDB-[\w.+-]+-Forever\.zip$/.test(asset.name));
    if (!asset || !/^https:\/\/github\.com\/Questie\/QuestieDB\/releases\/download\//.test(asset.browser_download_url) || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) throw new Error('No verified Forever release.');
    const data = await fetchBounded(asset.browser_download_url, 150_000_000);
    if ('sha256:' + crypto.createHash('sha256').update(data).digest('hex') !== asset.digest) throw new Error('The quest data checksum failed.');
    const archive = path.join(work, 'questie.zip'); fs.writeFileSync(archive, data);
    const extracted = path.join(work, 'extracted');
    powershell('extract', { AC_ARCHIVE: archive, AC_EXTRACT: extracted });
    const source = path.join(extracted, 'QuestieDB');
    if (!questieCompatible(source)) throw new Error('The quest data does not support contract 4.');
    // Keep an old addon until the new release passes its checks.
    fs.mkdirSync(addons, { recursive: true });
    const staging = path.join(addons, '.azeroth-questie-' + crypto.randomUUID());
    const backup = staging + '-old';
    try {
      fs.cpSync(source, staging, { recursive: true });
      if (fs.existsSync(destination)) {
        if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('QuestieDB uses a junction.');
        fs.renameSync(destination, backup);
      }
      try { fs.renameSync(staging, destination); } catch (error) { if (fs.existsSync(backup)) fs.renameSync(backup, destination); throw error; }
    } finally { fs.rmSync(staging, { recursive: true, force: true }); fs.rmSync(backup, { recursive: true, force: true }); }
    return { status: 'ready' };
  } catch { return { status: 'questiedb_failed' }; }
  finally { fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
function uninstall(addons) {
  if (path.basename(addons).toLowerCase() !== 'addons' || !validClient(path.resolve(addons, '..', '..'))) throw new Error(INVALID_CLIENT);
  for (const name of ['AzerothCoach', ...Array.from({ length: 200 }, (_, i) => 'AzerothCoach_S' + String(i + 1).padStart(3, '0'))]) {
    fs.rmSync(path.join(addons, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  return { status: 'ready' };
}
async function cli(args = process.argv.slice(2)) {
  const option = key => { const i = args.indexOf(key); return i < 0 ? '' : args[i + 1]; };
  let result;
  try {
    if (args.includes('--detect')) result = detect();
    else if (args.includes('--validate')) result = validateClient(option('--client'));
    else if (args.includes('--questie')) result = await downloadQuestie(option('--client'));
    else if (args.includes('--uninstall')) result = uninstall(option('--addons'));
    else if (args.includes('--check')) result = await require('../scripts/doctor').checkInstall();
    else result = install({ client: option('--client'), provider: option('--provider'), noSlots: args.includes('--no-slots'), link: args.includes('--link') });
  } catch (error) { result = { status: 'failed', message: error.message }; process.exitCode = 1; }
  if (option('--result')) atomic(option('--result'), JSON.stringify(result));
  else process.stdout.write(JSON.stringify(result) + '\n');
  return result;
}
if (require.main === module) cli().catch(() => { process.exitCode = 1; });
module.exports = { detect, validClient, validateClient, mergeConfig, install, questieCompatible, downloadQuestie, uninstall, cli };
