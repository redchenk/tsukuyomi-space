import * as T from 'three';
import {sweptBeam} from './architecture.js';
import {bridge} from './landmarks.js';

export function createBridge(plaqueTexture,woodTexture){
  const group=new T.Group();
  group.position.set(bridge.x,0,bridge.z);
  const cube=new T.BoxGeometry(),post=new T.CylinderGeometry(.5,.53,1,24);
  const cap=new T.CylinderGeometry(.36,.72,1,4).rotateY(Math.PI/4);
  const ball=new T.SphereGeometry(.5,12,10);
  const mat=(color,emissive=0x000000)=>new T.MeshPhongMaterial({color,emissive,shininess:22});
  const brown=mat(0x9b6755,0x22140f),deep=mat(0x562a24,0x281313);
  const red=mat(0x923c2f,0x280f0b), rail=mat(0xa44634,0x341810);
  const bronze=mat(0x443c3a,0x151718),stone=mat(0x766669,0x211e24);
  const charcoal=mat(0x343746,0x10131a),gold=mat(0xffc48a,0xb47a45);
  const line=new T.MeshBasicMaterial({color:0xfff5e3});
  const paper=new T.MeshBasicMaterial({color:0xffaf60});
  const amber=new T.MeshBasicMaterial({color:0xffcd8a});
  const deckMats=[0x784e46,0x80524c,0x71504b].map(c=>mat(c,0x2e2023));
  // Long grain follows each post, handrail or floorboard in local metres. The
  // gate is floodlit from the bridge centre, revealing grain in its highlights.
  for(const material of [brown,deep,red,rail,...deckMats]){
    material.onBeforeCompile=shader=>{
      shader.uniforms.timberMap={value:woodTexture};
      shader.vertexShader=shader.vertexShader.replace('#include <common>',
        '#include <common>\nvarying vec2 timberUV;').replace('#include <begin_vertex>',`
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 p=(instanceMatrix*vec4(position,1.)).xyz;
          vec3 span=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
          if(span.y>span.x&&span.y>span.z)timberUV=vec2((p.x+p.z)*.69,p.y*.28);
          else if(span.x>span.z)timberUV=vec2((p.y+p.z)*.63,p.x*.27);
          else timberUV=vec2((p.x+p.y)*.71,p.z*.27);
        #else
          timberUV=vec2((position.y+position.z)*.68,position.x*.27);
        #endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
        '#include <common>\nuniform sampler2D timberMap; varying vec2 timberUV;')
        .replace('#include <color_fragment>',`#include <color_fragment>
        float streak=texture2D(timberMap,timberUV).r;
        float fine=texture2D(timberMap,timberUV*vec2(3.1,1.3)).r;
        diffuseColor.rgb*=clamp(.79+(streak-.565)*2.8+(fine-.57)*.54,.38,1.40);`);
    };
  }
  const boardGeo=new T.BoxGeometry();
  const sets=new Map(),obj=new T.Object3D();
  function part(g,m,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){
    const key=g.uuid+m.uuid;
    if(!sets.has(key))sets.set(key,{g,m,instances:[]});
    obj.position.set(x,y,z);obj.scale.set(sx,sy,sz);obj.rotation.set(rx,ry,rz);obj.updateMatrix();
    sets.get(key).instances.push(obj.matrix.clone());
  }
  function swept(len,w,h,rise,material,y,z=0){
    const g=sweptBeam(len,w,h,rise,.09);
    const mesh=new T.Mesh(g,material);mesh.position.set(0,y,z);group.add(mesh);
  }
  const deckY=z=>bridge.deck+.72*Math.exp(-Math.pow((z-6)/15,2));
  function railSpan(x,z1,z2,y,w,h,material){
    const y1=deckY(z1)+y,y2=deckY(z2)+y,len=Math.hypot(y2-y1,z2-z1);
    part(cube,material,x,(y1+y2)/2,(z1+z2)/2,w,h,len,-Math.atan2(y2-y1,z2-z1));
  }
  // The bridge is convex, so the deck and three courses of railing follow
  // the same profile. Its individual lamps and posts remain visible in flight.
  for(let i=0;i<180;i++){
    const z=-38+i*.40;
    part(boardGeo,deckMats[(i*7)%3],0,deckY(z)-.12,z,7.40,.24,.394);
  }
  for(const side of [-1,1]){
    const x=side*3.63;
    for(let z=-38;z<=34;z+=2){
      const y=deckY(z);
      part(cube,red,x,y+.49,z,.16,1.0,.16);
      if((z+38)%4===0){
        part(cube,rail,x,y+.62,z,.23,1.29,.23);
        part(post,bronze,x,y+1.31,z,.27,.14,.27);
        part(ball,bronze,x,y+1.46,z,.23,.29,.23);
      }
      if(z<34){
        railSpan(x,z,z+2,1.09,.18,.16,rail);
        railSpan(x,z,z+2,.64,.12,.105,red);
        railSpan(x,z,z+2,.26,.105,.082,red);
        railSpan(x,z,z+2,-.20,.32,.47,deep);
      }
    }
  }
  // Wooden tōrō with glowing paper, lattice on all four sides and hipped roofs.
  function lantern(x,z,scale=1){
    const y=deckY(z), k=scale;
    function item(g,m,dx,dy,dz,w,h,d,ry=0){
      part(g,m,x+dx*k,y+dy*k,z+dz*k,w*k,h*k,d*k,0,ry);
    }
    item(cube,deep,0,.10,0,.50,.20,.50);
    item(post,brown,0,1.13,0,.27,2.13,.27);
    item(cap,brown,0,2.19,0,.66,.27,.66);
    item(cube,deep,0,2.32,0,.82,.12,.82);
    item(cube,paper,0,2.71,0,.61,.72,.61);
    for(const sign of [-1,1])for(const amt of [-.32,0,.32]){
      item(cube,brown,amt,2.70,sign*.32,.035,.76,.042);
      item(cube,brown,sign*.32,2.70,amt,.042,.76,.035);
    }
    for(const yy of [2.53,2.84,3.08])item(cube,brown,0,yy,0,.67,.035,.67);
    item(cube,deep,0,3.10,0,.82,.10,.82);
    item(cap,charcoal,0,3.35,0,.87,.43,.87);
    item(cube,bronze,0,3.59,0,.34,.075,.34);
    item(ball,bronze,0,3.68,0,.14,.16,.14);
  }
  for(const side of [-1,1])for(const z of [-29,-17,-6,6,18,29])lantern(side*4.04,z,.86);

  // The central moon-viewing gate has a white rim, amber tablet and lit joinery.
  const foot=deckY(0),top=foot+6.9;
  for(const x of [-2.84,2.84]){
    part(post,brown,x,foot+3.45,0,.65,6.9,.65);
    part(post,deep,x,foot+.32,0,.79,.64,.79);
    part(post,brown,x,top-.055,0,.84,.19,.84);
    part(cube,brown,x,foot+4.54,0,1.14,.31,.92);
    part(cube,line,x,foot+4.70,0,1.18,.065,.95);
  }
  part(cube,brown,0,foot+5.15,0,9.85,.59,.48);
  part(cube,deep,0,foot+5.48,0,9.99,.08,.55);
  swept(11.38,.91,.32,.33,brown,top-.12);
  swept(11.71,1.07,.22,.35,deep,top+.20);
  swept(11.98,1.13,.088,.37,line,top+.41);
  part(cube,gold,0,top-.85,0,.92,1.37,.30);
  plaqueTexture.colorSpace=T.SRGBColorSpace;
  const signMat=new T.MeshBasicMaterial({map:plaqueTexture,color:0xfff2dc});
  for(const s of [-1,1])part(cube,signMat,0,top-.85,s*.163,.86,1.30,.026,0,s<0?Math.PI:0);
  // The hall at the far end of the bridge, visible between the gate posts.
  const end=-33, floor=deckY(end);
  part(cube,stone,0,floor-.4,end,17,.90,12);
  part(cube,deep,0,floor+2.35,end-1,15.7,4.7,7);
  for(const x of [-6.7,-3.6,3.6,6.7])part(post,red,x,floor+2.25,end+3.9,.48,4.5,.48);
  part(cube,deep,0,floor+4.44,end+3.9,16,.35,.50);
  part(cube,charcoal,0,floor+4.44,end+1.95,18.7,.38,4.0,.26);
  for(let i=0;i<68;i++){
    const x=-9.18+i*.275;
    part(post,bronze,x,floor+4.64,end+1.86,.10,4.08,.10,Math.PI/2+.26);
    part(cube,deep,x,floor+4.12,end+3.52,.15,.29,.70);
  }
  for(const s of [-1,1]){
    part(cube,deep,s*6.0,floor+3.84,end+3.55,4.88,.22,.53);
    for(let i=0;i<5;i++)part(cube,brown,s*(4.3+i*.77),floor+3.51,end+3.55,.19,.59,.37);
  }
  part(cube,charcoal,0,floor+4.93,end-.8,18.7,.42,4.0,.23);
  part(cube,bronze,0,floor+5.32,end-.02,19.0,.22,.48);
  const paperDisc=document.createElement('canvas');paperDisc.width=paperDisc.height=256;
  const dc=paperDisc.getContext('2d'),wash=dc.createLinearGradient(0,0,0,256);
  wash.addColorStop(0,'#4b352a');wash.addColorStop(.47,'#956842');wash.addColorStop(1,'#e6b97a');
  dc.fillStyle=wash;dc.fillRect(0,0,256,256);
  const disc=new T.CanvasTexture(paperDisc);disc.colorSpace=T.SRGBColorSpace;
  const moon=new T.Mesh(new T.CircleGeometry(1.51,64),new T.MeshBasicMaterial({map:disc}));
  moon.position.set(0,floor+2.4,end+2.53);group.add(moon);
  for(const x of [-5.2,5.2]){
    part(cube,amber,x,floor+2.1,end+2.54,1.45,2.25,.07);
    for(const dx of [-.66,-.22,.22,.66])part(cube,deep,x+dx,floor+2.1,end+2.62,.065,2.4,.08);
    for(const dy of [-1.08,-.54,0,.54,1.08])part(cube,deep,x,floor+2.1+dy,end+2.62,1.50,.065,.08);
  }
  for(const {g,m,instances} of sets.values()){
    const mesh=new T.InstancedMesh(g,m,instances.length);
    instances.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));group.add(mesh);
  }
  const key=new T.PointLight(0xffd9b1,88,23,2);key.position.set(0,top-1.2,2.85);group.add(key);
  const fill=new T.HemisphereLight(0xe3d4c8,0x493e58,.49);group.add(fill);
  return group;
}
