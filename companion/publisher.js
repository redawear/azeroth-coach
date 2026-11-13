'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { lua, pad3, slotNumber, SILENT_WAV } = require('./protocol');
const { atomic } = require('./config');
class Publisher {
  constructor(cfg, cache, { writer = atomic, clock = Date.now, log = () => {} } = {}) {
    this.cfg = cfg; this.cache = cache; this.writer = writer; this.clock = clock; this.log = log;
    this.replies = new Map(); this.session = null; this.restoreLeft = 0; this.lastPublish = -Infinity;
    this.state = {};
    try { this.state = JSON.parse(fs.readFileSync(path.join(cfg.runtime, 'state.json'), 'utf8')); } catch {}
    this.presenceIndex = Number(this.state.presence) || 0;
  }
  saveState(extra = {}) {
    Object.assign(this.state, extra, { presence: this.presenceIndex });
    if (this.cfg.runtime) this.safe(path.join(this.cfg.runtime, 'state.json'), JSON.stringify(this.state, null, 2));
  }
  safe(file, body) {
    try { this.writer(file, body); return true; }
    catch (error) { this.log(`Cannot write a transport file (${error.code || 'failed'}). The companion will retry.`); return false; }
  }
  begin(session) {
    if (this.session === session) return;
    this.session = session; this.replies.clear(); this.restoreLeft = 3;
    clearTimeout(this.timer); this.timer = null;
    for (let i = 1; i <= 200; i++) for (const type of ['ack', 'sig']) this.safe(this.signalPath(type, i), '');
  }
  signalPath(type, id) { return path.join(this.cfg.addonDir, 'AzerothCoach', type, pad3(slotNumber(id)) + '.wav'); }
  ack(job) { this.safe(this.signalPath('ack', job.id), SILENT_WAV); }
  write(job, reply) {
    if (job.session !== this.session) return;
    this.replies.set(job.id, reply);
    while (this.replies.size > 25) this.replies.delete(this.replies.keys().next().value);
    if (reply.status !== 'working') { clearTimeout(this.timer); this.timer = null; this.publish(); return; }
    const delay = 3000 - (this.clock() - this.lastPublish);
    if (delay <= 0) this.publish();
    else if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.publish(); }, delay);
  }
  publish() {
    this.lastPublish = this.clock();
    const data = { session: this.session, now: Math.floor(this.clock() / 1000), provider: this.cfg.provider, replies: [...this.replies.values()] };
    if (this.restoreLeft > 0) data.restore = this.cache.history(50, this.session).map(({ facts, ...row }) => row);
    const slot = 'AzerothCoach_SlotData = ' + lua(data) + '\n';
    let wrote = 0;
    for (let i = 1; i <= 200; i++) if (this.safe(path.join(this.cfg.addonDir, 'AzerothCoach_S' + pad3(i), 'Inbox.lua'), slot)) wrote++;
    this.safe(path.join(this.cfg.addonDir, 'AzerothCoach', 'Inbox.lua'), 'AzerothCoach_Inbox = ' + lua(data) + '\n');
    if (wrote) {
      if (this.restoreLeft > 0) this.restoreLeft--;
      for (const reply of this.replies.values()) if (reply.status !== 'working') this.safe(this.signalPath('sig', reply.id), SILENT_WAV);
    }
    if (wrote < 200 && !this.timer) this.timer = setTimeout(() => { this.timer = null; this.publish(); }, 3000);
  }
  presence() {
    this.presenceIndex = (this.presenceIndex % 2000) + 1;
    const file = index => path.join(this.cfg.addonDir, 'AzerothCoach', 'presence', String(index).padStart(4, '0') + '.wav');
    // The empty section prevents the game from reading old beats ahead of the head.
    for (let j = 1; j <= 50; j++) this.safe(file(((this.presenceIndex - 1 + j) % 2000) + 1), '');
    this.safe(file(this.presenceIndex), SILENT_WAV); this.saveState();
  }
  close() { clearTimeout(this.timer); this.timer = null; }
}
module.exports = { Publisher };
