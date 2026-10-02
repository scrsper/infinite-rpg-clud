import { describe, expect, it } from 'vitest';
import { MeshBatch, cross, sub, type V } from '../src/web/world/meshBatch';
import { buildCropGeometry } from '../src/web/world/cropGeometry';
import { buildRoofIdentity } from '../src/web/world/roofIdentity';
import { architectureGrammar } from '../src/web/world/architecturalGrammar';
import { PropBuilder } from '../src/web/world/propGeometry';
import type { PlaceProjection } from '../src/web/net/messages';

function soundTriangles(b:MeshBatch):void {
  expect(b.positions.every(Number.isFinite)).toBe(true);
  for(let i=0;i<b.indices.length;i+=3){
    const [a,c,d]=b.indices.slice(i,i+3).map(v=>b.positions.slice(v*3,v*3+3) as V);
    const n=cross(sub(c,a),sub(d,a)), at=b.indices[i]*3;
    expect(Math.hypot(...n)).toBeGreaterThan(1e-9);
    expect(n.reduce((s,v,j)=>s+v*b.normals[at+j],0)).toBeGreaterThan(0);
  }
}
describe('authored presentation geometry',()=>{
  it('retains a crop lifecycle with bare fallow, short stubble and taller mature ears',()=>{
    const height=(state:string)=>{const b=new MeshBatch();buildCropGeometry(b,state,17);if(!b.empty)soundTriangles(b);return Math.max(0,...b.positions.filter((_,i)=>i%3===1));};
    expect(height('fallow')).toBe(0);
    expect(height('harvested')).toBeLessThan(.11);
    expect(height('planted')).toBeLessThan(height('growing'));
    expect(height('growing')).toBeLessThan(height('mature'));
    const a=new MeshBatch(),b=new MeshBatch();buildCropGeometry(a,'mature',23);buildCropGeometry(b,'mature',23);expect(a.positions).toEqual(b.positions);
  });
  it.each(['house','tavern','mill','chapel'])('builds finite outward roof details for %s in either orientation',type=>{
    for(const alongX of [false,true]) {
      const p:PlaceProjection={id:type,type,family:'dwelling',bounds:{x0:1,x1:15,z0:1,z1:12,y0:0,y1:13},door:{x:8,y:0,z:13},inside:{x:8,y:0,z:8},indoor:true,visualSeed:9,wallHeight:5};
      const before=JSON.stringify(p),b=new MeshBatch();
      buildRoofIdentity(()=>b,{tilesPerMetre:()=>1} as any,p,architectureGrammar(p,null),{a0:0,a1:14,b0:0,b1:17,alongX,material:'roofTile',top:a=>6+Math.min(a,14-a),point:(a,c,y)=>alongX?[c,y,a]:[a,y,c]});
      soundTriangles(b);expect(JSON.stringify(p)).toBe(before);
    }
  });
  it('beveled furniture stays inside its original footprint with outward faces',()=>{
    const b=new MeshBatch();new PropBuilder(b).bevelBox(-1,0,-.5,2,.1,1,[1,1,1]);soundTriangles(b);
    for(let i=0;i<b.positions.length;i+=3){expect(Math.abs(b.positions[i])).toBeLessThanOrEqual(1);expect(b.positions[i+1]).toBeGreaterThanOrEqual(0);expect(b.positions[i+1]).toBeLessThanOrEqual(.1);expect(Math.abs(b.positions[i+2])).toBeLessThanOrEqual(.5);}
  });
});
