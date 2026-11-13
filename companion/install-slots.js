'use strict';
// Load-on-demand slot and silent signal method adapted from wow-ai (MIT).
const fs = require('node:fs');
const path = require('node:path');
const { pad3, SILENT_WAV } = require('./protocol');
function installSlots(addons) {
  const ensure = (file, body) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, body);
  };
  for (let i = 1; i <= 200; i++) {
    const name = 'AzerothCoach_S' + pad3(i);
    ensure(path.join(addons, name, name + '.toc'), `## Interface: 16001\n## Title: Azeroth Coach slot ${i}\n## LoadOnDemand: 1\n## Dependencies: AzerothCoach\nInbox.lua\n`);
    ensure(path.join(addons, name, 'Inbox.lua'), 'AzerothCoach_SlotData = nil\n');
    for (const type of ['ack', 'sig']) ensure(path.join(addons, 'AzerothCoach', type, pad3(i) + '.wav'), '');
  }
  for (let i = 1; i <= 2000; i++) ensure(path.join(addons, 'AzerothCoach', 'presence', String(i).padStart(4, '0') + '.wav'), '');
  ensure(path.join(addons, 'AzerothCoach', 'ctl', 'empty.wav'), '');
  ensure(path.join(addons, 'AzerothCoach', 'ctl', 'valid.wav'), SILENT_WAV);
}
module.exports = { installSlots };
