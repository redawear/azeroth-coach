'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
function captureArgs(cfg) {
  return ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'capture.ps1'), '-ProcessName', cfg.capture.process, '-ClientFolder', cfg.capture.clientFolder, '-IntervalMs', String(cfg.capture.intervalMs)];
}
class Capture {
  constructor(cfg, message, log = () => {}) { this.cfg = cfg; this.message = message; this.log = log; this.lastClear = 0; this.stopped = false; this.shots = new Set(); }
  receive(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.clear) this.lastClear = Date.now();
      else if (msg.text) this.message(msg.text);
      else if (msg.info) {
        if (msg.info !== this.lastInfo) { this.lastInfo = msg.info; this.log(msg.info); }
      } else if (msg.warn) this.log(msg.warn);
    } catch {}
  }
  start() {
    if (this.stopped) return;
    this.child = spawn('powershell.exe', captureArgs(this.cfg), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    this.child.stdout.on('data', data => {
      buffer += data.toString(); const lines = buffer.split('\n'); buffer = lines.pop();
      if (buffer.length > 100000) buffer = '';
      for (const line of lines) this.receive(line);
    });
    this.child.stderr.on('data', () => this.log('Capture error. Restart Azeroth Coach from the Start menu.'));
    this.child.on('error', () => this.log('Cannot start PowerShell. Restart Azeroth Coach from the Start menu.'));
    this.child.on('close', () => { if (!this.stopped) this.timer = setTimeout(() => this.start(), 3000); });
  }
  async shot(job) {
    if (this.stopped) return null;
    const started = Date.now();
    while (!this.stopped && this.lastClear <= (job.receivedAt || started) && Date.now() - started < 8000) await new Promise(resolve => setTimeout(resolve, 50));
    if (this.stopped || this.lastClear <= (job.receivedAt || started)) return null;
    await new Promise(resolve => setTimeout(resolve, 300));
    if (this.stopped) return null;
    const fs = require('node:fs'); const crypto = require('node:crypto');
    const folder = path.join(this.cfg.runtime, 'shots'); fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, crypto.randomUUID() + '.png');
    return new Promise(resolve => {
      const child = spawn('powershell.exe', [...captureArgs(this.cfg), '-Shot', file], { windowsHide: true, stdio: 'ignore' });
      this.shots.add(child); child.once('close', () => this.shots.delete(child));
      let finished = false;
      const finish = ok => { if (finished) return; finished = true; clearTimeout(timer); if (!ok) fs.rmSync(file, { force: true }); resolve(ok ? file : null); };
      const timer = setTimeout(() => { child.kill(); finish(false); }, 10000);
      child.on('error', () => finish(false)); child.on('close', code => finish(code === 0 && fs.existsSync(file)));
    });
  }
  async stop() {
    this.stopped = true; clearTimeout(this.timer);
    await Promise.all([this.child, ...this.shots].filter(child => child && child.exitCode === null).map(child => new Promise(resolve => { child.once('close', resolve); child.kill(); })));
  }
}
module.exports = { Capture, captureArgs };
