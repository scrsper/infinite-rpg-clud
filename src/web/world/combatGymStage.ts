import { Color3, DynamicTexture, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { RenderContext } from '../render/engine';
import type { Atmosphere } from './atmosphere';

/** Presentation of the canonical flat stone gym. Labels do not represent interactive objects. */
export function combatGymStage(ctx: RenderContext, atmosphere: Atmosphere) {
  const s = ctx.scene, mat = new StandardMaterial('gym-matte', s);
  mat.diffuseColor = new Color3(.82, .84, .86); mat.specularColor = Color3.Black();
  const floor = MeshBuilder.CreateGround('gym-floor', { width: 64, height: 64 }, s);
  floor.position.set(32, 1.015, 32); floor.material = mat; floor.receiveShadows = true;
  const lines: Vector3[][] = [];
  for (let i = 4; i < 64; i += 4) { lines.push([new Vector3(i, 1.025, 1), new Vector3(i, 1.025, 63)]); lines.push([new Vector3(1, 1.025, i), new Vector3(63, 1.025, i)]); }
  const grid = MeshBuilder.CreateLineSystem('gym-grid', { lines }, s); grid.color = new Color3(.68, .7, .72);
  for (const [text, x, z, width] of [['COMBAT GYM', 32, 45, 18], ['01  MOVE / DODGE', 32, 53, 13], ['02  SINGLE', 20, 19, 8], ['03  MULTIPLE', 42, 19, 9], ['04  PRACTICE DUMMY', 32, 29, 11], ['05  TALK / OBJECTS', 23, 44, 11]] as const) {
    const tex = new DynamicTexture(`label-${text}`, { width: 1024, height: 128 }, s, false);
    tex.uScale = -1; tex.uOffset = 1; tex.hasAlpha = true; tex.drawText(text, null, 90, 'bold 68px sans-serif', '#313942', 'transparent', true);
    const m = new StandardMaterial(`label-${text}`, s); m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; m.specularColor = Color3.Black();
    const label = MeshBuilder.CreateGround(text, { width, height: width / 8 }, s); label.position.set(x, 1.04, z); label.rotation.y = Math.PI; label.material = m; label.isPickable = false;
  }
  atmosphere.setStage(new Color3(.84, .86, .88));
}


