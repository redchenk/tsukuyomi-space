import * as T from 'three';
import {arrival,sideEye} from './landmarks.js';
import {lacqueredTimber} from './timber.js';

const spin = new T.Quaternion();
const transform = new T.Matrix4();
const up = new T.Vector3(0, 1, 0);
const cube=new T.BoxGeometry();
const bar=cube;
const peg=new T.CylinderGeometry(1,.96,1,12).rotateZ(Math.PI*.5);
const wedge=new T.BoxGeometry(1,1,1);
for(let i=0;i<wedge.attributes.position.count;i++){
  const p=wedge.attributes.position;
  const side=p.getX(i)+.5;
  p.setY(i,(p.getY(i)+.5)*(.23+.77*side)-.5);
}
wedge.computeVertexNormals();
const collar=new T.LatheGeometry([
  [0,-.5],[.90,-.5],[.99,-.37],[1,-.22],[.96,-.10],[.96,.12],[1,.25],[1,.37],[.91,.5],[0,.5]
].map(([r,y])=>new T.Vector2(r,y)),80);

// Radius varies continuously along the log. The same slight checks and ovality
// affect the silhouette, the sun shadow and the reflection from every angle.
function shaft(seed,detail){
  const segments=detail?96:36, rows=detail?32:10;
  const g=new T.CylinderGeometry(1,1,1,segments,rows);
  const pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),h=y+.5;
    const a=Math.atan2(z,x);
    const adze=.008*Math.cos(3*a+seed)+.004*Math.sin(7*a+2*h+seed)
      +.0035*Math.sin(13*a+3*h+seed);
    const seam=Math.exp(-Math.pow(Math.sin((a-seed-.06*Math.sin(h*5.))*.5)/.037,2));
    const r=1.055-.106*h+.017*Math.sin(Math.PI*h)+adze-.013*seam*Math.sin(Math.PI*h);
    pos.setXYZ(i,x*r,y,z*r);
  }
  g.computeVertexNormals();
  // Weld the U seam's shading; caps keep their own end-grain normals.
  const n=g.attributes.normal,v=new T.Vector3(),other=new T.Vector3();
  for(let row=0;row<=rows;row++){
    const l=row*(segments+1),r=l+segments;
    v.fromBufferAttribute(n,l).add(other.fromBufferAttribute(n,r)).normalize();
    n.setXYZ(l,v.x,v.y,v.z);n.setXYZ(r,v.x,v.y,v.z);
  }
  return g;
}

// Rounded arrises have a constant radius in metres, including on long beams.
function dressedBlock(width,height,depth){
  const g=new T.BoxGeometry(1,1,1,7,7,7);
  const pos=g.attributes.position,n=g.attributes.normal;
  const r=Math.min(.024,Math.min(width,height,depth)*.12);
  const v=new T.Vector3(),q=new T.Vector3(),d=new T.Vector3();
  const half=new T.Vector3(width,height,depth).multiplyScalar(.5);
  const fractions=[1,.60,.26,0,0,.26,.60,1];
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i);
    for(const axis of ['x','y','z']){
      const j=Math.round((v[axis]+.5)*7);
      q[axis]=Math.sign(v[axis])*(half[axis]-r);
      d[axis]=Math.sign(v[axis])*fractions[j];
    }
    d.normalize();q.addScaledVector(d,r);pos.setXYZ(i,q.x,q.y,q.z);n.setXYZ(i,d.x,d.y,d.z);
  }
  return g;
}

function timberBatch(){
  const position=[],normal=[],grain=[],stock=[],surface=[],dimensions=[],indices=[];
  let pieceId=0;
  const size=new T.Vector3(),center=new T.Vector3(),scale=new T.Vector3(),p=new T.Vector3();
  function piece(g,matrix,kind,column){
    const offset=position.length/3;
    g.computeBoundingBox();g.boundingBox.getSize(size);g.boundingBox.getCenter(center);
    scale.setFromMatrixScale(matrix);size.multiply(scale);
    const axis=column||size.y>Math.max(size.x,size.z)?'y':size.x>=size.z?'x':'z';
    const seed=(++pieceId*.61803398875)%1;
    const transformed=g.clone().applyMatrix4(matrix),a=transformed.attributes;
    for(let i=0;i<a.position.count;i++){
      position.push(a.position.getX(i),a.position.getY(i),a.position.getZ(i));
      normal.push(a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i));
      p.fromBufferAttribute(g.attributes.position,i).sub(center).multiply(scale);
      if(axis==='x')grain.push(p.z,p.x,p.y);
      else if(axis==='z')grain.push(p.x,p.z,p.y);
      else grain.push(p.x,p.y,p.z);
      if(axis==='x')dimensions.push(size.z*.5,size.x*.5,size.y*.5);
      else if(axis==='z')dimensions.push(size.x*.5,size.z*.5,size.y*.5);
      else dimensions.push(size.x*.5,size.y*.5,size.z*.5);
      // U winds continuously around a shaft. Planar and end-grain coordinates
      // come from the three-dimensional stock, in physical metres.
      stock.push(g.attributes.uv.getX(i),column?size.y:0,seed,kind);
      surface.push(column?Math.hypot(size.x,size.z)*.35355:0);
    }
    for(const i of transformed.index.array)indices.push(offset+i);
    transformed.dispose();
  }
  function finish(material){
    const g=new T.BufferGeometry();
    for(const [key,data,n] of [['position',position,3],['normal',normal,3],['woodCoord',grain,3],['stock',stock,4],['logRadius',surface,1],['woodHalf',dimensions,3]])
      g.setAttribute(key,new T.Float32BufferAttribute(data,n));
    g.setIndex(indices);g.computeBoundingSphere();
    const mesh=new T.Mesh(g,material);mesh.castShadow=mesh.receiveShadow=true;
    mesh.name='Lacquered torii timber';return mesh;
  }
  return {piece,finish};
}

