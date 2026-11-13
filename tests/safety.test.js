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
