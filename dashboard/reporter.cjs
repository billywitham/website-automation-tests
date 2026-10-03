const fs = require('node:fs');
class DashboardReporter {
  constructor() { this.tests = []; this.errors = []; }
  write(status) {
    const file = process.env.DASHBOARD_RESULTS;
    if (file) {
      fs.writeFileSync(file + '.tmp', JSON.stringify({ status, tests: this.tests, errors: this.errors }));
      fs.renameSync(file + '.tmp', file);
    }
  }
  onBegin() { this.write('running'); }
  onTestEnd(test, result) {
    this.tests.push({ id: test.id, title: test.titlePath().slice(1).join(' › '),
      project: test.parent.project()?.name, expectedStatus: test.expectedStatus,
      status: result.status, durationMs: result.duration, retry: result.retry,
      errors: result.errors.map(error => error.message || String(error)),
      attachments: result.attachments.filter(a => a.path).map(a => ({ name: a.name, path: a.path })) });
    this.write('running');
  }
  onError(error) { this.errors.push(error.message || String(error)); this.write('running'); }
  onEnd(result) { this.write(result.status); }
}
module.exports = DashboardReporter;
