const base = 'http://localhost:5001';
const ts = new Date().toISOString().replace(/[:.]/g, "");
const clientEmail = `testclient+${ts}@example.com`;
const runnerEmail = `testrunner+${ts}@example.com`;
const clientPass = 'Passw0rd!';
const runnerPass = 'Passw0rd!';

function log(title, obj) {
  console.log('===', title, '===');
  if (obj === undefined) return;
  try { console.log(JSON.stringify(obj, null, 2)); } catch (e) { console.log(obj); }
}

async function post(path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
    body: JSON.stringify(body),
    timeout: 20000,
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
}

async function get(path, token) {
  const res = await fetch(`${base}${path}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
}

(async () => {
  try {
    log('Register client', await post('/api/auth/register', { name: 'Smoke Client', email: clientEmail, password: clientPass, role: ['client'] }));
    const loginClient = await post('/api/auth/login', { email: clientEmail, password: clientPass });
    log('Login client', loginClient);
    const clientToken = loginClient.body?.token;

    log('Topup client 100', await post('/api/wallet/topup', { amount: 100 }, clientToken));

    log('Register runner', await post('/api/auth/register', { name: 'Smoke Runner', email: runnerEmail, password: runnerPass, role: ['runner'] }));
    const loginRunner = await post('/api/auth/login', { email: runnerEmail, password: runnerPass });
    log('Login runner', loginRunner);
    const runnerToken = loginRunner.body?.token;

    const createTask = await post('/api/tasks', { title: 'Smoke Task', description: 'Smoke test', budget: 50, location: 'Test Address' }, clientToken);
    log('Create task', createTask);
    const taskId = createTask.body?.task?._id;

    log('Available tasks (runner)', await get('/api/tasks/available', runnerToken));

    if (taskId) {
      log('Accept task', await post(`/api/tasks/${taskId}/accept`, {}, runnerToken));
      log('Complete task', await post(`/api/tasks/${taskId}/complete`, {}, runnerToken));
    } else {
      log('No task id, skipping accept/complete');
    }
  } catch (err) {
    console.error('Smoke script error', err);
  }
})();
