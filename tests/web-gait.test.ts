import { describe, expect, it } from 'vitest';
import { armSwing, bodySway, legPose } from '../src/web/actors/gait';

const DEG = Math.PI / 180;

describe('web gait curves', () => {
  it('are continuous across the cycle seam', () => {
    for (const run of [0, 0.5, 1]) {
      const a = legPose(0.9999, run, 1), b = legPose(0, run, 1);
      for (const k of ['hip', 'knee', 'foot', 'ball'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.02);
    }
  });

  it('walk bends the knee most in swing and keeps it nearly straight at mid-stance', () => {
    const swing = legPose(0.73, 0, 1).knee, midStance = legPose(0.4, 0, 1).knee;
    expect(swing).toBeGreaterThan(50 * DEG);
    expect(midStance).toBeLessThan(10 * DEG);
  });

  it('a run bends the swing knee further than a walk', () => {
    expect(legPose(0.68, 1, 1).knee).toBeGreaterThan(legPose(0.73, 0, 1).knee);
  });

  it('a slow step narrows the range of motion', () => {
    expect(Math.abs(legPose(0, 0, 0.2).hip)).toBeLessThan(Math.abs(legPose(0, 0, 1).hip));
  });

  it('the pelvis is low at heel strike and high at mid-stance when walking', () => {
    expect(bodySway(0, 0, 1).y).toBeLessThan(bodySway(0.25, 0, 1).y);
  });

  it('each arm swings forward while its own leg swings back', () => {
    expect(armSwing(0.5, 0, 1).shoulder).toBeGreaterThan(armSwing(0, 0, 1).shoulder);
  });
});
