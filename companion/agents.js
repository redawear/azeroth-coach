'use strict';
// Stream parser and Windows npm launcher support adapted from wow-ai (MIT).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const activeChildren = new Set();
async function stopRuns() {
  await Promise.all([...activeChildren].map(child => new Promise(resolve => {
    child.once('close', resolve); killTree(child);
  })));
}
function resolveCommand(provider, configured) {
  if (!['claude', 'codex'].includes(provider)) throw new Error('Unknown provider.');
  const exists = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const dirs = (process.env.PATH || '').split(path.delimiter);
  if (process.platform === 'win32' && process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm'));
  const candidates = configured ? [configured] : [path.join(os.homedir(), '.local', 'bin', provider + (process.platform === 'win32' ? '.exe' : '')), ...dirs.flatMap(d => process.platform === 'win32' ? [path.join(d, provider + '.exe'), path.join(d, provider + '.cmd')] : [path.join(d, provider)])];
  for (const file of candidates) {
    if (!exists(file)) continue;
    if (/\.(cmd|bat)$/i.test(file)) {
      const src = fs.readFileSync(file, 'utf8');
      const match = [...src.matchAll(/"%~?dp0%?\\([^"]+)"/g)].find(x => !/(^|\\)node\.exe$/i.test(x[1]));
      if (!match) continue;
      const script = path.resolve(path.dirname(file), match[1].replace(/\\/g, path.sep));
      if (exists(script)) return { file: /\.exe$/i.test(script) ? script : process.execPath, args: /\.exe$/i.test(script) ? [] : [script] };
    } else return { file: /\.(?:c|m)?js$/i.test(file) ? process.execPath : file, args: /\.(?:c|m)?js$/i.test(file) ? [file] : [] };
  }
  throw Object.assign(new Error(`${provider} is not installed. Set cliPath in config.json, or install the CLI.`), { code: 'auth' });
}
function toolLine(name, args) {
  if (/wiki_lookup$/.test(name)) return 'Reads Warcraft Wiki';
  if (/wowhead_lookup$/.test(name)) return `Reads Wowhead ${args?.type || 'quest'} ${args?.id || ''}`.trim();
  return null;
}
function parser(provider) {
  let last = '';
  return ev => {
    if (provider === 'claude') {
      if (ev.type === 'assistant') {
        const tool = ev.message?.content?.find(x => x.type === 'tool_use');
        return { progress: tool && toolLine(tool.name, tool.input) };
      }
      if (ev.type === 'result') return { done: true, text: ev.structured_output ? JSON.stringify(ev.structured_output) : String(ev.result || ''), error: !!ev.is_error, tokens: (ev.usage?.input_tokens || 0) + (ev.usage?.output_tokens || 0) };
    } else {
      if (ev.type === 'item.completed' && ev.item?.type === 'agent_message') last = ev.item.text;
      if (ev.type === 'item.started' && ev.item?.type === 'mcp_tool_call') return { progress: toolLine(ev.item.tool, ev.item.arguments) };
      if (ev.type === 'turn.completed') return { done: true, text: last, tokens: (ev.usage?.input_tokens || 0) + (ev.usage?.output_tokens || 0) };
      if (['turn.failed', 'error'].includes(ev.type)) return { done: true, error: true, text: ev.error?.message || ev.message || 'The AI run failed.' };
    }
    return {};
  };
}
function argsFor(provider, cfg, job, files, disabledServers = [], disabledFeatures = ["shell_tool", "unified_exec"]) {
  const spec = cfg.jobs[job.job];
  if (provider === 'claude') {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', spec.model, '--effort', spec.effort, '--tools', files.image ? 'Read' : '', '--strict-mcp-config', '--mcp-config', files.mcp, '--setting-sources', '', '--no-session-persistence', '--permission-mode', 'default', '--append-system-prompt', require('./prompts').RULES];
    const allowed = job.job === 'coach' ? [] : ['mcp__azeroth__wiki_lookup', 'mcp__azeroth__wowhead_lookup'];
    if (files.image) allowed.push('Read(./shot.png)');
    if (allowed.length) args.push('--allowedTools', ...allowed);
    if (job.job === 'coach') args.push('--json-schema', JSON.stringify(require('./prompts').tipSchema));
    return args;
  }
  const args = ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only'];
  for (const feature of disabledFeatures) args.push('--disable', feature);
  args.push('-c', 'web_search="disabled"', '-c', 'approval_policy="never"', '-c', `model_reasoning_effort=${JSON.stringify(spec.effort)}`);
  if (files.image) args.push('-i', files.image);
  args.push('-C', files.cwd);
  if (spec.model) args.push('-m', spec.model);
  for (const name of disabledServers) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw Object.assign(new Error('A Codex MCP name cannot be disabled safely. Rename it with letters, numbers, underscores or hyphens.'), {code: 'failed'});
    args.push('-c', `mcp_servers.${name}.enabled=false`);
  }
  if (job.job !== 'coach') {
    args.push('-c', `mcp_servers.azeroth={command=${JSON.stringify(process.execPath)},args=${JSON.stringify([path.join(__dirname, 'tools-mcp.js'), files.job])},enabled=true}`);
  }
  if (job.job === 'coach') args.push('--output-schema', files.schema);
  args.push('-'); return args;
}
function killTree(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}
function classify(text) {
  if (/rate.?limit|usage.?limit|quota|capacity|credits? (?:exhausted|limit)|limit (?:reached|exceeded)/i.test(text)) return 'plan';
  if (/\bauth(?:entication|orization)?\b|\bsign[ -]?in\b|\blog[ -]?in\b|\b401\b|\bcredentials?\b|not installed/i.test(text)) return 'auth';
  return 'failed';
}
const CLOSED_FEATURES = ['shell_tool', 'unified_exec', 'multi_agent', 'multi_agent_v2', 'apps', 'browser_use', 'computer_use', 'image_generation', 'plugins', 'hooks', 'view_image', 'js_repl', 'js_repl_tools_only'];
function redact(text) {
  return String(text).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|(?:access[_-]?)?token|authorization|password)["' ]*[:=]["' ]*)[^\s,"'}]+/gi, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[redacted]').slice(-1200);
}
function inspectCodex(command, timeout = 15000) {
  const deadline = Date.now() + timeout;
  const call = args => {
    const result = spawnSync(command.file, [...command.args, ...args], { encoding: 'utf8', windowsHide: true, timeout: Math.max(1, deadline - Date.now()), maxBuffer: 2_000_000 });
    if (result.status !== 0) throw Object.assign(new Error('Cannot verify the Codex tool policy. Run npm run doctor.'), { code: 'failed' });
    return result.stdout;
  };
  const parseFeatures = text => new Map(text.trim().split('\n').map(line => {
    const match = line.trim().match(/^(\S+)\s+.*\s+(true|false)$/);
    return match ? [match[1], match[2] === 'true'] : [];
  }).filter(pair => pair.length));
  const advertised = parseFeatures(call(['features', 'list']));
  // OpenAI documents unified_exec as always on. shell_tool controls whether commands are exposed.
  const features = CLOSED_FEATURES.filter(name => name !== 'unified_exec' && advertised.has(name));
  if (!advertised.has('shell_tool')) throw Object.assign(new Error('This Codex version cannot prove that shell tools are off.'), { code: 'failed' });
  const off = features.flatMap(name => ['--disable', name]);
  const verified = parseFeatures(call([...off, 'features', 'list']));
  if (features.some(name => verified.get(name) !== false)) throw Object.assign(new Error('Codex tool restrictions did not take effect.'), { code: 'failed' });
  // This response can hold bearer tokens. Keep it in memory. Never log or return it.
  const servers = JSON.parse(call(['mcp', 'list', '--json'])).map(row => row.name);
  if (servers.some(name => !/^[A-Za-z0-9_-]+$/.test(name))) throw Object.assign(new Error('Rename Codex MCP servers with letters, numbers, underscores or hyphens.'), { code: 'failed' });
  const disabled = servers.flatMap(name => ['-c', `mcp_servers.${name}.enabled=false`]);
  const checked = JSON.parse(call([...disabled, 'mcp', 'list', '--json']));
  if (checked.some(row => row.enabled !== false)) throw Object.assign(new Error('Codex MCP restrictions did not take effect.'), { code: 'failed' });
  return { servers, features };
}
async function run(cfg, job, files, prompt, progress = () => {}) {
  const command = resolveCommand(cfg.provider, cfg.cliPath);
  const policy = cfg.provider === 'codex' ? inspectCodex(command, cfg.policyTimeoutMs) : { servers: [], features: [] };
  const args = [...command.args, ...argsFor(cfg.provider, cfg, job, files, policy.servers, policy.features)];
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.CLAUDECODE;
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[key];
    const child = spawn(command.file, args, { cwd: files.cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    activeChildren.add(child);
    child.once('close', () => activeChildren.delete(child));
    const parse = parser(cfg.provider); let buffer = '', stderr = '', result, bytes = 0, stopped = false;
    // Reject only after the child exits. On Windows, a live child locks its work folder, and the cleanup fails.
    const stop = error => {
      if (stopped) return; stopped = true; clearTimeout(timer); killTree(child);
      const fallback = setTimeout(() => reject(error), 5000);
      child.once('close', () => { clearTimeout(fallback); reject(error); });
    };
    const timer = setTimeout(() => stop(Object.assign(new Error('The AI run timed out.'), { code: 'timeout' })), cfg.jobs[job.job].timeout * 1000);
    child.stdout.on('data', data => {
      bytes += data.length;
      if (bytes > 4_000_000) { stop(Object.assign(new Error('The AI output is too large.'), { code: 'invalid' })); return; }
      buffer += data.toString(); const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) { try { const item = parse(JSON.parse(line)); if (item.progress) progress(item.progress); if (item.done) result = item; } catch {} }
    });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer); if (stopped) return;
      if (buffer.trim()) { try { const item = parse(JSON.parse(buffer)); if (item.done) result = item; } catch {} }
      if (code !== 0 || !result || result.error) reject(Object.assign(new Error('The AI run failed.'), { code: classify((result?.text || '') + stderr), detail: redact((result?.text || '') + stderr) }));
      else resolve(result);
    });
    child.stdin.on('error', () => {}); child.stdin.end(prompt);
  });
}
module.exports = { resolveCommand, argsFor, parser, run, classify, killTree, inspectCodex, redact, stopRuns };
