/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { csmVector, iterator } from '@framework/type/csmvector';
import { LAppGlManager } from './lappglmanager';

function shouldUseMipmaps(): boolean {
  return true;
}

const textureLoadMaxAttempts = 3;
const textureLoadTimeoutMs = 35000;
const textureRetryDelayMs = 750;

function textureAttemptUrl(fileName: string, attempt: number): string {
  if (attempt === 0) return fileName;
  const url = new URL(fileName, window.location.href);
  url.searchParams.set('_live2d_texture_retry', String(attempt));
  return url.href;
}

function loadTextureImage(
  fileName: string,
  onLoad: (img: HTMLImageElement) => void,
  onError?: (error: Error) => void
): void {
  const loadAttempt = (attempt: number): void => {
    const img = new Image();
    let settled = false;
    let timeoutId = 0;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      callback();
    };
    const retryOrFail = (): void => finish(() => {
      if (attempt + 1 < textureLoadMaxAttempts) {
        window.setTimeout(
          () => loadAttempt(attempt + 1),
          textureRetryDelayMs * (attempt + 1)
        );
        return;
      }
      onError?.(new Error(`Failed to load Live2D texture: ${fileName}`));
    });
    timeoutId = window.setTimeout(retryOrFail, textureLoadTimeoutMs);

    img.addEventListener('load', () => finish(() => onLoad(img)), {
      once: true,
      passive: true
    });
    img.addEventListener('error', retryOrFail, { once: true, passive: true });
    img.src = textureAttemptUrl(fileName, attempt);
  };

  loadAttempt(0);
}

/**
 * テクスチャ管理クラス
 * 画像読み込み、管理を行うクラス。
 */
export class LAppTextureManager {
  /**
   * コンストラクタ
   */
  public constructor() {
    this._textures = new csmVector<TextureInfo>();
  }

  /**
   * 解放する。
   */
  public release(): void {
    if (!this._textures || !this._glManager?.getGl()) return;
    for (
      let ite: iterator<TextureInfo> = this._textures.begin();
      ite.notEqual(this._textures.end());
      ite.preIncrement()
    ) {
      this._glManager.getGl().deleteTexture(ite.ptr().id);
    }
    this._textures = null;
  }

