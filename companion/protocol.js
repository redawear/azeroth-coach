'use strict';
// Record fields, Lua escaping, slot numbers and WAV adapted from wow-ai (MIT).
const slotNumber = id => ((id - 1) % 200) + 1;
const pad3 = n => String(n).padStart(3, '0');
function jobsFromStrip(payload) {
  if (typeof payload !== 'string' || Buffer.byteLength(payload) > 3200) return [];
  const out = [];
  for (const record of payload.split('\x1e')) {
    const p = record.split('\x1f');
    if (p.length !== 8 || !/^[\w-]{1,80}$/.test(p[0]) || !/^[1-9]\d{0,8}$/.test(p[2]) || p[3] || p[5]) continue;
    const flags = p[4].split(';');
    const job = flags.find(x => x.startsWith('job='))?.slice(4);
    if (!['coach', 'chat', 'deep'].includes(job) || p[1] !== (job === 'coach' ? 'coach' : 'chat')) continue;
    if (Array.from(p[7]).length > 400 || Buffer.byteLength(p[6]) > 2750) continue;
    out.push({ session: p[0], chat: p[1], id: Number(p[2]), job, ctx: p[6], text: p[7], shot: flags.includes('shot'), trigger: flags.find(x => x.startsWith('trig='))?.slice(5) || '' });
  }
  return out;
}
function parseOutbox(src) {
  const hex = String(src).match(/\["outbox"\]\s*=\s*\{[\s\S]*?\["hex"\]\s*=\s*"([a-f\d]+)"/i)?.[1];
  return hex && hex.length <= 6400 ? jobsFromStrip(Buffer.from(hex, 'hex').toString('utf8')) : [];
}
function luaStr(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\x00-\x1f\x7f]/g, c => '\\' + String(c.charCodeAt(0)).padStart(3, '0')) + '"';
}
function lua(value) {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'string') return luaStr(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'nil';
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return '{' + value.map(lua).join(',') + '}';
  return '{' + Object.entries(value).map(([k, v]) => `[${luaStr(k)}]=${lua(v)}`).join(',') + '}';
}
const SILENT_WAV = (() => {
  const b = Buffer.alloc(124); b.write('RIFF'); b.writeUInt32LE(116, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(80, 40); b.fill(128, 44); return b;
})();
module.exports = { jobsFromStrip, parseOutbox, slotNumber, pad3, luaStr, lua, SILENT_WAV };
