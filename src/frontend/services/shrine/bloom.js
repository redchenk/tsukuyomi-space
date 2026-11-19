import * as T from 'three';

// The entry film adds a quarter-size bloom to lantern paper and lacquer. Use
// the same linear-light threshold, blur weights and night exposure in the live shot.
export function createBloom(renderer) {
  const hdr = renderer.extensions.has('EXT_color_buffer_float');
  const options = { type: hdr ? T.HalfFloatType : T.UnsignedByteType,
    colorSpace: hdr ? T.LinearSRGBColorSpace : T.SRGBColorSpace };
  const frame = new T.WebGLRenderTarget(1, 1, options);
  frame.samples = Math.min(renderer.capabilities.maxSamples, 2);
  const glow = new T.WebGLRenderTarget(1, 1, { ...options, depthBuffer: false });
  const blur = glow.clone();
  const geometry = new T.PlaneGeometry(2, 2);
  const camera = new T.Camera();
  function pass(uniforms, fragmentShader) {
    const material = new T.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 v; void main(){v=uv; gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: 'varying vec2 v;\n' + fragmentShader });
    const mesh = new T.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  }
  const step = new T.Vector2();
  const pixel = new T.Vector2();
  const down = pass({ source: { value: frame.texture }, pixel: { value: pixel } }, `
    uniform sampler2D source; uniform vec2 pixel;
    void main(){ vec3 sum=vec3(0.);
      for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec3 c=texture2D(source,v+vec2(float(x),float(y))*pixel).rgb;
        sum+=c*smoothstep(.44,.91,max(c.r,max(c.g,c.b))); }
      gl_FragColor=vec4(sum/9.,1.); }`);
  const gaussian = pass({ source: { value: glow.texture }, stepUV: { value: step } }, `
    uniform sampler2D source; uniform vec2 stepUV;
    void main(){ vec3 c=texture2D(source,v).rgb*.227027;
      c+=(texture2D(source,v+stepUV*1.3846).rgb+texture2D(source,v-stepUV*1.3846).rgb)*.316216;
      c+=(texture2D(source,v+stepUV*3.2308).rgb+texture2D(source,v-stepUV*3.2308).rgb)*.07027;
      gl_FragColor=vec4(c,1.); }`);
  const output = pass({ source: { value: frame.texture }, bloom: { value: glow.texture }, intensity: { value: .12 } }, `
    uniform sampler2D source,bloom; uniform float intensity;
    void main(){ gl_FragColor=vec4(texture2D(source,v).rgb+texture2D(bloom,v).rgb*intensity,1.);
      #include <colorspace_fragment>
    }`);

  function render(mesh, target) {
    renderer.setRenderTarget(target);
    renderer.render(mesh, camera);
  }
  return {
    frame,
    resize(w, h) {
      frame.setSize(w, h);
      glow.setSize(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4)));
      blur.setSize(glow.width, glow.height);
      pixel.set(.3 / glow.width, .3 / glow.height);
    },
    draw(night) {
      render(down, glow);
      gaussian.material.uniforms.source.value = glow.texture;
      step.set(1.1 / glow.width, 0);
      render(gaussian, blur);
      gaussian.material.uniforms.source.value = blur.texture;
      step.set(0, 1.1 / glow.height);
      render(gaussian, glow);
      output.material.uniforms.intensity.value = .12 + .61 * night;
      render(output, null);
    },
    dispose() {
      for (const mesh of [down, gaussian, output]) mesh.material.dispose();
      for (const target of [frame, glow, blur]) target.dispose();
      geometry.dispose();
    }
  };
}
