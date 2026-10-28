// Standalone synthetic worker: production repository + queue, no Jest memory.
const fs = require("node:fs");
const Module = require("node:module");
const babel = require("@babel/core");
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "expo-sqlite") return require("./expo-sqlite-stub.js");
  return originalLoad.call(this, name, ...args);
};
require.extensions[".ts"] = (module, filename) => {
  const result = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: ["@babel/preset-typescript"],
    plugins: ["@babel/plugin-transform-modules-commonjs"],
  });
  module._compile(result.code, filename);
};
(async () => {
  const { localDatabase } = require("./sqlite.ts");
  const {
    FoodAiService,
    setConsent,
  } = require("../../src/features/food/ai/service.ts");
  const { repo } = await localDatabase(process.argv[2]);
  setConsent(repo, true);
  new FoodAiService(repo).enqueue(
    { jpeg: "YWJj", thumbnail: "dGh1bWI=" },
    "2026-10-27",
    "fd000000-0000-4000-8000-000000000000",
  );
  // Simulate OS kill immediately after SQLite commit; no graceful close.
  process.kill(process.pid, "SIGKILL");
})().catch(() => {
  process.exitCode = 1;
});
