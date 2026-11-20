const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

// Swap Sentry's plugin for a recorder so the test sees exactly what the wrapper passes on.
const sentryPath = require.resolve('@sentry/react-native/expo');
const calls = [];
require.cache[sentryPath] = { id: sentryPath, filename: sentryPath, loaded: true,
  exports: { withSentry: (config, props) => { calls.push(props); return config; } } };
const withSentryUploads = require(path.join(__dirname, 'withSentryUploads.js'));
const props = { url: 'https://sentry.io/', organization: 'insight-0j', project: 'insight-app' };

function run(token) {
  const before = process.env.SENTRY_AUTH_TOKEN;
  if (token === undefined) delete process.env.SENTRY_AUTH_TOKEN; else process.env.SENTRY_AUTH_TOKEN = token;
  try { calls.length = 0; withSentryUploads({ name: 'fixture' }, props); return calls[0]; }
  finally { if (before === undefined) delete process.env.SENTRY_AUTH_TOKEN; else process.env.SENTRY_AUTH_TOKEN = before; }
}

test('a build without SENTRY_AUTH_TOKEN skips the Sentry upload', () => {
  assert.deepEqual(run(undefined), { ...props, disableAutoUpload: true });
  assert.deepEqual(run(''), { ...props, disableAutoUpload: true });
});

test('a build with SENTRY_AUTH_TOKEN uploads, and the token never reaches the plugin props', () => {
  const passed = run('synthetic-token');
  assert.deepEqual(passed, { ...props, disableAutoUpload: false });
  assert.ok(!JSON.stringify(passed).includes('synthetic-token'));
});

test('app.json uses the wrapper, never Sentry\'s plugin directly', () => {
  const plugins = require('../app.json').expo.plugins.map(p => (Array.isArray(p) ? p[0] : p));
  assert.ok(plugins.includes('./plugins/withSentryUploads'));
  assert.ok(!plugins.includes('@sentry/react-native/expo'));
});
