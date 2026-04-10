/**
 * Post-deploy smoke checks against a live API (default: production).
 * No secrets required: public quote + unauthenticated admin routes (expect 401).
 *
 *   SMOKE_API_BASE=https://api.qwertymates.com/api npm run test:smoke:deploy
 */
const base = (process.env.SMOKE_API_BASE || 'https://api.qwertymates.com/api').replace(/\/$/, '');

function log(title, detail) {
  console.log(`[smoke-deploy] ${title}`, detail ?? '');
}

async function get(path) {
  const res = await fetch(`${base}${path}`, { method: 'GET' });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

(async () => {
  const failures = [];

  try {
    log('Base', base);

    // Public pricing quote (invalid body → 400 is OK; 502/503/ECONNREFUSED is not)
    const quote = await post('/pricing/quote', {});
    if (quote.status === 502 || quote.status === 503) {
      failures.push(`POST /pricing/quote: upstream error ${quote.status}`);
    } else {
      log('POST /pricing/quote', { status: quote.status });
    }

    // Admin dropshipping report without auth → 401
    const report = await get('/admin/dropshipping/report?from=2026-01-01&to=2026-01-02&groupBy=day');
    if (report.status !== 401) {
      failures.push(`GET /admin/dropshipping/report expected 401, got ${report.status}`);
    } else {
      log('GET /admin/dropshipping/report (no token)', { status: report.status });
    }

    // Per-order profit without auth → 401
    const profit = await get('/admin/dropshipping/orders/000000000000000000000000/profit');
    if (profit.status !== 401) {
      failures.push(`GET .../orders/:id/profit expected 401, got ${profit.status}`);
    } else {
      log('GET /admin/dropshipping/orders/:id/profit (no token)', { status: profit.status });
    }
  } catch (e) {
    failures.push(String(e?.message || e));
  }

  if (failures.length) {
    console.error('[smoke-deploy] FAILED:\n', failures.join('\n'));
    process.exit(1);
  }

  log('OK', 'all checks passed');
  process.exit(0);
})();
