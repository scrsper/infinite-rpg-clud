/**
 * Slow-work recorder. Anything on the main thread that runs longer than a few milliseconds is noted
 * with a label and a timestamp, so a frame hitch can be traced to what caused it (a large message, a
 * region-build stage, a first-use shader) rather than guessed at. Read through `window.__tv.slowEvents`.
 */
export interface SlowEvent { label: string; ms: number; at: number }
const events: SlowEvent[] = [];
export const slowEvents = (): SlowEvent[] => events;
export function noteSlow(label: string, ms: number, thresholdMs = 8): void {
  if (ms < thresholdMs) return;
  events.push({ label, ms: +ms.toFixed(1), at: +performance.now().toFixed(0) });
  if (events.length > 400) events.shift();
}
export function timed<T>(label: string, fn: () => T, thresholdMs = 8): T {
  const t = performance.now();
  try { return fn(); } finally { noteSlow(label, performance.now() - t, thresholdMs); }
}
