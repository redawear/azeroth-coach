'use strict';
const fs = require('node:fs');
function subsystemOffset(buffer) {
  if (buffer.length < 64 || buffer.readUInt16LE(0) !== 0x5a4d) throw new Error('Invalid DOS header.');
  const pe = buffer.readUInt32LE(0x3c);
  if (pe > buffer.length - 96 || buffer.readUInt32LE(pe) !== 0x4550) throw new Error('Invalid PE header.');
  const optional = pe + 24;
  if (buffer.readUInt16LE(pe + 4) !== 0x8664 || buffer.readUInt16LE(optional) !== 0x20b || buffer.readUInt16LE(pe + 20) < 72) throw new Error('Expected a win-x64 PE32+ file.');
  return optional + 68;
}
function patch(buffer) {
  const offset = subsystemOffset(buffer);
  if (![2, 3].includes(buffer.readUInt16LE(offset))) throw new Error('Expected the console or GUI subsystem.');
  const copy = Buffer.from(buffer); copy.writeUInt16LE(2, offset); return copy;
}
if (require.main === module) fs.writeFileSync(process.argv[3], patch(fs.readFileSync(process.argv[2])));
module.exports = { patch, subsystemOffset };
