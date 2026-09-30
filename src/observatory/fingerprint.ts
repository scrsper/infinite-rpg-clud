import { createHash } from 'node:crypto';
import type { World } from '../sim/core/world';
import { serialize } from '../sim/persist/save';

/** Compare every persisted canonical field and scheduler field. Only the save envelope's
 * wall-clock timestamp is excluded. Object property order is not world state; array order is. */
export function canonicalSave(w: World): unknown {
  const data = JSON.parse(serialize(w)); delete data.savedAt;
  const stable = (value: any): any => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return stable(data);
}
export function canonicalDigest(w: World): string { return createHash('sha256').update(JSON.stringify(canonicalSave(w))).digest('hex'); }
