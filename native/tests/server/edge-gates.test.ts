import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
// Execute the actual Deno entrypoints under a mocked host, without HTTP clients.
test('purge-range and delete-account edge gates (Node test runner)', () => {
  const output = execFileSync(process.execPath, ['--test', 'native/tests/server/row-sync-edge-gates.node.mjs'], {
    cwd: join(__dirname,'../../..'), encoding: 'utf8',
  });
  expect(output).toContain('fail 0');
});
