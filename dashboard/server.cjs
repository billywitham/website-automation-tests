const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ quiet: true });
const root = path.resolve(__dirname, '..');
const data = path.resolve(process.env.DASHBOARD_DATA_DIR || path.join(root, '.dashboard'));
const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
fs.mkdirSync(path.join(data, 'runs'), { recursive: true });
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const write = (file, value) => { fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2)); fs.renameSync(file + '.tmp', file); };
let active;
function files(dir = path.join(root, 'tests')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : /\.spec\.[cm]?[jt]s$/.test(entry.name)
      ? [path.relative(root, path.join(dir, entry.name)).replaceAll('\\', '/')] : []);
}
function discover() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'test', '--list', '--reporter=json'], { cwd: root, windowsHide: true });
    let output = '', errors = '';
    child.stdout.on('data', chunk => output += chunk);
    child.stderr.on('data', chunk => errors += chunk);
    child.on('error', reject);
    child.on('close', code => { try {
      if (code) throw new Error(errors || output);
      const report = JSON.parse(output);
      resolve({ files: files(), projects: report.config.projects.map(p => p.name), baseURL: process.env.BASE_URL || 'https://pademo.publicaccessnow.com' });
    } catch (error) { reject(error); } });
  });
}
function validateTags(tags = []) {
  if (!Array.isArray(tags) || tags.length > 20 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 100)) throw new Error('Enter up to 20 non-empty tags, each up to 100 characters.');
  return [...new Set(tags.map(tag => tag.trim()))];
}
function validate(value, catalog) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100) throw new Error('Enter a run name (up to 100 characters).');
  if (!Array.isArray(value.files) || !value.files.length || value.files.some(f => !catalog.files.includes(f))) throw new Error('Select valid test files.');
  if (!Array.isArray(value.projects) || !value.projects.length || value.projects.some(p => !catalog.projects.includes(p))) throw new Error('Select valid browser projects.');
  const url = new URL(value.baseURL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP or HTTPS target URL without credentials.');
  if (typeof value.grep !== 'string' || value.grep.length > 200) throw new Error('Test filter must be at most 200 characters.');
  new RegExp(value.grep);
  if (!Number.isInteger(value.workers) || value.workers < 1 || value.workers > 16) throw new Error('Workers must be between 1 and 16.');
  if (!Number.isInteger(value.retries) || value.retries < 0 || value.retries > 3) throw new Error('Retries must be between 0 and 3.');
  return { name: value.name.trim(), tags: validateTags(value.tags), files: value.files, projects: value.projects, baseURL: url.href, grep: value.grep, workers: value.workers, retries: value.retries };
}
function runDir(id) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid run ID.'); return path.join(data, 'runs', id); }
function getRun(id) {
  const dir = runDir(id), run = read(path.join(dir, 'run.json'), null);
  if (!run) return null;
  const results = read(path.join(dir, 'results.json'), { tests: [], errors: [] });
  return { ...run, results, reportAvailable: fs.existsSync(path.join(dir, 'report', 'index.html')) };
}
async function start(definition) {
  if (active) throw new Error('A run is already executing. Wait for it to finish.');
  const id = randomUUID(), dir = runDir(id);
  fs.mkdirSync(dir);
  const run = { id, definition, status: 'running', startedAt: new Date().toISOString(), durationMs: 0 };
  write(path.join(dir, 'run.json'), run);
  const args = [cli, 'test', ...definition.files.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), ...definition.projects.map(p => `--project=${p}`),
    `--workers=${definition.workers}`, `--retries=${definition.retries}`, '--reporter=list,./dashboard/reporter.cjs,html', `--output=${path.join(dir, 'artifacts')}`];
  if (definition.grep) args.push('--grep', definition.grep);
  const started = performance.now();
  const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, env: { ...process.env,
    BASE_URL: definition.baseURL, DASHBOARD_RESULTS: path.join(dir, 'results.json'), PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(dir, 'report'), PLAYWRIGHT_HTML_OPEN: 'never', FORCE_COLOR: '0' } });
  active = id;
  const log = fs.createWriteStream(path.join(dir, 'output.log'));
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  let launchError;
  child.on('error', error => { launchError = error.message; log.write(error.message); });
  child.on('close', code => {
    log.end();
    run.definition = read(path.join(dir, 'run.json'), run).definition;
    const results = read(path.join(dir, 'results.json'), {});
    Object.assign(run, { status: code === 0 && results.status === 'passed' ? 'passed' : 'failed', endedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), exitCode: code, launchError });
    write(path.join(dir, 'run.json'), run); active = undefined;
  });
  return run;
}
// Interrupted runs remain visible after a server restart.
for (const id of fs.readdirSync(path.join(data, 'runs'))) {
  const file = path.join(data, 'runs', id, 'run.json'), run = read(file, null);
  if (run?.status === 'running') write(file, { ...run, status: 'interrupted', endedAt: new Date().toISOString(), durationMs: null });
}
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webm': 'video/webm', '.zip': 'application/zip', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  try {
    // Local-only dashboard. Reject cross-origin writes and DNS rebinding.
    const host = new URL(`http://${req.headers.host}`).hostname;
    if (!['127.0.0.1', 'localhost'].includes(host)) return send(403, { error: 'Local access only.' });
    if (req.method !== 'GET' && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'Same-origin requests required.' });
    const url = new URL(req.url, `http://${req.headers.host}`), route = url.pathname;
    if (req.method === 'GET' && route === '/api/catalog') return send(200, await discover());
    if (req.method === 'GET' && route === '/api/definitions') return send(200, read(path.join(data, 'definitions.json'), []));
    const definitionMatch = route.match(/^\/api\/definitions\/([a-f0-9-]{36})$/);
    if (definitionMatch && ['PATCH', 'DELETE'].includes(req.method)) {
      let name;
      if (req.method === 'PATCH') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 16000) return send(413, { error: 'Request too large.' }); }
        name = JSON.parse(body)?.name;
        if (typeof name !== 'string' || !name.trim() || name.length > 100) return send(400, { error: 'Enter a definition name (up to 100 characters).' });
      }
      const file = path.join(data, 'definitions.json');
      const saved = read(file, []);
      const index = saved.findIndex(d => d.id === definitionMatch[1]);
      if (index === -1) return send(404, { error: 'Saved definition not found.' });
      if (req.method === 'DELETE') {
        saved.splice(index, 1); write(file, saved); return send(200, { deleted: true });
      }
      saved[index].name = name.trim(); write(file, saved); return send(200, saved[index]);
    }
    if (req.method === 'GET' && route === '/api/runs') return send(200, fs.readdirSync(path.join(data, 'runs')).map(getRun).filter(Boolean).sort((a,b) => b.startedAt.localeCompare(a.startedAt)));
    const match = route.match(/^\/api\/runs\/([a-f0-9-]+)(\/log)?$/);
    if (req.method === 'DELETE' && match && !match[2]) {
      const run = getRun(match[1]);
      if (!run) return send(404, { error: 'Run not found.' });
      if (active === run.id || run.status === 'running') return send(409, { error: 'Wait for this run to finish before deleting it.' });
      const dir = path.resolve(runDir(match[1]));
      const runsRoot = path.resolve(data, 'runs');
      if (path.dirname(dir) !== runsRoot || fs.lstatSync(dir).isSymbolicLink()) throw new Error('Invalid run directory.');
      fs.rmSync(dir, { recursive: true, force: true });
      return send(200, { deleted: true });
    }
    if (req.method === 'PATCH' && match && !match[2]) {
      const run = getRun(match[1]);
      if (!run) return send(404, { error: 'Run not found.' });
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 16000) return send(413, { error: 'Request too large.' }); }
      const value = JSON.parse(body);
      if (!value || (value.tags === undefined && value.name === undefined)) throw new Error('Provide a name or tags for this run.');
      if (value.name !== undefined && (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100)) throw new Error('Enter a run name (up to 100 characters).');
      const tags = value.tags === undefined ? undefined : validateTags(value.tags);
      // Read again after receiving the body so a finishing run keeps its final status.
      const file = path.join(runDir(match[1]), 'run.json'), current = read(file, null);
      if (!current) return send(404, { error: 'Run not found.' });
      if (tags !== undefined) current.definition.tags = tags;
      if (value.name !== undefined) current.definition.name = value.name.trim();
      write(file, current); return send(200, getRun(match[1]));
    }
    if (req.method === 'GET' && match) {
      const run = getRun(match[1]);
      if (!run) return send(404, { error: 'Run not found.' });
      return send(200, match[2] ? { log: fs.existsSync(path.join(runDir(match[1]), 'output.log')) ? fs.readFileSync(path.join(runDir(match[1]), 'output.log'), 'utf8').slice(-100000) : '' } : run);
    }
    if (req.method === 'POST' && ['/api/definitions', '/api/runs'].includes(route)) {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 16000) return send(413, { error: 'Request too large.' }); }
      const definition = validate(JSON.parse(body), await discover());
      if (route === '/api/runs') return send(201, await start(definition));
      const saved = read(path.join(data, 'definitions.json'), []);
      const entry = { ...definition, id: randomUUID() }; saved.push(entry);
      write(path.join(data, 'definitions.json'), saved); return send(201, entry);
    }
    if (req.method !== 'GET') return send(405, { error: 'Method not allowed.' });
    let file;
    const artifact = route.match(/^\/runs\/([a-f0-9-]{36})\/(.+)$/);
    if (artifact) {
      const dir = runDir(artifact[1]); file = path.resolve(dir, decodeURIComponent(artifact[2]));
      if (!file.startsWith(dir + path.sep) || !/^(report|artifacts)[\\/]/.test(path.relative(dir, file))) return send(403, { error: 'Access denied.' });
    } else if (['/', '/app.js', '/style.css'].includes(route)) file = path.join(__dirname, 'public', route === '/' ? 'index.html' : route.slice(1));
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(404, { error: 'Not found.' });
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); fs.createReadStream(file).pipe(res);
  } catch (error) { send(400, { error: error.message }); }
});
if (require.main === module) server.listen(Number(process.env.DASHBOARD_PORT || 3100), '127.0.0.1', () => console.log(`Test dashboard: http://127.0.0.1:${server.address().port}`));
module.exports = { server, validate };
