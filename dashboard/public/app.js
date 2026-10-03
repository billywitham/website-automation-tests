const $ = id => document.getElementById(id);
let definitions = [], runs = [], selected, busy = false;
const duration = ms => ms == null ? 'Unavailable' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)}m ${Math.floor(ms % 60000 / 1000)}s`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const parseTags = value => value.split(',').map(tag => tag.trim()).filter(Boolean);
const tagBadges = tags => (tags || []).map(tag => `<span class="badge">${escape(tag)}</span>`).join(' ');
let editingRunTags;
let managingRun = false;
function runControls() {
  const run = runs.find(r => r.id === selected);
  $('rename-run').disabled = managingRun || !run;
  $('delete-run').disabled = managingRun || !run || run.status === 'running';
  $('save-run-tags').disabled = managingRun || !run;
}
async function api(route, value, method = value ? 'POST' : 'GET') {
  const response = await fetch(`/api/${route}`, { method, ...(value ? { headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(value) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
function notice(message) { $('notice').textContent = message; }
function definition() {
  return { name:$('name').value, tags:parseTags($('tags').value), baseURL:$('baseURL').value, grep:$('grep').value, workers:Number($('workers').value), retries:Number($('retries').value),
    files:[...$('files').querySelectorAll(':checked')].map(c => c.value), projects:[...$('projects').querySelectorAll(':checked')].map(c => c.value) };
}
function apply(value) {
  $('tags').value = (value.tags || []).join(', ');
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
  const filter = $('tag-filter').value;
  const tags = [...new Set(runs.flatMap(run => run.definition.tags || []))].sort();
  $('tag-filter').innerHTML = '<option value="">All runs</option>' + tags.map(tag => `<option value="${escape(tag)}">${escape(tag)}</option>`).join('');
  $('tag-filter').value = tags.includes(filter) ? filter : '';
  const visible = runs.filter(run => !$('tag-filter').value || (run.definition.tags || []).includes($('tag-filter').value));
  $('run-count').textContent = `${visible.length} of ${runs.length} runs`;
  $('history').innerHTML = visible.length ? visible.map(run => {
    const c = counts(run);
    return `<button class="run ${run.id === selected ? 'selected' : ''}" data-id="${run.id}"><span class="run-head"><span>${escape(run.definition.name)}</span><span class="badge ${run.status}">${run.status}</span></span><small>${escape(new Date(run.startedAt).toLocaleString())} · ${escape(elapsed(run))}</small><small>${c.passed} passed · ${c.failed} failed · ${c.skipped} skipped · ${escape(run.definition.projects.join(', '))}</small></button>`;
  }).join('') : '<p class="empty">No runs match. Execute a run or choose another tag.</p>';
  for (const run of visible) {
    if (run.definition.tags?.length) $('history').querySelector(`[data-id="${run.id}"]`).insertAdjacentHTML('beforeend', `<small class="tags">${tagBadges(run.definition.tags)}</small>`);
  }
  $('execute').disabled = busy || runs.some(r => r.status === 'running');
  const run = runs.find(r => r.id === selected); $('detail').hidden = !run;
  runControls();
  if (!run) return;
  $('detail-title').textContent = run.definition.name;
  if (editingRunTags !== selected) { $('detail-tags').value = (run.definition.tags || []).join(', '); editingRunTags = selected; }
  $('detail-meta').textContent = `${run.status.toUpperCase()} · ${elapsed(run)} total elapsed · ${run.definition.baseURL} · ${run.definition.workers} workers · ${run.definition.retries} retries`;
  $('report').hidden = !run.reportAvailable; $('report').href = `/runs/${run.id}/report/index.html`;
  $('results').innerHTML = run.results.tests.map(t => `<tr><td>${escape(t.title)}</td><td><span class="badge ${t.status}">${escape(t.status)}</span>${t.status === t.expectedStatus && t.status !== 'passed' && t.status !== 'skipped' ? ' (expected)' : ''}</td><td>${duration(t.durationMs)}</td><td>${t.retry + 1}</td></tr>`).join('') || '<tr><td colspan="4">Waiting for test results…</td></tr>';
  const errors = [...(run.results.errors || []), ...run.results.tests.flatMap(t => t.errors), ...(run.launchError ? [run.launchError] : [])];
  $('errors').innerHTML = errors.map(e => `<pre>${escape(e)}</pre>`).join('');
}
function elapsed(run) { return duration(run.status === 'running' ? Date.now() - Date.parse(run.startedAt) : run.durationMs); }
async function refresh() {
  runs = await api('runs'); render();
  if (selected && runs.some(run => run.id === selected)) { const result = await api(`runs/${selected}/log`); $('log').textContent = result.log; }
}
async function loadDefinitions() {
  const selectedId = $('saved').value;
  definitions = await api('definitions');
  $('saved').innerHTML = '<option value="">New definition</option>' + definitions.map(d => `<option value="${d.id}">${escape(d.name)}</option>`).join('');
  $('saved').value = definitions.some(d => d.id === selectedId) ? selectedId : '';
  definitionControls();
}
let managingDefinition = false;
function definitionControls() {
  $('saved').disabled = managingDefinition;
  for (const id of ['rename-definition','delete-definition']) $(id).disabled = managingDefinition || !$('saved').value;
}
$('saved').addEventListener('change', () => { const d = definitions.find(d => d.id === $('saved').value); if (d) apply(d); definitionControls(); });
$('rename-definition').addEventListener('click', async () => {
  const saved = definitions.find(d => d.id === $('saved').value); if (!saved) return;
  const name = window.prompt('New name for this saved definition:', saved.name);
  if (name === null) return;
  if (!name.trim() || name.length > 100) { notice('Enter a definition name (up to 100 characters).'); return; }
  managingDefinition = true; definitionControls();
  try {
    const renamed = await api(`definitions/${saved.id}`, { name }, 'PATCH');
    if ($('name').value === saved.name) $('name').value = renamed.name;
    await loadDefinitions(); notice('Saved definition renamed.');
  } catch(e) { notice(e.message); } finally { managingDefinition = false; definitionControls(); }
});
$('delete-definition').addEventListener('click', async () => {
  const saved = definitions.find(d => d.id === $('saved').value); if (!saved) return;
  if (!window.confirm(`Delete saved definition "${saved.name}"? Previous run results will be kept.`)) return;
  managingDefinition = true; definitionControls();
  try { await api(`definitions/${saved.id}`, undefined, 'DELETE'); await loadDefinitions(); notice('Saved definition deleted.'); }
  catch(e) { notice(e.message); } finally { managingDefinition = false; definitionControls(); }
});
$('history').addEventListener('click', async event => { const button = event.target.closest('[data-id]'); if (button) { selected = button.dataset.id; try { await refresh(); $('detail').scrollIntoView({ block:'nearest' }); } catch(e) { notice(e.message); } } });
$('tag-filter').addEventListener('change', render);
$('rename-run').addEventListener('click', async () => {
  const run = runs.find(r => r.id === selected); if (!run || managingRun) return;
  const name = window.prompt('New name for this test run:', run.definition.name);
  if (name === null) return;
  if (!name.trim() || name.length > 100) { notice('Enter a run name (up to 100 characters).'); return; }
  managingRun = true; runControls();
  try { await api(`runs/${run.id}`, { name }, 'PATCH'); await refresh(); notice('Test run renamed.'); }
  catch(e) { notice(e.message); } finally { managingRun = false; runControls(); }
});
$('delete-run').addEventListener('click', async () => {
  const run = runs.find(r => r.id === selected); if (!run || managingRun || run.status === 'running') return;
  if (!window.confirm(`Delete test run "${run.definition.name}"? Its results, report, logs, screenshots, videos, and traces will be permanently deleted.`)) return;
  managingRun = true; runControls();
  try {
    await api(`runs/${run.id}`, undefined, 'DELETE');
    if (selected === run.id) { selected = undefined; editingRunTags = undefined; $('log').textContent = ''; }
    await refresh(); notice('Test run deleted.');
  } catch(e) { notice(e.message); } finally { managingRun = false; runControls(); }
});
$('run-tags-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = selected;
  if (!id || managingRun) return;
  managingRun = true; runControls();
  try {
    await api(`runs/${id}`, { tags:parseTags($('detail-tags').value) }, 'PATCH');
    editingRunTags = undefined; await refresh(); notice('Run tags saved.');
  } catch(e) { notice(e.message); } finally { managingRun = false; runControls(); }
});
$('save').addEventListener('click', async () => {
  if (!$('run-form').reportValidity()) return;
  $('save').disabled = true;
  try { const saved = await api('definitions', definition()); await loadDefinitions(); $('saved').value = saved.id; definitionControls(); notice('Definition saved.'); } catch(e) { notice(e.message); } finally { $('save').disabled = false; }
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
