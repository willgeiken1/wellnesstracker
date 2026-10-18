// PGlite initializes a WASM PostgreSQL cluster; cold/contended starts exceed Jest's 5s default.
jest.setTimeout(60000);
