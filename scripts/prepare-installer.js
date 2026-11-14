'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { patch } = require('./patch-pe');
const { ROOT } = require('../companion/config');
const NODE_VERSION = '24.22.2';
const NODE_SHA256 = '1c331340fa6cac5e4294725959070a143fa0507195a78ad77eed7943f719aac9';
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function prepare() {
  const app = path.join(ROOT, 'build', 'app');
  fs.rmSync(app, { recursive: true, force: true }); fs.mkdirSync(app, { recursive: true });
  const base = `https://nodejs.org/dist/v${NODE_VERSION}/`;
  const sums = (await download(base + 'SHASUMS256.txt')).toString();
  const checksum = sums.split('\n').find(line => line.endsWith('  win-x64/node.exe'))?.split(' ')[0];
  if (checksum !== NODE_SHA256) throw new Error('The official Node checksum changed.');
  const node = await download(base + 'win-x64/node.exe');
  if (crypto.createHash('sha256').update(node).digest('hex') !== checksum) throw new Error('The Node checksum failed.');
  fs.writeFileSync(path.join(app, 'node.exe'), node);
  fs.writeFileSync(path.join(app, 'AzerothCoach.exe'), patch(node));
  fs.writeFileSync(path.join(app, 'NODE-LICENSE'), await download(`https://raw.githubusercontent.com/nodejs/node/v${NODE_VERSION}/LICENSE`));
  for (const name of ['companion', 'scripts', 'addon', 'third_party', 'package.json', 'package-lock.json', 'LICENSE']) {
    fs.cpSync(path.join(ROOT, name), path.join(app, name), { recursive: true });
  }
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm ci --omit=dev --ignore-scripts --no-audit'] : ['ci', '--omit=dev', '--ignore-scripts', '--no-audit'];
  const result = spawnSync(command, args, { cwd: app, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error('Cannot install production dependencies.');
  fs.writeFileSync(path.join(app, 'runtime-version.json'), JSON.stringify({ node: NODE_VERSION, sha256: checksum }, null, 2) + '\n');
}
if (require.main === module) prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { NODE_VERSION, NODE_SHA256, prepare };
