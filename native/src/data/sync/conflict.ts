/** Only the server's dedicated immutable-provenance SQLSTATE maps to this error. */
export class ProvenanceConflict extends Error {
  constructor() { super('Sync provenance conflict.'); }
}
