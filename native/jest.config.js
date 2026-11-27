// Two workers, each recycled once it holds 1 GB: one in-band process kept every suite's heap and ran out of memory on CI.
module.exports = { projects: ['<rootDir>/jest.app.config.js', '<rootDir>/jest.server.config.js'], maxWorkers: 2, workerIdleMemoryLimit: '1GB', testTimeout: 30000, watchman: false };
