#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { ROOT, runtimeDir, defaults, atomic } = require('../companion/config');
const { installSlots } = require('../companion/install-slots');
function findClient() {
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, 'C:\\Games', 'D:\\Games', 'D:\\', 'C:\\'];
  for (const root of roots.filter(Boolean)) for (const name of ['World of Warcraft', 'World of Warcraft Forever', 'WoW']) {
    const client = path.join(root, name, '_forever_'); if (fs.existsSync(client)) return client;
  }
  return '';
}
async function setup() {
  if (process.platform !== 'win32') throw new Error('Run setup on the Windows PC that runs Forever.');
  const dir = runtimeDir(); const file = path.join(dir, 'config.json');
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const args = process.argv.slice(2); const option = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : ''; };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let client = option('--client') || (existing.addonDir && path.resolve(existing.addonDir, '..', '..')) || findClient();
  if (!client) client = (await rl.question('Path to the _forever_ client folder: ')).trim().replace(/^"|"$/g, '');
  const provider = option('--provider') || existing.provider || ((await rl.question('AI provider [claude/codex] (claude): ')).trim() || 'claude');
  rl.close();
  if (!['claude', 'codex'].includes(provider)) throw new Error('Use claude or codex.');
  if (!fs.existsSync(path.join(client, 'Wow.exe')) || path.basename(client).toLowerCase() !== '_forever_') throw new Error('Choose the _forever_ folder that holds Wow.exe.');
  const addons = path.join(client, 'Interface', 'AddOns'); fs.mkdirSync(addons, { recursive: true });
  const target = path.join(addons, 'AzerothCoach'); const source = path.join(ROOT, 'addon', 'AzerothCoach');
  if (args.includes('--link')) {
    if (fs.existsSync(target)) throw new Error('AzerothCoach already exists. Move it before you use --link.');
    fs.symlinkSync(source, target, 'junction');
  } else {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('The addon uses a junction. Keep it, or move it before a copy install.');
    fs.cpSync(source, target, { recursive: true });
  }
  installSlots(addons);
  const cfg = { ...defaults, ...existing, provider, addonDir: addons };
  if (!existing.jobs) cfg.jobs = Object.fromEntries(Object.entries(defaults.jobs).map(([key, spec]) => [key, { ...spec, ...(provider === 'codex' ? { model: '' } : {}) }]));
  atomic(file, JSON.stringify(cfg, null, 2) + '\n');
  const launcher = path.join(dir, 'Start Azeroth Coach.cmd');
  // Paths stay quoted. No prompt or game data enters a command shell.
  if (/[\r\n%]/.test(process.execPath + ROOT)) throw new Error('The install path cannot contain a percent sign or a new line.');
  atomic(launcher, `@echo off\r\n"${process.execPath}" "${path.join(ROOT, 'companion', 'main.js')}"\r\npause\r\n`);
  console.log(`Addon installed. Config: ${file}\nLauncher: ${launcher}\nInstall QuestieDB from https://github.com/Questie/QuestieDB/releases\nClose the game fully, then start it again. Run npm start.`);
}
if (require.main === module) setup().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { findClient };
