/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

export class LAppGlManager {
  public constructor() {
    this._gl = null;
  }

  public initialize(canvas: HTMLCanvasElement): boolean {
    const attributes: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    };

    this._gl =
      canvas.getContext('webgl2', attributes) ||
      canvas.getContext('webgl', attributes) ||
      canvas.getContext('experimental-webgl', attributes);

    if (!this._gl) {
      this._gl = null;
      return false;
    }
    return true;
  }

  public release(): void {}

  public getGl(): WebGLRenderingContext | WebGL2RenderingContext {
    return this._gl;
  }

  private _gl: WebGLRenderingContext | WebGL2RenderingContext = null;
}
