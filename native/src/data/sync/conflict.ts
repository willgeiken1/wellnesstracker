/** Only the server's dedicated immutable-provenance SQLSTATE maps to this error. */
export class ProvenanceConflict extends Error {
  constructor() { super('Sync provenance conflict.'); }
}
/** A sync failure that waiting for a connection will not fix: the server refused the request as malformed or
 * not allowed, or a reply or local write failed its checks. Anything else is treated as being offline. */
export class SyncAttention extends Error {
  constructor() { super('Sync needs attention.'); this.name = 'SyncAttention'; }
}
