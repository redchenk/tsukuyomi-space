import * as T from 'three';
import {arrival,sideEye} from './landmarks.js';

const spin = new T.Quaternion();
const transform = new T.Matrix4();
const up = new T.Vector3(0, 1, 0);
const cylinder = new T.CylinderGeometry(1, 1, 1, 48);
const cube = new T.BoxGeometry(1, 1, 1);
const bar = sweptBeam(1,1,1,0,0).translate(0,-.5,0);

// A single batch keeps the distant procession inexpensive. All positions and
// normals are stored in shrine coordinates, also used for the mirrored light.
function timberBatch() {
  const positions = [], normals = [], texels = [], kinds = [], heights = [], roles = [], indices = [];
  function piece(geometry, matrix, kind, post = false) {
    const offset = positions.length / 3;
    const work = geometry.clone().applyMatrix4(matrix);
    const {position, normal, uv} = work.attributes;
    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      texels.push(uv.getX(i), uv.getY(i));
      kinds.push(kind);
      roles.push(Number(post));
      heights.push(post>0 ? geometry.attributes.uv.getY(i) : 2);
    }
    if (work.index) for (const i of work.index.array) indices.push(offset + i);
    else for (let i = 0; i < position.count; i++) indices.push(offset + i);
    work.dispose();
  }
  function finish(material) {
    const geo = new T.BufferGeometry();
    for (const [name, values, size] of [['position',positions,3],['normal',normals,3],['uv',texels,2],['kind',kinds,1],['level',heights,1],['role',roles,1]])
      geo.setAttribute(name, new T.Float32BufferAttribute(values,size));
    geo.setIndex(indices);
    return new T.Mesh(geo,material);
  }
  return {piece, finish};
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

