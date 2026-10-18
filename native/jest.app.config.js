module.exports = {
  displayName: 'app',
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/*.test.ts?(x)'],
};
