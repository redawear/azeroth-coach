'use strict';
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
function endpoint(dir) {
  const id = crypto.createHash('sha256').update(path.resolve(dir).toLowerCase()).digest('hex').slice(0, 20);
  return process.platform === 'win32' ? `\\\\.\\pipe\\azeroth-coach-${id}` : path.join(dir, 'companion.sock');
}
function requestStop(dir) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(endpoint(dir)); let reply = '';
    socket.setTimeout(15000, () => socket.destroy(new Error('The companion did not stop.')));
    socket.on('connect', () => socket.write('stop\n'));
    socket.on('data', data => { reply += data; });
    socket.on('end', () => reply === 'stopped\n' ? resolve(true) : reject(new Error('The companion did not stop.')));
    socket.on('error', error => ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? resolve(false) : reject(error));
  });
}
async function acquire(dir, stop) {
  const address = endpoint(dir);
  const listen = () => new Promise((resolve, reject) => {
    const server = net.createServer(socket => {
      socket.on('error', () => {}); socket.setTimeout(1000, () => socket.destroy());
      let input = '', requested = false;
      socket.on('data', async data => {
        if (requested) return;
        input += data;
        if (input.length > 64) return socket.destroy();
        if (input === 'stop\n') {
          requested = true; socket.setTimeout(0);
          try { await stop(); socket.end('stopped\n'); if (server.listening) server.close(); }
          catch { socket.destroy(); }
        }
      });
    });
    server.once('error', reject); server.listen(address, () => { server.removeListener('error', reject); resolve(server); });
  });
  try { return await listen(); }
  catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    if (process.platform === 'win32') return null;
    const alive = await new Promise(resolve => {
      const socket = net.connect(address);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
    });
    if (alive) return null;
    // Windows removes a pipe at exit. Unix can leave a socket after a crash.
    try { fs.unlinkSync(address); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { return await listen(); } catch (e) { if (e.code === 'EADDRINUSE') return null; throw e; }
  }
}
module.exports = { acquire, requestStop, endpoint };
