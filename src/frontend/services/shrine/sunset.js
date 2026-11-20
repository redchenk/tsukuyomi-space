import * as T from 'three';
import {arrival} from './landmarks.js';

export const sunDirection=new T.Vector3(
  -arrival.normal.x*.63-arrival.across.x*.77,.38,
  -arrival.normal.z*.63-arrival.across.z*.77
).normalize();

// The physical lacquer reflects the same directional clouds as the water.
// PMREM convolves this HDR radiance field at progressively wider roughnesses.
export function lightShrine(renderer,scene,skyUniforms,skyFunctions){
  let env;
  if(renderer.extensions.has('EXT_color_buffer_float')){
    const dome=new T.Scene();
    const material=new T.ShaderMaterial({
      side:T.BackSide,depthWrite:false,uniforms:skyUniforms,
      vertexShader:`varying vec3 direction;
        void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 direction;
        ${skyFunctions}
        void main(){
          vec3 d=normalize(direction),up=vec3(d.x,abs(d.y),d.z);
          vec3 radiance=pow(max(sky(up),0.),vec3(2.2));
          float disk=exp(-max(0.,1.-dot(up,sunDir))*420.);
          radiance+=vec3(4.8,2.65,1.28)*disk;
          if(d.y<0.)radiance=mix(radiance*.48,vec3(.074,.043,.074),smoothstep(.0,.75,-d.y)*.64);
          gl_FragColor=vec4(radiance,1.);
        }`
    });
    const shape=new T.SphereGeometry(8,40,24);
    dome.add(new T.Mesh(shape,material));
    const convolution=new T.PMREMGenerator(renderer);
    env=convolution.fromScene(dome,0,.1,20,{size:128});
    scene.environment=env.texture;convolution.dispose();material.dispose();shape.dispose();
  }
  const sun=new T.DirectionalLight(0xffdbc3,2.35);
  sun.target.position.set(arrival.x,3.35,arrival.z);
  sun.position.copy(sun.target.position).addScaledVector(sunDirection,36);
  sun.castShadow=true;
  const sc=sun.shadow.camera;sc.left=sc.bottom=-13;sc.right=sc.top=13;
  sc.near=.5;sc.far=82;sc.updateProjectionMatrix();
  sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.008;sun.shadow.bias=-.00009;
  sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  const skyFill=new T.HemisphereLight(0xb3c3ef,0xa55c61,.60);
  scene.add(sun,sun.target,skyFill);
  const localLights=[];
  scene.traverse(o=>{if(o.isPointLight&&o.userData.andon)localLights.push(o);});
  scene.fog=new T.FogExp2(0xbe8e9f,.00285);
  const dusk=new T.Color(0xffdbc3),moon=new T.Color(0xa7c9f9);
  const haze=new T.Color(0xbe8e9f),nightHaze=new T.Color(0x17243b);
  function illuminate(night){
    sun.intensity=T.MathUtils.lerp(2.35,.28,night);sun.color.copy(dusk).lerp(moon,night);
    skyFill.intensity=.60-.51*night;scene.environmentIntensity=1.18-1.10*night;
    scene.fog.color.copy(haze).lerp(nightHaze,night);
    for(const lamp of localLights)lamp.intensity=2.1+7.6*night;
  }
  return {sun,illuminate,dispose(){env?.dispose();sun.shadow.dispose();}};
}
