import * as T from 'three';
import {arrival,atGate,sideEye} from './landmarks.js';
import {atHeight} from './framing.js';

export function lanternLayout() {
  const lamps=[];
  function add(x,z,h=.78,yaw=.3,base=1.10) {lamps.push({x,z,h,yaw,base});}
  // The initial and reverse viewpoints constrain both angular size and depth.
  for(const [u,v,size,yaw] of [
    [-43,456,.041,.43],[376,601,.046,.38],[430,598,.043,.44],[638,577,.041,.46],
    [666,613,.148,.30],[731,622,.081,.22],[787,615,.052,.37],[871,601,.041,.43],
    [1010,614,.78,.48],[1040,620,.055,.38],[1086,608,.98,.48],[1278,612,.73,.39],
  ]){
    const p=atHeight(u,v,size);add(p.x,p.z,size,yaw);
  }
  // The side shot trucks left: the two near shades drift to the right against
  // almost stationary columns. Their depths come from that measured parallax.
  for(const [u,top,depth,yaw,base] of [[33,286,1.67,.41,1.55],[834,345,1.76,.29,1.55],[164,384,6.2,.26,1.30]]){
    const {x,y,z,yaw:pan,pitch,focal}=sideEye;
    const rx=(u-480)/focal,ry=(270-top)/focal;
    const ahead=depth*(Math.cos(pitch)-ry*Math.sin(pitch)),right=rx*depth;
    add(x-ahead*Math.sin(pan)+right*Math.cos(pan),z-ahead*Math.cos(pan)-right*Math.sin(pan),
      y+depth*(Math.sin(pitch)+ry*Math.cos(pitch)),yaw,base);
  }
  // Transverse walks and their converging branches describe a road across the
  // ocean even when the observer leaves the reference viewpoint.
  for(let i=-106;i<=106;i++) {
    const x=i*3.05;
    for(const [z,offset] of [[-84,1.8],[-90,.3],[-96,1.15],[-154,.6],[-167,1.9]]) {
      add(x+offset,z+2.0*Math.sin(i*.075),.65+.09*Math.cos(i*2.7),.28+i*.021);
    }
  }
  for(let i=-120;i<=120;i++){
    const x=i*2.1+Math.sin(i*15.771)*.72;
    add(x,-114+4.*Math.sin(i*.61),.52+.21*Math.abs(Math.sin(i*8.21)),i*.31);
    add(x+1.12,-126+3.*Math.sin(i*.9),.50+.18*Math.abs(Math.sin(i*3.03)),i*.27);
  }
  for(let i=0;i<26;i++){
    const z=-42-i*4.0;
    add(-22-i*2.6,z,.71,.4);
    add(29+i*3.4,z-2,.71,.45);
  }
  // The lantern procession continues through the unseen half of the shrine.
  for(let i=0;i<46;i++){
    add(-13+i*1.75,9+i*2.08,.77,.32);
    add(-17+i*1.75,11.9+i*2.08,.77,.32);
  }
  // A dense field of small floating andon surrounds the front-facing gate.
  let seed=25261;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  function addAtGate(n,l,h,yaw){
    const p=atGate(n,l);add(p.x,p.z,h*arrival.scale,yaw);
  }
  for(let i=0;i<3200;i++){
    const n=-14+random()*157,l=(random()-.5)*250;
    if(n<6 && (n<0 || Math.abs(l)<3.2))continue;
    addAtGate(n,l,.19+random()*.13,random()*Math.PI);
  }
  // The small andon nearest the splash were back-projected onto the water
  // using their base and shade height in the first stable arrival shot.
  for(const [x,z,h] of [
    [-11.09,-2.99,.107],[-12.48,-2.08,.101],[-12.45,-1.59,.097],[-11.2,-.45,.111],
    [-12.94,-.28,.097],[-13.22,.41,.091],[-10.34,.79,.118],[-9.28,-.04,.123],
    [-8.95,-3.78,.121],[-6.78,-4.37,.135],[-5.35,-4.76,.143],[-7.86,-2.75,.13],
    [-8.02,-2.06,.127],[-6.78,2.94,.148],[-9.94,3.18,.111],[-7.53,4.28,.135],
  ])addAtGate(x,z,h,.42+random()*.5);
  return lamps;
}

