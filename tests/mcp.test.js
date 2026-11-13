'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { Cache } = require('../companion/cache');
test('MCP exposes exactly two tools, uses cached facts, and records only called sources', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'azeroth-mcp-'));
  const cacheFile = path.join(dir, 'cache.sqlite'); const cache = new Cache(cacheFile);
  cache.put('pages', 'wiki:101', { text: 'A verified fixture.' }, 100000); cache.close();
  const audit = path.join(dir, 'sources.json'); const jobFile = path.join(dir, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify({ cache: cacheFile, audit, facts: { q: { 101: { name: 'A Meadow Errand' } } } }));
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, '../companion/tools-mcp.js'), jobFile], stderr: 'ignore' }));
  // Close the server first. On Windows, it holds the cache file open, and the folder delete fails.
  t.after(async () => { await client.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  assert.deepEqual((await client.listTools()).tools.map(x => x.name), ['wiki_lookup', 'wowhead_lookup']);
  const result = await client.callTool({ name: 'wiki_lookup', arguments: { quest_id: 101 } });
  assert.match(result.content[0].text, /verified fixture/); assert.ok(result.content[0].text.length <= 1500);
  assert.equal(JSON.parse(fs.readFileSync(audit, 'utf8')).sources.length, 1);
  assert.equal((await client.callTool({ name: 'wowhead_lookup', arguments: { type: 'quest', id: 999 } })).isError, true);
});
