'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadConfig, atomic } = require('./config');
const { prompt, tipSchema, parseContext } = require('./prompts');
const { validate } = require('./validate');
const { run } = require('./agents');
function errorText(code, cfg, job, minutes) {
  const provider = cfg.provider === 'claude' ? 'Claude' : 'Codex';
  return {
    rate: `Limit reached: ${cfg.limits[job.job]} questions each hour. Try again in ${minutes || 1} min.`,
    auth: `${provider} is not signed in on this PC. Run "${cfg.provider}" in a terminal, sign in, then ask again.`,
    plan: `Your ${provider} plan reached its limit. Tips now come from the quest data.`,
    timeout: `No answer after ${cfg.jobs[job.job].timeout} s. Ask again.`,
    invalid: 'The answer did not match the quest data. Ask again.',
    shot: 'The screenshot failed. The coach answers without it.',
    failed: 'The companion could not finish this question. Run "npm run doctor".'
  }[code] || 'The companion could not finish this question. Run npm run doctor.';
}
class Jobs {
  constructor(cache, { config = loadConfig, runner = run, screenshot = async () => null, progress = () => {}, log = () => {} } = {}) {
    this.cache = cache; this.config = config; this.runner = runner; this.screenshot = screenshot; this.progress = progress; this.log = log;
    this.pending = new Set(); this.stopping = false;
    this.busy = new Set(); this.chatQueue = Promise.resolve();
  }
  submit(job) {
    // Preserve chat order, including deep questions. Coach runs have a separate lane.
    const task = job.job === 'coach' ? this.execute(job) : this.chatQueue.then(() => this.execute(job));
    if (job.job !== 'coach') this.chatQueue = task.catch(() => {});
    this.pending.add(task);
    task.then(() => this.pending.delete(task), () => this.pending.delete(task));
    return task;
  }
  stop() { this.stopping = true; }
  async drain() { await Promise.allSettled([...this.pending]); }
  async execute(job) {
    const cfg = this.config();
    const base = { chat: job.chat, id: job.id, by: `${cfg.provider === 'claude' ? 'Claude' : 'Codex'} ${cfg.jobs[job.job].model ? cfg.jobs[job.job].model.replace(/^./, c => c.toUpperCase()) : 'CLI default'} · ${cfg.jobs[job.job].effort}`, sources: [] };
    if (this.stopping) return { ...base, status: 'error', code: 'failed', text: errorText('failed', cfg, job) };
    let work, image, captured, reserved;
    if (this.busy.has(job.job)) return { ...base, status: 'error', code: 'rate', text: 'The coach is busy. Try again after this answer.' };
    this.busy.add(job.job);
    try {
      const { context, facts: currentFacts } = parseContext(job.ctx);
      const historyRows = this.cache.history(6, job.session);
      const facts = {};
      for (const row of historyRows) for (const [kind, rows] of Object.entries(row.facts || {})) {
        facts[kind] ||= {};
        for (const [id, fact] of Object.entries(rows)) facts[kind][id] = { name: fact.name };
      }
      for (const [kind, rows] of Object.entries(currentFacts)) facts[kind] = { ...facts[kind], ...rows };
      const hash = crypto.createHash('sha256').update(JSON.stringify({ trigger: job.trigger, text: job.text, facts, provider: cfg.provider, spec: cfg.jobs[job.job] })).digest('hex');
      if (job.job === 'coach') {
        const hit = this.cache.get('answers', hash);
        if (hit && validate(JSON.stringify({ text: hit.text }), facts, true)) return { ...base, ...hit, status: 'done' };
      }
      reserved = this.cache.reserve(job.job, cfg.limits[job.job]);
      if (!reserved.ok) return { ...base, status: 'error', code: 'rate', text: errorText('rate', cfg, job, reserved.minutes) };
      work = fs.mkdtempSync(path.join(cfg.runtime, 'run-'));
      const cwd = path.join(work, 'empty'); fs.mkdirSync(cwd);
      const audit = path.join(work, 'sources.json');
      const jobFile = path.join(work, 'job.json');
      atomic(jobFile, JSON.stringify({ cache: path.join(cfg.runtime, 'cache.sqlite'), facts, audit }));
      const mcp = path.join(work, 'mcp.json');
      atomic(mcp, JSON.stringify({ mcpServers: job.job === 'coach' ? {} : { azeroth: { command: process.execPath, args: [path.join(__dirname, 'tools-mcp.js'), jobFile] } } }));
      const schema = path.join(work, 'tip-schema.json'); atomic(schema, JSON.stringify(tipSchema));
      let shotFailed = false;
      if (job.shot && job.job !== 'coach') {
        const allowed = this.cache.reserve('shots', cfg.limits.shots);
        if (allowed.ok) {
          try {
            captured = await this.screenshot(job);
            if (captured) {
              const target = path.join(cwd, 'shot.png');
              fs.renameSync(captured, target);
              image = target; captured = null;
            }
          } catch { this.log('The screenshot file could not be prepared.'); }
        }
        if (!image) { shotFailed = true; this.progress(job, errorText('shot', cfg, job)); }
      }
      const history = historyRows.map(({ role, text }) => ({ role, text }));
      if (this.stopping) throw Object.assign(new Error('The companion stopped.'), { code: 'failed' });
      const result = await this.runner(cfg, job, { cwd, mcp, job: jobFile, audit, schema, image }, prompt(job, context, facts, history, image), text => this.progress(job, text));
      this.cache.tokens(reserved.id, result.tokens);
      const text = validate(result.text, facts, job.job === 'coach');
      if (!text) throw Object.assign(new Error('Invalid answer.'), { code: 'invalid' });
      let used = { sources: [] };
      if (fs.existsSync(audit)) used = JSON.parse(fs.readFileSync(audit, 'utf8'));
      // Audit files come only from our MCP server. Never accept model-written links.
      const sources = (used.sources || []).filter(s => /^https:\/\/(?:warcraft\.wiki\.gg\/wiki\/|www\.wowhead\.com\/forever\/(?:quest|npc|item|object)=\d+$)/.test(s.url));
      const notes = [];
      if (used.blocked) notes.push('Wowhead is not available now. The coach used the wiki.');
      if (shotFailed) notes.push('The screenshot failed. The coach answers without it.');
      const reply = { ...base, status: 'done', text, sources, notes, shotDone: !!job.shot };
      if (job.job === 'coach') this.cache.put('answers', hash, { text, by: base.by }, 86400000);
      else {
        this.cache.addHistory('you', job.text, { facts }, job.session);
        this.cache.addHistory('coach', reply.text, { by: reply.by, sources, notes, facts }, job.session);
      }
      return reply;
    } catch (error) {
      const code = ['auth', 'plan', 'timeout', 'invalid', 'failed'].includes(error.code) ? error.code : 'failed';
      this.log(`AI error (${code}): ${require('./agents').redact(error.detail || error.message)}`);
      return { ...base, status: 'error', code, shotDone: !!job.shot, text: errorText(code, cfg, job) };
    } finally {
      this.busy.delete(job.job);
      // A locked file on Windows must not hide the answer. Startup recovery deletes old run folders.
      for (const file of [captured, image, work]) {
        if (!file) continue;
        try { fs.rmSync(file, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
        catch (error) { this.log(`Cleanup failed for ${path.basename(file)}: ${error.code}`); }
      }
    }
  }
}
module.exports = { Jobs, errorText };
