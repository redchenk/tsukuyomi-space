import * as T from 'three';
import {arrival,atGate,bridge,sideEye} from './landmarks.js';
import {arrivalPose,arrivalFocal} from './arrival-track.js';

export const waterCut=5, sideCut=8, nightCut=10, duration=12.3;
const smooth=T.MathUtils.smoothstep;
const smoothAt=(a,b,t)=>smooth(t,a,b);
const mix=T.MathUtils.lerp;
const at=(x,y,z,yaw,pitch,fov,roll=0)=>({x,y,z,yaw,pitch,fov,roll});
function front(distance,height,pitch,fov,pan=0,roll=0,offset=0){
  const p=atGate(-distance,offset);
  return at(p.x,height,p.z,arrival.yaw+pan,pitch,fov,roll);
}
function sample(rows,t){
  let i=1;while(i<rows.length-1 && t>rows[i][0])i++;
  const a=rows[i-1],b=rows[i];
  const f=T.MathUtils.clamp((t-a[0])/(b[0]-a[0]),0,1);
  return a.slice(1).map((v,k)=>mix(v,b[k+1],f));
}
// Width of the nuki in the 960 px reference and the position of the horizon.
// Lens and dolly together retain the low waterline as the frame opens up.
const pullback=[
  [30,744,488],[30.35,731,488],[30.7,699,488],[31,637,489],[31.2,567,490],
  [31.4,461,491],[31.6,369,492],[31.8,320,492],[32,298,492],[32.3,288,492]
];
export function shotAt(t,filmLook=false){
  if(t<waterCut)return {name:'crossing'};
  if(t<sideCut){
    const age=t-waterCut;
    let [d,yaw,pitch,roll]=arrivalPose(age);
    let offset=-.32;
    if(filmLook){
      const settle=smoothAt(.57,1.65,age),travel=smoothAt(.52,2.98,age);
      // The rise resolves into one slow lateral move, with room above the kasagi.
      yaw=mix(yaw,-.012+.039*travel,settle);
      pitch+=.041*settle;
      roll*=1.-.94*settle;
      offset+=.52*travel;
    }
    return {name:'water-arrival',pose:front(d/arrival.scale,.405,pitch,
      2*T.MathUtils.radToDeg(Math.atan(270/arrivalFocal)),yaw,roll,offset/arrival.scale)};
  }
  if(t<nightCut){
    const arc=(t-sideCut)/(nightCut-sideCut);
    const truck=-.047*arc;
    return {name:'side-braces',pose:at(sideEye.x+Math.cos(sideEye.yaw)*truck,sideEye.y,
      sideEye.z-Math.sin(sideEye.yaw)*truck,sideEye.yaw-.0031*arc,sideEye.pitch+.0131*arc,
      2*T.MathUtils.radToDeg(Math.atan(270/sideEye.focal)))};
  }
  const film=30+t-nightCut;
  const [width,row]=sample(pullback,film);
  const progression=(744-width)/(744-288);
  const focal=mix(944,650,progression);
  const pitch=Math.atan((row-270)/focal),eye=mix(.18,.22,progression);
  const depth=focal*(8.426)/width;
  const dist=(depth-(arrival.height*.7927-eye)*Math.sin(pitch))/Math.cos(pitch);
  return {name:'nightfall',pose:front(dist/arrival.scale,eye,pitch,2*T.MathUtils.radToDeg(Math.atan(270/focal)))};
}
export function applyPose(camera,pose){
  camera.position.set(pose.x,pose.y,pose.z);
  camera.rotation.set(pose.pitch,pose.yaw,pose.roll||0,'YXZ');
  const scale=Math.min(1,(16/9)/camera.aspect);
  const fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(pose.fov)*.5)*scale));
  if(Math.abs(camera.fov-fov)>.0001){camera.fov=fov;camera.updateProjectionMatrix();}
}
export function setLighting(t,light,filmLook=false){
  light.night.value=smoothAt(11.01,11.64,t);
  light.trails.value=smoothAt(11.26,12.24,t);
  light.impact.value=t>=waterCut&&t<8.6?t-waterCut:-1;
  if(light.filmLook)light.filmLook.value=filmLook?smoothAt(5.20,5.72,t)*(1.-smoothAt(11.15,12.15,t)):0;
}
export function bridgeView(){
  return at(bridge.x+.14,bridge.deck+.95,bridge.z+14.3,.009,Math.atan2(4.38,14.3),43);
}
