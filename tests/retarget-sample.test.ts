import { describe, it, expect } from 'vitest';
import { Animation, AnimationKeyInterpolation, Quaternion, Vector3 } from '@babylonjs/core';
import { sampleSource } from '../src/web/arena/retarget';

const fist = Quaternion.RotationAxis(Vector3.Right(), 1.2);
describe('retarget source sampling', () => {
  it('holds STEP-keyed constant channels (the packed sword-hand fists) across the whole clip', () => {
    // As the packer exported them: three STEP keys, all the closed value.
    const a = new Animation('finger', 'rotationQuaternion', 30, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([0, 2, 214].map(frame => ({ frame, value: fist.clone(), interpolation: AnimationKeyInterpolation.STEP })));
    for (const f of [0, 1, 2, 50, 107, 213.5, 214]) {
      const q = sampleSource(a, f) as Quaternion;
      expect(Math.abs(Quaternion.Dot(q, fist))).toBeGreaterThan(.99999);
    }
  });
  it('holds the latest STEP key, not a blend, when the values differ', () => {
    const a = new Animation('s', 'rotationQuaternion', 30, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE), b = Quaternion.Identity();
    a.setKeys([{ frame: 0, value: fist.clone(), interpolation: AnimationKeyInterpolation.STEP }, { frame: 10, value: b.clone(), interpolation: AnimationKeyInterpolation.STEP }]);
    expect(Math.abs(Quaternion.Dot(sampleSource(a, 9.9) as Quaternion, fist))).toBeGreaterThan(.99999);
    expect(Math.abs(Quaternion.Dot(sampleSource(a, 10) as Quaternion, b))).toBeGreaterThan(.99999);
  });
  it('leaves ordinary interpolated tracks to Babylon', () => {
    const a = new Animation('l', 'rotationQuaternion', 30, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([{ frame: 0, value: Quaternion.Identity() }, { frame: 10, value: fist.clone() }]);
    expect(Math.abs(Quaternion.Dot(sampleSource(a, 5) as Quaternion, a.evaluate(5) as Quaternion))).toBeGreaterThan(.99999);
  });
});
