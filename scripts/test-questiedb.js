'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { downloadQuestie, questieCompatible } = require('../companion/install');
async function verify() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azeroth-release-'));
  const client = path.join(dir, '_forever_'); fs.mkdirSync(client);
  try {
    assert.equal((await downloadQuestie(client)).status, 'ready');
    assert.equal(questieCompatible(path.join(client, 'Interface', 'AddOns', 'QuestieDB')), true);
    console.log('The real QuestieDB Forever release passes its checksum and contract checks.');
  } finally { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
