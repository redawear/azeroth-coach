'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const luaparse = require('luaparse');
const root = path.join(__dirname, '..');
let count = 0;
function check(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) check(file);
    else if (entry.name.endsWith('.lua')) {
      luaparse.parse(fs.readFileSync(file, 'utf8'), { luaVersion: '5.1' });
      count++;
    } else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || `Cannot parse ${file}`);
      count++;
    }
  }
}
check(root);
console.log(`Syntax checked ${count} Lua and JavaScript files.`);
