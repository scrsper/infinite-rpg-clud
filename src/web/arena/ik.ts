import { Quaternion, Vector3, type TransformNode } from '@babylonjs/core';

/**
 * Analytic two-bone IK, applied after animation: bends shoulder and elbow so the hand reaches a
 * world target, keeping the elbow in the plane the animation chose. `weight` blends from the
 * animated pose (0) to the solved pose (1).
 */
const fromTo = (a: Vector3, b: Vector3): Quaternion => {
  const u = a.normalizeToNew(), v = b.normalizeToNew(), d = Vector3.Dot(u, v);
  if (d > .99999) return Quaternion.Identity();
  const ax = Vector3.Cross(u, v); if (ax.lengthSquared() < 1e-10) return Quaternion.Identity();
  return Quaternion.RotationAxis(ax.normalize(), Math.acos(Math.max(-1, Math.min(1, d))));
};
function rotateWorld(n: TransformNode, q: Quaternion): void {
  const parent = n.parent as TransformNode | null;
  const pw = parent ? parent.absoluteRotationQuaternion : Quaternion.Identity();
  const world = q.multiply(n.absoluteRotationQuaternion);
  n.rotationQuaternion = Quaternion.Inverse(pw).multiply(world).normalize();
  n.computeWorldMatrix(true);
}

export function reach(upper: TransformNode, lower: TransformNode, hand: TransformNode, target: Vector3, weight: number): void {
  if (weight <= 0) return;
  upper.computeWorldMatrix(true); lower.computeWorldMatrix(true); hand.computeWorldMatrix(true);
  const a = upper.getAbsolutePosition().clone(), b = lower.getAbsolutePosition().clone(), c = hand.getAbsolutePosition().clone();
  const goal = Vector3.Lerp(c, target, weight);
  const l1 = Vector3.Distance(a, b), l2 = Vector3.Distance(b, c);
  const at = goal.subtract(a); const d = Math.min(Math.max(at.length(), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const dir = at.normalize();
  // Elbow plane from the animated pose.
  let pole = b.subtract(a); pole = pole.subtract(dir.scale(Vector3.Dot(pole, dir)));
  if (pole.lengthSquared() < 1e-8) pole = Vector3.Down();
  pole.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const elbow = a.add(dir.scale(cosA * l1)).add(pole.scale(sinA * l1));
  rotateWorld(upper, fromTo(b.subtract(a), elbow.subtract(a)));
  lower.computeWorldMatrix(true); hand.computeWorldMatrix(true);
  const b2 = lower.getAbsolutePosition().clone(), c2 = hand.getAbsolutePosition().clone();
  rotateWorld(lower, fromTo(c2.subtract(b2), a.add(dir.scale(d)).subtract(b2)));
  hand.computeWorldMatrix(true);
}
