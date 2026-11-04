import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const forbidden = ['createMockPurchaseProvider', 'DEFAULT_MOCK_PRICING'];

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesIn(full) : [full];
  });
}

test('release export bundle omits the mock purchase provider', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'plus-release-'));
  try {
    execFileSync('npx', ['expo', 'export', '--platform', 'ios', '--output-dir', out, '--max-workers', '2'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production', EXPO_NO_TELEMETRY: '1', CI: '1' },
      stdio: 'pipe',
      timeout: 240000,
    });
    const bundles = filesIn(out).filter(file => /\.(hbc|jsbundle|js)$/.test(file) && !file.endsWith('.map'));
    expect(bundles.length).toBeGreaterThan(0);
    const hits = bundles.flatMap(file => {
      const text = readFileSync(file).toString('utf8');
      return forbidden.filter(needle => text.includes(needle)).map(needle => `${path.relative(out, file)} contains ${needle}`);
    });
    expect(hits).toEqual([]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}, 300000);
