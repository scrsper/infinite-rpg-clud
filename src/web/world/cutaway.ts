import type { Vec3, PlaceProjection } from '../net/messages';
/** Presentation-only ray/box test. Visibility never changes physical walls or admission. */
export function needsCutaway(b: PlaceProjection['bounds'], player: Vec3, camera: Vec3): boolean {
  if (player.x >= b.x0 && player.x <= b.x1 + 1 && player.z >= b.z0 && player.z <= b.z1 + 1 && player.y >= b.y0 - 1 && player.y <= b.y1) return true;
  let lo = 0, hi = 1;
  const end = { x: player.x, y: player.y + 1.2, z: player.z };
  for (const [axis, min, max] of [['x', b.x0 - 1, b.x1 + 2], ['y', b.y0, b.y1 + 2], ['z', b.z0 - 1, b.z1 + 2]] as const) {
    const delta = end[axis] - camera[axis];
    if (Math.abs(delta) < 1e-8) { if (camera[axis] < min || camera[axis] > max) return false; continue; }
    const a = (min - camera[axis]) / delta, c = (max - camera[axis]) / delta;
    lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c));
    if (lo > hi) return false;
  }
  return hi > 0 && lo < .98;
}
