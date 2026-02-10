import { spawn } from 'child_process';

const serverCmd = 'node';
const serverArgs = ['dist/server.js'];
const smokeCmd = 'node';
const smokeArgs = ['scripts/smoke.mjs'];

function waitForServer(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(url, { method: 'GET' });
        // accept any HTTP response (200..499) as server up
        if (res.status && res.status < 500) return resolve(true);
      } catch (e) {
        // ignore
      }
      if (Date.now() - start > timeout) return reject(new Error('Server did not start in time'));
      setTimeout(check, 500);
    };
    check();
  });
}

(async () => {
  console.log('Starting compiled server...');
  const server = spawn(serverCmd, serverArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server-err] ${d}`));

  server.on('exit', (code, signal) => {
    console.log(`Server exited with ${code || signal}`);
  });

  try {
    await waitForServer('http://localhost:5001/api');
    console.log('Server is up; running smoke script');
    const smoke = spawn(smokeCmd, smokeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    smoke.stdout.on('data', (d) => process.stdout.write(`[smoke] ${d}`));
    smoke.stderr.on('data', (d) => process.stderr.write(`[smoke-err] ${d}`));

    const code = await new Promise((res) => smoke.on('exit', res));
    console.log('Smoke script finished with code', code);
  } catch (err) {
    console.error('Error running smoke runner:', err);
  } finally {
    try {
      server.kill();
    } catch (e) {}
  }
})();
