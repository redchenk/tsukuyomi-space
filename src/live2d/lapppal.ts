/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * プラットフォーム依存機能を抽象化する Cubism Platform Abstraction Layer.
 *
 * ファイル読み込みや時刻取得等のプラットフォームに依存する関数をまとめる。
 */
type Live2DAssetResponse = {
  ok: boolean;
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const live2dAssetMaxAttempts = 3;
const live2dAssetRetryDelayMs = 750;

function live2dAssetTimeoutMs(filePath: string): number {
  return /\.moc3(?:$|\?)/i.test(filePath) ? 35000 : 20000;
}

function live2dAssetAttemptUrl(filePath: string, attempt: number): string {
  if (attempt === 0) return filePath;
  const url = new URL(filePath, window.location.href);
  url.searchParams.set('_live2d_asset_retry', String(attempt));
  return url.href;
}

function waitForRetry(attempt: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, live2dAssetRetryDelayMs * (attempt + 1));
  });
}

async function fetchLive2DAssetAttempt(
  filePath: string,
  attempt: number
): Promise<Live2DAssetResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    live2dAssetTimeoutMs(filePath)
  );

  try {
    const response = await fetch(live2dAssetAttemptUrl(filePath, attempt), {
      cache: attempt === 0 ? 'default' : 'reload',
      signal: controller.signal
    });
    const buffer = await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      arrayBuffer: async () => buffer
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export class LAppPal {
  public static async fetchFile(filePath: string): Promise<Live2DAssetResponse> {
    let lastError: Error = new Error(`Failed to load Live2D asset: ${filePath}`);

    for (let attempt = 0; attempt < live2dAssetMaxAttempts; attempt++) {
      try {
        const response = await fetchLive2DAssetAttempt(filePath, attempt);
        const retryableStatus = response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500;
        if (!retryableStatus || attempt + 1 >= live2dAssetMaxAttempts) {
          return response;
        }
        lastError = new Error(
          `Live2D asset request returned ${response.status}: ${filePath}`
        );
      } catch (error) {
        lastError = error instanceof Error
          ? error
          : new Error(`Failed to load Live2D asset: ${filePath}`);
      }

      await waitForRetry(attempt);
    }

    window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-error', {
      detail: {
        message: 'Live2D 资源加载失败，请检查网络后刷新页面重试',
        cause: lastError.message
      }
    }));
    throw lastError;
  }

  /**
   * ファイルをバイトデータとして読みこむ
   *
   * @param filePath 読み込み対象ファイルのパス
   * @return
   * {
   *      buffer,   読み込んだバイトデータ
   *      size        ファイルサイズ
   * }
   */
  public static loadFileAsBytes(
    filePath: string,
    callback: (arrayBuffer: ArrayBuffer, size: number) => void
  ): void {
    this.fetchFile(filePath)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => callback(arrayBuffer, arrayBuffer.byteLength))
      .catch(error => console.error(error));
  }

  /**
   * デルタ時間（前回フレームとの差分）を取得する
   * @return デルタ時間[ms]
   */
  public static getDeltaTime(): number {
    return this.deltaTime;
  }

  public static updateTime(): void {
    this.currentFrame = Date.now();
    this.deltaTime = (this.currentFrame - this.lastFrame) / 1000;
    this.lastFrame = this.currentFrame;
  }

  /**
   * メッセージを出力する
   * @param message 文字列
   */
  public static printMessage(message: string): void {
    console.log(message);
  }

  static lastUpdate = Date.now();

  static currentFrame = 0.0;
  static lastFrame = 0.0;
  static deltaTime = 0.0;
}
