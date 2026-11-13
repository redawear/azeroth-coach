'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
function captureArgs(cfg) {
  return ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'capture.ps1'), '-ProcessName', cfg.capture.process, '-ClientFolder', cfg.capture.clientFolder, '-IntervalMs', String(cfg.capture.intervalMs)];
}
class Capture {
  constructor(cfg, message, log = () => {}) { this.cfg = cfg; this.message = message; this.log = log; this.lastClear = 0; this.stopped = false; }
  start() {
    if (this.stopped) return;
    this.child = spawn('powershell.exe', captureArgs(this.cfg), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    this.child.stdout.on('data', data => {
      buffer += data.toString(); const lines = buffer.split('\n'); buffer = lines.pop();
      if (buffer.length > 100000) buffer = '';
      for (const line of lines) {
        try { const msg = JSON.parse(line); if (msg.clear) this.lastClear = Date.now(); else if (msg.text) this.message(msg.text); else if (msg.info || msg.warn) this.log(msg.info || msg.warn); } catch {}
      }
    });
    this.child.stderr.on('data', () => this.log('Capture error. Run npm run doctor.'));
    this.child.on('error', () => this.log('Cannot start PowerShell. Run npm run doctor.'));
    this.child.on('close', () => { if (!this.stopped) this.timer = setTimeout(() => this.start(), 3000); });
  }
  async shot(job) {
    const started = Date.now();
    while (this.lastClear <= (job.receivedAt || started) && Date.now() - started < 8000) await new Promise(resolve => setTimeout(resolve, 50));
    if (this.lastClear <= (job.receivedAt || started)) return null;
    await new Promise(resolve => setTimeout(resolve, 300));
    const fs = require('node:fs'); const crypto = require('node:crypto');
    const folder = path.join(this.cfg.runtime, 'shots'); fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, crypto.randomUUID() + '.png');
    return new Promise(resolve => {
      const child = spawn('powershell.exe', [...captureArgs(this.cfg), '-Shot', file], { windowsHide: true, stdio: 'ignore' });
      let finished = false;
      const finish = ok => { if (finished) return; finished = true; clearTimeout(timer); if (!ok) fs.rmSync(file, { force: true }); resolve(ok ? file : null); };
      const timer = setTimeout(() => { child.kill(); finish(false); }, 10000);
      child.on('error', () => finish(false)); child.on('close', code => finish(code === 0 && fs.existsSync(file)));
    });
  }
  async stop() {
    this.stopped = true; clearTimeout(this.timer);
    if (this.child && this.child.exitCode === null) await new Promise(resolve => { this.child.once('close', resolve); this.child.kill(); });
  }
}
module.exports = { Capture, captureArgs };
