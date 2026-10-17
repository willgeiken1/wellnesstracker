module.exports = {
  preset: 'jest-expo',
  watchman: false,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
};
