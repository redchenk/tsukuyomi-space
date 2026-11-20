import * as T from 'three';

// All coordinates belong to a particular cut of timber. End grain is the
// cross-section of the same growth rings that run along its long faces.
const surfaceGLSL=`
  varying vec3 stockP,timberWorld,stockHalf;
  varying vec4 stockInfo;
  varying float shaftRadius;
  uniform sampler2D lacquerScan, fibreNormal,coatMap;
  float woodHash(vec3 p){
    p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
  }
  float woodNoise(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(woodHash(i),woodHash(i+vec3(1,0,0)),f.x),
                   mix(woodHash(i+vec3(0,1,0)),woodHash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(woodHash(i+vec3(0,0,1)),woodHash(i+vec3(1,0,1)),f.x),
                   mix(woodHash(i+vec3(0,1,1)),woodHash(i+1.),f.x),f.y),f.z);
  }
  struct Coating{vec3 albedo;float rough;float coat;float coatRough;vec3 micro;vec2 uv;};
  Coating coatSurface(){
    Coating m;
    float seed=stockInfo.z;
    float column=step(.001,stockInfo.y);
    vec3 p=stockP+vec3(seed*.095,seed*4.72,-seed*.128);
    float figure=woodNoise(p*vec3(9.,.9,9.)+seed*15.);
    float curl=woodNoise(p*vec3(31.,1.8,31.));
    vec2 heart=p.xz+vec2(.038*sin(2.1*p.y+seed*6.),.027*sin(1.4*p.y))+.009*(figure-.5);
    float ring=length(heart*vec2(.94,1.08))*165.+figure*1.7;
    float ringAA=1.-smoothstep(.06,.65,fwidth(ring));
    float latewood=pow(.5+.5*cos(ring*6.28318),4.)*ringAA;
    vec3 localFace=normalize(cross(dFdx(stockP),dFdy(stockP))+vec3(1e-14));
    bool endFace=abs(localFace.y)>.72;
    vec2 sideUV=abs(localFace.x)>.76?vec2(p.z,p.y):vec2(p.x,p.y);
    vec2 panelUV=vec2(sideUV.x/.84,sideUV.y/1.83);
    if(column>.5)panelUV.x=stockInfo.x*max(1.,floor(6.28318*shaftRadius/.84+.5));
    if(endFace)panelUV=p.xz/vec2(.84,1.83);
    panelUV+=vec2(seed*2.81,seed*.93);
    vec3 scan=texture2D(lacquerScan,panelUV*.57).rgb;
    vec3 coating=texture2D(coatMap,panelUV).rgb;
    vec3 meso=texture2D(coatMap,panelUV*.29+vec2(.31,.82)).rgb;
    float patina=clamp(.61*meso.b+.39*coating.b,0.,1.);
    vec3 gap=max(stockHalf-abs(stockP),0.);
    float edgeDist=max(min(gap.x,gap.y),min(max(gap.x,gap.y),gap.z));
    float edge=(1.-smoothstep(.008,.039,edgeDist))*(1.-column);
    float ground=timberWorld.y;
    float shoeHeight=stockInfo.y*.145+.045*(meso.r-.5)+.027*(coating.b-.4);
    float tar=column*(1.-smoothstep(-.008,.008,ground-shoeHeight));
    float wet=1.-smoothstep(.034,.36,ground+.16*(patina-.5));
    float erosion=clamp(.20+.43*edge+.55*tar+.24*patina,0.,1.);
    float chip=smoothstep(.17,.85,coating.g+erosion*.52)*erosion;
    float grain=coating.r-.52;
    float tone=(scan.r-.66)*.31+grain*.20+(meso.r-.5)*.13+(figure-.5)*.075;
    float endRings=endFace?latewood*.092:latewood*.008;
    vec3 red=mix(vec3(.59,.144,.083),vec3(.70,.203,.106),seed)+vec3(1.,.49,.29)*tone-endRings;
    red*=1.-.14*patina;
    if(stockInfo.w>1.5)red*=vec3(.86,.84,.90);
    if(stockInfo.w>.5 && stockInfo.w<1.5)red*=vec3(.54,.57,.64);
    vec3 primer=vec3(.54,.285,.150)+vec3(.28,.16,.082)*grain-endRings;
    vec3 shoe=mix(vec3(.165,.092,.096),vec3(.355,.228,.171),patina)+grain*.078;
    vec3 pigment=mix(red,shoe,tar);
    pigment=mix(pigment,primer,chip*(.66+.28*edge));
    if(stockInfo.w>2.5)pigment=mix(primer,red,.26);
    // A narrow intermittent salt line follows the water itself rather than
    // following the upper edge of the traditional dark protective coating.
    float salt=exp(-abs(ground-.19-.105*(meso.r-.5))/.046)*smoothstep(.28,.74,coating.b);
    pigment=mix(pigment,vec3(.51,.383,.324)+grain*.14,column*salt*.67);
    pigment*=1.-.17*wet;
    m.albedo=pow(max(pigment,vec3(.012)),vec3(2.2));
    m.rough=mix(.40+.16*patina+.16*chip+.085*tar,.21+.12*patina,wet);
    m.coat=mix(.31*(1.-.88*chip)*(1.-.62*patina),.74,wet);
    m.coatRough=mix(.275+.19*patina+.08*chip,.125+.10*patina,wet);
    m.micro=texture2D(fibreNormal,panelUV).rgb*2.-1.;
    m.micro.xy*=mix(.53,.88,chip+tar*.19)*(1.-.43*wet);
    m.uv=panelUV;
    return m;
  }
  vec3 timberBump(vec3 n,vec2 uv,vec3 micro){
    vec3 px=dFdx(-vViewPosition),py=dFdy(-vViewPosition);
    vec2 ux=dFdx(uv),uy=dFdy(uv);
    float hand=sign(ux.x*uy.y-ux.y*uy.x);
    vec3 tangent=px*uy.y-py*ux.y;
    tangent-=n*dot(n,tangent);
    tangent=tangent*inversesqrt(max(dot(tangent,tangent),1e-17))*hand;
    vec3 bitangent=cross(n,tangent)*hand;
    return normalize(tangent*micro.x+bitangent*micro.y+n*max(.22,micro.z));
  }
`;

