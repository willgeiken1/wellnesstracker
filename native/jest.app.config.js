module.exports = {
  displayName: 'app',
  preset: 'jest-expo',
  // Match Metro: stale method-derived values must also fail in component tests.
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'], plugins: [['babel-plugin-react-compiler', { sources: filename => filename.includes('/src/') }]] }] },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/*.test.ts?(x)'],
};