export function createLanterns(lights,light){
  const group=new T.Group(), temp=new T.Object3D();
  const shader=new T.ShaderMaterial({
    uniforms:{night:light.night},
    vertexShader:`
      varying vec2 faceUv; varying float side,strength,front,air;
      void main(){
        faceUv=uv; side=normal.y;front=abs(normal.z); strength=.5+.5*dot(normalize(mat3(instanceMatrix)*normal),normalize(vec3(-1.,.3,.45)));
        vec4 eye=modelViewMatrix*instanceMatrix*vec4(position,1.);
        air=1.-exp(-.0052*length(eye.xyz));
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`
      varying vec2 faceUv; varying float side,strength,front,air;
      uniform float night;
      float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.55);}
      void main(){
        vec2 uv=faceUv;
        vec3 frame=mix(vec3(.22,.105,.12),vec3(.38,.208,.18),strength);
        float x=abs(uv.x-.5), y=uv.y;
        // The rounded paper opening is cut out of a dark timber frame.
        float pane=front>.5?abs(fract(uv.x*2.)-.5)*.5:x;
        float archWidth=front>.5?.147:.295;
        vec2 corner=vec2(max(pane-archWidth,0.),max(y-.806,0.));
        float windowD=min(.436-x,min(y-.054,.143-length(corner*vec2(1.,1.34))));
        if(front>.5)windowD=min(windowD,x-.023);
        float aa=max(fwidth(windowD),.0015);
        float open=smoothstep(-aa,aa,windowD);
        float center=1.-min(1.,length((uv-vec2(.48,.44))*vec2(1.5,1.)));
        float fiber=hash(floor(uv*vec2(110.,165.)))-.5;
        vec3 paper=mix(vec3(.982,.865,.545),vec3(1.,.997,.835),.25+.57*center+.15*strength)+fiber*.016;
        paper=mix(paper,vec3(1.,.966,.867)+fiber*.009,night*.93);
        vec3 srgb=side>.5?mix(frame,vec3(.63,.372,.28),.3):mix(frame,paper,open);
        // Sea haze lowers far-field contrast; a nearby shade retains its dark
        // frame and the next row remains visible through the haze behind it.
        vec3 haze=mix(vec3(.764,.576,.588),vec3(.199,.258,.333),night);
        srgb=mix(srgb,haze,air*(.58-.31*night));
        gl_FragColor=vec4(pow(srgb,vec3(2.2)),1.);
        #include <colorspace_fragment>
      }`,
  });
  const boxes=new T.InstancedMesh(new T.BoxGeometry(1,1,1),shader,lights.length);
  const trimMat=new T.MeshBasicMaterial({color:0x613637});
  const trim=new T.InstancedMesh(new T.BoxGeometry(1,1,1),trimMat,lights.length*2);
  function stamp(mesh,i,x,y,z,w,h,d,rot){
    temp.position.set(x,y,z);temp.rotation.set(0,rot,0);temp.scale.set(w,h,d);
    temp.updateMatrix();mesh.setMatrixAt(i,temp.matrix);
  }
  lights.forEach(({x,z,h,yaw,base},i)=>{
    const width=h*.65;
    stamp(boxes,i,x,h*.515,z,width,h*.97,width,yaw);
    const foot=base>1.10?base:h<.16?1.72:base;
    stamp(trim,i*2,x,h*.025,z,width*foot,h*.048,width*foot,yaw);
    stamp(trim,i*2+1,x,h*.988,z,width*1.055,h*.024,width*1.055,yaw);
  });
  group.add(boxes,trim);
  const close=lights.filter(l=>Math.hypot(l.x-arrival.x,l.z-arrival.z)<29 && l.h>.13);
  const rails=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshStandardMaterial({
    color:0x48241e,metalness:0,roughness:.47
  }),close.length*4);
  close.forEach(({x,z,h,yaw},i)=>{
    const w=h*.65,cs=Math.cos(yaw),sn=Math.sin(yaw);
    for(let k=0;k<4;k++){
      const dx=(k%2-.5)*w*.982,dz=((k>>1)-.5)*w*.982;
      stamp(rails,4*i+k,x+cs*dx+sn*dz,h*.505,z-sn*dx+cs*dz,w*.062,h*.92,w*.062,yaw);
    }
  });
  rails.castShadow=rails.receiveShadow=true;group.add(rails);
  for(const [f,l] of [[-4,-3.25],[-3.1,3.6],[2.8,-3.3]]){
    const spot=atGate(f,l);
    const lamp=lights.reduce((a,b)=>Math.hypot(a.x-spot.x,a.z-spot.z)<Math.hypot(b.x-spot.x,b.z-spot.z)?a:b);
    const bulb=new T.PointLight(0xffbd76,2.1,8,2);
    bulb.position.set(lamp.x,lamp.h*.54,lamp.z);bulb.userData.andon=true;
    group.add(bulb);
  }
  // Low-intensity halos are rendered in one call. They shrink with the paper
  // shade and stay attached to each lamp in both the scene and its reflection.
  const glow=new T.ShaderMaterial({
    uniforms:{night:light.night},
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`
      varying vec2 vUv;
      void main(){vUv=uv;vec4 c=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        c.xy+=(uv-.5)*length(instanceMatrix[0].xyz);gl_Position=projectionMatrix*c;}`,
    fragmentShader:`
      uniform float night; varying vec2 vUv;
      void main(){float r=length(vUv-.5)*2.;float v=pow(max(0.,1.-r),3.);
      gl_FragColor=vec4(mix(vec3(.90,.43,.15),vec3(.94,.86,.68),night),v*(.19+night*.21));
      #include <colorspace_fragment>
      }`,
  });
  const halos=new T.InstancedMesh(new T.PlaneGeometry(),glow,lights.length);
  lights.forEach(({x,z,h},i)=>stamp(halos,i,x,h*.52,z,h*2.8,h*2.8,h*2.8,0));
  halos.renderOrder=3; group.add(halos);
  return group;
}
