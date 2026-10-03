import { hash2 } from '../render/noise';
import { MeshBatch, type V, norm, cross, sub } from './meshBatch';

/** Cultivated cereal geometry follows the existing projected crop lifecycle. Each
 * one-metre plot has continuous rows; repeated cards never form a solid white wall. */
export function buildCropGeometry(batch: MeshBatch, state: string, seed: number): void {
  if(state==='fallow') return;
  const mature=state==='mature', harvested=state==='harvested', planted=state==='planted';
  const bottom: V=mature?[.26,.22,.075]:harvested?[.19,.13,.045]:[.11,.22,.055];
  const top: V=mature?[.64,.46,.15]:harvested?[.34,.24,.09]:[.28,.43,.09];
  // Double-sided tapered ribbon, split at its bend to carry a readable silhouette.
  const ribbon=(points:V[],widths:number[],angle:number,color:V):void=>{
    const dx=Math.cos(angle),dz=Math.sin(angle);
    for(let i=0;i<points.length-1;i++) {
      const a=points[i],b=points[i+1],wa=widths[i],wb=widths[i+1];
      const p:V[]=[[a[0]-dx*wa,a[1],a[2]-dz*wa],[a[0]+dx*wa,a[1],a[2]+dz*wa],[b[0]+dx*wb,b[1],b[2]+dz*wb],[b[0]-dx*wb,b[1],b[2]-dz*wb]];
      if(wb===0) {
        const n=norm(cross(sub(p[1],p[0]),sub(p[2],p[0])));
        batch.polygon(p.slice(0,3),n,color,1);
        batch.polygon(p.slice(0,3).reverse(),n.map(v=>-v) as V,color,1);
        continue;
      }
      batch.quad(p[0],p[1],p[2],p[3],[bottom,bottom,color,color],1);
      batch.quad(p[3],p[2],p[1],p[0],[color,color,bottom,bottom],1);
    }
  };
  for(let row=0;row<2;row++) for(let j=0;j<8;j++) {
    const k=hash2(row,j,seed+9),x=(row-.5)*.46+(k-.5)*.07,z=(j+.5)/8-.5+(hash2(j,row,seed)-.5)*.045;
    const height=(mature?.63:harvested?.085:planted?.07:.37)*(0.78+k*.4),angle=hash2(j,row,seed+13)*Math.PI*2;
    const leanX=Math.cos(angle)*height*.11,leanZ=Math.sin(angle)*height*.11;
    ribbon([[x,0,z],[x+leanX*.3,height*.58,z+leanZ*.3],[x+leanX,height,z+leanZ]],[.009,.008,.004],angle,top);
    if(harvested) continue;
    for(const side of [-1,1]) {
      const a=angle+side*1.7, reach=(planted?.055:.13)*(1+k*.5),y=height*(side<0?.24:.46);
      ribbon([[x,y,z],[x+Math.cos(a)*reach*.55,y+height*.24,z+Math.sin(a)*reach*.55],[x+Math.cos(a)*reach,y+height*.17,z+Math.sin(a)*reach]],[.012,.028,0],a+Math.PI/2,top);
    }
    if(mature) {
      const tip:V=[x+leanX,height,z+leanZ];
      for(const a of [angle,angle+Math.PI/2]) ribbon([[tip[0],tip[1]-.07,tip[2]],[tip[0]+leanX*.3,tip[1]+.03,tip[2]+leanZ*.3],[tip[0]+leanX*.45,tip[1]+.095,tip[2]+leanZ*.45]],[.007,.028,0],a,[.78,.59,.23]);
    }
  }
}
