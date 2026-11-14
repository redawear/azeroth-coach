#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { ROOT, runtimeDir, atomic } = require('../companion/config');
const { detect, install, cli } = require('../companion/install');
function findClient() { return detect().client; }
async function setup(args = process.argv.slice(2)) {
  if (args.some(arg => ['--detect', '--validate', '--questie', '--check', '--result', '--uninstall'].includes(arg))) return cli(args);
  if (process.platform !== 'win32') throw new Error('Run setup on the Windows PC that runs Forever.');
  const file = path.join(runtimeDir(), 'config.json');
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const option = key => { const i = args.indexOf(key); return i < 0 ? '' : args[i + 1]; };
  let client = option('--client') || (existing.addonDir && path.resolve(existing.addonDir, '..', '..')) || findClient();
  let provider = option('--provider') || existing.provider;
  if (!client || !provider) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!client) client = (await rl.question('Path to the _forever_ client folder: ')).trim().replace(/^"|"$/g, '');
      if (!provider) provider = (await rl.question('AI provider [claude/codex/none] (claude): ')).trim() || 'claude';
    } finally { rl.close(); }
  }
  install({ client, provider, link: args.includes('--link'), noSlots: args.includes('--no-slots') });
  const launcher = path.join(runtimeDir(), 'Start Azeroth Coach.cmd');
  if (/[\r\n%]/.test(process.execPath + ROOT)) throw new Error('The install path cannot contain a percent sign or a new line.');
  atomic(launcher, `@echo off\r\n"${process.execPath}" "${path.join(ROOT, 'companion', 'main.js')}"\r\npause\r\n`);
  console.log(`Addon installed. Config: ${file}\nLauncher: ${launcher}\nInstall QuestieDB from https://github.com/Questie/QuestieDB/releases\nClose the game fully, then start it again. Run npm start.`);
}
if (require.main === module) setup().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { findClient, setup };
