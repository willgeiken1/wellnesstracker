// Run both projects serially to bound WASM memory; parallel workers intermittently exceeded Jest teardown grace.
module.exports = { projects: ['<rootDir>/jest.app.config.js', '<rootDir>/jest.server.config.js'], maxWorkers: 1, testTimeout: 30000, watchman: false };