export function lacqueredTimber(lacquer,normalMap,coating){
  for(const tex of [lacquer,normalMap,coating]){
    tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=8;
    tex.colorSpace=T.NoColorSpace;
  }
  const material=new T.MeshPhysicalMaterial({
    color:0xffffff,metalness:0,roughness:.48,ior:1.47,clearcoat:.45,
    clearcoatRoughness:.30,envMapIntensity:1,side:T.FrontSide
  });
  material.name='Weathered vermilion lacquer over cedar';
  material.onBeforeCompile=shader=>{
    shader.uniforms.lacquerScan={value:lacquer};shader.uniforms.fibreNormal={value:normalMap};
    shader.uniforms.coatMap={value:coating};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec3 woodCoord;attribute vec4 stock;attribute float logRadius;attribute vec3 woodHalf;
      varying vec3 stockP,timberWorld,stockHalf;varying vec4 stockInfo;varying float shaftRadius;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        stockHalf=woodHalf;stockP=woodCoord;stockInfo=stock;shaftRadius=logRadius;timberWorld=position;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+surfaceGLSL)
      .replace('#include <color_fragment>',`#include <color_fragment>
        Coating surface=coatSurface();diffuseColor.rgb=surface.albedo;`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=surface.rough;`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        normal=timberBump(normal,surface.uv,surface.micro);`)
      .replace('#include <clearcoat_normal_fragment_maps>',`#include <clearcoat_normal_fragment_maps>
        clearcoatNormal=normalize(mix(clearcoatNormal,normal,.55));`)
      .replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
        material.clearcoat=surface.coat;
        material.clearcoatRoughness=clamp(surface.coatRough+geometryRoughness,.07,1.);`);
  };
  return material;
}
