import assert from 'node:assert/strict';

/** Node 24 reports its built-in SQLite status on stderr; never suppress production diagnostics. */
export function assertNativeDiagnostics(stderr) {
  assert.match(stderr, /^(?:\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n(?:\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\n)?)?$/);
}
