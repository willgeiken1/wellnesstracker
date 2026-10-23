import path from 'node:path';
jest.mock('expo/metro-config', () => ({ getDefaultConfig: () => ({ resolver: {} }) }));
const root = path.resolve(__dirname, '..');
function load(variant?: string) {
  const before = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant; else delete process.env.APP_VARIANT;
  let result: any;
  try { jest.isolateModules(() => { result = require('../metro.config.js'); }); }
  finally { if (before === undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT = before; }
  return result;
}
test('default Metro resolution remains unchanged', () => {
  expect(load().resolver.resolveRequest).toBeUndefined();
});
test('freeiphone substitutes provider and screens across import styles, blocks backend modules', () => {
  const config = load('freeiphone');
  for (const file of ['provider.tsx', 'screens.tsx']) {
    const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: path.join(root, 'src/auth', file) }) };
    expect(config.resolver.resolveRequest(context, '@/auth/provider', 'ios').filePath).toBe(path.join(root, 'src/phone-only', file));
  }
  for (const file of ['src/auth/client.ts', 'src/auth/config.ts', 'src/data/sync/supabase.ts', 'node_modules/@supabase/supabase-js/index.js']) {
    const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: path.join(root, file) }) };
    expect(() => config.resolver.resolveRequest(context, file.includes('node_modules') ? '@supabase/supabase-js' : './backend', 'ios')).toThrow('Backend modules are unavailable');
  }
});
