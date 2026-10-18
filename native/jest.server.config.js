module.exports = {
  displayName: 'data-server', moduleNameMapper: { '^expo-sqlite$': '<rootDir>/tests/server/expo-sqlite-stub.js' }, testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/server/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['babel-jest', { presets: [['babel-preset-expo', { jsxRuntime: 'automatic' }]] }] },
  setupFilesAfterEnv: ['<rootDir>/tests/server/setup.ts'],
};
