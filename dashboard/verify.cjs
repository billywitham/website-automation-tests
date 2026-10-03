const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
test('dashboard runs Playwright and persists results, durations, retries and reports', { timeout: 60000 }, async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-check-'));
  const fixture = path.resolve('tests/dashboard-verification.spec.ts');
  assert.equal(fs.existsSync(fixture), false, 'Verification fixture must not overwrite a file');
  fs.writeFileSync(fixture, `import { test, expect } from '@playwright/test';
test('passes', async () => { await new Promise(r => setTimeout(r, 100)); expect(true).toBe(true); });
test('fails', async () => { expect(true).toBe(false); });
test('flaky', async ({}, info) => { expect(info.retry).toBe(1); });
test.skip('skips', async () => {});
`);
  let child;
  async function launch() {
    child = spawn(process.execPath, ['dashboard/server.cjs'], { env:{ ...process.env, DASHBOARD_PORT:'0', DASHBOARD_DATA_DIR:data }, windowsHide:true });
    return new Promise((resolve, reject) => {
      let output = ''; child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
      child.on('error', reject); child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() { if (child && child.exitCode === null) { const closed = new Promise(r => child.once('exit', r)); child.kill(); await closed; } }
  try {
    let base = await launch();
    const api = async (route, body, origin = base, method = body ? 'POST' : 'GET') => {
      const response = await fetch(base + route, { method, headers:{ 'Content-Type':'application/json', Origin:origin }, ...(body ? { body:JSON.stringify(body) } : {}) });
      return { status:response.status, body:await response.json() };
    };
    const catalog = (await api('/api/catalog')).body;
    assert.ok(catalog.files.includes('tests/dashboard-verification.spec.ts'));
    const definition = { name:'Verification run', files:['tests/dashboard-verification.spec.ts'], projects:[catalog.projects[0]], baseURL:'http://localhost:12345', workers:1, retries:1, grep:'' };
    assert.equal((await api('/api/runs', definition, 'https://example.com')).status, 403);
    assert.equal((await api('/api/runs', { ...definition, files:['../secret'] })).status, 400);
    const saved = await api('/api/definitions', definition);
    assert.equal(saved.status, 201);
    const definitionRoute = `/api/definitions/${saved.body.id}`;
    assert.equal((await api(definitionRoute, { name:' ' }, base, 'PATCH')).status, 400);
    assert.equal((await api(definitionRoute, { name:'Blocked' }, 'https://example.com', 'PATCH')).status, 403);
    assert.equal((await api(definitionRoute, { name:'  Renamed run  ' }, base, 'PATCH')).body.name, 'Renamed run');
    const renamed = (await api('/api/definitions')).body[0];
    assert.deepEqual(renamed, { ...saved.body, name:'Renamed run' });
    const created = await api('/api/runs', definition); assert.equal(created.status, 201);
    assert.equal((await api('/api/runs', definition)).status, 400);
    let run;
    for (let i = 0; i < 100; i++) {
      run = (await api(`/api/runs/${created.body.id}`)).body;
      if (run.status !== 'running') break;
      await delay(300);
    }
    assert.equal(run.status, 'failed'); assert.ok(run.durationMs > 100);
    assert.equal(run.results.tests.length, 6);
    assert.ok(run.results.tests.some(t => t.status === 'passed' && t.durationMs >= 100));
    assert.ok(run.results.tests.some(t => t.status === 'skipped'));
    assert.ok(run.results.tests.some(t => t.retry === 1 && t.errors.length));
    assert.equal(run.reportAvailable, true);
    assert.equal((await fetch(`${base}/runs/${run.id}/report/index.html`)).status, 200);
    assert.ok((await api(`/api/runs/${run.id}/log`)).body.log.length);
    await stop(); base = await launch();
    assert.equal((await api('/api/runs')).body[0].id, run.id);
    assert.equal((await api('/api/definitions')).body.length, 1);
    assert.equal((await api('/api/definitions')).body[0].name, 'Renamed run');
    assert.equal((await api(definitionRoute, undefined, 'https://example.com', 'DELETE')).status, 403);
    assert.equal((await api(definitionRoute, undefined, base, 'DELETE')).status, 200);
    assert.equal((await api(definitionRoute, undefined, base, 'DELETE')).status, 404);
    await stop(); base = await launch();
    assert.deepEqual((await api('/api/definitions')).body, []);
    assert.equal((await api(`/api/runs/${run.id}`)).body.definition.name, definition.name);
    const passed = await api('/api/runs', { ...definition, grep:'passes' });
    for (let i = 0; i < 100; i++) { run = (await api(`/api/runs/${passed.body.id}`)).body; if (run.status !== 'running') break; await delay(300); }
    assert.equal(run.status, 'passed'); assert.equal(run.results.tests.length, 1);
  } finally {
    await stop(); fs.unlinkSync(fixture);
    // Only remove the verified temporary directory created by this check.
    assert.ok(data.startsWith(path.join(os.tmpdir(), 'dashboard-check-')));
    fs.rmSync(data, { recursive:true, force:true });
  }
});
