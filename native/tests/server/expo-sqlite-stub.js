// Drizzle's unused live-query hook imports this module; test SQL uses node:sqlite.
module.exports = { addDatabaseChangeListener() { throw new Error('Native live queries are not used in node tests'); } };
