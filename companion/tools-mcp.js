'use strict';
const fs = require('node:fs');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { Cache } = require('./cache');
const { Sources } = require('./sources');
const { dataBlock } = require('./prompts');
const { atomic } = require('./config');
const TOOLS = [
  { name: 'wiki_lookup', description: 'Read one Warcraft Wiki quest page by an allowed ID.', inputSchema: { type: 'object', properties: { quest_id: { type: 'integer', minimum: 1 } }, required: ['quest_id'], additionalProperties: false } },
  { name: 'wowhead_lookup', description: 'Read one Forever entity page by an allowed ID.', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['quest', 'npc', 'item', 'object'] }, id: { type: 'integer', minimum: 1 } }, required: ['type', 'id'], additionalProperties: false } }
];
async function start(file) {
  const job = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cache = new Cache(job.cache);
  const sources = new Sources(cache, job.facts, { audit: value => atomic(job.audit, JSON.stringify(value)) });
  const server = new Server({ name: 'azeroth', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  // Calls run in order. This also keeps the per-question counters atomic.
  let queue = Promise.resolve();
  server.setRequestHandler(CallToolRequestSchema, request => {
    const run = queue.then(async () => {
      try {
        const name = request.params.name;
        if (!TOOLS.some(x => x.name === name)) throw new Error('Unknown tool.');
        const result = await sources[name](request.params.arguments || {});
        while (dataBlock(result).length > 1500 && result.text.length) result.text = result.text.slice(0, -40);
        return { content: [{ type: 'text', text: dataBlock(result) }] };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: String(error.message).slice(0, 300) }] }; }
    });
    queue = run.catch(() => {}); return run;
  });
  await server.connect(new StdioServerTransport());
}
if (require.main === module) start(process.argv[2]).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
module.exports = { TOOLS, start };
