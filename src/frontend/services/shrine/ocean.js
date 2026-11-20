import * as T from 'three';
import {createSpray} from './spray.js';
import {sunDirection,lightShrine} from './sunset.js';
import {arrival,atGate,sideEye} from './landmarks.js';
import { frame,openingPitch } from './framing.js';

export function createOcean(renderer, camera, scene, clouds, panorama, frontClouds, sideClouds, light) {
  panorama.wrapS=T.RepeatWrapping;
  clouds.colorSpace=panorama.colorSpace=T.NoColorSpace;
  const reflection=new T.WebGLRenderTarget(1,1,{
    minFilter:T.LinearFilter,magFilter:T.LinearFilter,
    colorSpace:T.SRGBColorSpace,generateMipmaps:false,depthBuffer:true
  });
  for(const map of [clouds,panorama,frontClouds,sideClouds]){
    map.generateMipmaps=false;map.minFilter=T.LinearFilter;
  }
  const strike=atGate(-16.4);
  const spray=createSpray(light.impact);scene.add(spray);
  const mirroredCamera=new T.PerspectiveCamera();
  const flip=new T.Matrix4().makeScale(1,-1,1);
  mirroredCamera.matrixAutoUpdate=false;
  const sideBasis=new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(sideEye.pitch,sideEye.yaw,0,'YXZ'))).transpose();
  const feet=[];
  const radius=arrival.height*.044*1.06*1.055;
  for(const [post,sign] of [[arrival.a,-1],[arrival.b,1]]){
    feet.push(new T.Vector3(post.x,post.z,radius));
    for(const run of [-1.654,1.654]){
      const spread=-sign*arrival.span*.5*.058*run;
      feet.push(new T.Vector3(post.x+spread*arrival.across.x-run*arrival.normal.x,
        post.z+spread*arrival.across.z-run*arrival.normal.z,radius*.72));
    }
  }
  const uniforms={
    feet:{value:feet},depthRange:{value:new T.Vector2()},sunlightMap:{value:null},sunMatrix:{value:new T.Matrix4()},
    sunDir:{value:sunDirection},sideSky:{value:sideClouds},sideBasis:{value:sideBasis},
    gateAxis:{value:new T.Vector2(arrival.normal.x,arrival.normal.z)},
    night:light.night,trails:light.trails,impactTime:light.impact,filmLook:light.filmLook||{value:0},
    impactPoint:{value:new T.Vector2(strike.x,strike.z)},frontClouds:{value:frontClouds},
    clouds:{value:clouds}, panorama:{value:panorama}, mirrored:{value:reflection.texture},
    invProjection:{value:camera.projectionMatrixInverse},cameraWorld:{value:camera.matrixWorld},
    eye:{value:camera.position}, seconds:{value:0},
    refCS:{value:new T.Vector2(Math.cos(openingPitch),Math.sin(openingPitch))},
    refSize:{value:new T.Vector4(frame.width,frame.horizon-frame.skyTop,frame.focal,frame.horizon-(frame.skyTop+frame.height/2))},
  };
  const skyFunctions=`
      uniform sampler2D sideSky;uniform mat3 sideBasis;
      uniform sampler2D clouds,panorama,mirrored,frontClouds;
      uniform float night,trails,impactTime,filmLook; uniform vec2 impactPoint,gateAxis;
      uniform mat4 invProjection,cameraWorld;
      uniform vec2 refCS;
      uniform vec4 refSize;
      uniform vec3 eye,sunDir;
      uniform float seconds;

      float rand(vec2 p){return fract(sin(dot(p,vec2(41.7,289.1)))*4375.357);}
      // Latitude stays fixed during the celestial rotation. Varying exposure
      // along longitude makes the stars trace concentric arcs about one pole.
      vec3 stars(vec3 dir){
        vec3 axis=normalize(vec3(-.65,-.07,.72));
        vec3 a=normalize(cross(axis,vec3(0,1,0))),b=cross(axis,a);
        float lng=atan(dot(dir,b),dot(dir,a))/6.2831853+.5;
        float lat=asin(clamp(dot(dir,axis),-1.,1.))/3.14159+.5;
        vec3 total=vec3(0.);
        for(int i=0;i<2;i++){
          float j=float(i);
          vec2 grid=vec2(49.+j*17.,155.+j*54.);
          vec2 coord=vec2(lng+seconds*.00004+.009*max(0.,seconds-11.22),lat)*grid;
          vec2 id=floor(coord),local=fract(coord);
          float seed=rand(id+19.7*j),lineY=.10+.8*rand(id+4.31);
          float width=max(.028,fwidth(coord.y)*.62);
          float crossSection=exp(-pow((local.y-lineY)/width,2.));
          float u=local.x-(.13+.17*rand(id+12.));
          float extent=.010+trails*(.26+.70*rand(id+44.));
          float dx=max(max(-u,u-extent),0.);
          float along=exp(-dx*dx/.00012)*(.60+.40*smoothstep(-.05,extent,u));
          float visible=smoothstep(.58,.90,seed)*pow(.30+.70*rand(id+28.),1.7);
          total+=mix(vec3(.23,.69,.73),vec3(.76,.80,1.),rand(id+77.))*crossSection*along*visible*(.33+.51*trails);
        }
        return total;
      }
      vec3 sky(vec3 d){
        float a=atan(d.x,-d.z)/6.2831853+.5;
        float elevation=asin(clamp(d.y,0.,1.))/1.5707963;
        vec3 wide=texture2D(panorama,vec2(fract(a+.24),elevation)).rgb;
        // Blend the wrap and pole, where a cylindrical painting converges.
        float seam=abs(fract(a+.24)-.5);
        wide=mix(wide,texture2D(panorama,vec2(.002,elevation)).rgb,smoothstep(.465,.5,seam));
        wide=mix(wide,vec3(.34,.39,.61),smoothstep(.72,1.,elevation));
        float facing=refCS.y*d.y-refCS.x*d.z;
        if(facing>0.12){
          vec2 uv=vec2(.5+refSize.z*d.x/(facing*refSize.x),
            (refSize.w+refSize.z*dot(d.yz,refCS)/facing)/refSize.y);
          float blend=smoothstep(-.19,.015,uv.x)*(1.-smoothstep(.985,1.19,uv.x))*(1.-smoothstep(.98,1.28,uv.y));
          vec2 sampleUV=1.-abs(mod(uv,2.)-1.);
          sampleUV.y=pow(clamp(sampleUV.y,0.,1.),.78);
          vec3 front=texture2D(clouds,sampleUV).rgb;
          front=mix(vec3(dot(front,vec3(.27,.55,.18))),front,.89)*vec3(.994,.971,1.00);
          wide=mix(wide,front,blend);
        }
        // The frontal gate faces east. The clean sky plate is projected from
        // that reference direction while the rear view keeps its own cloud bank.
        vec2 across=vec2(-gateAxis.y,gateAxis.x);
        float ahead=dot(d.xz,gateAxis),lateral=dot(d.xz,across);
        float frontDepth=.9922*ahead+.1246*d.y;
        if(frontDepth>.16){
          vec2 uv=vec2(.5+.7427*lateral/frontDepth,(90.+713.*(.9922*d.y-.1246*ahead)/frontDepth)/355.);
          // Feather the outer sky over a wide angle. A shallow extension of
          // each bank retains cloud detail without repeating the whole plate.
          float keep=smoothstep(-.32,.025,uv.x)*(1.-smoothstep(.975,1.32,uv.x))*(1.-smoothstep(1.,1.36,uv.y));
          float edgeX=clamp(uv.x,.001,.999);
          vec2 sampleUV=vec2(edgeX-.37*(uv.x-edgeX),uv.y);
          wide=mix(wide,texture2D(frontClouds,clamp(sampleUV,.001,.999)).rgb,keep);
        }
        vec3 solar=sunDir;
        float sd=length(d-solar);
        float sunHalo=exp(-sd*sd*22.);
        wide=mix(wide,vec3(1.,.69,.38),sunHalo*.69);
        wide=mix(wide,vec3(1.,.94,.68),exp(-sd*sd*675.)*.81);
        wide=mix(wide,vec3(1.,.99,.87),1.-smoothstep(.010,.023,sd));
        vec3 sv=sideBasis*d;
        if(sv.z<-.22){
          vec2 pixel=vec2(480.,270.)+663.08*vec2(sv.x,-sv.y)/(-sv.z);
          vec2 uv=vec2(pixel.x/960.,1.-pixel.y/540.);
          vec2 edge=smoothstep(vec2(-.18),vec2(-.012),uv)*smoothstep(vec2(-.18),vec2(-.012),1.-uv);
          vec4 plate=texture2D(sideSky,clamp(1.-abs(mod(uv,2.)-1.),.001,.999));
          wide=mix(wide,plate.rgb,edge.x*edge.y*(1.-smoothstep(385.,402.,pixel.y)));
        }
        if(night>.0001){
          float l=dot(wide,vec3(.27,.60,.13));
          float cloud=smoothstep(-.065,.13,wide.r-wide.b)*(1.-smoothstep(.33,.59,d.y));
          vec3 clear=mix(vec3(.062,.121,.181),vec3(.044,.092,.150),smoothstep(.0,.86,d.y));
          vec3 cumulus=mix(vec3(.033,.057,.103),vec3(.151,.223,.331),pow(l,1.6));
          vec3 dark=mix(clear,cumulus,cloud);
          dark+=stars(vec3(ahead,d.y,lateral))*(1.-cloud)*smoothstep(.014,.14,d.y);
          wide=mix(wide,dark,night);
        }
        return wide;
      }
`;
  const {sun,illuminate,dispose:disposeLighting}=lightShrine(renderer,scene,uniforms,skyFunctions);
  const skyWater=new T.ShaderMaterial({
    depthTest:true,depthWrite:true,depthFunc:T.AlwaysDepth,uniforms,
    vertexShader:`
      varying vec2 screenUv;
      void main(){screenUv=position.xy*.5+.5;gl_Position=vec4(position.xy,1.,1.);}
    `,
    fragmentShader:`
      varying vec2 screenUv;
      ${skyFunctions}
      uniform vec3 feet[6];uniform vec2 depthRange;
      uniform highp sampler2DShadow sunlightMap;uniform mat4 sunMatrix;
      float visibilityAt(vec3 p){
        vec4 q=sunMatrix*vec4(p,1.);vec3 uv=q.xyz/q.w;
        if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 1.;
        float sum=0.;
        for(int i=0;i<8;i++){
          float a=float(i)*2.39996,r=.00065*sqrt(float(i)+.5);
          sum+=texture(sunlightMap,vec3(uv.xy+r*vec2(cos(a),sin(a)),uv.z-.00022));
        }
        return sum*.125;
      }
      float waveHeight(vec2 p){
        return .0025*sin(dot(p,vec2(1.5,.8))+seconds*.83)+.0016*sin(dot(p,vec2(-1.2,2.4))-seconds*.96);
      }
      void main(){
        vec4 projected=invProjection*vec4(screenUv*2.-1.,1.,1.);
        vec3 ray=normalize(mat3(cameraWorld)*projected.xyz);
        vec3 color;
        float sightline=210.;
        float bufferDepth=1.;
        if(ray.y>=0.){
          color=sky(ray);
        }else{
          float dist=eye.y/max(.00001,-ray.y);
          vec2 plane=eye.xz+ray.xz*dist;
          float height=waveHeight(plane)*(1.-smoothstep(24.,90.,dist));
          dist=max(0.,(eye.y-height)/max(.00001,-ray.y));
          float eyeDepth=max(depthRange.x,-normalize(projected.xyz).z*dist);
          bufferDepth=depthRange.y*(1.-depthRange.x/eyeDepth)/(depthRange.y-depthRange.x);
          sightline=min(sightline,dist);
          vec2 surface=eye.xz+ray.xz*dist;
          float fade=1.-smoothstep(18.,145.,dist);
          float t=seconds*.60;
          float ripple=(sin(dot(surface,vec2(7.2,11.3))+t)*.42+
                        sin(dot(surface,vec2(-9.4,17.1))-t*1.37)*.24+
                        sin(dot(surface,vec2(2.2,28.1))+t*.7)*.14);
          ripple*=fade*smoothstep(.001,.022,-ray.y);
          float ring=0.;
          float foam=0.;
          if(impactTime>=0. && impactTime<4.2){
            vec2 local=surface-impactPoint;
            float radius=length(local);
            float wavelet=.12*sin(surface.x*4.2+surface.y*1.3)+.17*cos(surface.y*3.1-surface.x)
                      +.055*sin(13.*local.y+2.2*sin(8.7*local.x));
            float x=radius-impactTime*3.1+wavelet;
            ring=sin(x*15.)*exp(-x*x*2.8)*exp(-impactTime*1.12);
            float train=radius+wavelet-impactTime*2.8;
            float crest=sin(train*16.+1.7*sin(local.x*5.1+local.y*8.4));
            foam=pow(max(0.,crest),3.)*exp(-pow((train+1.6)/2.,2.))*exp(-impactTime*.62);
            ripple+=ring*2.8;
          }
          vec2 offset=vec2(ripple*.0010,ripple*.0019);
          float grazing=1.-smoothstep(.035,.26,eye.y);
          float elevation=asin(clamp(-ray.y,0.,1.)),az=atan(ray.x,-ray.z);
          float bands=sin(elevation*435.+1.7*sin(elevation*197.+az*2.7+t*.91)+t*.83);
          float chop=sin(elevation*184.+az*4.3-t*1.11);
          float swell=(bands+.66*chop)*grazing*smoothstep(.001,.045,elevation);
          offset+=vec2(.00155*swell,.00028*swell);
          if(impactTime>=0.){
            float turbulence=exp(-impactTime*2.35)*smoothstep(.008,.13,elevation);
            offset+=turbulence*vec2(.031*sin(26.*elevation+3.2*sin(az*8.+seconds*6.)),
              .022*sin(61.*elevation+az*3.-seconds*4.));
          }
          float shore=8.;
          for(int i=0;i<6;i++)shore=min(shore,length(surface-feet[i].xy)-feet[i].z);
          float meniscus=exp(-abs(shore)*29.);
          float contactWave=exp(-max(0.,shore)*3.3)*sin(shore*97.-seconds*3.1);
          offset+=vec2(.0007,.0016)*contactWave;
          vec3 bounce=normalize(vec3(ray.x+offset.x,-ray.y+offset.y,ray.z));
          vec3 reflectedSky=sky(bounce);
          float depth=smoothstep(.0,.235,-ray.y);
          color=mix(reflectedSky,mix(vec3(.228,.215,.318),vec3(.012,.037,.064),night),.16+.64*depth);
          float arrivalSea=smoothstep(.20,.81,dot(normalize(ray.xz),gateAxis))*(1.-night);
          float current=sin(surface.y*2.46+sin(surface.x*.88)+.98*sin(surface.y*.78))+sin(surface.x*1.41+surface.y*.54+t*.3);
          float glint=pow(max(0.,current*.5),13.)*fade;
          color=mix(color,vec3(.563,.367,.518)+vec3(.10,.085,.11)*glint,arrivalSea*(.29+.35*depth));
          color+=arrivalSea*glint*vec3(.20,.14,.18);
          if(filmLook>.001){
            // Colour comes from the actual sky in the reflected direction.
            // The small ridges break the brightest apricot cloud into moving glints.
            float warmBank=smoothstep(.07,.32,reflectedSky.r-reflectedSky.b);
            vec3 skyOnWater=reflectedSky*vec3(.85,.78,.89)+vec3(.028,.008,.032);
            float breeze=.5+.5*sin(surface.y*7.4+1.9*sin(surface.x*1.61+t*.48)-t*1.3);
            color=mix(color,skyOnWater,filmLook*arrivalSea*(.20+.19*depth));
            color+=filmLook*warmBank*arrivalSea*pow(breeze,12.)*fade*vec3(.044,.025,.012);
          }
          color+=vec3(.30,.18,.22)*max(0.,ring)+foam*vec3(.23,.18,.21);
          color*=1.-.15*depth;
          float sideSea=grazing*(1.-smoothstep(.5,1.,abs(az)))*(1.-night);
          // Open water has its own projected wave field at every angle, including
          // the side shot. Broader swells carry the clouds, capillaries break
          // up the long red reflection near a post without losing its contact.
          float gust=.68+.32*sin(surface.x*.57+surface.y*.29+t*.42);
          float swellX=.009*cos(dot(surface,vec2(1.35,.73))+t*.78);
          float swellZ=.006*cos(dot(surface,vec2(-1.61,2.67))-t*1.08);
          vec3 normalWater=normalize(vec3(-swellX*gust,1.,-swellZ*gust));
          vec3 reflectedDir=reflect(ray,normalWater);
          float fresnel=.026+.974*pow(1.-clamp(dot(-ray,normalWater),0.,1.),5.);
          vec3 depthColour=mix(vec3(.252,.174,.244),vec3(.026,.037,.072),night);
          vec3 environment=sky(normalize(mix(bounce,reflectedDir,.44*fade)));
          vec3 tidal=mix(depthColour,environment,.25+.70*fresnel);
          color=mix(color,tidal,.54*max(.28,fade));
          float glitter=pow(max(0.,dot(reflectedDir,sunDir)),155.);
          color+=vec3(.30,.18,.082)*glitter*(1.-night);
          offset+=vec2(swellX*.25,swellZ*.23)*fade*gust;
          float shadow=1.-visibilityAt(vec3(surface.x,height+.006,surface.y));
          color*=1.-shadow*(.19+.10*(1.-fresnel))*(1.-.70*night);
          vec4 object=texture2D(mirrored,clamp(vec2(screenUv.x+offset.x,1.-screenUv.y-offset.y),vec2(.0005),vec2(.9995)));
          vec3 objectColor=pow(max(object.rgb/max(object.a,.0001),vec3(0.)),vec3(1./2.2));
          vec3 wet=mix(objectColor,mix(vec3(.32,.224,.32),vec3(.035,.052,.076),night),.13+.24*depth);
          wet=mix(wet,color,sideSea*(.08+.13*depth));
          wet=mix(wet,color,arrivalSea*(.22+.40*depth)*(1.-.37*filmLook));
          float paper=smoothstep(.70,.91,min(objectColor.r,objectColor.g))*smoothstep(.39,.64,objectColor.b);
          wet=mix(wet,min(vec3(1.),objectColor*vec3(1.055,1.080,1.065)),paper*.99);
          wet=mix(wet,objectColor,.60*exp(-max(0.,shore)*2.8));
          color=mix(color,wet,clamp(object.a,0.,1.));
          color*=1.-.23*meniscus;
          color+=vec3(.046,.036,.031)*max(0.,contactWave)*(1.-night);
          color+=ripple*.008*depth;
        }
        // Integrate a low, patchy layer over the actual ray segment. Flying
        // above it opens the view, while a grazing ray crosses several banks.
        if(abs(ray.y)<.18){
          float opticalDepth=0.;
          for(int i=0;i<5;i++){
            float distanceAlong=(float(i)+.5)*sightline/5.;
            vec3 samplePos=eye+ray*distanceAlong;
            float layer=exp(-max(0.,samplePos.y)*.74);
            float drift=.55+.24*sin(samplePos.x*.053+seconds*.043)
                             +.20*cos(samplePos.z*.084-samplePos.x*.019-seconds*.061);
            opticalDepth+=layer*drift*sightline*.00019;
          }
          float haze=(1.-exp(-opticalDepth))*(1.-smoothstep(.08,.18,abs(ray.y)));
          color=mix(color,mix(vec3(.84,.635,.657),vec3(.102,.145,.202),night),haze);
        }
        gl_FragDepth=clamp(bufferDepth,0.,1.);
        gl_FragColor=vec4(pow(max(color,vec3(.0)),vec3(2.2)),1.);
        #include <colorspace_fragment>
      }`,
  });
  const backdrop=new T.Scene(), flatCamera=new T.Camera();
  const screen=new T.Mesh(new T.PlaneGeometry(2,2),skyWater);
  screen.frustumCulled=false;backdrop.add(screen);
  function resize(width,height){
    const ratio=Math.min(renderer.getPixelRatio(),1.35);
    reflection.setSize(Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio)));
  }
  function draw(time,target=null) {
    uniforms.seconds.value=time;uniforms.depthRange.value.set(camera.near,camera.far);
    camera.updateMatrixWorld();
    spray.visible=light.impact.value>=0 && light.impact.value<1.85;
    illuminate(light.night.value);
    // Reflect the eye and its local up axis. Geometry, normals, environment
    // light and the fixed sun shadow map stay in their true world positions.
    mirroredCamera.projectionMatrix.copy(camera.projectionMatrix);
    mirroredCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirroredCamera.near=camera.near;mirroredCamera.far=camera.far;
    mirroredCamera.matrix.copy(flip).multiply(camera.matrixWorld).multiply(flip);
    mirroredCamera.matrixWorldNeedsUpdate=true;mirroredCamera.updateMatrixWorld(true);
    renderer.setRenderTarget(reflection);renderer.clear(true,true,false);renderer.render(scene,mirroredCamera);
    uniforms.sunlightMap.value=sun.shadow.map.depthTexture;
    uniforms.sunMatrix.value=sun.shadow.matrix;
    renderer.setRenderTarget(target);renderer.clear(true,true,false);
    renderer.render(backdrop,flatCamera);renderer.render(scene,camera);
  }
  return {resize,draw,dispose(){reflection.dispose();screen.geometry.dispose();skyWater.dispose();disposeLighting();}};
}