function makePaint(map,lamps,light,arrivalTimber,pillars,relief) {
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.anisotropy=pillars.anisotropy=relief.anisotropy=8;
  relief.wrapS=relief.wrapT=T.RepeatWrapping;
  const surveyedCamera=new T.Quaternion().setFromEuler(new T.Euler(sideEye.pitch,sideEye.yaw,0,'YXZ')).invert();
  const sideBasis=new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(surveyedCamera));
  return new T.ShaderMaterial({
    uniforms: {gateCenter:{value:new T.Vector2(arrival.x,arrival.z)},gateAxis:{value:new T.Vector2(arrival.normal.x,arrival.normal.z)},gateFilm:{value:arrivalTimber},night:light.night,paint:{value:map},pillarMap:{value:pillars},reliefMap:{value:relief},sideBasis:{value:sideBasis},sideEye:{value:new T.Vector3(sideEye.x,sideEye.y,sideEye.z)},
      localLamps:{value:lamps.slice(0,12).map(({x,z,h})=>new T.Vector3(x,h*.5,z))}}, side:T.DoubleSide,
    vertexShader:`
      attribute float kind,level,role;
      varying vec2 tex; varying vec3 n,p; varying float k,h,postId;
      void main(){tex=uv;postId=role;n=normal;p=position;k=kind;h=level;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      uniform vec2 gateCenter,gateAxis; uniform mat3 sideBasis; uniform vec3 sideEye; uniform float night; uniform sampler2D paint,gateFilm,pillarMap,reliefMap; uniform vec3 localLamps[12];
      varying vec2 tex; varying vec3 n,p; varying float k,h,postId;
      float hash(vec3 v){v=fract(v*.3183099+vec3(.1,.2,.3));v*=17.;return fract(v.x*v.y*v.z*(v.x+v.y+v.z));}
      float noise3(vec3 v){
        vec3 a=floor(v),f=fract(v);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(a),hash(a+vec3(1,0,0)),f.x),mix(hash(a+vec3(0,1,0)),hash(a+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(a+vec3(0,0,1)),hash(a+vec3(1,0,1)),f.x),mix(hash(a+vec3(0,1,1)),hash(a+vec3(1)),f.x),f.y),f.z);
      }
      vec3 samplePillar(float slot,float crossPos,float row){
        vec2 cell=vec2(mod(slot,3.),1.-floor(slot/3.));
        return texture2D(pillarMap,(cell+clamp(vec2(crossPos,1.-row),.006,.994))/vec2(3.,2.)).rgb;
      }
      void main(){
        vec3 normalDir=normalize(n);
        vec2 coord=tex*vec2(1.1,1.7)+vec2(.1,.23);
        vec3 wood=texture2D(paint,coord).rgb;
        float grain=(wood.r-.64)*.44+(noise3(p*vec3(3.,.7,3.))-.5)*.08;
        float leftLight=1.-smoothstep(-4.,2.,p.x);
        float distant=smoothstep(11.,24.,-p.z)*leftLight;
        vec3 source=normalize(vec3(-.90,.31,mix(-.46,.62,leftLight)));
        float sun=max(0.,dot(normalDir,source));
        float sky=normalDir.y*.5+.5;
        vec3 shaded=mix(vec3(.202,.046,.064),vec3(.373,.075,.109),leftLight);
        shaded+=distant*vec3(.088,.060,.083);
        vec3 lit=vec3(.86,.334,.294)+distant*vec3(.07,.11,.12);
        float light=pow(sun,.90);
        vec3 finish=mix(shaded,lit,light)+sky*vec3(.065,.032,.044)+grain*vec3(1.,.57,.48);
        vec3 viewDir=normalize(cameraPosition-p);
        float sheen=pow(max(dot(normalDir,normalize(viewDir+source)),0.),19.);
        finish+=sheen*vec3(.11,.082,.084)*(1.-smoothstep(.93,1.,h)*.3);
        if(h>1.01){
          float weather=noise3(p*vec3(.87,2.,1.21))-.5;
          finish*=vec3(.88,.84,.89)+weather*.14+grain*.62;
          finish=mix(finish,vec3(.57,.34,.42),distant*.18);
        }
        if(k>0.5&&k<1.5)finish*=vec3(.64,.67,.78);
        if(k>1.5)finish*=vec3(.81,.77,.81);
        if(h<1.01){
          float broad=noise3(p*4.4), grit=noise3(p*151.);
          float breakLine=.157+(broad-.5)*.006+(grit-.5)*.003;
          float foot=1.-smoothstep(breakLine-.004,breakLine+.004,h);
          float fleck=smoothstep(.55,.83,grit*.74+broad*.26);
          vec3 tar=mix(vec3(.163,.068,.106),vec3(.36,.188,.22),sun)+(.20*fleck+grain*.8+(broad-.5)*.12)*vec3(.68,.53,.58);
          tar+=leftLight*(.075*sun+.085*distant)*vec3(1.,.71,.90);
          finish=mix(finish,tar,foot*.85);
          finish+=vec3(.12,.095,.097)*fleck*(1.-smoothstep(.15,.3,h));
        }
        vec2 across=vec2(-gateAxis.y,gateAxis.x);
        vec2 local=p.xz-gateCenter;
        float along=dot(local,across);
        if(postId>.5 && abs(normalDir.y)<.16){
          // Project two surveyed strips around the true surface normal. The UVs
          // stay bound to the timber while the viewer flies around the pillar.
          vec2 sideView=normalize(sideEye.xz-p.xz);
          float sx=.5+.491*dot(normalDir.xz,vec2(sideView.y,-sideView.x));
          vec3 q=sideBasis*(p-sideEye);
          float row=1.-h;
          if(postId>4.5)row=clamp((270.-663.08*q.y/max(.1,-q.z))/386.,0.,1.);
          float sideSlot=postId>4.5?5.:postId>2.5?4.:postId>1.5?3.:2.;
          vec3 sideWood=samplePillar(sideSlot,sx,row);
          float sideFace=smoothstep(-.23,.31,dot(sideView,normalDir.xz));
          finish=mix(finish,sideWood,sideFace*.96);
          if(postId<4.5){
            float frontX=.5+.495*dot(normalDir.xz,across);
            float frontFace=smoothstep(-.16,.37,-dot(normalDir.xz,gateAxis));
            float frontView=smoothstep(.69,.95,dot(normalize(p.xz-cameraPosition.xz),gateAxis));
            float mainHeight=clamp(p.y/6.25,0.,1.);
            vec3 film=samplePillar(step(0.,along),frontX,1.-mainHeight);
            finish=mix(finish,film,frontFace*frontView*.97);
          }
          vec2 fibreUV=vec2(tex.x*(postId>4.5?10.:4.25)+postId*.314,p.y*1.9+.19*postId);
          vec3 relief=texture2D(reliefMap,fibreUV).rgb;
          vec3 broad=texture2D(reliefMap,fibreUV*.31+vec2(.43,.12)).rgb;
          float pores=relief.b-.52, figure=broad.b-.52;
          float damp=1.-smoothstep(.121,.188,h);
          vec3 tangent=normalize(vec3(normalDir.z,0.,-normalDir.x));
          vec3 micro=normalize(normalDir+tangent*(relief.r-.5)*.69+vec3(0.,1.,0.)*(relief.g-.5)*.42);
          float varnish=pow(max(dot(micro,normalize(source+viewDir)),0.),22.);
          finish*=1.+pores*(.37+.23*damp)+figure*.23;
          finish+=vec3(.034,.021,.019)*varnish*(.52+relief.b);
        }else if(postId<-.5){
          float roof=step(6.1,p.y);
          float arch=pow(min(1.,abs(along-.095)/5.265),3.2);
          float beamV=roof>.5?clamp((p.y-6.25-.194*arch)/1.20,0.,1.):clamp((p.y-4.614)/.706,0.,1.);
          float beamU=clamp(along/(roof>.5?10.53:8.426)+.5,.0,1.);
          vec2 atlas=vec2((roof+.012+.976*beamU)*.5,.010+.477*beamV);
          vec3 film=texture2D(gateFilm,atlas).rgb;
          vec3 sideFilm=texture2D(gateFilm,atlas+vec2(0.,.5)).rgb;
          float frontView=smoothstep(.65,.93,dot(normalize(p.xz-cameraPosition.xz),gateAxis));
          float face=abs(dot(normalDir.xz,gateAxis));
          float occlusion=.93+.07*smoothstep(.12,.60,abs(abs(along)-2.38));
          vec3 tint=mix(sideFilm,film,frontView)*occlusion;
          tint*=.84+.16*max(normalDir.y,face);
          if(k>.5&&k<1.5)tint*=.77;
          finish=mix(finish,tint,.60+.35*face);
        }
        float lamplight=0.;
        for(int i=0;i<12;i++){
          vec3 delta=localLamps[i]-p;
          float d2=max(dot(delta,delta),.12);
          lamplight+=max(0.,dot(normalDir,delta)*inversesqrt(d2))*(1.-smoothstep(2.,22.,d2))/(1.+d2);
        }
        finish+=vec3(.32,.17,.07)*min(.65,lamplight);
        float mist=smoothstep(20.,185.,distance(cameraPosition.xz,p.xz));
        finish=mix(finish,vec3(.55,.39,.48),mist*.65);
        finish=mix(finish,finish*vec3(.41,.43,.60)+vec3(.007,.010,.018)+lamplight*vec3(.14,.07,.035),night);
        gl_FragColor=vec4(pow(max(finish,vec3(0.)),vec3(2.2)),1.);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createGates(paint,lamps,light,arrivalTimber,pillars,relief) {
  const batch=timberBatch();
  function gate(a,b,height,style='curved',thickness=1) {
    const span=Math.hypot(b.x-a.x,b.z-a.z);
    const rot=-Math.atan2(b.z-a.z,b.x-a.x);
    const radius=height*.044*thickness;
    const center=new T.Vector3((a.x+b.x)/2,0,(a.z+b.z)/2);
    const gateTransform=new T.Matrix4().compose(center,spin.setFromAxisAngle(up,rot),new T.Vector3(1,1,1));
    function part(geometry,x,y,z,sx,sy,sz,kind=0,post=false,slopeY=0,slopeZ=0) {
      transform.makeScale(sx,sy,sz);
      transform.elements[4]=slopeY*sy;transform.elements[8]=slopeZ*sz;
      transform.setPosition(x,y,z).premultiply(gateTransform);
      batch.piece(geometry,transform,kind,post);
    }
    const capped=style==='capped', foreground=style==='foreground', portal=style==='arrival';
    for (const x of [-span/2,span/2]) {
      const rake=portal?-x*.0877/height:0;
      const columnX=y=>x+rake*y;
      part(cylinder,columnX(height/2),height/2,0,radius,height,radius,0,foreground?5:portal?(x<0?1:2):3,rake);
      part(cylinder,columnX(height),height-.065,0,radius*1.16,.14,radius*1.16,2);
      part(cylinder,columnX(height-.18),height-.18,0,radius*1.07,.07,radius*1.07,0);
      if(portal){
        const halfDepth=1.654,auxHeight=height*.6507,auxRadius=radius*.72;
        const splay=-x*.058;
        for(const z of [-halfDepth,halfDepth]){
          const offset=splay*z;
          part(cylinder,columnX(auxHeight/2)+offset,auxHeight/2,z,auxRadius,auxHeight,auxRadius,0,4,rake);
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
        }
      }
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
        if(portal)part(cube,x*.923,height*.88,0,radius*2.16,height*.019,radius*1.52,0);
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
  return batch.finish(makePaint(paint,lamps,light,arrivalTimber,pillars,relief));
}