// The kasagi and its cap are swept, bevelled solids. Their ends curl upward.
export function sweptBeam(length, width, height, rise, flare, baseWidth=1) {
  const pos = [], uvs = [], ix = [];
  const bevel = Math.min(height * .105, width * .12);
  const section = [
    [-width/2+bevel,0], [width/2-bevel,0], [width/2,bevel],
    [width/2,height-bevel], [width/2-bevel,height], [-width/2+bevel,height],
    [-width/2,height-bevel], [-width/2,bevel],
  ];
  const steps = 28;
  for (let side = 0; side < section.length; side++) {
    for (let i=0; i<=steps; i++) {
      const t=i/steps, u=t*2-1;
      const lift = rise * Math.pow(Math.abs(u),3.2), spread = 1 + flare * Math.pow(Math.abs(u),4);
      for (const k of [side,(side+1)%section.length]) {
        const end=baseWidth+(1-baseWidth)*section[k][1]/height;
        pos.push(u*length*.5*end, section[k][1]+lift, section[k][0]*spread);
        uvs.push(section[k][0]+section[k][1], t*2.5);
      }
      if (i < steps) {
        const a=side*(steps+1)*2+i*2;
        ix.push(a,a+2,a+1, a+1,a+2,a+3);
      }
    }
  }
  for (const sign of [-1,1]) {
    const start=pos.length/3;
    for (const [z,y] of section) {
      pos.push(sign*length/2*(baseWidth+(1-baseWidth)*y/height), y+rise, z*(1+flare)); uvs.push(z+.5,y);
    }
    for (let i=1; i<7; i++) {
      if(sign===1) ix.push(start,start+i+1,start+i);
      else ix.push(start,start+i,start+i+1);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geo.setIndex(ix); geo.computeVertexNormals();
  return geo;
}

export function createGates(paint,normalMap,coating){
  const batch=timberBatch();
  function gate(a,b,height,style='curved',thickness=1) {
    const span=Math.hypot(b.x-a.x,b.z-a.z);
    const rot=-Math.atan2(b.z-a.z,b.x-a.x);
    const radius=height*.044*thickness;
    const detail=style==='arrival'||style==='foreground';
    const center=new T.Vector3((a.x+b.x)/2,0,(a.z+b.z)/2);
    const gateTransform=new T.Matrix4().compose(center,spin.setFromAxisAngle(up,rot),new T.Vector3(1,1,1));
    function part(geometry,x,y,z,sx,sy,sz,kind=0,post=false,slopeY=0,slopeZ=0) {
      let temporary=false;
      if(geometry===cube){
        geometry=dressedBlock(sx,sy,sz);sx=sy=sz=1;temporary=true;
      }
      transform.makeScale(sx,sy,sz);
      transform.elements[4]=slopeY*sy;transform.elements[8]=slopeZ*sz;
      transform.setPosition(x,y,z).premultiply(gateTransform);
      batch.piece(geometry,transform,kind,post>0);
      if(temporary)geometry.dispose();
    }
    const capped=style==='capped', foreground=style==='foreground', portal=style==='arrival';
    for (const x of [-span/2,span/2]) {
      const cylinder=shaft((x+a.x)*1.65,detail);
      const rake=portal?-x*.0877/height:0;
      const columnX=y=>x+rake*y;
      part(cylinder,columnX((height-.16)/2),(height-.16)/2,0,radius,height+.16,radius,0,foreground?5:portal?(x<0?1:2):3,rake);
      part(collar,columnX(height),height-.074,0,radius*1.14,.17,radius*1.14,2);
      part(collar,columnX(height-.18),height-.18,0,radius*1.026,.055,radius*1.026,0);
      if(portal){
        const halfDepth=1.654,auxHeight=height*.6507,auxRadius=radius*.72;
        const splay=-x*.058;
        for(const z of [-halfDepth,halfDepth]){
          const offset=splay*z;
          part(cylinder,columnX((auxHeight-.12)/2)+offset,(auxHeight-.12)/2,z,auxRadius,auxHeight+.12,auxRadius,0,4,rake);
          part(cube,columnX(auxHeight)+offset,auxHeight,z,auxRadius*2.12,.13,auxRadius*2.69,2);
          part(cube,columnX(auxHeight)+offset,auxHeight+.083,z,auxRadius*2.30,.066,auxRadius*3.06,1);
        }
        // The tenon is housed inside the near post, with its exposed tip on
        // the opposite side. Looking head-on leaves a continuous shaft.
        const tip=-auxRadius*.66,run=2*halfDepth+auxRadius*1.75;
        for(const level of [.42,.84]){
          const y=auxHeight*level,xc=columnX(y)+splay*tip;
          part(cube,xc,y,tip,auxRadius*1.12,auxHeight*.112,run,0,false,0,splay);
          part(cube,xc,y+auxHeight*.060,tip,auxRadius*1.37,auxHeight*.018,run+.025,2,false,0,splay);
          for(const z of [-halfDepth,halfDepth]){
            const shaftX=columnX(y)+splay*z;
            part(peg,shaftX,y,z,auxRadius*2.17,.036,.037,3);
          }
        }
      }
      cylinder.dispose();
      if(capped){
        part(cube,x,height+.002,0,radius*2.57,height*.030,radius*2.52,2);
        part(cube,x,height+.08,0,radius*3,height*.018,radius*2.88,1);
      }
    }
    if(capped){
      part(bar,0,height*.81,0,span+radius*4.2,height*.105,radius*1.0);
      part(cube,0,height*.858,0,span+radius*4.5,height*.020,radius*1.20,2);
      part(bar,0,height*.397,0,span+radius*3.0,height*.095,radius*.93);
      part(cube,0,height*.439,0,span+radius*3.35,height*.019,radius*1.17,2);
      for(const x of [-span/2,span/2]) part(cube,x,height*.875,0,radius*.60,.10,radius*2.0,2);
    }else{
      const len=portal?10.529:span*(foreground?1.42:2.10), rise=portal?height*.031:height*.055;
      const profile=portal?[
        [len*.857,radius*1.95,height*.068,height,0,.946],
        [len*.929,radius*2.24,height*.053,height*1.068,0,.961],
        [len*.982,radius*2.56,height*.051,height*1.121,2,.953],
        [len,radius*2.80,height*.020,height*1.172,1,.988],
      ]:[
        [len*.948,radius*1.85,height*.042,height-.008,0],
        [len*.975,radius*2.08,height*.034,height*1.040,2],
        [len,radius*2.68,height*.022,height*1.072,1],
      ];
      for(const [l,w,h,y,kind,end] of profile){
        const beam=sweptBeam(l,w,h,rise*Math.pow(l/len,3.2),.11,end);
        part(beam,portal?.095:span*(foreground?.14:.08),y,0,1,1,1,kind,portal?-2:0); beam.dispose();
      }
      part(bar,foreground?span*.04:0,height*(foreground?.776:portal?.7927:.80),0,span*(foreground?1.27:portal?1.595:1.50),height*.105,radius*1.18,0,portal?-1:0);
      part(bar,foreground?span*.04:0,height*(foreground?.829:portal?.849:.853),0,span*(foreground?1.29:portal?1.608:1.52),height*.016,radius*1.5,2,portal?-1:0);
      part(cube,0,height*(portal?.874:.925),0,radius*1.23,height*(portal?.255:.15),radius*.94,2);
      for(const x of [-span/2,span/2]){
        part(cube,x*(portal?.924:1),height*.867,0,radius*(portal?2.85:.62),height*.021,radius*1.86,2);
        if(portal){
          part(wedge,x*.923,height*.886,0,radius*2.68,height*.044,radius*1.18,3);
          part(peg,x*.931,height*.791,0,radius*2.08,.047,.045,3);
        }
      }
    }
  }
  gate(arrival.a,arrival.b,arrival.height,'arrival',1.06);
  const k=2.839, depth=1.48;
  const framingPost=(x,z)=>({x:sideEye.x+(k*x-sideEye.x)*depth,z:sideEye.z+(k*z-sideEye.z)*depth});
  gate(framingPost(3.16,-4.68),framingPost(4.50,-.07),4.86*k*depth,'foreground',1.47);
  // The procession turns away to the left beyond the gates in the still.
  for(let i=0;i<9;i++){
    const x=-30-i*5.6,z=63+i*10.4;
    gate({x:x-2.8,z:z+.6},{x:x+2.8,z:z-.6},4.55-i*.09,'capped');
  }
  return batch.finish(lacqueredTimber(paint,normalMap,coating));
}
