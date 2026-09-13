/** Per-drawable buffers keep immutable UV/index data on the GPU. Vertices are
 * uploaded once per model frame, shared by the mask and color passes. */
export class CubismDrawableBuffers {
  private frame = 0;
  private buffers = new Map<string, {
    buffer: WebGLBuffer;
    capacity: number;
    frame: number;
  }>();

  public constructor(private gl: WebGLRenderingContext) {}

  public beginFrame(): void {
    this.frame++;
  }

  public bind(index: number, kind: 'vertex' | 'uv' | 'index', data: Float32Array | Uint16Array): void {
    const gl = this.gl;
    const target = kind === 'index' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
    const key = `${index}:${kind}`;
    let entry = this.buffers.get(key);
    if (!entry) {
      entry = { buffer: gl.createBuffer(), capacity: -1, frame: -1 };
      this.buffers.set(key, entry);
    }
    gl.bindBuffer(target, entry.buffer);
    if (entry.capacity !== data.byteLength) {
      gl.bufferData(target, data, kind === 'vertex' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      entry.capacity = data.byteLength;
      entry.frame = this.frame;
    } else if (kind === 'vertex' && entry.frame !== this.frame) {
      gl.bufferSubData(target, 0, data);
      entry.frame = this.frame;
    }
  }

  public release(): void {
    for (const { buffer } of this.buffers.values()) this.gl.deleteBuffer(buffer);
    this.buffers.clear();
  }
}
