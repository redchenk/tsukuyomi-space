import {atHeight} from './framing.js';

const height=6.25;
const a=atHeight(199,262,height),b=atHeight(335,354,height);
const cx=(a.x+b.x)*.5,cz=(a.z+b.z)*.5;
// The frontal view resolves the pillar spacing hidden by the oblique still.
const spacing=5.2443/Math.hypot(b.x-a.x,b.z-a.z);
for(const p of [a,b]){p.x=cx+(p.x-cx)*spacing;p.z=cz+(p.z-cz)*spacing;}
const span=Math.hypot(b.x-a.x,b.z-a.z);
const across={x:(b.x-a.x)/span,z:(b.z-a.z)/span};
const normal={x:across.z,z:-across.x};
export const arrival={a,b,height,span,across,normal,scale:height/7.35,
  x:(a.x+b.x)/2,z:(a.z+b.z)/2,yaw:Math.atan2(-normal.x,-normal.z)};
export function atGate(forward,lateral=0){
  return {x:arrival.x+arrival.scale*(normal.x*forward+across.x*lateral),
    z:arrival.z+arrival.scale*(normal.z*forward+across.z*lateral)};
}
export const sideEye={x:1.15934,y:.011,z:2.47847,yaw:.073615,pitch:.20235,focal:663.08};
export const bridge={x:-72,z:295,deck:1.35};
