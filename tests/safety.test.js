'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('runtime code has no game input, memory access, macros, or tracker module registration', () => {
  function scan(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name); if (e.isDirectory()) scan(file);
      else if (/\.(lua|js|ps1)$/.test(file)) {
        const text = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(text, /\b(?:SendInput|keybd_event|mouse_event|PostMessage|ReadProcessMemory|OpenProcess|CreateMacro|EditMacro|RunMacroText|SecureActionButtonTemplate|AddModule)\b/, file);
        if (file.endsWith('.lua') && !['UI.lua', 'Link.lua', 'Codec.lua'].includes(e.name)) {
          assert.doesNotMatch(text, /Interface\\|CreateFrame\([^\n]*Template|SetTextColor\(|CreateFontString\(/, file);
        }
      }
    }
  }
  scan(path.join(__dirname, '../addon')); scan(path.join(__dirname, '../companion'));
});
test('addon player text and companion error text have no npm commands', () => {
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.(lua|toc|xml)$/.test(file)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\bnpm\b/i, file);
    }
  }
  scan(path.join(__dirname, '../addon'));
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../companion/jobs.js'), 'utf8'), /\bnpm\b/i);
  for (const file of fs.readdirSync(path.join(__dirname, '../companion')).filter(file => /\.(js|ps1)$/.test(file))) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../companion', file), 'utf8'), /\bnpm\s+(?:run|start|install|ci|test)\b/i, file);
  }
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  // The developer sections keep their npm commands. Every other section is for players.
  const playerText = readme.replace(/^## (?:Developer setup|Checks)\r?\n[\s\S]*?(?=^## |(?![\s\S]))/gm, '');
  assert.doesNotMatch(playerText, /\bnpm\b/i);
});
