import type { PlaceProjection } from '../net/messages';
import type { MatName } from '../render/materials';
import type { Cells } from './structures';
import { B } from '../../sim/physical/blocks';

export type ArchitectureKind = 'cottage' | 'townhouse' | 'tavern' | 'shop' | 'civic' | 'workshop';
export interface ArchitectureProfile {
  kind: ArchitectureKind;
  bay: number;
  eave: number;
  entry: boolean;
  edge: 'rolled-thatch' | 'deep-eave' | 'pediment' | 'plain';
}

/** Derive a presentation grammar from observer-visible place identity, size and cells. */
export function architectureGrammar(place: PlaceProjection, cells: Cells | null): ArchitectureProfile {
  const w = place.bounds.x1 - place.bounds.x0 + 1, d = place.bounds.z1 - place.bounds.z0 + 1, area = w * d;
  const type = place.type.toLowerCase(), family = place.family.toLowerCase();
  const kind: ArchitectureKind = type === 'tavern' ? 'tavern' : type === 'chapel' || family === 'community' ? 'civic' : type === 'bakery' || type === 'store' ? 'shop' : type === 'mill' || type === 'sawpit' || family === 'workshop' || family === 'production' ? 'workshop' : area >= 150 || family === 'shop' ? 'townhouse' : 'cottage';
  let roof: MatName = 'roofSlate';
  if (cells) for (let y = place.bounds.y0; y <= place.bounds.y1 + 8; y++) for (let x = place.bounds.x0 - 1; x <= place.bounds.x1 + 1; x++) for (let z = place.bounds.z0 - 1; z <= place.bounds.z1 + 1; z++) {
    const b = cells.get(x, y, z); if (b === B.Thatch) roof = 'thatch'; else if (b === B.RoofTile) roof = 'roofTile';
  }
  const edge = roof === 'thatch' ? 'rolled-thatch' : kind === 'tavern' ? 'pediment' : kind === 'workshop' ? 'deep-eave' : 'plain';
  return { kind, bay: kind === 'cottage' ? 3 : kind === 'townhouse' || kind === 'tavern' ? 4 : 3, eave: edge === 'rolled-thatch' ? 0.26 : kind === 'civic' ? 0.22 : kind === 'workshop' ? 0.2 : 0.12, entry: kind !== 'cottage' || !!place.door, edge };
}
