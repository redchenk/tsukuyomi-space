import * as T from 'three';
import {arrival,atGate} from './landmarks.js';
import {sunDirection} from './sunset.js';

// The crown breaks into short-lived drops. Neighbouring drops inherit the
// velocity of a crest; the particles travel in world metres under gravity.
export function createSpray(age){
  const start=atGate(-17.0/arrival.scale+.7,-.32/arrival.scale);
  let state=12253;
  const rand=()=>((state=Math.imul(1664525,state)+1013904223>>>0)/4294967296);
  const g=new T.InstancedBufferGeometry();
  const quad=new T.PlaneGeometry(1,1);g.setIndex(quad.index);g.setAttribute('position',quad.attributes.position);
  const origins=[],velocities=[],lives=[];
  for(let plume=0;plume<38;plume++){
    const a=rand()*Math.PI*2,rad=.24+rand()*.80,speed=.31+rand()*1.3;
    const launch=.045+rand()*.30,up=1.35+rand()*3.36,reach=.98+rand()*2.;
    for(let j=0;j<10;j++){
      const theta=a+(rand()-.5)*.23;
      origins.push(start.x+Math.cos(theta)*rad+arrival.normal.x*reach,.015+rand()*.08,
        start.z+Math.sin(theta)*rad+arrival.normal.z*reach);
      velocities.push(Math.cos(theta)*speed,.74*up+rand()*.36*up,Math.sin(theta)*speed);
      lives.push(launch+(rand()-.5)*.12,.0017+Math.pow(rand(),2.5)*.0102,rand());
    }
  }
  g.setAttribute('origin',new T.InstancedBufferAttribute(new Float32Array(origins),3));
  g.setAttribute('velocity',new T.InstancedBufferAttribute(new Float32Array(velocities),3));
  g.setAttribute('life',new T.InstancedBufferAttribute(new Float32Array(lives),3));
  g.instanceCount=lives.length/3;
  const m=new T.ShaderMaterial({
    uniforms:{age,sunDir:{value:sunDirection}},transparent:true,depthWrite:false,
    vertexShader:`attribute vec3 origin,velocity,life;uniform float age;
      varying vec2 disk;varying float opacity,lit;
      void main(){
        float t=age-life.x;vec3 v=velocity-vec3(0.,7.1*t,0.);
        vec3 p=origin+velocity*t-vec3(0.,3.55*t*t,0.);
        vec4 eye=viewMatrix*vec4(p,1.);
        vec2 tangent=(mat3(viewMatrix)*v).xy;
        tangent=normalize(tangent+vec2(.00001));
        vec2 across=vec2(tangent.y,-tangent.x);disk=position.xy*2.;
        eye.xy+=(across*disk.x+tangent*disk.y*(1.1+min(1.5,length(v)*.22)))*life.y;
        opacity=smoothstep(0.,.045,t)*smoothstep(.003,.10,p.y)*(1.-smoothstep(1.20,1.48,t));
        if(t<0.||age<0.||p.y<0.)opacity=0.;
        lit=life.z;
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`varying vec2 disk;varying float opacity,lit;uniform vec3 sunDir;
      void main(){
        float r=dot(disk,disk);if(r>1.||opacity<.002)discard;
        vec3 n=normalize(vec3(disk,sqrt(max(0.,1.-r))));
        vec3 L=normalize((viewMatrix*vec4(sunDir,0.)).xyz+vec3(0.,0.,1.));
        float highlight=pow(max(0.,dot(n,L)),16.);
        vec3 color=mix(vec3(.30,.20,.35),vec3(.95,.80,.72),n.y*.5+.5);
        gl_FragColor=vec4(color+vec3(2.2,1.8,1.35)*highlight,opacity*(.18+.50*r+.25*highlight)*(.55+.45*lit));
        #include <colorspace_fragment>
      }`
  });
  const spray=new T.Mesh(g,m);spray.frustumCulled=false;spray.renderOrder=2;
  return spray;
}
