'use strict';
// CI runs this script with the GUI runtime. It writes a file because it has no console.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const [app, resultFile] = process.argv.slice(2);
const appRequire = createRequire(path.join(app, 'package.json'));
async function verify() {
  assert.equal(path.basename(process.execPath), 'AzerothCoach.exe');
  const { Client } = appRequire('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = appRequire('@modelcontextprotocol/sdk/client/stdio.js');
  const { Cache } = appRequire('./companion/cache');
  const dir = path.dirname(resultFile); const cacheFile = path.join(dir, 'mcp.sqlite');
  const cache = new Cache(cacheFile); cache.put('pages', 'wiki:101', { text: 'A verified fixture.' }, 100000); cache.close();
  const job = path.join(dir, 'job.json');
  fs.writeFileSync(job, JSON.stringify({ cache: cacheFile, audit: path.join(dir, 'audit.json'), facts: { q: { 101: { name: 'A Meadow Errand' } } } }));
  const client = new Client({ name: 'installer-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(app, 'companion', 'tools-mcp.js'), job], stderr: 'ignore' }));
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['wiki_lookup', 'wowhead_lookup']);
    const answer = await client.callTool({ name: 'wiki_lookup', arguments: { quest_id: 101 } });
    assert.match(answer.content[0].text, /verified fixture/);
  } finally { await client.close(); }
}
verify().then(() => fs.writeFileSync(resultFile, JSON.stringify({ status: 'ready' }))).catch(error => {
  fs.writeFileSync(resultFile, JSON.stringify({ status: 'failed', message: error.stack })); process.exitCode = 1;
});
