// Client-only id helpers (tab ids, KeyValue row ids). These are NEVER persisted
// as entity primary keys — server UUIDs own that.
import { nanoid } from 'nanoid';

export function uuid(): string {
  return nanoid();
}

export function rowId(): string {
  return nanoid(10);
}
