#!/usr/bin/env node
/**
 * Start backend dev server. On Windows, kills any process using port 4000 first.
 * Run: node scripts/start-dev.js
 */
const { spawn } = require('child_process');
const http = require('http');

const PORT = 4000;

function killPort(port) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'netstat' : 'lsof';
    const args = isWin ? ['-ano'] : ['-i', `:${port}`];
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('close', (code) => {
      const pids = new Set();
      if (isWin) {
        out.split('\n').forEach((line) => {
          if (line.includes('LISTENING') && line.includes(':' + port)) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid)) pids.add(pid);
          }
        });
      } else {
        out.split('\n').slice(1).forEach((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts[1] && parts[1].includes('*:' + port)) {
            const pid = parts[1].split('*')[0];
            if (pid && !isNaN(parseInt(pid))) pids.add(pid);
          }
        });
      }
      pids.forEach((pid) => {
        try {
          process.kill(parseInt(pid), 'SIGTERM');
          console.log(`Killed process ${pid} on port ${port}`);
        } catch (_) {}
      });
      setTimeout(resolve, 1500);
    });
  });
}

function portInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  const inUse = await portInUse(PORT);
  if (inUse) {
    console.log(`Port ${PORT} in use - killing existing process...`);
    await killPort(PORT);
  }
  console.log('Starting backend...');
  const child = spawn('npx', ['ts-node-dev', '--respawn', '--transpile-only', 'server.ts'], {
    stdio: 'inherit',
    cwd: __dirname + '/..',
  });
  child.on('exit', (code) => process.exit(code || 0));
})();
