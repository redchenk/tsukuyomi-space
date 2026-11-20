import * as T from 'three';
import {arrival} from './landmarks.js';

const screenVertex=`
varying vec2 tex;
void main(){tex=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}
`;
function pass(geometry,uniforms,fragmentShader){
  const scene=new T.Scene();
  const material=new T.ShaderMaterial({uniforms,vertexShader:screenVertex,fragmentShader,depthTest:false,depthWrite:false});
  const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  return scene;
}

export function createFinish(renderer,camera=null){
  const geo=new T.PlaneGeometry(2,2),cam=new T.Camera();
  const hdr=renderer.extensions.has('EXT_color_buffer_float');
  function target(){return new T.WebGLRenderTarget(1,1,{
    type:hdr?T.HalfFloatType:T.UnsignedByteType,colorSpace:hdr?T.LinearSRGBColorSpace:T.SRGBColorSpace,
    minFilter:T.LinearFilter,magFilter:T.LinearFilter});}
  const frame=target(),haze=target(),blur=target();
  haze.depthBuffer=blur.depthBuffer=false;
  frame.samples=Math.min(renderer.capabilities.maxSamples,4);
  if(camera)frame.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  const focusPoint=new T.Vector3(arrival.x,arrival.height*.57,arrival.z);
  const eyeSpace=new T.Vector3();
  const downU={source:{value:frame.texture},footprint:{value:new T.Vector2()}};
  const downPass=pass(geo,downU,`
    varying vec2 tex;uniform sampler2D source;uniform vec2 footprint;
    vec3 highlight(vec2 uv){vec3 c=texture2D(source,uv).rgb;return c*smoothstep(.44,.91,max(c.r,max(c.g,c.b)));}
    void main(){vec3 sum=vec3(0.);
      for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)sum+=highlight(tex+vec2(float(x),float(y))*footprint);
      gl_FragColor=vec4(sum/9.,1.);}`);
  const blurU={source:{value:frame.texture},stepUV:{value:new T.Vector2()}};
  const blurPass=pass(geo,blurU,`
    varying vec2 tex;uniform sampler2D source;uniform vec2 stepUV;
    vec3 readLight(vec2 uv){return texture2D(source,uv).rgb;}
    void main(){vec3 glow=readLight(tex)*.227027;
      glow+=(readLight(tex+stepUV*1.3846)+readLight(tex-stepUV*1.3846))*.316216;
      glow+=(readLight(tex+stepUV*3.2308)+readLight(tex-stepUV*3.2308))*.07027;
      gl_FragColor=vec4(glow,1.);}`);
  const finishU={source:{value:frame.texture},bloom:{value:haze.texture},
    waterPlane:{value:new T.Vector4()},sceneDepth:{value:frame.depthTexture},look:{value:0},focusDistance:{value:15},planes:{value:new T.Vector2()},
    flash:{value:0},glow:{value:.2},splashAge:{value:-1},aspect:{value:16/9}};
  const final=pass(geo,finishU,`
    ${camera?'#define FILM_LENS':''}
    varying vec2 tex;
    uniform sampler2D source,bloom;
    uniform float flash,glow,splashAge,aspect;
    #ifdef FILM_LENS
    uniform sampler2D sceneDepth;
    uniform float look,focusDistance;
    uniform vec2 planes;uniform vec4 waterPlane;
    float inverseDistance(vec2 uv){
      float invZ=mix(1./planes.x,1./planes.y,texture2D(sceneDepth,uv).r);
      float waterInvZ=dot(vec3(uv*2.-1.,1.),waterPlane.xyz);
      // A reflection has virtual depth beyond the water surface. Preserve its
      // image while the foreground geometry receives its true circle of confusion.
      if(waterInvZ>0. && abs(invZ-waterInvZ)<.0007+waterInvZ*waterPlane.w)return 0.;
      return invZ;
    }
    vec3 focusLens(vec2 uv,vec3 sharp){
      float invZ=inverseDistance(uv);
      // Circle of confusion as a fraction of sensor height. The water and
      // sky carry virtual images at distance; close physical lamps carry depth.
      float radius=min(.007, .014*abs(invZ-1./focusDistance))*look;
      vec3 sum=sharp;
      float count=1.;
      for(int i=0;i<10;i++){
        float j=float(i)+.5;
        vec2 offset=vec2(cos(j*2.39996)/aspect,sin(j*2.39996))*sqrt(j/10.)*radius;
        vec2 tap=clamp(uv+offset,0.,1.);
        // Reject foreground leaking into the sky at an in-focus silhouette.
        float weight=1.-smoothstep(.04,.31,inverseDistance(tap)-invZ);
        sum+=texture2D(source,tap).rgb*weight;count+=weight;
      }
      return sum/count;
    }
    vec3 printGrade(vec3 linearColor){
      vec3 rgb=pow(max(linearColor,vec3(0.)),vec3(1./2.2));
      float y=dot(rgb,vec3(.2126,.7152,.0722));
      float shadow=1.-smoothstep(.08,.58,y),sun=smoothstep(.49,.91,y);
      // Dye density in the mids, cool fill in the toe, a warm shoulder that
      // compresses emitting paper and cloud rims before reaching display white.
      float mid=clamp(y,0.,1.);mid+=.30*mid*(1.-mid)*(2.*mid-1.);
      vec3 tint=(rgb-y)*mix(1.035,.86,sun);
      vec3 graded=mid+tint+shadow*vec3(-.014,-.004,.022)+sun*vec3(.038,.011,-.024);
      graded=max(graded,0.);
      vec3 over=max(graded-.78,0.);
      graded=min(graded,.78)+.255*(1.-exp(-over/.255));
      vec2 pos=(tex-.5)*vec2(1.08,.91);
      graded*=1.-.065*smoothstep(.08,.54,dot(pos,pos));
      return pow(graded,vec3(2.2));
    }
    #endif
    void main(){
      // The clearing sheet displaces the image locally and preserves its scale.
      float age=max(0.,splashAge);
      vec2 ripple=vec2(sin(tex.y*43.+sin(tex.x*17.)+age*19.),cos(tex.x*32.-age*17.));
      vec2 wetUV=tex+ripple*.0016*flash;
      vec2 aberration=vec2(.0022*flash,0.);
      float shutter=.0145*exp(-pow((splashAge-.45)/.22,2.));
      vec2 v=vec2(.12,1.)*shutter;
      vec3 c=texture2D(source,wetUV).rgb*.30;
      c+=(texture2D(source,wetUV-v*.48).rgb+texture2D(source,wetUV+v*.48).rgb)*.225;
      c+=(texture2D(source,wetUV-v).rgb+texture2D(source,wetUV+v).rgb)*.125;
      c.r=mix(c.r,texture2D(source,wetUV+aberration).r,flash*.18);
      c.b=mix(c.b,texture2D(source,wetUV-aberration).b,flash*.18);
      #ifdef FILM_LENS
      if(look>.001){
        vec3 sharp=texture2D(source,wetUV).rgb;
        c+=focusLens(wetUV,sharp)-sharp;
      }
      #endif
      c+=texture2D(bloom,tex).rgb*glow;
      #ifdef FILM_LENS
      if(look>.001){
        vec3 warmGlow=texture2D(bloom,tex).rgb;
        c+=look*vec3(.13,.052,.022)*warmGlow;
        c=mix(c,printGrade(c),look);
      }
      #endif
      c*=1.+flash*2.8;
      c+=vec3(.55,.22,.43)*flash*(1.-flash);
      c=mix(c,vec3(1.,.982,.989),smoothstep(.64,1.,flash));
      gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }`);
  function renderTo(scene,target){renderer.setRenderTarget(target);renderer.render(scene,cam);}
  return {
    frame,
    dispose(){
      for(const target of [frame,haze,blur])target.dispose();
      for(const scene of [downPass,blurPass,final])scene.children[0].material.dispose();
      geo.dispose();
    },
    resize(w,h){
      finishU.aspect.value=w/h;
      const ratio=renderer.getPixelRatio();frame.setSize(Math.round(w*ratio),Math.round(h*ratio));
      haze.setSize(Math.max(1,Math.round(w/4)),Math.max(1,Math.round(h/4)));blur.setSize(haze.width,haze.height);
      downU.footprint.value.set(.30/haze.width,.30/haze.height);
    },
    draw(flash,glow,splashAge=-1,look=0){
      renderTo(downPass,haze);
      blurU.source.value=haze.texture;blurU.stepUV.value.set(1.1/haze.width,0);renderTo(blurPass,blur);
      blurU.source.value=blur.texture;blurU.stepUV.value.set(0,1.1/haze.height);renderTo(blurPass,haze);
      finishU.look.value=look;
      if(camera&&look>0){
        const distance=Math.max(2,-eyeSpace.copy(focusPoint).applyMatrix4(camera.matrixWorldInverse).z);
        const turn=splashAge<0?1:T.MathUtils.smoothstep(splashAge,.31,1.02);
        // Focus pulls linearly in dioptres and lands on the physical torii.
        finishU.focusDistance.value=1/T.MathUtils.lerp(1/1.9,1/distance,turn);
        finishU.planes.value.set(camera.near,camera.far);
        const m=camera.matrixWorld.elements,proj=camera.projectionMatrix.elements,y=camera.position.y;
        finishU.waterPlane.value.set(-m[1]/(y*proj[0]),-m[5]/(y*proj[5]),m[9]/y,.0048/y);
      }
      finishU.flash.value=flash;finishU.glow.value=glow;finishU.splashAge.value=splashAge;renderTo(final,null);
    }
  };
}

