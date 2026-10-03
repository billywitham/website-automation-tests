const $ = id => document.getElementById(id);
let definitions = [], runs = [], selected, busy = false;
const duration = ms => ms == null ? 'Unavailable' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)}m ${Math.floor(ms % 60000 / 1000)}s`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
async function api(route, value) {
  const response = await fetch(`/api/${route}`, value ? { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(value) } : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
function notice(message) { $('notice').textContent = message; }
function definition() {
  return { name:$('name').value, baseURL:$('baseURL').value, grep:$('grep').value, workers:Number($('workers').value), retries:Number($('retries').value),
    files:[...$('files').querySelectorAll(':checked')].map(c => c.value), projects:[...$('projects').querySelectorAll(':checked')].map(c => c.value) };
}
function apply(value) {
  for (const key of ['name','baseURL','grep','workers','retries']) $(key).value = value[key];
  for (const key of ['files','projects']) for (const input of $(key).querySelectorAll('input')) input.checked = value[key].includes(input.value);
}
function counts(run) {
  const latest = new Map(); for (const test of run.results.tests) latest.set(test.id, test);
  const tests = [...latest.values()];
  return { passed: tests.filter(t => t.status !== 'skipped' && t.status === t.expectedStatus).length,
    failed: tests.filter(t => t.status !== 'skipped' && t.status !== t.expectedStatus).length, skipped:tests.filter(t => t.status === 'skipped').length };
}
function render() {
  const finished = runs.filter(r => ['passed','failed'].includes(r.status));
  $('metrics').innerHTML = [['Total runs',runs.length],['Passed runs',finished.filter(r => r.status === 'passed').length],['Failed runs',finished.filter(r => r.status === 'failed').length],['Latest duration',runs[0] ? elapsed(runs[0]) : '—']].map(([title,value]) => `<div class="metric"><span>${title}</span><strong>${escape(value)}</strong></div>`).join('');
  $('run-count').textContent = `${runs.length} runs`;
  $('history').innerHTML = runs.length ? runs.map(run => {
    const c = counts(run);
    return `<button class="run ${run.id === selected ? 'selected' : ''}" data-id="${run.id}"><span class="run-head"><span>${escape(run.definition.name)}</span><span class="badge ${run.status}">${run.status}</span></span><small>${escape(new Date(run.startedAt).toLocaleString())} · ${escape(elapsed(run))}</small><small>${c.passed} passed · ${c.failed} failed · ${c.skipped} skipped · ${escape(run.definition.projects.join(', '))}</small></button>`;
  }).join('') : '<p class="empty">No runs yet. Execute a run to start your history.</p>';
  $('execute').disabled = busy || runs.some(r => r.status === 'running');
  const run = runs.find(r => r.id === selected); $('detail').hidden = !run;
  if (!run) return;
  $('detail-title').textContent = run.definition.name;
  $('detail-meta').textContent = `${run.status.toUpperCase()} · ${elapsed(run)} total elapsed · ${run.definition.baseURL} · ${run.definition.workers} workers · ${run.definition.retries} retries`;
  $('report').hidden = !run.reportAvailable; $('report').href = `/runs/${run.id}/report/index.html`;
  $('results').innerHTML = run.results.tests.map(t => `<tr><td>${escape(t.title)}</td><td><span class="badge ${t.status}">${escape(t.status)}</span>${t.status === t.expectedStatus && t.status !== 'passed' && t.status !== 'skipped' ? ' (expected)' : ''}</td><td>${duration(t.durationMs)}</td><td>${t.retry + 1}</td></tr>`).join('') || '<tr><td colspan="4">Waiting for test results…</td></tr>';
  const errors = [...(run.results.errors || []), ...run.results.tests.flatMap(t => t.errors), ...(run.launchError ? [run.launchError] : [])];
  $('errors').innerHTML = errors.map(e => `<pre>${escape(e)}</pre>`).join('');
}
function elapsed(run) { return duration(run.status === 'running' ? Date.now() - Date.parse(run.startedAt) : run.durationMs); }
async function refresh() {
  runs = await api('runs'); render();
  if (selected) { const result = await api(`runs/${selected}/log`); $('log').textContent = result.log; }
}
async function loadDefinitions() {
  definitions = await api('definitions');
  $('saved').innerHTML = '<option value="">New definition</option>' + definitions.map(d => `<option value="${d.id}">${escape(d.name)}</option>`).join('');
}
$('saved').addEventListener('change', () => { const d = definitions.find(d => d.id === $('saved').value); if (d) apply(d); });
$('history').addEventListener('click', async event => { const button = event.target.closest('[data-id]'); if (button) { selected = button.dataset.id; try { await refresh(); $('detail').scrollIntoView({ block:'nearest' }); } catch(e) { notice(e.message); } } });
$('save').addEventListener('click', async () => {
  if (!$('run-form').reportValidity()) return;
  $('save').disabled = true;
  try { const saved = await api('definitions', definition()); await loadDefinitions(); $('saved').value = saved.id; notice('Definition saved.'); } catch(e) { notice(e.message); } finally { $('save').disabled = false; }
});
$('run-form').addEventListener('submit', async event => {
  event.preventDefault(); busy = true; render(); notice('Starting test run…');
  try { const run = await api('runs', definition()); selected = run.id; notice('Run started. Results update automatically.'); await refresh(); } catch(e) { notice(e.message); } finally { busy = false; render(); }
});
(async () => {
  try {
    const catalog = await api('catalog');
    for (const key of ['files','projects']) $(key).innerHTML = catalog[key].map(value => `<label><input type="checkbox" value="${escape(value)}" checked>${escape(value)}</label>`).join('');
    $('baseURL').value = catalog.baseURL; $('name').value = 'Website regression';
    await loadDefinitions(); await refresh(); $('save').disabled = false;
    setInterval(async () => { try { await refresh(); } catch(e) { notice(`Unable to refresh: ${e.message}`); } }, 1500);
  } catch(e) { notice(`Dashboard setup failed: ${e.message}`); }
})();