  /**
   * 画像読み込み
   *
   * @param fileName 読み込む画像ファイルパス名
   * @param usePremultiply Premult処理を有効にするか
   * @return 画像情報、読み込み失敗時はnullを返す
   */
  public createTextureFromPngFile(
    fileName: string,
    usePremultiply: boolean,
    callback: (textureInfo: TextureInfo) => void,
    onError?: (error: Error) => void
  ): void {
    if (!this._textures || !this._glManager?.getGl()) return;
    // search loaded texture already
    for (
      let ite: iterator<TextureInfo> = this._textures.begin();
      ite.notEqual(this._textures.end());
      ite.preIncrement()
    ) {
      if (
        ite.ptr().fileName == fileName &&
        ite.ptr().usePremultply == usePremultiply
      ) {
        // 2回目以降はキャッシュが使用される(待ち時間なし)
        // WebKitでは同じImageのonloadを再度呼ぶには再インスタンスが必要
        // 詳細：https://stackoverflow.com/a/5024181
        loadTextureImage(
          fileName,
          (img): void => {
            ite.ptr().img = img;
            callback(ite.ptr());
          },
          onError
        );
        return;
      }
    }

    // データのオンロードをトリガーにする
    loadTextureImage(
      fileName,
      (img): void => {
        // テクスチャオブジェクトの作成
        if (!this._textures || !this._glManager?.getGl()) return;
        const tex: WebGLTexture = this._glManager.getGl().createTexture();

        // テクスチャを選択
        this._glManager
          .getGl()
          .bindTexture(this._glManager.getGl().TEXTURE_2D, tex);

        const useMipmaps = shouldUseMipmaps();

        // テクスチャにピクセルを書き込む
        this._glManager
          .getGl()
          .texParameteri(
            this._glManager.getGl().TEXTURE_2D,
            this._glManager.getGl().TEXTURE_MIN_FILTER,
            useMipmaps
              ? this._glManager.getGl().LINEAR_MIPMAP_LINEAR
              : this._glManager.getGl().LINEAR
          );
        this._glManager
          .getGl()
          .texParameteri(
            this._glManager.getGl().TEXTURE_2D,
            this._glManager.getGl().TEXTURE_MAG_FILTER,
            this._glManager.getGl().LINEAR
          );

        // Premult処理を行わせる
        if (usePremultiply) {
          this._glManager
            .getGl()
            .pixelStorei(
              this._glManager.getGl().UNPACK_PREMULTIPLY_ALPHA_WEBGL,
              1
            );
        }

        // テクスチャにピクセルを書き込む
        this._glManager
          .getGl()
          .texImage2D(
            this._glManager.getGl().TEXTURE_2D,
            0,
            this._glManager.getGl().RGBA,
            this._glManager.getGl().RGBA,
            this._glManager.getGl().UNSIGNED_BYTE,
            img
          );

        if (useMipmaps) {
          this._glManager
            .getGl()
            .generateMipmap(this._glManager.getGl().TEXTURE_2D);
        }

        // テクスチャをバインド
        this._glManager
          .getGl()
          .bindTexture(this._glManager.getGl().TEXTURE_2D, null);

        const textureInfo: TextureInfo = new TextureInfo();
        if (textureInfo != null) {
          textureInfo.fileName = fileName;
          textureInfo.width = img.width;
          textureInfo.height = img.height;
          textureInfo.id = tex;
          textureInfo.img = img;
          textureInfo.usePremultply = usePremultiply;
          if (this._textures != null) {
            this._textures.pushBack(textureInfo);
          }
        }

        callback(textureInfo);
      },
      onError
    );
  }

  /**
   * 画像の解放
   *
   * 配列に存在する画像全てを解放する。
   */
  public releaseTextures(): void {
    for (let i = 0; i < this._textures.getSize(); i++) {
      this._glManager.getGl().deleteTexture(this._textures.at(i).id);
      this._textures.set(i, null);
    }

    this._textures.clear();
  }

  /**
   * 画像の解放
   *
   * 指定したテクスチャの画像を解放する。
   * @param texture 解放するテクスチャ
   */
  public releaseTextureByTexture(texture: WebGLTexture): void {
    for (let i = 0; i < this._textures.getSize(); i++) {
      if (this._textures.at(i).id != texture) {
        continue;
      }

      this._glManager.getGl().deleteTexture(this._textures.at(i).id);
      this._textures.set(i, null);
      this._textures.remove(i);
      break;
    }
  }

  /**
   * 画像の解放
   *
   * 指定した名前の画像を解放する。
   * @param fileName 解放する画像ファイルパス名
   */
  public releaseTextureByFilePath(fileName: string): void {
    for (let i = 0; i < this._textures.getSize(); i++) {
      if (this._textures.at(i).fileName == fileName) {
        this._glManager.getGl().deleteTexture(this._textures.at(i).id);
        this._textures.set(i, null);
        this._textures.remove(i);
        break;
      }
    }
  }

  /**
   * setter
   * @param glManager
   */
  public setGlManager(glManager: LAppGlManager): void {
    this._glManager = glManager;
  }

  _textures: csmVector<TextureInfo>;
  private _glManager: LAppGlManager;
}

/**
 * 画像情報構造体
 */
export class TextureInfo {
  img: HTMLImageElement; // 画像
  id: WebGLTexture = null; // テクスチャ
  width = 0; // 横幅
  height = 0; // 高さ
  usePremultply: boolean; // Premult処理を有効にするか
  fileName: string; // ファイル名
}
