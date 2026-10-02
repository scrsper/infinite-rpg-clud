import type { ArchitectureProfile } from './architecturalGrammar';
import type { MaterialLibrary, MatName } from '../render/materials';
import type { PlaceProjection } from '../net/messages';
import { MeshBatch, type V, cross, sub, norm } from './meshBatch';

export interface RoofFrame {
  a0: number; a1: number; b0: number; b1: number; alongX: boolean;
  top: (a: number) => number;
  point: (a: number, b: number, y: number) => V;
  material: MatName;
}

/** Solid exterior roof carpentry, never new rooms, windows, inventory or collision.
 * The fitted canonical roof stays underneath. All geometry uses its owner's batches
 * so roof cutaway and region disposal apply without another presentation registry. */
export function buildRoofIdentity(batch: (m: MatName) => MeshBatch, mats: MaterialLibrary, place: PlaceProjection, profile: ArchitectureProfile, f: RoofFrame): void {
  const {a0,a1,b0,b1,top,point:P}=f, ac=(a0+a1)/2, wood=batch('darkwood'), wt=mats.tilesPerMetre('darkwood');
  const timber:V=[.72,.62,.48], plaster:V=[.87,.82,.7];
  const face=(mesh:MeshBatch,points:V[],normal:V,tint:V,tpm:number)=>{
    if (cross(sub(points[1],points[0]),sub(points[2],points[0])).reduce((s,v,i)=>s+v*normal[i],0)<0) points.reverse();
    mesh.polygon(points,normal,tint,tpm);
  };
  const beam=(start:V,end:V,width:number,depth=width)=>{
    const dir=norm(sub(end,start)), side=norm(cross(dir,Math.abs(dir[1])>.98?[1,0,0]:[0,1,0])), up=norm(cross(side,dir));
    const q=(p:V,s:number,u:number):V=>p.map((v,i)=>v+side[i]*s*width/2+up[i]*u*depth/2) as V;
    const corners=(p:V)=>[q(p,-1,-1),q(p,1,-1),q(p,1,1),q(p,-1,1)];
    const lo=corners(start),hi=corners(end);
    for(let i=0;i<4;i++) { const j=(i+1)%4,n=norm(cross(sub(lo[j],lo[i]),sub(hi[i],lo[i]))); face(wood,[lo[i],lo[j],hi[j],hi[i]],n,timber,wt); }
    face(wood,lo,dir.map(v=>-v) as V,timber,wt);face(wood,hi,dir,timber,wt);
  };
  // The formerly empty gable triangles now express different structural systems.
  const base=top(a0)-.5, apex=top(ac)-.6;
  for(const b of [b0+.93,b1-.93]) {
    const half=(a1-a0)/2-1.2, collar=base+(apex-base)*.37;
    beam(P(ac-half*.62,b,collar),P(ac+half*.62,b,collar),.15);
    const fan=profile.kind==='civic';
    for(const sign of [-1,1]) {
      beam(P(ac+sign*half*.8,b,base+.12),P(ac,b,apex),fan?.22:.16);
      if(profile.kind==='tavern'||fan) beam(P(ac+sign*half*.45,b,base+.12),P(ac+sign*half*.45,b,top(ac+sign*half*.45)-.52),.14);
    }
  }
  // Thick thatch rolls soften the cottage silhouette without changing the ridge.
  if(profile.edge==='rolled-thatch') {
    const roof=batch(f.material),tpm=mats.tilesPerMetre(f.material),r=.23;
    for(const a of [a0+.09,a1-.09]) for(let i=0;i<10;i++) {
      const t=i*Math.PI/5,u=(i+1)*Math.PI/5;
      const pts=[P(a+Math.cos(t)*r,b0,top(a)-.18+Math.sin(t)*r),P(a+Math.cos(t)*r,b1,top(a)-.18+Math.sin(t)*r),P(a+Math.cos(u)*r,b1,top(a)-.18+Math.sin(u)*r),P(a+Math.cos(u)*r,b0,top(a)-.18+Math.sin(u)*r)];
      const n:V=f.alongX?[0,Math.sin((t+u)/2),Math.cos((t+u)/2)]:[Math.cos((t+u)/2),Math.sin((t+u)/2),0];
      face(roof,pts,n,[.88,.84,.72],tpm);
    }
  }
  // Large public halls get roof ventilation over their real entrance facade.
  // These are opaque louvered caps: no implied accessible upper-floor window.
  if(profile.kind==='tavern'||profile.kind==='townhouse') {
    const doorA=place.door?(f.alongX?place.door.z:place.door.x):ac;
    const sign=doorA>=ac?1:-1, front=ac+sign*((a1-a0)/2-1.55), rear=front-sign*2.7;
    const centers=profile.kind==='tavern'&&b1-b0>12?[(b0+b1)/2-3.2,(b0+b1)/2+3.2]:[(b0+b1)/2];
    const outward:V=f.alongX?[0,0,sign]:[sign,0,0];
    for(const bc of centers) {
      const half=1.2,y=top(front),eave=y+1.35,peak=y+2.8,backY=top(rear)+.08;
      const wall=batch('plaster'),roof=batch(f.material),rt=mats.tilesPerMetre(f.material);
      face(wall,[P(front,bc-half,y),P(front,bc+half,y),P(front,bc+half,eave),P(front,bc,peak),P(front,bc-half,eave)],outward,plaster,mats.tilesPerMetre('plaster'));
      for(const s of [-1,1]) {
        const sideNormal:V=f.alongX?[s,0,0]:[0,0,s];
        face(wall,[P(front,bc+s*half,y),P(rear,bc+s*half,top(rear)),P(rear,bc+s*half,backY),P(front,bc+s*half,eave)],sideNormal,plaster,wt);
        const points=[P(front+sign*.16,bc+s*(half+.16),eave),P(rear,bc+s*(half+.16),backY),P(rear,bc,peak),P(front+sign*.16,bc,peak)];
        let n=norm(cross(sub(points[1],points[0]),sub(points[2],points[0])));if(n[1]<0)n=n.map(v=>-v) as V;
        face(roof,points,n,[.95,.92,.85],rt);
        face(wood,points.map(p=>[p[0],p[1]-.07,p[2]] as V),n.map(v=>-v) as V,timber,wt);
        beam(P(front+sign*.18,bc+s*(half+.17),eave-.05),P(front+sign*.18,bc,peak),.16);
        beam(P(front+sign*.03,bc+s*half,y),P(front+sign*.03,bc+s*half,eave),.15);
      }
      beam(P(front+sign*.03,bc-half,eave),P(front+sign*.03,bc+half,eave),.14);
      const dark=batch('darkwood');
      for(let i=0;i<6;i++) face(dark,[P(front+sign*.05,bc-.53,y+.34+i*.17),P(front+sign*.05,bc+.53,y+.34+i*.17),P(front+sign*.11,bc+.53,y+.44+i*.17),P(front+sign*.11,bc-.53,y+.44+i*.17)],outward,[.45,.38,.28],wt);
    }
  }
  if(profile.kind==='workshop') {
    const y=top(ac),lo=b0+(b1-b0)*.28,hi=b1-(b1-b0)*.28;
    for(const a of [ac-.52,ac+.52]) for(let i=0;i<4;i++) beam(P(a,lo,y+.2+i*.22),P(a,hi,y+.2+i*.22),.13,.16);
    for(const b of [lo,hi]) for(const a of [ac-.52,ac+.52]) beam(P(a,b,y-.02),P(a,b,y+1.02),.15);
    for(const b of [lo,hi]) {
      const n:V=f.alongX?[b===lo?-1:1,0,0]:[0,0,b===lo?-1:1];
      face(wood,[P(ac-.52,b,y),P(ac+.52,b,y),P(ac+.52,b,y+.99),P(ac,b,y+1.58),P(ac-.52,b,y+.99)],n,[.55,.46,.35],wt);
    }
    const roof=batch(f.material),rt=mats.tilesPerMetre(f.material);
    for(const s of [-1,1]) {
      const pts=[P(ac+s*.75,lo-.2,y+.94),P(ac+s*.75,hi+.2,y+.94),P(ac,hi+.2,y+1.65),P(ac,lo-.2,y+1.65)];
      const n:V=f.alongX?[0,1,s]:[s,1,0];face(roof,pts,norm(n),[.8,.8,.8],rt);
      face(wood,pts.map(p=>[p[0],p[1]-.08,p[2]] as V),norm(n.map(v=>-v) as V),timber,wt);
    }
  }
  if(profile.kind==='civic') {
    // Restrained carved ridge terminals mark civic importance, without inventing a tower.
    for(const b of [b0+.25,b1-.25]) {
      beam(P(ac,b,top(ac)-.1),P(ac,b,top(ac)+1.3),.19);
      beam(P(ac-.32,b,top(ac)+.65),P(ac,b,top(ac)+1.12),.14);
      beam(P(ac+.32,b,top(ac)+.65),P(ac,b,top(ac)+1.12),.14);
    }
  }
}
