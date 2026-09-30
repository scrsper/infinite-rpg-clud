import { createHash } from 'node:crypto';
import type { World } from '../sim/core/world';
import { serialize } from '../sim/persist/save';

/** Content fingerprint of persisted canonical and scheduler fields, excluding savedAt.
 * Object keys are sorted here; array order is retained. Exact continuation verification
 * additionally checks raw property enumeration order in scripts/observatory/compare-saves.mjs. */
export function canonicalSave(w: World): unknown {
  const data = JSON.parse(serialize(w)); delete data.savedAt;
  const stable = (value: any): any => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return stable(data);
}
export function canonicalDigest(w: World): string { return createHash('sha256').update(JSON.stringify(canonicalSave(w))).digest('hex'); }
