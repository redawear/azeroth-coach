'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { vm } = require('./lua');
const { luaStr } = require('../companion/protocol');
function png(cells) {
  const width = 800, height = 192;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let i = 0; i < cells.length; i++) {
    const color = [cells[i] & 4 ? 240 : 12, cells[i] & 2 ? 240 : 12, cells[i] & 1 ? 240 : 12];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const offset = (Math.floor(i / 200) * 4 + y) * (width * 3 + 1) + 1 + ((i % 200) * 4 + x) * 3;
      Buffer.from(color).copy(raw, offset);
    }
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
test('Windows PowerShell decodes an image from the real Lua codec', { skip: process.platform !== 'win32' }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azeroth-pixel-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = vm(['Codec.lua']);
  const payload = 'test\x1fchat\x1f42\x1f\x1fc;job=chat\x1f\x1f\x1fhéllo 世界';
  v.run(`cells=AzerothCoachCodec.Encode(42,${luaStr(payload)});result={};for _,c in ipairs(cells) do result[#result+1]=tostring(c) end;joined=table.concat(result,",")`);
  const file = path.join(dir, 'strip.png'); fs.writeFileSync(file, png(v.value('joined').split(',').map(Number)));
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../companion/capture.ps1'), '-TestImage', file], { encoding: 'utf8', timeout: 30000 });
  const decoded = JSON.parse(output.trim().split('\n').pop());
  assert.equal(decoded.id, 42); assert.equal(decoded.text, payload);
});
test('capture logs a wait once until the window state changes', () => {
  const { Capture } = require('../companion/supervisor');
  const lines = [], messages = [];
  const capture = new Capture({}, text => messages.push(text), text => lines.push(text));
  const waiting = 'waiting for Wow window in _forever_';
  const info = text => capture.receive(JSON.stringify({ info: text }));
  for (let i = 0; i < 1200; i++) info(waiting);
  assert.deepEqual(lines, [waiting]);
  capture.receive('bad JSON'); capture.receive(JSON.stringify({ text: 'payload' })); capture.receive('{"clear":true}');
  info(waiting); assert.deepEqual(lines, [waiting]);
  assert.deepEqual(messages, ['payload']); assert.ok(capture.lastClear > 0);
  info('attached to game (pid 123)'); info('attached to game (pid 123)');
  info('game window lost');
  for (let i = 0; i < 19; i++) info(waiting);
  info('attached to game (pid 456)'); info('game window lost'); info(waiting);
  assert.deepEqual(lines, [waiting, 'attached to game (pid 123)', 'game window lost', waiting, 'attached to game (pid 456)', 'game window lost', waiting]);
  capture.receive('{"warn":"strip seen but rejected: checksum"}'); info(waiting);
  assert.equal(lines.at(-1), 'strip seen but rejected: checksum');
});
