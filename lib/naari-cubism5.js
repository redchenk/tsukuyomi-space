(function(global) {
    "use strict";
    var pixi = global.pixi_js || global.PIXI;
    if (!pixi) {
        console.error('PIXI not found!');
        return;
    }
    
    global.PIXI = global.PIXI || {};
    global.PIXI.live2d = global.PIXI.live2d || {};
    
var __defProp = Object.defineProperty;
var __pow = Math.pow;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
import { EventEmitter, Matrix, Assets, Transform, Point, Container, ObservablePoint, Rectangle } from "pixi.js";
const _csmVector = class _csmVector {
  /**
   * 引数付きコンストラクタ
   * @param iniitalCapacity 初期化後のキャパシティ。データサイズは_capacity * sizeof(T)
   * @param zeroClear trueなら初期化時に確保した領域を0で埋める
   */
  constructor(initialCapacity = 0) {
    if (initialCapacity < 1) {
      this._ptr = [];
      this._capacity = 0;
      this._size = 0;
    } else {
      this._ptr = new Array(initialCapacity);
      this._capacity = initialCapacity;
      this._size = 0;
    }
  }
  /**
   * インデックスで指定した要素を返す
   */
  at(index) {
    return this._ptr[index];
  }
  /**
   * 要素をセット
   * @param index 要素をセットするインデックス
   * @param value セットする要素
   */
  set(index, value) {
    this._ptr[index] = value;
  }
  /**
   * コンテナを取得する
   */
  get(offset = 0) {
    const ret = new Array();
    for (let i = offset; i < this._size; i++) {
      ret.push(this._ptr[i]);
    }
    return ret;
  }
  /**
   * pushBack処理、コンテナに新たな要素を追加する
   * @param value PushBack処理で追加する値
   */
  pushBack(value) {
    if (this._size >= this._capacity) {
      this.prepareCapacity(
        this._capacity == 0 ? _csmVector.DefaultSize : this._capacity * 2
      );
    }
    this._ptr[this._size++] = value;
  }
  /**
   * コンテナの全要素を解放する
   */
  clear() {
    this._ptr.length = 0;
    this._size = 0;
  }
  /**
   * コンテナの要素数を返す
   * @return コンテナの要素数
   */
  getSize() {
    return this._size;
  }
  /**
   * コンテナの全要素に対して代入処理を行う
   * @param newSize 代入処理後のサイズ
   * @param value 要素に代入する値
   */
  assign(newSize, value) {
    const curSize = this._size;
    if (curSize < newSize) {
      this.prepareCapacity(newSize);
    }
    for (let i = 0; i < newSize; i++) {
      this._ptr[i] = value;
    }
    this._size = newSize;
  }
  /**
   * サイズ変更
   */
  resize(newSize, value = null) {
    this.updateSize(newSize, value, true);
  }
  /**
   * サイズ変更
   */
  updateSize(newSize, value = null, callPlacementNew = true) {
    const curSize = this._size;
    if (curSize < newSize) {
      this.prepareCapacity(newSize);
      if (callPlacementNew) {
        for (let i = this._size; i < newSize; i++) {
          if (typeof value == "function") {
            this._ptr[i] = JSON.parse(JSON.stringify(new value()));
          } else {
            this._ptr[i] = value;
          }
        }
      } else {
        for (let i = this._size; i < newSize; i++) {
          this._ptr[i] = value;
        }
      }
    } else {
      const sub = this._size - newSize;
      this._ptr.splice(this._size - sub, sub);
    }
    this._size = newSize;
  }
  /**
   * コンテナにコンテナ要素を挿入する
   * @param position 挿入する位置
   * @param begin 挿入するコンテナの開始位置
   * @param end 挿入するコンテナの終端位置
   */
  insert(position, begin, end) {
    let dstSi = position._index;
    const srcSi = begin._index;
    const srcEi = end._index;
    const addCount = srcEi - srcSi;
    this.prepareCapacity(this._size + addCount);
    const addSize = this._size - dstSi;
    if (addSize > 0) {
      for (let i = 0; i < addSize; i++) {
        this._ptr.splice(dstSi + i, 0, null);
      }
    }
    for (let i = srcSi; i < srcEi; i++, dstSi++) {
      this._ptr[dstSi] = begin._vector._ptr[i];
    }
    this._size = this._size + addCount;
  }
  /**
   * コンテナからインデックスで指定した要素を削除する
   * @param index インデックス値
   * @return true 削除実行
   * @return false 削除範囲外
   */
  remove(index) {
    if (index < 0 || this._size <= index) {
      return false;
    }
    this._ptr.splice(index, 1);
    --this._size;
    return true;
  }
  /**
   * コンテナから要素を削除して他の要素をシフトする
   * @param ite 削除する要素
   */
  erase(ite) {
    const index = ite._index;
    if (index < 0 || this._size <= index) {
      return ite;
    }
    this._ptr.splice(index, 1);
    --this._size;
    const ite2 = new iterator$1(this, index);
    return ite2;
  }
  /**
   * コンテナのキャパシティを確保する
   * @param newSize 新たなキャパシティ。引数の値が現在のサイズ未満の場合は何もしない.
   */
  prepareCapacity(newSize) {
    if (newSize > this._capacity) {
      if (this._capacity == 0) {
        this._ptr = new Array(newSize);
        this._capacity = newSize;
      } else {
        this._ptr.length = newSize;
        this._capacity = newSize;
      }
    }
  }
  /**
   * コンテナの先頭要素を返す
   */
  begin() {
    const ite = this._size == 0 ? this.end() : new iterator$1(this, 0);
    return ite;
  }
  /**
   * コンテナの終端要素を返す
   */
  end() {
    const ite = new iterator$1(this, this._size);
    return ite;
  }
  getOffset(offset) {
    const newVector = new _csmVector();
    newVector._ptr = this.get(offset);
    newVector._size = this.get(offset).length;
    newVector._capacity = this.get(offset).length;
    return newVector;
  }
  // コンテナ初期化のデフォルトサイズ
};
_csmVector.DefaultSize = 10;
let csmVector = _csmVector;
let iterator$1 = class iterator {
  /**
   * コンストラクタ
   */
  constructor(v, index) {
    this._vector = v != void 0 ? v : null;
    this._index = index != void 0 ? index : 0;
  }
  /**
   * 代入
   */
  set(ite) {
    this._index = ite._index;
    this._vector = ite._vector;
    return this;
  }
  /**
   * 前置き++演算
   */
  preIncrement() {
    ++this._index;
    return this;
  }
  /**
   * 前置き--演算
   */
  preDecrement() {
    --this._index;
    return this;
  }
  /**
   * 後置き++演算子
   */
  increment() {
    const iteold = new iterator(this._vector, this._index++);
    return iteold;
  }
  /**
   * 後置き--演算子
   */
  decrement() {
    const iteold = new iterator(this._vector, this._index--);
    return iteold;
  }
  /**
   * ptr
   */
  ptr() {
    return this._vector._ptr[this._index];
  }
  /**
   * =演算子のオーバーロード
   */
  substitution(ite) {
    this._index = ite._index;
    this._vector = ite._vector;
    return this;
  }
  /**
   * !=演算子のオーバーロード
   */
  notEqual(ite) {
    return this._index != ite._index || this._vector != ite._vector;
  }
  // コンテナ
};
var Live2DCubismFramework$w;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.csmVector = csmVector;
  Live2DCubismFramework2.iterator = iterator$1;
})(Live2DCubismFramework$w || (Live2DCubismFramework$w = {}));
class csmString {
  /**
   * 文字列を後方に追加する
   *
   * @param c 追加する文字列
   * @return 更新された文字列
   */
  append(c, length) {
    this.s += length !== void 0 ? c.substr(0, length) : c;
    return this;
  }
  /**
   * 文字サイズを拡張して文字を埋める
   * @param length    拡張する文字数
   * @param v         埋める文字
   * @return 更新された文字列
   */
  expansion(length, v) {
    for (let i = 0; i < length; i++) {
      this.append(v);
    }
    return this;
  }
  /**
   * 文字列の長さをバイト数で取得する
   */
  getBytes() {
    return encodeURIComponent(this.s).replace(/%../g, "x").length;
  }
  /**
   * 文字列の長さを返す
   */
  getLength() {
    return this.s.length;
  }
  /**
   * 文字列比較 <
   * @param s 比較する文字列
   * @return true:    比較する文字列より小さい
   * @return false:   比較する文字列より大きい
   */
  isLess(s) {
    return this.s < s.s;
  }
  /**
   * 文字列比較 >
   * @param s 比較する文字列
   * @return true:    比較する文字列より大きい
   * @return false:   比較する文字列より小さい
   */
  isGreat(s) {
    return this.s > s.s;
  }
  /**
   * 文字列比較 ==
   * @param s 比較する文字列
   * @return true:    比較する文字列と等しい
   * @return false:   比較する文字列と異なる
   */
  isEqual(s) {
    return this.s == s;
  }
  /**
   * 文字列が空かどうか
   * @return true: 空の文字列
   * @return false: 値が設定されている
   */
  isEmpty() {
    return this.s.length == 0;
  }
  /**
   * 引数付きコンストラクタ
   */
  constructor(s) {
    this.s = s;
  }
}
var Live2DCubismFramework$v;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.csmString = csmString;
})(Live2DCubismFramework$v || (Live2DCubismFramework$v = {}));
class CubismId {
  /**
   * 内部で使用するCubismIdクラス生成メソッド
   *
   * @param id ID文字列
   * @returns CubismId
   * @note 指定したID文字列からCubismIdを取得する際は
   *       CubismIdManager().getId(id)を使用してください
   */
  static createIdInternal(id) {
    return new CubismId(id);
  }
  /**
   * ID名を取得する
   */
  getString() {
    return this._id;
  }
  /**
   * idを比較
   * @param c 比較するid
   * @return 同じならばtrue,異なっていればfalseを返す
   */
  isEqual(c) {
    if (typeof c === "string") {
      return this._id.isEqual(c);
    } else if (c instanceof csmString) {
      return this._id.isEqual(c.s);
    } else if (c instanceof CubismId) {
      return this._id.isEqual(c._id.s);
    }
    return false;
  }
  /**
   * idを比較
   * @param c 比較するid
   * @return 同じならばtrue,異なっていればfalseを返す
   */
  isNotEqual(c) {
    if (typeof c == "string") {
      return !this._id.isEqual(c);
    } else if (c instanceof csmString) {
      return !this._id.isEqual(c.s);
    } else if (c instanceof CubismId) {
      return !this._id.isEqual(c._id.s);
    }
    return false;
  }
  /**
   * プライベートコンストラクタ
   *
   * @note ユーザーによる生成は許可しません
   */
  constructor(id) {
    if (typeof id === "string") {
      this._id = new csmString(id);
      return;
    }
    this._id = id;
  }
  // ID名
}
var Live2DCubismFramework$u;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismId = CubismId;
})(Live2DCubismFramework$u || (Live2DCubismFramework$u = {}));
class CubismIdManager {
  /**
   * コンストラクタ
   */
  constructor() {
    this._ids = new csmVector();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    for (let i = 0; i < this._ids.getSize(); ++i) {
      this._ids.set(i, void 0);
    }
    this._ids = null;
  }
  /**
   * ID名をリストから登録
   *
   * @param ids ID名リスト
   * @param count IDの個数
   */
  registerIds(ids) {
    for (let i = 0; i < ids.length; i++) {
      this.registerId(ids[i]);
    }
  }
  /**
   * ID名を登録
   *
   * @param id ID名
   */
  registerId(id) {
    let result = null;
    if ("string" == typeof id) {
      if ((result = this.findId(id)) != null) {
        return result;
      }
      result = CubismId.createIdInternal(id);
      this._ids.pushBack(result);
    } else {
      return this.registerId(id.s);
    }
    return result;
  }
  /**
   * ID名からIDを取得する
   *
   * @param id ID名
   */
  getId(id) {
    return this.registerId(id);
  }
  /**
   * ID名からIDの確認
   *
   * @return true 存在する
   * @return false 存在しない
   */
  isExist(id) {
    if ("string" == typeof id) {
      return this.findId(id) != null;
    }
    return this.isExist(id.s);
  }
  /**
   * ID名からIDを検索する。
   *
   * @param id ID名
   * @return 登録されているID。なければNULL。
   */
  findId(id) {
    for (let i = 0; i < this._ids.getSize(); ++i) {
      if (this._ids.at(i).getString().isEqual(id)) {
        return this._ids.at(i);
      }
    }
    return null;
  }
  // 登録されているIDのリスト
}
var Live2DCubismFramework$t;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismIdManager = CubismIdManager;
})(Live2DCubismFramework$t || (Live2DCubismFramework$t = {}));
class CubismMatrix44 {
  /**
   * コンストラクタ
   */
  constructor() {
    this._tr = new Float32Array(16);
    this.loadIdentity();
  }
  /**
   * 受け取った２つの行列の乗算を行う。
   *
   * @param a 行列a
   * @param b 行列b
   * @return 乗算結果の行列
   */
  static multiply(a, b, dst) {
    const c = new Float32Array([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ]);
    const n = 4;
    for (let i = 0; i < n; ++i) {
      for (let j = 0; j < n; ++j) {
        for (let k = 0; k < n; ++k) {
          c[j + i * 4] += a[k + i * 4] * b[j + k * 4];
        }
      }
    }
    for (let i = 0; i < 16; ++i) {
      dst[i] = c[i];
    }
  }
  /**
   * 単位行列に初期化する
   */
  loadIdentity() {
    const c = new Float32Array([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ]);
    this.setMatrix(c);
  }
  /**
   * 行列を設定
   *
   * @param tr 16個の浮動小数点数で表される4x4の行列
   */
  setMatrix(tr) {
    for (let i = 0; i < 16; ++i) {
      this._tr[i] = tr[i];
    }
  }
  /**
   * 行列を浮動小数点数の配列で取得
   *
   * @return 16個の浮動小数点数で表される4x4の行列
   */
  getArray() {
    return this._tr;
  }
  /**
   * X軸の拡大率を取得
   * @return X軸の拡大率
   */
  getScaleX() {
    return this._tr[0];
  }
  /**
   * Y軸の拡大率を取得する
   *
   * @return Y軸の拡大率
   */
  getScaleY() {
    return this._tr[5];
  }
  /**
   * X軸の移動量を取得
   * @return X軸の移動量
   */
  getTranslateX() {
    return this._tr[12];
  }
  /**
   * Y軸の移動量を取得
   * @return Y軸の移動量
   */
  getTranslateY() {
    return this._tr[13];
  }
  /**
   * X軸の値を現在の行列で計算
   *
   * @param src X軸の値
   * @return 現在の行列で計算されたX軸の値
   */
  transformX(src) {
    return this._tr[0] * src + this._tr[12];
  }
  /**
   * Y軸の値を現在の行列で計算
   *
   * @param src Y軸の値
   * @return 現在の行列で計算されたY軸の値
   */
  transformY(src) {
    return this._tr[5] * src + this._tr[13];
  }
  /**
   * X軸の値を現在の行列で逆計算
   */
  invertTransformX(src) {
    return (src - this._tr[12]) / this._tr[0];
  }
  /**
   * Y軸の値を現在の行列で逆計算
   */
  invertTransformY(src) {
    return (src - this._tr[13]) / this._tr[5];
  }
  /**
   * 現在の行列の位置を起点にして移動
   *
   * 現在の行列の位置を起点にして相対的に移動する。
   *
   * @param x X軸の移動量
   * @param y Y軸の移動量
   */
  translateRelative(x, y) {
    const tr1 = new Float32Array([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      x,
      y,
      0,
      1
    ]);
    CubismMatrix44.multiply(tr1, this._tr, this._tr);
  }
  /**
   * 現在の行列の位置を移動
   *
   * 現在の行列の位置を指定した位置へ移動する
   *
   * @param x X軸の移動量
   * @param y y軸の移動量
   */
  translate(x, y) {
    this._tr[12] = x;
    this._tr[13] = y;
  }
  /**
   * 現在の行列のX軸の位置を指定した位置へ移動する
   *
   * @param x X軸の移動量
   */
  translateX(x) {
    this._tr[12] = x;
  }
  /**
   * 現在の行列のY軸の位置を指定した位置へ移動する
   *
   * @param y Y軸の移動量
   */
  translateY(y) {
    this._tr[13] = y;
  }
  /**
   * 現在の行列の拡大率を相対的に設定する
   *
   * @param x X軸の拡大率
   * @param y Y軸の拡大率
   */
  scaleRelative(x, y) {
    const tr1 = new Float32Array([
      x,
      0,
      0,
      0,
      0,
      y,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ]);
    CubismMatrix44.multiply(tr1, this._tr, this._tr);
  }
  /**
   * 現在の行列の拡大率を指定した倍率に設定する
   *
   * @param x X軸の拡大率
   * @param y Y軸の拡大率
   */
  scale(x, y) {
    this._tr[0] = x;
    this._tr[5] = y;
  }
  /**
   * 引数で与えられた行列にこの行列を乗算する。
   * (引数で与えられた行列) * (この行列)
   *
   * @note 関数名と実際の計算内容に乖離があるため、今後計算順が修正される可能性があります。
   * @param m 行列
   */
  multiplyByMatrix(m) {
    CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
  }
  /**
   * オブジェクトのコピーを生成する
   */
  clone() {
    const cloneMatrix = new CubismMatrix44();
    for (let i = 0; i < this._tr.length; i++) {
      cloneMatrix._tr[i] = this._tr[i];
    }
    return cloneMatrix;
  }
  // 4x4行列データ
}
var Live2DCubismFramework$s;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismMatrix44 = CubismMatrix44;
})(Live2DCubismFramework$s || (Live2DCubismFramework$s = {}));
class csmRect {
  /**
   * コンストラクタ
   * @param x 左端X座標
   * @param y 上端Y座標
   * @param w 幅
   * @param h 高さ
   */
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
  }
  /**
   * 矩形中央のX座標を取得する
   */
  getCenterX() {
    return this.x + 0.5 * this.width;
  }
  /**
   * 矩形中央のY座標を取得する
   */
  getCenterY() {
    return this.y + 0.5 * this.height;
  }
  /**
   * 右側のX座標を取得する
   */
  getRight() {
    return this.x + this.width;
  }
  /**
   * 下端のY座標を取得する
   */
  getBottom() {
    return this.y + this.height;
  }
  /**
   * 矩形に値をセットする
   * @param r 矩形のインスタンス
   */
  setRect(r) {
    this.x = r.x;
    this.y = r.y;
    this.width = r.width;
    this.height = r.height;
  }
  /**
   * 矩形中央を軸にして縦横を拡縮する
   * @param w 幅方向に拡縮する量
   * @param h 高さ方向に拡縮する量
   */
  expand(w, h) {
    this.x -= w;
    this.y -= h;
    this.width += w * 2;
    this.height += h * 2;
  }
  // 高さ
}
var Live2DCubismFramework$r;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.csmRect = csmRect;
})(Live2DCubismFramework$r || (Live2DCubismFramework$r = {}));
class CubismRenderer {
  /**
   * レンダラのインスタンスを生成して取得する
   *
   * @return レンダラのインスタンス
   */
  static create() {
    return null;
  }
  /**
   * レンダラのインスタンスを解放する
   */
  static delete(renderer) {
  }
  /**
   * レンダラの初期化処理を実行する
   * 引数に渡したモデルからレンダラの初期化処理に必要な情報を取り出すことができる
   * @param model モデルのインスタンス
   */
  initialize(model) {
    this._model = model;
  }
  /**
   * モデルを描画する
   */
  drawModel() {
    if (this.getModel() == null) return;
    this.saveProfile();
    this.doDrawModel();
    this.restoreProfile();
  }
  /**
   * Model-View-Projection 行列をセットする
   * 配列は複製されるので、元の配列は外で破棄して良い
   * @param matrix44 Model-View-Projection 行列
   */
  setMvpMatrix(matrix44) {
    this._mvpMatrix4x4.setMatrix(matrix44.getArray());
  }
  /**
   * Model-View-Projection 行列を取得する
   * @return Model-View-Projection 行列
   */
  getMvpMatrix() {
    return this._mvpMatrix4x4;
  }
  /**
   * モデルの色をセットする
   * 各色0.0~1.0の間で指定する（1.0が標準の状態）
   * @param red 赤チャンネルの値
   * @param green 緑チャンネルの値
   * @param blue 青チャンネルの値
   * @param alpha αチャンネルの値
   */
  setModelColor(red, green, blue, alpha) {
    if (red < 0) {
      red = 0;
    } else if (red > 1) {
      red = 1;
    }
    if (green < 0) {
      green = 0;
    } else if (green > 1) {
      green = 1;
    }
    if (blue < 0) {
      blue = 0;
    } else if (blue > 1) {
      blue = 1;
    }
    if (alpha < 0) {
      alpha = 0;
    } else if (alpha > 1) {
      alpha = 1;
    }
    this._modelColor.r = red;
    this._modelColor.g = green;
    this._modelColor.b = blue;
    this._modelColor.a = alpha;
  }
  /**
   * モデルの色を取得する
   * 各色0.0~1.0の間で指定する(1.0が標準の状態)
   *
   * @return RGBAのカラー情報
   */
  getModelColor() {
    return JSON.parse(JSON.stringify(this._modelColor));
  }
  /**
   * 透明度を考慮したモデルの色を計算する。
   *
   * @param opacity 透明度
   *
   * @return RGBAのカラー情報
   */
  getModelColorWithOpacity(opacity) {
    const modelColorRGBA = this.getModelColor();
    modelColorRGBA.a *= opacity;
    if (this.isPremultipliedAlpha()) {
      modelColorRGBA.r *= modelColorRGBA.a;
      modelColorRGBA.g *= modelColorRGBA.a;
      modelColorRGBA.b *= modelColorRGBA.a;
    }
    return modelColorRGBA;
  }
  /**
   * 乗算済みαの有効・無効をセットする
   * 有効にするならtrue、無効にするならfalseをセットする
   */
  setIsPremultipliedAlpha(enable) {
    this._isPremultipliedAlpha = enable;
  }
  /**
   * 乗算済みαの有効・無効を取得する
   * @return true 乗算済みのα有効
   * @return false 乗算済みのα無効
   */
  isPremultipliedAlpha() {
    return this._isPremultipliedAlpha;
  }
  /**
   * カリング（片面描画）の有効・無効をセットする。
   * 有効にするならtrue、無効にするならfalseをセットする
   */
  setIsCulling(culling) {
    this._isCulling = culling;
  }
  /**
   * カリング（片面描画）の有効・無効を取得する。
   * @return true カリング有効
   * @return false カリング無効
   */
  isCulling() {
    return this._isCulling;
  }
  /**
   * テクスチャの異方性フィルタリングのパラメータをセットする
   * パラメータ値の影響度はレンダラの実装に依存する
   * @param n パラメータの値
   */
  setAnisotropy(n) {
    this._anisotropy = n;
  }
  /**
   * テクスチャの異方性フィルタリングのパラメータをセットする
   * @return 異方性フィルタリングのパラメータ
   */
  getAnisotropy() {
    return this._anisotropy;
  }
  /**
   * レンダリングするモデルを取得する
   * @return レンダリングするモデル
   */
  getModel() {
    return this._model;
  }
  /**
   * マスク描画の方式を変更する。
   * falseの場合、マスクを1枚のテクスチャに分割してレンダリングする（デフォルト）
   * 高速だが、マスク個数の上限が36に限定され、質も荒くなる
   * trueの場合、パーツ描画の前にその都度必要なマスクを描き直す
   * レンダリング品質は高いが描画処理負荷は増す
   * @param high 高精細マスクに切り替えるか？
   */
  useHighPrecisionMask(high) {
    this._useHighPrecisionMask = high;
  }
  /**
   * マスクの描画方式を取得する
   * @return true 高精細方式
   * @return false デフォルト
   */
  isUsingHighPrecisionMask() {
    return this._useHighPrecisionMask;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    this._isCulling = false;
    this._isPremultipliedAlpha = false;
    this._anisotropy = 0;
    this._model = null;
    this._modelColor = new CubismTextureColor();
    this._useHighPrecisionMask = false;
    this._mvpMatrix4x4 = new CubismMatrix44();
    this._mvpMatrix4x4.loadIdentity();
  }
  // falseの場合、マスクを纏めて描画する trueの場合、マスクはパーツ描画ごとに書き直す
}
var CubismBlendMode = /* @__PURE__ */ ((CubismBlendMode2) => {
  CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Normal"] = 0] = "CubismBlendMode_Normal";
  CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Additive"] = 1] = "CubismBlendMode_Additive";
  CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Multiplicative"] = 2] = "CubismBlendMode_Multiplicative";
  return CubismBlendMode2;
})(CubismBlendMode || {});
class CubismTextureColor {
  /**
   * コンストラクタ
   */
  constructor(r = 1, g = 1, b = 1, a = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
  // αチャンネル
}
class CubismClippingContext {
  /**
   * 引数付きコンストラクタ
   */
  constructor(clippingDrawableIndices, clipCount) {
    this._clippingIdList = clippingDrawableIndices;
    this._clippingIdCount = clipCount;
    this._allClippedDrawRect = new csmRect();
    this._layoutBounds = new csmRect();
    this._clippedDrawableIndexList = [];
    this._matrixForMask = new CubismMatrix44();
    this._matrixForDraw = new CubismMatrix44();
    this._bufferIndex = 0;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    if (this._layoutBounds != null) {
      this._layoutBounds = null;
    }
    if (this._allClippedDrawRect != null) {
      this._allClippedDrawRect = null;
    }
    if (this._clippedDrawableIndexList != null) {
      this._clippedDrawableIndexList = null;
    }
  }
  /**
   * このマスクにクリップされる描画オブジェクトを追加する
   *
   * @param drawableIndex クリッピング対象に追加する描画オブジェクトのインデックス
   */
  addClippedDrawable(drawableIndex) {
    this._clippedDrawableIndexList.push(drawableIndex);
  }
  // このマスクが割り当てられるレンダーテクスチャ（フレームバッファ）やカラーバッファのインデックス
}
var Live2DCubismFramework$q;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismBlendMode = CubismBlendMode;
  Live2DCubismFramework2.CubismRenderer = CubismRenderer;
  Live2DCubismFramework2.CubismTextureColor = CubismTextureColor;
})(Live2DCubismFramework$q || (Live2DCubismFramework$q = {}));
const CSM_LOG_LEVEL_VERBOSE = 0;
const CubismLogPrint = (level, fmt, args) => {
  CubismDebug.print(level, "[CSM]" + fmt, args);
};
const CubismLogPrintIn = (level, fmt, args) => {
  CubismLogPrint(level, fmt + "\n", args);
};
const CSM_ASSERT = (expr) => {
  console.assert(expr);
};
let CubismLogDebug;
let CubismLogInfo;
let CubismLogWarning;
let CubismLogError;
{
  CubismLogDebug = (fmt, ...args) => {
    CubismLogPrintIn(LogLevel.LogLevel_Debug, "[D]" + fmt, args);
  };
  CubismLogInfo = (fmt, ...args) => {
    CubismLogPrintIn(LogLevel.LogLevel_Info, "[I]" + fmt, args);
  };
  CubismLogWarning = (fmt, ...args) => {
    CubismLogPrintIn(LogLevel.LogLevel_Warning, "[W]" + fmt, args);
  };
  CubismLogError = (fmt, ...args) => {
    CubismLogPrintIn(LogLevel.LogLevel_Error, "[E]" + fmt, args);
  };
}
class CubismDebug {
  /**
   * ログを出力する。第一引数にログレベルを設定する。
   * CubismFramework.initialize()時にオプションで設定されたログ出力レベルを下回る場合はログに出さない。
   *
   * @param logLevel ログレベルの設定
   * @param format 書式付き文字列
   * @param args 可変長引数
   */
  static print(logLevel, format, args) {
    if (logLevel < CubismFramework.getLoggingLevel()) {
      return;
    }
    const logPrint = CubismFramework.coreLogFunction;
    if (!logPrint) return;
    const buffer = format.replace(/\{(\d+)\}/g, (m, k) => {
      return args[k];
    });
    logPrint(buffer);
  }
  /**
   * データから指定した長さだけダンプ出力する。
   * CubismFramework.initialize()時にオプションで設定されたログ出力レベルを下回る場合はログに出さない。
   *
   * @param logLevel ログレベルの設定
   * @param data ダンプするデータ
   * @param length ダンプする長さ
   */
  static dumpBytes(logLevel, data, length) {
    for (let i = 0; i < length; i++) {
      if (i % 16 == 0 && i > 0) this.print(logLevel, "\n");
      else if (i % 8 == 0 && i > 0) this.print(logLevel, "  ");
      this.print(logLevel, "{0} ", [data[i] & 255]);
    }
    this.print(logLevel, "\n");
  }
  /**
   * private コンストラクタ
   */
  constructor() {
  }
}
var Live2DCubismFramework$p;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismDebug = CubismDebug;
})(Live2DCubismFramework$p || (Live2DCubismFramework$p = {}));
class csmPair {
  /**
   * コンストラクタ
   * @param key Keyとしてセットする値
   * @param value Valueとしてセットする値
   */
  constructor(key, value) {
    this.first = key == void 0 ? null : key;
    this.second = value == void 0 ? null : value;
  }
  // valueとして用いる変数
}
const _csmMap = class _csmMap {
  /**
   * 引数付きコンストラクタ
   * @param size 初期化時点で確保するサイズ
   */
  constructor(size) {
    if (size != void 0) {
      if (size < 1) {
        this._keyValues = [];
        this._dummyValue = null;
        this._size = 0;
      } else {
        this._keyValues = new Array(size);
        this._size = size;
      }
    } else {
      this._keyValues = [];
      this._dummyValue = null;
      this._size = 0;
    }
  }
  /**
   * デストラクタ
   */
  release() {
    this.clear();
  }
  /**
   * キーを追加する
   * @param key 新たに追加するキー
   */
  appendKey(key) {
    let findIndex = -1;
    for (let i = 0; i < this._size; i++) {
      if (this._keyValues[i].first == key) {
        findIndex = i;
        break;
      }
    }
    if (findIndex != -1) {
      CubismLogWarning("The key `{0}` is already append.", key);
      return;
    }
    this.prepareCapacity(this._size + 1, false);
    this._keyValues[this._size] = new csmPair(key);
    this._size += 1;
  }
  /**
   * 添字演算子[key]のオーバーロード(get)
   * @param key 添字から特定されるValue値
   */
  getValue(key) {
    let found = -1;
    for (let i = 0; i < this._size; i++) {
      if (this._keyValues[i].first == key) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      return this._keyValues[found].second;
    } else {
      this.appendKey(key);
      return this._keyValues[this._size - 1].second;
    }
  }
  /**
   * 添字演算子[key]のオーバーロード(set)
   * @param key 添字から特定されるValue値
   * @param value 代入するValue値
   */
  setValue(key, value) {
    let found = -1;
    for (let i = 0; i < this._size; i++) {
      if (this._keyValues[i].first == key) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      this._keyValues[found].second = value;
    } else {
      this.appendKey(key);
      this._keyValues[this._size - 1].second = value;
    }
  }
  /**
   * 引数で渡したKeyを持つ要素が存在するか
   * @param key 存在を確認するkey
   * @return true 引数で渡したkeyを持つ要素が存在する
   * @return false 引数で渡したkeyを持つ要素が存在しない
   */
  isExist(key) {
    for (let i = 0; i < this._size; i++) {
      if (this._keyValues[i].first == key) {
        return true;
      }
    }
    return false;
  }
  /**
   * keyValueのポインタを全て解放する
   */
  clear() {
    this._keyValues = void 0;
    this._keyValues = null;
    this._keyValues = [];
    this._size = 0;
  }
  /**
   * コンテナのサイズを取得する
   *
   * @return コンテナのサイズ
   */
  getSize() {
    return this._size;
  }
  /**
   * コンテナのキャパシティを確保する
   * @param newSize 新たなキャパシティ。引数の値が現在のサイズ未満の場合は何もしない。
   * @param fitToSize trueなら指定したサイズに合わせる。falseならサイズを2倍確保しておく。
   */
  prepareCapacity(newSize, fitToSize) {
    if (newSize > this._keyValues.length) {
      if (this._keyValues.length == 0) {
        if (!fitToSize && newSize < _csmMap.DefaultSize)
          newSize = _csmMap.DefaultSize;
        this._keyValues.length = newSize;
      } else {
        if (!fitToSize && newSize < this._keyValues.length * 2)
          newSize = this._keyValues.length * 2;
        this._keyValues.length = newSize;
      }
    }
  }
  /**
   * コンテナの先頭要素を返す
   */
  begin() {
    const ite = new iterator2(this, 0);
    return ite;
  }
  /**
   * コンテナの終端要素を返す
   */
  end() {
    const ite = new iterator2(
      this,
      this._size
    );
    return ite;
  }
  /**
   * コンテナから要素を削除する
   *
   * @param ite 削除する要素
   */
  erase(ite) {
    const index = ite._index;
    if (index < 0 || this._size <= index) {
      return ite;
    }
    this._keyValues.splice(index, 1);
    --this._size;
    const ite2 = new iterator2(
      this,
      index
    );
    return ite2;
  }
  /**
   * コンテナの値を32ビット符号付き整数型でダンプする
   */
  dumpAsInt() {
    for (let i = 0; i < this._size; i++) {
      CubismLogDebug("{0} ,", this._keyValues[i]);
      CubismLogDebug("\n");
    }
  }
  // コンテナの要素数
};
_csmMap.DefaultSize = 10;
let csmMap = _csmMap;
class iterator2 {
  /**
   * コンストラクタ
   */
  constructor(v, idx) {
    this._map = v != void 0 ? v : new csmMap();
    this._index = idx != void 0 ? idx : 0;
  }
  /**
   * =演算子のオーバーロード
   */
  set(ite) {
    this._index = ite._index;
    this._map = ite._map;
    return this;
  }
  /**
   * 前置き++演算子のオーバーロード
   */
  preIncrement() {
    ++this._index;
    return this;
  }
  /**
   * 前置き--演算子のオーバーロード
   */
  preDecrement() {
    --this._index;
    return this;
  }
  /**
   * 後置き++演算子のオーバーロード
   */
  increment() {
    const iteold = new iterator2(this._map, this._index++);
    return iteold;
  }
  /**
   * 後置き--演算子のオーバーロード
   */
  decrement() {
    const iteold = new iterator2(this._map, this._index);
    this._map = iteold._map;
    this._index = iteold._index;
    return this;
  }
  /**
   * *演算子のオーバーロード
   */
  ptr() {
    return this._map._keyValues[this._index];
  }
  /**
   * !=演算
   */
  notEqual(ite) {
    return this._index != ite._index || this._map != ite._map;
  }
  // コンテナ
}
var Live2DCubismFramework$o;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.csmMap = csmMap;
  Live2DCubismFramework2.csmPair = csmPair;
  Live2DCubismFramework2.iterator = iterator2;
})(Live2DCubismFramework$o || (Live2DCubismFramework$o = {}));
class CubismJsonExtension {
  static parseJsonObject(obj, map) {
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] == "boolean") {
        const convValue = Boolean(obj[key]);
        map.put(key, new JsonBoolean(convValue));
      } else if (typeof obj[key] == "string") {
        const convValue = String(obj[key]);
        map.put(key, new JsonString(convValue));
      } else if (typeof obj[key] == "number") {
        const convValue = Number(obj[key]);
        map.put(key, new JsonFloat(convValue));
      } else if (obj[key] instanceof Array) {
        map.put(
          key,
          CubismJsonExtension.parseJsonArray(obj[key])
        );
      } else if (obj[key] instanceof Object) {
        map.put(
          key,
          CubismJsonExtension.parseJsonObject(obj[key], new JsonMap())
        );
      } else if (obj[key] == null) {
        map.put(key, new JsonNullvalue());
      } else {
        map.put(key, obj[key]);
      }
    });
    return map;
  }
  static parseJsonArray(obj) {
    const arr = new JsonArray();
    Object.keys(obj).forEach((key) => {
      const convKey = Number(key);
      if (typeof convKey == "number") {
        if (typeof obj[key] == "boolean") {
          const convValue = Boolean(obj[key]);
          arr.add(new JsonBoolean(convValue));
        } else if (typeof obj[key] == "string") {
          const convValue = String(obj[key]);
          arr.add(new JsonString(convValue));
        } else if (typeof obj[key] == "number") {
          const convValue = Number(obj[key]);
          arr.add(new JsonFloat(convValue));
        } else if (obj[key] instanceof Array) {
          arr.add(this.parseJsonArray(obj[key]));
        } else if (obj[key] instanceof Object) {
          arr.add(this.parseJsonObject(obj[key], new JsonMap()));
        } else if (obj[key] == null) {
          arr.add(new JsonNullvalue());
        } else {
          arr.add(obj[key]);
        }
      } else if (obj[key] instanceof Array) {
        arr.add(this.parseJsonArray(obj[key]));
      } else if (obj[key] instanceof Object) {
        arr.add(this.parseJsonObject(obj[key], new JsonMap()));
      } else if (obj[key] == null) {
        arr.add(new JsonNullvalue());
      } else {
        const convValue = Array(obj[key]);
        for (let i = 0; i < convValue.length; i++) {
          arr.add(convValue[i]);
        }
      }
    });
    return arr;
  }
}
const CSM_JSON_ERROR_TYPE_MISMATCH = "Error: type mismatch";
const CSM_JSON_ERROR_INDEX_OF_BOUNDS = "Error: index out of bounds";
let Value$1 = class Value {
  /**
   * コンストラクタ
   */
  constructor() {
  }
  /**
   * 要素を文字列型で返す(string)
   */
  getRawString(defaultValue, indent) {
    return this.getString(defaultValue, indent);
  }
  /**
   * 要素を数値型で返す(number)
   */
  toInt(defaultValue = 0) {
    return defaultValue;
  }
  /**
   * 要素を数値型で返す(number)
   */
  toFloat(defaultValue = 0) {
    return defaultValue;
  }
  /**
   * 要素を真偽値で返す(boolean)
   */
  toBoolean(defaultValue = false) {
    return defaultValue;
  }
  /**
   * サイズを返す
   */
  getSize() {
    return 0;
  }
  /**
   * 要素を配列で返す(Value[])
   */
  getArray(defaultValue = null) {
    return defaultValue;
  }
  /**
   * 要素をコンテナで返す(array)
   */
  getVector(defaultValue = new csmVector()) {
    return defaultValue;
  }
  /**
   * 要素をマップで返す(csmMap<csmString, Value>)
   */
  getMap(defaultValue) {
    return defaultValue;
  }
  /**
   * 添字演算子[index]
   */
  getValueByIndex(index) {
    return Value.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }
  /**
   * 添字演算子[string | csmString]
   */
  getValueByString(s) {
    return Value.nullValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }
  /**
   * マップのキー一覧をコンテナで返す
   *
   * @return マップのキーの一覧
   */
  getKeys() {
    return Value.dummyKeys;
  }
  /**
   * Valueの種類がエラー値ならtrue
   */
  isError() {
    return false;
  }
  /**
   * Valueの種類がnullならtrue
   */
  isNull() {
    return false;
  }
  /**
   * Valueの種類が真偽値ならtrue
   */
  isBool() {
    return false;
  }
  /**
   * Valueの種類が数値型ならtrue
   */
  isFloat() {
    return false;
  }
  /**
   * Valueの種類が文字列ならtrue
   */
  isString() {
    return false;
  }
  /**
   * Valueの種類が配列ならtrue
   */
  isArray() {
    return false;
  }
  /**
   * Valueの種類がマップ型ならtrue
   */
  isMap() {
    return false;
  }
  equals(value) {
    return false;
  }
  /**
   * Valueの値が静的ならtrue、静的なら解放しない
   */
  isStatic() {
    return false;
  }
  /**
   * Valueにエラー値をセットする
   */
  setErrorNotForClientCall(errorStr) {
    return JsonError.errorValue;
  }
  /**
   * 初期化用メソッド
   */
  static staticInitializeNotForClientCall() {
    JsonBoolean.trueValue = new JsonBoolean(true);
    JsonBoolean.falseValue = new JsonBoolean(false);
    Value.errorValue = new JsonError("ERROR", true);
    Value.nullValue = new JsonNullvalue();
    Value.dummyKeys = new csmVector();
  }
  /**
   * リリース用メソッド
   */
  static staticReleaseNotForClientCall() {
    JsonBoolean.trueValue = null;
    JsonBoolean.falseValue = null;
    Value.errorValue = null;
    Value.nullValue = null;
    Value.dummyKeys = null;
  }
  // 明示的に連想配列をany型で指定
};
class CubismJson {
  /**
   * コンストラクタ
   */
  constructor(buffer, length) {
    this._parseCallback = CubismJsonExtension.parseJsonObject;
    this._error = null;
    this._lineCount = 0;
    this._root = null;
    if (buffer != void 0) {
      this.parseBytes(buffer, length, this._parseCallback);
    }
  }
  /**
   * バイトデータから直接ロードしてパースする
   *
   * @param buffer バッファ
   * @param size バッファサイズ
   * @return CubismJsonクラスのインスタンス。失敗したらNULL
   */
  static create(buffer, size) {
    const json = new CubismJson();
    const succeeded = json.parseBytes(
      buffer,
      size,
      json._parseCallback
    );
    if (!succeeded) {
      CubismJson.delete(json);
      return null;
    } else {
      return json;
    }
  }
  /**
   * パースしたJSONオブジェクトの解放処理
   *
   * @param instance CubismJsonクラスのインスタンス
   */
  static delete(instance) {
  }
  /**
   * パースしたJSONのルート要素を返す
   */
  getRoot() {
    return this._root;
  }
  /**
   *  UnicodeのバイナリをStringに変換
   *
   * @param buffer 変換するバイナリデータ
   * @return 変換後の文字列
   */
  static arrayBufferToString(buffer) {
    const uint8Array = new Uint8Array(buffer);
    let str = "";
    for (let i = 0, len = uint8Array.length; i < len; ++i) {
      str += "%" + this.pad(uint8Array[i].toString(16));
    }
    str = decodeURIComponent(str);
    return str;
  }
  /**
   * エンコード、パディング
   */
  static pad(n) {
    return n.length < 2 ? "0" + n : n;
  }
  /**
   * JSONのパースを実行する
   * @param buffer    パース対象のデータバイト
   * @param size      データバイトのサイズ
   * return true : 成功
   * return false: 失敗
   */
  parseBytes(buffer, size, parseCallback) {
    const endPos = new Array(1);
    const decodeBuffer = CubismJson.arrayBufferToString(buffer);
    if (parseCallback == void 0) {
      this._root = this.parseValue(decodeBuffer, size, 0, endPos);
    } else {
      this._root = parseCallback(JSON.parse(decodeBuffer), new JsonMap());
    }
    if (this._error) {
      let strbuf = "\0";
      strbuf = "Json parse error : @line " + (this._lineCount + 1) + "\n";
      this._root = new JsonString(strbuf);
      CubismLogInfo("{0}", this._root.getRawString());
      return false;
    } else if (this._root == null) {
      this._root = new JsonError(new csmString(this._error), false);
      return false;
    }
    return true;
  }
  /**
   * パース時のエラー値を返す
   */
  getParseError() {
    return this._error;
  }
  /**
   * ルート要素の次の要素がファイルの終端だったらtrueを返す
   */
  checkEndOfFile() {
    return this._root.getArray()[1].equals("EOF");
  }
  /**
   * JSONエレメントからValue(float,String,Value*,Array,null,true,false)をパースする
   * エレメントの書式に応じて内部でParseString(), ParseObject(), ParseArray()を呼ぶ
   *
   * @param   buffer      JSONエレメントのバッファ
   * @param   length      パースする長さ
   * @param   begin       パースを開始する位置
   * @param   outEndPos   パース終了時の位置
   * @return      パースから取得したValueオブジェクト
   */
  parseValue(buffer, length, begin, outEndPos) {
    if (this._error) return null;
    let o = null;
    let i = begin;
    let f;
    for (; i < length; i++) {
      const c = buffer[i];
      switch (c) {
        case "-":
        case ".":
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          const afterString = new Array(1);
          f = strtod(buffer.slice(i), afterString);
          outEndPos[0] = buffer.indexOf(afterString[0]);
          return new JsonFloat(f);
        }
        case '"':
          return new JsonString(
            this.parseString(buffer, length, i + 1, outEndPos)
          );
        // \"の次の文字から
        case "[":
          o = this.parseArray(buffer, length, i + 1, outEndPos);
          return o;
        case "{":
          o = this.parseObject(buffer, length, i + 1, outEndPos);
          return o;
        case "n":
          if (i + 3 < length) {
            o = new JsonNullvalue();
            outEndPos[0] = i + 4;
          } else {
            this._error = "parse null";
          }
          return o;
        case "t":
          if (i + 3 < length) {
            o = JsonBoolean.trueValue;
            outEndPos[0] = i + 4;
          } else {
            this._error = "parse true";
          }
          return o;
        case "f":
          if (i + 4 < length) {
            o = JsonBoolean.falseValue;
            outEndPos[0] = i + 5;
          } else {
            this._error = "illegal ',' position";
          }
          return o;
        case ",":
          this._error = "illegal ',' position";
          return null;
        case "]":
          outEndPos[0] = i;
          return null;
        case "\n":
          this._lineCount++;
      }
    }
    this._error = "illegal end of value";
    return null;
  }
  /**
   * 次の「"」までの文字列をパースする。
   *
   * @param   string  ->  パース対象の文字列
   * @param   length  ->  パースする長さ
   * @param   begin   ->  パースを開始する位置
   * @param  outEndPos   ->  パース終了時の位置
   * @return      パースした文F字列要素
   */
  parseString(string, length, begin, outEndPos) {
    if (this._error) {
      return null;
    }
    if (!string) {
      this._error = "string is null";
      return null;
    }
    let i = begin;
    let c, c2;
    const ret = new csmString("");
    let bufStart = begin;
    for (; i < length; i++) {
      c = string[i];
      switch (c) {
        case '"': {
          outEndPos[0] = i + 1;
          ret.append(string.slice(bufStart), i - bufStart);
          return ret.s;
        }
        // falls through
        case "//": {
          i++;
          if (i - 1 > bufStart) {
            ret.append(string.slice(bufStart), i - bufStart);
          }
          bufStart = i + 1;
          if (i < length) {
            c2 = string[i];
            switch (c2) {
              case "\\":
                ret.expansion(1, "\\");
                break;
              case '"':
                ret.expansion(1, '"');
                break;
              case "/":
                ret.expansion(1, "/");
                break;
              case "b":
                ret.expansion(1, "\b");
                break;
              case "f":
                ret.expansion(1, "\f");
                break;
              case "n":
                ret.expansion(1, "\n");
                break;
              case "r":
                ret.expansion(1, "\r");
                break;
              case "t":
                ret.expansion(1, "	");
                break;
              case "u":
                this._error = "parse string/unicord escape not supported";
                break;
            }
          } else {
            this._error = "parse string/escape error";
          }
        }
      }
    }
    this._error = "parse string/illegal end";
    return null;
  }
  /**
   * JSONのオブジェクトエレメントをパースしてValueオブジェクトを返す
   *
   * @param buffer    JSONエレメントのバッファ
   * @param length    パースする長さ
   * @param begin     パースを開始する位置
   * @param outEndPos パース終了時の位置
   * @return パースから取得したValueオブジェクト
   */
  parseObject(buffer, length, begin, outEndPos) {
    if (this._error) {
      return null;
    }
    if (!buffer) {
      this._error = "buffer is null";
      return null;
    }
    const ret = new JsonMap();
    let key = "";
    let i = begin;
    let c = "";
    const localRetEndPos2 = Array(1);
    let ok = false;
    for (; i < length; i++) {
      FOR_LOOP: for (; i < length; i++) {
        c = buffer[i];
        switch (c) {
          case '"':
            key = this.parseString(buffer, length, i + 1, localRetEndPos2);
            if (this._error) {
              return null;
            }
            i = localRetEndPos2[0];
            ok = true;
            break FOR_LOOP;
          //-- loopから出る
          case "}":
            outEndPos[0] = i + 1;
            return ret;
          // 空
          case ":":
            this._error = "illegal ':' position";
            break;
          case "\n":
            this._lineCount++;
        }
      }
      if (!ok) {
        this._error = "key not found";
        return null;
      }
      ok = false;
      FOR_LOOP2: for (; i < length; i++) {
        c = buffer[i];
        switch (c) {
          case ":":
            ok = true;
            i++;
            break FOR_LOOP2;
          case "}":
            this._error = "illegal '}' position";
            break;
          // falls through
          case "\n":
            this._lineCount++;
        }
      }
      if (!ok) {
        this._error = "':' not found";
        return null;
      }
      const value = this.parseValue(buffer, length, i, localRetEndPos2);
      if (this._error) {
        return null;
      }
      i = localRetEndPos2[0];
      ret.put(key, value);
      FOR_LOOP3: for (; i < length; i++) {
        c = buffer[i];
        switch (c) {
          case ",":
            break FOR_LOOP3;
          case "}":
            outEndPos[0] = i + 1;
            return ret;
          // 正常終了
          case "\n":
            this._lineCount++;
        }
      }
    }
    this._error = "illegal end of perseObject";
    return null;
  }
  /**
   * 次の「"」までの文字列をパースする。
   * @param buffer    JSONエレメントのバッファ
   * @param length    パースする長さ
   * @param begin     パースを開始する位置
   * @param outEndPos パース終了時の位置
   * @return パースから取得したValueオブジェクト
   */
  parseArray(buffer, length, begin, outEndPos) {
    if (this._error) {
      return null;
    }
    if (!buffer) {
      this._error = "buffer is null";
      return null;
    }
    let ret = new JsonArray();
    let i = begin;
    let c;
    const localRetEndpos2 = new Array(1);
    for (; i < length; i++) {
      const value = this.parseValue(buffer, length, i, localRetEndpos2);
      if (this._error) {
        return null;
      }
      i = localRetEndpos2[0];
      if (value) {
        ret.add(value);
      }
      FOR_LOOP: for (; i < length; i++) {
        c = buffer[i];
        switch (c) {
          case ",":
            break FOR_LOOP;
          case "]":
            outEndPos[0] = i + 1;
            return ret;
          // 終了
          case "\n":
            ++this._lineCount;
        }
      }
    }
    ret = void 0;
    this._error = "illegal end of parseObject";
    return null;
  }
  // パースされたルート要素
}
class JsonFloat extends Value$1 {
  /**
   * コンストラクタ
   */
  constructor(v) {
    super();
    this._value = v;
  }
  /**
   * Valueの種類が数値型ならtrue
   */
  isFloat() {
    return true;
  }
  /**
   * 要素を文字列で返す(csmString型)
   */
  getString(defaultValue, indent) {
    const strbuf = "\0";
    this._value = parseFloat(strbuf);
    this._stringBuffer = strbuf;
    return this._stringBuffer;
  }
  /**
   * 要素を数値型で返す(number)
   */
  toInt(defaultValue = 0) {
    return parseInt(this._value.toString());
  }
  /**
   * 要素を数値型で返す(number)
   */
  toFloat(defaultValue = 0) {
    return this._value;
  }
  equals(value) {
    if ("number" === typeof value) {
      if (Math.round(value)) {
        return false;
      } else {
        return value == this._value;
      }
    }
    return false;
  }
  // JSON要素の値
}
class JsonBoolean extends Value$1 {
  /**
   * Valueの種類が真偽値ならtrue
   */
  isBool() {
    return true;
  }
  /**
   * 要素を真偽値で返す(boolean)
   */
  toBoolean(defaultValue = false) {
    return this._boolValue;
  }
  /**
   * 要素を文字列で返す(csmString型)
   */
  getString(defaultValue, indent) {
    this._stringBuffer = this._boolValue ? "true" : "false";
    return this._stringBuffer;
  }
  equals(value) {
    if ("boolean" === typeof value) {
      return value == this._boolValue;
    }
    return false;
  }
  /**
   * Valueの値が静的ならtrue, 静的なら解放しない
   */
  isStatic() {
    return true;
  }
  /**
   * 引数付きコンストラクタ
   */
  constructor(v) {
    super();
    this._boolValue = v;
  }
  // JSON要素の値
}
class JsonString extends Value$1 {
  constructor(s) {
    super();
    if ("string" === typeof s) {
      this._stringBuffer = s;
    }
    if (s instanceof csmString) {
      this._stringBuffer = s.s;
    }
  }
  /**
   * Valueの種類が文字列ならtrue
   */
  isString() {
    return true;
  }
  /**
   * 要素を文字列で返す(csmString型)
   */
  getString(defaultValue, indent) {
    return this._stringBuffer;
  }
  equals(value) {
    if ("string" === typeof value) {
      return this._stringBuffer == value;
    }
    if (value instanceof csmString) {
      return this._stringBuffer == value.s;
    }
    return false;
  }
}
class JsonError extends JsonString {
  /**
   * Valueの値が静的ならtrue、静的なら解放しない
   */
  isStatic() {
    return this._isStatic;
  }
  /**
   * エラー情報をセットする
   */
  setErrorNotForClientCall(s) {
    this._stringBuffer = s;
    return this;
  }
  /**
   * 引数付きコンストラクタ
   */
  constructor(s, isStatic) {
    if ("string" === typeof s) {
      super(s);
    } else {
      super(s);
    }
    this._isStatic = isStatic;
  }
  /**
   * Valueの種類がエラー値ならtrue
   */
  isError() {
    return true;
  }
  // 静的なValueかどうか
}
class JsonNullvalue extends Value$1 {
  /**
   * Valueの種類がNULL値ならtrue
   */
  isNull() {
    return true;
  }
  /**
   * 要素を文字列で返す(csmString型)
   */
  getString(defaultValue, indent) {
    return this._stringBuffer;
  }
  /**
   * Valueの値が静的ならtrue, 静的なら解放しない
   */
  isStatic() {
    return true;
  }
  /**
   * Valueにエラー値をセットする
   */
  setErrorNotForClientCall(s) {
    this._stringBuffer = s;
    return JsonError.nullValue;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._stringBuffer = "NullValue";
  }
}
class JsonArray extends Value$1 {
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._array = new csmVector();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    for (let ite = this._array.begin(); ite.notEqual(this._array.end()); ite.preIncrement()) {
      let v = ite.ptr();
      if (v && !v.isStatic()) {
        v = void 0;
        v = null;
      }
    }
  }
  /**
   * Valueの種類が配列ならtrue
   */
  isArray() {
    return true;
  }
  /**
   * 添字演算子[index]
   */
  getValueByIndex(index) {
    if (index < 0 || this._array.getSize() <= index) {
      return Value$1.errorValue.setErrorNotForClientCall(
        CSM_JSON_ERROR_INDEX_OF_BOUNDS
      );
    }
    const v = this._array.at(index);
    if (v == null) {
      return Value$1.nullValue;
    }
    return v;
  }
  /**
   * 添字演算子[string | csmString]
   */
  getValueByString(s) {
    return Value$1.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }
  /**
   * 要素を文字列で返す(csmString型)
   */
  getString(defaultValue, indent) {
    const stringBuffer = indent + "[\n";
    for (let ite = this._array.begin(); ite.notEqual(this._array.end()); ite.increment()) {
      const v = ite.ptr();
      this._stringBuffer += indent + "" + v.getString(indent + " ") + "\n";
    }
    this._stringBuffer = stringBuffer + indent + "]\n";
    return this._stringBuffer;
  }
  /**
   * 配列要素を追加する
   * @param v 追加する要素
   */
  add(v) {
    this._array.pushBack(v);
  }
  /**
   * 要素をコンテナで返す(csmVector<Value>)
   */
  getVector(defaultValue = null) {
    return this._array;
  }
  /**
   * 要素の数を返す
   */
  getSize() {
    return this._array.getSize();
  }
  // JSON要素の値
}
class JsonMap extends Value$1 {
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._map = new csmMap();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    const ite = this._map.begin();
    while (ite.notEqual(this._map.end())) {
      let v = ite.ptr().second;
      if (v && !v.isStatic()) {
        v = void 0;
        v = null;
      }
      ite.preIncrement();
    }
  }
  /**
   * Valueの値がMap型ならtrue
   */
  isMap() {
    return true;
  }
  /**
   * 添字演算子[string | csmString]
   */
  getValueByString(s) {
    if (s instanceof csmString) {
      const ret = this._map.getValue(s.s);
      if (ret == null) {
        return Value$1.nullValue;
      }
      return ret;
    }
    for (let iter = this._map.begin(); iter.notEqual(this._map.end()); iter.preIncrement()) {
      if (iter.ptr().first == s) {
        if (iter.ptr().second == null) {
          return Value$1.nullValue;
        }
        return iter.ptr().second;
      }
    }
    return Value$1.nullValue;
  }
  /**
   * 添字演算子[index]
   */
  getValueByIndex(index) {
    return Value$1.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }
  /**
   * 要素を文字列で返す(csmString型)
   */
  getString(defaultValue, indent) {
    this._stringBuffer = indent + "{\n";
    const ite = this._map.begin();
    while (ite.notEqual(this._map.end())) {
      const key = ite.ptr().first;
      const v = ite.ptr().second;
      this._stringBuffer += indent + " " + key + " : " + v.getString(indent + "   ") + " \n";
      ite.preIncrement();
    }
    this._stringBuffer += indent + "}\n";
    return this._stringBuffer;
  }
  /**
   * 要素をMap型で返す
   */
  getMap(defaultValue) {
    return this._map;
  }
  /**
   * Mapに要素を追加する
   */
  put(key, v) {
    this._map.setValue(key, v);
  }
  /**
   * Mapからキーのリストを取得する
   */
  getKeys() {
    if (!this._keys) {
      this._keys = new csmVector();
      const ite = this._map.begin();
      while (ite.notEqual(this._map.end())) {
        const key = ite.ptr().first;
        this._keys.pushBack(key);
        ite.preIncrement();
      }
    }
    return this._keys;
  }
  /**
   * Mapの要素数を取得する
   */
  getSize() {
    return this._keys.getSize();
  }
  // JSON要素の値
}
var Live2DCubismFramework$n;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismJson = CubismJson;
  Live2DCubismFramework2.JsonArray = JsonArray;
  Live2DCubismFramework2.JsonBoolean = JsonBoolean;
  Live2DCubismFramework2.JsonError = JsonError;
  Live2DCubismFramework2.JsonFloat = JsonFloat;
  Live2DCubismFramework2.JsonMap = JsonMap;
  Live2DCubismFramework2.JsonNullvalue = JsonNullvalue;
  Live2DCubismFramework2.JsonString = JsonString;
  Live2DCubismFramework2.Value = Value$1;
})(Live2DCubismFramework$n || (Live2DCubismFramework$n = {}));
function strtod(s, endPtr) {
  let index = 0;
  for (let i = 1; ; i++) {
    const testC = s.slice(i - 1, i);
    if (testC == "e" || testC == "-" || testC == "E") {
      continue;
    }
    const test = s.substring(0, i);
    const number = Number(test);
    if (isNaN(number)) {
      break;
    }
    index = i;
  }
  let d = parseFloat(s);
  if (isNaN(d)) {
    d = NaN;
  }
  endPtr[0] = s.slice(index);
  return d;
}
let s_isStarted = false;
let s_isInitialized = false;
let s_option = null;
let s_cubismIdManager = null;
const Constant = Object.freeze({
  vertexOffset: 0,
  // メッシュ頂点のオフセット値
  vertexStep: 2
  // メッシュ頂点のステップ値
});
function csmDelete(address) {
  if (!address) {
    return;
  }
  address = void 0;
}
class CubismFramework {
  /**
   * Cubism FrameworkのAPIを使用可能にする。
   *  APIを実行する前に必ずこの関数を実行すること。
   *  一度準備が完了して以降は、再び実行しても内部処理がスキップされます。
   *
   * @param    option      Optionクラスのインスタンス
   *
   * @return   準備処理が完了したらtrueが返ります。
   */
  static startUp(option = null) {
    if (s_isStarted) {
      CubismLogInfo("CubismFramework.startUp() is already done.");
      return s_isStarted;
    }
    s_option = option;
    if (s_option != null) {
      Live2DCubismCore.Logging.csmSetLogFunction(s_option.logFunction);
    }
    s_isStarted = true;
    if (s_isStarted) {
      const version = Live2DCubismCore.Version.csmGetVersion();
      const major = (version & 4278190080) >> 24;
      const minor = (version & 16711680) >> 16;
      const patch = version & 65535;
      const versionNumber = version;
      CubismLogInfo(
        `Live2D Cubism Core version: {0}.{1}.{2} ({3})`,
        ("00" + major).slice(-2),
        ("00" + minor).slice(-2),
        ("0000" + patch).slice(-4),
        versionNumber
      );
    }
    CubismLogInfo("CubismFramework.startUp() is complete.");
    return s_isStarted;
  }
  /**
   * StartUp()で初期化したCubismFrameworkの各パラメータをクリアします。
   * Dispose()したCubismFrameworkを再利用する際に利用してください。
   */
  static cleanUp() {
    s_isStarted = false;
    s_isInitialized = false;
    s_option = null;
    s_cubismIdManager = null;
  }
  /**
   * Cubism Framework内のリソースを初期化してモデルを表示可能な状態にします。<br>
   *     再度Initialize()するには先にDispose()を実行する必要があります。
   *
   * @param memorySize 初期化時メモリ量 [byte(s)]
   *    複数モデル表示時などにモデルが更新されない際に使用してください。
   *    指定する際は必ず1024*1024*16 byte(16MB)以上の値を指定してください。
   *    それ以外はすべて1024*1024*16 byteに丸めます。
   */
  static initialize(memorySize = 0) {
    CSM_ASSERT(s_isStarted);
    if (!s_isStarted) {
      CubismLogWarning("CubismFramework is not started.");
      return;
    }
    if (s_isInitialized) {
      CubismLogWarning(
        "CubismFramework.initialize() skipped, already initialized."
      );
      return;
    }
    Value$1.staticInitializeNotForClientCall();
    s_cubismIdManager = new CubismIdManager();
    Live2DCubismCore.Memory.initializeAmountOfMemory(memorySize);
    s_isInitialized = true;
    CubismLogInfo("CubismFramework.initialize() is complete.");
  }
  /**
   * Cubism Framework内の全てのリソースを解放します。
   *      ただし、外部で確保されたリソースについては解放しません。
   *      外部で適切に破棄する必要があります。
   */
  static dispose() {
    CSM_ASSERT(s_isStarted);
    if (!s_isStarted) {
      CubismLogWarning("CubismFramework is not started.");
      return;
    }
    if (!s_isInitialized) {
      CubismLogWarning("CubismFramework.dispose() skipped, not initialized.");
      return;
    }
    Value$1.staticReleaseNotForClientCall();
    s_cubismIdManager.release();
    s_cubismIdManager = null;
    CubismRenderer.staticRelease();
    s_isInitialized = false;
    CubismLogInfo("CubismFramework.dispose() is complete.");
  }
  /**
   * Cubism FrameworkのAPIを使用する準備が完了したかどうか
   * @return APIを使用する準備が完了していればtrueが返ります。
   */
  static isStarted() {
    return s_isStarted;
  }
  /**
   * Cubism Frameworkのリソース初期化がすでに行われているかどうか
   * @return リソース確保が完了していればtrueが返ります
   */
  static isInitialized() {
    return s_isInitialized;
  }
  /**
   * Core APIにバインドしたログ関数を実行する
   *
   * @praram message ログメッセージ
   */
  static coreLogFunction(message) {
    if (!Live2DCubismCore.Logging.csmGetLogFunction()) {
      return;
    }
    Live2DCubismCore.Logging.csmGetLogFunction()(message);
  }
  /**
   * 現在のログ出力レベル設定の値を返す。
   *
   * @return  現在のログ出力レベル設定の値
   */
  static getLoggingLevel() {
    if (s_option != null) {
      return s_option.loggingLevel;
    }
    return 5;
  }
  /**
   * IDマネージャのインスタンスを取得する
   * @return CubismManagerクラスのインスタンス
   */
  static getIdManager() {
    return s_cubismIdManager;
  }
  /**
   * 静的クラスとして使用する
   * インスタンス化させない
   */
  constructor() {
  }
}
class Option {
  // ログ出力レベルの設定
}
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["LogLevel_Verbose"] = 0] = "LogLevel_Verbose";
  LogLevel2[LogLevel2["LogLevel_Debug"] = 1] = "LogLevel_Debug";
  LogLevel2[LogLevel2["LogLevel_Info"] = 2] = "LogLevel_Info";
  LogLevel2[LogLevel2["LogLevel_Warning"] = 3] = "LogLevel_Warning";
  LogLevel2[LogLevel2["LogLevel_Error"] = 4] = "LogLevel_Error";
  LogLevel2[LogLevel2["LogLevel_Off"] = 5] = "LogLevel_Off";
  return LogLevel2;
})(LogLevel || {});
var Live2DCubismFramework$m;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.Constant = Constant;
  Live2DCubismFramework2.csmDelete = csmDelete;
  Live2DCubismFramework2.CubismFramework = CubismFramework;
})(Live2DCubismFramework$m || (Live2DCubismFramework$m = {}));
const LOGICAL_WIDTH = 2;
const LOGICAL_HEIGHT = 2;
const LOG_LEVEL_VERBOSE = 0;
const LOG_LEVEL_WARNING = 1;
const LOG_LEVEL_ERROR = 2;
const LOG_LEVEL_NONE = 999;
const config = {
  LOG_LEVEL_VERBOSE,
  LOG_LEVEL_WARNING,
  LOG_LEVEL_ERROR,
  LOG_LEVEL_NONE,
  /**
   * Global log level.
   * @default config.LOG_LEVEL_WARNING
   */
  logLevel: LOG_LEVEL_WARNING,
  /**
   * Enabling sound for motions.
   */
  sound: true,
  /**
   * Deferring motion and corresponding sound until both are loaded.
   */
  motionSync: true,
  /**
   * Default fading duration for motions without such value specified.
   */
  motionFadingDuration: 500,
  /**
   * Default fading duration for idle motions without such value specified.
   */
  idleMotionFadingDuration: 2e3,
  /**
   * Default fading duration for expressions without such value specified.
   */
  expressionFadingDuration: 500,
  /**
   * If false, expression will be reset to default when playing non-idle motions.
   */
  preserveExpressionOnMotion: true,
  cubism5: { logLevel: CSM_LOG_LEVEL_VERBOSE }
};
const VERSION = "1.2.5";
const logger = {
  log(tag, ...messages) {
    if (config.logLevel <= config.LOG_LEVEL_VERBOSE) {
      console.log(`[${tag}]`, ...messages);
    }
  },
  warn(tag, ...messages) {
    if (config.logLevel <= config.LOG_LEVEL_WARNING) {
      console.warn(`[${tag}]`, ...messages);
    }
  },
  error(tag, ...messages) {
    if (config.logLevel <= config.LOG_LEVEL_ERROR) {
      console.error(`[${tag}]`, ...messages);
    }
  }
};
function clamp(num, lower, upper) {
  return num < lower ? lower : num > upper ? upper : num;
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function copyProperty(type, from, to, fromKey, toKey) {
  const value = from[fromKey];
  if (value !== null && typeof value === type) {
    to[toKey] = value;
  }
}
function copyArray(type, from, to, fromKey, toKey) {
  const array = from[fromKey];
  if (Array.isArray(array)) {
    to[toKey] = array.filter((item) => item !== null && typeof item === type);
  }
}
function applyMixins(derivedCtor, baseCtors) {
  baseCtors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      if (name !== "constructor") {
        Object.defineProperty(
          derivedCtor.prototype,
          name,
          Object.getOwnPropertyDescriptor(baseCtor.prototype, name)
        );
      }
    });
  });
}
function folderName(url) {
  let lastSlashIndex = url.lastIndexOf("/");
  if (lastSlashIndex != -1) {
    url = url.slice(0, lastSlashIndex);
  }
  lastSlashIndex = url.lastIndexOf("/");
  if (lastSlashIndex !== -1) {
    url = url.slice(lastSlashIndex + 1);
  }
  return url;
}
function remove(array, item) {
  const index = array.indexOf(item);
  if (index !== -1) {
    array.splice(index, 1);
  }
}
class AudioAnalyzer {
  constructor() {
    __publicField(this, "audioContext", null);
    __publicField(this, "analyzer", null);
    __publicField(this, "mediaStreamSource", null);
    __publicField(this, "dataArray", null);
    __publicField(this, "animationFrameId", null);
    __publicField(this, "onVolumeChange", null);
  }
  /**
   * Initialize audio context and analyzer
   */
  initAudioContext() {
    return __async(this, null, function* () {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyzer = this.audioContext.createAnalyser();
        this.analyzer.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
      }
    });
  }
  /**
   * Start microphone audio capture
   */
  startMicrophone(onVolumeChange) {
    return __async(this, null, function* () {
      yield this.initAudioContext();
      try {
        const stream = yield navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
        this.mediaStreamSource.connect(this.analyzer);
        this.onVolumeChange = onVolumeChange;
        this.startAnalysis();
      } catch (error) {
        throw new Error(`Failed to access microphone: ${error}`);
      }
    });
  }
  /**
   * Play audio from base64 data and analyze volume
   */
  playAndAnalyze(base64Audio, onVolumeChange) {
    return __async(this, null, function* () {
      yield this.initAudioContext();
      try {
        const binaryString = atob(base64Audio.split(",")[1] || base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBuffer = yield this.audioContext.decodeAudioData(bytes.buffer.slice(0));
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.analyzer);
        source.connect(this.audioContext.destination);
        this.onVolumeChange = onVolumeChange;
        this.startAnalysis();
        source.start(0);
        source.onended = () => {
          this.stopAnalysis();
          if (this.onVolumeChange) {
            this.onVolumeChange(0);
          }
        };
      } catch (error) {
        throw new Error(`Failed to play audio: ${error}`);
      }
    });
  }
  /**
   * Start real-time volume analysis
   */
  startAnalysis() {
    if (!this.analyzer || !this.dataArray) return;
    const analyze = () => {
      this.analyzer.getByteFrequencyData(this.dataArray);
      let sum = 0;
      let averageVolume = 0;
      if (this.dataArray && this.dataArray.length > 0) {
        for (let i = 0; i < this.dataArray.length; i++) {
          sum += this.dataArray[i];
        }
        averageVolume = sum / this.dataArray.length;
      }
      const normalizedVolume = Math.min(1, averageVolume / 180);
      let smoothedVolume = Math.pow(normalizedVolume, 0.8);
      const minThreshold = 0.05;
      if (smoothedVolume < minThreshold) {
        smoothedVolume = 0;
      }
      if (this.onVolumeChange) {
        this.onVolumeChange(smoothedVolume);
      }
      this.animationFrameId = requestAnimationFrame(analyze);
    };
    analyze();
  }
  /**
   * Stop volume analysis
   */
  stopAnalysis() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  /**
   * Stop microphone capture
   */
  stopMicrophone() {
    this.stopAnalysis();
    if (this.mediaStreamSource) {
      const stream = this.mediaStreamSource.mediaStream;
      if (stream && stream.getTracks) {
        stream.getTracks().forEach((track) => track.stop());
      }
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    this.onVolumeChange = null;
  }
  /**
   * Clean up resources
   */
  destroy() {
    this.stopMicrophone();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyzer = null;
    this.dataArray = null;
  }
}
class ExpressionManager extends EventEmitter {
  constructor(settings, options) {
    super();
    /**
     * Tag for logging.
     */
    __publicField(this, "tag");
    /**
     * The ModelSettings reference.
     */
    __publicField(this, "settings");
    /**
     * The Expressions. The structure is the same as {@link definitions}, initially there's only
     * an empty array, which means all expressions will be `undefined`. When an Expression has
     * been loaded, it'll fill the place in which it should be; when it fails to load,
     * the place will be filled with `null`.
     */
    __publicField(this, "expressions", []);
    /**
     * An empty Expression to reset all the expression parameters.
     */
    __publicField(this, "defaultExpression");
    /**
     * Current Expression. This will not be overwritten by {@link ExpressionManager#defaultExpression}.
     */
    __publicField(this, "currentExpression");
    /**
     * The pending Expression.
     */
    __publicField(this, "reserveExpressionIndex", -1);
    /**
     * Flags the instance has been destroyed.
     */
    __publicField(this, "destroyed", false);
    this.settings = settings;
    this.tag = `ExpressionManager(${settings.name})`;
  }
  /**
   * Should be called in the constructor of derived class.
   */
  init() {
    this.defaultExpression = this.createExpression({}, void 0);
    this.currentExpression = this.defaultExpression;
    this.stopAllExpressions();
  }
  /**
   * Loads an Expression. Errors in this method will not be thrown,
   * but be emitted with an "expressionLoadError" event.
   * @param index - Index of the expression in definitions.
   * @return Promise that resolves with the Expression, or with undefined if it can't be loaded.
   * @emits {@link ExpressionManagerEvents.expressionLoaded}
   * @emits {@link ExpressionManagerEvents.expressionLoadError}
   */
  loadExpression(index) {
    return __async(this, null, function* () {
      if (!this.definitions[index]) {
        logger.warn(this.tag, `Undefined expression at [${index}]`);
        return void 0;
      }
      if (this.expressions[index] === null) {
        logger.warn(
          this.tag,
          `Cannot set expression at [${index}] because it's already failed in loading.`
        );
        return void 0;
      }
      if (this.expressions[index]) {
        return this.expressions[index];
      }
      const expression = yield this._loadExpression(index);
      this.expressions[index] = expression;
      return expression;
    });
  }
  /**
   * Loads the Expression. Will be implemented by Live2DFactory in order to avoid circular dependency.
   * @ignore
   */
  _loadExpression(index) {
    throw new Error("Not implemented.");
  }
  /**
   * Sets a random Expression that differs from current one.
   * @return Promise that resolves with true if succeeded, with false otherwise.
   */
  setRandomExpression() {
    return __async(this, null, function* () {
      if (this.definitions.length) {
        const availableIndices = [];
        for (let i = 0; i < this.definitions.length; i++) {
          if (this.expressions[i] !== null && this.expressions[i] !== this.currentExpression && i !== this.reserveExpressionIndex) {
            availableIndices.push(i);
          }
        }
        if (availableIndices.length) {
          const index = Math.floor(Math.random() * availableIndices.length);
          return this.setExpression(index);
        }
      }
      return false;
    });
  }
  /**
   * Resets model's expression using {@link ExpressionManager#defaultExpression}.
   */
  resetExpression() {
    this._setExpression(this.defaultExpression);
  }
  /**
   * Restores model's expression to {@link currentExpression}.
   */
  restoreExpression() {
    this._setExpression(this.currentExpression);
  }
  /**
   * Sets an Expression.
   * @param index - Either the index, or the name of the expression.
   * @return Promise that resolves with true if succeeded, with false otherwise.
   */
  setExpression(index) {
    return __async(this, null, function* () {
      if (typeof index !== "number") {
        index = this.getExpressionIndex(index);
      }
      if (!(index > -1 && index < this.definitions.length)) {
        return false;
      }
      if (index === this.expressions.indexOf(this.currentExpression)) {
        return false;
      }
      this.reserveExpressionIndex = index;
      const expression = yield this.loadExpression(index);
      if (!expression || this.reserveExpressionIndex !== index) {
        return false;
      }
      this.reserveExpressionIndex = -1;
      this.currentExpression = expression;
      this._setExpression(expression);
      return true;
    });
  }
  /**
   * Updates parameters of the core model.
   * @return True if the parameters are actually updated.
   */
  update(model, now) {
    if (!this.isFinished()) {
      return this.updateParameters(model, now);
    }
    return false;
  }
  /**
   * Destroys the instance.
   * @emits {@link ExpressionManagerEvents.destroy}
   */
  destroy() {
    this.destroyed = true;
    this.emit("destroy");
    const self = this;
    self.definitions = void 0;
    self.expressions = void 0;
  }
}
const EPSILON = 0.01;
const MAX_SPEED = 40 / 7.5;
const ACCELERATION_TIME = 1 / (0.15 * 1e3);
class FocusController {
  constructor() {
    /** The focus position. */
    __publicField(this, "targetX", 0);
    /** The focus position. */
    __publicField(this, "targetY", 0);
    /** Current position. */
    __publicField(this, "x", 0);
    /** Current position. */
    __publicField(this, "y", 0);
    /** Current velocity. */
    __publicField(this, "vx", 0);
    /** Current velocity. */
    __publicField(this, "vy", 0);
  }
  /**
   * Sets the focus position.
   * @param x - X position in range `[-1, 1]`.
   * @param y - Y position in range `[-1, 1]`.
   * @param instant - Should the focus position be instantly applied.
   */
  focus(x, y, instant = false) {
    this.targetX = clamp(x, -1, 1);
    this.targetY = clamp(y, -1, 1);
    if (instant) {
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }
  /**
   * Updates the interpolation.
   * @param dt - Delta time in milliseconds.
   */
  update(dt) {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return;
    const d = Math.sqrt(__pow(dx, 2) + __pow(dy, 2));
    const maxSpeed = MAX_SPEED / (1e3 / dt);
    let ax = maxSpeed * (dx / d) - this.vx;
    let ay = maxSpeed * (dy / d) - this.vy;
    const a = Math.sqrt(__pow(ax, 2) + __pow(ay, 2));
    const maxA = maxSpeed * ACCELERATION_TIME * dt;
    if (a > maxA) {
      ax *= maxA / a;
      ay *= maxA / a;
    }
    this.vx += ax;
    this.vy += ay;
    const v = Math.sqrt(__pow(this.vx, 2) + __pow(this.vy, 2));
    const maxV = 0.5 * (Math.sqrt(__pow(maxA, 2) + 8 * maxA * d) - maxA);
    if (v > maxV) {
      this.vx *= maxV / v;
      this.vy *= maxV / v;
    }
    this.x += this.vx;
    this.y += this.vy;
  }
}
class ModelSettings {
  /**
   * @param json - The settings JSON object.
   * @param json.url - The `url` field must be defined to specify the settings file's URL.
   */
  constructor(json) {
    __publicField(this, "json");
    /**
     * The model's name, typically used for displaying or logging. By default it's inferred from
     * the URL by taking the folder name (the second to last component).
     */
    __publicField(this, "name");
    /**
     * URL of the model settings file, used to resolve paths of the resource files defined in settings.
     * This typically ends with `.model3.json` in Cubism 5.
     */
    __publicField(this, "url");
    /**
     * Relative path of the pose file.
     */
    __publicField(this, "pose");
    /**
     * Relative path of the physics file.
     */
    __publicField(this, "physics");
    this.json = json;
    const url = json.url;
    if (typeof url !== "string") {
      throw new TypeError("The `url` field in settings JSON must be defined as a string.");
    }
    this.url = url;
    this.name = folderName(this.url);
  }
  /**
   * Resolves a relative path using the {@link url}. This is used to resolve the resource files
   * defined in the settings.
   * @param path - Relative path.
   * @return Resolved path.
   */
  resolveURL(path) {
    try {
      return new URL(path, this.url).href;
    } catch (e) {
      const base = this.url.endsWith("/") ? this.url : this.url.substring(0, this.url.lastIndexOf("/") + 1);
      return base + path;
    }
  }
  /**
   * Replaces the resource files by running each file through the `replacer`.
   * @param replacer - Invoked with two arguments: `(file, path)`, where `file` is the file definition,
   * and `path` is its property path in the ModelSettings instance. A string must be returned to be the replacement.
   *
   * ```js
   * modelSettings.replaceFiles((file, path) => {
   *     // file = "foo.moc", path = "moc"
   *     // file = "foo.png", path = "textures[0]"
   *     // file = "foo.mtn", path = "motions.idle[0].file"
   *     // file = "foo.motion3.json", path = "motions.idle[0].File"
   *
   *     return "bar/" + file;
   * });
   * ```
   */
  replaceFiles(replacer) {
    this.moc = replacer(this.moc, "moc");
    if (this.pose !== void 0) {
      this.pose = replacer(this.pose, "pose");
    }
    if (this.physics !== void 0) {
      this.physics = replacer(this.physics, "physics");
    }
    for (let i = 0; i < this.textures.length; i++) {
      this.textures[i] = replacer(this.textures[i], `textures[${i}]`);
    }
  }
  /**
   * Retrieves all resource files defined in the settings.
   * @return A flat array of the paths of all resource files.
   *
   * ```js
   * modelSettings.getDefinedFiles();
   * // returns: ["foo.moc", "foo.png", ...]
   * ```
   */
  getDefinedFiles() {
    const files = [];
    this.replaceFiles((file) => {
      files.push(file);
      return file;
    });
    return files;
  }
  /**
   * Validates that the files defined in the settings exist in given files. Each file will be
   * resolved by {@link resolveURL} before comparison.
   * @param files - A flat array of file paths.
   * @return All the files which are defined in the settings and also exist in given files,
   * *including the optional files*.
   * @throws Error if any *essential* file is defined in settings but not included in given files.
   */
  validateFiles(files) {
    const assertFileExists = (expectedFile, shouldThrow) => {
      const actualPath = this.resolveURL(expectedFile);
      if (!files.includes(actualPath)) {
        if (shouldThrow) {
          throw new Error(
            `File "${expectedFile}" is defined in settings, but doesn't exist in given files`
          );
        }
        return false;
      }
      return true;
    };
    const essentialFiles = [this.moc, ...this.textures];
    essentialFiles.forEach((texture) => assertFileExists(texture, true));
    const definedFiles = this.getDefinedFiles();
    return definedFiles.filter((file) => assertFileExists(file, false));
  }
}
var MotionPriority = /* @__PURE__ */ ((MotionPriority2) => {
  MotionPriority2[MotionPriority2["NONE"] = 0] = "NONE";
  MotionPriority2[MotionPriority2["IDLE"] = 1] = "IDLE";
  MotionPriority2[MotionPriority2["NORMAL"] = 2] = "NORMAL";
  MotionPriority2[MotionPriority2["FORCE"] = 3] = "FORCE";
  return MotionPriority2;
})(MotionPriority || {});
class MotionState {
  constructor() {
    /**
     * Tag for logging.
     */
    __publicField(this, "tag");
    /**
     * When enabled, the states will be dumped to the logger when an exception occurs.
     */
    __publicField(this, "debug", false);
    /**
     * Priority of the current motion. Will be `MotionPriority.NONE` if there's no playing motion.
     */
    __publicField(this, "currentPriority", 0);
    /**
     * Priority of the reserved motion, which is still in loading and will be played once loaded.
     * Will be `MotionPriority.NONE` if there's no reserved motion.
     */
    __publicField(this, "reservePriority", 0);
    /**
     * Group of current motion.
     */
    __publicField(this, "currentGroup");
    /**
     * Index of current motion in its group.
     */
    __publicField(this, "currentIndex");
    /**
     * Group of the reserved motion.
     */
    __publicField(this, "reservedGroup");
    /**
     * Index of the reserved motion in its group.
     */
    __publicField(this, "reservedIndex");
    /**
     * Group of the reserved idle motion.
     */
    __publicField(this, "reservedIdleGroup");
    /**
     * Index of the reserved idle motion in its group.
     */
    __publicField(this, "reservedIdleIndex");
  }
  /**
   * Reserves the playback for a motion.
   * @param group - The motion group.
   * @param index - Index in the motion group.
   * @param priority - The priority to be applied.
   * @return True if the reserving has succeeded.
   */
  reserve(group, index, priority) {
    if (priority <= 0) {
      logger.log(this.tag, `Cannot start a motion with MotionPriority.NONE.`);
      return false;
    }
    if (group === this.currentGroup && index === this.currentIndex) {
      logger.log(this.tag, `Motion is already playing.`, this.dump(group, index));
      return false;
    }
    if (group === this.reservedGroup && index === this.reservedIndex || group === this.reservedIdleGroup && index === this.reservedIdleIndex) {
      logger.log(this.tag, `Motion is already reserved.`, this.dump(group, index));
      return false;
    }
    if (priority === 1) {
      if (this.currentPriority !== 0) {
        logger.log(
          this.tag,
          `Cannot start idle motion because another motion is playing.`,
          this.dump(group, index)
        );
        return false;
      }
      if (this.reservedIdleGroup !== void 0) {
        logger.log(
          this.tag,
          `Cannot start idle motion because another idle motion has reserved.`,
          this.dump(group, index)
        );
        return false;
      }
      this.setReservedIdle(group, index);
    } else {
      if (priority < 3) {
        if (priority <= this.currentPriority) {
          logger.log(
            this.tag,
            "Cannot start motion because another motion is playing as an equivalent or higher priority.",
            this.dump(group, index)
          );
          return false;
        }
        if (priority <= this.reservePriority) {
          logger.log(
            this.tag,
            "Cannot start motion because another motion has reserved as an equivalent or higher priority.",
            this.dump(group, index)
          );
          return false;
        }
      }
      this.setReserved(group, index, priority);
    }
    return true;
  }
  /**
   * Requests the playback for a motion.
   * @param motion - The Motion, can be undefined.
   * @param group - The motion group.
   * @param index - Index in the motion group.
   * @param priority - The priority to be applied.
   * @return True if the request has been approved, i.e. the motion is allowed to play.
   */
  start(motion, group, index, priority) {
    if (priority === 1) {
      this.setReservedIdle(void 0, void 0);
      if (this.currentPriority !== 0) {
        logger.log(
          this.tag,
          "Cannot start idle motion because another motion is playing.",
          this.dump(group, index)
        );
        return false;
      }
    } else {
      if (group !== this.reservedGroup || index !== this.reservedIndex) {
        logger.log(
          this.tag,
          "Cannot start motion because another motion has taken the place.",
          this.dump(group, index)
        );
        return false;
      }
      this.setReserved(
        void 0,
        void 0,
        0
        /* NONE */
      );
    }
    if (!motion) {
      return false;
    }
    this.setCurrent(group, index, priority);
    return true;
  }
  /**
   * Notifies the motion playback has finished.
   */
  complete() {
    this.setCurrent(
      void 0,
      void 0,
      0
      /* NONE */
    );
  }
  /**
   * Sets the current motion.
   */
  setCurrent(group, index, priority) {
    this.currentPriority = priority;
    this.currentGroup = group;
    this.currentIndex = index;
  }
  /**
   * Sets the reserved motion.
   */
  setReserved(group, index, priority) {
    this.reservePriority = priority;
    this.reservedGroup = group;
    this.reservedIndex = index;
  }
  /**
   * Sets the reserved idle motion.
   */
  setReservedIdle(group, index) {
    this.reservedIdleGroup = group;
    this.reservedIdleIndex = index;
  }
  /**
   * Checks if a Motion is currently playing or has reserved.
   * @return True if active.
   */
  isActive(group, index) {
    return group === this.currentGroup && index === this.currentIndex || group === this.reservedGroup && index === this.reservedIndex || group === this.reservedIdleGroup && index === this.reservedIdleIndex;
  }
  /**
   * Resets the state.
   */
  reset() {
    this.setCurrent(
      void 0,
      void 0,
      0
      /* NONE */
    );
    this.setReserved(
      void 0,
      void 0,
      0
      /* NONE */
    );
    this.setReservedIdle(void 0, void 0);
  }
  /**
   * Checks if an idle motion should be requests to play.
   */
  shouldRequestIdleMotion() {
    return this.currentGroup === void 0 && this.reservedIdleGroup === void 0;
  }
  /**
   * Checks if the model's expression should be overridden by the motion.
   */
  shouldOverrideExpression() {
    return !config.preserveExpressionOnMotion && this.currentPriority > 1;
  }
  /**
   * Dumps the state for debugging.
   */
  dump(requestedGroup, requestedIndex) {
    if (this.debug) {
      const keys = [
        "currentPriority",
        "reservePriority",
        "currentGroup",
        "currentIndex",
        "reservedGroup",
        "reservedIndex",
        "reservedIdleGroup",
        "reservedIdleIndex"
      ];
      return `
<Requested> group = "${requestedGroup}", index = ${requestedIndex}
` + keys.map((key) => "[" + key + "] " + this[key]).join("\n");
    }
    return "";
  }
}
const TAG$2 = "SoundManager";
const VOLUME = 0.5;
class SoundManager {
  /**
   * Global volume that applies to all the sounds.
   */
  static get volume() {
    return this._volume;
  }
  static set volume(value) {
    this._volume = (value > 1 ? 1 : value < 0 ? 0 : value) || 0;
    this.audios.forEach((audio) => audio.volume = this._volume);
  }
  // TODO: return an ID?
  /**
   * Creates an audio element and adds it to the {@link audios}.
   * @param file - URL of the sound file.
   * @param onFinish - Callback invoked when the playback has finished.
   * @param onError - Callback invoked when error occurs.
   * @return Created audio element.
   */
  static add(file, onFinish, onError) {
    const audio = new Audio(file);
    audio.volume = this._volume;
    audio.preload = "auto";
    audio.addEventListener("ended", () => {
      this.dispose(audio);
      onFinish == null ? void 0 : onFinish();
    });
    audio.addEventListener("error", (e) => {
      this.dispose(audio);
      logger.warn(TAG$2, `Error occurred on "${file}"`, e.error);
      onError == null ? void 0 : onError(e.error);
    });
    this.audios.push(audio);
    return audio;
  }
  /**
   * Plays the sound.
   * @param audio - An audio element.
   * @return Promise that resolves when the audio is ready to play, rejects when error occurs.
   */
  static play(audio) {
    return new Promise((resolve, reject) => {
      var _a;
      (_a = audio.play()) == null ? void 0 : _a.catch((e) => {
        audio.dispatchEvent(new ErrorEvent("error", { error: e }));
        reject(e);
      });
      if (audio.readyState === audio.HAVE_ENOUGH_DATA) {
        resolve();
      } else {
        audio.addEventListener("canplaythrough", resolve);
      }
    });
  }
  /**
   * Disposes an audio element and removes it from {@link audios}.
   * @param audio - An audio element.
   */
  static dispose(audio) {
    audio.pause();
    audio.removeAttribute("src");
    remove(this.audios, audio);
  }
  /**
   * Destroys all managed audios.
   */
  static destroy() {
    for (let i = this.audios.length - 1; i >= 0; i--) {
      this.dispose(this.audios[i]);
    }
  }
}
/**
 * Audio elements playing or pending to play. Finished audios will be removed automatically.
 */
__publicField(SoundManager, "audios", []);
__publicField(SoundManager, "_volume", VOLUME);
var MotionPreloadStrategy = /* @__PURE__ */ ((MotionPreloadStrategy2) => {
  MotionPreloadStrategy2["ALL"] = "ALL";
  MotionPreloadStrategy2["IDLE"] = "IDLE";
  MotionPreloadStrategy2["NONE"] = "NONE";
  return MotionPreloadStrategy2;
})(MotionPreloadStrategy || {});
class MotionManager extends EventEmitter {
  constructor(settings, options) {
    super();
    /**
     * Tag for logging.
     */
    __publicField(this, "tag");
    /**
     * The ModelSettings reference.
     */
    __publicField(this, "settings");
    /**
     * The Motions. The structure is the same as {@link definitions}, initially each group contains
     * an empty array, which means all motions will be `undefined`. When a Motion has been loaded,
     * it'll fill the place in which it should be; when it fails to load, the place will be filled
     * with `null`.
     */
    __publicField(this, "motionGroups", {});
    /**
     * Maintains the state of this MotionManager.
     */
    __publicField(this, "state", new MotionState());
    /**
     * Audio element of the current motion if a sound file is defined with it.
     */
    __publicField(this, "currentAudio");
    /**
     * Flags there's a motion playing.
     */
    __publicField(this, "playing", false);
    /**
     * Flags the instances has been destroyed.
     */
    __publicField(this, "destroyed", false);
    this.settings = settings;
    this.tag = `MotionManager(${settings.name})`;
    this.state.tag = this.tag;
  }
  /**
   * Should be called in the constructor of derived class.
   */
  init(options) {
    if (options == null ? void 0 : options.idleMotionGroup) {
      this.groups.idle = options.idleMotionGroup;
    }
    this.setupMotions(options);
    this.stopAllMotions();
  }
  /**
   * Sets up motions from the definitions, and preloads them according to the preload strategy.
   */
  setupMotions(options) {
    for (const group of Object.keys(this.definitions)) {
      this.motionGroups[group] = [];
    }
    let groups;
    switch (options == null ? void 0 : options.motionPreload) {
      case "NONE":
        return;
      case "ALL":
        groups = Object.keys(this.definitions);
        break;
      case "IDLE":
      default:
        groups = [this.groups.idle];
        break;
    }
    for (const group of groups) {
      if (this.definitions[group]) {
        for (let i = 0; i < this.definitions[group].length; i++) {
          this.loadMotion(group, i).then();
        }
      }
    }
  }
  /**
   * Loads a Motion in a motion group. Errors in this method will not be thrown,
   * but be emitted with a "motionLoadError" event.
   * @param group - The motion group.
   * @param index - Index in the motion group.
   * @return Promise that resolves with the Motion, or with undefined if it can't be loaded.
   * @emits {@link MotionManagerEvents.motionLoaded}
   * @emits {@link MotionManagerEvents.motionLoadError}
   */
  loadMotion(group, index) {
    return __async(this, null, function* () {
      var _a;
      if (!((_a = this.definitions[group]) == null ? void 0 : _a[index])) {
        logger.warn(this.tag, `Undefined motion at "${group}"[${index}]`);
        return void 0;
      }
      if (this.motionGroups[group][index] === null) {
        logger.warn(
          this.tag,
          `Cannot start motion at "${group}"[${index}] because it's already failed in loading.`
        );
        return void 0;
      }
      if (this.motionGroups[group][index]) {
        return this.motionGroups[group][index];
      }
      const motion = yield this._loadMotion(group, index);
      if (this.destroyed) {
        return;
      }
      this.motionGroups[group][index] = motion != null ? motion : null;
      return motion;
    });
  }
  /**
   * Loads the Motion. Will be implemented by Live2DFactory in order to avoid circular dependency.
   * @ignore
   */
  _loadMotion(group, index) {
    throw new Error("Not implemented.");
  }
  /**
   * Starts a motion as given priority.
   * @param group - The motion group.
   * @param index - Index in the motion group.
   * @param priority - The priority to be applied.
   * @return Promise that resolves with true if the motion is successfully started, with false otherwise.
   */
  startMotion(_0, _1) {
    return __async(this, arguments, function* (group, index, priority = MotionPriority.NORMAL) {
      var _a;
      if (!this.state.reserve(group, index, priority)) {
        return false;
      }
      const definition = (_a = this.definitions[group]) == null ? void 0 : _a[index];
      if (!definition) {
        return false;
      }
      if (this.currentAudio) {
        SoundManager.dispose(this.currentAudio);
      }
      let audio;
      if (config.sound) {
        const soundURL = this.getSoundFile(definition);
        if (soundURL) {
          try {
            audio = SoundManager.add(
              this.settings.resolveURL(soundURL),
              () => this.currentAudio = void 0,
              () => this.currentAudio = void 0
            );
            this.currentAudio = audio;
          } catch (e) {
            logger.warn(this.tag, "Failed to create audio", soundURL, e);
          }
        }
      }
      const motion = yield this.loadMotion(group, index);
      if (audio) {
        const readyToPlay = SoundManager.play(audio).catch(
          (e) => logger.warn(this.tag, "Failed to play audio", audio.src, e)
        );
        if (config.motionSync) {
          yield readyToPlay;
        }
      }
      if (!this.state.start(motion, group, index, priority)) {
        if (audio) {
          SoundManager.dispose(audio);
          this.currentAudio = void 0;
        }
        return false;
      }
      logger.log(this.tag, "Start motion:", this.getMotionName(definition));
      this.emit("motionStart", group, index, audio);
      if (this.state.shouldOverrideExpression()) {
        this.expressionManager && this.expressionManager.resetExpression();
      }
      this.playing = true;
      this._startMotion(motion);
      return true;
    });
  }
  /**
   * Starts a random Motion as given priority.
   * @param group - The motion group.
   * @param priority - The priority to be applied.
   * @return Promise that resolves with true if the motion is successfully started, with false otherwise.
   */
  startRandomMotion(group, priority) {
    return __async(this, null, function* () {
      const groupDefs = this.definitions[group];
      if (groupDefs == null ? void 0 : groupDefs.length) {
        const availableIndices = [];
        for (let i = 0; i < groupDefs.length; i++) {
          if (this.motionGroups[group][i] !== null && !this.state.isActive(group, i)) {
            availableIndices.push(i);
          }
        }
        if (availableIndices.length) {
          const index = Math.floor(Math.random() * availableIndices.length);
          return this.startMotion(group, availableIndices[index], priority);
        }
      }
      return false;
    });
  }
  /**
   * Stops all playing motions as well as the sound.
   */
  stopAllMotions() {
    this._stopAllMotions();
    this.state.reset();
    if (this.currentAudio) {
      SoundManager.dispose(this.currentAudio);
      this.currentAudio = void 0;
    }
  }
  /**
   * Updates parameters of the core model.
   * @param model - The core model.
   * @param now - Current time in milliseconds.
   * @return True if the parameters have been actually updated.
   */
  update(model, now) {
    var _a;
    if (this.isFinished()) {
      if (this.playing) {
        this.playing = false;
        this.emit("motionFinish");
      }
      if (this.state.shouldOverrideExpression()) {
        (_a = this.expressionManager) == null ? void 0 : _a.restoreExpression();
      }
      this.state.complete();
      if (this.state.shouldRequestIdleMotion()) {
        this.startRandomMotion(this.groups.idle, MotionPriority.IDLE);
      }
    }
    return this.updateParameters(model, now);
  }
  /**
   * Destroys the instance.
   * @emits {@link MotionManagerEvents.destroy}
   */
  destroy() {
    var _a;
    this.destroyed = true;
    this.emit("destroy");
    this.stopAllMotions();
    (_a = this.expressionManager) == null ? void 0 : _a.destroy();
    const self = this;
    self.definitions = void 0;
    self.motionGroups = void 0;
  }
}
const tempBounds = { x: 0, y: 0, width: 0, height: 0 };
class InternalModel extends EventEmitter {
  constructor() {
    super(...arguments);
    __publicField(this, "focusController", new FocusController());
    __publicField(this, "pose");
    __publicField(this, "physics");
    /**
     * Original canvas width of the model. Note this doesn't represent the model's real size,
     * as the model can overflow from its canvas.
     */
    __publicField(this, "originalWidth", 0);
    /**
     * Original canvas height of the model. Note this doesn't represent the model's real size,
     * as the model can overflow from its canvas.
     */
    __publicField(this, "originalHeight", 0);
    /**
     * Canvas width of the model, scaled by the `width` of the model's layout.
     */
    __publicField(this, "width", 0);
    /**
     * Canvas height of the model, scaled by the `height` of the model's layout.
     */
    __publicField(this, "height", 0);
    /**
     * Local transformation, calculated from the model's layout.
     */
    __publicField(this, "localTransform", new Matrix());
    /**
     * The final matrix to draw the model.
     */
    __publicField(this, "drawingMatrix", new Matrix());
    // TODO: change structure
    /**
     * The hit area definitions, keyed by their names.
     */
    __publicField(this, "hitAreas", {});
    /**
     * Flags whether `gl.UNPACK_FLIP_Y_WEBGL` should be enabled when binding the textures.
     */
    __publicField(this, "textureFlipY", false);
    /**
     * WebGL viewport when drawing the model. The format is `[x, y, width, height]`.
     */
    __publicField(this, "viewport", [0, 0, 0, 0]);
    /**
     * Flags this instance has been destroyed.
     */
    __publicField(this, "destroyed", false);
    /**
     * Flags whether lip sync is enabled.
     */
    __publicField(this, "lipSyncEnabled", false);
    /**
     * Current lip sync value (0-1).
     */
    __publicField(this, "lipSyncValue", 0);
    /**
     * Flags whether eyes should always look at camera regardless of head movement.
     */
    __publicField(this, "eyesAlwaysLookAtCamera", false);
    /**
     * Flags whether auto eye blinking is enabled.
     */
    __publicField(this, "eyeBlinkEnabled", true);
  }
  /**
   * Should be called in the constructor of derived class.
   */
  init() {
    this.setupLayout();
    this.setupHitAreas();
  }
  /**
   * Sets up the model's size and local transform by the model's layout.
   */
  setupLayout() {
    const self = this;
    const size = this.getSize();
    self.originalWidth = size[0];
    self.originalHeight = size[1];
    const layout = Object.assign(
      {
        width: LOGICAL_WIDTH,
        height: LOGICAL_HEIGHT
      },
      this.getLayout()
    );
    this.localTransform.scale(layout.width / LOGICAL_WIDTH, layout.height / LOGICAL_HEIGHT);
    self.width = this.originalWidth * this.localTransform.a;
    self.height = this.originalHeight * this.localTransform.d;
    const offsetX = layout.x !== void 0 && layout.x - layout.width / 2 || layout.centerX !== void 0 && layout.centerX || layout.left !== void 0 && layout.left - layout.width / 2 || layout.right !== void 0 && layout.right + layout.width / 2 || 0;
    const offsetY = layout.y !== void 0 && layout.y - layout.height / 2 || layout.centerY !== void 0 && layout.centerY || layout.top !== void 0 && layout.top - layout.height / 2 || layout.bottom !== void 0 && layout.bottom + layout.height / 2 || 0;
    this.localTransform.translate(this.width * offsetX, -this.height * offsetY);
  }
  /**
   * Sets up the hit areas by their definitions in settings.
   */
  setupHitAreas() {
    const definitions = this.getHitAreaDefs().filter((hitArea) => hitArea.index >= 0);
    for (const def of definitions) {
      this.hitAreas[def.name] = def;
    }
  }
  /**
   * Hit-test on the model.
   * @param x - Position in model canvas.
   * @param y - Position in model canvas.
   * @return The names of the *hit* hit areas. Can be empty if none is hit.
   */
  hitTest(x, y) {
    return Object.keys(this.hitAreas).filter((hitAreaName) => this.isHit(hitAreaName, x, y));
  }
  /**
   * Hit-test for a single hit area.
   * @param hitAreaName - The hit area's name.
   * @param x - Position in model canvas.
   * @param y - Position in model canvas.
   * @return True if hit.
   */
  isHit(hitAreaName, x, y) {
    if (!this.hitAreas[hitAreaName]) {
      return false;
    }
    const drawIndex = this.hitAreas[hitAreaName].index;
    const bounds = this.getDrawableBounds(drawIndex, tempBounds);
    return bounds.x <= x && x <= bounds.x + bounds.width && bounds.y <= y && y <= bounds.y + bounds.height;
  }
  /**
   * Gets a drawable's bounds.
   * @param index - Index of the drawable.
   * @param bounds - Object to store the output values.
   * @return The bounds in model canvas space.
   */
  getDrawableBounds(index, bounds) {
    const vertices = this.getDrawableVertices(index);
    let left = vertices[0];
    let right = vertices[0];
    let top = vertices[1];
    let bottom = vertices[1];
    for (let i = 0; i < vertices.length; i += 2) {
      const vx = vertices[i];
      const vy = vertices[i + 1];
      left = Math.min(vx, left);
      right = Math.max(vx, right);
      top = Math.min(vy, top);
      bottom = Math.max(vy, bottom);
    }
    bounds != null ? bounds : bounds = {};
    bounds.x = left;
    bounds.y = top;
    bounds.width = right - left;
    bounds.height = bottom - top;
    return bounds;
  }
  /**
   * Updates the model's transform.
   * @param transform - The world transform.
   */
  updateTransform(transform) {
    this.drawingMatrix.copyFrom(transform).append(this.localTransform);
  }
  /**
   * Updates the model's parameters.
   * @param dt - Elapsed time in milliseconds from last frame.
   * @param now - Current time in milliseconds.
   */
  update(dt, now) {
    this.focusController.update(dt);
  }
  /**
   * Sets the lip sync value.
   * @param value - Lip sync value (0-1).
   */
  setLipSyncValue(value) {
    this.lipSyncValue = Math.max(0, Math.min(1, value));
  }
  /**
   * Enables or disables lip sync.
   * @param enabled - Whether to enable lip sync.
   */
  setLipSyncEnabled(enabled) {
    this.lipSyncEnabled = enabled;
  }
  /**
   * Enables or disables auto eye blinking.
   * @param enabled - Whether to enable auto eye blinking.
   */
  setEyeBlinkEnabled(enabled) {
    this.eyeBlinkEnabled = enabled;
  }
  /**
   * Gets current auto eye blinking enabled state.
   * @return Whether auto eye blinking is enabled.
   */
  isEyeBlinkEnabled() {
    return this.eyeBlinkEnabled;
  }
  /**
   * Destroys the model and all related resources.
   * @emits {@link InternalModelEvents.destroy | destroy}
   */
  destroy() {
    this.destroyed = true;
    this.emit("destroy");
    this.motionManager.destroy();
    this.motionManager = void 0;
  }
}
const TAG$1 = "XHRLoader";
class NetworkError extends Error {
  constructor(message, url, status, aborted = false) {
    super(message);
    this.url = url;
    this.status = status;
    this.aborted = aborted;
  }
}
const _XHRLoader = class _XHRLoader {
  /**
   * Creates a managed XHR.
   * @param target - If provided, the XHR will be canceled when receiving an "destroy" event from the target.
   * @param url - The URL.
   * @param type - The XHR response type.
   * @param onload - Load listener.
   * @param onerror - Error handler.
   */
  static createXHR(target, url, type, onload, onerror) {
    const xhr = new XMLHttpRequest();
    _XHRLoader.allXhrSet.add(xhr);
    if (target) {
      let xhrSet = _XHRLoader.xhrMap.get(target);
      if (!xhrSet) {
        xhrSet = /* @__PURE__ */ new Set([xhr]);
        _XHRLoader.xhrMap.set(target, xhrSet);
      } else {
        xhrSet.add(xhr);
      }
      if (!target.listeners("destroy").includes(_XHRLoader.cancelXHRs)) {
        target.once("destroy", _XHRLoader.cancelXHRs);
      }
    }
    xhr.open("GET", url);
    xhr.responseType = type;
    xhr.onload = () => {
      if ((xhr.status === 200 || xhr.status === 0) && xhr.response) {
        onload(xhr.response);
      } else {
        xhr.onerror();
      }
    };
    xhr.onerror = () => {
      logger.warn(
        TAG$1,
        `Failed to load resource as ${xhr.responseType} (Status ${xhr.status}): ${url}`
      );
      onerror(new NetworkError("Network error.", url, xhr.status));
    };
    xhr.onabort = () => onerror(new NetworkError("Aborted.", url, xhr.status, true));
    xhr.onloadend = () => {
      var _a;
      _XHRLoader.allXhrSet.delete(xhr);
      if (target) {
        (_a = _XHRLoader.xhrMap.get(target)) == null ? void 0 : _a.delete(xhr);
      }
    };
    return xhr;
  }
  /**
   * Cancels all XHRs related to this target.
   */
  static cancelXHRs() {
    var _a;
    (_a = _XHRLoader.xhrMap.get(this)) == null ? void 0 : _a.forEach((xhr) => {
      xhr.abort();
      _XHRLoader.allXhrSet.delete(xhr);
    });
    _XHRLoader.xhrMap.delete(this);
  }
  /**
   * Release all XHRs.
   */
  static release() {
    _XHRLoader.allXhrSet.forEach((xhr) => xhr.abort());
    _XHRLoader.allXhrSet.clear();
    _XHRLoader.xhrMap = /* @__PURE__ */ new WeakMap();
  }
};
/**
 * All the created XHRs, keyed by their owners respectively.
 */
__publicField(_XHRLoader, "xhrMap", /* @__PURE__ */ new WeakMap());
/**
 * All the created XHRs as a flat array.
 */
__publicField(_XHRLoader, "allXhrSet", /* @__PURE__ */ new Set());
/**
 * Middleware for Live2DLoader.
 */
__publicField(_XHRLoader, "loader", (context, next) => {
  return new Promise((resolve, reject) => {
    const xhr = _XHRLoader.createXHR(
      context.target,
      context.settings ? context.settings.resolveURL(context.url) : context.url,
      context.type,
      (data) => {
        context.result = data;
        resolve();
      },
      reject
    );
    xhr.send();
  });
});
let XHRLoader = _XHRLoader;
function runMiddlewares(middleware, context) {
  let index = -1;
  return dispatch(0);
  function dispatch(i, err) {
    if (err) return Promise.reject(err);
    if (i <= index) return Promise.reject(new Error("next() called multiple times"));
    index = i;
    const fn = middleware[i];
    if (!fn) return Promise.resolve();
    try {
      return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
    } catch (err2) {
      return Promise.reject(err2);
    }
  }
}
class Live2DLoader {
  /**
   * Loads a resource.
   * @return Promise that resolves with the loaded data in a format that's consistent with the specified `type`.
   */
  static load(context) {
    return runMiddlewares(this.middlewares, context).then(() => context.result);
  }
}
__publicField(Live2DLoader, "middlewares", [XHRLoader.loader]);
function createTexture(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    try {
      const texture = yield Assets.load(url);
      return texture;
    } catch (e) {
      if (e instanceof Error) {
        throw e;
      }
      const err = new Error("Texture loading error");
      err.event = e;
      throw err;
    }
  });
}
function noop() {
}
const TAG = "Live2DFactory";
const urlToJSON = (context, next) => __async(null, null, function* () {
  if (typeof context.source === "string") {
    const data = yield Live2DLoader.load({
      url: context.source,
      type: "json",
      target: context.live2dModel
    });
    data.url = context.source;
    context.source = data;
    context.live2dModel.emit("settingsJSONLoaded", data);
  }
  return next();
});
const jsonToSettings = (context, next) => __async(null, null, function* () {
  if (context.source instanceof ModelSettings) {
    context.settings = context.source;
    return next();
  } else if (typeof context.source === "object") {
    const runtime = Live2DFactory.findRuntime(context.source);
    if (runtime) {
      const settings = runtime.createModelSettings(context.source);
      context.settings = settings;
      context.live2dModel.emit("settingsLoaded", settings);
      return next();
    }
  }
  throw new TypeError("Unknown settings format.");
});
const waitUntilReady = (context, next) => {
  if (context.settings) {
    const runtime = Live2DFactory.findRuntime(context.settings);
    if (runtime) {
      return runtime.ready().then(next);
    }
  }
  return next();
};
const setupOptionals = (context, next) => __async(null, null, function* () {
  yield next();
  const internalModel = context.internalModel;
  if (internalModel) {
    const settings = context.settings;
    const runtime = Live2DFactory.findRuntime(settings);
    if (runtime) {
      const tasks = [];
      if (settings.pose) {
        tasks.push(
          Live2DLoader.load({
            settings,
            url: settings.pose,
            type: "json",
            target: internalModel
          }).then((data) => {
            internalModel.pose = runtime.createPose(internalModel.coreModel, data);
            context.live2dModel.emit("poseLoaded", internalModel.pose);
          }).catch((e) => {
            context.live2dModel.emit("poseLoadError", e);
            logger.warn(TAG, "Failed to load pose.", e);
          })
        );
      }
      if (settings.physics) {
        tasks.push(
          Live2DLoader.load({
            settings,
            url: settings.physics,
            type: "json",
            target: internalModel
          }).then((data) => {
            internalModel.physics = runtime.createPhysics(
              internalModel.coreModel,
              data
            );
            context.live2dModel.emit("physicsLoaded", internalModel.physics);
          }).catch((e) => {
            context.live2dModel.emit("physicsLoadError", e);
            logger.warn(TAG, "Failed to load physics.", e);
          })
        );
      }
      if (tasks.length) {
        yield Promise.all(tasks);
      }
    }
  }
});
const setupEssentials = (context, next) => __async(null, null, function* () {
  if (context.settings) {
    const live2DModel = context.live2dModel;
    const loadingTextures = Promise.all(
      context.settings.textures.map((tex) => {
        const url = context.settings.resolveURL(tex);
        return createTexture(url, { crossOrigin: context.options.crossOrigin });
      })
    );
    loadingTextures.catch(noop);
    yield next();
    if (context.internalModel) {
      live2DModel.internalModel = context.internalModel;
      live2DModel.emit("modelLoaded", context.internalModel);
    } else {
      throw new TypeError("Missing internal model.");
    }
    live2DModel.textures = yield loadingTextures;
    live2DModel.emit("textureLoaded", live2DModel.textures);
  } else {
    throw new TypeError("Missing settings.");
  }
});
const createInternalModel = (context, next) => __async(null, null, function* () {
  const settings = context.settings;
  if (settings instanceof ModelSettings) {
    const runtime = Live2DFactory.findRuntime(settings);
    if (!runtime) {
      throw new TypeError("Unknown model settings.");
    }
    const modelData = yield Live2DLoader.load({
      settings,
      url: settings.moc,
      type: "arraybuffer",
      target: context.live2dModel
    });
    if (!runtime.isValidMoc(modelData)) {
      throw new Error("Invalid moc data");
    }
    const coreModel = runtime.createCoreModel(modelData);
    context.internalModel = runtime.createInternalModel(coreModel, settings, context.options);
    return next();
  }
  throw new TypeError("Missing settings.");
});
const _ZipLoader = class _ZipLoader {
  static unzip(reader, settings) {
    return __async(this, null, function* () {
      const filePaths = yield _ZipLoader.getFilePaths(reader);
      const requiredFilePaths = [];
      for (const definedFile of settings.getDefinedFiles()) {
        const actualPath = decodeURI(new URL(definedFile, settings.url).href);
        if (filePaths.includes(actualPath)) {
          requiredFilePaths.push(actualPath);
        }
      }
      const files = yield _ZipLoader.getFiles(reader, requiredFilePaths);
      for (let i = 0; i < files.length; i++) {
        const path = requiredFilePaths[i];
        const file = files[i];
        Object.defineProperty(file, "webkitRelativePath", {
          value: path
        });
      }
      return files;
    });
  }
  static createSettings(reader) {
    return __async(this, null, function* () {
      const filePaths = yield _ZipLoader.getFilePaths(reader);
      const settingsFilePath = filePaths.find(
        (path) => path.endsWith("model.json") || path.endsWith("model3.json")
      );
      if (!settingsFilePath) {
        throw new Error("Settings file not found");
      }
      const settingsText = yield _ZipLoader.readText(reader, settingsFilePath);
      if (!settingsText) {
        throw new Error("Empty settings file: " + settingsFilePath);
      }
      const settingsJSON = JSON.parse(settingsText);
      settingsJSON.url = settingsFilePath;
      const runtime = _ZipLoader.live2dFactory.findRuntime(settingsJSON);
      if (!runtime) {
        throw new Error("Unknown settings JSON");
      }
      return runtime.createModelSettings(settingsJSON);
    });
  }
  static zipReader(data, url) {
    return __async(this, null, function* () {
      throw new Error("Not implemented");
    });
  }
  static getFilePaths(reader) {
    return __async(this, null, function* () {
      throw new Error("Not implemented");
    });
  }
  static getFiles(reader, paths) {
    return __async(this, null, function* () {
      throw new Error("Not implemented");
    });
  }
  static readText(reader, path) {
    return __async(this, null, function* () {
      throw new Error("Not implemented");
    });
  }
  static releaseReader(reader) {
  }
};
// will be set by Live2DFactory
__publicField(_ZipLoader, "live2dFactory");
__publicField(_ZipLoader, "ZIP_PROTOCOL", "zip://");
__publicField(_ZipLoader, "uid", 0);
__publicField(_ZipLoader, "factory", (context, next) => __async(null, null, function* () {
  const source = context.source;
  let sourceURL;
  let zipBlob;
  let settings;
  if (typeof source === "string" && (source.endsWith(".zip") || source.startsWith(_ZipLoader.ZIP_PROTOCOL))) {
    if (source.startsWith(_ZipLoader.ZIP_PROTOCOL)) {
      sourceURL = source.slice(_ZipLoader.ZIP_PROTOCOL.length);
    } else {
      sourceURL = source;
    }
    zipBlob = yield Live2DLoader.load({
      url: sourceURL,
      type: "blob",
      target: context.live2dModel
    });
  } else if (Array.isArray(source) && source.length === 1 && source[0] instanceof File && source[0].name.endsWith(".zip")) {
    zipBlob = source[0];
    sourceURL = URL.createObjectURL(zipBlob);
    settings = source.settings;
  }
  if (zipBlob) {
    if (!zipBlob.size) {
      throw new Error("Empty zip file");
    }
    const reader = yield _ZipLoader.zipReader(zipBlob, sourceURL);
    if (!settings) {
      settings = yield _ZipLoader.createSettings(reader);
    }
    settings._objectURL = _ZipLoader.ZIP_PROTOCOL + _ZipLoader.uid + "/" + settings.url;
    const files = yield _ZipLoader.unzip(reader, settings);
    files.settings = settings;
    context.source = files;
    if (sourceURL.startsWith("blob:")) {
      context.live2dModel.once("modelLoaded", (internalModel) => {
        internalModel.once("destroy", function() {
          URL.revokeObjectURL(sourceURL);
        });
      });
    }
    _ZipLoader.releaseReader(reader);
  }
  return next();
}));
let ZipLoader = _ZipLoader;
const _FileLoader = class _FileLoader {
  /**
   * Resolves the path of a resource file to the object URL.
   * @param settingsURL - Object URL of the settings file.
   * @param filePath - Resource file path.
   * @return Resolved object URL.
   */
  static resolveURL(settingsURL, filePath) {
    var _a;
    const resolved = (_a = _FileLoader.filesMap[settingsURL]) == null ? void 0 : _a[filePath];
    if (resolved === void 0) {
      throw new Error("Cannot find this file from uploaded files: " + filePath);
    }
    return resolved;
  }
  /**
   * Consumes the files by storing their object URLs. Files not defined in the settings will be ignored.
   */
  static upload(files, settings) {
    return __async(this, null, function* () {
      const fileMap = {};
      for (const definedFile of settings.getDefinedFiles()) {
        const actualPath = decodeURI(new URL(definedFile, settings.url).href);
        const actualFile = files.find((file) => file.webkitRelativePath === actualPath);
        if (actualFile) {
          fileMap[definedFile] = URL.createObjectURL(actualFile);
        }
      }
      _FileLoader.filesMap[settings._objectURL] = fileMap;
    });
  }
  /**
   * Creates a ModelSettings by given files.
   * @return Promise that resolves with the created ModelSettings.
   */
  static createSettings(files) {
    return __async(this, null, function* () {
      const settingsFile = files.find(
        (file) => file.name.endsWith("model.json") || file.name.endsWith("model3.json")
      );
      if (!settingsFile) {
        throw new TypeError("Settings file not found");
      }
      const settingsText = yield _FileLoader.readText(settingsFile);
      const settingsJSON = JSON.parse(settingsText);
      settingsJSON.url = settingsFile.webkitRelativePath;
      const runtime = Live2DFactory.findRuntime(settingsJSON);
      if (!runtime) {
        throw new Error("Unknown settings JSON");
      }
      const settings = runtime.createModelSettings(settingsJSON);
      settings._objectURL = URL.createObjectURL(settingsFile);
      return settings;
    });
  }
  /**
   * Reads a file as text in UTF-8.
   */
  static readText(file) {
    return __async(this, null, function* () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file, "utf8");
      });
    });
  }
};
// will be set by Live2DFactory
__publicField(_FileLoader, "live2dFactory");
/**
 * Stores all the object URLs of uploaded files.
 */
__publicField(_FileLoader, "filesMap", {});
/**
 * Middleware for Live2DFactory.
 */
__publicField(_FileLoader, "factory", (context, next) => __async(null, null, function* () {
  if (Array.isArray(context.source) && context.source[0] instanceof File) {
    const files = context.source;
    let settings = files.settings;
    if (!settings) {
      settings = yield _FileLoader.createSettings(files);
    } else if (!settings._objectURL) {
      throw new Error('"_objectURL" must be specified in ModelSettings');
    }
    settings.validateFiles(files.map((file) => encodeURI(file.webkitRelativePath)));
    yield _FileLoader.upload(files, settings);
    settings.resolveURL = function(url) {
      return _FileLoader.resolveURL(this._objectURL, url);
    };
    context.source = settings;
    context.live2dModel.once("modelLoaded", (internalModel) => {
      internalModel.once("destroy", function() {
        const objectURL = this.settings._objectURL;
        URL.revokeObjectURL(objectURL);
        if (_FileLoader.filesMap[objectURL]) {
          for (const resourceObjectURL of Object.values(
            _FileLoader.filesMap[objectURL]
          )) {
            URL.revokeObjectURL(resourceObjectURL);
          }
        }
        delete _FileLoader.filesMap[objectURL];
      });
    });
  }
  return next();
}));
let FileLoader = _FileLoader;
const _Live2DFactory = class _Live2DFactory {
  /**
   * Registers a Live2DRuntime.
   */
  static registerRuntime(runtime) {
    _Live2DFactory.runtimes.push(runtime);
    _Live2DFactory.runtimes.sort((a, b) => b.version - a.version);
  }
  /**
   * Finds a runtime that matches given source.
   * @param source - Either a settings JSON object or a ModelSettings instance.
   * @return The Live2DRuntime, or undefined if not found.
   */
  static findRuntime(source) {
    for (const runtime of _Live2DFactory.runtimes) {
      if (runtime.test(source)) {
        return runtime;
      }
    }
  }
  /**
   * Sets up a Live2DModel, populating it with all defined resources.
   * @param live2dModel - The Live2DModel instance.
   * @param source - Can be one of: settings file URL, settings JSON object, ModelSettings instance.
   * @param options - Options for the process.
   * @return Promise that resolves when all resources have been loaded, rejects when error occurs.
   */
  static setupLive2DModel(live2dModel, source, options) {
    return __async(this, null, function* () {
      const textureLoaded = new Promise((resolve) => live2dModel.once("textureLoaded", resolve));
      const modelLoaded = new Promise((resolve) => live2dModel.once("modelLoaded", resolve));
      const readyEventEmitted = Promise.all([textureLoaded, modelLoaded]).then(
        () => live2dModel.emit("ready")
      );
      yield runMiddlewares(_Live2DFactory.live2DModelMiddlewares, {
        live2dModel,
        source,
        options: options || {}
      });
      yield readyEventEmitted;
      live2dModel.emit("load");
    });
  }
  /**
   * Loads a Motion and registers the task to {@link motionTasksMap}. The task will be automatically
   * canceled when its owner - the MotionManager instance - has been destroyed.
   * @param motionManager - MotionManager that owns this Motion.
   * @param group - The motion group.
   * @param index - Index in the motion group.
   * @return Promise that resolves with the Motion, or with undefined if it can't be loaded.
   */
  static loadMotion(motionManager, group, index) {
    var _a, _b;
    const handleError = (e) => motionManager.emit("motionLoadError", group, index, e);
    try {
      const definition = (_a = motionManager.definitions[group]) == null ? void 0 : _a[index];
      if (!definition) {
        return Promise.resolve(void 0);
      }
      if (!motionManager.listeners("destroy").includes(_Live2DFactory.releaseTasks)) {
        motionManager.once("destroy", _Live2DFactory.releaseTasks);
      }
      let tasks = _Live2DFactory.motionTasksMap.get(motionManager);
      if (!tasks) {
        tasks = {};
        _Live2DFactory.motionTasksMap.set(motionManager, tasks);
      }
      let taskGroup = tasks[group];
      if (!taskGroup) {
        taskGroup = [];
        tasks[group] = taskGroup;
      }
      const path = motionManager.getMotionFile(definition);
      const runtime = _Live2DFactory.findRuntime(motionManager.settings);
      const loadType = (runtime == null ? void 0 : runtime.constructor.name) === "Cubism5Runtime" ? "text" : "json";
      (_b = taskGroup[index]) != null ? _b : taskGroup[index] = Live2DLoader.load({
        url: path,
        settings: motionManager.settings,
        type: loadType,
        target: motionManager
      }).then((data) => {
        var _a2;
        const taskGroup2 = (_a2 = _Live2DFactory.motionTasksMap.get(motionManager)) == null ? void 0 : _a2[group];
        if (taskGroup2) {
          delete taskGroup2[index];
        }
        const motion = motionManager.createMotion(data, group, definition);
        motionManager.emit("motionLoaded", group, index, motion);
        return motion;
      }).catch((e) => {
        logger.warn(motionManager.tag, `Failed to load motion: ${path}
`, e);
        handleError(e);
      });
      return taskGroup[index];
    } catch (e) {
      logger.warn(motionManager.tag, `Failed to load motion at "${group}"[${index}]
`, e);
      handleError(e);
    }
    return Promise.resolve(void 0);
  }
  /**
   * Loads an Expression and registers the task to {@link expressionTasksMap}. The task will be automatically
   * canceled when its owner - the ExpressionManager instance - has been destroyed.
   * @param expressionManager - ExpressionManager that owns this Expression.
   * @param index - Index of the Expression.
   * @return Promise that resolves with the Expression, or with undefined if it can't be loaded.
   */
  static loadExpression(expressionManager, index) {
    var _a;
    const handleError = (e) => expressionManager.emit("expressionLoadError", index, e);
    try {
      const definition = expressionManager.definitions[index];
      if (!definition) {
        return Promise.resolve(void 0);
      }
      if (!expressionManager.listeners("destroy").includes(_Live2DFactory.releaseTasks)) {
        expressionManager.once("destroy", _Live2DFactory.releaseTasks);
      }
      let tasks = _Live2DFactory.expressionTasksMap.get(expressionManager);
      if (!tasks) {
        tasks = [];
        _Live2DFactory.expressionTasksMap.set(expressionManager, tasks);
      }
      const path = expressionManager.getExpressionFile(definition);
      (_a = tasks[index]) != null ? _a : tasks[index] = Live2DLoader.load({
        url: path,
        settings: expressionManager.settings,
        type: "json",
        target: expressionManager
      }).then((data) => {
        const tasks2 = _Live2DFactory.expressionTasksMap.get(expressionManager);
        if (tasks2) {
          delete tasks2[index];
        }
        const expression = expressionManager.createExpression(data, definition);
        expressionManager.emit("expressionLoaded", index, expression);
        return expression;
      }).catch((e) => {
        logger.warn(expressionManager.tag, `Failed to load expression: ${path}
`, e);
        handleError(e);
      });
      return tasks[index];
    } catch (e) {
      logger.warn(expressionManager.tag, `Failed to load expression at [${index}]
`, e);
      handleError(e);
    }
    return Promise.resolve(void 0);
  }
  static releaseTasks() {
    if (this instanceof MotionManager) {
      _Live2DFactory.motionTasksMap.delete(this);
    } else {
      _Live2DFactory.expressionTasksMap.delete(this);
    }
  }
};
/**
 * All registered runtimes, sorted by versions in descending order.
 */
__publicField(_Live2DFactory, "runtimes", []);
__publicField(_Live2DFactory, "urlToJSON", urlToJSON);
__publicField(_Live2DFactory, "jsonToSettings", jsonToSettings);
__publicField(_Live2DFactory, "waitUntilReady", waitUntilReady);
__publicField(_Live2DFactory, "setupOptionals", setupOptionals);
__publicField(_Live2DFactory, "setupEssentials", setupEssentials);
__publicField(_Live2DFactory, "createInternalModel", createInternalModel);
/**
 * Middlewares to run through when setting up a Live2DModel.
 */
__publicField(_Live2DFactory, "live2DModelMiddlewares", [
  ZipLoader.factory,
  FileLoader.factory,
  urlToJSON,
  jsonToSettings,
  waitUntilReady,
  setupOptionals,
  setupEssentials,
  createInternalModel
]);
/**
 * load tasks of each motion. The structure of each value in this map
 * is the same as respective {@link MotionManager.definitions}.
 */
__publicField(_Live2DFactory, "motionTasksMap", /* @__PURE__ */ new WeakMap());
/**
 * Load tasks of each expression.
 */
__publicField(_Live2DFactory, "expressionTasksMap", /* @__PURE__ */ new WeakMap());
let Live2DFactory = _Live2DFactory;
MotionManager.prototype["_loadMotion"] = function(group, index) {
  return Live2DFactory.loadMotion(this, group, index);
};
ExpressionManager.prototype["_loadExpression"] = function(index) {
  return Live2DFactory.loadExpression(this, index);
};
FileLoader["live2dFactory"] = Live2DFactory;
ZipLoader["live2dFactory"] = Live2DFactory;
const _Automator = class _Automator {
  constructor(model, {
    autoUpdate = true,
    autoHitTest = true,
    autoFocus = true,
    autoInteract,
    ticker
  } = {}) {
    __publicField(this, "model");
    __publicField(this, "destroyed", false);
    __publicField(this, "_ticker");
    __publicField(this, "_autoUpdate", false);
    __publicField(this, "_autoHitTest", false);
    __publicField(this, "_autoFocus", false);
    if (!ticker) {
      if (_Automator.defaultTicker) {
        ticker = _Automator.defaultTicker;
      } else if (typeof PIXI !== "undefined") {
        ticker = PIXI.Ticker.shared;
      }
    }
    if (autoInteract !== void 0) {
      autoHitTest = autoInteract;
      autoFocus = autoInteract;
      logger.warn(
        model.tag,
        "options.autoInteract is deprecated since v0.5.0, use autoHitTest and autoFocus instead."
      );
    }
    this.model = model;
    this.ticker = ticker;
    this.autoUpdate = autoUpdate;
    this.autoHitTest = autoHitTest;
    this.autoFocus = autoFocus;
    if (autoHitTest || autoFocus) {
      this.model.eventMode = "static";
    }
  }
  get ticker() {
    return this._ticker;
  }
  set ticker(ticker) {
    var _a;
    if (this._ticker) {
      this._ticker.remove(onTickerUpdate, this);
    }
    this._ticker = ticker;
    if (this._autoUpdate) {
      (_a = this._ticker) == null ? void 0 : _a.add(onTickerUpdate, this);
    }
  }
  /**
   * @see {@link AutomatorOptions.autoUpdate}
   */
  get autoUpdate() {
    return this._autoUpdate;
  }
  set autoUpdate(autoUpdate) {
    var _a;
    if (this.destroyed) {
      return;
    }
    if (autoUpdate) {
      if (this._ticker) {
        this._ticker.add(onTickerUpdate, this);
        this._autoUpdate = true;
      } else {
        logger.warn(
          this.model.tag,
          "No Ticker to be used for automatic updates. Either set option.ticker when creating Live2DModel, or expose PIXI to global scope (window.PIXI = PIXI)."
        );
      }
    } else {
      (_a = this._ticker) == null ? void 0 : _a.remove(onTickerUpdate, this);
      this._autoUpdate = false;
    }
  }
  /**
   * @see {@link AutomatorOptions.autoHitTest}
   */
  get autoHitTest() {
    return this._autoHitTest;
  }
  set autoHitTest(autoHitTest) {
    if (autoHitTest !== this.autoHitTest) {
      if (autoHitTest) {
        this.model.on("pointertap", onTap, this);
      } else {
        this.model.off("pointertap", onTap, this);
      }
      this._autoHitTest = autoHitTest;
    }
  }
  /**
   * @see {@link AutomatorOptions.autoFocus}
   */
  get autoFocus() {
    return this._autoFocus;
  }
  set autoFocus(autoFocus) {
    if (autoFocus !== this.autoFocus) {
      if (autoFocus) {
        this.model.on("globalpointermove", onPointerMove, this);
      } else {
        this.model.off("globalpointermove", onPointerMove, this);
      }
      this._autoFocus = autoFocus;
    }
  }
  /**
   * @see {@link AutomatorOptions.autoInteract}
   */
  get autoInteract() {
    return this._autoHitTest && this._autoFocus;
  }
  set autoInteract(autoInteract) {
    this.autoHitTest = autoInteract;
    this.autoFocus = autoInteract;
  }
  onTickerUpdate() {
    const deltaMS = this.ticker.deltaMS;
    this.model.update(deltaMS);
  }
  onTap(event) {
    this.model.tap(event.global.x, event.global.y);
  }
  onPointerMove(event) {
    this.model.focus(event.global.x, event.global.y);
  }
  destroy() {
    this.autoFocus = false;
    this.autoHitTest = false;
    this.autoUpdate = false;
    this.ticker = void 0;
    this.destroyed = true;
  }
};
__publicField(_Automator, "defaultTicker");
let Automator = _Automator;
function onTickerUpdate() {
  this.onTickerUpdate();
}
function onTap(event) {
  this.onTap(event);
}
function onPointerMove(event) {
  this.onPointerMove(event);
}
class Live2DTransform extends Transform {
}
const tempPoint = new Point();
const tempMatrix$1 = new Matrix();
class Live2DModel extends Container {
  constructor(options) {
    super();
    /**
     * Tag for logging.
     */
    __publicField(this, "tag", "Live2DModel(uninitialized)");
    /**
     * The internal model. Will be undefined until the "ready" event is emitted.
     */
    __publicField(this, "internalModel");
    /**
     * Pixi textures.
     */
    __publicField(this, "textures", []);
    /** @override */
    __publicField(this, "transform", new Live2DTransform());
    /**
     * The anchor behaves like the one in `PIXI.Sprite`, where `(0, 0)` means the top left
     * and `(1, 1)` means the bottom right.
     */
    __publicField(this, "anchor", new ObservablePoint({ _onUpdate: this.onAnchorChange.bind(this) }, 0, 0));
    // cast the type because it breaks the casting of Live2DModel
    /**
     * An ID of Gl context that syncs with `renderer.CONTEXT_UID`. Used to check if the GL context has changed.
     */
    __publicField(this, "glContextID", -1);
    /**
     * Cached renderer reference for type safety
     */
    __publicField(this, "renderer");
    /**
     * Elapsed time in milliseconds since created.
     */
    __publicField(this, "elapsedTime", 0);
    /**
     * Elapsed time in milliseconds from last frame to this frame.
     */
    __publicField(this, "deltaTime", 0);
    __publicField(this, "automator");
    /**
     * Audio analyzer for speech recognition and lip sync.
     */
    __publicField(this, "audioAnalyzer", null);
    /**
     * Current speaking state.
     */
    __publicField(this, "isSpeaking", false);
    __publicField(this, "_interactionRegistered", false);
    this.automator = new Automator(this, options);
    this.onRender = this._onRenderCallback.bind(this);
    this.once("modelLoaded", () => this.init(options));
  }
  /**
   * Creates a Live2DModel from given source.
   * @param source - Can be one of: settings file URL, settings JSON object, ModelSettings instance.
   * @param options - Options for the creation.
   * @return Promise that resolves with the Live2DModel.
   */
  static from(source, options) {
    const model = new this(options);
    return Live2DFactory.setupLive2DModel(model, source, options).then(() => model);
  }
  /**
   * Synchronous version of `Live2DModel.from()`. This method immediately returns a Live2DModel instance,
   * whose resources have not been loaded. Therefore this model can't be manipulated or rendered
   * until the "load" event has been emitted.
   *
   * ```js
   * // no `await` here as it's not a Promise
   * const model = Live2DModel.fromSync('shizuku.model.json');
   *
   * // these will cause errors!
   * // app.stage.addChild(model);
   * // model.motion('tap_body');
   *
   * model.once('load', () => {
   *     // now it's safe
   *     app.stage.addChild(model);
   *     model.motion('tap_body');
   * });
   * ```
   */
  static fromSync(source, options) {
    const model = new this(options);
    Live2DFactory.setupLive2DModel(model, source, options).then(options == null ? void 0 : options.onLoad).catch(options == null ? void 0 : options.onError);
    return model;
  }
  /**
   * Registers the class of `PIXI.Ticker` for auto updating.
   * @deprecated Use {@link Live2DModelOptions.ticker} instead.
   */
  static registerTicker(tickerClass) {
    Automator["defaultTicker"] = tickerClass.shared;
  }
  /**
   * Sets the renderer reference for type safety
   */
  setRenderer(renderer) {
    if (this.isWebGLRenderer(renderer)) {
      this.renderer = renderer;
    }
    if (renderer.canvas) {
      this.registerInteraction(renderer.canvas);
    }
  }
  /**
   * Type guard to check if renderer is WebGLRenderer
   */
  isWebGLRenderer(renderer) {
    return "gl" in renderer && renderer.gl instanceof WebGL2RenderingContext;
  }
  // TODO: rename
  /**
   * A handler of the "modelLoaded" event, invoked when the internal model has been loaded.
   */
  init(_options) {
    if (!this.isReady()) {
      return;
    }
    this.tag = `Live2DModel(${this.internalModel.settings.name})`;
    this.updateBoundsArea();
  }
  /**
   * Checks if the model is ready (internal model is loaded).
   */
  isReady() {
    return this.internalModel !== void 0;
  }
  /**
   * Checks if the model can render (ready and has textures).
   */
  canRender() {
    return this.isReady() && this.textures.length > 0;
  }
  /**
   * Checks if the renderer is available and valid.
   */
  hasValidRenderer() {
    return this.renderer !== void 0 && this.renderer.gl instanceof WebGL2RenderingContext;
  }
  /**
   * Type guard for WebGLTexture
   */
  isWebGLTexture(texture) {
    return texture instanceof WebGLTexture;
  }
  /**
   * Extracts WebGLTexture from PixiJS texture with proper type safety
   */
  extractWebGLTexture(renderer, texture) {
    if (!renderer.texture || !texture.source) {
      return null;
    }
    try {
      const glSource = renderer.texture.getGlSource(texture.source);
      if (glSource && glSource.texture) {
        return glSource.texture;
      }
      const textureSourceWithGL = texture.source;
      if (textureSourceWithGL == null ? void 0 : textureSourceWithGL._glTextures) {
        const contextTextures = textureSourceWithGL._glTextures[this.glContextID];
        return (contextTextures == null ? void 0 : contextTextures.texture) || contextTextures;
      }
    } catch (error) {
      console.warn("Failed to extract WebGL texture:", error);
    }
    return null;
  }
  /**
   * A callback that observes {@link anchor}, invoked when the anchor's values have been changed.
   */
  onAnchorChange() {
    if (this.isReady()) {
      this.pivot.set(
        this.anchor.x * this.internalModel.width,
        this.anchor.y * this.internalModel.height
      );
    }
  }
  /**
   * Shorthand to start a motion.
   * @param group - The motion group.
   * @param index - The index in this group. If not presented, a random motion will be started.
   * @param priority - The motion priority. Defaults to `MotionPriority.NORMAL`.
   * @return Promise that resolves with true if the motion is successfully started, with false otherwise.
   */
  motion(group, index, priority) {
    if (!this.isReady()) {
      return Promise.resolve(false);
    }
    return index === void 0 ? this.internalModel.motionManager.startRandomMotion(group, priority) : this.internalModel.motionManager.startMotion(group, index, priority);
  }
  /**
   * Shorthand to set an expression.
   * @param id - Either the index, or the name of the expression. If not presented, a random expression will be set.
   * @return Promise that resolves with true if succeeded, with false otherwise.
   */
  expression(id) {
    if (!this.isReady() || !this.internalModel.motionManager.expressionManager) {
      return Promise.resolve(false);
    }
    return id === void 0 ? this.internalModel.motionManager.expressionManager.setRandomExpression() : this.internalModel.motionManager.expressionManager.setExpression(id);
  }
  /**
   * Updates the focus position. This will not cause the model to immediately look at the position,
   * instead the movement will be interpolated.
   * @param x - Position in world space.
   * @param y - Position in world space.
   * @param instant - Should the focus position be instantly applied.
   */
  focus(x, y, instant = false) {
    if (!this.isReady()) {
      return;
    }
    tempPoint.x = x;
    tempPoint.y = y;
    this.toModelPosition(tempPoint, tempPoint, true);
    const tx = tempPoint.x / this.internalModel.originalWidth * 2 - 1;
    const ty = tempPoint.y / this.internalModel.originalHeight * 2 - 1;
    const radian = Math.atan2(ty, tx);
    this.internalModel.focusController.focus(Math.cos(radian), -Math.sin(radian), instant);
  }
  /**
   * Tap on the model. This will perform a hit-testing, and emit a "hit" event
   * if at least one of the hit areas is hit.
   * @param x - Position in world space.
   * @param y - Position in world space.
   * @emits {@link Live2DModelEvents.hit}
   */
  tap(x, y) {
    const hitAreaNames = this.hitTest(x, y);
    if (hitAreaNames.length) {
      logger.log(this.tag, `Hit`, hitAreaNames);
      this.emit("hit", hitAreaNames);
    }
  }
  /**
   * Hit-test on the model.
   * @param x - Position in world space.
   * @param y - Position in world space.
   * @return The names of the *hit* hit areas. Can be empty if none is hit.
   */
  hitTest(x, y) {
    if (!this.isReady()) {
      return [];
    }
    tempPoint.x = x;
    tempPoint.y = y;
    this.toModelPosition(tempPoint, tempPoint);
    return this.internalModel.hitTest(tempPoint.x, tempPoint.y);
  }
  /**
   * Calculates the position in the canvas of original, unscaled Live2D model.
   * @param position - A Point in world space.
   * @param result - A Point to store the new value. Defaults to a new Point.
   * @param skipUpdate - True to skip the update transform.
   * @return The Point in model canvas space.
   */
  toModelPosition(position, result = position.clone(), _skipUpdate) {
    const localPosition = this.toLocal(position, void 0, result);
    if (this.isReady()) {
      this.internalModel.localTransform.applyInverse(localPosition, localPosition);
    }
    return localPosition;
  }
  /**
   * Registers interaction events directly on the canvas to bypass PixiJS's event system.
   * This is necessary because PixiJS v8's EventSystem can sometimes provide incorrect
   * world coordinates in certain environments (e.g. high DPI, specific scaling),
   * causing hit detection to fail.
   * @param canvas - The HTML canvas element.
   */
  registerInteraction(canvas) {
    if (this._interactionRegistered) return;
    canvas.addEventListener("pointerdown", (e) => {
      if (this.automator.autoInteract) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.tap(x, y);
      }
    });
    this._interactionRegistered = true;
  }
  /**
   * A method required by `PIXI.InteractionManager` to perform hit-testing.
   * @param point - A Point in world space.
   * @return True if the point is inside this model.
   */
  containsPoint(point) {
    return this.getBounds(true).rectangle.contains(point.x, point.y);
  }
  /**
   * Updates the boundsArea based on the internal model dimensions
   */
  updateBoundsArea() {
    if (this.isReady() && this.internalModel.width && this.internalModel.height) {
      this.boundsArea = new Rectangle(0, 0, this.internalModel.width, this.internalModel.height);
    } else if (!this.boundsArea) {
      this.boundsArea = new Rectangle(0, 0, 512, 512);
    }
  }
  /**
   * Gets a unique ID for the WebGL context
   */
  _getContextUID(gl) {
    const contextWithUID = gl;
    if (!contextWithUID._pixiContextUID) {
      contextWithUID._pixiContextUID = Date.now() + Math.random();
    }
    return contextWithUID._pixiContextUID;
  }
  /**
   * Updates the model. Note this method just updates the timer,
   * and the actual update will be done right before rendering the model.
   * @param dt - The elapsed time in milliseconds since last frame.
   */
  update(dt) {
    this.deltaTime += dt;
    this.elapsedTime += dt;
  }
  // In Pixi.js v8, onRender callback doesn't receive renderer parameter
  // We need to access the renderer differently
  _onRenderCallback() {
    var _a, _b, _c, _d;
    let webglRenderer = this.renderer;
    if (!webglRenderer) {
      const app = globalThis.app || window.app;
      if (!(app == null ? void 0 : app.renderer)) {
        return;
      }
      const renderer = app.renderer;
      if (!this.isWebGLRenderer(renderer)) {
        return;
      }
      webglRenderer = renderer;
      this.renderer = webglRenderer;
    }
    if (!this.canRender()) {
      return;
    }
    try {
      let shouldUpdateTexture = false;
      const contextUID = this._getContextUID(webglRenderer.gl);
      if (this.glContextID !== contextUID) {
        this.glContextID = contextUID;
        if (this.isReady()) {
          this.internalModel.updateWebGLContext(webglRenderer.gl, this.glContextID);
        }
        shouldUpdateTexture = true;
      }
      for (let i = 0; i < this.textures.length; i++) {
        const texture = this.textures[i];
        if (!texture.source) {
          continue;
        }
        const textureSourceWithGL = texture.source;
        const shouldUpdate = shouldUpdateTexture || !((_a = textureSourceWithGL == null ? void 0 : textureSourceWithGL._glTextures) == null ? void 0 : _a[this.glContextID]);
        const glTexture = this.extractWebGLTexture(webglRenderer, texture);
        if (this.isWebGLTexture(glTexture) && this.internalModel) {
          if (shouldUpdate) {
            webglRenderer.gl.pixelStorei(
              WebGLRenderingContext.UNPACK_FLIP_Y_WEBGL,
              this.internalModel.textureFlipY
            );
          }
          this.internalModel.bindTexture(i, glTexture);
        }
        if (((_b = webglRenderer.textureGC) == null ? void 0 : _b.count) && texture.source) {
          texture.source.touched = webglRenderer.textureGC.count;
        }
      }
      if (shouldUpdateTexture && this.internalModel) {
        webglRenderer.gl.pixelStorei(
          WebGLRenderingContext.UNPACK_FLIP_Y_WEBGL,
          false
        );
      }
      const viewport = {
        x: 0,
        y: 0,
        width: webglRenderer.width || ((_c = webglRenderer.screen) == null ? void 0 : _c.width) || 800,
        height: webglRenderer.height || ((_d = webglRenderer.screen) == null ? void 0 : _d.height) || 600
      };
      if (this.internalModel) {
        this.internalModel.viewport = [viewport.x, viewport.y, viewport.width, viewport.height];
        if (this.deltaTime) {
          this.internalModel.update(this.deltaTime, this.elapsedTime);
          this.deltaTime = 0;
        }
      }
      const worldTransform = this.worldTransform || this.groupTransform || this.localTransform;
      let projectionMatrix;
      if (webglRenderer.globalUniforms && "projectionMatrix" in webglRenderer.globalUniforms) {
        projectionMatrix = webglRenderer.globalUniforms.projectionMatrix;
      } else {
        projectionMatrix = new Matrix();
        const { width, height } = webglRenderer.screen;
        projectionMatrix.set(2 / width, 0, 0, -2 / height, -1, 1);
      }
      const internalTransform = tempMatrix$1.copyFrom(projectionMatrix).append(worldTransform);
      if (this.internalModel) {
        this.internalModel.updateTransform(internalTransform);
        this.internalModel.draw(webglRenderer.gl);
      }
    } catch (error) {
      console.error("Error in Live2D render callback:", error);
    }
  }
  /**
   * Starts lip sync animation.
   */
  startLipSync() {
    if (this.isReady()) {
      this.internalModel.setLipSyncEnabled(true);
    }
  }
  /**
   * Stops lip sync animation.
   */
  stopLipSync() {
    if (this.isReady()) {
      this.internalModel.setLipSyncEnabled(false);
      this.internalModel.setLipSyncValue(0);
    }
  }
  /**
   * Sets the lip sync value manually.
   * @param value - Lip sync value (0-1), where 0 is closed mouth and 1 is fully open.
   */
  setLipSyncValue(value) {
    if (this.isReady()) {
      this.internalModel.setLipSyncValue(value);
    }
  }
  /**
   * Gets current lip sync enabled state.
   * @return Whether lip sync is enabled.
   */
  isLipSyncEnabled() {
    return this.isReady() ? this.internalModel.lipSyncEnabled : false;
  }
  /**
   * Gets current lip sync value.
   * @return Current lip sync value (0-1).
   */
  getLipSyncValue() {
    return this.isReady() ? this.internalModel.lipSyncValue : 0;
  }
  /**
   * Sets whether eyes should always look at camera regardless of head movement.
   * @param enabled - Whether to lock eyes to camera.
   */
  setEyesAlwaysLookAtCamera(enabled) {
    if (this.isReady()) {
      this.internalModel.eyesAlwaysLookAtCamera = enabled;
    }
  }
  /**
   * Gets whether eyes are locked to camera.
   * @return Whether eyes are locked to camera.
   */
  isEyesAlwaysLookAtCamera() {
    return this.isReady() ? this.internalModel.eyesAlwaysLookAtCamera : false;
  }
  /**
   * Sets whether auto eye blinking is enabled.
   * @param enabled - Whether to enable auto eye blinking.
   */
  setEyeBlinkEnabled(enabled) {
    if (this.isReady()) {
      this.internalModel.setEyeBlinkEnabled(enabled);
    }
  }
  /**
   * Gets whether auto eye blinking is enabled.
   * @return Whether auto eye blinking is enabled.
   */
  isEyeBlinkEnabled() {
    return this.isReady() ? this.internalModel.isEyeBlinkEnabled() : true;
  }
  /**
   * Start speaking with base64 audio data or audio URL.
   * @param audioData - Base64 audio data or audio URL
   * @param options - Speaking options
   */
  speak(_0) {
    return __async(this, arguments, function* (audioData, options = {}) {
      if (!this.isReady()) {
        throw new Error("Model is not ready");
      }
      if (this.isSpeaking) {
        this.stopSpeaking();
      }
      try {
        this.isSpeaking = true;
        if (!this.audioAnalyzer) {
          this.audioAnalyzer = new AudioAnalyzer();
        }
        this.startLipSync();
        yield this.audioAnalyzer.playAndAnalyze(audioData, (volume) => {
          const lipSyncValue = Math.min(1, volume * (options.volume || 1));
          this.setLipSyncValue(lipSyncValue);
        });
        this.isSpeaking = false;
        this.setLipSyncValue(0);
        if (options.onFinish) {
          options.onFinish();
        }
      } catch (error) {
        this.isSpeaking = false;
        this.setLipSyncValue(0);
        const errorObj = error instanceof Error ? error : new Error(String(error));
        if (options.onError) {
          options.onError(errorObj);
        } else {
          console.error("Speaking error:", errorObj);
        }
      }
    });
  }
  /**
   * Stop current speaking.
   */
  stopSpeaking() {
    if (this.audioAnalyzer) {
      this.audioAnalyzer.destroy();
      this.audioAnalyzer = null;
    }
    this.isSpeaking = false;
    this.setLipSyncValue(0);
  }
  /**
   * Check if currently speaking.
   * @return Whether the model is currently speaking.
   */
  isSpeakingNow() {
    return this.isSpeaking;
  }
  /**
   * Start microphone input for real-time lip sync.
   * @param onError - Error callback
   */
  startMicrophoneLipSync(onError) {
    return __async(this, null, function* () {
      if (!this.isReady()) {
        throw new Error("Model is not ready");
      }
      try {
        if (!this.audioAnalyzer) {
          this.audioAnalyzer = new AudioAnalyzer();
        }
        this.startLipSync();
        yield this.audioAnalyzer.startMicrophone((volume) => {
          this.setLipSyncValue(volume);
        });
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        if (onError) {
          onError(errorObj);
        } else {
          console.error("Microphone error:", errorObj);
        }
      }
    });
  }
  /**
   * Stop microphone input.
   */
  stopMicrophoneLipSync() {
    if (this.audioAnalyzer) {
      this.audioAnalyzer.stopMicrophone();
    }
    this.setLipSyncValue(0);
  }
  /**
   * Destroys the model and all related resources. This takes the same options and also
   * behaves the same as `PIXI.Container#destroy`.
   * @param options - Options parameter. A boolean will act as if all options
   *  have been set to that value
   * @param [options.children=false] - if set to true, all the children will have their destroy
   *  method called as well. 'options' will be passed on to those calls.
   * @param [options.texture=false] - Only used for child Sprites if options.children is set to true
   *  Should it destroy the texture of the child sprite
   * @param [options.baseTexture=false] - Only used for child Sprites if options.children is set to true
   *  Should it destroy the base texture of the child sprite
   */
  destroy(options) {
    this.emit("destroy");
    if (options == null ? void 0 : options.texture) {
      this.textures.forEach((texture) => texture.destroy(options.baseTexture));
    }
    this.automator.destroy();
    if (this.audioAnalyzer) {
      this.audioAnalyzer.destroy();
      this.audioAnalyzer = null;
    }
    if (this.isReady()) {
      this.internalModel.destroy();
    }
    super.destroy(options);
  }
}
class CubismVector2 {
  /**
   * コンストラクタ
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.x = x == void 0 ? 0 : x;
    this.y = y == void 0 ? 0 : y;
  }
  /**
   * ベクトルの加算
   *
   * @param vector2 加算するベクトル値
   * @return 加算結果 ベクトル値
   */
  add(vector2) {
    const ret = new CubismVector2(0, 0);
    ret.x = this.x + vector2.x;
    ret.y = this.y + vector2.y;
    return ret;
  }
  /**
   * ベクトルの減算
   *
   * @param vector2 減算するベクトル値
   * @return 減算結果 ベクトル値
   */
  substract(vector2) {
    const ret = new CubismVector2(0, 0);
    ret.x = this.x - vector2.x;
    ret.y = this.y - vector2.y;
    return ret;
  }
  /**
   * ベクトルの乗算
   *
   * @param vector2 乗算するベクトル値
   * @return 乗算結果 ベクトル値
   */
  multiply(vector2) {
    const ret = new CubismVector2(0, 0);
    ret.x = this.x * vector2.x;
    ret.y = this.y * vector2.y;
    return ret;
  }
  /**
   * ベクトルの乗算(スカラー)
   *
   * @param scalar 乗算するスカラー値
   * @return 乗算結果 ベクトル値
   */
  multiplyByScaler(scalar) {
    return this.multiply(new CubismVector2(scalar, scalar));
  }
  /**
   * ベクトルの除算
   *
   * @param vector2 除算するベクトル値
   * @return 除算結果 ベクトル値
   */
  division(vector2) {
    const ret = new CubismVector2(0, 0);
    ret.x = this.x / vector2.x;
    ret.y = this.y / vector2.y;
    return ret;
  }
  /**
   * ベクトルの除算(スカラー)
   *
   * @param scalar 除算するスカラー値
   * @return 除算結果 ベクトル値
   */
  divisionByScalar(scalar) {
    return this.division(new CubismVector2(scalar, scalar));
  }
  /**
   * ベクトルの長さを取得する
   *
   * @return ベクトルの長さ
   */
  getLength() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  /**
   * ベクトルの距離の取得
   *
   * @param a 点
   * @return ベクトルの距離
   */
  getDistanceWith(a) {
    return Math.sqrt(
      (this.x - a.x) * (this.x - a.x) + (this.y - a.y) * (this.y - a.y)
    );
  }
  /**
   * ドット積の計算
   *
   * @param a 値
   * @return 結果
   */
  dot(a) {
    return this.x * a.x + this.y * a.y;
  }
  /**
   * 正規化の適用
   */
  normalize() {
    const length = Math.pow(this.x * this.x + this.y * this.y, 0.5);
    this.x = this.x / length;
    this.y = this.y / length;
  }
  /**
   * 等しさの確認（等しいか？）
   *
   * 値が等しいか？
   *
   * @param rhs 確認する値
   * @return true 値は等しい
   * @return false 値は等しくない
   */
  isEqual(rhs) {
    return this.x == rhs.x && this.y == rhs.y;
  }
  /**
   * 等しさの確認（等しくないか？）
   *
   * 値が等しくないか？
   *
   * @param rhs 確認する値
   * @return true 値は等しくない
   * @return false 値は等しい
   */
  isNotEqual(rhs) {
    return !this.isEqual(rhs);
  }
}
var Live2DCubismFramework$l;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismVector2 = CubismVector2;
})(Live2DCubismFramework$l || (Live2DCubismFramework$l = {}));
const _CubismMath = class _CubismMath {
  /**
   * 第一引数の値を最小値と最大値の範囲に収めた値を返す
   *
   * @param value 収められる値
   * @param min   範囲の最小値
   * @param max   範囲の最大値
   * @return 最小値と最大値の範囲に収めた値
   */
  static range(value, min, max) {
    if (value < min) {
      value = min;
    } else if (value > max) {
      value = max;
    }
    return value;
  }
  /**
   * サイン関数の値を求める
   *
   * @param x 角度値（ラジアン）
   * @return サイン関数sin(x)の値
   */
  static sin(x) {
    return Math.sin(x);
  }
  /**
   * コサイン関数の値を求める
   *
   * @param x 角度値(ラジアン)
   * @return コサイン関数cos(x)の値
   */
  static cos(x) {
    return Math.cos(x);
  }
  /**
   * 値の絶対値を求める
   *
   * @param x 絶対値を求める値
   * @return 値の絶対値
   */
  static abs(x) {
    return Math.abs(x);
  }
  /**
   * 平方根(ルート)を求める
   * @param x -> 平方根を求める値
   * @return 値の平方根
   */
  static sqrt(x) {
    return Math.sqrt(x);
  }
  /**
   * 立方根を求める
   * @param x -> 立方根を求める値
   * @return 値の立方根
   */
  static cbrt(x) {
    if (x === 0) {
      return x;
    }
    let cx = x;
    const isNegativeNumber = cx < 0;
    if (isNegativeNumber) {
      cx = -cx;
    }
    let ret;
    if (cx === Infinity) {
      ret = Infinity;
    } else {
      ret = Math.exp(Math.log(cx) / 3);
      ret = (cx / (ret * ret) + 2 * ret) / 3;
    }
    return isNegativeNumber ? -ret : ret;
  }
  /**
   * イージング処理されたサインを求める
   * フェードイン・アウト時のイージングに利用できる
   *
   * @param value イージングを行う値
   * @return イージング処理されたサイン値
   */
  static getEasingSine(value) {
    if (value < 0) {
      return 0;
    } else if (value > 1) {
      return 1;
    }
    return 0.5 - 0.5 * this.cos(value * Math.PI);
  }
  /**
   * 大きい方の値を返す
   *
   * @param left 左辺の値
   * @param right 右辺の値
   * @return 大きい方の値
   */
  static max(left, right) {
    return left > right ? left : right;
  }
  /**
   * 小さい方の値を返す
   *
   * @param left  左辺の値
   * @param right 右辺の値
   * @return 小さい方の値
   */
  static min(left, right) {
    return left > right ? right : left;
  }
  static clamp(val, min, max) {
    if (val < min) {
      return min;
    } else if (max < val) {
      return max;
    }
    return val;
  }
  /**
   * 角度値をラジアン値に変換する
   *
   * @param degrees   角度値
   * @return 角度値から変換したラジアン値
   */
  static degreesToRadian(degrees) {
    return degrees / 180 * Math.PI;
  }
  /**
   * ラジアン値を角度値に変換する
   *
   * @param radian    ラジアン値
   * @return ラジアン値から変換した角度値
   */
  static radianToDegrees(radian) {
    return radian * 180 / Math.PI;
  }
  /**
   * ２つのベクトルからラジアン値を求める
   *
   * @param from  始点ベクトル
   * @param to    終点ベクトル
   * @return ラジアン値から求めた方向ベクトル
   */
  static directionToRadian(from, to) {
    const q1 = Math.atan2(to.y, to.x);
    const q2 = Math.atan2(from.y, from.x);
    let ret = q1 - q2;
    while (ret < -Math.PI) {
      ret += Math.PI * 2;
    }
    while (ret > Math.PI) {
      ret -= Math.PI * 2;
    }
    return ret;
  }
  /**
   * ２つのベクトルから角度値を求める
   *
   * @param from  始点ベクトル
   * @param to    終点ベクトル
   * @return 角度値から求めた方向ベクトル
   */
  static directionToDegrees(from, to) {
    const radian = this.directionToRadian(from, to);
    let degree = this.radianToDegrees(radian);
    if (to.x - from.x > 0) {
      degree = -degree;
    }
    return degree;
  }
  /**
   * ラジアン値を方向ベクトルに変換する。
   *
   * @param totalAngle    ラジアン値
   * @return ラジアン値から変換した方向ベクトル
   */
  static radianToDirection(totalAngle) {
    const ret = new CubismVector2();
    ret.x = this.sin(totalAngle);
    ret.y = this.cos(totalAngle);
    return ret;
  }
  /**
   * 三次方程式の三次項の係数が0になったときに補欠的に二次方程式の解をもとめる。
   * a * x^2 + b * x + c = 0
   *
   * @param   a -> 二次項の係数値
   * @param   b -> 一次項の係数値
   * @param   c -> 定数項の値
   * @return  二次方程式の解
   */
  static quadraticEquation(a, b, c) {
    if (this.abs(a) < _CubismMath.Epsilon) {
      if (this.abs(b) < _CubismMath.Epsilon) {
        return -c;
      }
      return -c / b;
    }
    return -(b + this.sqrt(b * b - 4 * a * c)) / (2 * a);
  }
  /**
   * カルダノの公式によってベジェのt値に該当する３次方程式の解を求める。
   * 重解になったときには0.0～1.0の値になる解を返す。
   *
   * a * x^3 + b * x^2 + c * x + d = 0
   *
   * @param   a -> 三次項の係数値
   * @param   b -> 二次項の係数値
   * @param   c -> 一次項の係数値
   * @param   d -> 定数項の値
   * @return  0.0～1.0の間にある解
   */
  static cardanoAlgorithmForBezier(a, b, c, d) {
    if (this.abs(a) < _CubismMath.Epsilon) {
      return this.range(this.quadraticEquation(b, c, d), 0, 1);
    }
    const ba = b / a;
    const ca = c / a;
    const da = d / a;
    const p = (3 * ca - ba * ba) / 3;
    const p3 = p / 3;
    const q = (2 * ba * ba * ba - 9 * ba * ca + 27 * da) / 27;
    const q2 = q / 2;
    const discriminant = q2 * q2 + p3 * p3 * p3;
    const center = 0.5;
    const threshold = center + 0.01;
    if (discriminant < 0) {
      const mp3 = -p / 3;
      const mp33 = mp3 * mp3 * mp3;
      const r = this.sqrt(mp33);
      const t = -q / (2 * r);
      const cosphi = this.range(t, -1, 1);
      const phi = Math.acos(cosphi);
      const crtr = this.cbrt(r);
      const t1 = 2 * crtr;
      const root12 = t1 * this.cos(phi / 3) - ba / 3;
      if (this.abs(root12 - center) < threshold) {
        return this.range(root12, 0, 1);
      }
      const root2 = t1 * this.cos((phi + 2 * Math.PI) / 3) - ba / 3;
      if (this.abs(root2 - center) < threshold) {
        return this.range(root2, 0, 1);
      }
      const root3 = t1 * this.cos((phi + 4 * Math.PI) / 3) - ba / 3;
      return this.range(root3, 0, 1);
    }
    if (discriminant == 0) {
      let u12;
      if (q2 < 0) {
        u12 = this.cbrt(-q2);
      } else {
        u12 = -this.cbrt(q2);
      }
      const root12 = 2 * u12 - ba / 3;
      if (this.abs(root12 - center) < threshold) {
        return this.range(root12, 0, 1);
      }
      const root2 = -u12 - ba / 3;
      return this.range(root2, 0, 1);
    }
    const sd = this.sqrt(discriminant);
    const u1 = this.cbrt(sd - q2);
    const v1 = this.cbrt(sd + q2);
    const root1 = u1 - v1 - ba / 3;
    return this.range(root1, 0, 1);
  }
  /**
   * 浮動小数点の余りを求める。
   *
   * @param dividend 被除数（割られる値）
   * @param divisor 除数（割る値）
   * @returns 余り
   */
  static mod(dividend, divisor) {
    if (!isFinite(dividend) || divisor === 0 || isNaN(dividend) || isNaN(divisor)) {
      console.warn(
        `divided: ${dividend}, divisor: ${divisor} mod() returns 'NaN'.`
      );
      return NaN;
    }
    const absDividend = Math.abs(dividend);
    const absDivisor = Math.abs(divisor);
    let result = absDividend - Math.floor(absDividend / absDivisor) * absDivisor;
    result *= Math.sign(dividend);
    return result;
  }
  /**
   * コンストラクタ
   */
  constructor() {
  }
};
_CubismMath.Epsilon = 1e-5;
let CubismMath = _CubismMath;
var Live2DCubismFramework$k;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismMath = CubismMath;
})(Live2DCubismFramework$k || (Live2DCubismFramework$k = {}));
class ACubismMotion {
  /**
   * コンストラクタ
   */
  constructor() {
    this.setBeganMotionHandler = (onBeganMotionHandler) => this._onBeganMotion = onBeganMotionHandler;
    this.getBeganMotionHandler = () => this._onBeganMotion;
    this.setFinishedMotionHandler = (onFinishedMotionHandler) => this._onFinishedMotion = onFinishedMotionHandler;
    this.getFinishedMotionHandler = () => this._onFinishedMotion;
    this._fadeInSeconds = -1;
    this._fadeOutSeconds = -1;
    this._weight = 1;
    this._offsetSeconds = 0;
    this._isLoop = false;
    this._isLoopFadeIn = true;
    this._previousLoopState = this._isLoop;
    this._firedEventValues = new csmVector();
  }
  /**
   * インスタンスの破棄
   */
  static delete(motion) {
    motion.release();
    motion = null;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this._weight = 0;
  }
  /**
   * モデルのパラメータ
   * @param model 対象のモデル
   * @param motionQueueEntry CubismMotionQueueManagerで管理されているモーション
   * @param userTimeSeconds デルタ時間の積算値[秒]
   */
  updateParameters(model, motionQueueEntry, userTimeSeconds) {
    if (!motionQueueEntry.isAvailable() || motionQueueEntry.isFinished()) {
      return;
    }
    this.setupMotionQueueEntry(motionQueueEntry, userTimeSeconds);
    const fadeWeight = this.updateFadeWeight(motionQueueEntry, userTimeSeconds);
    this.doUpdateParameters(
      model,
      userTimeSeconds,
      fadeWeight,
      motionQueueEntry
    );
    if (motionQueueEntry.getEndTime() > 0 && motionQueueEntry.getEndTime() < userTimeSeconds) {
      motionQueueEntry.setIsFinished(true);
    }
  }
  /**
   * @brief モデルの再生開始処理
   *
   * モーションの再生を開始するためのセットアップを行う。
   *
   * @param[in]   motionQueueEntry    CubismMotionQueueManagerで管理されているモーション
   * @param[in]   userTimeSeconds     デルタ時間の積算値[秒]
   */
  setupMotionQueueEntry(motionQueueEntry, userTimeSeconds) {
    if (motionQueueEntry == null || motionQueueEntry.isStarted()) {
      return;
    }
    if (!motionQueueEntry.isAvailable()) {
      return;
    }
    motionQueueEntry.setIsStarted(true);
    motionQueueEntry.setStartTime(userTimeSeconds - this._offsetSeconds);
    motionQueueEntry.setFadeInStartTime(userTimeSeconds);
    if (motionQueueEntry.getEndTime() < 0) {
      this.adjustEndTime(motionQueueEntry);
    }
    if (motionQueueEntry._motion._onBeganMotion) {
      motionQueueEntry._motion._onBeganMotion(motionQueueEntry._motion);
    }
  }
  /**
   * @brief モデルのウェイト更新
   *
   * モーションのウェイトを更新する。
   *
   * @param[in]   motionQueueEntry    CubismMotionQueueManagerで管理されているモーション
   * @param[in]   userTimeSeconds     デルタ時間の積算値[秒]
   */
  updateFadeWeight(motionQueueEntry, userTimeSeconds) {
    if (motionQueueEntry == null) {
      CubismDebug.print(LogLevel.LogLevel_Error, "motionQueueEntry is null.");
    }
    let fadeWeight = this._weight;
    const fadeIn = this._fadeInSeconds == 0 ? 1 : CubismMath.getEasingSine(
      (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / this._fadeInSeconds
    );
    const fadeOut = this._fadeOutSeconds == 0 || motionQueueEntry.getEndTime() < 0 ? 1 : CubismMath.getEasingSine(
      (motionQueueEntry.getEndTime() - userTimeSeconds) / this._fadeOutSeconds
    );
    fadeWeight = fadeWeight * fadeIn * fadeOut;
    motionQueueEntry.setState(userTimeSeconds, fadeWeight);
    CSM_ASSERT(0 <= fadeWeight && fadeWeight <= 1);
    return fadeWeight;
  }
  /**
   * フェードインの時間を設定する
   * @param fadeInSeconds フェードインにかかる時間[秒]
   */
  setFadeInTime(fadeInSeconds) {
    this._fadeInSeconds = fadeInSeconds;
  }
  /**
   * フェードアウトの時間を設定する
   * @param fadeOutSeconds フェードアウトにかかる時間[秒]
   */
  setFadeOutTime(fadeOutSeconds) {
    this._fadeOutSeconds = fadeOutSeconds;
  }
  /**
   * フェードアウトにかかる時間の取得
   * @return フェードアウトにかかる時間[秒]
   */
  getFadeOutTime() {
    return this._fadeOutSeconds;
  }
  /**
   * フェードインにかかる時間の取得
   * @return フェードインにかかる時間[秒]
   */
  getFadeInTime() {
    return this._fadeInSeconds;
  }
  /**
   * モーション適用の重みの設定
   * @param weight 重み（0.0 - 1.0）
   */
  setWeight(weight) {
    this._weight = weight;
  }
  /**
   * モーション適用の重みの取得
   * @return 重み（0.0 - 1.0）
   */
  getWeight() {
    return this._weight;
  }
  /**
   * モーションの長さの取得
   * @return モーションの長さ[秒]
   *
   * @note ループの時は「-1」。
   *       ループでない場合は、オーバーライドする。
   *       正の値の時は取得される時間で終了する。
   *       「-1」の時は外部から停止命令がない限り終わらない処理となる。
   */
  getDuration() {
    return -1;
  }
  /**
   * モーションのループ1回分の長さの取得
   * @return モーションのループ一回分の長さ[秒]
   *
   * @note ループしない場合は、getDuration()と同じ値を返す
   *       ループ一回分の長さが定義できない場合(プログラム的に動き続けるサブクラスなど)の場合は「-1」を返す
   */
  getLoopDuration() {
    return -1;
  }
  /**
   * モーション再生の開始時刻の設定
   * @param offsetSeconds モーション再生の開始時刻[秒]
   */
  setOffsetTime(offsetSeconds) {
    this._offsetSeconds = offsetSeconds;
  }
  /**
   * ループ情報の設定
   * @param loop ループ情報
   */
  setLoop(loop) {
    this._isLoop = loop;
  }
  /**
   * ループ情報の取得
   * @return true ループする
   * @return false ループしない
   */
  getLoop() {
    return this._isLoop;
  }
  /**
   * ループ時のフェードイン情報の設定
   * @param loopFadeIn  ループ時のフェードイン情報
   */
  setLoopFadeIn(loopFadeIn) {
    this._isLoopFadeIn = loopFadeIn;
  }
  /**
   * ループ時のフェードイン情報の取得
   *
   * @return  true    する
   * @return  false   しない
   */
  getLoopFadeIn() {
    return this._isLoopFadeIn;
  }
  /**
   * モデルのパラメータ更新
   *
   * イベント発火のチェック。
   * 入力する時間は呼ばれるモーションタイミングを０とした秒数で行う。
   *
   * @param beforeCheckTimeSeconds 前回のイベントチェック時間[秒]
   * @param motionTimeSeconds 今回の再生時間[秒]
   */
  getFiredEvent(beforeCheckTimeSeconds, motionTimeSeconds) {
    return this._firedEventValues;
  }
  /**
   * 透明度のカーブが存在するかどうかを確認する
   *
   * @returns true  -> キーが存在する
   *          false -> キーが存在しない
   */
  isExistModelOpacity() {
    return false;
  }
  /**
   * 透明度のカーブのインデックスを返す
   *
   * @returns success:透明度のカーブのインデックス
   */
  getModelOpacityIndex() {
    return -1;
  }
  /**
   * 透明度のIdを返す
   *
   * @param index モーションカーブのインデックス
   * @returns success:透明度のId
   */
  getModelOpacityId(index) {
    return null;
  }
  /**
   * 指定時間の透明度の値を返す
   *
   * @returns success:モーションの現在時間におけるOpacityの値
   *
   * @note  更新後の値を取るにはUpdateParameters() の後に呼び出す。
   */
  getModelOpacityValue() {
    return 1;
  }
  /**
   * 終了時刻の調整
   * @param motionQueueEntry CubismMotionQueueManagerで管理されているモーション
   */
  adjustEndTime(motionQueueEntry) {
    const duration = this.getDuration();
    const endTime = duration <= 0 ? -1 : motionQueueEntry.getStartTime() + duration;
    motionQueueEntry.setEndTime(endTime);
  }
}
var Live2DCubismFramework$j;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.ACubismMotion = ACubismMotion;
})(Live2DCubismFramework$j || (Live2DCubismFramework$j = {}));
var CubismMotionCurveTarget = /* @__PURE__ */ ((CubismMotionCurveTarget2) => {
  CubismMotionCurveTarget2[CubismMotionCurveTarget2["CubismMotionCurveTarget_Model"] = 0] = "CubismMotionCurveTarget_Model";
  CubismMotionCurveTarget2[CubismMotionCurveTarget2["CubismMotionCurveTarget_Parameter"] = 1] = "CubismMotionCurveTarget_Parameter";
  CubismMotionCurveTarget2[CubismMotionCurveTarget2["CubismMotionCurveTarget_PartOpacity"] = 2] = "CubismMotionCurveTarget_PartOpacity";
  return CubismMotionCurveTarget2;
})(CubismMotionCurveTarget || {});
var CubismMotionSegmentType = /* @__PURE__ */ ((CubismMotionSegmentType2) => {
  CubismMotionSegmentType2[CubismMotionSegmentType2["CubismMotionSegmentType_Linear"] = 0] = "CubismMotionSegmentType_Linear";
  CubismMotionSegmentType2[CubismMotionSegmentType2["CubismMotionSegmentType_Bezier"] = 1] = "CubismMotionSegmentType_Bezier";
  CubismMotionSegmentType2[CubismMotionSegmentType2["CubismMotionSegmentType_Stepped"] = 2] = "CubismMotionSegmentType_Stepped";
  CubismMotionSegmentType2[CubismMotionSegmentType2["CubismMotionSegmentType_InverseStepped"] = 3] = "CubismMotionSegmentType_InverseStepped";
  return CubismMotionSegmentType2;
})(CubismMotionSegmentType || {});
class CubismMotionPoint {
  constructor() {
    this.time = 0;
    this.value = 0;
  }
  // 値
}
class CubismMotionSegment {
  /**
   * @brief コンストラクタ
   *
   * コンストラクタ。
   */
  constructor() {
    this.evaluate = null;
    this.basePointIndex = 0;
    this.segmentType = 0;
  }
  // セグメントの種類
}
class CubismMotionCurve {
  constructor() {
    this.type = 0;
    this.segmentCount = 0;
    this.baseSegmentIndex = 0;
    this.fadeInTime = 0;
    this.fadeOutTime = 0;
  }
  // フェードアウトにかかる時間[秒]
}
class CubismMotionEvent {
  constructor() {
    this.fireTime = 0;
  }
}
class CubismMotionData {
  constructor() {
    this.duration = 0;
    this.loop = false;
    this.curveCount = 0;
    this.eventCount = 0;
    this.fps = 0;
    this.curves = new csmVector();
    this.segments = new csmVector();
    this.points = new csmVector();
    this.events = new csmVector();
  }
  // イベントのリスト
}
var Live2DCubismFramework$i;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismMotionCurve = CubismMotionCurve;
  Live2DCubismFramework2.CubismMotionCurveTarget = CubismMotionCurveTarget;
  Live2DCubismFramework2.CubismMotionData = CubismMotionData;
  Live2DCubismFramework2.CubismMotionEvent = CubismMotionEvent;
  Live2DCubismFramework2.CubismMotionPoint = CubismMotionPoint;
  Live2DCubismFramework2.CubismMotionSegment = CubismMotionSegment;
  Live2DCubismFramework2.CubismMotionSegmentType = CubismMotionSegmentType;
})(Live2DCubismFramework$i || (Live2DCubismFramework$i = {}));
const EffectNameEyeBlink$1 = "EyeBlink";
const EffectNameLipSync$1 = "LipSync";
const TargetNameModel$1 = "Model";
const TargetNameParameter$1 = "Parameter";
const TargetNamePartOpacity$1 = "PartOpacity";
const IdNameOpacity$1 = "Opacity";
const UseOldBeziersCurveMotion$1 = false;
function lerpPoints$1(a, b, t) {
  const result = new CubismMotionPoint();
  result.time = a.time + (b.time - a.time) * t;
  result.value = a.value + (b.value - a.value) * t;
  return result;
}
function linearEvaluate$1(points, time) {
  let t = (time - points[0].time) / (points[1].time - points[0].time);
  if (t < 0) {
    t = 0;
  }
  return points[0].value + (points[1].value - points[0].value) * t;
}
function bezierEvaluate$1(points, time) {
  let t = (time - points[0].time) / (points[3].time - points[0].time);
  if (t < 0) {
    t = 0;
  }
  const p01 = lerpPoints$1(points[0], points[1], t);
  const p12 = lerpPoints$1(points[1], points[2], t);
  const p23 = lerpPoints$1(points[2], points[3], t);
  const p012 = lerpPoints$1(p01, p12, t);
  const p123 = lerpPoints$1(p12, p23, t);
  return lerpPoints$1(p012, p123, t).value;
}
function bezierEvaluateCardanoInterpretation$1(points, time) {
  const x = time;
  const x1 = points[0].time;
  const x2 = points[3].time;
  const cx1 = points[1].time;
  const cx2 = points[2].time;
  const a = x2 - 3 * cx2 + 3 * cx1 - x1;
  const b = 3 * cx2 - 6 * cx1 + 3 * x1;
  const c = 3 * cx1 - 3 * x1;
  const d = x1 - x;
  const t = CubismMath.cardanoAlgorithmForBezier(a, b, c, d);
  const p01 = lerpPoints$1(points[0], points[1], t);
  const p12 = lerpPoints$1(points[1], points[2], t);
  const p23 = lerpPoints$1(points[2], points[3], t);
  const p012 = lerpPoints$1(p01, p12, t);
  const p123 = lerpPoints$1(p12, p23, t);
  return lerpPoints$1(p012, p123, t).value;
}
function steppedEvaluate$1(points, time) {
  return points[0].value;
}
function inverseSteppedEvaluate$1(points, time) {
  return points[1].value;
}
function evaluateCurve$1(motionData, index, time, isCorrection, endTime) {
  const curve = motionData.curves.at(index);
  let target = -1;
  const totalSegmentCount = curve.baseSegmentIndex + curve.segmentCount;
  let pointPosition = 0;
  for (let i = curve.baseSegmentIndex; i < totalSegmentCount; ++i) {
    pointPosition = motionData.segments.at(i).basePointIndex + (motionData.segments.at(i).segmentType == CubismMotionSegmentType.CubismMotionSegmentType_Bezier ? 3 : 1);
    if (motionData.points.at(pointPosition).time > time) {
      target = i;
      break;
    }
  }
  if (target == -1) {
    if (isCorrection && time < endTime) {
      return correctEndPoint$1(
        motionData,
        totalSegmentCount - 1,
        motionData.segments.at(curve.baseSegmentIndex).basePointIndex,
        pointPosition,
        time,
        endTime
      );
    }
    return motionData.points.at(pointPosition).value;
  }
  const segment = motionData.segments.at(target);
  return segment.evaluate(motionData.points.get(segment.basePointIndex), time);
}
function correctEndPoint$1(motionData, segmentIndex, beginIndex, endIndex, time, endTime) {
  const motionPoint = [
    new CubismMotionPoint(),
    new CubismMotionPoint()
  ];
  {
    const src = motionData.points.at(endIndex);
    motionPoint[0].time = src.time;
    motionPoint[0].value = src.value;
  }
  {
    const src = motionData.points.at(beginIndex);
    motionPoint[1].time = endTime;
    motionPoint[1].value = src.value;
  }
  switch (motionData.segments.at(segmentIndex).segmentType) {
    case CubismMotionSegmentType.CubismMotionSegmentType_Linear:
    case CubismMotionSegmentType.CubismMotionSegmentType_Bezier:
    default:
      return linearEvaluate$1(motionPoint, time);
    case CubismMotionSegmentType.CubismMotionSegmentType_Stepped:
      return steppedEvaluate$1(motionPoint);
    case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped:
      return inverseSteppedEvaluate$1(motionPoint);
  }
}
const findParameterIndex = (model, name) => {
  const count = model.getParameterCount();
  for (let i = 0; i < count; i++) {
    const id = model.getParameterId(i);
    if (revealIdString(id) === name) {
      return i;
    }
  }
  return -1;
};
const findPartIndex = (model, name) => {
  const count = model.getPartCount();
  for (let i = 0; i < count; i++) {
    const id = model.getPartId(i);
    if (revealIdString(id) === name) {
      return i;
    }
  }
  return -1;
};
const revealIdString = (id) => {
  if (id && id["getString"]) {
    return id.getString().s;
  } else {
    return id;
  }
};
var MotionBehavior = /* @__PURE__ */ ((MotionBehavior2) => {
  MotionBehavior2[MotionBehavior2["MotionBehavior_V1"] = 0] = "MotionBehavior_V1";
  MotionBehavior2[MotionBehavior2["MotionBehavior_V2"] = 1] = "MotionBehavior_V2";
  return MotionBehavior2;
})(MotionBehavior || {});
class CubismOverrideMotion extends ACubismMotion {
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    __publicField(this, "_sourceFrameRate");
    // ロードしたファイルのFPS。記述が無ければデフォルト値15fpsとなる
    __publicField(this, "_loopDurationSeconds");
    // mtnファイルで定義される一連のモーションの長さ
    __publicField(this, "_motionBehavior", 1);
    __publicField(this, "_lastWeight");
    // 最後に設定された重み
    __publicField(this, "_motionData");
    // 実際のモーションデータ本体
    __publicField(this, "_eyeBlinkParameterIds");
    // 自動まばたきを適用するパラメータIDハンドルのリスト。  モデル（モデルセッティング）とパラメータを対応付ける。
    __publicField(this, "_lipSyncParameterIds");
    // リップシンクを適用するパラメータIDハンドルのリスト。  モデル（モデルセッティング）とパラメータを対応付ける。
    __publicField(this, "_eyeBlinkAdditive");
    __publicField(this, "_lipSyncAdditive");
    __publicField(this, "_parameterAdditiveIndicies");
    __publicField(this, "_partOpacityAdditiveIndicies");
    __publicField(this, "_modelOpacity");
    // モーションから取得した不透明度
    __publicField(this, "_debugMode");
    this._sourceFrameRate = 30;
    this._loopDurationSeconds = -1;
    this._isLoop = false;
    this._isLoopFadeIn = true;
    this._lastWeight = 0;
    this._motionData = null;
    this._eyeBlinkParameterIds = null;
    this._lipSyncParameterIds = null;
    this._modelOpacity = 1;
    this._debugMode = false;
    this._eyeBlinkAdditive = false;
    this._lipSyncAdditive = false;
    this._parameterAdditiveIndicies = [];
    this._partOpacityAdditiveIndicies = [];
  }
  /**
   * インスタンスを作成する
   *
   * @param buffer motion3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @param onBeganMotionHandler モーション再生開始時に呼び出されるコールバック関数
   * @param shouldCheckMotionConsistency motion3.json整合性チェックするかどうか
   * @return 作成されたインスタンス
   */
  static create(model, buffer, size, onFinishedMotionHandler, onBeganMotionHandler, shouldCheckMotionConsistency = false) {
    const ret = new CubismOverrideMotion();
    ret.parse(model, buffer, size, shouldCheckMotionConsistency);
    if (ret._motionData) {
      ret._sourceFrameRate = ret._motionData.fps;
      ret._loopDurationSeconds = ret._motionData.duration;
      ret._onFinishedMotion = onFinishedMotionHandler;
      ret._onBeganMotion = onBeganMotionHandler;
    } else {
      csmDelete(ret);
      return null;
    }
    return ret;
  }
  /**
   * モデルのパラメータの更新の実行
   * @param model             対象のモデル
   * @param userTimeSeconds   現在の時刻[秒]
   * @param fadeWeight        モーションの重み
   * @param motionQueueEntry  CubismMotionQueueManagerで管理されているモーション
   */
  doUpdateParameters(model, userTimeSeconds, fadeWeight, motionQueueEntry) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    if (!this._motionData) {
      return;
    }
    if (this._motionBehavior === 1) {
      if (this._previousLoopState !== this._isLoop) {
        this.adjustEndTime(motionQueueEntry);
        this._previousLoopState = this._isLoop;
      }
    }
    let timeOffsetSeconds = userTimeSeconds - motionQueueEntry.getStartTime();
    if (timeOffsetSeconds < 0) {
      timeOffsetSeconds = 0;
    }
    let lipSyncValue = Number.MAX_VALUE;
    let eyeBlinkValue = Number.MAX_VALUE;
    const maxTargetSize = 64;
    let lipSyncFlags = 0;
    let eyeBlinkFlags = 0;
    if (this._eyeBlinkParameterIds && this._eyeBlinkParameterIds.getSize() > maxTargetSize) {
      CubismLogDebug(
        "too many eye blink targets : {0}",
        this._eyeBlinkParameterIds.getSize()
      );
    }
    if (this._lipSyncParameterIds && this._lipSyncParameterIds.getSize() > maxTargetSize) {
      CubismLogDebug(
        "too many lip sync targets : {0}",
        this._lipSyncParameterIds.getSize()
      );
    }
    const tmpFadeIn = this._fadeInSeconds <= 0 ? 1 : CubismMath.getEasingSine(
      (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / this._fadeInSeconds
    );
    const tmpFadeOut = this._fadeOutSeconds <= 0 || motionQueueEntry.getEndTime() < 0 ? 1 : CubismMath.getEasingSine(
      (motionQueueEntry.getEndTime() - userTimeSeconds) / this._fadeOutSeconds
    );
    let value;
    let c, parameterIndex;
    let time = timeOffsetSeconds;
    let duration = this._motionData.duration;
    const isCorrection = this._motionBehavior === 1 && this._isLoop;
    if (this._isLoop) {
      if (this._motionBehavior === 1) {
        duration += 1 / this._motionData.fps;
      }
      while (time > duration) {
        time -= duration;
      }
    }
    const curves = this._motionData.curves;
    for (c = 0; c < this._motionData.curveCount && curves.at(c).type == CubismMotionCurveTarget.CubismMotionCurveTarget_Model; ++c) {
      value = evaluateCurve$1(this._motionData, c, time, isCorrection, duration);
      if (revealIdString(curves.at(c).id) == EffectNameEyeBlink$1) {
        eyeBlinkValue = value;
      } else if (revealIdString(curves.at(c).id) == EffectNameLipSync$1) {
        lipSyncValue = value;
      } else if (revealIdString(curves.at(c).id) == IdNameOpacity$1) {
        this._modelOpacity = value;
        model.setModelOapcity(this.getModelOpacityValue());
      }
    }
    for (; c < this._motionData.curveCount && curves.at(c).type == CubismMotionCurveTarget.CubismMotionCurveTarget_Parameter; ++c) {
      const curveIdName = revealIdString(curves.at(c).id);
      parameterIndex = findParameterIndex(model, curveIdName);
      if (parameterIndex == -1) {
        continue;
      }
      value = evaluateCurve$1(this._motionData, c, time, isCorrection, duration);
      if (eyeBlinkValue != Number.MAX_VALUE) {
        for (let i = 0; i < ((_b = (_a = this._eyeBlinkParameterIds) == null ? void 0 : _a.getSize()) != null ? _b : 0) && i < maxTargetSize; ++i) {
          const id = (_c = this._eyeBlinkParameterIds) == null ? void 0 : _c.at(i);
          if (id && revealIdString(id) == curveIdName) {
            value *= eyeBlinkValue;
            eyeBlinkFlags |= 1 << i;
            break;
          }
        }
      }
      if (lipSyncValue != Number.MAX_VALUE) {
        for (let i = 0; i < ((_e = (_d = this._lipSyncParameterIds) == null ? void 0 : _d.getSize()) != null ? _e : 0) && i < maxTargetSize; ++i) {
          const id = (_f = this._lipSyncParameterIds) == null ? void 0 : _f.at(i);
          if (id && revealIdString(id) == curveIdName) {
            value += lipSyncValue;
            lipSyncFlags |= 1 << i;
            break;
          }
        }
      }
      let paramWeight;
      if (curves.at(c).fadeInTime < 0 && curves.at(c).fadeOutTime < 0) {
        paramWeight = fadeWeight;
      } else {
        let fin;
        let fout;
        if (curves.at(c).fadeInTime < 0) {
          fin = tmpFadeIn;
        } else {
          fin = curves.at(c).fadeInTime == 0 ? 1 : CubismMath.getEasingSine(
            (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / curves.at(c).fadeInTime
          );
        }
        if (curves.at(c).fadeOutTime < 0) {
          fout = tmpFadeOut;
        } else {
          fout = curves.at(c).fadeOutTime == 0 || motionQueueEntry.getEndTime() < 0 ? 1 : CubismMath.getEasingSine(
            (motionQueueEntry.getEndTime() - userTimeSeconds) / curves.at(c).fadeOutTime
          );
        }
        paramWeight = this._weight * fin * fout;
      }
      if (this._parameterAdditiveIndicies.includes(parameterIndex)) {
        model.addParameterValueByIndex(parameterIndex, value, paramWeight);
      } else {
        model.setParameterValueByIndex(parameterIndex, value, paramWeight);
      }
    }
    {
      if (eyeBlinkValue != Number.MAX_VALUE) {
        for (let i = 0; i < ((_h = (_g = this._eyeBlinkParameterIds) == null ? void 0 : _g.getSize()) != null ? _h : 0) && i < maxTargetSize; ++i) {
          if (eyeBlinkFlags >> i & 1) {
            continue;
          }
          const v = eyeBlinkValue;
          if (this._eyeBlinkParameterIds) {
            if (this._eyeBlinkAdditive) {
              model.addParameterValueById(this._eyeBlinkParameterIds.at(i), v, fadeWeight);
            } else {
              model.setParameterValueById(this._eyeBlinkParameterIds.at(i), v, fadeWeight);
            }
          }
        }
      }
      if (lipSyncValue != Number.MAX_VALUE) {
        for (let i = 0; i < ((_j = (_i = this._lipSyncParameterIds) == null ? void 0 : _i.getSize()) != null ? _j : 0) && i < maxTargetSize; ++i) {
          if (lipSyncFlags >> i & 1) {
            continue;
          }
          const v = lipSyncValue;
          if (this._lipSyncParameterIds) {
            if (this._eyeBlinkAdditive) {
              model.addParameterValueById(this._lipSyncParameterIds.at(i), v, fadeWeight);
            } else {
              model.setParameterValueById(this._lipSyncParameterIds.at(i), v, fadeWeight);
            }
          }
        }
      }
    }
    for (; c < this._motionData.curveCount && curves.at(c).type == CubismMotionCurveTarget.CubismMotionCurveTarget_PartOpacity; ++c) {
      const curveIdName = revealIdString(curves.at(c).id);
      findPartIndex(model, curveIdName);
      parameterIndex = model.getParameterIndex(curves.at(c).id);
      if (parameterIndex == -1) {
        continue;
      }
      value = evaluateCurve$1(this._motionData, c, time, isCorrection, duration);
      if (this._partOpacityAdditiveIndicies.includes(parameterIndex)) {
        model.addParameterValueByIndex(parameterIndex, value);
      } else {
        model.setParameterValueByIndex(parameterIndex, value);
      }
    }
    if (timeOffsetSeconds >= duration) {
      if (this._isLoop) {
        this.updateForNextLoop(motionQueueEntry, userTimeSeconds, time);
      } else {
        if (this._onFinishedMotion) {
          this._onFinishedMotion(this);
        }
        motionQueueEntry.setIsFinished(true);
      }
    }
    this._lastWeight = fadeWeight;
  }
  /**
   * ループ情報の設定
   * @param loop ループ情報
   */
  setIsLoop(loop) {
    CubismLogWarning(
      "setIsLoop() is a deprecated function. Please use setLoop()."
    );
    this._isLoop = loop;
  }
  /**
   * ループ情報の取得
   * @return true ループする
   * @return false ループしない
   */
  isLoop() {
    CubismLogWarning(
      "isLoop() is a deprecated function. Please use getLoop()."
    );
    return this._isLoop;
  }
  /**
   * ループ時のフェードイン情報の設定
   * @param loopFadeIn  ループ時のフェードイン情報
   */
  setIsLoopFadeIn(loopFadeIn) {
    CubismLogWarning(
      "setIsLoopFadeIn() is a deprecated function. Please use setLoopFadeIn()."
    );
    this._isLoopFadeIn = loopFadeIn;
  }
  /**
   * ループ時のフェードイン情報の取得
   *
   * @return  true    する
   * @return  false   しない
   */
  isLoopFadeIn() {
    CubismLogWarning(
      "isLoopFadeIn() is a deprecated function. Please use getLoopFadeIn()."
    );
    return this._isLoopFadeIn;
  }
  /**
   * Sets the version of the Motion Behavior.
   *
   * @param Specifies the version of the Motion Behavior.
   */
  setMotionBehavior(motionBehavior) {
    this._motionBehavior = motionBehavior;
  }
  /**
   * Gets the version of the Motion Behavior.
   *
   * @return Returns the version of the Motion Behavior.
   */
  getMotionBehavior() {
    return this._motionBehavior;
  }
  /**
   * モーションの長さを取得する。
   *
   * @return  モーションの長さ[秒]
   */
  getDuration() {
    return this._isLoop ? -1 : this._loopDurationSeconds;
  }
  /**
   * モーションのループ時の長さを取得する。
   *
   * @return  モーションのループ時の長さ[秒]
   */
  getLoopDuration() {
    return this._loopDurationSeconds;
  }
  /**
   * パラメータに対するフェードインの時間を設定する。
   *
   * @param parameterId     パラメータID
   * @param value           フェードインにかかる時間[秒]
   */
  setParameterFadeInTime(parameterId, value) {
    const curves = this._motionData.curves;
    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves.at(i).id) {
        curves.at(i).fadeInTime = value;
        return;
      }
    }
  }
  /**
   * パラメータに対するフェードアウトの時間の設定
   * @param parameterId     パラメータID
   * @param value           フェードアウトにかかる時間[秒]
   */
  setParameterFadeOutTime(parameterId, value) {
    const curves = this._motionData.curves;
    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves.at(i).id) {
        curves.at(i).fadeOutTime = value;
        return;
      }
    }
  }
  /**
   * パラメータに対するフェードインの時間の取得
   * @param    parameterId     パラメータID
   * @return   フェードインにかかる時間[秒]
   */
  getParameterFadeInTime(parameterId) {
    if (!this._motionData) return -1;
    const curves = this._motionData.curves;
    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves.at(i).id) {
        return curves.at(i).fadeInTime;
      }
    }
    return -1;
  }
  /**
   * パラメータに対するフェードアウトの時間を取得
   *
   * @param   parameterId     パラメータID
   * @return   フェードアウトにかかる時間[秒]
   */
  getParameterFadeOutTime(parameterId) {
    if (!this._motionData) return -1;
    const curves = this._motionData.curves;
    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves.at(i).id) {
        return curves.at(i).fadeOutTime;
      }
    }
    return -1;
  }
  /**
   * 自動エフェクトがかかっているパラメータIDリストの設定
   * @param eyeBlinkParameterIds    自動まばたきがかかっているパラメータIDのリスト
   * @param lipSyncParameterIds     リップシンクがかかっているパラメータIDのリスト
   */
  setEffectIds(eyeBlinkParameterIds, lipSyncParameterIds) {
    this._eyeBlinkParameterIds = eyeBlinkParameterIds;
    this._lipSyncParameterIds = lipSyncParameterIds;
  }
  setAdditiveIds(model, parameterAdditiveIds, partOpacityAdditiveIds) {
    var _a, _b;
    const parameterAdditiveIndicies = [];
    (_a = parameterAdditiveIds == null ? void 0 : parameterAdditiveIds.get(0)) == null ? void 0 : _a.forEach((id) => {
      parameterAdditiveIndicies.push(model.getParameterIndex(id));
    });
    this._parameterAdditiveIndicies = parameterAdditiveIndicies;
    const partOpacityAdditiveIndicies = [];
    (_b = partOpacityAdditiveIds == null ? void 0 : partOpacityAdditiveIds.get(0)) == null ? void 0 : _b.forEach((id) => {
      partOpacityAdditiveIndicies.push(model.getPartIndex(id));
    });
    this._partOpacityAdditiveIndicies = partOpacityAdditiveIndicies;
  }
  setEyeBlinkAdditive(eyeBlinkAdditive) {
    this._eyeBlinkAdditive = eyeBlinkAdditive;
  }
  setLipSyncAdditive(lipSyncAdditive) {
    this._lipSyncAdditive = lipSyncAdditive;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this._motionData = null;
  }
  /**
   *
   * @param motionQueueEntry
   * @param userTimeSeconds
   * @param time
   */
  updateForNextLoop(motionQueueEntry, userTimeSeconds, time) {
    switch (this._motionBehavior) {
      case 1:
      default:
        motionQueueEntry.setStartTime(userTimeSeconds - time);
        if (this._isLoopFadeIn) {
          motionQueueEntry.setFadeInStartTime(userTimeSeconds - time);
        }
        if (this._onFinishedMotion != null) {
          this._onFinishedMotion(this);
        }
        break;
      case 0:
        motionQueueEntry.setStartTime(userTimeSeconds);
        if (this._isLoopFadeIn) {
          motionQueueEntry.setFadeInStartTime(userTimeSeconds);
        }
        break;
    }
  }
  /**
   * motion3.jsonをパースする。
   *
   * @param motionJson  motion3.jsonが読み込まれているバッファ
   * @param size        バッファのサイズ
   * @param shouldCheckMotionConsistency motion3.json整合性チェックするかどうか
   */
  /**
   * motion3.jsonをパースする。
   *
   * @param motionJson  motion3.jsonが読み込まれているバッファ
   * @param size        バッファのサイズ
   * @param shouldCheckMotionConsistency motion3.json整合性チェックするかどうか
   */
  parse(model, motionJson, size, shouldCheckMotionConsistency = false) {
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(motionJson);
    const json = JSON.parse(jsonString);
    if (!json) {
      return;
    }
    this._motionData = new CubismMotionData();
    this._motionData.duration = json.Meta.Duration;
    this._motionData.loop = json.Meta.Loop;
    this._motionData.curveCount = json.Meta.CurveCount;
    this._motionData.fps = json.Meta.Fps;
    this._motionData.eventCount = json.Meta.UserDataCount;
    const areBeziersRestructed = json.Meta.AreBeziersRestricted;
    if (json.Meta.FadeInTime !== void 0 && json.Meta.FadeInTime !== null) {
      this._fadeInSeconds = json.Meta.FadeInTime < 0 ? 1 : json.Meta.FadeInTime;
    } else {
      this._fadeInSeconds = 1;
    }
    if (json.Meta.FadeOutTime !== void 0 && json.Meta.FadeOutTime !== null) {
      this._fadeOutSeconds = json.Meta.FadeOutTime < 0 ? 1 : json.Meta.FadeOutTime;
    } else {
      this._fadeOutSeconds = 1;
    }
    this._motionData.curves.updateSize(
      this._motionData.curveCount,
      CubismMotionCurve,
      true
    );
    this._motionData.segments.updateSize(
      json.Meta.TotalSegmentCount,
      CubismMotionSegment,
      true
    );
    this._motionData.points.updateSize(
      json.Meta.TotalPointCount,
      CubismMotionPoint,
      true
    );
    this._motionData.events.updateSize(
      this._motionData.eventCount,
      CubismMotionEvent,
      true
    );
    let totalPointCount = 0;
    let totalSegmentCount = 0;
    for (let curveCount = 0; curveCount < this._motionData.curveCount; ++curveCount) {
      const curve = json.Curves[curveCount];
      if (curve.Target == TargetNameModel$1) {
        this._motionData.curves.at(curveCount).type = CubismMotionCurveTarget.CubismMotionCurveTarget_Model;
      } else if (curve.Target == TargetNameParameter$1) {
        this._motionData.curves.at(curveCount).type = CubismMotionCurveTarget.CubismMotionCurveTarget_Parameter;
      } else if (curve.Target == TargetNamePartOpacity$1) {
        this._motionData.curves.at(curveCount).type = CubismMotionCurveTarget.CubismMotionCurveTarget_PartOpacity;
      } else {
        CubismLogWarning(
          'Warning : Unable to get segment type from Curve! The number of "CurveCount" may be incorrect!'
        );
      }
      this._motionData.curves.at(curveCount).id = CubismFramework.getIdManager().getId(curve.Id);
      this._motionData.curves.at(curveCount).baseSegmentIndex = totalSegmentCount;
      this._motionData.curves.at(curveCount).fadeInTime = curve.FadeInTime !== void 0 && curve.FadeInTime !== null ? curve.FadeInTime : -1;
      this._motionData.curves.at(curveCount).fadeOutTime = curve.FadeOutTime !== void 0 && curve.FadeOutTime !== null ? curve.FadeOutTime : -1;
      for (let segmentPosition = 0; segmentPosition < curve.Segments.length; ) {
        if (segmentPosition == 0) {
          this._motionData.segments.at(totalSegmentCount).basePointIndex = totalPointCount;
          this._motionData.points.at(totalPointCount).time = curve.Segments[segmentPosition];
          this._motionData.points.at(totalPointCount).value = curve.Segments[segmentPosition + 1];
          totalPointCount += 1;
          segmentPosition += 2;
        } else {
          this._motionData.segments.at(totalSegmentCount).basePointIndex = totalPointCount - 1;
        }
        const segment = curve.Segments[segmentPosition];
        const segmentType = segment;
        switch (segmentType) {
          case CubismMotionSegmentType.CubismMotionSegmentType_Linear: {
            this._motionData.segments.at(totalSegmentCount).segmentType = CubismMotionSegmentType.CubismMotionSegmentType_Linear;
            this._motionData.segments.at(totalSegmentCount).evaluate = linearEvaluate$1;
            this._motionData.points.at(totalPointCount).time = curve.Segments[segmentPosition + 1];
            this._motionData.points.at(totalPointCount).value = curve.Segments[segmentPosition + 2];
            totalPointCount += 1;
            segmentPosition += 3;
            break;
          }
          case CubismMotionSegmentType.CubismMotionSegmentType_Bezier: {
            this._motionData.segments.at(totalSegmentCount).segmentType = CubismMotionSegmentType.CubismMotionSegmentType_Bezier;
            if (areBeziersRestructed || UseOldBeziersCurveMotion$1) {
              this._motionData.segments.at(totalSegmentCount).evaluate = bezierEvaluate$1;
            } else {
              this._motionData.segments.at(totalSegmentCount).evaluate = bezierEvaluateCardanoInterpretation$1;
            }
            this._motionData.points.at(totalPointCount).time = curve.Segments[segmentPosition + 1];
            this._motionData.points.at(totalPointCount).value = curve.Segments[segmentPosition + 2];
            this._motionData.points.at(totalPointCount + 1).time = curve.Segments[segmentPosition + 3];
            this._motionData.points.at(totalPointCount + 1).value = curve.Segments[segmentPosition + 4];
            this._motionData.points.at(totalPointCount + 2).time = curve.Segments[segmentPosition + 5];
            this._motionData.points.at(totalPointCount + 2).value = curve.Segments[segmentPosition + 6];
            totalPointCount += 3;
            segmentPosition += 7;
            break;
          }
          case CubismMotionSegmentType.CubismMotionSegmentType_Stepped: {
            this._motionData.segments.at(totalSegmentCount).segmentType = CubismMotionSegmentType.CubismMotionSegmentType_Stepped;
            this._motionData.segments.at(totalSegmentCount).evaluate = steppedEvaluate$1;
            this._motionData.points.at(totalPointCount).time = curve.Segments[segmentPosition + 1];
            this._motionData.points.at(totalPointCount).value = curve.Segments[segmentPosition + 2];
            totalPointCount += 1;
            segmentPosition += 3;
            break;
          }
          case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped: {
            this._motionData.segments.at(totalSegmentCount).segmentType = CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped;
            this._motionData.segments.at(totalSegmentCount).evaluate = inverseSteppedEvaluate$1;
            this._motionData.points.at(totalPointCount).time = curve.Segments[segmentPosition + 1];
            this._motionData.points.at(totalPointCount).value = curve.Segments[segmentPosition + 2];
            totalPointCount += 1;
            segmentPosition += 3;
            break;
          }
          default: {
            CSM_ASSERT(0);
            break;
          }
        }
        ++this._motionData.curves.at(curveCount).segmentCount;
        ++totalSegmentCount;
      }
    }
    if (json.UserData) {
      for (let userdatacount = 0; userdatacount < json.Meta.UserDataCount; ++userdatacount) {
        this._motionData.events.at(userdatacount).fireTime = json.UserData[userdatacount].Time;
        this._motionData.events.at(userdatacount).value = new csmString(
          json.UserData[userdatacount].Value
        );
      }
    }
  }
  /**
   * モデルのパラメータ更新
   *
   * イベント発火のチェック。
   * 入力する時間は呼ばれるモーションタイミングを０とした秒数で行う。
   *
   * @param beforeCheckTimeSeconds   前回のイベントチェック時間[秒]
   * @param motionTimeSeconds        今回の再生時間[秒]
   */
  getFiredEvent(beforeCheckTimeSeconds, motionTimeSeconds) {
    this._firedEventValues.updateSize(0);
    if (!this._motionData) {
      return this._firedEventValues;
    }
    for (let u = 0; u < this._motionData.eventCount; ++u) {
      if (this._motionData.events.at(u).fireTime > beforeCheckTimeSeconds && this._motionData.events.at(u).fireTime <= motionTimeSeconds) {
        this._firedEventValues.pushBack(
          new csmString(this._motionData.events.at(u).value.s)
        );
      }
    }
    return this._firedEventValues;
  }
  /**
   * 透明度のカーブが存在するかどうかを確認する
   *
   * @returns true  -> キーが存在する
   *          false -> キーが存在しない
   */
  isExistModelOpacity() {
    if (!this._motionData) return false;
    for (let i = 0; i < this._motionData.curveCount; i++) {
      const curve = this._motionData.curves.at(i);
      if (curve.type != CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
        continue;
      }
      if (revealIdString(curve.id) == IdNameOpacity$1) {
        return true;
      }
    }
    return false;
  }
  /**
   * 透明度のカーブのインデックスを返す
   *
   * @returns success:透明度のカーブのインデックス
   */
  getModelOpacityIndex() {
    if (this.isExistModelOpacity() && this._motionData) {
      for (let i = 0; i < this._motionData.curveCount; i++) {
        const curve = this._motionData.curves.at(i);
        if (curve.type != CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
          continue;
        }
        if (revealIdString(curve.id) === IdNameOpacity$1) {
          return i;
        }
      }
    }
    return -1;
  }
  /**
   * 透明度のIdを返す
   *
   * @param index モーションカーブのインデックス
   * @returns success:透明度のカーブのインデックス
   */
  getModelOpacityId(index) {
    if (index != -1 && this._motionData) {
      const curve = this._motionData.curves.at(index);
      if (curve.type == CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
        if (revealIdString(curve.id) === IdNameOpacity$1) {
          return curve.id;
        }
      }
    }
    return null;
  }
  /**
   * 現在時間の透明度の値を返す
   *
   * @returns success:モーションの当該時間におけるOpacityの値
   */
  getModelOpacityValue() {
    return this._modelOpacity;
  }
  /**
   * デバッグ用フラグを設定する
   *
   * @param debugMode デバッグモードの有効・無効
   */
  setDebugMode(debugMode) {
    this._debugMode = debugMode;
  }
  // デバッグモードかどうか
}
if (!window.Live2DCubismCore) {
  throw new Error(
    "Could not find Cubism 5 runtime. This plugin requires live2dcubismcore.js to be loaded."
  );
}
const ExpressionKeyFadeIn = "FadeInTime";
const ExpressionKeyFadeOut = "FadeOutTime";
const ExpressionKeyParameters = "Parameters";
const ExpressionKeyId = "Id";
const ExpressionKeyValue = "Value";
const ExpressionKeyBlend = "Blend";
const BlendValueAdd = "Add";
const BlendValueMultiply = "Multiply";
const BlendValueOverwrite = "Overwrite";
const DefaultFadeTime = 1;
const _CubismExpressionMotion = class _CubismExpressionMotion extends ACubismMotion {
  // 乗算適用の初期値
  /**
   * インスタンスを作成する。
   * @param buffer expファイルが読み込まれているバッファ
   * @param size バッファのサイズ
   * @return 作成されたインスタンス
   */
  static create(buffer, size) {
    const expression = new _CubismExpressionMotion();
    expression.parse(buffer, size);
    return expression;
  }
  /**
   * モデルのパラメータの更新の実行
   * @param model 対象のモデル
   * @param userTimeSeconds デルタ時間の積算値[秒]
   * @param weight モーションの重み
   * @param motionQueueEntry CubismMotionQueueManagerで管理されているモーション
   */
  doUpdateParameters(model, userTimeSeconds, weight, motionQueueEntry) {
    for (let i = 0; i < this._parameters.getSize(); ++i) {
      const parameter = this._parameters.at(i);
      switch (parameter.blendType) {
        case 0: {
          model.addParameterValueById(
            parameter.parameterId,
            parameter.value,
            weight
          );
          break;
        }
        case 1: {
          model.multiplyParameterValueById(
            parameter.parameterId,
            parameter.value,
            weight
          );
          break;
        }
        case 2: {
          model.setParameterValueById(
            parameter.parameterId,
            parameter.value,
            weight
          );
          break;
        }
      }
    }
  }
  /**
   * @brief 表情によるモデルのパラメータの計算
   *
   * モデルの表情に関するパラメータを計算する。
   *
   * @param[in]   model                        対象のモデル
   * @param[in]   userTimeSeconds              デルタ時間の積算値[秒]
   * @param[in]   motionQueueEntry             CubismMotionQueueManagerで管理されているモーション
   * @param[in]   expressionParameterValues    モデルに適用する各パラメータの値
   * @param[in]   expressionIndex              表情のインデックス
   * @param[in]   fadeWeight                   表情のウェイト
   */
  calculateExpressionParameters(model, userTimeSeconds, motionQueueEntry, expressionParameterValues, expressionIndex, fadeWeight) {
    if (motionQueueEntry == null || expressionParameterValues == null) {
      return;
    }
    if (!motionQueueEntry.isAvailable()) {
      return;
    }
    this._fadeWeight = this.updateFadeWeight(motionQueueEntry, userTimeSeconds);
    for (let i = 0; i < expressionParameterValues.getSize(); ++i) {
      const expressionParameterValue = expressionParameterValues.at(i);
      if (expressionParameterValue.parameterId == null) {
        continue;
      }
      const currentParameterValue = expressionParameterValue.overwriteValue = model.getParameterValueById(expressionParameterValue.parameterId);
      const expressionParameters = this.getExpressionParameters();
      let parameterIndex = -1;
      for (let j = 0; j < expressionParameters.getSize(); ++j) {
        if (expressionParameterValue.parameterId != expressionParameters.at(j).parameterId) {
          continue;
        }
        parameterIndex = j;
        break;
      }
      if (parameterIndex < 0) {
        if (expressionIndex == 0) {
          expressionParameterValue.additiveValue = _CubismExpressionMotion.DefaultAdditiveValue;
          expressionParameterValue.multiplyValue = _CubismExpressionMotion.DefaultMultiplyValue;
          expressionParameterValue.overwriteValue = currentParameterValue;
        } else {
          expressionParameterValue.additiveValue = this.calculateValue(
            expressionParameterValue.additiveValue,
            _CubismExpressionMotion.DefaultAdditiveValue,
            fadeWeight
          );
          expressionParameterValue.multiplyValue = this.calculateValue(
            expressionParameterValue.multiplyValue,
            _CubismExpressionMotion.DefaultMultiplyValue,
            fadeWeight
          );
          expressionParameterValue.overwriteValue = this.calculateValue(
            expressionParameterValue.overwriteValue,
            currentParameterValue,
            fadeWeight
          );
        }
        continue;
      }
      const value = expressionParameters.at(parameterIndex).value;
      let newAdditiveValue, newMultiplyValue, newOverwriteValue;
      switch (expressionParameters.at(parameterIndex).blendType) {
        case 0:
          newAdditiveValue = value;
          newMultiplyValue = _CubismExpressionMotion.DefaultMultiplyValue;
          newOverwriteValue = currentParameterValue;
          break;
        case 1:
          newAdditiveValue = _CubismExpressionMotion.DefaultAdditiveValue;
          newMultiplyValue = value;
          newOverwriteValue = currentParameterValue;
          break;
        case 2:
          newAdditiveValue = _CubismExpressionMotion.DefaultAdditiveValue;
          newMultiplyValue = _CubismExpressionMotion.DefaultMultiplyValue;
          newOverwriteValue = value;
          break;
        default:
          return;
      }
      if (expressionIndex == 0) {
        expressionParameterValue.additiveValue = newAdditiveValue;
        expressionParameterValue.multiplyValue = newMultiplyValue;
        expressionParameterValue.overwriteValue = newOverwriteValue;
      } else {
        expressionParameterValue.additiveValue = expressionParameterValue.additiveValue * (1 - fadeWeight) + newAdditiveValue * fadeWeight;
        expressionParameterValue.multiplyValue = expressionParameterValue.multiplyValue * (1 - fadeWeight) + newMultiplyValue * fadeWeight;
        expressionParameterValue.overwriteValue = expressionParameterValue.overwriteValue * (1 - fadeWeight) + newOverwriteValue * fadeWeight;
      }
    }
  }
  /**
   * @brief 表情が参照しているパラメータを取得
   *
   * 表情が参照しているパラメータを取得する
   *
   * @return 表情パラメータ
   */
  getExpressionParameters() {
    return this._parameters;
  }
  /**
   * @brief 表情のフェードの値を取得
   *
   * 現在の表情のフェードのウェイト値を取得する
   *
   * @returns 表情のフェードのウェイト値
   *
   * @deprecated CubismExpressionMotion.fadeWeightが削除予定のため非推奨。
   * CubismExpressionMotionManager.getFadeWeight(index: number): number を使用してください。
   * @see CubismExpressionMotionManager#getFadeWeight(index: number)
   */
  getFadeWeight() {
    return this._fadeWeight;
  }
  parse(buffer, size) {
    const json = CubismJson.create(buffer, size);
    if (!json) {
      return;
    }
    const root = json.getRoot();
    this.setFadeInTime(
      root.getValueByString(ExpressionKeyFadeIn).toFloat(DefaultFadeTime)
    );
    this.setFadeOutTime(
      root.getValueByString(ExpressionKeyFadeOut).toFloat(DefaultFadeTime)
    );
    const parameterCount = root.getValueByString(ExpressionKeyParameters).getSize();
    this._parameters.prepareCapacity(parameterCount);
    for (let i = 0; i < parameterCount; ++i) {
      const param = root.getValueByString(ExpressionKeyParameters).getValueByIndex(i);
      const parameterId = CubismFramework.getIdManager().getId(
        param.getValueByString(ExpressionKeyId).getRawString()
      );
      const value = param.getValueByString(ExpressionKeyValue).toFloat();
      let blendType;
      if (param.getValueByString(ExpressionKeyBlend).isNull() || param.getValueByString(ExpressionKeyBlend).getString() == BlendValueAdd) {
        blendType = 0;
      } else if (param.getValueByString(ExpressionKeyBlend).getString() == BlendValueMultiply) {
        blendType = 1;
      } else if (param.getValueByString(ExpressionKeyBlend).getString() == BlendValueOverwrite) {
        blendType = 2;
      } else {
        blendType = 0;
      }
      const item = new ExpressionParameter();
      item.parameterId = parameterId;
      item.blendType = blendType;
      item.value = value;
      this._parameters.pushBack(item);
    }
    CubismJson.delete(json);
  }
  /**
   * @brief ブレンド計算
   *
   * 入力された値でブレンド計算をする。
   *
   * @param source 現在の値
   * @param destination 適用する値
   * @param weight ウェイト
   * @returns 計算結果
   */
  calculateValue(source, destination, fadeWeight) {
    return source * (1 - fadeWeight) + destination * fadeWeight;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._parameters = new csmVector();
    this._fadeWeight = 0;
  }
};
_CubismExpressionMotion.DefaultAdditiveValue = 0;
_CubismExpressionMotion.DefaultMultiplyValue = 1;
let CubismExpressionMotion = _CubismExpressionMotion;
var ExpressionBlendType = /* @__PURE__ */ ((ExpressionBlendType2) => {
  ExpressionBlendType2[ExpressionBlendType2["Additive"] = 0] = "Additive";
  ExpressionBlendType2[ExpressionBlendType2["Multiply"] = 1] = "Multiply";
  ExpressionBlendType2[ExpressionBlendType2["Overwrite"] = 2] = "Overwrite";
  return ExpressionBlendType2;
})(ExpressionBlendType || {});
class ExpressionParameter {
  // 値
}
var Live2DCubismFramework$h;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismExpressionMotion = CubismExpressionMotion;
  Live2DCubismFramework2.ExpressionBlendType = ExpressionBlendType;
  Live2DCubismFramework2.ExpressionParameter = ExpressionParameter;
})(Live2DCubismFramework$h || (Live2DCubismFramework$h = {}));
class CubismMotionQueueEntry {
  /**
   * コンストラクタ
   */
  constructor() {
    this._autoDelete = false;
    this._motion = null;
    this._available = true;
    this._finished = false;
    this._started = false;
    this._startTimeSeconds = -1;
    this._fadeInStartTimeSeconds = 0;
    this._endTimeSeconds = -1;
    this._stateTimeSeconds = 0;
    this._stateWeight = 0;
    this._lastEventCheckSeconds = 0;
    this._motionQueueEntryHandle = this;
    this._fadeOutSeconds = 0;
    this._isTriggeredFadeOut = false;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    if (this._autoDelete && this._motion) {
      ACubismMotion.delete(this._motion);
    }
  }
  /**
   * フェードアウト時間と開始判定の設定
   * @param fadeOutSeconds フェードアウトにかかる時間[秒]
   */
  setFadeOut(fadeOutSeconds) {
    this._fadeOutSeconds = fadeOutSeconds;
    this._isTriggeredFadeOut = true;
  }
  /**
   * フェードアウトの開始
   * @param fadeOutSeconds フェードアウトにかかる時間[秒]
   * @param userTimeSeconds デルタ時間の積算値[秒]
   */
  startFadeOut(fadeOutSeconds, userTimeSeconds) {
    const newEndTimeSeconds = userTimeSeconds + fadeOutSeconds;
    this._isTriggeredFadeOut = true;
    if (this._endTimeSeconds < 0 || newEndTimeSeconds < this._endTimeSeconds) {
      this._endTimeSeconds = newEndTimeSeconds;
    }
  }
  /**
   * モーションの終了の確認
   *
   * @return true モーションが終了した
   * @return false 終了していない
   */
  isFinished() {
    return this._finished;
  }
  /**
   * モーションの開始の確認
   * @return true モーションが開始した
   * @return false 開始していない
   */
  isStarted() {
    return this._started;
  }
  /**
   * モーションの開始時刻の取得
   * @return モーションの開始時刻[秒]
   */
  getStartTime() {
    return this._startTimeSeconds;
  }
  /**
   * フェードインの開始時刻の取得
   * @return フェードインの開始時刻[秒]
   */
  getFadeInStartTime() {
    return this._fadeInStartTimeSeconds;
  }
  /**
   * フェードインの終了時刻の取得
   * @return フェードインの終了時刻の取得
   */
  getEndTime() {
    return this._endTimeSeconds;
  }
  /**
   * モーションの開始時刻の設定
   * @param startTime モーションの開始時刻
   */
  setStartTime(startTime) {
    this._startTimeSeconds = startTime;
  }
  /**
   * フェードインの開始時刻の設定
   * @param startTime フェードインの開始時刻[秒]
   */
  setFadeInStartTime(startTime) {
    this._fadeInStartTimeSeconds = startTime;
  }
  /**
   * フェードインの終了時刻の設定
   * @param endTime フェードインの終了時刻[秒]
   */
  setEndTime(endTime) {
    this._endTimeSeconds = endTime;
  }
  /**
   * モーションの終了の設定
   * @param f trueならモーションの終了
   */
  setIsFinished(f) {
    this._finished = f;
  }
  /**
   * モーション開始の設定
   * @param f trueならモーションの開始
   */
  setIsStarted(f) {
    this._started = f;
  }
  /**
   * モーションの有効性の確認
   * @return true モーションは有効
   * @return false モーションは無効
   */
  isAvailable() {
    return this._available;
  }
  /**
   * モーションの有効性の設定
   * @param v trueならモーションは有効
   */
  setIsAvailable(v) {
    this._available = v;
  }
  /**
   * モーションの状態の設定
   * @param timeSeconds 現在時刻[秒]
   * @param weight モーション尾重み
   */
  setState(timeSeconds, weight) {
    this._stateTimeSeconds = timeSeconds;
    this._stateWeight = weight;
  }
  /**
   * モーションの現在時刻の取得
   * @return モーションの現在時刻[秒]
   */
  getStateTime() {
    return this._stateTimeSeconds;
  }
  /**
   * モーションの重みの取得
   * @return モーションの重み
   */
  getStateWeight() {
    return this._stateWeight;
  }
  /**
   * 最後にイベントの発火をチェックした時間を取得
   *
   * @return 最後にイベントの発火をチェックした時間[秒]
   */
  getLastCheckEventSeconds() {
    return this._lastEventCheckSeconds;
  }
  /**
   * 最後にイベントをチェックした時間を設定
   * @param checkSeconds 最後にイベントをチェックした時間[秒]
   */
  setLastCheckEventSeconds(checkSeconds) {
    this._lastEventCheckSeconds = checkSeconds;
  }
  /**
   * フェードアウト開始判定の取得
   * @return フェードアウト開始するかどうか
   */
  isTriggeredFadeOut() {
    return this._isTriggeredFadeOut;
  }
  /**
   * フェードアウト時間の取得
   * @return フェードアウト時間[秒]
   */
  getFadeOutSeconds() {
    return this._fadeOutSeconds;
  }
  /**
   * モーションの取得
   *
   * @return モーション
   */
  getCubismMotion() {
    return this._motion;
  }
  // インスタンスごとに一意の値を持つ識別番号
}
var Live2DCubismFramework$g;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismMotionQueueEntry = CubismMotionQueueEntry;
})(Live2DCubismFramework$g || (Live2DCubismFramework$g = {}));
class CubismMotionQueueManager {
  /**
   * コンストラクタ
   */
  constructor() {
    this._userTimeSeconds = 0;
    this._eventCallBack = null;
    this._eventCustomData = null;
    this._motions = new csmVector();
  }
  /**
   * デストラクタ
   */
  release() {
    for (let i = 0; i < this._motions.getSize(); ++i) {
      if (this._motions.at(i)) {
        this._motions.at(i).release();
        this._motions.set(i, null);
      }
    }
    this._motions = null;
  }
  /**
   * 指定したモーションの開始
   *
   * 指定したモーションを開始する。同じタイプのモーションが既にある場合は、既存のモーションに終了フラグを立て、フェードアウトを開始させる。
   *
   * @param   motion          開始するモーション
   * @param   autoDelete      再生が終了したモーションのインスタンスを削除するなら true
   * @param   userTimeSeconds Deprecated: デルタ時間の積算値[秒] 関数内で参照していないため使用は非推奨。
   * @return                      開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するIsFinished()の引数で使用する。開始できない時は「-1」
   */
  startMotion(motion, autoDelete, userTimeSeconds) {
    if (motion == null) {
      return InvalidMotionQueueEntryHandleValue;
    }
    let motionQueueEntry = null;
    for (let i = 0; i < this._motions.getSize(); ++i) {
      motionQueueEntry = this._motions.at(i);
      if (motionQueueEntry == null) {
        continue;
      }
      motionQueueEntry.setFadeOut(motionQueueEntry._motion.getFadeOutTime());
    }
    motionQueueEntry = new CubismMotionQueueEntry();
    motionQueueEntry._autoDelete = autoDelete;
    motionQueueEntry._motion = motion;
    this._motions.pushBack(motionQueueEntry);
    return motionQueueEntry._motionQueueEntryHandle;
  }
  /**
   * 全てのモーションの終了の確認
   * @return true 全て終了している
   * @return false 終了していない
   */
  isFinished() {
    for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ) {
      let motionQueueEntry = ite.ptr();
      if (motionQueueEntry == null) {
        ite = this._motions.erase(ite);
        continue;
      }
      const motion = motionQueueEntry._motion;
      if (motion == null) {
        motionQueueEntry.release();
        motionQueueEntry = null;
        ite = this._motions.erase(ite);
        continue;
      }
      if (!motionQueueEntry.isFinished()) {
        return false;
      } else {
        ite.preIncrement();
      }
    }
    return true;
  }
  /**
   * 指定したモーションの終了の確認
   * @param motionQueueEntryNumber モーションの識別番号
   * @return true 全て終了している
   * @return false 終了していない
   */
  isFinishedByHandle(motionQueueEntryNumber) {
    for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ite.increment()) {
      const motionQueueEntry = ite.ptr();
      if (motionQueueEntry == null) {
        continue;
      }
      if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber && !motionQueueEntry.isFinished()) {
        return false;
      }
    }
    return true;
  }
  /**
   * 全てのモーションを停止する
   */
  stopAllMotions() {
    for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ) {
      let motionQueueEntry = ite.ptr();
      if (motionQueueEntry == null) {
        ite = this._motions.erase(ite);
        continue;
      }
      motionQueueEntry.release();
      motionQueueEntry = null;
      ite = this._motions.erase(ite);
    }
  }
  /**
   * @brief CubismMotionQueueEntryの配列の取得
   *
   * CubismMotionQueueEntryの配列を取得する。
   *
   * @return  CubismMotionQueueEntryの配列へのポインタ
   * @retval  NULL   見つからなかった
   */
  getCubismMotionQueueEntries() {
    return this._motions;
  }
  /**
     * 指定したCubismMotionQueueEntryの取得
  
     * @param   motionQueueEntryNumber  モーションの識別番号
     * @return  指定したCubismMotionQueueEntry
     * @return  null   見つからなかった
     */
  getCubismMotionQueueEntry(motionQueueEntryNumber) {
    for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ite.preIncrement()) {
      const motionQueueEntry = ite.ptr();
      if (motionQueueEntry == null) {
        continue;
      }
      if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber) {
        return motionQueueEntry;
      }
    }
    return null;
  }
  /**
   * イベントを受け取るCallbackの登録
   *
   * @param callback コールバック関数
   * @param customData コールバックに返されるデータ
   */
  setEventCallback(callback, customData = null) {
    this._eventCallBack = callback;
    this._eventCustomData = customData;
  }
  /**
   * モーションを更新して、モデルにパラメータ値を反映する。
   *
   * @param   model   対象のモデル
   * @param   userTimeSeconds   デルタ時間の積算値[秒]
   * @return  true    モデルへパラメータ値の反映あり
   * @return  false   モデルへパラメータ値の反映なし(モーションの変化なし)
   */
  doUpdateMotion(model, userTimeSeconds) {
    let updated = false;
    for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ) {
      let motionQueueEntry = ite.ptr();
      if (motionQueueEntry == null) {
        ite = this._motions.erase(ite);
        continue;
      }
      const motion = motionQueueEntry._motion;
      if (motion == null) {
        motionQueueEntry.release();
        motionQueueEntry = null;
        ite = this._motions.erase(ite);
        continue;
      }
      motion.updateParameters(model, motionQueueEntry, userTimeSeconds);
      updated = true;
      const firedList = motion.getFiredEvent(
        motionQueueEntry.getLastCheckEventSeconds() - motionQueueEntry.getStartTime(),
        userTimeSeconds - motionQueueEntry.getStartTime()
      );
      for (let i = 0; i < firedList.getSize(); ++i) {
        this._eventCallBack(this, firedList.at(i), this._eventCustomData);
      }
      motionQueueEntry.setLastCheckEventSeconds(userTimeSeconds);
      if (motionQueueEntry.isFinished()) {
        motionQueueEntry.release();
        motionQueueEntry = null;
        ite = this._motions.erase(ite);
      } else {
        if (motionQueueEntry.isTriggeredFadeOut()) {
          motionQueueEntry.startFadeOut(
            motionQueueEntry.getFadeOutSeconds(),
            userTimeSeconds
          );
        }
        ite.preIncrement();
      }
    }
    return updated;
  }
  // コールバックに戻されるデータ
}
const InvalidMotionQueueEntryHandleValue = -1;
var Live2DCubismFramework$f;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismMotionQueueManager = CubismMotionQueueManager;
  Live2DCubismFramework2.InvalidMotionQueueEntryHandleValue = InvalidMotionQueueEntryHandleValue;
})(Live2DCubismFramework$f || (Live2DCubismFramework$f = {}));
class Cubism5ExpressionManager extends ExpressionManager {
  constructor(settings, options) {
    var _a;
    super(settings, options);
    __publicField(this, "queueManager", new CubismMotionQueueManager());
    __publicField(this, "definitions");
    this.definitions = (_a = settings.expressions) != null ? _a : [];
    this.init();
  }
  isFinished() {
    return this.queueManager.isFinished();
  }
  getExpressionIndex(name) {
    return this.definitions.findIndex((def) => def.Name === name);
  }
  getExpressionFile(definition) {
    return definition.File;
  }
  createExpression(data, definition) {
    if (typeof data === "string") {
      const buffer2 = new TextEncoder().encode(data);
      return CubismExpressionMotion.create(buffer2.buffer, buffer2.byteLength);
    }
    const jsonString = JSON.stringify(data);
    const buffer = new TextEncoder().encode(jsonString);
    return CubismExpressionMotion.create(buffer.buffer, buffer.byteLength);
  }
  _setExpression(motion) {
    return this.queueManager.startMotion(motion, false, performance.now());
  }
  stopAllExpressions() {
    this.queueManager.stopAllMotions();
  }
  updateParameters(model, now) {
    return this.queueManager.doUpdateMotion(model, now);
  }
}
const Meta$1 = "Meta";
const Duration = "Duration";
const Loop = "Loop";
const AreBeziersRestricted = "AreBeziersRestricted";
const CurveCount = "CurveCount";
const Fps$1 = "Fps";
const TotalSegmentCount = "TotalSegmentCount";
const TotalPointCount = "TotalPointCount";
const Curves = "Curves";
const Target = "Target";
const Id$2 = "Id";
const FadeInTime = "FadeInTime";
const FadeOutTime = "FadeOutTime";
const Segments = "Segments";
const UserData = "UserData";
const UserDataCount = "UserDataCount";
const TotalUserDataSize = "TotalUserDataSize";
const Time = "Time";
const Value2 = "Value";
class CubismMotionJson {
  /**
   * コンストラクタ
   * @param buffer motion3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   */
  constructor(buffer, size) {
    this._json = CubismJson.create(buffer, size);
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    CubismJson.delete(this._json);
  }
  /**
   * モーションの長さを取得する
   * @return モーションの長さ[秒]
   */
  getMotionDuration() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(Duration).toFloat();
  }
  /**
   * モーションのループ情報の取得
   * @return true ループする
   * @return false ループしない
   */
  isMotionLoop() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(Loop).toBoolean();
  }
  /**
   *  motion3.jsonファイルの整合性チェック
   *
   * @return 正常なファイルの場合はtrueを返す。
   */
  hasConsistency() {
    let result = true;
    if (!this._json || !this._json.getRoot()) {
      return false;
    }
    const actualCurveListSize = this._json.getRoot().getValueByString(Curves).getVector().getSize();
    let actualTotalSegmentCount = 0;
    let actualTotalPointCount = 0;
    for (let curvePosition = 0; curvePosition < actualCurveListSize; ++curvePosition) {
      for (let segmentPosition = 0; segmentPosition < this.getMotionCurveSegmentCount(curvePosition); ) {
        if (segmentPosition == 0) {
          actualTotalPointCount += 1;
          segmentPosition += 2;
        }
        const segment = this.getMotionCurveSegment(
          curvePosition,
          segmentPosition
        );
        switch (segment) {
          case CubismMotionSegmentType.CubismMotionSegmentType_Linear:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_Bezier:
            actualTotalPointCount += 3;
            segmentPosition += 7;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_Stepped:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          default:
            CSM_ASSERT(0);
            break;
        }
        ++actualTotalSegmentCount;
      }
    }
    if (actualCurveListSize != this.getMotionCurveCount()) {
      CubismLogWarning("The number of curves does not match the metadata.");
      result = false;
    }
    if (actualTotalSegmentCount != this.getMotionTotalSegmentCount()) {
      CubismLogWarning("The number of segment does not match the metadata.");
      result = false;
    }
    if (actualTotalPointCount != this.getMotionTotalPointCount()) {
      CubismLogWarning("The number of point does not match the metadata.");
      result = false;
    }
    return result;
  }
  getEvaluationOptionFlag(flagType) {
    if (0 == flagType) {
      return this._json.getRoot().getValueByString(Meta$1).getValueByString(AreBeziersRestricted).toBoolean();
    }
    return false;
  }
  /**
   * モーションカーブの個数の取得
   * @return モーションカーブの個数
   */
  getMotionCurveCount() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(CurveCount).toInt();
  }
  /**
   * モーションのフレームレートの取得
   * @return フレームレート[FPS]
   */
  getMotionFps() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(Fps$1).toFloat();
  }
  /**
   * モーションのセグメントの総合計の取得
   * @return モーションのセグメントの取得
   */
  getMotionTotalSegmentCount() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(TotalSegmentCount).toInt();
  }
  /**
   * モーションのカーブの制御店の総合計の取得
   * @return モーションのカーブの制御点の総合計
   */
  getMotionTotalPointCount() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(TotalPointCount).toInt();
  }
  /**
   * モーションのフェードイン時間の存在
   * @return true 存在する
   * @return false 存在しない
   */
  isExistMotionFadeInTime() {
    return !this._json.getRoot().getValueByString(Meta$1).getValueByString(FadeInTime).isNull();
  }
  /**
   * モーションのフェードアウト時間の存在
   * @return true 存在する
   * @return false 存在しない
   */
  isExistMotionFadeOutTime() {
    return !this._json.getRoot().getValueByString(Meta$1).getValueByString(FadeOutTime).isNull();
  }
  /**
   * モーションのフェードイン時間の取得
   * @return フェードイン時間[秒]
   */
  getMotionFadeInTime() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(FadeInTime).toFloat();
  }
  /**
   * モーションのフェードアウト時間の取得
   * @return フェードアウト時間[秒]
   */
  getMotionFadeOutTime() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(FadeOutTime).toFloat();
  }
  /**
   * モーションのカーブの種類の取得
   * @param curveIndex カーブのインデックス
   * @return カーブの種類
   */
  getMotionCurveTarget(curveIndex) {
    return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(Target).getRawString();
  }
  /**
   * モーションのカーブのIDの取得
   * @param curveIndex カーブのインデックス
   * @return カーブのID
   */
  getMotionCurveId(curveIndex) {
    return CubismFramework.getIdManager().getId(
      this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(Id$2).getRawString()
    );
  }
  /**
   * モーションのカーブのフェードイン時間の存在
   * @param curveIndex カーブのインデックス
   * @return true 存在する
   * @return false 存在しない
   */
  isExistMotionCurveFadeInTime(curveIndex) {
    return !this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(FadeInTime).isNull();
  }
  /**
   * モーションのカーブのフェードアウト時間の存在
   * @param curveIndex カーブのインデックス
   * @return true 存在する
   * @return false 存在しない
   */
  isExistMotionCurveFadeOutTime(curveIndex) {
    return !this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(FadeOutTime).isNull();
  }
  /**
   * モーションのカーブのフェードイン時間の取得
   * @param curveIndex カーブのインデックス
   * @return フェードイン時間[秒]
   */
  getMotionCurveFadeInTime(curveIndex) {
    return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(FadeInTime).toFloat();
  }
  /**
   * モーションのカーブのフェードアウト時間の取得
   * @param curveIndex カーブのインデックス
   * @return フェードアウト時間[秒]
   */
  getMotionCurveFadeOutTime(curveIndex) {
    return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(FadeOutTime).toFloat();
  }
  /**
   * モーションのカーブのセグメントの個数を取得する
   * @param curveIndex カーブのインデックス
   * @return モーションのカーブのセグメントの個数
   */
  getMotionCurveSegmentCount(curveIndex) {
    return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(Segments).getVector().getSize();
  }
  /**
   * モーションのカーブのセグメントの値の取得
   * @param curveIndex カーブのインデックス
   * @param segmentIndex セグメントのインデックス
   * @return セグメントの値
   */
  getMotionCurveSegment(curveIndex, segmentIndex) {
    return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(Segments).getValueByIndex(segmentIndex).toFloat();
  }
  /**
   * イベントの個数の取得
   * @return イベントの個数
   */
  getEventCount() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(UserDataCount).toInt();
  }
  /**
   *  イベントの総文字数の取得
   * @return イベントの総文字数
   */
  getTotalEventValueSize() {
    return this._json.getRoot().getValueByString(Meta$1).getValueByString(TotalUserDataSize).toInt();
  }
  /**
   * イベントの時間の取得
   * @param userDataIndex イベントのインデックス
   * @return イベントの時間[秒]
   */
  getEventTime(userDataIndex) {
    return this._json.getRoot().getValueByString(UserData).getValueByIndex(userDataIndex).getValueByString(Time).toFloat();
  }
  /**
   * イベントの取得
   * @param userDataIndex イベントのインデックス
   * @return イベントの文字列
   */
  getEventValue(userDataIndex) {
    return new csmString(
      this._json.getRoot().getValueByString(UserData).getValueByIndex(userDataIndex).getValueByString(Value2).getRawString()
    );
  }
  // motion3.jsonのデータ
}
var EvaluationOptionFlag = /* @__PURE__ */ ((EvaluationOptionFlag2) => {
  EvaluationOptionFlag2[EvaluationOptionFlag2["EvaluationOptionFlag_AreBeziersRistricted"] = 0] = "EvaluationOptionFlag_AreBeziersRistricted";
  return EvaluationOptionFlag2;
})(EvaluationOptionFlag || {});
var Live2DCubismFramework$e;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismMotionJson = CubismMotionJson;
})(Live2DCubismFramework$e || (Live2DCubismFramework$e = {}));
const EffectNameEyeBlink = "EyeBlink";
const EffectNameLipSync = "LipSync";
const TargetNameModel = "Model";
const TargetNameParameter = "Parameter";
const TargetNamePartOpacity = "PartOpacity";
const IdNameOpacity = "Opacity";
const UseOldBeziersCurveMotion = false;
function lerpPoints(a, b, t) {
  const result = new CubismMotionPoint();
  result.time = a.time + (b.time - a.time) * t;
  result.value = a.value + (b.value - a.value) * t;
  return result;
}
function linearEvaluate(points, time) {
  let t = (time - points[0].time) / (points[1].time - points[0].time);
  if (t < 0) {
    t = 0;
  }
  return points[0].value + (points[1].value - points[0].value) * t;
}
function bezierEvaluate(points, time) {
  let t = (time - points[0].time) / (points[3].time - points[0].time);
  if (t < 0) {
    t = 0;
  }
  const p01 = lerpPoints(points[0], points[1], t);
  const p12 = lerpPoints(points[1], points[2], t);
  const p23 = lerpPoints(points[2], points[3], t);
  const p012 = lerpPoints(p01, p12, t);
  const p123 = lerpPoints(p12, p23, t);
  return lerpPoints(p012, p123, t).value;
}
function bezierEvaluateCardanoInterpretation(points, time) {
  const x = time;
  const x1 = points[0].time;
  const x2 = points[3].time;
  const cx1 = points[1].time;
  const cx2 = points[2].time;
  const a = x2 - 3 * cx2 + 3 * cx1 - x1;
  const b = 3 * cx2 - 6 * cx1 + 3 * x1;
  const c = 3 * cx1 - 3 * x1;
  const d = x1 - x;
  const t = CubismMath.cardanoAlgorithmForBezier(a, b, c, d);
  const p01 = lerpPoints(points[0], points[1], t);
  const p12 = lerpPoints(points[1], points[2], t);
  const p23 = lerpPoints(points[2], points[3], t);
  const p012 = lerpPoints(p01, p12, t);
  const p123 = lerpPoints(p12, p23, t);
  return lerpPoints(p012, p123, t).value;
}
function steppedEvaluate(points, time) {
  return points[0].value;
}
function inverseSteppedEvaluate(points, time) {
  return points[1].value;
}
function evaluateCurve(motionData, index, time, isCorrection, endTime) {
  const curve = motionData.curves.at(index);
  let target = -1;
  const totalSegmentCount = curve.baseSegmentIndex + curve.segmentCount;
  let pointPosition = 0;
  for (let i = curve.baseSegmentIndex; i < totalSegmentCount; ++i) {
    pointPosition = motionData.segments.at(i).basePointIndex + (motionData.segments.at(i).segmentType == CubismMotionSegmentType.CubismMotionSegmentType_Bezier ? 3 : 1);
    if (motionData.points.at(pointPosition).time > time) {
      target = i;
      break;
    }
  }
  if (target == -1) {
    if (isCorrection && time < endTime) {
      return correctEndPoint(
        motionData,
        totalSegmentCount - 1,
        motionData.segments.at(curve.baseSegmentIndex).basePointIndex,
        pointPosition,
        time,
        endTime
      );
    }
    return motionData.points.at(pointPosition).value;
  }
  const segment = motionData.segments.at(target);
  return segment.evaluate(motionData.points.get(segment.basePointIndex), time);
}
function correctEndPoint(motionData, segmentIndex, beginIndex, endIndex, time, endTime) {
  const motionPoint = [
    new CubismMotionPoint(),
    new CubismMotionPoint()
  ];
  {
    const src = motionData.points.at(endIndex);
    motionPoint[0].time = src.time;
    motionPoint[0].value = src.value;
  }
  {
    const src = motionData.points.at(beginIndex);
    motionPoint[1].time = endTime;
    motionPoint[1].value = src.value;
  }
  switch (motionData.segments.at(segmentIndex).segmentType) {
    case CubismMotionSegmentType.CubismMotionSegmentType_Linear:
    case CubismMotionSegmentType.CubismMotionSegmentType_Bezier:
    default:
      return linearEvaluate(motionPoint, time);
    case CubismMotionSegmentType.CubismMotionSegmentType_Stepped:
      return steppedEvaluate(motionPoint);
    case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped:
      return inverseSteppedEvaluate(motionPoint);
  }
}
class CubismMotion extends ACubismMotion {
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._motionBehavior = 1;
    this._sourceFrameRate = 30;
    this._loopDurationSeconds = -1;
    this._isLoop = false;
    this._isLoopFadeIn = true;
    this._lastWeight = 0;
    this._motionData = null;
    this._modelCurveIdEyeBlink = null;
    this._modelCurveIdLipSync = null;
    this._modelCurveIdOpacity = null;
    this._eyeBlinkParameterIds = null;
    this._lipSyncParameterIds = null;
    this._modelOpacity = 1;
    this._debugMode = false;
  }
  /**
   * インスタンスを作成する
   *
   * @param buffer motion3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @param onBeganMotionHandler モーション再生開始時に呼び出されるコールバック関数
   * @param shouldCheckMotionConsistency motion3.json整合性チェックするかどうか
   * @return 作成されたインスタンス
   */
  static create(buffer, size, onFinishedMotionHandler, onBeganMotionHandler, shouldCheckMotionConsistency = false) {
    const ret = new CubismMotion();
    ret.parse(buffer, size, shouldCheckMotionConsistency);
    if (ret._motionData) {
      ret._sourceFrameRate = ret._motionData.fps;
      ret._loopDurationSeconds = ret._motionData.duration;
      ret._onFinishedMotion = onFinishedMotionHandler;
      ret._onBeganMotion = onBeganMotionHandler;
    } else {
      csmDelete(ret);
      return null;
    }
    return ret;
  }
  /**
   * モデルのパラメータの更新の実行
   * @param model             対象のモデル
   * @param userTimeSeconds   現在の時刻[秒]
   * @param fadeWeight        モーションの重み
   * @param motionQueueEntry  CubismMotionQueueManagerで管理されているモーション
   */
  doUpdateParameters(model, userTimeSeconds, fadeWeight, motionQueueEntry) {
    if (this._modelCurveIdEyeBlink == null) {
      this._modelCurveIdEyeBlink = CubismFramework.getIdManager().getId(EffectNameEyeBlink);
    }
    if (this._modelCurveIdLipSync == null) {
      this._modelCurveIdLipSync = CubismFramework.getIdManager().getId(EffectNameLipSync);
    }
    if (this._modelCurveIdOpacity == null) {
      this._modelCurveIdOpacity = CubismFramework.getIdManager().getId(IdNameOpacity);
    }
    if (this._motionBehavior === 1) {
      if (this._previousLoopState !== this._isLoop) {
        this.adjustEndTime(motionQueueEntry);
        this._previousLoopState = this._isLoop;
      }
    }
    let timeOffsetSeconds = userTimeSeconds - motionQueueEntry.getStartTime();
    if (timeOffsetSeconds < 0) {
      timeOffsetSeconds = 0;
    }
    let lipSyncValue = Number.MAX_VALUE;
    let eyeBlinkValue = Number.MAX_VALUE;
    const maxTargetSize = 64;
    let lipSyncFlags = 0;
    let eyeBlinkFlags = 0;
    if (this._eyeBlinkParameterIds.getSize() > maxTargetSize) {
      CubismLogDebug(
        "too many eye blink targets : {0}",
        this._eyeBlinkParameterIds.getSize()
      );
    }
    if (this._lipSyncParameterIds.getSize() > maxTargetSize) {
      CubismLogDebug(
        "too many lip sync targets : {0}",
        this._lipSyncParameterIds.getSize()
      );
    }
    const tmpFadeIn = this._fadeInSeconds <= 0 ? 1 : CubismMath.getEasingSine(
      (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / this._fadeInSeconds
    );
    const tmpFadeOut = this._fadeOutSeconds <= 0 || motionQueueEntry.getEndTime() < 0 ? 1 : CubismMath.getEasingSine(
      (motionQueueEntry.getEndTime() - userTimeSeconds) / this._fadeOutSeconds
    );
    let value;
    let c, parameterIndex;
    let time = timeOffsetSeconds;
    let duration = this._motionData.duration;
    const isCorrection = this._motionBehavior === 1 && this._isLoop;
    if (this._isLoop) {
      if (this._motionBehavior === 1) {
        duration += 1 / this._motionData.fps;
      }
      while (time > duration) {
        time -= duration;
      }
    }
    const curves = this._motionData.curves;
    for (c = 0; c < this._motionData.curveCount && curves.at(c).type == CubismMotionCurveTarget.CubismMotionCurveTarget_Model; ++c) {
      value = evaluateCurve(this._motionData, c, time, isCorrection, duration);
      if (curves.at(c).id == this._modelCurveIdEyeBlink) {
        eyeBlinkValue = value;
      } else if (curves.at(c).id == this._modelCurveIdLipSync) {
        lipSyncValue = value;
      } else if (curves.at(c).id == this._modelCurveIdOpacity) {
        this._modelOpacity = value;
        model.setModelOapcity(this.getModelOpacityValue());
      }
    }
    for (; c < this._motionData.curveCount && curves.at(c).type == CubismMotionCurveTarget.CubismMotionCurveTarget_Parameter; ++c) {
      parameterIndex = model.getParameterIndex(curves.at(c).id);
      if (parameterIndex == -1) {
        continue;
      }
      const sourceValue = model.getParameterValueByIndex(parameterIndex);
      value = evaluateCurve(this._motionData, c, time, isCorrection, duration);
      if (eyeBlinkValue != Number.MAX_VALUE) {
        for (let i = 0; i < this._eyeBlinkParameterIds.getSize() && i < maxTargetSize; ++i) {
          if (this._eyeBlinkParameterIds.at(i) == curves.at(c).id) {
            value *= eyeBlinkValue;
            eyeBlinkFlags |= 1 << i;
            break;
          }
        }
      }
      if (lipSyncValue != Number.MAX_VALUE) {
        for (let i = 0; i < this._lipSyncParameterIds.getSize() && i < maxTargetSize; ++i) {
          if (this._lipSyncParameterIds.at(i) == curves.at(c).id) {
            value += lipSyncValue;
            lipSyncFlags |= 1 << i;
            break;
          }
        }
      }
      if (model.isRepeat(parameterIndex)) {
        value = model.getParameterRepeatValue(parameterIndex, value);
      }
      let v;
      if (curves.at(c).fadeInTime < 0 && curves.at(c).fadeOutTime < 0) {
        v = sourceValue + (value - sourceValue) * fadeWeight;
      } else {
        let fin;
        let fout;
        if (curves.at(c).fadeInTime < 0) {
          fin = tmpFadeIn;
        } else {
          fin = curves.at(c).fadeInTime == 0 ? 1 : CubismMath.getEasingSine(
            (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / curves.at(c).fadeInTime
          );
        }
        if (curves.at(c).fadeOutTime < 0) {
          fout = tmpFadeOut;
        } else {
          fout = curves.at(c).fadeOutTime == 0 || motionQueueEntry.getEndTime() < 0 ? 1 : CubismMath.getEasingSine(
            (motionQueueEntry.getEndTime() - userTimeSeconds) / curves.at(c).fadeOutTime
          );
        }
        const paramWeight = this._weight * fin * fout;
        v = sourceValue + (value - sourceValue) * paramWeight;
      }
      model.setParameterValueByIndex(parameterIndex, v, 1);
    }
    {
      if (eyeBlinkValue != Number.MAX_VALUE) {
        for (let i = 0; i < this._eyeBlinkParameterIds.getSize() && i < maxTargetSize; ++i) {
          const sourceValue = model.getParameterValueById(
            this._eyeBlinkParameterIds.at(i)
          );
          if (eyeBlinkFlags >> i & 1) {
            continue;
          }
          const v = sourceValue + (eyeBlinkValue - sourceValue) * fadeWeight;
          model.setParameterValueById(this._eyeBlinkParameterIds.at(i), v);
        }
      }
      if (lipSyncValue != Number.MAX_VALUE) {
        for (let i = 0; i < this._lipSyncParameterIds.getSize() && i < maxTargetSize; ++i) {
          const sourceValue = model.getParameterValueById(
            this._lipSyncParameterIds.at(i)
          );
          if (lipSyncFlags >> i & 1) {
            continue;
          }
          const v = sourceValue + (lipSyncValue - sourceValue) * fadeWeight;
          model.setParameterValueById(this._lipSyncParameterIds.at(i), v);
        }
      }
    }
    for (; c < this._motionData.curveCount && curves.at(c).type == CubismMotionCurveTarget.CubismMotionCurveTarget_PartOpacity; ++c) {
      parameterIndex = model.getParameterIndex(curves.at(c).id);
      if (parameterIndex == -1) {
        continue;
      }
      value = evaluateCurve(this._motionData, c, time, isCorrection, duration);
      model.setParameterValueByIndex(parameterIndex, value);
    }
    if (timeOffsetSeconds >= duration) {
      if (this._isLoop) {
        this.updateForNextLoop(motionQueueEntry, userTimeSeconds, time);
      } else {
        if (this._onFinishedMotion) {
          this._onFinishedMotion(this);
        }
        motionQueueEntry.setIsFinished(true);
      }
    }
    this._lastWeight = fadeWeight;
  }
  /**
   * ループ情報の設定
   * @param loop ループ情報
   */
  setIsLoop(loop) {
    CubismLogWarning(
      "setIsLoop() is a deprecated function. Please use setLoop()."
    );
    this._isLoop = loop;
  }
  /**
   * ループ情報の取得
   * @return true ループする
   * @return false ループしない
   */
  isLoop() {
    CubismLogWarning(
      "isLoop() is a deprecated function. Please use getLoop()."
    );
    return this._isLoop;
  }
  /**
   * ループ時のフェードイン情報の設定
   * @param loopFadeIn  ループ時のフェードイン情報
   */
  setIsLoopFadeIn(loopFadeIn) {
    CubismLogWarning(
      "setIsLoopFadeIn() is a deprecated function. Please use setLoopFadeIn()."
    );
    this._isLoopFadeIn = loopFadeIn;
  }
  /**
   * ループ時のフェードイン情報の取得
   *
   * @return  true    する
   * @return  false   しない
   */
  isLoopFadeIn() {
    CubismLogWarning(
      "isLoopFadeIn() is a deprecated function. Please use getLoopFadeIn()."
    );
    return this._isLoopFadeIn;
  }
  /**
   * Sets the version of the Motion Behavior.
   *
   * @param Specifies the version of the Motion Behavior.
   */
  setMotionBehavior(motionBehavior) {
    this._motionBehavior = motionBehavior;
  }
  /**
   * Gets the version of the Motion Behavior.
   *
   * @return Returns the version of the Motion Behavior.
   */
  getMotionBehavior() {
    return this._motionBehavior;
  }
  /**
   * モーションの長さを取得する。
   *
   * @return  モーションの長さ[秒]
   */
  getDuration() {
    return this._isLoop ? -1 : this._loopDurationSeconds;
  }
  /**
   * モーションのループ時の長さを取得する。
   *
   * @return  モーションのループ時の長さ[秒]
   */
  getLoopDuration() {
    return this._loopDurationSeconds;
  }
  /**
   * パラメータに対するフェードインの時間を設定する。
   *
   * @param parameterId     パラメータID
   * @param value           フェードインにかかる時間[秒]
   */
  setParameterFadeInTime(parameterId, value) {
    const curves = this._motionData.curves;
    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves.at(i).id) {
        curves.at(i).fadeInTime = value;
        return;
      }
    }
  }
  /**
   * パラメータに対するフェードアウトの時間の設定
   * @param parameterId     パラメータID
   * @param value           フェードアウトにかかる時間[秒]
   */
  setParameterFadeOutTime(parameterId, value) {
    const curves = this._motionData.curves;
    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves.at(i).id) {
        curves.at(i).fadeOutTime = value;
        return;
      }
    }
  }
  /**
   * パラメータに対するフェードインの時間の取得
   * @param    parameterId     パラメータID
   * @return   フェードインにかかる時間[秒]
   */
  getParameterFadeInTime(parameterId) {
    const curves = this._motionData.curves;
    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves.at(i).id) {
        return curves.at(i).fadeInTime;
      }
    }
    return -1;
  }
  /**
   * パラメータに対するフェードアウトの時間を取得
   *
   * @param   parameterId     パラメータID
   * @return   フェードアウトにかかる時間[秒]
   */
  getParameterFadeOutTime(parameterId) {
    const curves = this._motionData.curves;
    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves.at(i).id) {
        return curves.at(i).fadeOutTime;
      }
    }
    return -1;
  }
  /**
   * 自動エフェクトがかかっているパラメータIDリストの設定
   * @param eyeBlinkParameterIds    自動まばたきがかかっているパラメータIDのリスト
   * @param lipSyncParameterIds     リップシンクがかかっているパラメータIDのリスト
   */
  setEffectIds(eyeBlinkParameterIds, lipSyncParameterIds) {
    this._eyeBlinkParameterIds = eyeBlinkParameterIds;
    this._lipSyncParameterIds = lipSyncParameterIds;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this._motionData = void 0;
    this._motionData = null;
  }
  /**
   *
   * @param motionQueueEntry
   * @param userTimeSeconds
   * @param time
   */
  updateForNextLoop(motionQueueEntry, userTimeSeconds, time) {
    switch (this._motionBehavior) {
      case 1:
      default:
        motionQueueEntry.setStartTime(userTimeSeconds - time);
        if (this._isLoopFadeIn) {
          motionQueueEntry.setFadeInStartTime(userTimeSeconds - time);
        }
        if (this._onFinishedMotion != null) {
          this._onFinishedMotion(this);
        }
        break;
      case 0:
        motionQueueEntry.setStartTime(userTimeSeconds);
        if (this._isLoopFadeIn) {
          motionQueueEntry.setFadeInStartTime(userTimeSeconds);
        }
        break;
    }
  }
  /**
   * motion3.jsonをパースする。
   *
   * @param motionJson  motion3.jsonが読み込まれているバッファ
   * @param size        バッファのサイズ
   * @param shouldCheckMotionConsistency motion3.json整合性チェックするかどうか
   */
  parse(motionJson, size, shouldCheckMotionConsistency = false) {
    let json = new CubismMotionJson(motionJson, size);
    if (!json) {
      json.release();
      json = void 0;
      return;
    }
    if (shouldCheckMotionConsistency) {
      const consistency = json.hasConsistency();
      if (!consistency) {
        json.release();
        CubismLogError("Inconsistent motion3.json.");
        return;
      }
    }
    this._motionData = new CubismMotionData();
    this._motionData.duration = json.getMotionDuration();
    this._motionData.loop = json.isMotionLoop();
    this._motionData.curveCount = json.getMotionCurveCount();
    this._motionData.fps = json.getMotionFps();
    this._motionData.eventCount = json.getEventCount();
    const areBeziersRestructed = json.getEvaluationOptionFlag(
      EvaluationOptionFlag.EvaluationOptionFlag_AreBeziersRistricted
    );
    if (json.isExistMotionFadeInTime()) {
      this._fadeInSeconds = json.getMotionFadeInTime() < 0 ? 1 : json.getMotionFadeInTime();
    } else {
      this._fadeInSeconds = 1;
    }
    if (json.isExistMotionFadeOutTime()) {
      this._fadeOutSeconds = json.getMotionFadeOutTime() < 0 ? 1 : json.getMotionFadeOutTime();
    } else {
      this._fadeOutSeconds = 1;
    }
    this._motionData.curves.updateSize(
      this._motionData.curveCount,
      CubismMotionCurve,
      true
    );
    this._motionData.segments.updateSize(
      json.getMotionTotalSegmentCount(),
      CubismMotionSegment,
      true
    );
    this._motionData.points.updateSize(
      json.getMotionTotalPointCount(),
      CubismMotionPoint,
      true
    );
    this._motionData.events.updateSize(
      this._motionData.eventCount,
      CubismMotionEvent,
      true
    );
    let totalPointCount = 0;
    let totalSegmentCount = 0;
    for (let curveCount = 0; curveCount < this._motionData.curveCount; ++curveCount) {
      if (json.getMotionCurveTarget(curveCount) == TargetNameModel) {
        this._motionData.curves.at(curveCount).type = CubismMotionCurveTarget.CubismMotionCurveTarget_Model;
      } else if (json.getMotionCurveTarget(curveCount) == TargetNameParameter) {
        this._motionData.curves.at(curveCount).type = CubismMotionCurveTarget.CubismMotionCurveTarget_Parameter;
      } else if (json.getMotionCurveTarget(curveCount) == TargetNamePartOpacity) {
        this._motionData.curves.at(curveCount).type = CubismMotionCurveTarget.CubismMotionCurveTarget_PartOpacity;
      } else {
        CubismLogWarning(
          'Warning : Unable to get segment type from Curve! The number of "CurveCount" may be incorrect!'
        );
      }
      this._motionData.curves.at(curveCount).id = json.getMotionCurveId(curveCount);
      this._motionData.curves.at(curveCount).baseSegmentIndex = totalSegmentCount;
      this._motionData.curves.at(curveCount).fadeInTime = json.isExistMotionCurveFadeInTime(curveCount) ? json.getMotionCurveFadeInTime(curveCount) : -1;
      this._motionData.curves.at(curveCount).fadeOutTime = json.isExistMotionCurveFadeOutTime(curveCount) ? json.getMotionCurveFadeOutTime(curveCount) : -1;
      for (let segmentPosition = 0; segmentPosition < json.getMotionCurveSegmentCount(curveCount); ) {
        if (segmentPosition == 0) {
          this._motionData.segments.at(totalSegmentCount).basePointIndex = totalPointCount;
          this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition);
          this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
          totalPointCount += 1;
          segmentPosition += 2;
        } else {
          this._motionData.segments.at(totalSegmentCount).basePointIndex = totalPointCount - 1;
        }
        const segment = json.getMotionCurveSegment(
          curveCount,
          segmentPosition
        );
        const segmentType = segment;
        switch (segmentType) {
          case CubismMotionSegmentType.CubismMotionSegmentType_Linear: {
            this._motionData.segments.at(totalSegmentCount).segmentType = CubismMotionSegmentType.CubismMotionSegmentType_Linear;
            this._motionData.segments.at(totalSegmentCount).evaluate = linearEvaluate;
            this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 2);
            totalPointCount += 1;
            segmentPosition += 3;
            break;
          }
          case CubismMotionSegmentType.CubismMotionSegmentType_Bezier: {
            this._motionData.segments.at(totalSegmentCount).segmentType = CubismMotionSegmentType.CubismMotionSegmentType_Bezier;
            if (areBeziersRestructed || UseOldBeziersCurveMotion) {
              this._motionData.segments.at(totalSegmentCount).evaluate = bezierEvaluate;
            } else {
              this._motionData.segments.at(totalSegmentCount).evaluate = bezierEvaluateCardanoInterpretation;
            }
            this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 2);
            this._motionData.points.at(totalPointCount + 1).time = json.getMotionCurveSegment(curveCount, segmentPosition + 3);
            this._motionData.points.at(totalPointCount + 1).value = json.getMotionCurveSegment(curveCount, segmentPosition + 4);
            this._motionData.points.at(totalPointCount + 2).time = json.getMotionCurveSegment(curveCount, segmentPosition + 5);
            this._motionData.points.at(totalPointCount + 2).value = json.getMotionCurveSegment(curveCount, segmentPosition + 6);
            totalPointCount += 3;
            segmentPosition += 7;
            break;
          }
          case CubismMotionSegmentType.CubismMotionSegmentType_Stepped: {
            this._motionData.segments.at(totalSegmentCount).segmentType = CubismMotionSegmentType.CubismMotionSegmentType_Stepped;
            this._motionData.segments.at(totalSegmentCount).evaluate = steppedEvaluate;
            this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 2);
            totalPointCount += 1;
            segmentPosition += 3;
            break;
          }
          case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped: {
            this._motionData.segments.at(totalSegmentCount).segmentType = CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped;
            this._motionData.segments.at(totalSegmentCount).evaluate = inverseSteppedEvaluate;
            this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 2);
            totalPointCount += 1;
            segmentPosition += 3;
            break;
          }
          default: {
            CSM_ASSERT(0);
            break;
          }
        }
        ++this._motionData.curves.at(curveCount).segmentCount;
        ++totalSegmentCount;
      }
    }
    for (let userdatacount = 0; userdatacount < json.getEventCount(); ++userdatacount) {
      this._motionData.events.at(userdatacount).fireTime = json.getEventTime(userdatacount);
      this._motionData.events.at(userdatacount).value = json.getEventValue(userdatacount);
    }
    json.release();
    json = void 0;
    json = null;
  }
  /**
   * モデルのパラメータ更新
   *
   * イベント発火のチェック。
   * 入力する時間は呼ばれるモーションタイミングを０とした秒数で行う。
   *
   * @param beforeCheckTimeSeconds   前回のイベントチェック時間[秒]
   * @param motionTimeSeconds        今回の再生時間[秒]
   */
  getFiredEvent(beforeCheckTimeSeconds, motionTimeSeconds) {
    this._firedEventValues.updateSize(0);
    for (let u = 0; u < this._motionData.eventCount; ++u) {
      if (this._motionData.events.at(u).fireTime > beforeCheckTimeSeconds && this._motionData.events.at(u).fireTime <= motionTimeSeconds) {
        this._firedEventValues.pushBack(
          new csmString(this._motionData.events.at(u).value.s)
        );
      }
    }
    return this._firedEventValues;
  }
  /**
   * 透明度のカーブが存在するかどうかを確認する
   *
   * @returns true  -> キーが存在する
   *          false -> キーが存在しない
   */
  isExistModelOpacity() {
    for (let i = 0; i < this._motionData.curveCount; i++) {
      const curve = this._motionData.curves.at(i);
      if (curve.type != CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
        continue;
      }
      if (curve.id.getString().s.localeCompare(IdNameOpacity) == 0) {
        return true;
      }
    }
    return false;
  }
  /**
   * 透明度のカーブのインデックスを返す
   *
   * @returns success:透明度のカーブのインデックス
   */
  getModelOpacityIndex() {
    if (this.isExistModelOpacity()) {
      for (let i = 0; i < this._motionData.curveCount; i++) {
        const curve = this._motionData.curves.at(i);
        if (curve.type != CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
          continue;
        }
        if (curve.id.getString().s.localeCompare(IdNameOpacity) == 0) {
          return i;
        }
      }
    }
    return -1;
  }
  /**
   * 透明度のIdを返す
   *
   * @param index モーションカーブのインデックス
   * @returns success:透明度のカーブのインデックス
   */
  getModelOpacityId(index) {
    if (index != -1) {
      const curve = this._motionData.curves.at(index);
      if (curve.type == CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
        if (curve.id.getString().s.localeCompare(IdNameOpacity) == 0) {
          return CubismFramework.getIdManager().getId(curve.id.getString().s);
        }
      }
    }
    return null;
  }
  /**
   * 現在時間の透明度の値を返す
   *
   * @returns success:モーションの当該時間におけるOpacityの値
   */
  getModelOpacityValue() {
    return this._modelOpacity;
  }
  /**
   * デバッグ用フラグを設定する
   *
   * @param debugMode デバッグモードの有効・無効
   */
  setDebugMode(debugMode) {
    this._debugMode = debugMode;
  }
  // デバッグモードかどうか
}
var Live2DCubismFramework$d;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismMotion = CubismMotion;
})(Live2DCubismFramework$d || (Live2DCubismFramework$d = {}));
class Cubism5MotionManager extends MotionManager {
  constructor(settings, options) {
    var _a;
    super(settings, options);
    __publicField(this, "definitions");
    __publicField(this, "groups", { idle: "Idle" });
    __publicField(this, "motionDataType", "json");
    __publicField(this, "queueManager", new CubismMotionQueueManager());
    __publicField(this, "expressionManager");
    __publicField(this, "eyeBlinkIds");
    __publicField(this, "lipSyncIds");
    __publicField(this, "_seconds", 0);
    this.definitions = (_a = settings.motions) != null ? _a : {};
    this.eyeBlinkIds = settings.getEyeBlinkParameters() || [];
    this.lipSyncIds = settings.getLipSyncParameters() || [];
    this.init(options);
  }
  init(options) {
    super.init(options);
    if (this.settings.expressions) {
      this.expressionManager = new Cubism5ExpressionManager(this.settings, options);
    }
    this.queueManager.setEventCallback((caller, eventValue, customData) => {
      this.emit("motion:" + eventValue);
    });
  }
  isFinished() {
    return this.queueManager.isFinished();
  }
  update(model, now) {
    this._seconds = now;
    return super.update(model, now);
  }
  _startMotion(motion, onFinish) {
    motion.setFinishedMotionHandler(onFinish);
    return this.queueManager.startMotion(motion, false, this._seconds);
  }
  _stopAllMotions() {
    this.queueManager.stopAllMotions();
  }
  createMotion(data, group, definition) {
    let arrayBuffer;
    let byteLength;
    if (typeof data === "string") {
      const buffer = new TextEncoder().encode(data);
      arrayBuffer = buffer.buffer;
      byteLength = buffer.byteLength;
    } else {
      const jsonString = JSON.stringify(data);
      const buffer = new TextEncoder().encode(jsonString);
      arrayBuffer = buffer.buffer;
      byteLength = buffer.byteLength;
    }
    const motion = CubismMotion.create(arrayBuffer, byteLength);
    const json = new CubismMotionJson(arrayBuffer, byteLength);
    const isLoop = json.isMotionLoop();
    motion.setLoop(isLoop);
    const defaultFadingDuration = (group === this.groups.idle ? config.idleMotionFadingDuration : config.motionFadingDuration) / 1e3;
    if (json.getMotionFadeInTime() === void 0) {
      motion.setFadeInTime(
        definition.FadeInTime !== void 0 ? definition.FadeInTime : defaultFadingDuration
      );
    }
    if (json.getMotionFadeOutTime() === void 0) {
      motion.setFadeOutTime(
        definition.FadeOutTime !== void 0 ? definition.FadeOutTime : defaultFadingDuration
      );
    }
    if (isLoop && definition.FadeInTime === 0) {
      motion.setLoopFadeIn(false);
    }
    const emptyEyeBlinkVector = new csmVector();
    const emptyLipSyncVector = new csmVector();
    motion.setEffectIds(emptyEyeBlinkVector, emptyLipSyncVector);
    return motion;
  }
  getMotionFile(definition) {
    return definition.File;
  }
  getMotionName(definition) {
    return definition.File;
  }
  getSoundFile(definition) {
    return definition.Sound;
  }
  updateParameters(model, now) {
    return this.queueManager.doUpdateMotion(model, now);
  }
  destroy() {
    super.destroy();
    this.queueManager.release();
    this.queueManager = void 0;
  }
}
const CubismDefaultParameterId = Object.freeze({
  // パーツID
  HitAreaPrefix: "HitArea",
  HitAreaHead: "Head",
  HitAreaBody: "Body",
  PartsIdCore: "Parts01Core",
  PartsArmPrefix: "Parts01Arm_",
  PartsArmLPrefix: "Parts01ArmL_",
  PartsArmRPrefix: "Parts01ArmR_",
  // パラメータID
  ParamAngleX: "ParamAngleX",
  ParamAngleY: "ParamAngleY",
  ParamAngleZ: "ParamAngleZ",
  ParamEyeLOpen: "ParamEyeLOpen",
  ParamEyeLSmile: "ParamEyeLSmile",
  ParamEyeROpen: "ParamEyeROpen",
  ParamEyeRSmile: "ParamEyeRSmile",
  ParamEyeBallX: "ParamEyeBallX",
  ParamEyeBallY: "ParamEyeBallY",
  ParamEyeBallForm: "ParamEyeBallForm",
  ParamBrowLY: "ParamBrowLY",
  ParamBrowRY: "ParamBrowRY",
  ParamBrowLX: "ParamBrowLX",
  ParamBrowRX: "ParamBrowRX",
  ParamBrowLAngle: "ParamBrowLAngle",
  ParamBrowRAngle: "ParamBrowRAngle",
  ParamBrowLForm: "ParamBrowLForm",
  ParamBrowRForm: "ParamBrowRForm",
  ParamMouthForm: "ParamMouthForm",
  ParamMouthOpenY: "ParamMouthOpenY",
  ParamCheek: "ParamCheek",
  ParamBodyAngleX: "ParamBodyAngleX",
  ParamBodyAngleY: "ParamBodyAngleY",
  ParamBodyAngleZ: "ParamBodyAngleZ",
  ParamBreath: "ParamBreath",
  ParamArmLA: "ParamArmLA",
  ParamArmRA: "ParamArmRA",
  ParamArmLB: "ParamArmLB",
  ParamArmRB: "ParamArmRB",
  ParamHandL: "ParamHandL",
  ParamHandR: "ParamHandR",
  ParamHairFront: "ParamHairFront",
  ParamHairSide: "ParamHairSide",
  ParamHairBack: "ParamHairBack",
  ParamHairFluffy: "ParamHairFluffy",
  ParamShoulderY: "ParamShoulderY",
  ParamBustX: "ParamBustX",
  ParamBustY: "ParamBustY",
  ParamBaseX: "ParamBaseX",
  ParamBaseY: "ParamBaseY",
  ParamNONE: "NONE:"
});
var Live2DCubismFramework$c;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.HitAreaBody = CubismDefaultParameterId.HitAreaBody;
  Live2DCubismFramework2.HitAreaHead = CubismDefaultParameterId.HitAreaHead;
  Live2DCubismFramework2.HitAreaPrefix = CubismDefaultParameterId.HitAreaPrefix;
  Live2DCubismFramework2.ParamAngleX = CubismDefaultParameterId.ParamAngleX;
  Live2DCubismFramework2.ParamAngleY = CubismDefaultParameterId.ParamAngleY;
  Live2DCubismFramework2.ParamAngleZ = CubismDefaultParameterId.ParamAngleZ;
  Live2DCubismFramework2.ParamArmLA = CubismDefaultParameterId.ParamArmLA;
  Live2DCubismFramework2.ParamArmLB = CubismDefaultParameterId.ParamArmLB;
  Live2DCubismFramework2.ParamArmRA = CubismDefaultParameterId.ParamArmRA;
  Live2DCubismFramework2.ParamArmRB = CubismDefaultParameterId.ParamArmRB;
  Live2DCubismFramework2.ParamBaseX = CubismDefaultParameterId.ParamBaseX;
  Live2DCubismFramework2.ParamBaseY = CubismDefaultParameterId.ParamBaseY;
  Live2DCubismFramework2.ParamBodyAngleX = CubismDefaultParameterId.ParamBodyAngleX;
  Live2DCubismFramework2.ParamBodyAngleY = CubismDefaultParameterId.ParamBodyAngleY;
  Live2DCubismFramework2.ParamBodyAngleZ = CubismDefaultParameterId.ParamBodyAngleZ;
  Live2DCubismFramework2.ParamBreath = CubismDefaultParameterId.ParamBreath;
  Live2DCubismFramework2.ParamBrowLAngle = CubismDefaultParameterId.ParamBrowLAngle;
  Live2DCubismFramework2.ParamBrowLForm = CubismDefaultParameterId.ParamBrowLForm;
  Live2DCubismFramework2.ParamBrowLX = CubismDefaultParameterId.ParamBrowLX;
  Live2DCubismFramework2.ParamBrowLY = CubismDefaultParameterId.ParamBrowLY;
  Live2DCubismFramework2.ParamBrowRAngle = CubismDefaultParameterId.ParamBrowRAngle;
  Live2DCubismFramework2.ParamBrowRForm = CubismDefaultParameterId.ParamBrowRForm;
  Live2DCubismFramework2.ParamBrowRX = CubismDefaultParameterId.ParamBrowRX;
  Live2DCubismFramework2.ParamBrowRY = CubismDefaultParameterId.ParamBrowRY;
  Live2DCubismFramework2.ParamBustX = CubismDefaultParameterId.ParamBustX;
  Live2DCubismFramework2.ParamBustY = CubismDefaultParameterId.ParamBustY;
  Live2DCubismFramework2.ParamCheek = CubismDefaultParameterId.ParamCheek;
  Live2DCubismFramework2.ParamEyeBallForm = CubismDefaultParameterId.ParamEyeBallForm;
  Live2DCubismFramework2.ParamEyeBallX = CubismDefaultParameterId.ParamEyeBallX;
  Live2DCubismFramework2.ParamEyeBallY = CubismDefaultParameterId.ParamEyeBallY;
  Live2DCubismFramework2.ParamEyeLOpen = CubismDefaultParameterId.ParamEyeLOpen;
  Live2DCubismFramework2.ParamEyeLSmile = CubismDefaultParameterId.ParamEyeLSmile;
  Live2DCubismFramework2.ParamEyeROpen = CubismDefaultParameterId.ParamEyeROpen;
  Live2DCubismFramework2.ParamEyeRSmile = CubismDefaultParameterId.ParamEyeRSmile;
  Live2DCubismFramework2.ParamHairBack = CubismDefaultParameterId.ParamHairBack;
  Live2DCubismFramework2.ParamHairFluffy = CubismDefaultParameterId.ParamHairFluffy;
  Live2DCubismFramework2.ParamHairFront = CubismDefaultParameterId.ParamHairFront;
  Live2DCubismFramework2.ParamHairSide = CubismDefaultParameterId.ParamHairSide;
  Live2DCubismFramework2.ParamHandL = CubismDefaultParameterId.ParamHandL;
  Live2DCubismFramework2.ParamHandR = CubismDefaultParameterId.ParamHandR;
  Live2DCubismFramework2.ParamMouthForm = CubismDefaultParameterId.ParamMouthForm;
  Live2DCubismFramework2.ParamMouthOpenY = CubismDefaultParameterId.ParamMouthOpenY;
  Live2DCubismFramework2.ParamNONE = CubismDefaultParameterId.ParamNONE;
  Live2DCubismFramework2.ParamShoulderY = CubismDefaultParameterId.ParamShoulderY;
  Live2DCubismFramework2.PartsArmLPrefix = CubismDefaultParameterId.PartsArmLPrefix;
  Live2DCubismFramework2.PartsArmPrefix = CubismDefaultParameterId.PartsArmPrefix;
  Live2DCubismFramework2.PartsArmRPrefix = CubismDefaultParameterId.PartsArmRPrefix;
  Live2DCubismFramework2.PartsIdCore = CubismDefaultParameterId.PartsIdCore;
})(Live2DCubismFramework$c || (Live2DCubismFramework$c = {}));
class CubismBreath {
  /**
   * インスタンスの作成
   */
  static create() {
    return new CubismBreath();
  }
  /**
   * インスタンスの破棄
   * @param instance 対象のCubismBreath
   */
  static delete(instance) {
  }
  /**
   * 呼吸のパラメータの紐づけ
   * @param breathParameters 呼吸を紐づけたいパラメータのリスト
   */
  setParameters(breathParameters) {
    this._breathParameters = breathParameters;
  }
  /**
   * 呼吸に紐づいているパラメータの取得
   * @return 呼吸に紐づいているパラメータのリスト
   */
  getParameters() {
    return this._breathParameters;
  }
  /**
   * モデルのパラメータの更新
   * @param model 対象のモデル
   * @param deltaTimeSeconds デルタ時間[秒]
   */
  updateParameters(model, deltaTimeSeconds) {
    this._currentTime += deltaTimeSeconds;
    const t = this._currentTime * 2 * Math.PI;
    for (let i = 0; i < this._breathParameters.getSize(); ++i) {
      const data = this._breathParameters.at(i);
      model.addParameterValueById(
        data.parameterId,
        data.offset + data.peak * Math.sin(t / data.cycle),
        data.weight
      );
    }
  }
  /**
   * コンストラクタ
   */
  constructor() {
    this._currentTime = 0;
  }
  // 積算時間[秒]
}
class BreathParameterData {
  /**
   * コンストラクタ
   * @param parameterId   呼吸をひもづけるパラメータID
   * @param offset        呼吸を正弦波としたときの、波のオフセット
   * @param peak          呼吸を正弦波としたときの、波の高さ
   * @param cycle         呼吸を正弦波としたときの、波の周期
   * @param weight        パラメータへの重み
   */
  constructor(parameterId, offset, peak, cycle, weight) {
    this.parameterId = parameterId == void 0 ? null : parameterId;
    this.offset = offset == void 0 ? 0 : offset;
    this.peak = peak == void 0 ? 0 : peak;
    this.cycle = cycle == void 0 ? 0 : cycle;
    this.weight = weight == void 0 ? 0 : weight;
  }
  // パラメータへの重み
}
var Live2DCubismFramework$b;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.BreathParameterData = BreathParameterData;
  Live2DCubismFramework2.CubismBreath = CubismBreath;
})(Live2DCubismFramework$b || (Live2DCubismFramework$b = {}));
const _CubismEyeBlink = class _CubismEyeBlink {
  /**
   * インスタンスを作成する
   * @param modelSetting モデルの設定情報
   * @return 作成されたインスタンス
   * @note 引数がNULLの場合、パラメータIDが設定されていない空のインスタンスを作成する。
   */
  static create(modelSetting = null) {
    return new _CubismEyeBlink(modelSetting);
  }
  /**
   * インスタンスの破棄
   * @param eyeBlink 対象のCubismEyeBlink
   */
  static delete(eyeBlink) {
  }
  /**
   * まばたきの間隔の設定
   * @param blinkingInterval まばたきの間隔の時間[秒]
   */
  setBlinkingInterval(blinkingInterval) {
    this._blinkingIntervalSeconds = blinkingInterval;
  }
  /**
   * まばたきのモーションの詳細設定
   * @param closing   まぶたを閉じる動作の所要時間[秒]
   * @param closed    まぶたを閉じている動作の所要時間[秒]
   * @param opening   まぶたを開く動作の所要時間[秒]
   */
  setBlinkingSetting(closing, closed, opening) {
    this._closingSeconds = closing;
    this._closedSeconds = closed;
    this._openingSeconds = opening;
  }
  /**
   * まばたきさせるパラメータIDのリストの設定
   * @param parameterIds パラメータのIDのリスト
   */
  setParameterIds(parameterIds) {
    this._parameterIds = parameterIds;
  }
  /**
   * まばたきさせるパラメータIDのリストの取得
   * @return パラメータIDのリスト
   */
  getParameterIds() {
    return this._parameterIds;
  }
  /**
   * モデルのパラメータの更新
   * @param model 対象のモデル
   * @param deltaTimeSeconds デルタ時間[秒]
   */
  updateParameters(model, deltaTimeSeconds) {
    this._userTimeSeconds += deltaTimeSeconds;
    let parameterValue;
    let t = 0;
    const blinkingState = this._blinkingState;
    switch (blinkingState) {
      case 2:
        t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._closingSeconds;
        if (t >= 1) {
          t = 1;
          this._blinkingState = 3;
          this._stateStartTimeSeconds = this._userTimeSeconds;
        }
        parameterValue = 1 - t;
        break;
      case 3:
        t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._closedSeconds;
        if (t >= 1) {
          this._blinkingState = 4;
          this._stateStartTimeSeconds = this._userTimeSeconds;
        }
        parameterValue = 0;
        break;
      case 4:
        t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._openingSeconds;
        if (t >= 1) {
          t = 1;
          this._blinkingState = 1;
          this._nextBlinkingTime = this.determinNextBlinkingTiming();
        }
        parameterValue = t;
        break;
      case 1:
        if (this._nextBlinkingTime < this._userTimeSeconds) {
          this._blinkingState = 2;
          this._stateStartTimeSeconds = this._userTimeSeconds;
        }
        parameterValue = 1;
        break;
      case 0:
      default:
        this._blinkingState = 1;
        this._nextBlinkingTime = this.determinNextBlinkingTiming();
        parameterValue = 1;
        break;
    }
    if (!_CubismEyeBlink.CloseIfZero) {
      parameterValue = -parameterValue;
    }
    for (let i = 0; i < this._parameterIds.getSize(); ++i) {
      model.setParameterValueById(this._parameterIds.at(i), parameterValue);
    }
  }
  /**
   * コンストラクタ
   * @param modelSetting モデルの設定情報
   */
  constructor(modelSetting) {
    this._blinkingState = 0;
    this._nextBlinkingTime = 0;
    this._stateStartTimeSeconds = 0;
    this._blinkingIntervalSeconds = 4;
    this._closingSeconds = 0.1;
    this._closedSeconds = 0.05;
    this._openingSeconds = 0.15;
    this._userTimeSeconds = 0;
    this._parameterIds = new csmVector();
    if (modelSetting == null) {
      return;
    }
    for (let i = 0; i < modelSetting.getEyeBlinkParameterCount(); ++i) {
      this._parameterIds.pushBack(modelSetting.getEyeBlinkParameterId(i));
    }
  }
  /**
   * 次の瞬きのタイミングの決定
   *
   * @return 次のまばたきを行う時刻[秒]
   */
  determinNextBlinkingTiming() {
    const r = Math.random();
    return this._userTimeSeconds + r * (2 * this._blinkingIntervalSeconds - 1);
  }
};
_CubismEyeBlink.CloseIfZero = true;
let CubismEyeBlink = _CubismEyeBlink;
var EyeState = /* @__PURE__ */ ((EyeState2) => {
  EyeState2[EyeState2["EyeState_First"] = 0] = "EyeState_First";
  EyeState2[EyeState2["EyeState_Interval"] = 1] = "EyeState_Interval";
  EyeState2[EyeState2["EyeState_Closing"] = 2] = "EyeState_Closing";
  EyeState2[EyeState2["EyeState_Closed"] = 3] = "EyeState_Closed";
  EyeState2[EyeState2["EyeState_Opening"] = 4] = "EyeState_Opening";
  return EyeState2;
})(EyeState || {});
var Live2DCubismFramework$a;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismEyeBlink = CubismEyeBlink;
  Live2DCubismFramework2.EyeState = EyeState;
})(Live2DCubismFramework$a || (Live2DCubismFramework$a = {}));
const ColorChannelCount = 4;
const ClippingMaskMaxCountOnDefault = 36;
const ClippingMaskMaxCountOnMultiRenderTexture = 32;
class CubismClippingManager {
  /**
   * コンストラクタ
   */
  constructor(clippingContextFactory) {
    this._renderTextureCount = 0;
    this._clippingMaskBufferSize = 256;
    this._clippingContextListForMask = new csmVector();
    this._clippingContextListForDraw = new csmVector();
    this._channelColors = new csmVector();
    this._tmpBoundsOnModel = new csmRect();
    this._tmpMatrix = new CubismMatrix44();
    this._tmpMatrixForMask = new CubismMatrix44();
    this._tmpMatrixForDraw = new CubismMatrix44();
    this._clippingContexttConstructor = clippingContextFactory;
    let tmp = new CubismTextureColor();
    tmp.r = 1;
    tmp.g = 0;
    tmp.b = 0;
    tmp.a = 0;
    this._channelColors.pushBack(tmp);
    tmp = new CubismTextureColor();
    tmp.r = 0;
    tmp.g = 1;
    tmp.b = 0;
    tmp.a = 0;
    this._channelColors.pushBack(tmp);
    tmp = new CubismTextureColor();
    tmp.r = 0;
    tmp.g = 0;
    tmp.b = 1;
    tmp.a = 0;
    this._channelColors.pushBack(tmp);
    tmp = new CubismTextureColor();
    tmp.r = 0;
    tmp.g = 0;
    tmp.b = 0;
    tmp.a = 1;
    this._channelColors.pushBack(tmp);
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    for (let i = 0; i < this._clippingContextListForMask.getSize(); i++) {
      if (this._clippingContextListForMask.at(i)) {
        this._clippingContextListForMask.at(i).release();
        this._clippingContextListForMask.set(i, void 0);
      }
      this._clippingContextListForMask.set(i, null);
    }
    this._clippingContextListForMask = null;
    for (let i = 0; i < this._clippingContextListForDraw.getSize(); i++) {
      this._clippingContextListForDraw.set(i, null);
    }
    this._clippingContextListForDraw = null;
    for (let i = 0; i < this._channelColors.getSize(); i++) {
      this._channelColors.set(i, null);
    }
    this._channelColors = null;
    if (this._clearedFrameBufferFlags != null) {
      this._clearedFrameBufferFlags.clear();
    }
    this._clearedFrameBufferFlags = null;
  }
  /**
   * マネージャの初期化処理
   * クリッピングマスクを使う描画オブジェクトの登録を行う
   * @param model モデルのインスタンス
   * @param renderTextureCount バッファの生成数
   */
  initialize(model, renderTextureCount) {
    if (renderTextureCount % 1 != 0) {
      CubismLogWarning(
        "The number of render textures must be specified as an integer. The decimal point is rounded down and corrected to an integer."
      );
      renderTextureCount = ~~renderTextureCount;
    }
    if (renderTextureCount < 1) {
      CubismLogWarning(
        "The number of render textures must be an integer greater than or equal to 1. Set the number of render textures to 1."
      );
    }
    this._renderTextureCount = renderTextureCount < 1 ? 1 : renderTextureCount;
    this._clearedFrameBufferFlags = new csmVector(
      this._renderTextureCount
    );
    for (let i = 0; i < model.getDrawableCount(); i++) {
      if (model.getDrawableMaskCounts()[i] <= 0) {
        this._clippingContextListForDraw.pushBack(null);
        continue;
      }
      let clippingContext = this.findSameClip(
        model.getDrawableMasks()[i],
        model.getDrawableMaskCounts()[i]
      );
      if (clippingContext == null) {
        clippingContext = new this._clippingContexttConstructor(
          this,
          model.getDrawableMasks()[i],
          model.getDrawableMaskCounts()[i]
        );
        this._clippingContextListForMask.pushBack(clippingContext);
      }
      clippingContext.addClippedDrawable(i);
      this._clippingContextListForDraw.pushBack(clippingContext);
    }
  }
  /**
   * 既にマスクを作っているかを確認
   * 作っている様であれば該当するクリッピングマスクのインスタンスを返す
   * 作っていなければNULLを返す
   * @param drawableMasks 描画オブジェクトをマスクする描画オブジェクトのリスト
   * @param drawableMaskCounts 描画オブジェクトをマスクする描画オブジェクトの数
   * @return 該当するクリッピングマスクが存在すればインスタンスを返し、なければNULLを返す
   */
  findSameClip(drawableMasks, drawableMaskCounts) {
    for (let i = 0; i < this._clippingContextListForMask.getSize(); i++) {
      const clippingContext = this._clippingContextListForMask.at(i);
      const count = clippingContext._clippingIdCount;
      if (count != drawableMaskCounts) {
        continue;
      }
      let sameCount = 0;
      for (let j = 0; j < count; j++) {
        const clipId = clippingContext._clippingIdList[j];
        for (let k = 0; k < count; k++) {
          if (drawableMasks[k] == clipId) {
            sameCount++;
            break;
          }
        }
      }
      if (sameCount == count) {
        return clippingContext;
      }
    }
    return null;
  }
  /**
   * 高精細マスク処理用の行列を計算する
   * @param model モデルのインスタンス
   * @param isRightHanded 処理が右手系であるか
   */
  setupMatrixForHighPrecision(model, isRightHanded) {
    let usingClipCount = 0;
    for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.getSize(); clipIndex++) {
      const cc = this._clippingContextListForMask.at(clipIndex);
      this.calcClippedDrawTotalBounds(model, cc);
      if (cc._isUsing) {
        usingClipCount++;
      }
    }
    if (usingClipCount > 0) {
      this.setupLayoutBounds(0);
      if (this._clearedFrameBufferFlags.getSize() != this._renderTextureCount) {
        this._clearedFrameBufferFlags.clear();
        for (let i = 0; i < this._renderTextureCount; i++) {
          this._clearedFrameBufferFlags.pushBack(false);
        }
      } else {
        for (let i = 0; i < this._renderTextureCount; i++) {
          this._clearedFrameBufferFlags.set(i, false);
        }
      }
      for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.getSize(); clipIndex++) {
        const clipContext = this._clippingContextListForMask.at(clipIndex);
        const allClippedDrawRect = clipContext._allClippedDrawRect;
        const layoutBoundsOnTex01 = clipContext._layoutBounds;
        const margin = 0.05;
        let scaleX = 0;
        let scaleY = 0;
        const ppu = model.getPixelsPerUnit();
        const maskPixelSize = clipContext.getClippingManager().getClippingMaskBufferSize();
        const physicalMaskWidth = layoutBoundsOnTex01.width * maskPixelSize;
        const physicalMaskHeight = layoutBoundsOnTex01.height * maskPixelSize;
        this._tmpBoundsOnModel.setRect(allClippedDrawRect);
        if (this._tmpBoundsOnModel.width * ppu > physicalMaskWidth) {
          this._tmpBoundsOnModel.expand(allClippedDrawRect.width * margin, 0);
          scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
        } else {
          scaleX = ppu / physicalMaskWidth;
        }
        if (this._tmpBoundsOnModel.height * ppu > physicalMaskHeight) {
          this._tmpBoundsOnModel.expand(
            0,
            allClippedDrawRect.height * margin
          );
          scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
        } else {
          scaleY = ppu / physicalMaskHeight;
        }
        this.createMatrixForMask(
          isRightHanded,
          layoutBoundsOnTex01,
          scaleX,
          scaleY
        );
        clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
        clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
      }
    }
  }
  /**
   * マスク作成・描画用の行列を作成する。
   * @param isRightHanded 座標を右手系として扱うかを指定
   * @param layoutBoundsOnTex01 マスクを収める領域
   * @param scaleX 描画オブジェクトの伸縮率
   * @param scaleY 描画オブジェクトの伸縮率
   */
  createMatrixForMask(isRightHanded, layoutBoundsOnTex01, scaleX, scaleY) {
    this._tmpMatrix.loadIdentity();
    {
      this._tmpMatrix.translateRelative(-1, -1);
      this._tmpMatrix.scaleRelative(2, 2);
    }
    {
      this._tmpMatrix.translateRelative(
        layoutBoundsOnTex01.x,
        layoutBoundsOnTex01.y
      );
      this._tmpMatrix.scaleRelative(scaleX, scaleY);
      this._tmpMatrix.translateRelative(
        -this._tmpBoundsOnModel.x,
        -this._tmpBoundsOnModel.y
      );
    }
    this._tmpMatrixForMask.setMatrix(this._tmpMatrix.getArray());
    this._tmpMatrix.loadIdentity();
    {
      this._tmpMatrix.translateRelative(
        layoutBoundsOnTex01.x,
        layoutBoundsOnTex01.y * (isRightHanded ? -1 : 1)
      );
      this._tmpMatrix.scaleRelative(
        scaleX,
        scaleY * (isRightHanded ? -1 : 1)
      );
      this._tmpMatrix.translateRelative(
        -this._tmpBoundsOnModel.x,
        -this._tmpBoundsOnModel.y
      );
    }
    this._tmpMatrixForDraw.setMatrix(this._tmpMatrix.getArray());
  }
  /**
   * クリッピングコンテキストを配置するレイアウト
   * 指定された数のレンダーテクスチャを極力いっぱいに使ってマスクをレイアウトする
   * マスクグループの数が4以下ならRGBA各チャンネルに一つずつマスクを配置し、5以上6以下ならRGBAを2,2,1,1と配置する。
   *
   * @param usingClipCount 配置するクリッピングコンテキストの数
   */
  setupLayoutBounds(usingClipCount) {
    const useClippingMaskMaxCount = this._renderTextureCount <= 1 ? ClippingMaskMaxCountOnDefault : ClippingMaskMaxCountOnMultiRenderTexture * this._renderTextureCount;
    if (usingClipCount <= 0 || usingClipCount > useClippingMaskMaxCount) {
      if (usingClipCount > useClippingMaskMaxCount) {
        CubismLogError(
          "not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}",
          usingClipCount - useClippingMaskMaxCount,
          this._renderTextureCount,
          usingClipCount
        );
      }
      for (let index = 0; index < this._clippingContextListForMask.getSize(); index++) {
        const clipContext = this._clippingContextListForMask.at(index);
        clipContext._layoutChannelIndex = 0;
        clipContext._layoutBounds.x = 0;
        clipContext._layoutBounds.y = 0;
        clipContext._layoutBounds.width = 1;
        clipContext._layoutBounds.height = 1;
        clipContext._bufferIndex = 0;
      }
      return;
    }
    const layoutCountMaxValue = this._renderTextureCount <= 1 ? 9 : 8;
    let countPerSheetDiv = usingClipCount / this._renderTextureCount;
    const reduceLayoutTextureCount = usingClipCount % this._renderTextureCount;
    countPerSheetDiv = Math.ceil(countPerSheetDiv);
    let divCount = countPerSheetDiv / ColorChannelCount;
    const modCount = countPerSheetDiv % ColorChannelCount;
    divCount = ~~divCount;
    let curClipIndex = 0;
    for (let renderTextureIndex = 0; renderTextureIndex < this._renderTextureCount; renderTextureIndex++) {
      for (let channelIndex = 0; channelIndex < ColorChannelCount; channelIndex++) {
        let layoutCount = divCount + (channelIndex < modCount ? 1 : 0);
        const checkChannelIndex = modCount + (divCount < 1 ? -1 : 0);
        if (channelIndex == checkChannelIndex && reduceLayoutTextureCount > 0) {
          layoutCount -= !(renderTextureIndex < reduceLayoutTextureCount) ? 1 : 0;
        }
        if (layoutCount == 0) ;
        else if (layoutCount == 1) {
          const clipContext = this._clippingContextListForMask.at(curClipIndex++);
          clipContext._layoutChannelIndex = channelIndex;
          clipContext._layoutBounds.x = 0;
          clipContext._layoutBounds.y = 0;
          clipContext._layoutBounds.width = 1;
          clipContext._layoutBounds.height = 1;
          clipContext._bufferIndex = renderTextureIndex;
        } else if (layoutCount == 2) {
          for (let i = 0; i < layoutCount; i++) {
            let xpos = i % 2;
            xpos = ~~xpos;
            const cc = this._clippingContextListForMask.at(
              curClipIndex++
            );
            cc._layoutChannelIndex = channelIndex;
            cc._layoutBounds.x = xpos * 0.5;
            cc._layoutBounds.y = 0;
            cc._layoutBounds.width = 0.5;
            cc._layoutBounds.height = 1;
            cc._bufferIndex = renderTextureIndex;
          }
        } else if (layoutCount <= 4) {
          for (let i = 0; i < layoutCount; i++) {
            let xpos = i % 2;
            let ypos = i / 2;
            xpos = ~~xpos;
            ypos = ~~ypos;
            const cc = this._clippingContextListForMask.at(curClipIndex++);
            cc._layoutChannelIndex = channelIndex;
            cc._layoutBounds.x = xpos * 0.5;
            cc._layoutBounds.y = ypos * 0.5;
            cc._layoutBounds.width = 0.5;
            cc._layoutBounds.height = 0.5;
            cc._bufferIndex = renderTextureIndex;
          }
        } else if (layoutCount <= layoutCountMaxValue) {
          for (let i = 0; i < layoutCount; i++) {
            let xpos = i % 3;
            let ypos = i / 3;
            xpos = ~~xpos;
            ypos = ~~ypos;
            const cc = this._clippingContextListForMask.at(
              curClipIndex++
            );
            cc._layoutChannelIndex = channelIndex;
            cc._layoutBounds.x = xpos / 3;
            cc._layoutBounds.y = ypos / 3;
            cc._layoutBounds.width = 1 / 3;
            cc._layoutBounds.height = 1 / 3;
            cc._bufferIndex = renderTextureIndex;
          }
        } else {
          CubismLogError(
            "not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}",
            usingClipCount - useClippingMaskMaxCount,
            this._renderTextureCount,
            usingClipCount
          );
          for (let index = 0; index < layoutCount; index++) {
            const cc = this._clippingContextListForMask.at(
              curClipIndex++
            );
            cc._layoutChannelIndex = 0;
            cc._layoutBounds.x = 0;
            cc._layoutBounds.y = 0;
            cc._layoutBounds.width = 1;
            cc._layoutBounds.height = 1;
            cc._bufferIndex = 0;
          }
        }
      }
    }
  }
  /**
   * マスクされる描画オブジェクト群全体を囲む矩形（モデル座標系）を計算する
   * @param model モデルのインスタンス
   * @param clippingContext クリッピングマスクのコンテキスト
   */
  calcClippedDrawTotalBounds(model, clippingContext) {
    let clippedDrawTotalMinX = Number.MAX_VALUE;
    let clippedDrawTotalMinY = Number.MAX_VALUE;
    let clippedDrawTotalMaxX = Number.MIN_VALUE;
    let clippedDrawTotalMaxY = Number.MIN_VALUE;
    const clippedDrawCount = clippingContext._clippedDrawableIndexList.length;
    for (let clippedDrawableIndex = 0; clippedDrawableIndex < clippedDrawCount; clippedDrawableIndex++) {
      const drawableIndex = clippingContext._clippedDrawableIndexList[clippedDrawableIndex];
      const drawableVertexCount = model.getDrawableVertexCount(drawableIndex);
      const drawableVertexes = model.getDrawableVertices(drawableIndex);
      let minX = Number.MAX_VALUE;
      let minY = Number.MAX_VALUE;
      let maxX = -Number.MAX_VALUE;
      let maxY = -Number.MAX_VALUE;
      const loop = drawableVertexCount * Constant.vertexStep;
      for (let pi = Constant.vertexOffset; pi < loop; pi += Constant.vertexStep) {
        const x = drawableVertexes[pi];
        const y = drawableVertexes[pi + 1];
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
      if (minX == Number.MAX_VALUE) {
        continue;
      }
      if (minX < clippedDrawTotalMinX) {
        clippedDrawTotalMinX = minX;
      }
      if (minY < clippedDrawTotalMinY) {
        clippedDrawTotalMinY = minY;
      }
      if (maxX > clippedDrawTotalMaxX) {
        clippedDrawTotalMaxX = maxX;
      }
      if (maxY > clippedDrawTotalMaxY) {
        clippedDrawTotalMaxY = maxY;
      }
      if (clippedDrawTotalMinX == Number.MAX_VALUE) {
        clippingContext._allClippedDrawRect.x = 0;
        clippingContext._allClippedDrawRect.y = 0;
        clippingContext._allClippedDrawRect.width = 0;
        clippingContext._allClippedDrawRect.height = 0;
        clippingContext._isUsing = false;
      } else {
        clippingContext._isUsing = true;
        const w = clippedDrawTotalMaxX - clippedDrawTotalMinX;
        const h = clippedDrawTotalMaxY - clippedDrawTotalMinY;
        clippingContext._allClippedDrawRect.x = clippedDrawTotalMinX;
        clippingContext._allClippedDrawRect.y = clippedDrawTotalMinY;
        clippingContext._allClippedDrawRect.width = w;
        clippingContext._allClippedDrawRect.height = h;
      }
    }
  }
  /**
   * 画面描画に使用するクリッピングマスクのリストを取得する
   * @return 画面描画に使用するクリッピングマスクのリスト
   */
  getClippingContextListForDraw() {
    return this._clippingContextListForDraw;
  }
  /**
   * クリッピングマスクバッファのサイズを取得する
   * @return クリッピングマスクバッファのサイズ
   */
  getClippingMaskBufferSize() {
    return this._clippingMaskBufferSize;
  }
  /**
   * このバッファのレンダーテクスチャの枚数を取得する
   * @return このバッファのレンダーテクスチャの枚数
   */
  getRenderTextureCount() {
    return this._renderTextureCount;
  }
  /**
   * カラーチャンネル（RGBA）のフラグを取得する
   * @param channelNo カラーチャンネル（RGBA）の番号（0:R, 1:G, 2:B, 3:A）
   */
  getChannelFlagAsColor(channelNo) {
    return this._channelColors.at(channelNo);
  }
  /**
   * クリッピングマスクバッファのサイズを設定する
   * @param size クリッピングマスクバッファのサイズ
   */
  setClippingMaskBufferSize(size) {
    this._clippingMaskBufferSize = size;
  }
}
let s_instance;
const ShaderCount = 10;
class CubismShader_WebGL {
  /**
   * コンストラクタ
   */
  constructor() {
    this._shaderSets = new csmVector();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this.releaseShaderProgram();
  }
  /**
   * 描画用のシェーダプログラムの一連のセットアップを実行する
   * @param renderer レンダラー
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  setupShaderProgramForDraw(renderer, model, index) {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError("NoPremultipliedAlpha is not allowed");
    }
    if (this._shaderSets.getSize() == 0) {
      this.generateShaders();
    }
    let srcColor;
    let dstColor;
    let srcAlpha;
    let dstAlpha;
    const masked = renderer.getClippingContextBufferForDraw() != null;
    const invertedMask = model.getDrawableInvertedMaskBit(index);
    const offset = masked ? invertedMask ? 2 : 1 : 0;
    let shaderSet;
    switch (model.getDrawableBlendMode(index)) {
      case CubismBlendMode.CubismBlendMode_Normal:
      default:
        shaderSet = this._shaderSets.at(
          1 + offset
        );
        srcColor = this.gl.ONE;
        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
        srcAlpha = this.gl.ONE;
        dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
        break;
      case CubismBlendMode.CubismBlendMode_Additive:
        shaderSet = this._shaderSets.at(
          4 + offset
        );
        srcColor = this.gl.ONE;
        dstColor = this.gl.ONE;
        srcAlpha = this.gl.ZERO;
        dstAlpha = this.gl.ONE;
        break;
      case CubismBlendMode.CubismBlendMode_Multiplicative:
        shaderSet = this._shaderSets.at(
          7 + offset
        );
        srcColor = this.gl.DST_COLOR;
        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
        srcAlpha = this.gl.ZERO;
        dstAlpha = this.gl.ONE;
        break;
    }
    this.gl.useProgram(shaderSet.shaderProgram);
    if (renderer._bufferData.vertex == null) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    const vertexArray = model.getDrawableVertices(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const uvArray = model.getDrawableVertexUvs(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    if (masked) {
      this.gl.activeTexture(this.gl.TEXTURE1);
      const tex = renderer.getClippingContextBufferForDraw().getClippingManager().getColorBuffer().at(renderer.getClippingContextBufferForDraw()._bufferIndex);
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);
      this.gl.uniformMatrix4fv(
        shaderSet.uniformClipMatrixLocation,
        false,
        renderer.getClippingContextBufferForDraw()._matrixForDraw.getArray()
      );
      const channelIndex = renderer.getClippingContextBufferForDraw()._layoutChannelIndex;
      const colorChannel = renderer.getClippingContextBufferForDraw().getClippingManager().getChannelFlagAsColor(channelIndex);
      this.gl.uniform4f(
        shaderSet.uniformChannelFlagLocation,
        colorChannel.r,
        colorChannel.g,
        colorChannel.b,
        colorChannel.a
      );
    }
    const textureNo = model.getDrawableTextureIndex(index);
    const textureId = renderer.getBindedTextures().getValue(textureNo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
    const matrix4x4 = renderer.getMvpMatrix();
    this.gl.uniformMatrix4fv(
      shaderSet.uniformMatrixLocation,
      false,
      matrix4x4.getArray()
    );
    const baseColor = renderer.getModelColorWithOpacity(
      model.getDrawableOpacity(index)
    );
    const multiplyColor = model.getMultiplyColor(index);
    const screenColor = model.getScreenColor(index);
    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.a
    );
    this.gl.uniform4f(
      shaderSet.uniformMultiplyColorLocation,
      multiplyColor.r,
      multiplyColor.g,
      multiplyColor.b,
      multiplyColor.a
    );
    this.gl.uniform4f(
      shaderSet.uniformScreenColorLocation,
      screenColor.r,
      screenColor.g,
      screenColor.b,
      screenColor.a
    );
    if (renderer._bufferData.index == null) {
      renderer._bufferData.index = this.gl.createBuffer();
    }
    const indexArray = model.getDrawableVertexIndices(index);
    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      renderer._bufferData.index
    );
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      indexArray,
      this.gl.DYNAMIC_DRAW
    );
    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }
  /**
   * マスク用のシェーダプログラムの一連のセットアップを実行する
   * @param renderer レンダラー
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  setupShaderProgramForMask(renderer, model, index) {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError("NoPremultipliedAlpha is not allowed");
    }
    if (this._shaderSets.getSize() == 0) {
      this.generateShaders();
    }
    const shaderSet = this._shaderSets.at(
      0
      /* ShaderNames_SetupMask */
    );
    this.gl.useProgram(shaderSet.shaderProgram);
    if (renderer._bufferData.vertex == null) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    const vertexArray = model.getDrawableVertices(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const textureNo = model.getDrawableTextureIndex(index);
    const textureId = renderer.getBindedTextures().getValue(textureNo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const uvArray = model.getDrawableVertexUvs(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );
    renderer.getClippingContextBufferForMask();
    const channelIndex = renderer.getClippingContextBufferForMask()._layoutChannelIndex;
    const colorChannel = renderer.getClippingContextBufferForMask().getClippingManager().getChannelFlagAsColor(channelIndex);
    this.gl.uniform4f(
      shaderSet.uniformChannelFlagLocation,
      colorChannel.r,
      colorChannel.g,
      colorChannel.b,
      colorChannel.a
    );
    this.gl.uniformMatrix4fv(
      shaderSet.uniformClipMatrixLocation,
      false,
      renderer.getClippingContextBufferForMask()._matrixForMask.getArray()
    );
    const rect = renderer.getClippingContextBufferForMask()._layoutBounds;
    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      rect.x * 2 - 1,
      rect.y * 2 - 1,
      rect.getRight() * 2 - 1,
      rect.getBottom() * 2 - 1
    );
    const multiplyColor = model.getMultiplyColor(index);
    const screenColor = model.getScreenColor(index);
    this.gl.uniform4f(
      shaderSet.uniformMultiplyColorLocation,
      multiplyColor.r,
      multiplyColor.g,
      multiplyColor.b,
      multiplyColor.a
    );
    this.gl.uniform4f(
      shaderSet.uniformScreenColorLocation,
      screenColor.r,
      screenColor.g,
      screenColor.b,
      screenColor.a
    );
    const srcColor = this.gl.ZERO;
    const dstColor = this.gl.ONE_MINUS_SRC_COLOR;
    const srcAlpha = this.gl.ZERO;
    const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
    if (renderer._bufferData.index == null) {
      renderer._bufferData.index = this.gl.createBuffer();
    }
    const indexArray = model.getDrawableVertexIndices(index);
    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      renderer._bufferData.index
    );
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      indexArray,
      this.gl.DYNAMIC_DRAW
    );
    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }
  /**
   * シェーダープログラムを解放する
   */
  releaseShaderProgram() {
    for (let i = 0; i < this._shaderSets.getSize(); i++) {
      this.gl.deleteProgram(this._shaderSets.at(i).shaderProgram);
      this._shaderSets.at(i).shaderProgram = 0;
      this._shaderSets.set(i, void 0);
      this._shaderSets.set(i, null);
    }
  }
  /**
   * シェーダープログラムを初期化する
   * @param vertShaderSrc 頂点シェーダのソース
   * @param fragShaderSrc フラグメントシェーダのソース
   */
  generateShaders() {
    for (let i = 0; i < ShaderCount; i++) {
      this._shaderSets.pushBack(new CubismShaderSet());
    }
    this._shaderSets.at(0).shaderProgram = this.loadShaderProgram(
      vertexShaderSrcSetupMask,
      fragmentShaderSrcsetupMask
    );
    this._shaderSets.at(1).shaderProgram = this.loadShaderProgram(
      vertexShaderSrc,
      fragmentShaderSrcPremultipliedAlpha
    );
    this._shaderSets.at(2).shaderProgram = this.loadShaderProgram(
      vertexShaderSrcMasked,
      fragmentShaderSrcMaskPremultipliedAlpha
    );
    this._shaderSets.at(3).shaderProgram = this.loadShaderProgram(
      vertexShaderSrcMasked,
      fragmentShaderSrcMaskInvertedPremultipliedAlpha
    );
    this._shaderSets.at(4).shaderProgram = this._shaderSets.at(1).shaderProgram;
    this._shaderSets.at(5).shaderProgram = this._shaderSets.at(2).shaderProgram;
    this._shaderSets.at(6).shaderProgram = this._shaderSets.at(3).shaderProgram;
    this._shaderSets.at(7).shaderProgram = this._shaderSets.at(1).shaderProgram;
    this._shaderSets.at(8).shaderProgram = this._shaderSets.at(2).shaderProgram;
    this._shaderSets.at(9).shaderProgram = this._shaderSets.at(3).shaderProgram;
    this._shaderSets.at(0).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(0).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(0).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(0).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(0).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(0).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(0).uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(0).shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets.at(0).uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets.at(0).shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets.at(0).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(0).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(0).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(0).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(0).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(0).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(1).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(1).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(1).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(1).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(1).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(1).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(1).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(1).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(1).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(1).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(1).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(1).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(1).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(1).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(2).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(2).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(2).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(2).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(2).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(2).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      "s_texture1"
    );
    this._shaderSets.at(2).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(2).uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets.at(2).uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets.at(2).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(2).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(2).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(2).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(3).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(3).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(3).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(3).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(3).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(3).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      "s_texture1"
    );
    this._shaderSets.at(3).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(3).uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets.at(3).uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets.at(3).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(3).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(3).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(3).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(4).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(4).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(4).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(4).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(4).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(4).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(4).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(4).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(4).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(4).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(4).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(4).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(4).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(4).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(5).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(5).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(5).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(5).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(5).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(5).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      "s_texture1"
    );
    this._shaderSets.at(5).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(5).uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets.at(5).uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets.at(5).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(5).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(5).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(5).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(6).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(6).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(6).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(6).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(6).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(6).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      "s_texture1"
    );
    this._shaderSets.at(6).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(6).uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets.at(6).uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets.at(6).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(6).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(6).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(6).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(7).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(7).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(7).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(7).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(7).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(7).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(7).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(7).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(7).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(7).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(7).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(7).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(7).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(7).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(8).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(8).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(8).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(8).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(8).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(8).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      "s_texture1"
    );
    this._shaderSets.at(8).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(8).uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets.at(8).uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets.at(8).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(8).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(8).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(8).shaderProgram,
      "u_screenColor"
    );
    this._shaderSets.at(9).attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets.at(9).shaderProgram,
      "a_position"
    );
    this._shaderSets.at(9).attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets.at(9).shaderProgram,
      "a_texCoord"
    );
    this._shaderSets.at(9).samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      "s_texture0"
    );
    this._shaderSets.at(9).samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      "s_texture1"
    );
    this._shaderSets.at(9).uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      "u_matrix"
    );
    this._shaderSets.at(9).uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      "u_clipMatrix"
    );
    this._shaderSets.at(9).uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      "u_channelFlag"
    );
    this._shaderSets.at(9).uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      "u_baseColor"
    );
    this._shaderSets.at(9).uniformMultiplyColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      "u_multiplyColor"
    );
    this._shaderSets.at(9).uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets.at(9).shaderProgram,
      "u_screenColor"
    );
  }
  /**
   * シェーダプログラムをロードしてアドレスを返す
   * @param vertexShaderSource    頂点シェーダのソース
   * @param fragmentShaderSource  フラグメントシェーダのソース
   * @return シェーダプログラムのアドレス
   */
  loadShaderProgram(vertexShaderSource, fragmentShaderSource) {
    let shaderProgram = this.gl.createProgram();
    let vertShader = this.compileShaderSource(
      this.gl.VERTEX_SHADER,
      vertexShaderSource
    );
    if (!vertShader) {
      CubismLogError("Vertex shader compile error!");
      return 0;
    }
    let fragShader = this.compileShaderSource(
      this.gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    if (!fragShader) {
      CubismLogError("Vertex shader compile error!");
      return 0;
    }
    this.gl.attachShader(shaderProgram, vertShader);
    this.gl.attachShader(shaderProgram, fragShader);
    this.gl.linkProgram(shaderProgram);
    const linkStatus = this.gl.getProgramParameter(
      shaderProgram,
      this.gl.LINK_STATUS
    );
    if (!linkStatus) {
      CubismLogError("Failed to link program: {0}", shaderProgram);
      this.gl.deleteShader(vertShader);
      vertShader = 0;
      this.gl.deleteShader(fragShader);
      fragShader = 0;
      if (shaderProgram) {
        this.gl.deleteProgram(shaderProgram);
        shaderProgram = 0;
      }
      return 0;
    }
    this.gl.deleteShader(vertShader);
    this.gl.deleteShader(fragShader);
    return shaderProgram;
  }
  /**
   * シェーダープログラムをコンパイルする
   * @param shaderType シェーダタイプ(Vertex/Fragment)
   * @param shaderSource シェーダソースコード
   *
   * @return コンパイルされたシェーダープログラム
   */
  compileShaderSource(shaderType, shaderSource) {
    const source = shaderSource;
    const shader = this.gl.createShader(shaderType);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!shader) {
      const log = this.gl.getShaderInfoLog(shader);
      CubismLogError("Shader compile log: {0} ", log);
    }
    const status = this.gl.getShaderParameter(
      shader,
      this.gl.COMPILE_STATUS
    );
    if (!status) {
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  setGl(gl) {
    this.gl = gl;
  }
  // webglコンテキスト
}
class CubismShaderManager_WebGL {
  /**
   * インスタンスを取得する（シングルトン）
   * @return インスタンス
   */
  static getInstance() {
    if (s_instance == null) {
      s_instance = new CubismShaderManager_WebGL();
    }
    return s_instance;
  }
  /**
   * インスタンスを開放する（シングルトン）
   */
  static deleteInstance() {
    if (s_instance) {
      s_instance.release();
      s_instance = null;
    }
  }
  /**
   * Privateなコンストラクタ
   */
  constructor() {
    this._shaderMap = new csmMap();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    for (const ite = this._shaderMap.begin(); ite.notEqual(this._shaderMap.end()); ite.preIncrement()) {
      ite.ptr().second.release();
    }
    this._shaderMap.clear();
  }
  /**
   * GLContextをキーにShaderを取得する
   * @param gl
   * @returns
   */
  getShader(gl) {
    return this._shaderMap.getValue(gl);
  }
  /**
   * GLContextを登録する
   * @param gl
   */
  setGlContext(gl) {
    if (!this._shaderMap.isExist(gl)) {
      const instance = new CubismShader_WebGL();
      instance.setGl(gl);
      this._shaderMap.setValue(gl, instance);
    }
  }
}
class CubismShaderSet {
  // シェーダープログラムに渡す変数のアドレス（ScreenColor）
}
var ShaderNames = /* @__PURE__ */ ((ShaderNames2) => {
  ShaderNames2[ShaderNames2["ShaderNames_SetupMask"] = 0] = "ShaderNames_SetupMask";
  ShaderNames2[ShaderNames2["ShaderNames_NormalPremultipliedAlpha"] = 1] = "ShaderNames_NormalPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_NormalMaskedPremultipliedAlpha"] = 2] = "ShaderNames_NormalMaskedPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_NomralMaskedInvertedPremultipliedAlpha"] = 3] = "ShaderNames_NomralMaskedInvertedPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_AddPremultipliedAlpha"] = 4] = "ShaderNames_AddPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_AddMaskedPremultipliedAlpha"] = 5] = "ShaderNames_AddMaskedPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_AddMaskedPremultipliedAlphaInverted"] = 6] = "ShaderNames_AddMaskedPremultipliedAlphaInverted";
  ShaderNames2[ShaderNames2["ShaderNames_MultPremultipliedAlpha"] = 7] = "ShaderNames_MultPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_MultMaskedPremultipliedAlpha"] = 8] = "ShaderNames_MultMaskedPremultipliedAlpha";
  ShaderNames2[ShaderNames2["ShaderNames_MultMaskedPremultipliedAlphaInverted"] = 9] = "ShaderNames_MultMaskedPremultipliedAlphaInverted";
  return ShaderNames2;
})(ShaderNames || {});
const vertexShaderSrcSetupMask = "attribute vec4     a_position;attribute vec2     a_texCoord;varying vec2       v_texCoord;varying vec4       v_myPos;uniform mat4       u_clipMatrix;void main(){   gl_Position = u_clipMatrix * a_position;   v_myPos = u_clipMatrix * a_position;   v_texCoord = a_texCoord;   v_texCoord.y = 1.0 - v_texCoord.y;}";
const fragmentShaderSrcsetupMask = "precision mediump float;varying vec2       v_texCoord;varying vec4       v_myPos;uniform vec4       u_baseColor;uniform vec4       u_channelFlag;uniform sampler2D  s_texture0;void main(){   float isInside =        step(u_baseColor.x, v_myPos.x/v_myPos.w)       * step(u_baseColor.y, v_myPos.y/v_myPos.w)       * step(v_myPos.x/v_myPos.w, u_baseColor.z)       * step(v_myPos.y/v_myPos.w, u_baseColor.w);   gl_FragColor = u_channelFlag * texture2D(s_texture0, v_texCoord).a * isInside;}";
const vertexShaderSrc = "attribute vec4     a_position;attribute vec2     a_texCoord;varying vec2       v_texCoord;uniform mat4       u_matrix;void main(){   gl_Position = u_matrix * a_position;   v_texCoord = a_texCoord;   v_texCoord.y = 1.0 - v_texCoord.y;}";
const vertexShaderSrcMasked = "attribute vec4     a_position;attribute vec2     a_texCoord;varying vec2       v_texCoord;varying vec4       v_clipPos;uniform mat4       u_matrix;uniform mat4       u_clipMatrix;void main(){   gl_Position = u_matrix * a_position;   v_clipPos = u_clipMatrix * a_position;   v_texCoord = a_texCoord;   v_texCoord.y = 1.0 - v_texCoord.y;}";
const fragmentShaderSrcPremultipliedAlpha = "precision mediump float;varying vec2       v_texCoord;uniform vec4       u_baseColor;uniform sampler2D  s_texture0;uniform vec4       u_multiplyColor;uniform vec4       u_screenColor;void main(){   vec4 texColor = texture2D(s_texture0, v_texCoord);   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);   vec4 color = texColor * u_baseColor;   gl_FragColor = vec4(color.rgb, color.a);}";
const fragmentShaderSrcMaskPremultipliedAlpha = "precision mediump float;varying vec2       v_texCoord;varying vec4       v_clipPos;uniform vec4       u_baseColor;uniform vec4       u_channelFlag;uniform sampler2D  s_texture0;uniform sampler2D  s_texture1;uniform vec4       u_multiplyColor;uniform vec4       u_screenColor;void main(){   vec4 texColor = texture2D(s_texture0, v_texCoord);   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);   vec4 col_formask = texColor * u_baseColor;   vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;   float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;   col_formask = col_formask * maskVal;   gl_FragColor = col_formask;}";
const fragmentShaderSrcMaskInvertedPremultipliedAlpha = "precision mediump float;varying vec2      v_texCoord;varying vec4      v_clipPos;uniform sampler2D s_texture0;uniform sampler2D s_texture1;uniform vec4      u_channelFlag;uniform vec4      u_baseColor;uniform vec4      u_multiplyColor;uniform vec4      u_screenColor;void main(){   vec4 texColor = texture2D(s_texture0, v_texCoord);   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);   vec4 col_formask = texColor * u_baseColor;   vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;   float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;   col_formask = col_formask * (1.0 - maskVal);   gl_FragColor = col_formask;}";
var Live2DCubismFramework$9;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismShaderSet = CubismShaderSet;
  Live2DCubismFramework2.CubismShader_WebGL = CubismShader_WebGL;
  Live2DCubismFramework2.CubismShaderManager_WebGL = CubismShaderManager_WebGL;
  Live2DCubismFramework2.ShaderNames = ShaderNames;
})(Live2DCubismFramework$9 || (Live2DCubismFramework$9 = {}));
let s_viewport;
let s_fbo;
class CubismClippingManager_WebGL extends CubismClippingManager {
  /**
   * テンポラリのレンダーテクスチャのアドレスを取得する
   * FrameBufferObjectが存在しない場合、新しく生成する
   *
   * @return レンダーテクスチャの配列
   */
  getMaskRenderTexture() {
    if (this._maskTexture && this._maskTexture.textures != null) {
      this._maskTexture.frameNo = this._currentFrameNo;
    } else {
      if (this._maskRenderTextures != null) {
        this._maskRenderTextures.clear();
      }
      this._maskRenderTextures = new csmVector();
      if (this._maskColorBuffers != null) {
        this._maskColorBuffers.clear();
      }
      this._maskColorBuffers = new csmVector();
      const size = this._clippingMaskBufferSize;
      for (let index = 0; index < this._renderTextureCount; index++) {
        this._maskColorBuffers.pushBack(this.gl.createTexture());
        this.gl.bindTexture(
          this.gl.TEXTURE_2D,
          this._maskColorBuffers.at(index)
        );
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          size,
          size,
          0,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          null
        );
        this.gl.texParameteri(
          this.gl.TEXTURE_2D,
          this.gl.TEXTURE_WRAP_S,
          this.gl.CLAMP_TO_EDGE
        );
        this.gl.texParameteri(
          this.gl.TEXTURE_2D,
          this.gl.TEXTURE_WRAP_T,
          this.gl.CLAMP_TO_EDGE
        );
        this.gl.texParameteri(
          this.gl.TEXTURE_2D,
          this.gl.TEXTURE_MIN_FILTER,
          this.gl.LINEAR
        );
        this.gl.texParameteri(
          this.gl.TEXTURE_2D,
          this.gl.TEXTURE_MAG_FILTER,
          this.gl.LINEAR
        );
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this._maskRenderTextures.pushBack(this.gl.createFramebuffer());
        this.gl.bindFramebuffer(
          this.gl.FRAMEBUFFER,
          this._maskRenderTextures.at(index)
        );
        this.gl.framebufferTexture2D(
          this.gl.FRAMEBUFFER,
          this.gl.COLOR_ATTACHMENT0,
          this.gl.TEXTURE_2D,
          this._maskColorBuffers.at(index),
          0
        );
      }
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo);
      this._maskTexture = new CubismRenderTextureResource(
        this._currentFrameNo,
        this._maskRenderTextures
      );
    }
    return this._maskTexture.textures;
  }
  /**
   * WebGLレンダリングコンテキストを設定する
   * @param gl WebGLレンダリングコンテキスト
   */
  setGL(gl) {
    this.gl = gl;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    super(CubismClippingContext_WebGL);
  }
  /**
   * クリッピングコンテキストを作成する。モデル描画時に実行する。
   * @param model モデルのインスタンス
   * @param renderer レンダラのインスタンス
   */
  setupClippingContext(model, renderer) {
    this._currentFrameNo++;
    let usingClipCount = 0;
    for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.getSize(); clipIndex++) {
      const cc = this._clippingContextListForMask.at(clipIndex);
      this.calcClippedDrawTotalBounds(model, cc);
      if (cc._isUsing) {
        usingClipCount++;
      }
    }
    if (usingClipCount > 0) {
      this.gl.viewport(
        0,
        0,
        this._clippingMaskBufferSize,
        this._clippingMaskBufferSize
      );
      this._currentMaskRenderTexture = this.getMaskRenderTexture().at(0);
      renderer.preDraw();
      this.setupLayoutBounds(usingClipCount);
      this.gl.bindFramebuffer(
        this.gl.FRAMEBUFFER,
        this._currentMaskRenderTexture
      );
      if (this._clearedFrameBufferFlags.getSize() != this._renderTextureCount) {
        this._clearedFrameBufferFlags.clear();
        this._clearedFrameBufferFlags = new csmVector(
          this._renderTextureCount
        );
      }
      for (let index = 0; index < this._clearedFrameBufferFlags.getSize(); index++) {
        this._clearedFrameBufferFlags.set(index, false);
      }
      for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.getSize(); clipIndex++) {
        const clipContext = this._clippingContextListForMask.at(clipIndex);
        const allClipedDrawRect = clipContext._allClippedDrawRect;
        const layoutBoundsOnTex01 = clipContext._layoutBounds;
        const margin = 0.05;
        let scaleX = 0;
        let scaleY = 0;
        const clipContextRenderTexture = this.getMaskRenderTexture().at(
          clipContext._bufferIndex
        );
        if (this._currentMaskRenderTexture != clipContextRenderTexture) {
          this._currentMaskRenderTexture = clipContextRenderTexture;
          renderer.preDraw();
          this.gl.bindFramebuffer(
            this.gl.FRAMEBUFFER,
            this._currentMaskRenderTexture
          );
        }
        this._tmpBoundsOnModel.setRect(allClipedDrawRect);
        this._tmpBoundsOnModel.expand(
          allClipedDrawRect.width * margin,
          allClipedDrawRect.height * margin
        );
        scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
        scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
        {
          this._tmpMatrix.loadIdentity();
          {
            this._tmpMatrix.translateRelative(-1, -1);
            this._tmpMatrix.scaleRelative(2, 2);
          }
          {
            this._tmpMatrix.translateRelative(
              layoutBoundsOnTex01.x,
              layoutBoundsOnTex01.y
            );
            this._tmpMatrix.scaleRelative(scaleX, scaleY);
            this._tmpMatrix.translateRelative(
              -this._tmpBoundsOnModel.x,
              -this._tmpBoundsOnModel.y
            );
          }
          this._tmpMatrixForMask.setMatrix(this._tmpMatrix.getArray());
        }
        {
          this._tmpMatrix.loadIdentity();
          {
            this._tmpMatrix.translateRelative(
              layoutBoundsOnTex01.x,
              layoutBoundsOnTex01.y
            );
            this._tmpMatrix.scaleRelative(scaleX, scaleY);
            this._tmpMatrix.translateRelative(
              -this._tmpBoundsOnModel.x,
              -this._tmpBoundsOnModel.y
            );
          }
          this._tmpMatrixForDraw.setMatrix(this._tmpMatrix.getArray());
        }
        clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
        clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
        const clipDrawCount = clipContext._clippingIdCount;
        for (let i = 0; i < clipDrawCount; i++) {
          const clipDrawIndex = clipContext._clippingIdList[i];
          if (!model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
            continue;
          }
          renderer.setIsCulling(
            model.getDrawableCulling(clipDrawIndex) != false
          );
          if (!this._clearedFrameBufferFlags.at(clipContext._bufferIndex)) {
            this.gl.clearColor(1, 1, 1, 1);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            this._clearedFrameBufferFlags.set(clipContext._bufferIndex, true);
          }
          renderer.setClippingContextBufferForMask(clipContext);
          renderer.drawMeshWebGL(model, clipDrawIndex);
        }
      }
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo);
      renderer.setClippingContextBufferForMask(null);
      this.gl.viewport(
        s_viewport[0],
        s_viewport[1],
        s_viewport[2],
        s_viewport[3]
      );
    }
  }
  /**
   * カラーバッファを取得する
   * @return カラーバッファ
   */
  getColorBuffer() {
    return this._maskColorBuffers;
  }
  /**
   * マスクの合計数をカウント
   * @returns
   */
  getClippingMaskCount() {
    return this._clippingContextListForMask.getSize();
  }
  // WebGLレンダリングコンテキスト
}
class CubismRenderTextureResource {
  /**
   * 引数付きコンストラクタ
   * @param frameNo レンダラーのフレーム番号
   * @param texture テクスチャのアドレス
   */
  constructor(frameNo, texture) {
    this.frameNo = frameNo;
    this.textures = texture;
  }
  // テクスチャのアドレス
}
class CubismClippingContext_WebGL extends CubismClippingContext {
  /**
   * 引数付きコンストラクタ
   */
  constructor(manager, clippingDrawableIndices, clipCount) {
    super(clippingDrawableIndices, clipCount);
    this._owner = manager;
  }
  /**
   * このマスクを管理するマネージャのインスタンスを取得する
   * @return クリッピングマネージャのインスタンス
   */
  getClippingManager() {
    return this._owner;
  }
  setGl(gl) {
    this._owner.setGL(gl);
  }
  // このマスクを管理しているマネージャのインスタンス
}
class CubismRendererProfile_WebGL {
  setGlEnable(index, enabled) {
    if (enabled) this.gl.enable(index);
    else this.gl.disable(index);
  }
  setGlEnableVertexAttribArray(index, enabled) {
    if (enabled) this.gl.enableVertexAttribArray(index);
    else this.gl.disableVertexAttribArray(index);
  }
  save() {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }
    this._lastArrayBufferBinding = this.gl.getParameter(
      this.gl.ARRAY_BUFFER_BINDING
    );
    this._lastElementArrayBufferBinding = this.gl.getParameter(
      this.gl.ELEMENT_ARRAY_BUFFER_BINDING
    );
    this._lastProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
    this._lastActiveTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this._lastTexture1Binding2D = this.gl.getParameter(
      this.gl.TEXTURE_BINDING_2D
    );
    this.gl.activeTexture(this.gl.TEXTURE0);
    this._lastTexture0Binding2D = this.gl.getParameter(
      this.gl.TEXTURE_BINDING_2D
    );
    this._lastVertexAttribArrayEnabled[0] = this.gl.getVertexAttrib(
      0,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[1] = this.gl.getVertexAttrib(
      1,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[2] = this.gl.getVertexAttrib(
      2,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastVertexAttribArrayEnabled[3] = this.gl.getVertexAttrib(
      3,
      this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
    );
    this._lastScissorTest = this.gl.isEnabled(this.gl.SCISSOR_TEST);
    this._lastStencilTest = this.gl.isEnabled(this.gl.STENCIL_TEST);
    this._lastDepthTest = this.gl.isEnabled(this.gl.DEPTH_TEST);
    this._lastCullFace = this.gl.isEnabled(this.gl.CULL_FACE);
    this._lastBlend = this.gl.isEnabled(this.gl.BLEND);
    this._lastFrontFace = this.gl.getParameter(this.gl.FRONT_FACE);
    this._lastColorMask = this.gl.getParameter(this.gl.COLOR_WRITEMASK);
    this._lastBlending[0] = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
    this._lastBlending[1] = this.gl.getParameter(this.gl.BLEND_DST_RGB);
    this._lastBlending[2] = this.gl.getParameter(this.gl.BLEND_SRC_ALPHA);
    this._lastBlending[3] = this.gl.getParameter(this.gl.BLEND_DST_ALPHA);
    this._lastFBO = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING);
    this._lastViewport = this.gl.getParameter(this.gl.VIEWPORT);
  }
  restore() {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }
    this.gl.useProgram(this._lastProgram);
    this.setGlEnableVertexAttribArray(0, this._lastVertexAttribArrayEnabled[0]);
    this.setGlEnableVertexAttribArray(1, this._lastVertexAttribArrayEnabled[1]);
    this.setGlEnableVertexAttribArray(2, this._lastVertexAttribArrayEnabled[2]);
    this.setGlEnableVertexAttribArray(3, this._lastVertexAttribArrayEnabled[3]);
    this.setGlEnable(this.gl.SCISSOR_TEST, this._lastScissorTest);
    this.setGlEnable(this.gl.STENCIL_TEST, this._lastStencilTest);
    this.setGlEnable(this.gl.DEPTH_TEST, this._lastDepthTest);
    this.setGlEnable(this.gl.CULL_FACE, this._lastCullFace);
    this.setGlEnable(this.gl.BLEND, this._lastBlend);
    this.gl.frontFace(this._lastFrontFace);
    this.gl.colorMask(
      this._lastColorMask[0],
      this._lastColorMask[1],
      this._lastColorMask[2],
      this._lastColorMask[3]
    );
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this._lastArrayBufferBinding);
    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      this._lastElementArrayBufferBinding
    );
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture1Binding2D);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture0Binding2D);
    this.gl.activeTexture(this._lastActiveTexture);
    this.gl.blendFuncSeparate(
      this._lastBlending[0],
      this._lastBlending[1],
      this._lastBlending[2],
      this._lastBlending[3]
    );
  }
  setGl(gl) {
    this.gl = gl;
  }
  constructor() {
    this._lastVertexAttribArrayEnabled = new Array(4);
    this._lastColorMask = new Array(4);
    this._lastBlending = new Array(4);
    this._lastViewport = new Array(4);
  }
}
class CubismRenderer_WebGL extends CubismRenderer {
  /**
   * レンダラの初期化処理を実行する
   * 引数に渡したモデルからレンダラの初期化処理に必要な情報を取り出すことができる
   *
   * @param model モデルのインスタンス
   * @param maskBufferCount バッファの生成数
   */
  initialize(model, maskBufferCount = 1) {
    if (model.isUsingMasking()) {
      this._clippingManager = new CubismClippingManager_WebGL();
      this._clippingManager.initialize(model, maskBufferCount);
    }
    this._sortedDrawableIndexList.resize(model.getDrawableCount(), 0);
    super.initialize(model);
  }
  /**
   * WebGLテクスチャのバインド処理
   * CubismRendererにテクスチャを設定し、CubismRenderer内でその画像を参照するためのIndex値を戻り値とする
   * @param modelTextureNo セットするモデルテクスチャの番号
   * @param glTextureNo WebGLテクスチャの番号
   */
  bindTexture(modelTextureNo, glTexture) {
    this._textures.setValue(modelTextureNo, glTexture);
  }
  /**
   * WebGLにバインドされたテクスチャのリストを取得する
   * @return テクスチャのリスト
   */
  getBindedTextures() {
    return this._textures;
  }
  /**
   * クリッピングマスクバッファのサイズを設定する
   * マスク用のFrameBufferを破棄、再作成する為処理コストは高い
   * @param size クリッピングマスクバッファのサイズ
   */
  setClippingMaskBufferSize(size) {
    if (!this._model.isUsingMasking()) {
      return;
    }
    const renderTextureCount = this._clippingManager.getRenderTextureCount();
    this._clippingManager.release();
    this._clippingManager = void 0;
    this._clippingManager = null;
    this._clippingManager = new CubismClippingManager_WebGL();
    this._clippingManager.setClippingMaskBufferSize(size);
    this._clippingManager.initialize(
      this.getModel(),
      renderTextureCount
      // インスタンス破棄前に保存したレンダーテクスチャの数
    );
  }
  /**
   * クリッピングマスクバッファのサイズを取得する
   * @return クリッピングマスクバッファのサイズ
   */
  getClippingMaskBufferSize() {
    return this._model.isUsingMasking() ? this._clippingManager.getClippingMaskBufferSize() : -1;
  }
  /**
   * レンダーテクスチャの枚数を取得する
   * @return レンダーテクスチャの枚数
   */
  getRenderTextureCount() {
    return this._model.isUsingMasking() ? this._clippingManager.getRenderTextureCount() : -1;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    super();
    this._clippingContextBufferForMask = null;
    this._clippingContextBufferForDraw = null;
    this._rendererProfile = new CubismRendererProfile_WebGL();
    this.firstDraw = true;
    this._textures = new csmMap();
    this._sortedDrawableIndexList = new csmVector();
    this._bufferData = {
      vertex: WebGLBuffer = null,
      uv: WebGLBuffer = null,
      index: WebGLBuffer = null
    };
    this._textures.prepareCapacity(32, true);
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    if (this._clippingManager) {
      this._clippingManager.release();
      this._clippingManager = void 0;
      this._clippingManager = null;
    }
    if (this.gl == null) {
      return;
    }
    this.gl.deleteBuffer(this._bufferData.vertex);
    this._bufferData.vertex = null;
    this.gl.deleteBuffer(this._bufferData.uv);
    this._bufferData.uv = null;
    this.gl.deleteBuffer(this._bufferData.index);
    this._bufferData.index = null;
    this._bufferData = null;
    this._textures = null;
  }
  /**
   * モデルを描画する実際の処理
   */
  doDrawModel() {
    if (this.gl == null) {
      CubismLogError(
        "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
      );
      return;
    }
    if (this._clippingManager != null) {
      this.preDraw();
      if (this.isUsingHighPrecisionMask()) {
        this._clippingManager.setupMatrixForHighPrecision(
          this.getModel(),
          false
        );
      } else {
        this._clippingManager.setupClippingContext(this.getModel(), this);
      }
    }
    this.preDraw();
    const drawableCount = this.getModel().getDrawableCount();
    const renderOrder = this.getModel().getDrawableRenderOrders();
    for (let i = 0; i < drawableCount; ++i) {
      const order = renderOrder[i];
      this._sortedDrawableIndexList.set(order, i);
    }
    for (let i = 0; i < drawableCount; ++i) {
      const drawableIndex = this._sortedDrawableIndexList.at(i);
      if (!this.getModel().getDrawableDynamicFlagIsVisible(drawableIndex)) {
        continue;
      }
      const clipContext = this._clippingManager != null ? this._clippingManager.getClippingContextListForDraw().at(drawableIndex) : null;
      if (clipContext != null && this.isUsingHighPrecisionMask()) {
        if (clipContext._isUsing) {
          this.gl.viewport(
            0,
            0,
            this._clippingManager.getClippingMaskBufferSize(),
            this._clippingManager.getClippingMaskBufferSize()
          );
          this.preDraw();
          this.gl.bindFramebuffer(
            this.gl.FRAMEBUFFER,
            clipContext.getClippingManager().getMaskRenderTexture().at(clipContext._bufferIndex)
          );
          this.gl.clearColor(1, 1, 1, 1);
          this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }
        {
          const clipDrawCount = clipContext._clippingIdCount;
          for (let index = 0; index < clipDrawCount; index++) {
            const clipDrawIndex = clipContext._clippingIdList[index];
            if (!this._model.getDrawableDynamicFlagVertexPositionsDidChange(
              clipDrawIndex
            )) {
              continue;
            }
            this.setIsCulling(
              this._model.getDrawableCulling(clipDrawIndex) != false
            );
            this.setClippingContextBufferForMask(clipContext);
            this.drawMeshWebGL(this._model, clipDrawIndex);
          }
        }
        {
          this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo);
          this.setClippingContextBufferForMask(null);
          this.gl.viewport(
            s_viewport[0],
            s_viewport[1],
            s_viewport[2],
            s_viewport[3]
          );
          this.preDraw();
        }
      }
      this.setClippingContextBufferForDraw(clipContext);
      this.setIsCulling(this.getModel().getDrawableCulling(drawableIndex));
      this.drawMeshWebGL(this._model, drawableIndex);
    }
  }
  /**
   * 描画オブジェクト（アートメッシュ）を描画する。
   * @param model 描画対象のモデル
   * @param index 描画対象のメッシュのインデックス
   */
  drawMeshWebGL(model, index) {
    if (this.isCulling()) {
      this.gl.enable(this.gl.CULL_FACE);
    } else {
      this.gl.disable(this.gl.CULL_FACE);
    }
    this.gl.frontFace(this.gl.CCW);
    if (this.isGeneratingMask()) {
      CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForMask(this, model, index);
    } else {
      CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForDraw(this, model, index);
    }
    {
      const indexCount = model.getDrawableVertexIndexCount(index);
      this.gl.drawElements(
        this.gl.TRIANGLES,
        indexCount,
        this.gl.UNSIGNED_SHORT,
        0
      );
    }
    this.gl.useProgram(null);
    this.setClippingContextBufferForDraw(null);
    this.setClippingContextBufferForMask(null);
  }
  saveProfile() {
    this._rendererProfile.save();
  }
  restoreProfile() {
    this._rendererProfile.restore();
  }
  /**
   * レンダラが保持する静的なリソースを解放する
   * WebGLの静的なシェーダープログラムを解放する
   */
  static doStaticRelease() {
    CubismShaderManager_WebGL.deleteInstance();
  }
  /**
   * レンダーステートを設定する
   * @param fbo アプリケーション側で指定しているフレームバッファ
   * @param viewport ビューポート
   */
  setRenderState(fbo, viewport) {
    s_fbo = fbo;
    s_viewport = viewport;
  }
  /**
   * 描画開始時の追加処理
   * モデルを描画する前にクリッピングマスクに必要な処理を実装している
   */
  preDraw() {
    if (this.firstDraw) {
      this.firstDraw = false;
    }
    this.gl.disable(this.gl.SCISSOR_TEST);
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.frontFace(this.gl.CW);
    this.gl.enable(this.gl.BLEND);
    this.gl.colorMask(true, true, true, true);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
    if (this.getAnisotropy() > 0 && this._extension) {
      for (let i = 0; i < this._textures.getSize(); ++i) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this._textures.getValue(i));
        this.gl.texParameterf(
          this.gl.TEXTURE_2D,
          this._extension.TEXTURE_MAX_ANISOTROPY_EXT,
          this.getAnisotropy()
        );
      }
    }
  }
  /**
   * マスクテクスチャに描画するクリッピングコンテキストをセットする
   */
  setClippingContextBufferForMask(clip) {
    this._clippingContextBufferForMask = clip;
  }
  /**
   * マスクテクスチャに描画するクリッピングコンテキストを取得する
   * @return マスクテクスチャに描画するクリッピングコンテキスト
   */
  getClippingContextBufferForMask() {
    return this._clippingContextBufferForMask;
  }
  /**
   * 画面上に描画するクリッピングコンテキストをセットする
   */
  setClippingContextBufferForDraw(clip) {
    this._clippingContextBufferForDraw = clip;
  }
  /**
   * 画面上に描画するクリッピングコンテキストを取得する
   * @return 画面上に描画するクリッピングコンテキスト
   */
  getClippingContextBufferForDraw() {
    return this._clippingContextBufferForDraw;
  }
  /**
   * マスク生成時かを判定する
   * @returns 判定値
   */
  isGeneratingMask() {
    return this.getClippingContextBufferForMask() != null;
  }
  /**
   * glの設定
   */
  startUp(gl) {
    this.gl = gl;
    if (this._clippingManager) {
      this._clippingManager.setGL(gl);
    }
    CubismShaderManager_WebGL.getInstance().setGlContext(gl);
    this._rendererProfile.setGl(gl);
    this._extension = this.gl.getExtension("EXT_texture_filter_anisotropic") || this.gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") || this.gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
  }
  // webglコンテキスト
}
CubismRenderer.staticRelease = () => {
  CubismRenderer_WebGL.doStaticRelease();
};
var Live2DCubismFramework$8;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismClippingContext = CubismClippingContext_WebGL;
  Live2DCubismFramework2.CubismClippingManager_WebGL = CubismClippingManager_WebGL;
  Live2DCubismFramework2.CubismRenderTextureResource = CubismRenderTextureResource;
  Live2DCubismFramework2.CubismRenderer_WebGL = CubismRenderer_WebGL;
})(Live2DCubismFramework$8 || (Live2DCubismFramework$8 = {}));
const tempMatrix = new CubismMatrix44();
class Cubism5InternalModel extends InternalModel {
  constructor(coreModel, settings, options) {
    super();
    __publicField(this, "settings");
    __publicField(this, "coreModel");
    __publicField(this, "motionManager");
    __publicField(this, "lipSync", true);
    __publicField(this, "breath", CubismBreath.create());
    __publicField(this, "eyeBlink");
    // what's this for?
    __publicField(this, "userData");
    __publicField(this, "renderer", new CubismRenderer_WebGL());
    // Use actual parameter names from the Mao model instead of CubismDefaultParameterId
    __publicField(this, "idParamAngleX", "ParamAngleX");
    __publicField(this, "idParamAngleY", "ParamAngleY");
    __publicField(this, "idParamAngleZ", "ParamAngleZ");
    __publicField(this, "idParamEyeBallX", "ParamEyeBallX");
    __publicField(this, "idParamEyeBallY", "ParamEyeBallY");
    __publicField(this, "idParamBodyAngleX", "ParamBodyAngleX");
    __publicField(this, "idParamBreath", CubismDefaultParameterId.ParamBreath || "ParamBreath");
    // Keep this as fallback
    // parameter indices, cached for better performance (same as Cubism 2)
    __publicField(this, "eyeballXParamIndex");
    __publicField(this, "eyeballYParamIndex");
    __publicField(this, "angleXParamIndex");
    __publicField(this, "angleYParamIndex");
    __publicField(this, "angleZParamIndex");
    __publicField(this, "bodyAngleXParamIndex");
    __publicField(this, "breathParamIndex");
    /**
     * The model's internal scale, defined in the moc3 file.
     */
    __publicField(this, "pixelsPerUnit", 1);
    /**
     * Matrix that scales by {@link pixelsPerUnit}, and moves the origin from top-left to center.
     *
     * FIXME: This shouldn't be named as "centering"...
     */
    __publicField(this, "centeringTransform", new Matrix());
    this.coreModel = coreModel;
    this.settings = settings;
    this.motionManager = new Cubism5MotionManager(settings, options);
    this.eyeballXParamIndex = this.coreModel.getParameterIndex(CubismFramework.getIdManager().getId(this.idParamEyeBallX));
    this.eyeballYParamIndex = this.coreModel.getParameterIndex(CubismFramework.getIdManager().getId(this.idParamEyeBallY));
    this.angleXParamIndex = this.coreModel.getParameterIndex(CubismFramework.getIdManager().getId(this.idParamAngleX));
    this.angleYParamIndex = this.coreModel.getParameterIndex(CubismFramework.getIdManager().getId(this.idParamAngleY));
    this.angleZParamIndex = this.coreModel.getParameterIndex(CubismFramework.getIdManager().getId(this.idParamAngleZ));
    this.bodyAngleXParamIndex = this.coreModel.getParameterIndex(CubismFramework.getIdManager().getId(this.idParamBodyAngleX));
    this.breathParamIndex = this.coreModel.getParameterIndex(CubismFramework.getIdManager().getId(this.idParamBreath));
    this.init();
  }
  init() {
    var _a;
    super.init();
    if ((_a = this.settings.getEyeBlinkParameters()) == null ? void 0 : _a.length) {
      this.eyeBlink = CubismEyeBlink.create(this.settings);
    }
    const breathParams = new csmVector();
    breathParams.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId(this.idParamAngleX), 0, 15, 6.5345, 0.5));
    breathParams.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId(this.idParamAngleY), 0, 8, 3.5345, 0.5));
    breathParams.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId(this.idParamAngleZ), 0, 10, 5.5345, 0.5));
    breathParams.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId(this.idParamBodyAngleX), 0, 4, 15.5345, 0.5));
    breathParams.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId(this.idParamBreath), 0, 0.5, 3.2345, 0.5));
    this.breath.setParameters(breathParams);
    this.renderer.initialize(this.coreModel);
    this.renderer.setIsPremultipliedAlpha(true);
  }
  getSize() {
    return [
      this.coreModel.getModel().canvasinfo.CanvasWidth,
      this.coreModel.getModel().canvasinfo.CanvasHeight
    ];
  }
  getLayout() {
    const layout = {};
    if (this.settings.layout) {
      for (const [key, value] of Object.entries(this.settings.layout)) {
        const commonKey = key.charAt(0).toLowerCase() + key.slice(1);
        layout[commonKey] = value;
      }
    }
    return layout;
  }
  setupLayout() {
    super.setupLayout();
    this.pixelsPerUnit = this.coreModel.getModel().canvasinfo.PixelsPerUnit;
    this.centeringTransform.scale(this.pixelsPerUnit, this.pixelsPerUnit).translate(this.originalWidth / 2, this.originalHeight / 2);
  }
  updateWebGLContext(gl, glContextID) {
    this.renderer.firstDraw = true;
    this.renderer._bufferData = {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      vertex: null,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      uv: null,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      index: null
    };
    this.renderer.startUp(gl);
    this.renderer._clippingManager._currentFrameNo = glContextID;
    this.renderer._clippingManager._maskTexture = void 0;
    CubismShaderManager_WebGL.getInstance()._shaderSets = [];
  }
  bindTexture(index, texture) {
    this.renderer.bindTexture(index, texture);
  }
  getHitAreaDefs() {
    var _a, _b;
    const drawableIds = this.getDrawableIDs();
    return (_b = (_a = this.settings.hitAreas) == null ? void 0 : _a.map((hitArea) => {
      const index = drawableIds.indexOf(hitArea.Id);
      return {
        id: hitArea.Id,
        name: hitArea.Name,
        index
      };
    })) != null ? _b : [];
  }
  getDrawableIDs() {
    return this.coreModel.getModel().drawables.ids;
  }
  getDrawableIndex(id) {
    return this.coreModel.getDrawableIndex(CubismFramework.getIdManager().getId(id));
  }
  getDrawableVertices(drawIndex) {
    if (typeof drawIndex === "string") {
      drawIndex = this.coreModel.getDrawableIndex(CubismFramework.getIdManager().getId(drawIndex));
      if (drawIndex === -1) throw new TypeError("Unable to find drawable ID: " + drawIndex);
    }
    const arr = this.coreModel.getDrawableVertices(drawIndex).slice();
    for (let i = 0; i < arr.length; i += 2) {
      arr[i] = arr[i] * this.pixelsPerUnit + this.originalWidth / 2;
      arr[i + 1] = -arr[i + 1] * this.pixelsPerUnit + this.originalHeight / 2;
    }
    return arr;
  }
  updateTransform(transform) {
    this.drawingMatrix.copyFrom(this.centeringTransform).prepend(this.localTransform).prepend(transform);
  }
  update(dt, now) {
    var _a, _b, _c, _d;
    super.update(dt, now);
    dt /= 1e3;
    now /= 1e3;
    const model = this.coreModel;
    this.emit("beforeMotionUpdate");
    const motionUpdated = this.motionManager.update(this.coreModel, now);
    this.emit("afterMotionUpdate");
    (_a = this.motionManager.expressionManager) == null ? void 0 : _a.update(model, now);
    if (!motionUpdated) {
      (_b = this.eyeBlink) == null ? void 0 : _b.updateParameters(model, dt);
    }
    model.saveParameters();
    this.updateNaturalMovements(dt * 1e3, now * 1e3);
    (_c = this.physics) == null ? void 0 : _c.evaluate(model, dt);
    (_d = this.pose) == null ? void 0 : _d.updateParameters(model, dt);
    this.updateFocus();
    this.emit("beforeModelUpdate");
    model.update();
  }
  updateFocus() {
    if (this.eyeballXParamIndex < 0 || this.angleXParamIndex < 0) {
      console.log("Invalid parameter indices, skipping focus update");
      return;
    }
    const eyeX = this.focusController.x;
    const eyeY = this.focusController.y;
    const angleX = this.focusController.x * 30;
    const angleY = this.focusController.y * 30;
    this.coreModel.setParameterValueByIndex(this.eyeballXParamIndex, eyeX);
    this.coreModel.setParameterValueByIndex(this.eyeballYParamIndex, eyeY);
    this.coreModel.setParameterValueByIndex(this.angleXParamIndex, angleX);
    this.coreModel.setParameterValueByIndex(this.angleYParamIndex, angleY);
    this.coreModel.setParameterValueByIndex(this.angleZParamIndex, this.focusController.x * this.focusController.y * -30);
    this.coreModel.setParameterValueByIndex(this.bodyAngleXParamIndex, this.focusController.x * 10);
  }
  updateNaturalMovements(dt, now) {
    var _a;
    (_a = this.breath) == null ? void 0 : _a.updateParameters(this.coreModel, dt / 1e3);
  }
  draw(gl) {
    const matrix = this.drawingMatrix;
    const array = tempMatrix.getArray();
    array[0] = matrix.a;
    array[1] = matrix.b;
    array[4] = -matrix.c;
    array[5] = -matrix.d;
    array[12] = matrix.tx;
    array[13] = matrix.ty;
    this.renderer.setMvpMatrix(tempMatrix);
    this.renderer.setRenderState(gl.getParameter(gl.FRAMEBUFFER_BINDING), this.viewport);
    this.renderer.drawModel();
  }
  destroy() {
    super.destroy();
    this.renderer.release();
    this.coreModel.release();
    this.renderer = void 0;
    this.coreModel = void 0;
  }
}
class ICubismModelSetting {
}
var Live2DCubismFramework$7;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.ICubismModelSetting = ICubismModelSetting;
})(Live2DCubismFramework$7 || (Live2DCubismFramework$7 = {}));
var FrequestNode = /* @__PURE__ */ ((FrequestNode2) => {
  FrequestNode2[FrequestNode2["FrequestNode_Groups"] = 0] = "FrequestNode_Groups";
  FrequestNode2[FrequestNode2["FrequestNode_Moc"] = 1] = "FrequestNode_Moc";
  FrequestNode2[FrequestNode2["FrequestNode_Motions"] = 2] = "FrequestNode_Motions";
  FrequestNode2[FrequestNode2["FrequestNode_Expressions"] = 3] = "FrequestNode_Expressions";
  FrequestNode2[FrequestNode2["FrequestNode_Textures"] = 4] = "FrequestNode_Textures";
  FrequestNode2[FrequestNode2["FrequestNode_Physics"] = 5] = "FrequestNode_Physics";
  FrequestNode2[FrequestNode2["FrequestNode_Pose"] = 6] = "FrequestNode_Pose";
  FrequestNode2[FrequestNode2["FrequestNode_HitAreas"] = 7] = "FrequestNode_HitAreas";
  return FrequestNode2;
})(FrequestNode || {});
class CubismModelSettingJson extends ICubismModelSetting {
  /**
   * 引数付きコンストラクタ
   *
   * @param buffer    Model3Jsonをバイト配列として読み込んだデータバッファ
   * @param size      Model3Jsonのデータサイズ
   */
  constructor(buffer, size) {
    super();
    this.version = "Version";
    this.fileReferences = "FileReferences";
    this.groups = "Groups";
    this.layout = "Layout";
    this.hitAreas = "HitAreas";
    this.moc = "Moc";
    this.textures = "Textures";
    this.physics = "Physics";
    this.pose = "Pose";
    this.expressions = "Expressions";
    this.motions = "Motions";
    this.userData = "UserData";
    this.name = "Name";
    this.filePath = "File";
    this.id = "Id";
    this.ids = "Ids";
    this.target = "Target";
    this.idle = "Idle";
    this.tapBody = "TapBody";
    this.pinchIn = "PinchIn";
    this.pinchOut = "PinchOut";
    this.shake = "Shake";
    this.flickHead = "FlickHead";
    this.parameter = "Parameter";
    this.soundPath = "Sound";
    this.fadeInTime = "FadeInTime";
    this.fadeOutTime = "FadeOutTime";
    this.centerX = "CenterX";
    this.centerY = "CenterY";
    this.x = "X";
    this.y = "Y";
    this.width = "Width";
    this.height = "Height";
    this.lipSync = "LipSync";
    this.eyeBlink = "EyeBlink";
    this.initParameter = "init_param";
    this.initPartsVisible = "init_parts_visible";
    this.val = "val";
    this._json = CubismJson.create(buffer, size);
    if (this.getJson()) {
      this._jsonValue = new csmVector();
      this._jsonValue.pushBack(
        this.getJson().getRoot().getValueByString(this.groups)
      );
      this._jsonValue.pushBack(
        this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.moc)
      );
      this._jsonValue.pushBack(
        this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.motions)
      );
      this._jsonValue.pushBack(
        this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.expressions)
      );
      this._jsonValue.pushBack(
        this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.textures)
      );
      this._jsonValue.pushBack(
        this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.physics)
      );
      this._jsonValue.pushBack(
        this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.pose)
      );
      this._jsonValue.pushBack(
        this.getJson().getRoot().getValueByString(this.hitAreas)
      );
    }
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    CubismJson.delete(this._json);
    this._jsonValue = null;
  }
  /**
   * CubismJsonオブジェクトを取得する
   *
   * @return CubismJson
   */
  getJson() {
    return this._json;
  }
  /**
   * Mocファイルの名前を取得する
   * @return Mocファイルの名前
   */
  getModelFileName() {
    if (!this.isExistModelFile()) {
      return "";
    }
    return this._jsonValue.at(
      1
      /* FrequestNode_Moc */
    ).getRawString();
  }
  /**
   * モデルが使用するテクスチャの数を取得する
   * テクスチャの数
   */
  getTextureCount() {
    if (!this.isExistTextureFiles()) {
      return 0;
    }
    return this._jsonValue.at(
      4
      /* FrequestNode_Textures */
    ).getSize();
  }
  /**
   * テクスチャが配置されたディレクトリの名前を取得する
   * @return テクスチャが配置されたディレクトリの名前
   */
  getTextureDirectory() {
    const texturePath = this._jsonValue.at(
      4
      /* FrequestNode_Textures */
    ).getValueByIndex(0).getRawString();
    const pathArray = texturePath.split("/");
    const arrayLength = pathArray.length - 1;
    let textureDirectoryStr = "";
    for (let i = 0; i < arrayLength; i++) {
      textureDirectoryStr += pathArray[i];
      if (i < arrayLength - 1) {
        textureDirectoryStr += "/";
      }
    }
    return textureDirectoryStr;
  }
  /**
   * モデルが使用するテクスチャの名前を取得する
   * @param index 配列のインデックス値
   * @return テクスチャの名前
   */
  getTextureFileName(index) {
    return this._jsonValue.at(
      4
      /* FrequestNode_Textures */
    ).getValueByIndex(index).getRawString();
  }
  /**
   * モデルに設定された当たり判定の数を取得する
   * @return モデルに設定された当たり判定の数
   */
  getHitAreasCount() {
    if (!this.isExistHitAreas()) {
      return 0;
    }
    return this._jsonValue.at(
      7
      /* FrequestNode_HitAreas */
    ).getSize();
  }
  /**
   * 当たり判定に設定されたIDを取得する
   *
   * @param index 配列のindex
   * @return 当たり判定に設定されたID
   */
  getHitAreaId(index) {
    return CubismFramework.getIdManager().getId(
      this._jsonValue.at(
        7
        /* FrequestNode_HitAreas */
      ).getValueByIndex(index).getValueByString(this.id).getRawString()
    );
  }
  /**
   * 当たり判定に設定された名前を取得する
   * @param index 配列のインデックス値
   * @return 当たり判定に設定された名前
   */
  getHitAreaName(index) {
    return this._jsonValue.at(
      7
      /* FrequestNode_HitAreas */
    ).getValueByIndex(index).getValueByString(this.name).getRawString();
  }
  /**
   * 物理演算設定ファイルの名前を取得する
   * @return 物理演算設定ファイルの名前
   */
  getPhysicsFileName() {
    if (!this.isExistPhysicsFile()) {
      return "";
    }
    return this._jsonValue.at(
      5
      /* FrequestNode_Physics */
    ).getRawString();
  }
  /**
   * パーツ切り替え設定ファイルの名前を取得する
   * @return パーツ切り替え設定ファイルの名前
   */
  getPoseFileName() {
    if (!this.isExistPoseFile()) {
      return "";
    }
    return this._jsonValue.at(
      6
      /* FrequestNode_Pose */
    ).getRawString();
  }
  /**
   * 表情設定ファイルの数を取得する
   * @return 表情設定ファイルの数
   */
  getExpressionCount() {
    if (!this.isExistExpressionFile()) {
      return 0;
    }
    return this._jsonValue.at(
      3
      /* FrequestNode_Expressions */
    ).getSize();
  }
  /**
   * 表情設定ファイルを識別する名前（別名）を取得する
   * @param index 配列のインデックス値
   * @return 表情の名前
   */
  getExpressionName(index) {
    return this._jsonValue.at(
      3
      /* FrequestNode_Expressions */
    ).getValueByIndex(index).getValueByString(this.name).getRawString();
  }
  /**
   * 表情設定ファイルの名前を取得する
   * @param index 配列のインデックス値
   * @return 表情設定ファイルの名前
   */
  getExpressionFileName(index) {
    return this._jsonValue.at(
      3
      /* FrequestNode_Expressions */
    ).getValueByIndex(index).getValueByString(this.filePath).getRawString();
  }
  /**
   * モーショングループの数を取得する
   * @return モーショングループの数
   */
  getMotionGroupCount() {
    if (!this.isExistMotionGroups()) {
      return 0;
    }
    return this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getKeys().getSize();
  }
  /**
   * モーショングループの名前を取得する
   * @param index 配列のインデックス値
   * @return モーショングループの名前
   */
  getMotionGroupName(index) {
    if (!this.isExistMotionGroups()) {
      return null;
    }
    return this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getKeys().at(index);
  }
  /**
   * モーショングループに含まれるモーションの数を取得する
   * @param groupName モーショングループの名前
   * @return モーショングループの数
   */
  getMotionCount(groupName) {
    if (!this.isExistMotionGroupName(groupName)) {
      return 0;
    }
    return this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName).getSize();
  }
  /**
   * グループ名とインデックス値からモーションファイル名を取得する
   * @param groupName モーショングループの名前
   * @param index     配列のインデックス値
   * @return モーションファイルの名前
   */
  getMotionFileName(groupName, index) {
    if (!this.isExistMotionGroupName(groupName)) {
      return "";
    }
    return this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName).getValueByIndex(index).getValueByString(this.filePath).getRawString();
  }
  /**
   * モーションに対応するサウンドファイルの名前を取得する
   * @param groupName モーショングループの名前
   * @param index 配列のインデックス値
   * @return サウンドファイルの名前
   */
  getMotionSoundFileName(groupName, index) {
    if (!this.isExistMotionSoundFile(groupName, index)) {
      return "";
    }
    return this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName).getValueByIndex(index).getValueByString(this.soundPath).getRawString();
  }
  /**
   * モーション開始時のフェードイン処理時間を取得する
   * @param groupName モーショングループの名前
   * @param index 配列のインデックス値
   * @return フェードイン処理時間[秒]
   */
  getMotionFadeInTimeValue(groupName, index) {
    if (!this.isExistMotionFadeIn(groupName, index)) {
      return -1;
    }
    return this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName).getValueByIndex(index).getValueByString(this.fadeInTime).toFloat();
  }
  /**
   * モーション終了時のフェードアウト処理時間を取得する
   * @param groupName モーショングループの名前
   * @param index 配列のインデックス値
   * @return フェードアウト処理時間[秒]
   */
  getMotionFadeOutTimeValue(groupName, index) {
    if (!this.isExistMotionFadeOut(groupName, index)) {
      return -1;
    }
    return this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName).getValueByIndex(index).getValueByString(this.fadeOutTime).toFloat();
  }
  /**
   * ユーザーデータのファイル名を取得する
   * @return ユーザーデータのファイル名
   */
  getUserDataFile() {
    if (!this.isExistUserDataFile()) {
      return "";
    }
    return this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.userData).getRawString();
  }
  /**
   * レイアウト情報を取得する
   * @param outLayoutMap csmMapクラスのインスタンス
   * @return true レイアウト情報が存在する
   * @return false レイアウト情報が存在しない
   */
  getLayoutMap(outLayoutMap) {
    const map = this.getJson().getRoot().getValueByString(this.layout).getMap();
    if (map == null) {
      return false;
    }
    let ret = false;
    for (const ite = map.begin(); ite.notEqual(map.end()); ite.preIncrement()) {
      outLayoutMap.setValue(ite.ptr().first, ite.ptr().second.toFloat());
      ret = true;
    }
    return ret;
  }
  /**
   * 目パチに関連付けられたパラメータの数を取得する
   * @return 目パチに関連付けられたパラメータの数
   */
  getEyeBlinkParameterCount() {
    if (!this.isExistEyeBlinkParameters()) {
      return 0;
    }
    let num = 0;
    for (let i = 0; i < this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).getSize(); i++) {
      const refI = this._jsonValue.at(
        0
        /* FrequestNode_Groups */
      ).getValueByIndex(i);
      if (refI.isNull() || refI.isError()) {
        continue;
      }
      if (refI.getValueByString(this.name).getRawString() == this.eyeBlink) {
        num = refI.getValueByString(this.ids).getVector().getSize();
        break;
      }
    }
    return num;
  }
  /**
   * 目パチに関連付けられたパラメータのIDを取得する
   * @param index 配列のインデックス値
   * @return パラメータID
   */
  getEyeBlinkParameterId(index) {
    if (!this.isExistEyeBlinkParameters()) {
      return null;
    }
    for (let i = 0; i < this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).getSize(); i++) {
      const refI = this._jsonValue.at(
        0
        /* FrequestNode_Groups */
      ).getValueByIndex(i);
      if (refI.isNull() || refI.isError()) {
        continue;
      }
      if (refI.getValueByString(this.name).getRawString() == this.eyeBlink) {
        return CubismFramework.getIdManager().getId(
          refI.getValueByString(this.ids).getValueByIndex(index).getRawString()
        );
      }
    }
    return null;
  }
  /**
   * リップシンクに関連付けられたパラメータの数を取得する
   * @return リップシンクに関連付けられたパラメータの数
   */
  getLipSyncParameterCount() {
    if (!this.isExistLipSyncParameters()) {
      return 0;
    }
    let num = 0;
    for (let i = 0; i < this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).getSize(); i++) {
      const refI = this._jsonValue.at(
        0
        /* FrequestNode_Groups */
      ).getValueByIndex(i);
      if (refI.isNull() || refI.isError()) {
        continue;
      }
      if (refI.getValueByString(this.name).getRawString() == this.lipSync) {
        num = refI.getValueByString(this.ids).getVector().getSize();
        break;
      }
    }
    return num;
  }
  /**
   * リップシンクに関連付けられたパラメータの数を取得する
   * @param index 配列のインデックス値
   * @return パラメータID
   */
  getLipSyncParameterId(index) {
    if (!this.isExistLipSyncParameters()) {
      return null;
    }
    for (let i = 0; i < this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).getSize(); i++) {
      const refI = this._jsonValue.at(
        0
        /* FrequestNode_Groups */
      ).getValueByIndex(i);
      if (refI.isNull() || refI.isError()) {
        continue;
      }
      if (refI.getValueByString(this.name).getRawString() == this.lipSync) {
        return CubismFramework.getIdManager().getId(
          refI.getValueByString(this.ids).getValueByIndex(index).getRawString()
        );
      }
    }
    return null;
  }
  /**
   * モデルファイルのキーが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistModelFile() {
    const node = this._jsonValue.at(
      1
      /* FrequestNode_Moc */
    );
    return !node.isNull() && !node.isError();
  }
  /**
   * テクスチャファイルのキーが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistTextureFiles() {
    const node = this._jsonValue.at(
      4
      /* FrequestNode_Textures */
    );
    return !node.isNull() && !node.isError();
  }
  /**
   * 当たり判定のキーが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistHitAreas() {
    const node = this._jsonValue.at(
      7
      /* FrequestNode_HitAreas */
    );
    return !node.isNull() && !node.isError();
  }
  /**
   * 物理演算ファイルのキーが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistPhysicsFile() {
    const node = this._jsonValue.at(
      5
      /* FrequestNode_Physics */
    );
    return !node.isNull() && !node.isError();
  }
  /**
   * ポーズ設定ファイルのキーが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistPoseFile() {
    const node = this._jsonValue.at(
      6
      /* FrequestNode_Pose */
    );
    return !node.isNull() && !node.isError();
  }
  /**
   * 表情設定ファイルのキーが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistExpressionFile() {
    const node = this._jsonValue.at(
      3
      /* FrequestNode_Expressions */
    );
    return !node.isNull() && !node.isError();
  }
  /**
   * モーショングループのキーが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistMotionGroups() {
    const node = this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    );
    return !node.isNull() && !node.isError();
  }
  /**
   * 引数で指定したモーショングループのキーが存在するかどうかを確認する
   * @param groupName  グループ名
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistMotionGroupName(groupName) {
    const node = this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName);
    return !node.isNull() && !node.isError();
  }
  /**
   * 引数で指定したモーションに対応するサウンドファイルのキーが存在するかどうかを確認する
   * @param groupName  グループ名
   * @param index 配列のインデックス値
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistMotionSoundFile(groupName, index) {
    const node = this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName).getValueByIndex(index).getValueByString(this.soundPath);
    return !node.isNull() && !node.isError();
  }
  /**
   * 引数で指定したモーションに対応するフェードイン時間のキーが存在するかどうかを確認する
   * @param groupName  グループ名
   * @param index 配列のインデックス値
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistMotionFadeIn(groupName, index) {
    const node = this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName).getValueByIndex(index).getValueByString(this.fadeInTime);
    return !node.isNull() && !node.isError();
  }
  /**
   * 引数で指定したモーションに対応するフェードアウト時間のキーが存在するかどうかを確認する
   * @param groupName  グループ名
   * @param index 配列のインデックス値
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistMotionFadeOut(groupName, index) {
    const node = this._jsonValue.at(
      2
      /* FrequestNode_Motions */
    ).getValueByString(groupName).getValueByIndex(index).getValueByString(this.fadeOutTime);
    return !node.isNull() && !node.isError();
  }
  /**
   * UserDataのファイル名が存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistUserDataFile() {
    const node = this.getJson().getRoot().getValueByString(this.fileReferences).getValueByString(this.userData);
    return !node.isNull() && !node.isError();
  }
  /**
   * 目ぱちに対応付けられたパラメータが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistEyeBlinkParameters() {
    if (this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).isNull() || this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).isError()) {
      return false;
    }
    for (let i = 0; i < this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).getSize(); ++i) {
      if (this._jsonValue.at(
        0
        /* FrequestNode_Groups */
      ).getValueByIndex(i).getValueByString(this.name).getRawString() == this.eyeBlink) {
        return true;
      }
    }
    return false;
  }
  /**
   * リップシンクに対応付けられたパラメータが存在するかどうかを確認する
   * @return true キーが存在する
   * @return false キーが存在しない
   */
  isExistLipSyncParameters() {
    if (this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).isNull() || this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).isError()) {
      return false;
    }
    for (let i = 0; i < this._jsonValue.at(
      0
      /* FrequestNode_Groups */
    ).getSize(); ++i) {
      if (this._jsonValue.at(
        0
        /* FrequestNode_Groups */
      ).getValueByIndex(i).getValueByString(this.name).getRawString() == this.lipSync) {
        return true;
      }
    }
    return false;
  }
}
var Live2DCubismFramework$6;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismModelSettingJson = CubismModelSettingJson;
  Live2DCubismFramework2.FrequestNode = FrequestNode;
})(Live2DCubismFramework$6 || (Live2DCubismFramework$6 = {}));
class Cubism5ModelSettings extends ModelSettings {
  constructor(json) {
    super(json);
    __publicField(this, "moc");
    __publicField(this, "textures");
    __publicField(this, "hitAreas");
    __publicField(this, "motions");
    __publicField(this, "expressions");
    __publicField(this, "layout");
    if (!Cubism5ModelSettings.isValidJSON(json)) {
      throw new TypeError("Invalid JSON.");
    }
    const jsonString = JSON.stringify(json);
    const buffer = new TextEncoder().encode(jsonString);
    Object.assign(this, new CubismModelSettingJson(buffer.buffer, buffer.byteLength));
    this.moc = json.FileReferences.Moc;
    this.textures = json.FileReferences.Textures;
    if (json.FileReferences.Physics) {
      this.physics = json.FileReferences.Physics;
    }
    if (json.FileReferences.Pose) {
      this.pose = json.FileReferences.Pose;
    }
    if (json.Layout) {
      this.layout = json.Layout;
    }
    if (json.HitAreas) {
      this.hitAreas = json.HitAreas;
    }
    if (json.FileReferences.Motions) {
      this.motions = json.FileReferences.Motions;
    }
    if (json.FileReferences.Expressions) {
      this.expressions = json.FileReferences.Expressions;
    }
  }
  static isValidJSON(json) {
    var _a;
    return !!(json == null ? void 0 : json.FileReferences) && typeof json.FileReferences.Moc === "string" && ((_a = json.FileReferences.Textures) == null ? void 0 : _a.length) > 0 && // textures must be an array of strings
    json.FileReferences.Textures.every((item) => typeof item === "string");
  }
  /**
   * Get all eye blink parameter IDs as an array
   */
  getEyeBlinkParameters() {
    const count = this.getEyeBlinkParameterCount();
    const parameters = [];
    for (let i = 0; i < count; i++) {
      parameters.push(this.getEyeBlinkParameterId(i));
    }
    return parameters;
  }
  /**
   * Get all lip sync parameter IDs as an array
   */
  getLipSyncParameters() {
    const count = this.getLipSyncParameterCount();
    const parameters = [];
    for (let i = 0; i < count; i++) {
      parameters.push(this.getLipSyncParameterId(i));
    }
    return parameters;
  }
  replaceFiles(replace) {
    super.replaceFiles(replace);
    if (this.motions) {
      for (const [group2, motions] of Object.entries(this.motions)) {
        for (let i = 0; i < motions.length; i++) {
          motions[i].File = replace(motions[i].File, `motions.${group2}[${i}].File`);
          if (motions[i].Sound !== void 0) {
            motions[i].Sound = replace(
              motions[i].Sound,
              `motions.${group2}[${i}].Sound`
            );
          }
        }
      }
    }
    if (this.expressions) {
      for (let i = 0; i < this.expressions.length; i++) {
        this.expressions[i].File = replace(
          this.expressions[i].File,
          `expressions[${i}].File`
        );
      }
    }
  }
}
applyMixins(Cubism5ModelSettings, [CubismModelSettingJson]);
let startupPromise;
let startupRetries = 20;
function cubism5Ready() {
  if (CubismFramework.isStarted()) {
    return Promise.resolve();
  }
  startupPromise != null ? startupPromise : startupPromise = new Promise((resolve, reject) => {
    function startUpWithRetry() {
      try {
        startUpCubism5();
        resolve();
      } catch (e) {
        startupRetries--;
        if (startupRetries < 0) {
          const err = new Error("Failed to start up Cubism 5 framework.");
          err.cause = e;
          reject(err);
          return;
        }
        logger.log("Cubism5", "Startup failed, retrying 10ms later...");
        setTimeout(startUpWithRetry, 10);
      }
    }
    startUpWithRetry();
  });
  return startupPromise;
}
function startUpCubism5(options) {
  options = Object.assign(
    {
      logFunction: console.log,
      loggingLevel: LogLevel.LogLevel_Verbose
    },
    options
  );
  CubismFramework.startUp(options);
  CubismFramework.initialize();
}
const Epsilon = 1e-3;
const DefaultFadeInSeconds = 0.5;
const FadeIn = "FadeInTime";
const Link = "Link";
const Groups = "Groups";
const Id$1 = "Id";
class CubismPose {
  /**
   * インスタンスの作成
   * @param pose3json pose3.jsonのデータ
   * @param size pose3.jsonのデータのサイズ[byte]
   * @return 作成されたインスタンス
   */
  static create(pose3json, size) {
    const json = CubismJson.create(pose3json, size);
    if (!json) {
      return null;
    }
    const ret = new CubismPose();
    const root = json.getRoot();
    if (!root.getValueByString(FadeIn).isNull()) {
      ret._fadeTimeSeconds = root.getValueByString(FadeIn).toFloat(DefaultFadeInSeconds);
      if (ret._fadeTimeSeconds < 0) {
        ret._fadeTimeSeconds = DefaultFadeInSeconds;
      }
    }
    const poseListInfo = root.getValueByString(Groups);
    const poseCount = poseListInfo.getSize();
    for (let poseIndex = 0; poseIndex < poseCount; ++poseIndex) {
      const idListInfo = poseListInfo.getValueByIndex(poseIndex);
      const idCount = idListInfo.getSize();
      let groupCount = 0;
      for (let groupIndex = 0; groupIndex < idCount; ++groupIndex) {
        const partInfo = idListInfo.getValueByIndex(groupIndex);
        const partData = new PartData();
        const parameterId = CubismFramework.getIdManager().getId(
          partInfo.getValueByString(Id$1).getRawString()
        );
        partData.partId = parameterId;
        if (!partInfo.getValueByString(Link).isNull()) {
          const linkListInfo = partInfo.getValueByString(Link);
          const linkCount = linkListInfo.getSize();
          for (let linkIndex = 0; linkIndex < linkCount; ++linkIndex) {
            const linkPart = new PartData();
            const linkId = CubismFramework.getIdManager().getId(
              linkListInfo.getValueByIndex(linkIndex).getString()
            );
            linkPart.partId = linkId;
            partData.link.pushBack(linkPart);
          }
        }
        ret._partGroups.pushBack(partData.clone());
        ++groupCount;
      }
      ret._partGroupCounts.pushBack(groupCount);
    }
    CubismJson.delete(json);
    return ret;
  }
  /**
   * インスタンスを破棄する
   * @param pose 対象のCubismPose
   */
  static delete(pose) {
  }
  /**
   * モデルのパラメータの更新
   * @param model 対象のモデル
   * @param deltaTimeSeconds デルタ時間[秒]
   */
  updateParameters(model, deltaTimeSeconds) {
    if (model != this._lastModel) {
      this.reset(model);
    }
    this._lastModel = model;
    if (deltaTimeSeconds < 0) {
      deltaTimeSeconds = 0;
    }
    let beginIndex = 0;
    for (let i = 0; i < this._partGroupCounts.getSize(); i++) {
      const partGroupCount = this._partGroupCounts.at(i);
      this.doFade(model, deltaTimeSeconds, beginIndex, partGroupCount);
      beginIndex += partGroupCount;
    }
    this.copyPartOpacities(model);
  }
  /**
   * 表示を初期化
   * @param model 対象のモデル
   * @note 不透明度の初期値が0でないパラメータは、不透明度を１に設定する
   */
  reset(model) {
    let beginIndex = 0;
    for (let i = 0; i < this._partGroupCounts.getSize(); ++i) {
      const groupCount = this._partGroupCounts.at(i);
      for (let j = beginIndex; j < beginIndex + groupCount; ++j) {
        this._partGroups.at(j).initialize(model);
        const partsIndex = this._partGroups.at(j).partIndex;
        const paramIndex = this._partGroups.at(j).parameterIndex;
        if (partsIndex < 0) {
          continue;
        }
        model.setPartOpacityByIndex(partsIndex, j == beginIndex ? 1 : 0);
        model.setParameterValueByIndex(paramIndex, j == beginIndex ? 1 : 0);
        for (let k = 0; k < this._partGroups.at(j).link.getSize(); ++k) {
          this._partGroups.at(j).link.at(k).initialize(model);
        }
      }
      beginIndex += groupCount;
    }
  }
  /**
   * パーツの不透明度をコピー
   *
   * @param model 対象のモデル
   */
  copyPartOpacities(model) {
    for (let groupIndex = 0; groupIndex < this._partGroups.getSize(); ++groupIndex) {
      const partData = this._partGroups.at(groupIndex);
      if (partData.link.getSize() == 0) {
        continue;
      }
      const partIndex = this._partGroups.at(groupIndex).partIndex;
      const opacity = model.getPartOpacityByIndex(partIndex);
      for (let linkIndex = 0; linkIndex < partData.link.getSize(); ++linkIndex) {
        const linkPart = partData.link.at(linkIndex);
        const linkPartIndex = linkPart.partIndex;
        if (linkPartIndex < 0) {
          continue;
        }
        model.setPartOpacityByIndex(linkPartIndex, opacity);
      }
    }
  }
  /**
   * パーツのフェード操作を行う。
   * @param model 対象のモデル
   * @param deltaTimeSeconds デルタ時間[秒]
   * @param beginIndex フェード操作を行うパーツグループの先頭インデックス
   * @param partGroupCount フェード操作を行うパーツグループの個数
   */
  doFade(model, deltaTimeSeconds, beginIndex, partGroupCount) {
    let visiblePartIndex = -1;
    let newOpacity = 1;
    const phi = 0.5;
    const backOpacityThreshold = 0.15;
    for (let i = beginIndex; i < beginIndex + partGroupCount; ++i) {
      const partIndex = this._partGroups.at(i).partIndex;
      const paramIndex = this._partGroups.at(i).parameterIndex;
      if (model.getParameterValueByIndex(paramIndex) > Epsilon) {
        if (visiblePartIndex >= 0) {
          break;
        }
        visiblePartIndex = i;
        if (this._fadeTimeSeconds == 0) {
          newOpacity = 1;
          continue;
        }
        newOpacity = model.getPartOpacityByIndex(partIndex);
        newOpacity += deltaTimeSeconds / this._fadeTimeSeconds;
        if (newOpacity > 1) {
          newOpacity = 1;
        }
      }
    }
    if (visiblePartIndex < 0) {
      visiblePartIndex = 0;
      newOpacity = 1;
    }
    for (let i = beginIndex; i < beginIndex + partGroupCount; ++i) {
      const partsIndex = this._partGroups.at(i).partIndex;
      if (visiblePartIndex == i) {
        model.setPartOpacityByIndex(partsIndex, newOpacity);
      } else {
        let opacity = model.getPartOpacityByIndex(partsIndex);
        let a1;
        if (newOpacity < phi) {
          a1 = newOpacity * (phi - 1) / phi + 1;
        } else {
          a1 = (1 - newOpacity) * phi / (1 - phi);
        }
        const backOpacity = (1 - a1) * (1 - newOpacity);
        if (backOpacity > backOpacityThreshold) {
          a1 = 1 - backOpacityThreshold / (1 - newOpacity);
        }
        if (opacity > a1) {
          opacity = a1;
        }
        model.setPartOpacityByIndex(partsIndex, opacity);
      }
    }
  }
  /**
   * コンストラクタ
   */
  constructor() {
    this._fadeTimeSeconds = DefaultFadeInSeconds;
    this._lastModel = null;
    this._partGroups = new csmVector();
    this._partGroupCounts = new csmVector();
  }
  // 前回操作したモデル
}
class PartData {
  /**
   * コンストラクタ
   */
  constructor(v) {
    this.parameterIndex = 0;
    this.partIndex = 0;
    this.link = new csmVector();
    if (v != void 0) {
      this.partId = v.partId;
      for (const ite = v.link.begin(); ite.notEqual(v.link.end()); ite.preIncrement()) {
        this.link.pushBack(ite.ptr().clone());
      }
    }
  }
  /**
   * =演算子のオーバーロード
   */
  assignment(v) {
    this.partId = v.partId;
    for (const ite = v.link.begin(); ite.notEqual(v.link.end()); ite.preIncrement()) {
      this.link.pushBack(ite.ptr().clone());
    }
    return this;
  }
  /**
   * 初期化
   * @param model 初期化に使用するモデル
   */
  initialize(model) {
    this.parameterIndex = model.getParameterIndex(this.partId);
    this.partIndex = model.getPartIndex(this.partId);
    model.setParameterValueByIndex(this.parameterIndex, 1);
  }
  /**
   * オブジェクトのコピーを生成する
   */
  clone() {
    const clonePartData = new PartData();
    clonePartData.partId = this.partId;
    clonePartData.parameterIndex = this.parameterIndex;
    clonePartData.partIndex = this.partIndex;
    clonePartData.link = new csmVector();
    for (let ite = this.link.begin(); ite.notEqual(this.link.end()); ite.increment()) {
      clonePartData.link.pushBack(ite.ptr().clone());
    }
    return clonePartData;
  }
  // 連動するパラメータ
}
var Live2DCubismFramework$5;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismPose = CubismPose;
  Live2DCubismFramework2.PartData = PartData;
})(Live2DCubismFramework$5 || (Live2DCubismFramework$5 = {}));
class ParameterRepeatData {
  /**
   * Constructor
   *
   * @param isOverridden whether to be overriden
   * @param isParameterRepeated override flag for settings
   */
  constructor(isOverridden = false, isParameterRepeated = false) {
    this.isOverridden = isOverridden;
    this.isParameterRepeated = isParameterRepeated;
  }
}
class DrawableColorData {
  constructor(isOverridden = false, color = new CubismTextureColor()) {
    this.isOverridden = isOverridden;
    this.color = color;
  }
  get isOverwritten() {
    return this.isOverridden;
  }
}
class PartColorData {
  constructor(isOverridden = false, color = new CubismTextureColor()) {
    this.isOverridden = isOverridden;
    this.color = color;
  }
  get isOverwritten() {
    return this.isOverridden;
  }
}
class DrawableCullingData {
  /**
   * コンストラクタ
   *
   * @param isOverridden
   * @param isCulling
   */
  constructor(isOverridden = false, isCulling = false) {
    this.isOverridden = isOverridden;
    this.isCulling = isCulling;
  }
  get isOverwritten() {
    return this.isOverridden;
  }
}
class CubismModel {
  /**
   * モデルのパラメータの更新
   */
  update() {
    this._model.update();
    this._model.drawables.resetDynamicFlags();
  }
  /**
   * PixelsPerUnitを取得する
   * @returns PixelsPerUnit
   */
  getPixelsPerUnit() {
    if (this._model == null) {
      return 0;
    }
    return this._model.canvasinfo.PixelsPerUnit;
  }
  /**
   * キャンバスの幅を取得する
   */
  getCanvasWidth() {
    if (this._model == null) {
      return 0;
    }
    return this._model.canvasinfo.CanvasWidth / this._model.canvasinfo.PixelsPerUnit;
  }
  /**
   * キャンバスの高さを取得する
   */
  getCanvasHeight() {
    if (this._model == null) {
      return 0;
    }
    return this._model.canvasinfo.CanvasHeight / this._model.canvasinfo.PixelsPerUnit;
  }
  /**
   * パラメータを保存する
   */
  saveParameters() {
    const parameterCount = this._model.parameters.count;
    const savedParameterCount = this._savedParameters.getSize();
    for (let i = 0; i < parameterCount; ++i) {
      if (i < savedParameterCount) {
        this._savedParameters.set(i, this._parameterValues[i]);
      } else {
        this._savedParameters.pushBack(this._parameterValues[i]);
      }
    }
  }
  /**
   * 乗算色を取得する
   * @param index Drawablesのインデックス
   * @returns 指定したdrawableの乗算色(RGBA)
   */
  getMultiplyColor(index) {
    if (this.getOverrideFlagForModelMultiplyColors() || this.getOverrideFlagForDrawableMultiplyColors(index)) {
      return this._userMultiplyColors.at(index).color;
    }
    const color = this.getDrawableMultiplyColor(index);
    return color;
  }
  /**
   * スクリーン色を取得する
   * @param index Drawablesのインデックス
   * @returns 指定したdrawableのスクリーン色(RGBA)
   */
  getScreenColor(index) {
    if (this.getOverrideFlagForModelScreenColors() || this.getOverrideFlagForDrawableScreenColors(index)) {
      return this._userScreenColors.at(index).color;
    }
    const color = this.getDrawableScreenColor(index);
    return color;
  }
  /**
   * 乗算色をセットする
   * @param index Drawablesのインデックス
   * @param color 設定する乗算色(CubismTextureColor)
   */
  setMultiplyColorByTextureColor(index, color) {
    this.setMultiplyColorByRGBA(index, color.r, color.g, color.b, color.a);
  }
  /**
   * 乗算色をセットする
   * @param index Drawablesのインデックス
   * @param r 設定する乗算色のR値
   * @param g 設定する乗算色のG値
   * @param b 設定する乗算色のB値
   * @param a 設定する乗算色のA値
   */
  setMultiplyColorByRGBA(index, r, g, b, a = 1) {
    this._userMultiplyColors.at(index).color.r = r;
    this._userMultiplyColors.at(index).color.g = g;
    this._userMultiplyColors.at(index).color.b = b;
    this._userMultiplyColors.at(index).color.a = a;
  }
  /**
   * スクリーン色をセットする
   * @param index Drawablesのインデックス
   * @param color 設定するスクリーン色(CubismTextureColor)
   */
  setScreenColorByTextureColor(index, color) {
    this.setScreenColorByRGBA(index, color.r, color.g, color.b, color.a);
  }
  /**
   * スクリーン色をセットする
   * @param index Drawablesのインデックス
   * @param r 設定するスクリーン色のR値
   * @param g 設定するスクリーン色のG値
   * @param b 設定するスクリーン色のB値
   * @param a 設定するスクリーン色のA値
   */
  setScreenColorByRGBA(index, r, g, b, a = 1) {
    this._userScreenColors.at(index).color.r = r;
    this._userScreenColors.at(index).color.g = g;
    this._userScreenColors.at(index).color.b = b;
    this._userScreenColors.at(index).color.a = a;
  }
  /**
   * partの乗算色を取得する
   * @param partIndex partのインデックス
   * @returns 指定したpartの乗算色
   */
  getPartMultiplyColor(partIndex) {
    return this._userPartMultiplyColors.at(partIndex).color;
  }
  /**
   * partのスクリーン色を取得する
   * @param partIndex partのインデックス
   * @returns 指定したpartのスクリーン色
   */
  getPartScreenColor(partIndex) {
    return this._userPartScreenColors.at(partIndex).color;
  }
  /**
   * partのOverrideColor setter関数
   * @param partIndex partのインデックス
   * @param r 設定する色のR値
   * @param g 設定する色のG値
   * @param b 設定する色のB値
   * @param a 設定する色のA値
   * @param partColors 設定するpartのカラーデータ配列
   * @param drawableColors partに関連するDrawableのカラーデータ配列
   */
  setPartColor(partIndex, r, g, b, a, partColors, drawableColors) {
    partColors.at(partIndex).color.r = r;
    partColors.at(partIndex).color.g = g;
    partColors.at(partIndex).color.b = b;
    partColors.at(partIndex).color.a = a;
    if (partColors.at(partIndex).isOverridden) {
      for (let i = 0; i < this._partChildDrawables.at(partIndex).getSize(); ++i) {
        const drawableIndex = this._partChildDrawables.at(partIndex).at(i);
        drawableColors.at(drawableIndex).color.r = r;
        drawableColors.at(drawableIndex).color.g = g;
        drawableColors.at(drawableIndex).color.b = b;
        drawableColors.at(drawableIndex).color.a = a;
      }
    }
  }
  /**
   * 乗算色をセットする
   * @param partIndex partのインデックス
   * @param color 設定する乗算色(CubismTextureColor)
   */
  setPartMultiplyColorByTextureColor(partIndex, color) {
    this.setPartMultiplyColorByRGBA(
      partIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }
  /**
   * 乗算色をセットする
   * @param partIndex partのインデックス
   * @param r 設定する乗算色のR値
   * @param g 設定する乗算色のG値
   * @param b 設定する乗算色のB値
   * @param a 設定する乗算色のA値
   */
  setPartMultiplyColorByRGBA(partIndex, r, g, b, a) {
    this.setPartColor(
      partIndex,
      r,
      g,
      b,
      a,
      this._userPartMultiplyColors,
      this._userMultiplyColors
    );
  }
  /**
   * スクリーン色をセットする
   * @param partIndex partのインデックス
   * @param color 設定するスクリーン色(CubismTextureColor)
   */
  setPartScreenColorByTextureColor(partIndex, color) {
    this.setPartScreenColorByRGBA(
      partIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }
  /**
   * スクリーン色をセットする
   * @param partIndex partのインデックス
   * @param r 設定するスクリーン色のR値
   * @param g 設定するスクリーン色のG値
   * @param b 設定するスクリーン色のB値
   * @param a 設定するスクリーン色のA値
   */
  setPartScreenColorByRGBA(partIndex, r, g, b, a) {
    this.setPartColor(
      partIndex,
      r,
      g,
      b,
      a,
      this._userPartScreenColors,
      this._userScreenColors
    );
  }
  /**
   * Checks whether parameter repetition is performed for the entire model.
   *
   * @return true if parameter repetition is performed for the entire model; otherwise returns false.
   */
  getOverrideFlagForModelParameterRepeat() {
    return this._isOverriddenParameterRepeat;
  }
  /**
   * Sets whether parameter repetition is performed for the entire model.
   * Use true to perform parameter repetition for the entire model, or false to not perform it.
   */
  setOverrideFlagForModelParameterRepeat(isRepeat) {
    this._isOverriddenParameterRepeat = isRepeat;
  }
  /**
   * Returns the flag indicating whether to override the parameter repeat.
   *
   * @param parameterIndex Parameter index
   *
   * @return true if the parameter repeat is overridden, false otherwise.
   */
  getOverrideFlagForParameterRepeat(parameterIndex) {
    return this._userParameterRepeatDataList.at(parameterIndex).isOverridden;
  }
  /**
   * Sets the flag indicating whether to override the parameter repeat.
   *
   * @param parameterIndex Parameter index
   * @param value true if it is to be overridden; otherwise, false.
   */
  setOverrideFlagForParameterRepeat(parameterIndex, value) {
    this._userParameterRepeatDataList.at(parameterIndex).isOverridden = value;
  }
  /**
   * Returns the repeat flag.
   *
   * @param parameterIndex Parameter index
   *
   * @return true if repeating, false otherwise.
   */
  getRepeatFlagForParameterRepeat(parameterIndex) {
    return this._userParameterRepeatDataList.at(parameterIndex).isParameterRepeated;
  }
  /**
   * Sets the repeat flag.
   *
   * @param parameterIndex Parameter index
   * @param value true to enable repeating, false otherwise.
   */
  setRepeatFlagForParameterRepeat(parameterIndex, value) {
    this._userParameterRepeatDataList.at(parameterIndex).isParameterRepeated = value;
  }
  /**
   * SDKから指定したモデルの乗算色を上書きするか
   *
   * @deprecated 名称変更のため非推奨 getOverrideFlagForModelMultiplyColors() に置き換え
   *
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  getOverwriteFlagForModelMultiplyColors() {
    CubismLogWarning(
      "getOverwriteFlagForModelMultiplyColors() is a deprecated function. Please use getOverrideFlagForModelMultiplyColors()."
    );
    return this.getOverrideFlagForModelMultiplyColors();
  }
  /**
   * SDKから指定したモデルの乗算色を上書きするか
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  getOverrideFlagForModelMultiplyColors() {
    return this._isOverriddenModelMultiplyColors;
  }
  /**
   * SDKから指定したモデルのスクリーン色を上書きするか
   *
   * @deprecated 名称変更のため非推奨 getOverrideFlagForModelScreenColors() に置き換え
   *
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  getOverwriteFlagForModelScreenColors() {
    CubismLogWarning(
      "getOverwriteFlagForModelScreenColors() is a deprecated function. Please use getOverrideFlagForModelScreenColors()."
    );
    return this.getOverrideFlagForModelScreenColors();
  }
  /**
   * SDKから指定したモデルのスクリーン色を上書きするか
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  getOverrideFlagForModelScreenColors() {
    return this._isOverriddenModelScreenColors;
  }
  /**
   * SDKから指定したモデルの乗算色を上書きするかセットする
   *
   * @deprecated 名称変更のため非推奨 setOverrideFlagForModelMultiplyColors(value: boolean) に置き換え
   *
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverwriteFlagForModelMultiplyColors(value) {
    CubismLogWarning(
      "setOverwriteFlagForModelMultiplyColors(value: boolean) is a deprecated function. Please use setOverrideFlagForModelMultiplyColors(value: boolean)."
    );
    this.setOverrideFlagForModelMultiplyColors(value);
  }
  /**
   * SDKから指定したモデルの乗算色を上書きするかセットする
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverrideFlagForModelMultiplyColors(value) {
    this._isOverriddenModelMultiplyColors = value;
  }
  /**
   * SDKから指定したモデルのスクリーン色を上書きするかセットする
   *
   * @deprecated 名称変更のため非推奨 setOverrideFlagForModelScreenColors(value: boolean) に置き換え
   *
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverwriteFlagForModelScreenColors(value) {
    CubismLogWarning(
      "setOverwriteFlagForModelScreenColors(value: boolean) is a deprecated function. Please use setOverrideFlagForModelScreenColors(value: boolean)."
    );
    this.setOverrideFlagForModelScreenColors(value);
  }
  /**
   * SDKから指定したモデルのスクリーン色を上書きするかセットする
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverrideFlagForModelScreenColors(value) {
    this._isOverriddenModelScreenColors = value;
  }
  /**
   * SDKから指定したDrawableIndexの乗算色を上書きするか
   *
   * @deprecated 名称変更のため非推奨 getOverrideFlagForDrawableMultiplyColors(drawableindex: number) に置き換え
   *
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  getOverwriteFlagForDrawableMultiplyColors(drawableindex) {
    CubismLogWarning(
      "getOverwriteFlagForDrawableMultiplyColors(drawableindex: number) is a deprecated function. Please use getOverrideFlagForDrawableMultiplyColors(drawableindex: number)."
    );
    return this.getOverrideFlagForDrawableMultiplyColors(drawableindex);
  }
  /**
   * SDKから指定したDrawableIndexの乗算色を上書きするか
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  getOverrideFlagForDrawableMultiplyColors(drawableindex) {
    return this._userMultiplyColors.at(drawableindex).isOverridden;
  }
  /**
   * SDKから指定したDrawableIndexのスクリーン色を上書きするか
   *
   * @deprecated 名称変更のため非推奨 getOverrideFlagForDrawableScreenColors(drawableindex: number) に置き換え
   *
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  getOverwriteFlagForDrawableScreenColors(drawableindex) {
    CubismLogWarning(
      "getOverwriteFlagForDrawableScreenColors(drawableindex: number) is a deprecated function. Please use getOverrideFlagForDrawableScreenColors(drawableindex: number)."
    );
    return this.getOverrideFlagForDrawableScreenColors(drawableindex);
  }
  /**
   * SDKから指定したDrawableIndexのスクリーン色を上書きするか
   * @returns true -> SDKからの情報を優先する
   *          false -> モデルに設定されている色情報を使用
   */
  getOverrideFlagForDrawableScreenColors(drawableindex) {
    return this._userScreenColors.at(drawableindex).isOverridden;
  }
  /**
   * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
   *
   * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableMultiplyColors(drawableindex: number, value: boolean) に置き換え
   *
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverwriteFlagForDrawableMultiplyColors(drawableindex, value) {
    CubismLogWarning(
      "setOverwriteFlagForDrawableMultiplyColors(drawableindex: number, value: boolean) is a deprecated function. Please use setOverrideFlagForDrawableMultiplyColors(drawableindex: number, value: boolean)."
    );
    this.setOverrideFlagForDrawableMultiplyColors(drawableindex, value);
  }
  /**
   * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverrideFlagForDrawableMultiplyColors(drawableindex, value) {
    this._userMultiplyColors.at(drawableindex).isOverridden = value;
  }
  /**
   * SDKから指定したDrawableIndexのスクリーン色を上書きするかセットする
   *
   * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableScreenColors(drawableindex: number, value: boolean) に置き換え
   *
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverwriteFlagForDrawableScreenColors(drawableindex, value) {
    CubismLogWarning(
      "setOverwriteFlagForDrawableScreenColors(drawableindex: number, value: boolean) is a deprecated function. Please use setOverrideFlagForDrawableScreenColors(drawableindex: number, value: boolean)."
    );
    this.setOverrideFlagForDrawableScreenColors(drawableindex, value);
  }
  /**
   * SDKから指定したDrawableIndexのスクリーン色を上書きするかセットする
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverrideFlagForDrawableScreenColors(drawableindex, value) {
    this._userScreenColors.at(drawableindex).isOverridden = value;
  }
  /**
   * SDKからpartの乗算色を上書きするか
   *
   * @deprecated 名称変更のため非推奨 getOverrideColorForPartMultiplyColors(partIndex: number) に置き換え
   *
   * @param partIndex partのインデックス
   * @returns true    ->  SDKからの情報を優先する
   *          false   ->  モデルに設定されている色情報を使用
   */
  getOverwriteColorForPartMultiplyColors(partIndex) {
    CubismLogWarning(
      "getOverwriteColorForPartMultiplyColors(partIndex: number) is a deprecated function. Please use getOverrideColorForPartMultiplyColors(partIndex: number)."
    );
    return this.getOverrideColorForPartMultiplyColors(partIndex);
  }
  /**
   * SDKからpartの乗算色を上書きするか
   * @param partIndex partのインデックス
   * @returns true    ->  SDKからの情報を優先する
   *          false   ->  モデルに設定されている色情報を使用
   */
  getOverrideColorForPartMultiplyColors(partIndex) {
    return this._userPartMultiplyColors.at(partIndex).isOverridden;
  }
  /**
   * SDKからpartのスクリーン色を上書きするか
   *
   * @deprecated 名称変更のため非推奨 getOverrideColorForPartScreenColors(partIndex: number) に置き換え
   *
   * @param partIndex partのインデックス
   * @returns true    ->  SDKからの情報を優先する
   *          false   ->  モデルに設定されている色情報を使用
   */
  getOverwriteColorForPartScreenColors(partIndex) {
    CubismLogWarning(
      "getOverwriteColorForPartScreenColors(partIndex: number) is a deprecated function. Please use getOverrideColorForPartScreenColors(partIndex: number)."
    );
    return this.getOverrideColorForPartScreenColors(partIndex);
  }
  /**
   * SDKからpartのスクリーン色を上書きするか
   * @param partIndex partのインデックス
   * @returns true    ->  SDKからの情報を優先する
   *          false   ->  モデルに設定されている色情報を使用
   */
  getOverrideColorForPartScreenColors(partIndex) {
    return this._userPartScreenColors.at(partIndex).isOverridden;
  }
  /**
   * partのOverrideFlag setter関数
   *
   * @deprecated 名称変更のため非推奨 setOverrideColorForPartColors(
   * partIndex: number,
   * value: boolean,
   * partColors: csmVector<PartColorData>,
   * drawableColors: csmVector<DrawableColorData>) に置き換え
   *
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   * @param partColors 設定するpartのカラーデータ配列
   * @param drawableColors partに関連するDrawableのカラーデータ配列
   */
  setOverwriteColorForPartColors(partIndex, value, partColors, drawableColors) {
    CubismLogWarning(
      "setOverwriteColorForPartColors(partIndex: number, value: boolean, partColors: csmVector<PartColorData>, drawableColors: csmVector<DrawableColorData>) is a deprecated function. Please use setOverrideColorForPartColors(partIndex: number, value: boolean, partColors: csmVector<PartColorData>, drawableColors: csmVector<DrawableColorData>)."
    );
    this.setOverrideColorForPartColors(
      partIndex,
      value,
      partColors,
      drawableColors
    );
  }
  /**
   * partのOverrideFlag setter関数
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   * @param partColors 設定するpartのカラーデータ配列
   * @param drawableColors partに関連するDrawableのカラーデータ配列
   */
  setOverrideColorForPartColors(partIndex, value, partColors, drawableColors) {
    partColors.at(partIndex).isOverridden = value;
    for (let i = 0; i < this._partChildDrawables.at(partIndex).getSize(); ++i) {
      const drawableIndex = this._partChildDrawables.at(partIndex).at(i);
      drawableColors.at(drawableIndex).isOverridden = value;
      if (value) {
        drawableColors.at(drawableIndex).color.r = partColors.at(partIndex).color.r;
        drawableColors.at(drawableIndex).color.g = partColors.at(partIndex).color.g;
        drawableColors.at(drawableIndex).color.b = partColors.at(partIndex).color.b;
        drawableColors.at(drawableIndex).color.a = partColors.at(partIndex).color.a;
      }
    }
  }
  /**
   * SDKからpartのスクリーン色を上書きするかをセットする
   *
   * @deprecated 名称変更のため非推奨 setOverrideColorForPartMultiplyColors(partIndex: number, value: boolean) に置き換え
   *
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverwriteColorForPartMultiplyColors(partIndex, value) {
    CubismLogWarning(
      "setOverwriteColorForPartMultiplyColors(partIndex: number, value: boolean) is a deprecated function. Please use setOverrideColorForPartMultiplyColors(partIndex: number, value: boolean)."
    );
    this.setOverrideColorForPartMultiplyColors(partIndex, value);
  }
  /**
   * SDKからpartのスクリーン色を上書きするかをセットする
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverrideColorForPartMultiplyColors(partIndex, value) {
    this._userPartMultiplyColors.at(partIndex).isOverridden = value;
    this.setOverrideColorForPartColors(
      partIndex,
      value,
      this._userPartMultiplyColors,
      this._userMultiplyColors
    );
  }
  /**
   * SDKからpartのスクリーン色を上書きするかをセットする
   *
   * @deprecated 名称変更のため非推奨 setOverrideColorForPartScreenColors(partIndex: number, value: boolean) に置き換え
   *
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverwriteColorForPartScreenColors(partIndex, value) {
    CubismLogWarning(
      "setOverwriteColorForPartScreenColors(partIndex: number, value: boolean) is a deprecated function. Please use setOverrideColorForPartScreenColors(partIndex: number, value: boolean)."
    );
    this.setOverrideColorForPartScreenColors(partIndex, value);
  }
  /**
   * SDKからpartのスクリーン色を上書きするかをセットする
   * @param partIndex partのインデックス
   * @param value true -> SDKからの情報を優先する
   *              false -> モデルに設定されている色情報を使用
   */
  setOverrideColorForPartScreenColors(partIndex, value) {
    this._userPartScreenColors.at(partIndex).isOverridden = value;
    this.setOverrideColorForPartColors(
      partIndex,
      value,
      this._userPartScreenColors,
      this._userScreenColors
    );
  }
  /**
   * Drawableのカリング情報を取得する。
   *
   * @param   drawableIndex   Drawableのインデックス
   * @return  Drawableのカリング情報
   */
  getDrawableCulling(drawableIndex) {
    if (this.getOverrideFlagForModelCullings() || this.getOverrideFlagForDrawableCullings(drawableIndex)) {
      return this._userCullings.at(drawableIndex).isCulling;
    }
    const constantFlags = this._model.drawables.constantFlags;
    return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(
      constantFlags[drawableIndex]
    );
  }
  /**
   * Drawableのカリング情報を設定する。
   *
   * @param drawableIndex Drawableのインデックス
   * @param isCulling カリング情報
   */
  setDrawableCulling(drawableIndex, isCulling) {
    this._userCullings.at(drawableIndex).isCulling = isCulling;
  }
  /**
   * SDKからモデル全体のカリング設定を上書きするか。
   *
   * @deprecated 名称変更のため非推奨 getOverrideFlagForModelCullings() に置き換え
   *
   * @retval  true    ->  SDK上のカリング設定を使用
   * @retval  false   ->  モデルのカリング設定を使用
   */
  getOverwriteFlagForModelCullings() {
    CubismLogWarning(
      "getOverwriteFlagForModelCullings() is a deprecated function. Please use getOverrideFlagForModelCullings()."
    );
    return this.getOverrideFlagForModelCullings();
  }
  /**
   * SDKからモデル全体のカリング設定を上書きするか。
   *
   * @retval  true    ->  SDK上のカリング設定を使用
   * @retval  false   ->  モデルのカリング設定を使用
   */
  getOverrideFlagForModelCullings() {
    return this._isOverriddenCullings;
  }
  /**
   * SDKからモデル全体のカリング設定を上書きするかを設定する。
   *
   * @deprecated 名称変更のため非推奨 setOverrideFlagForModelCullings(isOverriddenCullings: boolean) に置き換え
   *
   * @param isOveriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
   */
  setOverwriteFlagForModelCullings(isOverriddenCullings) {
    CubismLogWarning(
      "setOverwriteFlagForModelCullings(isOverriddenCullings: boolean) is a deprecated function. Please use setOverrideFlagForModelCullings(isOverriddenCullings: boolean)."
    );
    this.setOverrideFlagForModelCullings(isOverriddenCullings);
  }
  /**
   * SDKからモデル全体のカリング設定を上書きするかを設定する。
   *
   * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
   */
  setOverrideFlagForModelCullings(isOverriddenCullings) {
    this._isOverriddenCullings = isOverriddenCullings;
  }
  /**
   *
   * @deprecated 名称変更のため非推奨 getOverrideFlagForDrawableCullings(drawableIndex: number) に置き換え
   *
   * @param drawableIndex Drawableのインデックス
   * @retval  true    ->  SDK上のカリング設定を使用
   * @retval  false   ->  モデルのカリング設定を使用
   */
  getOverwriteFlagForDrawableCullings(drawableIndex) {
    CubismLogWarning(
      "getOverwriteFlagForDrawableCullings(drawableIndex: number) is a deprecated function. Please use getOverrideFlagForDrawableCullings(drawableIndex: number)."
    );
    return this.getOverrideFlagForDrawableCullings(drawableIndex);
  }
  /**
   *
   * @param drawableIndex Drawableのインデックス
   * @retval  true    ->  SDK上のカリング設定を使用
   * @retval  false   ->  モデルのカリング設定を使用
   */
  getOverrideFlagForDrawableCullings(drawableIndex) {
    return this._userCullings.at(drawableIndex).isOverridden;
  }
  /**
   *
   * @deprecated 名称変更のため非推奨 setOverrideFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: bolean) に置き換え
   *
   * @param drawableIndex Drawableのインデックス
   * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
   */
  setOverwriteFlagForDrawableCullings(drawableIndex, isOverriddenCullings) {
    CubismLogWarning(
      "setOverwriteFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: boolean) is a deprecated function. Please use setOverrideFlagForDrawableCullings(drawableIndex: number, isOverriddenCullings: boolean)."
    );
    this.setOverrideFlagForDrawableCullings(
      drawableIndex,
      isOverriddenCullings
    );
  }
  /**
   *
   * @param drawableIndex Drawableのインデックス
   * @param isOverriddenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
   */
  setOverrideFlagForDrawableCullings(drawableIndex, isOverriddenCullings) {
    this._userCullings.at(drawableIndex).isOverridden = isOverriddenCullings;
  }
  /**
   * モデルの不透明度を取得する
   *
   * @returns 不透明度の値
   */
  getModelOapcity() {
    return this._modelOpacity;
  }
  /**
   * モデルの不透明度を設定する
   *
   * @param value 不透明度の値
   */
  setModelOapcity(value) {
    this._modelOpacity = value;
  }
  /**
   * モデルを取得
   */
  getModel() {
    return this._model;
  }
  /**
   * パーツのインデックスを取得
   * @param partId パーツのID
   * @return パーツのインデックス
   */
  getPartIndex(partId) {
    let partIndex;
    const partCount = this._model.parts.count;
    for (partIndex = 0; partIndex < partCount; ++partIndex) {
      if (partId == this._partIds.at(partIndex)) {
        return partIndex;
      }
    }
    if (this._notExistPartId.isExist(partId)) {
      return this._notExistPartId.getValue(partId);
    }
    partIndex = partCount + this._notExistPartId.getSize();
    this._notExistPartId.setValue(partId, partIndex);
    this._notExistPartOpacities.appendKey(partIndex);
    return partIndex;
  }
  /**
   * パーツのIDを取得する。
   *
   * @param partIndex 取得するパーツのインデックス
   * @return パーツのID
   */
  getPartId(partIndex) {
    const partId = this._model.parts.ids[partIndex];
    return CubismFramework.getIdManager().getId(partId);
  }
  /**
   * パーツの個数の取得
   * @return パーツの個数
   */
  getPartCount() {
    const partCount = this._model.parts.count;
    return partCount;
  }
  /**
   * パーツの親パーツインデックスのリストを取得
   *
   * @returns パーツの親パーツインデックスのリスト
   */
  getPartParentPartIndices() {
    const parentIndices = this._model.parts.parentIndices;
    return parentIndices;
  }
  /**
   * パーツの不透明度の設定(Index)
   * @param partIndex パーツのインデックス
   * @param opacity 不透明度
   */
  setPartOpacityByIndex(partIndex, opacity) {
    if (this._notExistPartOpacities.isExist(partIndex)) {
      this._notExistPartOpacities.setValue(partIndex, opacity);
      return;
    }
    CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
    this._partOpacities[partIndex] = opacity;
  }
  /**
   * パーツの不透明度の設定(Id)
   * @param partId パーツのID
   * @param opacity パーツの不透明度
   */
  setPartOpacityById(partId, opacity) {
    const index = this.getPartIndex(partId);
    if (index < 0) {
      return;
    }
    this.setPartOpacityByIndex(index, opacity);
  }
  /**
   * パーツの不透明度の取得(index)
   * @param partIndex パーツのインデックス
   * @return パーツの不透明度
   */
  getPartOpacityByIndex(partIndex) {
    if (this._notExistPartOpacities.isExist(partIndex)) {
      return this._notExistPartOpacities.getValue(partIndex);
    }
    CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
    return this._partOpacities[partIndex];
  }
  /**
   * パーツの不透明度の取得(id)
   * @param partId パーツのＩｄ
   * @return パーツの不透明度
   */
  getPartOpacityById(partId) {
    const index = this.getPartIndex(partId);
    if (index < 0) {
      return 0;
    }
    return this.getPartOpacityByIndex(index);
  }
  /**
   * パラメータのインデックスの取得
   * @param パラメータID
   * @return パラメータのインデックス
   */
  getParameterIndex(parameterId) {
    let parameterIndex;
    const idCount = this._model.parameters.count;
    for (parameterIndex = 0; parameterIndex < idCount; ++parameterIndex) {
      if (parameterId != this._parameterIds.at(parameterIndex)) {
        continue;
      }
      return parameterIndex;
    }
    if (this._notExistParameterId.isExist(parameterId)) {
      return this._notExistParameterId.getValue(parameterId);
    }
    parameterIndex = this._model.parameters.count + this._notExistParameterId.getSize();
    this._notExistParameterId.setValue(parameterId, parameterIndex);
    this._notExistParameterValues.appendKey(parameterIndex);
    return parameterIndex;
  }
  /**
   * パラメータの個数の取得
   * @return パラメータの個数
   */
  getParameterCount() {
    return this._model.parameters.count;
  }
  /**
   * パラメータの種類の取得
   * @param parameterIndex パラメータのインデックス
   * @return csmParameterType_Normal -> 通常のパラメータ
   *          csmParameterType_BlendShape -> ブレンドシェイプパラメータ
   */
  getParameterType(parameterIndex) {
    return this._model.parameters.types[parameterIndex];
  }
  /**
   * パラメータの最大値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータの最大値
   */
  getParameterMaximumValue(parameterIndex) {
    return this._model.parameters.maximumValues[parameterIndex];
  }
  /**
   * パラメータの最小値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータの最小値
   */
  getParameterMinimumValue(parameterIndex) {
    return this._model.parameters.minimumValues[parameterIndex];
  }
  /**
   * パラメータのデフォルト値の取得
   * @param parameterIndex パラメータのインデックス
   * @return パラメータのデフォルト値
   */
  getParameterDefaultValue(parameterIndex) {
    return this._model.parameters.defaultValues[parameterIndex];
  }
  /**
   * 指定したパラメータindexのIDを取得
   *
   * @param parameterIndex パラメータのインデックス
   * @returns パラメータID
   */
  getParameterId(parameterIndex) {
    return CubismFramework.getIdManager().getId(
      this._model.parameters.ids[parameterIndex]
    );
  }
  /**
   * パラメータの値の取得
   * @param parameterIndex    パラメータのインデックス
   * @return パラメータの値
   */
  getParameterValueByIndex(parameterIndex) {
    if (this._notExistParameterValues.isExist(parameterIndex)) {
      return this._notExistParameterValues.getValue(parameterIndex);
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    return this._parameterValues[parameterIndex];
  }
  /**
   * パラメータの値の取得
   * @param parameterId    パラメータのID
   * @return パラメータの値
   */
  getParameterValueById(parameterId) {
    const parameterIndex = this.getParameterIndex(parameterId);
    return this.getParameterValueByIndex(parameterIndex);
  }
  /**
   * パラメータの値の設定
   * @param parameterIndex パラメータのインデックス
   * @param value パラメータの値
   * @param weight 重み
   */
  setParameterValueByIndex(parameterIndex, value, weight = 1) {
    if (this._notExistParameterValues.isExist(parameterIndex)) {
      this._notExistParameterValues.setValue(
        parameterIndex,
        weight == 1 ? value : this._notExistParameterValues.getValue(parameterIndex) * (1 - weight) + value * weight
      );
      return;
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    if (this.isRepeat(parameterIndex)) {
      value = this.getParameterRepeatValue(parameterIndex, value);
    } else {
      value = this.getParameterClampValue(parameterIndex, value);
    }
    this._parameterValues[parameterIndex] = weight == 1 ? value : this._parameterValues[parameterIndex] = this._parameterValues[parameterIndex] * (1 - weight) + value * weight;
  }
  /**
   * パラメータの値の設定
   * @param parameterId パラメータのID
   * @param value パラメータの値
   * @param weight 重み
   */
  setParameterValueById(parameterId, value, weight = 1) {
    const index = this.getParameterIndex(parameterId);
    this.setParameterValueByIndex(index, value, weight);
  }
  /**
   * パラメータの値の加算(index)
   * @param parameterIndex パラメータインデックス
   * @param value 加算する値
   * @param weight 重み
   */
  addParameterValueByIndex(parameterIndex, value, weight = 1) {
    this.setParameterValueByIndex(
      parameterIndex,
      this.getParameterValueByIndex(parameterIndex) + value * weight
    );
  }
  /**
   * パラメータの値の加算(id)
   * @param parameterId パラメータＩＤ
   * @param value 加算する値
   * @param weight 重み
   */
  addParameterValueById(parameterId, value, weight = 1) {
    const index = this.getParameterIndex(parameterId);
    this.addParameterValueByIndex(index, value, weight);
  }
  /**
   * Gets whether the parameter has the repeat setting.
   *
   * @param parameterIndex Parameter index
   *
   * @return true if it is set, otherwise returns false.
   */
  isRepeat(parameterIndex) {
    if (this._notExistParameterValues.isExist(parameterIndex)) {
      return false;
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    let isRepeat;
    if (this._isOverriddenParameterRepeat || this._userParameterRepeatDataList.at(parameterIndex).isOverridden) {
      isRepeat = this._userParameterRepeatDataList.at(
        parameterIndex
      ).isParameterRepeated;
    } else {
      isRepeat = this._model.parameters.repeats[parameterIndex] != 0;
    }
    return isRepeat;
  }
  /**
   * Returns the calculated result ensuring the value falls within the parameter's range.
   *
   * @param parameterIndex Parameter index
   * @param value Parameter value
   *
   * @return a value that falls within the parameter’s range. If the parameter does not exist, returns it as is.
   */
  getParameterRepeatValue(parameterIndex, value) {
    if (this._notExistParameterValues.isExist(parameterIndex)) {
      return value;
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    const maxValue = this._model.parameters.maximumValues[parameterIndex];
    const minValue = this._model.parameters.minimumValues[parameterIndex];
    const valueSize = maxValue - minValue;
    if (maxValue < value) {
      const overValue = CubismMath.mod(value - maxValue, valueSize);
      if (!Number.isNaN(overValue)) {
        value = minValue + overValue;
      } else {
        value = maxValue;
      }
    }
    if (value < minValue) {
      const overValue = CubismMath.mod(minValue - value, valueSize);
      if (!Number.isNaN(overValue)) {
        value = maxValue - overValue;
      } else {
        value = minValue;
      }
    }
    return value;
  }
  /**
   * Returns the result of clamping the value to ensure it falls within the parameter's range.
   *
   * @param parameterIndex Parameter index
   * @param value Parameter value
   *
   * @return the clamped value. If the parameter does not exist, returns it as is.
   */
  getParameterClampValue(parameterIndex, value) {
    if (this._notExistParameterValues.isExist(parameterIndex)) {
      return value;
    }
    CSM_ASSERT(
      0 <= parameterIndex && parameterIndex < this.getParameterCount()
    );
    const maxValue = this._model.parameters.maximumValues[parameterIndex];
    const minValue = this._model.parameters.minimumValues[parameterIndex];
    return CubismMath.clamp(value, minValue, maxValue);
  }
  /**
   * Returns the repeat of the parameter.
   *
   * @param parameterIndex Parameter index
   *
   * @return the raw data parameter repeat from the Cubism Core.
   */
  getParameterRepeats(parameterIndex) {
    return this._model.parameters.repeats[parameterIndex] != 0;
  }
  /**
   * パラメータの値の乗算
   * @param parameterId パラメータのID
   * @param value 乗算する値
   * @param weight 重み
   */
  multiplyParameterValueById(parameterId, value, weight = 1) {
    const index = this.getParameterIndex(parameterId);
    this.multiplyParameterValueByIndex(index, value, weight);
  }
  /**
   * パラメータの値の乗算
   * @param parameterIndex パラメータのインデックス
   * @param value 乗算する値
   * @param weight 重み
   */
  multiplyParameterValueByIndex(parameterIndex, value, weight = 1) {
    this.setParameterValueByIndex(
      parameterIndex,
      this.getParameterValueByIndex(parameterIndex) * (1 + (value - 1) * weight)
    );
  }
  /**
   * Drawableのインデックスの取得
   * @param drawableId DrawableのID
   * @return Drawableのインデックス
   */
  getDrawableIndex(drawableId) {
    const drawableCount = this._model.drawables.count;
    for (let drawableIndex = 0; drawableIndex < drawableCount; ++drawableIndex) {
      if (this._drawableIds.at(drawableIndex) == drawableId) {
        return drawableIndex;
      }
    }
    return -1;
  }
  /**
   * Drawableの個数の取得
   * @return drawableの個数
   */
  getDrawableCount() {
    const drawableCount = this._model.drawables.count;
    return drawableCount;
  }
  /**
   * DrawableのIDを取得する
   * @param drawableIndex Drawableのインデックス
   * @return drawableのID
   */
  getDrawableId(drawableIndex) {
    const parameterIds = this._model.drawables.ids;
    return CubismFramework.getIdManager().getId(parameterIds[drawableIndex]);
  }
  /**
   * Drawableの描画順リストの取得
   * @return Drawableの描画順リスト
   */
  getDrawableRenderOrders() {
    const renderOrders = this._model.drawables.renderOrders;
    return renderOrders;
  }
  /**
   * @deprecated
   * 関数名が誤っていたため、代替となる getDrawableTextureIndex を追加し、この関数は非推奨となりました。
   *
   * Drawableのテクスチャインデックスリストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのテクスチャインデックスリスト
   */
  getDrawableTextureIndices(drawableIndex) {
    return this.getDrawableTextureIndex(drawableIndex);
  }
  /**
   * Drawableのテクスチャインデックスの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのテクスチャインデックス
   */
  getDrawableTextureIndex(drawableIndex) {
    const textureIndices = this._model.drawables.textureIndices;
    return textureIndices[drawableIndex];
  }
  /**
   * DrawableのVertexPositionsの変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの頂点情報が変化したかを取得する。
   *
   * @param   drawableIndex   Drawableのインデックス
   * @retval  true    Drawableの頂点情報が直近のCubismModel.update関数で変化した
   * @retval  false   Drawableの頂点情報が直近のCubismModel.update関数で変化していない
   */
  getDrawableDynamicFlagVertexPositionsDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasVertexPositionsDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * Drawableの頂点インデックスの個数の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点インデックスの個数
   */
  getDrawableVertexIndexCount(drawableIndex) {
    const indexCounts = this._model.drawables.indexCounts;
    return indexCounts[drawableIndex];
  }
  /**
   * Drawableの頂点の個数の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点の個数
   */
  getDrawableVertexCount(drawableIndex) {
    const vertexCounts = this._model.drawables.vertexCounts;
    return vertexCounts[drawableIndex];
  }
  /**
   * Drawableの頂点リストの取得
   * @param drawableIndex drawableのインデックス
   * @return drawableの頂点リスト
   */
  getDrawableVertices(drawableIndex) {
    return this.getDrawableVertexPositions(drawableIndex);
  }
  /**
   * Drawableの頂点インデックスリストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点インデックスリスト
   */
  getDrawableVertexIndices(drawableIndex) {
    const indicesArray = this._model.drawables.indices;
    return indicesArray[drawableIndex];
  }
  /**
   * Drawableの頂点リストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点リスト
   */
  getDrawableVertexPositions(drawableIndex) {
    const verticesArray = this._model.drawables.vertexPositions;
    return verticesArray[drawableIndex];
  }
  /**
   * Drawableの頂点のUVリストの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの頂点UVリスト
   */
  getDrawableVertexUvs(drawableIndex) {
    const uvsArray = this._model.drawables.vertexUvs;
    return uvsArray[drawableIndex];
  }
  /**
   * Drawableの不透明度の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの不透明度
   */
  getDrawableOpacity(drawableIndex) {
    const opacities = this._model.drawables.opacities;
    return opacities[drawableIndex];
  }
  /**
   * Drawableの乗算色の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの乗算色(RGBA)
   * スクリーン色はRGBAで取得されるが、Aは必ず0
   */
  getDrawableMultiplyColor(drawableIndex) {
    const multiplyColors = this._model.drawables.multiplyColors;
    const index = drawableIndex * 4;
    const multiplyColor = new CubismTextureColor();
    multiplyColor.r = multiplyColors[index];
    multiplyColor.g = multiplyColors[index + 1];
    multiplyColor.b = multiplyColors[index + 2];
    multiplyColor.a = multiplyColors[index + 3];
    return multiplyColor;
  }
  /**
   * Drawableのスクリーン色の取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのスクリーン色(RGBA)
   * スクリーン色はRGBAで取得されるが、Aは必ず0
   */
  getDrawableScreenColor(drawableIndex) {
    const screenColors = this._model.drawables.screenColors;
    const index = drawableIndex * 4;
    const screenColor = new CubismTextureColor();
    screenColor.r = screenColors[index];
    screenColor.g = screenColors[index + 1];
    screenColor.b = screenColors[index + 2];
    screenColor.a = screenColors[index + 3];
    return screenColor;
  }
  /**
   * Drawableの親パーツのインデックスの取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableの親パーツのインデックス
   */
  getDrawableParentPartIndex(drawableIndex) {
    return this._model.drawables.parentPartIndices[drawableIndex];
  }
  /**
   * Drawableのブレンドモードを取得
   * @param drawableIndex Drawableのインデックス
   * @return drawableのブレンドモード
   */
  getDrawableBlendMode(drawableIndex) {
    const constantFlags = this._model.drawables.constantFlags;
    return Live2DCubismCore.Utils.hasBlendAdditiveBit(
      constantFlags[drawableIndex]
    ) ? CubismBlendMode.CubismBlendMode_Additive : Live2DCubismCore.Utils.hasBlendMultiplicativeBit(
      constantFlags[drawableIndex]
    ) ? CubismBlendMode.CubismBlendMode_Multiplicative : CubismBlendMode.CubismBlendMode_Normal;
  }
  /**
   * Drawableのマスクの反転使用の取得
   *
   * Drawableのマスク使用時の反転設定を取得する。
   * マスクを使用しない場合は無視される。
   *
   * @param drawableIndex Drawableのインデックス
   * @return Drawableの反転設定
   */
  getDrawableInvertedMaskBit(drawableIndex) {
    const constantFlags = this._model.drawables.constantFlags;
    return Live2DCubismCore.Utils.hasIsInvertedMaskBit(
      constantFlags[drawableIndex]
    );
  }
  /**
   * Drawableのクリッピングマスクリストの取得
   * @return Drawableのクリッピングマスクリスト
   */
  getDrawableMasks() {
    const masks = this._model.drawables.masks;
    return masks;
  }
  /**
   * Drawableのクリッピングマスクの個数リストの取得
   * @return Drawableのクリッピングマスクの個数リスト
   */
  getDrawableMaskCounts() {
    const maskCounts = this._model.drawables.maskCounts;
    return maskCounts;
  }
  /**
   * クリッピングマスクの使用状態
   *
   * @return true クリッピングマスクを使用している
   * @return false クリッピングマスクを使用していない
   */
  isUsingMasking() {
    for (let d = 0; d < this._model.drawables.count; ++d) {
      if (this._model.drawables.maskCounts[d] <= 0) {
        continue;
      }
      return true;
    }
    return false;
  }
  /**
   * Drawableの表示情報を取得する
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableが表示
   * @return false Drawableが非表示
   */
  getDrawableDynamicFlagIsVisible(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasIsVisibleBit(dynamicFlags[drawableIndex]);
  }
  /**
   * DrawableのDrawOrderの変化情報の取得
   *
   * 直近のCubismModel.update関数でdrawableのdrawOrderが変化したかを取得する。
   * drawOrderはartMesh上で指定する0から1000の情報
   * @param drawableIndex drawableのインデックス
   * @return true drawableの不透明度が直近のCubismModel.update関数で変化した
   * @return false drawableの不透明度が直近のCubismModel.update関数で変化している
   */
  getDrawableDynamicFlagVisibilityDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasVisibilityDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * Drawableの不透明度の変化情報の取得
   *
   * 直近のCubismModel.update関数でdrawableの不透明度が変化したかを取得する。
   *
   * @param drawableIndex drawableのインデックス
   * @return true Drawableの不透明度が直近のCubismModel.update関数で変化した
   * @return false Drawableの不透明度が直近のCubismModel.update関数で変化してない
   */
  getDrawableDynamicFlagOpacityDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasOpacityDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * Drawableの描画順序の変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの描画の順序が変化したかを取得する。
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableの描画の順序が直近のCubismModel.update関数で変化した
   * @return false Drawableの描画の順序が直近のCubismModel.update関数で変化してない
   */
  getDrawableDynamicFlagRenderOrderDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasRenderOrderDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * Drawableの乗算色・スクリーン色の変化情報の取得
   *
   * 直近のCubismModel.update関数でDrawableの乗算色・スクリーン色が変化したかを取得する。
   *
   * @param drawableIndex Drawableのインデックス
   * @return true Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化した
   * @return false Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化してない
   */
  getDrawableDynamicFlagBlendColorDidChange(drawableIndex) {
    const dynamicFlags = this._model.drawables.dynamicFlags;
    return Live2DCubismCore.Utils.hasBlendColorDidChangeBit(
      dynamicFlags[drawableIndex]
    );
  }
  /**
   * 保存されたパラメータの読み込み
   */
  loadParameters() {
    let parameterCount = this._model.parameters.count;
    const savedParameterCount = this._savedParameters.getSize();
    if (parameterCount > savedParameterCount) {
      parameterCount = savedParameterCount;
    }
    for (let i = 0; i < parameterCount; ++i) {
      this._parameterValues[i] = this._savedParameters.at(i);
    }
  }
  /**
   * 初期化する
   */
  initialize() {
    CSM_ASSERT(this._model);
    this._parameterValues = this._model.parameters.values;
    this._partOpacities = this._model.parts.opacities;
    this._parameterMaximumValues = this._model.parameters.maximumValues;
    this._parameterMinimumValues = this._model.parameters.minimumValues;
    {
      const parameterIds = this._model.parameters.ids;
      const parameterCount = this._model.parameters.count;
      this._parameterIds.prepareCapacity(parameterCount);
      this._userParameterRepeatDataList.prepareCapacity(parameterCount);
      for (let i = 0; i < parameterCount; ++i) {
        this._parameterIds.pushBack(
          CubismFramework.getIdManager().getId(parameterIds[i])
        );
        this._userParameterRepeatDataList.pushBack(
          new ParameterRepeatData(false, false)
        );
      }
    }
    const partCount = this._model.parts.count;
    {
      const partIds = this._model.parts.ids;
      this._partIds.prepareCapacity(partCount);
      for (let i = 0; i < partCount; ++i) {
        this._partIds.pushBack(
          CubismFramework.getIdManager().getId(partIds[i])
        );
      }
      this._userPartMultiplyColors.prepareCapacity(partCount);
      this._userPartScreenColors.prepareCapacity(partCount);
      this._partChildDrawables.prepareCapacity(partCount);
    }
    {
      const drawableIds = this._model.drawables.ids;
      const drawableCount = this._model.drawables.count;
      this._userMultiplyColors.prepareCapacity(drawableCount);
      this._userScreenColors.prepareCapacity(drawableCount);
      this._userCullings.prepareCapacity(drawableCount);
      const userCulling = new DrawableCullingData(
        false,
        false
      );
      {
        for (let i = 0; i < partCount; ++i) {
          const multiplyColor = new CubismTextureColor(
            1,
            1,
            1,
            1
          );
          const screenColor = new CubismTextureColor(
            0,
            0,
            0,
            1
          );
          const userMultiplyColor = new PartColorData(
            false,
            multiplyColor
          );
          const userScreenColor = new PartColorData(
            false,
            screenColor
          );
          this._userPartMultiplyColors.pushBack(userMultiplyColor);
          this._userPartScreenColors.pushBack(userScreenColor);
          this._partChildDrawables.pushBack(new csmVector());
          this._partChildDrawables.at(i).prepareCapacity(drawableCount);
        }
      }
      {
        for (let i = 0; i < drawableCount; ++i) {
          const multiplyColor = new CubismTextureColor(
            1,
            1,
            1,
            1
          );
          const screenColor = new CubismTextureColor(
            0,
            0,
            0,
            1
          );
          const userMultiplyColor = new DrawableColorData(
            false,
            multiplyColor
          );
          const userScreenColor = new DrawableColorData(
            false,
            screenColor
          );
          this._drawableIds.pushBack(
            CubismFramework.getIdManager().getId(drawableIds[i])
          );
          this._userMultiplyColors.pushBack(userMultiplyColor);
          this._userScreenColors.pushBack(userScreenColor);
          this._userCullings.pushBack(userCulling);
          const parentIndex = this.getDrawableParentPartIndex(i);
          if (parentIndex >= 0) {
            this._partChildDrawables.at(parentIndex).pushBack(i);
          }
        }
      }
    }
  }
  /**
   * コンストラクタ
   * @param model モデル
   */
  constructor(model) {
    this._model = model;
    this._parameterValues = null;
    this._parameterMaximumValues = null;
    this._parameterMinimumValues = null;
    this._partOpacities = null;
    this._savedParameters = new csmVector();
    this._parameterIds = new csmVector();
    this._drawableIds = new csmVector();
    this._partIds = new csmVector();
    this._isOverriddenParameterRepeat = true;
    this._isOverriddenModelMultiplyColors = false;
    this._isOverriddenModelScreenColors = false;
    this._isOverriddenCullings = false;
    this._modelOpacity = 1;
    this._userParameterRepeatDataList = new csmVector();
    this._userMultiplyColors = new csmVector();
    this._userScreenColors = new csmVector();
    this._userCullings = new csmVector();
    this._userPartMultiplyColors = new csmVector();
    this._userPartScreenColors = new csmVector();
    this._partChildDrawables = new csmVector();
    this._notExistPartId = new csmMap();
    this._notExistParameterId = new csmMap();
    this._notExistParameterValues = new csmMap();
    this._notExistPartOpacities = new csmMap();
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this._model.release();
    this._model = null;
  }
  // カリング設定の配列
}
var Live2DCubismFramework$4;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismModel = CubismModel;
})(Live2DCubismFramework$4 || (Live2DCubismFramework$4 = {}));
class CubismMoc {
  /**
   * Mocデータの作成
   */
  static create(mocBytes, shouldCheckMocConsistency) {
    let cubismMoc = null;
    if (shouldCheckMocConsistency) {
      const consistency = this.hasMocConsistency(mocBytes);
      if (!consistency) {
        CubismLogError(`Inconsistent MOC3.`);
        return cubismMoc;
      }
    }
    const moc = Live2DCubismCore.Moc.fromArrayBuffer(mocBytes);
    if (moc) {
      cubismMoc = new CubismMoc(moc);
      cubismMoc._mocVersion = Live2DCubismCore.Version.csmGetMocVersion(
        moc,
        mocBytes
      );
    }
    return cubismMoc;
  }
  /**
   * Mocデータを削除
   *
   * Mocデータを削除する
   */
  static delete(moc) {
    moc._moc._release();
    moc._moc = null;
    moc = null;
  }
  /**
   * モデルを作成する
   *
   * @return Mocデータから作成されたモデル
   */
  createModel() {
    let cubismModel = null;
    const model = Live2DCubismCore.Model.fromMoc(
      this._moc
    );
    if (model) {
      cubismModel = new CubismModel(model);
      cubismModel.initialize();
      ++this._modelCount;
    }
    return cubismModel;
  }
  /**
   * モデルを削除する
   */
  deleteModel(model) {
    if (model != null) {
      model.release();
      model = null;
      --this._modelCount;
    }
  }
  /**
   * コンストラクタ
   */
  constructor(moc) {
    this._moc = moc;
    this._modelCount = 0;
    this._mocVersion = 0;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    CSM_ASSERT(this._modelCount == 0);
    this._moc._release();
    this._moc = null;
  }
  /**
   * 最新の.moc3 Versionを取得
   */
  getLatestMocVersion() {
    return Live2DCubismCore.Version.csmGetLatestMocVersion();
  }
  /**
   * 読み込んだモデルの.moc3 Versionを取得
   */
  getMocVersion() {
    return this._mocVersion;
  }
  /**
   * .moc3 の整合性を検証する
   */
  static hasMocConsistency(mocBytes) {
    const isConsistent = Live2DCubismCore.Moc.prototype.hasMocConsistency(mocBytes);
    return isConsistent === 1 ? true : false;
  }
  // 読み込んだモデルの.moc3 Version
}
var Live2DCubismFramework$3;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismMoc = CubismMoc;
})(Live2DCubismFramework$3 || (Live2DCubismFramework$3 = {}));
var CubismPhysicsTargetType = /* @__PURE__ */ ((CubismPhysicsTargetType2) => {
  CubismPhysicsTargetType2[CubismPhysicsTargetType2["CubismPhysicsTargetType_Parameter"] = 0] = "CubismPhysicsTargetType_Parameter";
  return CubismPhysicsTargetType2;
})(CubismPhysicsTargetType || {});
var CubismPhysicsSource = /* @__PURE__ */ ((CubismPhysicsSource2) => {
  CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_X"] = 0] = "CubismPhysicsSource_X";
  CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_Y"] = 1] = "CubismPhysicsSource_Y";
  CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_Angle"] = 2] = "CubismPhysicsSource_Angle";
  return CubismPhysicsSource2;
})(CubismPhysicsSource || {});
class PhysicsJsonEffectiveForces {
  constructor() {
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
  }
  // 風
}
class CubismPhysicsParameter {
  // 適用先の種類
}
class CubismPhysicsNormalization {
  // デフォルト値
}
class CubismPhysicsParticle {
  constructor() {
    this.initialPosition = new CubismVector2(0, 0);
    this.position = new CubismVector2(0, 0);
    this.lastPosition = new CubismVector2(0, 0);
    this.lastGravity = new CubismVector2(0, 0);
    this.force = new CubismVector2(0, 0);
    this.velocity = new CubismVector2(0, 0);
  }
  // 現在の速度
}
class CubismPhysicsSubRig {
  constructor() {
    this.normalizationPosition = new CubismPhysicsNormalization();
    this.normalizationAngle = new CubismPhysicsNormalization();
  }
  // 正規化された角度
}
class CubismPhysicsInput {
  constructor() {
    this.source = new CubismPhysicsParameter();
  }
  // 正規化されたパラメータ値の取得関数
}
class CubismPhysicsOutput {
  constructor() {
    this.destination = new CubismPhysicsParameter();
    this.translationScale = new CubismVector2(0, 0);
  }
  // 物理演算のスケール値の取得関数
}
class CubismPhysicsRig {
  constructor() {
    this.settings = new csmVector();
    this.inputs = new csmVector();
    this.outputs = new csmVector();
    this.particles = new csmVector();
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
    this.fps = 0;
  }
  //物理演算動作FPS
}
var Live2DCubismFramework$2;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismPhysicsInput = CubismPhysicsInput;
  Live2DCubismFramework2.CubismPhysicsNormalization = CubismPhysicsNormalization;
  Live2DCubismFramework2.CubismPhysicsOutput = CubismPhysicsOutput;
  Live2DCubismFramework2.CubismPhysicsParameter = CubismPhysicsParameter;
  Live2DCubismFramework2.CubismPhysicsParticle = CubismPhysicsParticle;
  Live2DCubismFramework2.CubismPhysicsRig = CubismPhysicsRig;
  Live2DCubismFramework2.CubismPhysicsSource = CubismPhysicsSource;
  Live2DCubismFramework2.CubismPhysicsSubRig = CubismPhysicsSubRig;
  Live2DCubismFramework2.CubismPhysicsTargetType = CubismPhysicsTargetType;
  Live2DCubismFramework2.PhysicsJsonEffectiveForces = PhysicsJsonEffectiveForces;
})(Live2DCubismFramework$2 || (Live2DCubismFramework$2 = {}));
const Position = "Position";
const X = "X";
const Y = "Y";
const Angle = "Angle";
const Type = "Type";
const Id = "Id";
const Meta = "Meta";
const EffectiveForces = "EffectiveForces";
const TotalInputCount = "TotalInputCount";
const TotalOutputCount = "TotalOutputCount";
const PhysicsSettingCount = "PhysicsSettingCount";
const Gravity = "Gravity";
const Wind = "Wind";
const VertexCount = "VertexCount";
const Fps = "Fps";
const PhysicsSettings = "PhysicsSettings";
const Normalization = "Normalization";
const Minimum = "Minimum";
const Maximum = "Maximum";
const Default = "Default";
const Reflect2 = "Reflect";
const Weight = "Weight";
const Input = "Input";
const Source = "Source";
const Output = "Output";
const Scale = "Scale";
const VertexIndex = "VertexIndex";
const Destination = "Destination";
const Vertices = "Vertices";
const Mobility = "Mobility";
const Delay = "Delay";
const Radius = "Radius";
const Acceleration = "Acceleration";
class CubismPhysicsJson {
  /**
   * コンストラクタ
   * @param buffer physics3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   */
  constructor(buffer, size) {
    this._json = CubismJson.create(buffer, size);
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    CubismJson.delete(this._json);
  }
  /**
   * 重力の取得
   * @return 重力
   */
  getGravity() {
    const ret = new CubismVector2(0, 0);
    ret.x = this._json.getRoot().getValueByString(Meta).getValueByString(EffectiveForces).getValueByString(Gravity).getValueByString(X).toFloat();
    ret.y = this._json.getRoot().getValueByString(Meta).getValueByString(EffectiveForces).getValueByString(Gravity).getValueByString(Y).toFloat();
    return ret;
  }
  /**
   * 風の取得
   * @return 風
   */
  getWind() {
    const ret = new CubismVector2(0, 0);
    ret.x = this._json.getRoot().getValueByString(Meta).getValueByString(EffectiveForces).getValueByString(Wind).getValueByString(X).toFloat();
    ret.y = this._json.getRoot().getValueByString(Meta).getValueByString(EffectiveForces).getValueByString(Wind).getValueByString(Y).toFloat();
    return ret;
  }
  /**
   * 物理演算設定FPSの取得
   * @return 物理演算設定FPS
   */
  getFps() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(Fps).toFloat(0);
  }
  /**
   * 物理店の管理の個数の取得
   * @return 物理店の管理の個数
   */
  getSubRigCount() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(PhysicsSettingCount).toInt();
  }
  /**
   * 入力の総合計の取得
   * @return 入力の総合計
   */
  getTotalInputCount() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(TotalInputCount).toInt();
  }
  /**
   * 出力の総合計の取得
   * @return 出力の総合計
   */
  getTotalOutputCount() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(TotalOutputCount).toInt();
  }
  /**
   * 物理点の個数の取得
   * @return 物理点の個数
   */
  getVertexCount() {
    return this._json.getRoot().getValueByString(Meta).getValueByString(VertexCount).toInt();
  }
  /**
   * 正規化された位置の最小値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された位置の最小値
   */
  getNormalizationPositionMinimumValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Minimum).toFloat();
  }
  /**
   * 正規化された位置の最大値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された位置の最大値
   */
  getNormalizationPositionMaximumValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Maximum).toFloat();
  }
  /**
   * 正規化された位置のデフォルト値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された位置のデフォルト値
   */
  getNormalizationPositionDefaultValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Default).toFloat();
  }
  /**
   * 正規化された角度の最小値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された角度の最小値
   */
  getNormalizationAngleMinimumValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Minimum).toFloat();
  }
  /**
   * 正規化された角度の最大値の取得
   * @param physicsSettingIndex
   * @return 正規化された角度の最大値
   */
  getNormalizationAngleMaximumValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Maximum).toFloat();
  }
  /**
   * 正規化された角度のデフォルト値の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 正規化された角度のデフォルト値
   */
  getNormalizationAngleDefaultValue(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Default).toFloat();
  }
  /**
   * 入力の個数の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 入力の個数
   */
  getInputCount(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getVector().getSize();
  }
  /**
   * 入力の重みの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param inputIndex 入力のインデックス
   * @return 入力の重み
   */
  getInputWeight(physicsSettingIndex, inputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Weight).toFloat();
  }
  /**
   * 入力の反転の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param inputIndex 入力のインデックス
   * @return 入力の反転
   */
  getInputReflect(physicsSettingIndex, inputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Reflect2).toBoolean();
  }
  /**
   * 入力の種類の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param inputIndex 入力のインデックス
   * @return 入力の種類
   */
  getInputType(physicsSettingIndex, inputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Type).getRawString();
  }
  /**
   * 入力元のIDの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param inputIndex 入力のインデックス
   * @return 入力元のID
   */
  getInputSourceId(physicsSettingIndex, inputIndex) {
    return CubismFramework.getIdManager().getId(
      this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Source).getValueByString(Id).getRawString()
    );
  }
  /**
   * 出力の個数の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @return 出力の個数
   */
  getOutputCount(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getVector().getSize();
  }
  /**
   * 出力の物理点のインデックスの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の物理点のインデックス
   */
  getOutputVertexIndex(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(VertexIndex).toInt();
  }
  /**
   * 出力の角度のスケールを取得する
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の角度のスケール
   */
  getOutputAngleScale(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Scale).toFloat();
  }
  /**
   * 出力の重みの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の重み
   */
  getOutputWeight(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Weight).toFloat();
  }
  /**
   * 出力先のIDの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力先のID
   */
  getOutputDestinationId(physicsSettingIndex, outputIndex) {
    return CubismFramework.getIdManager().getId(
      this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Destination).getValueByString(Id).getRawString()
    );
  }
  /**
   * 出力の種類の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の種類
   */
  getOutputType(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Type).getRawString();
  }
  /**
   * 出力の反転の取得
   * @param physicsSettingIndex 物理演算のインデックス
   * @param outputIndex 出力のインデックス
   * @return 出力の反転
   */
  getOutputReflect(physicsSettingIndex, outputIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Reflect2).toBoolean();
  }
  /**
   * 物理点の個数の取得
   * @param physicsSettingIndex 物理演算男設定のインデックス
   * @return 物理点の個数
   */
  getParticleCount(physicsSettingIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getVector().getSize();
  }
  /**
   * 物理点の動きやすさの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param vertexIndex 物理点のインデックス
   * @return 物理点の動きやすさ
   */
  getParticleMobility(physicsSettingIndex, vertexIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Mobility).toFloat();
  }
  /**
   * 物理点の遅れの取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param vertexIndex 物理点のインデックス
   * @return 物理点の遅れ
   */
  getParticleDelay(physicsSettingIndex, vertexIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Delay).toFloat();
  }
  /**
   * 物理点の加速度の取得
   * @param physicsSettingIndex 物理演算の設定
   * @param vertexIndex 物理点のインデックス
   * @return 物理点の加速度
   */
  getParticleAcceleration(physicsSettingIndex, vertexIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Acceleration).toFloat();
  }
  /**
   * 物理点の距離の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param vertexIndex 物理点のインデックス
   * @return 物理点の距離
   */
  getParticleRadius(physicsSettingIndex, vertexIndex) {
    return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Radius).toFloat();
  }
  /**
   * 物理点の位置の取得
   * @param physicsSettingIndex 物理演算の設定のインデックス
   * @param vertexInde 物理点のインデックス
   * @return 物理点の位置
   */
  getParticlePosition(physicsSettingIndex, vertexIndex) {
    const ret = new CubismVector2(0, 0);
    ret.x = this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Position).getValueByString(X).toFloat();
    ret.y = this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Position).getValueByString(Y).toFloat();
    return ret;
  }
  // physics3.jsonデータ
}
var Live2DCubismFramework$1;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismPhysicsJson = CubismPhysicsJson;
})(Live2DCubismFramework$1 || (Live2DCubismFramework$1 = {}));
const PhysicsTypeTagX = "X";
const PhysicsTypeTagY = "Y";
const PhysicsTypeTagAngle = "Angle";
const AirResistance = 5;
const MaximumWeight = 100;
const MovementThreshold = 1e-3;
const MaxDeltaTime = 5;
class CubismPhysics {
  /**
   * インスタンスの作成
   * @param buffer    physics3.jsonが読み込まれているバッファ
   * @param size      バッファのサイズ
   * @return 作成されたインスタンス
   */
  static create(buffer, size) {
    const ret = new CubismPhysics();
    ret.parse(buffer, size);
    ret._physicsRig.gravity.y = 0;
    return ret;
  }
  /**
   * インスタンスを破棄する
   * @param physics 破棄するインスタンス
   */
  static delete(physics) {
    if (physics != null) {
      physics.release();
      physics = null;
    }
  }
  /**
   * physics3.jsonをパースする。
   * @param physicsJson physics3.jsonが読み込まれているバッファ
   * @param size バッファのサイズ
   */
  parse(physicsJson, size) {
    this._physicsRig = new CubismPhysicsRig();
    let json = new CubismPhysicsJson(physicsJson, size);
    this._physicsRig.gravity = json.getGravity();
    this._physicsRig.wind = json.getWind();
    this._physicsRig.subRigCount = json.getSubRigCount();
    this._physicsRig.fps = json.getFps();
    this._physicsRig.settings.updateSize(
      this._physicsRig.subRigCount,
      CubismPhysicsSubRig,
      true
    );
    this._physicsRig.inputs.updateSize(
      json.getTotalInputCount(),
      CubismPhysicsInput,
      true
    );
    this._physicsRig.outputs.updateSize(
      json.getTotalOutputCount(),
      CubismPhysicsOutput,
      true
    );
    this._physicsRig.particles.updateSize(
      json.getVertexCount(),
      CubismPhysicsParticle,
      true
    );
    this._currentRigOutputs.clear();
    this._previousRigOutputs.clear();
    let inputIndex = 0, outputIndex = 0, particleIndex = 0;
    for (let i = 0; i < this._physicsRig.settings.getSize(); ++i) {
      this._physicsRig.settings.at(i).normalizationPosition.minimum = json.getNormalizationPositionMinimumValue(i);
      this._physicsRig.settings.at(i).normalizationPosition.maximum = json.getNormalizationPositionMaximumValue(i);
      this._physicsRig.settings.at(i).normalizationPosition.defalut = json.getNormalizationPositionDefaultValue(i);
      this._physicsRig.settings.at(i).normalizationAngle.minimum = json.getNormalizationAngleMinimumValue(i);
      this._physicsRig.settings.at(i).normalizationAngle.maximum = json.getNormalizationAngleMaximumValue(i);
      this._physicsRig.settings.at(i).normalizationAngle.defalut = json.getNormalizationAngleDefaultValue(i);
      this._physicsRig.settings.at(i).inputCount = json.getInputCount(i);
      this._physicsRig.settings.at(i).baseInputIndex = inputIndex;
      for (let j = 0; j < this._physicsRig.settings.at(i).inputCount; ++j) {
        this._physicsRig.inputs.at(inputIndex + j).sourceParameterIndex = -1;
        this._physicsRig.inputs.at(inputIndex + j).weight = json.getInputWeight(
          i,
          j
        );
        this._physicsRig.inputs.at(inputIndex + j).reflect = json.getInputReflect(i, j);
        if (json.getInputType(i, j) == PhysicsTypeTagX) {
          this._physicsRig.inputs.at(inputIndex + j).type = CubismPhysicsSource.CubismPhysicsSource_X;
          this._physicsRig.inputs.at(
            inputIndex + j
          ).getNormalizedParameterValue = getInputTranslationXFromNormalizedParameterValue;
        } else if (json.getInputType(i, j) == PhysicsTypeTagY) {
          this._physicsRig.inputs.at(inputIndex + j).type = CubismPhysicsSource.CubismPhysicsSource_Y;
          this._physicsRig.inputs.at(
            inputIndex + j
          ).getNormalizedParameterValue = getInputTranslationYFromNormalizedParamterValue;
        } else if (json.getInputType(i, j) == PhysicsTypeTagAngle) {
          this._physicsRig.inputs.at(inputIndex + j).type = CubismPhysicsSource.CubismPhysicsSource_Angle;
          this._physicsRig.inputs.at(
            inputIndex + j
          ).getNormalizedParameterValue = getInputAngleFromNormalizedParameterValue;
        }
        this._physicsRig.inputs.at(inputIndex + j).source.targetType = CubismPhysicsTargetType.CubismPhysicsTargetType_Parameter;
        this._physicsRig.inputs.at(inputIndex + j).source.id = json.getInputSourceId(i, j);
      }
      inputIndex += this._physicsRig.settings.at(i).inputCount;
      this._physicsRig.settings.at(i).outputCount = json.getOutputCount(i);
      this._physicsRig.settings.at(i).baseOutputIndex = outputIndex;
      const currentRigOutput = new PhysicsOutput();
      currentRigOutput.outputs.resize(
        this._physicsRig.settings.at(i).outputCount
      );
      const previousRigOutput = new PhysicsOutput();
      previousRigOutput.outputs.resize(
        this._physicsRig.settings.at(i).outputCount
      );
      for (let j = 0; j < this._physicsRig.settings.at(i).outputCount; ++j) {
        currentRigOutput.outputs.set(j, 0);
        previousRigOutput.outputs.set(j, 0);
        this._physicsRig.outputs.at(outputIndex + j).destinationParameterIndex = -1;
        this._physicsRig.outputs.at(outputIndex + j).vertexIndex = json.getOutputVertexIndex(i, j);
        this._physicsRig.outputs.at(outputIndex + j).angleScale = json.getOutputAngleScale(i, j);
        this._physicsRig.outputs.at(outputIndex + j).weight = json.getOutputWeight(i, j);
        this._physicsRig.outputs.at(outputIndex + j).destination.targetType = CubismPhysicsTargetType.CubismPhysicsTargetType_Parameter;
        this._physicsRig.outputs.at(outputIndex + j).destination.id = json.getOutputDestinationId(i, j);
        if (json.getOutputType(i, j) == PhysicsTypeTagX) {
          this._physicsRig.outputs.at(outputIndex + j).type = CubismPhysicsSource.CubismPhysicsSource_X;
          this._physicsRig.outputs.at(outputIndex + j).getValue = getOutputTranslationX;
          this._physicsRig.outputs.at(outputIndex + j).getScale = getOutputScaleTranslationX;
        } else if (json.getOutputType(i, j) == PhysicsTypeTagY) {
          this._physicsRig.outputs.at(outputIndex + j).type = CubismPhysicsSource.CubismPhysicsSource_Y;
          this._physicsRig.outputs.at(outputIndex + j).getValue = getOutputTranslationY;
          this._physicsRig.outputs.at(outputIndex + j).getScale = getOutputScaleTranslationY;
        } else if (json.getOutputType(i, j) == PhysicsTypeTagAngle) {
          this._physicsRig.outputs.at(outputIndex + j).type = CubismPhysicsSource.CubismPhysicsSource_Angle;
          this._physicsRig.outputs.at(outputIndex + j).getValue = getOutputAngle;
          this._physicsRig.outputs.at(outputIndex + j).getScale = getOutputScaleAngle;
        }
        this._physicsRig.outputs.at(outputIndex + j).reflect = json.getOutputReflect(i, j);
      }
      this._currentRigOutputs.pushBack(currentRigOutput);
      this._previousRigOutputs.pushBack(previousRigOutput);
      outputIndex += this._physicsRig.settings.at(i).outputCount;
      this._physicsRig.settings.at(i).particleCount = json.getParticleCount(i);
      this._physicsRig.settings.at(i).baseParticleIndex = particleIndex;
      for (let j = 0; j < this._physicsRig.settings.at(i).particleCount; ++j) {
        this._physicsRig.particles.at(particleIndex + j).mobility = json.getParticleMobility(i, j);
        this._physicsRig.particles.at(particleIndex + j).delay = json.getParticleDelay(i, j);
        this._physicsRig.particles.at(particleIndex + j).acceleration = json.getParticleAcceleration(i, j);
        this._physicsRig.particles.at(particleIndex + j).radius = json.getParticleRadius(i, j);
        this._physicsRig.particles.at(particleIndex + j).position = json.getParticlePosition(i, j);
      }
      particleIndex += this._physicsRig.settings.at(i).particleCount;
    }
    this.initialize();
    json.release();
    json = void 0;
    json = null;
  }
  /**
   * 現在のパラメータ値で物理演算が安定化する状態を演算する。
   * @param model 物理演算の結果を適用するモデル
   */
  stabilization(model) {
    var _a, _b, _c, _d;
    let totalAngle;
    let weight;
    let radAngle;
    let outputValue;
    const totalTranslation = new CubismVector2();
    let currentSetting;
    let currentInputs;
    let currentOutputs;
    let currentParticles;
    const parameterValues = model.getModel().parameters.values;
    const parameterMaximumValues = model.getModel().parameters.maximumValues;
    const parameterMinimumValues = model.getModel().parameters.minimumValues;
    const parameterDefaultValues = model.getModel().parameters.defaultValues;
    if (((_b = (_a = this._parameterCaches) == null ? void 0 : _a.length) != null ? _b : 0) < model.getParameterCount()) {
      this._parameterCaches = new Float32Array(model.getParameterCount());
    }
    if (((_d = (_c = this._parameterInputCaches) == null ? void 0 : _c.length) != null ? _d : 0) < model.getParameterCount()) {
      this._parameterInputCaches = new Float32Array(model.getParameterCount());
    }
    for (let j = 0; j < model.getParameterCount(); ++j) {
      this._parameterCaches[j] = parameterValues[j];
      this._parameterInputCaches[j] = parameterValues[j];
    }
    for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
      totalAngle = { angle: 0 };
      totalTranslation.x = 0;
      totalTranslation.y = 0;
      currentSetting = this._physicsRig.settings.at(settingIndex);
      currentInputs = this._physicsRig.inputs.get(
        currentSetting.baseInputIndex
      );
      currentOutputs = this._physicsRig.outputs.get(
        currentSetting.baseOutputIndex
      );
      currentParticles = this._physicsRig.particles.get(
        currentSetting.baseParticleIndex
      );
      for (let i = 0; i < currentSetting.inputCount; ++i) {
        weight = currentInputs[i].weight / MaximumWeight;
        if (currentInputs[i].sourceParameterIndex == -1) {
          currentInputs[i].sourceParameterIndex = model.getParameterIndex(
            currentInputs[i].source.id
          );
        }
        currentInputs[i].getNormalizedParameterValue(
          totalTranslation,
          totalAngle,
          parameterValues[currentInputs[i].sourceParameterIndex],
          parameterMinimumValues[currentInputs[i].sourceParameterIndex],
          parameterMaximumValues[currentInputs[i].sourceParameterIndex],
          parameterDefaultValues[currentInputs[i].sourceParameterIndex],
          currentSetting.normalizationPosition,
          currentSetting.normalizationAngle,
          currentInputs[i].reflect,
          weight
        );
        this._parameterCaches[currentInputs[i].sourceParameterIndex] = parameterValues[currentInputs[i].sourceParameterIndex];
      }
      radAngle = CubismMath.degreesToRadian(-totalAngle.angle);
      totalTranslation.x = totalTranslation.x * CubismMath.cos(radAngle) - totalTranslation.y * CubismMath.sin(radAngle);
      totalTranslation.y = totalTranslation.x * CubismMath.sin(radAngle) + totalTranslation.y * CubismMath.cos(radAngle);
      updateParticlesForStabilization(
        currentParticles,
        currentSetting.particleCount,
        totalTranslation,
        totalAngle.angle,
        this._options.wind,
        MovementThreshold * currentSetting.normalizationPosition.maximum
      );
      for (let i = 0; i < currentSetting.outputCount; ++i) {
        const particleIndex = currentOutputs[i].vertexIndex;
        if (currentOutputs[i].destinationParameterIndex == -1) {
          currentOutputs[i].destinationParameterIndex = model.getParameterIndex(
            currentOutputs[i].destination.id
          );
        }
        if (particleIndex < 1 || particleIndex >= currentSetting.particleCount) {
          continue;
        }
        let translation = new CubismVector2();
        translation = currentParticles[particleIndex].position.substract(
          currentParticles[particleIndex - 1].position
        );
        outputValue = currentOutputs[i].getValue(
          translation,
          currentParticles,
          particleIndex,
          currentOutputs[i].reflect,
          this._options.gravity
        );
        this._currentRigOutputs.at(settingIndex).outputs.set(i, outputValue);
        this._previousRigOutputs.at(settingIndex).outputs.set(i, outputValue);
        const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
        const outParameterCaches = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
          JSON.stringify(
            parameterValues.subarray(destinationParameterIndex)
          )
        ) : parameterValues.slice(destinationParameterIndex);
        updateOutputParameterValue(
          outParameterCaches,
          parameterMinimumValues[destinationParameterIndex],
          parameterMaximumValues[destinationParameterIndex],
          outputValue,
          currentOutputs[i]
        );
        for (let offset = destinationParameterIndex, outParamIndex = 0; offset < this._parameterCaches.length; offset++, outParamIndex++) {
          parameterValues[offset] = this._parameterCaches[offset] = outParameterCaches[outParamIndex];
        }
      }
    }
  }
  /**
   * 物理演算の評価
   *
   * Pendulum interpolation weights
   *
   * 振り子の計算結果は保存され、パラメータへの出力は保存された前回の結果で補間されます。
   * The result of the pendulum calculation is saved and
   * the output to the parameters is interpolated with the saved previous result of the pendulum calculation.
   *
   * 図で示すと[1]と[2]で補間されます。
   * The figure shows the interpolation between [1] and [2].
   *
   * 補間の重みは最新の振り子計算タイミングと次回のタイミングの間で見た現在時間で決定する。
   * The weight of the interpolation are determined by the current time seen between
   * the latest pendulum calculation timing and the next timing.
   *
   * 図で示すと[2]と[4]の間でみた(3)の位置の重みになる。
   * Figure shows the weight of position (3) as seen between [2] and [4].
   *
   * 解釈として振り子計算のタイミングと重み計算のタイミングがズレる。
   * As an interpretation, the pendulum calculation and weights are misaligned.
   *
   * physics3.jsonにFPS情報が存在しない場合は常に前の振り子状態で設定される。
   * If there is no FPS information in physics3.json, it is always set in the previous pendulum state.
   *
   * この仕様は補間範囲を逸脱したことが原因の震えたような見た目を回避を目的にしている。
   * The purpose of this specification is to avoid the quivering appearance caused by deviations from the interpolation range.
   *
   * ------------ time -------------->
   *
   *                 |+++++|------| <- weight
   * ==[1]====#=====[2]---(3)----(4)
   *          ^ output contents
   *
   * 1:_previousRigOutputs
   * 2:_currentRigOutputs
   * 3:_currentRemainTime (now rendering)
   * 4:next particles timing
   * @param model 物理演算の結果を適用するモデル
   * @param deltaTimeSeconds デルタ時間[秒]
   */
  evaluate(model, deltaTimeSeconds) {
    var _a, _b, _c, _d;
    let totalAngle;
    let weight;
    let radAngle;
    let outputValue;
    const totalTranslation = new CubismVector2();
    let currentSetting;
    let currentInputs;
    let currentOutputs;
    let currentParticles;
    if (0 >= deltaTimeSeconds) {
      return;
    }
    const parameterValues = model.getModel().parameters.values;
    const parameterMaximumValues = model.getModel().parameters.maximumValues;
    const parameterMinimumValues = model.getModel().parameters.minimumValues;
    const parameterDefaultValues = model.getModel().parameters.defaultValues;
    let physicsDeltaTime;
    this._currentRemainTime += deltaTimeSeconds;
    if (this._currentRemainTime > MaxDeltaTime) {
      this._currentRemainTime = 0;
    }
    if (((_b = (_a = this._parameterCaches) == null ? void 0 : _a.length) != null ? _b : 0) < model.getParameterCount()) {
      this._parameterCaches = new Float32Array(model.getParameterCount());
    }
    if (((_d = (_c = this._parameterInputCaches) == null ? void 0 : _c.length) != null ? _d : 0) < model.getParameterCount()) {
      this._parameterInputCaches = new Float32Array(model.getParameterCount());
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterInputCaches[j] = parameterValues[j];
      }
    }
    if (this._physicsRig.fps > 0) {
      physicsDeltaTime = 1 / this._physicsRig.fps;
    } else {
      physicsDeltaTime = deltaTimeSeconds;
    }
    while (this._currentRemainTime >= physicsDeltaTime) {
      for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
        currentSetting = this._physicsRig.settings.at(settingIndex);
        currentOutputs = this._physicsRig.outputs.get(
          currentSetting.baseOutputIndex
        );
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          this._previousRigOutputs.at(settingIndex).outputs.set(
            i,
            this._currentRigOutputs.at(settingIndex).outputs.at(i)
          );
        }
      }
      const inputWeight = physicsDeltaTime / this._currentRemainTime;
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterCaches[j] = this._parameterInputCaches[j] * (1 - inputWeight) + parameterValues[j] * inputWeight;
        this._parameterInputCaches[j] = this._parameterCaches[j];
      }
      for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
        totalAngle = { angle: 0 };
        totalTranslation.x = 0;
        totalTranslation.y = 0;
        currentSetting = this._physicsRig.settings.at(settingIndex);
        currentInputs = this._physicsRig.inputs.get(
          currentSetting.baseInputIndex
        );
        currentOutputs = this._physicsRig.outputs.get(
          currentSetting.baseOutputIndex
        );
        currentParticles = this._physicsRig.particles.get(
          currentSetting.baseParticleIndex
        );
        for (let i = 0; i < currentSetting.inputCount; ++i) {
          weight = currentInputs[i].weight / MaximumWeight;
          if (currentInputs[i].sourceParameterIndex == -1) {
            currentInputs[i].sourceParameterIndex = model.getParameterIndex(
              currentInputs[i].source.id
            );
          }
          currentInputs[i].getNormalizedParameterValue(
            totalTranslation,
            totalAngle,
            this._parameterCaches[currentInputs[i].sourceParameterIndex],
            parameterMinimumValues[currentInputs[i].sourceParameterIndex],
            parameterMaximumValues[currentInputs[i].sourceParameterIndex],
            parameterDefaultValues[currentInputs[i].sourceParameterIndex],
            currentSetting.normalizationPosition,
            currentSetting.normalizationAngle,
            currentInputs[i].reflect,
            weight
          );
        }
        radAngle = CubismMath.degreesToRadian(-totalAngle.angle);
        totalTranslation.x = totalTranslation.x * CubismMath.cos(radAngle) - totalTranslation.y * CubismMath.sin(radAngle);
        totalTranslation.y = totalTranslation.x * CubismMath.sin(radAngle) + totalTranslation.y * CubismMath.cos(radAngle);
        updateParticles(
          currentParticles,
          currentSetting.particleCount,
          totalTranslation,
          totalAngle.angle,
          this._options.wind,
          MovementThreshold * currentSetting.normalizationPosition.maximum,
          physicsDeltaTime,
          AirResistance
        );
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          const particleIndex = currentOutputs[i].vertexIndex;
          if (currentOutputs[i].destinationParameterIndex == -1) {
            currentOutputs[i].destinationParameterIndex = model.getParameterIndex(currentOutputs[i].destination.id);
          }
          if (particleIndex < 1 || particleIndex >= currentSetting.particleCount) {
            continue;
          }
          const translation = new CubismVector2();
          translation.x = currentParticles[particleIndex].position.x - currentParticles[particleIndex - 1].position.x;
          translation.y = currentParticles[particleIndex].position.y - currentParticles[particleIndex - 1].position.y;
          outputValue = currentOutputs[i].getValue(
            translation,
            currentParticles,
            particleIndex,
            currentOutputs[i].reflect,
            this._options.gravity
          );
          this._currentRigOutputs.at(settingIndex).outputs.set(i, outputValue);
          const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
          const outParameterCaches = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
            JSON.stringify(
              this._parameterCaches.subarray(destinationParameterIndex)
            )
          ) : this._parameterCaches.slice(destinationParameterIndex);
          updateOutputParameterValue(
            outParameterCaches,
            parameterMinimumValues[destinationParameterIndex],
            parameterMaximumValues[destinationParameterIndex],
            outputValue,
            currentOutputs[i]
          );
          for (let offset = destinationParameterIndex, outParamIndex = 0; offset < this._parameterCaches.length; offset++, outParamIndex++) {
            this._parameterCaches[offset] = outParameterCaches[outParamIndex];
          }
        }
      }
      this._currentRemainTime -= physicsDeltaTime;
    }
    const alpha = this._currentRemainTime / physicsDeltaTime;
    this.interpolate(model, alpha);
  }
  /**
   * 物理演算結果の適用
   * 振り子演算の最新の結果と一つ前の結果から指定した重みで適用する。
   * @param model 物理演算の結果を適用するモデル
   * @param weight 最新結果の重み
   */
  interpolate(model, weight) {
    let currentOutputs;
    let currentSetting;
    const parameterValues = model.getModel().parameters.values;
    const parameterMaximumValues = model.getModel().parameters.maximumValues;
    const parameterMinimumValues = model.getModel().parameters.minimumValues;
    for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
      currentSetting = this._physicsRig.settings.at(settingIndex);
      currentOutputs = this._physicsRig.outputs.get(
        currentSetting.baseOutputIndex
      );
      for (let i = 0; i < currentSetting.outputCount; ++i) {
        if (currentOutputs[i].destinationParameterIndex == -1) {
          continue;
        }
        const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
        const outParameterValues = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
          JSON.stringify(
            parameterValues.subarray(destinationParameterIndex)
          )
        ) : parameterValues.slice(destinationParameterIndex);
        updateOutputParameterValue(
          outParameterValues,
          parameterMinimumValues[destinationParameterIndex],
          parameterMaximumValues[destinationParameterIndex],
          this._previousRigOutputs.at(settingIndex).outputs.at(i) * (1 - weight) + this._currentRigOutputs.at(settingIndex).outputs.at(i) * weight,
          currentOutputs[i]
        );
        for (let offset = destinationParameterIndex, outParamIndex = 0; offset < parameterValues.length; offset++, outParamIndex++) {
          parameterValues[offset] = outParameterValues[outParamIndex];
        }
      }
    }
  }
  /**
   * オプションの設定
   * @param options オプション
   */
  setOptions(options) {
    this._options = options;
  }
  /**
   * オプションの取得
   * @return オプション
   */
  getOption() {
    return this._options;
  }
  /**
   * コンストラクタ
   */
  constructor() {
    this._physicsRig = null;
    this._options = new Options();
    this._options.gravity.y = -1;
    this._options.gravity.x = 0;
    this._options.wind.x = 0;
    this._options.wind.y = 0;
    this._currentRigOutputs = new csmVector();
    this._previousRigOutputs = new csmVector();
    this._currentRemainTime = 0;
    this._parameterCaches = null;
    this._parameterInputCaches = null;
  }
  /**
   * デストラクタ相当の処理
   */
  release() {
    this._physicsRig = void 0;
    this._physicsRig = null;
  }
  /**
   * 初期化する
   */
  initialize() {
    let strand;
    let currentSetting;
    let radius;
    for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
      currentSetting = this._physicsRig.settings.at(settingIndex);
      strand = this._physicsRig.particles.get(currentSetting.baseParticleIndex);
      strand[0].initialPosition = new CubismVector2(0, 0);
      strand[0].lastPosition = new CubismVector2(
        strand[0].initialPosition.x,
        strand[0].initialPosition.y
      );
      strand[0].lastGravity = new CubismVector2(0, -1);
      strand[0].lastGravity.y *= -1;
      strand[0].velocity = new CubismVector2(0, 0);
      strand[0].force = new CubismVector2(0, 0);
      for (let i = 1; i < currentSetting.particleCount; ++i) {
        radius = new CubismVector2(0, 0);
        radius.y = strand[i].radius;
        strand[i].initialPosition = new CubismVector2(
          strand[i - 1].initialPosition.x + radius.x,
          strand[i - 1].initialPosition.y + radius.y
        );
        strand[i].position = new CubismVector2(
          strand[i].initialPosition.x,
          strand[i].initialPosition.y
        );
        strand[i].lastPosition = new CubismVector2(
          strand[i].initialPosition.x,
          strand[i].initialPosition.y
        );
        strand[i].lastGravity = new CubismVector2(0, -1);
        strand[i].lastGravity.y *= -1;
        strand[i].velocity = new CubismVector2(0, 0);
        strand[i].force = new CubismVector2(0, 0);
      }
    }
  }
  ///< UpdateParticlesが動くときの入力をキャッシュ
}
class Options {
  constructor() {
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
  }
  // 風の方向
}
class PhysicsOutput {
  constructor() {
    this.outputs = new csmVector(0);
  }
  // 物理演算出力結果
}
function sign(value) {
  let ret = 0;
  if (value > 0) {
    ret = 1;
  } else if (value < 0) {
    ret = -1;
  }
  return ret;
}
function getInputTranslationXFromNormalizedParameterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition, normalizationAngle, isInverted, weight) {
  targetTranslation.x += normalizeParameterValue(
    value,
    parameterMinimumValue,
    parameterMaximumValue,
    parameterDefaultValue,
    normalizationPosition.minimum,
    normalizationPosition.maximum,
    normalizationPosition.defalut,
    isInverted
  ) * weight;
}
function getInputTranslationYFromNormalizedParamterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition, normalizationAngle, isInverted, weight) {
  targetTranslation.y += normalizeParameterValue(
    value,
    parameterMinimumValue,
    parameterMaximumValue,
    parameterDefaultValue,
    normalizationPosition.minimum,
    normalizationPosition.maximum,
    normalizationPosition.defalut,
    isInverted
  ) * weight;
}
function getInputAngleFromNormalizedParameterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizaitionPosition, normalizationAngle, isInverted, weight) {
  targetAngle.angle += normalizeParameterValue(
    value,
    parameterMinimumValue,
    parameterMaximumValue,
    parameterDefaultValue,
    normalizationAngle.minimum,
    normalizationAngle.maximum,
    normalizationAngle.defalut,
    isInverted
  ) * weight;
}
function getOutputTranslationX(translation, particles, particleIndex, isInverted, parentGravity) {
  let outputValue = translation.x;
  if (isInverted) {
    outputValue *= -1;
  }
  return outputValue;
}
function getOutputTranslationY(translation, particles, particleIndex, isInverted, parentGravity) {
  let outputValue = translation.y;
  if (isInverted) {
    outputValue *= -1;
  }
  return outputValue;
}
function getOutputAngle(translation, particles, particleIndex, isInverted, parentGravity) {
  let outputValue;
  if (particleIndex >= 2) {
    parentGravity = particles[particleIndex - 1].position.substract(
      particles[particleIndex - 2].position
    );
  } else {
    parentGravity = parentGravity.multiplyByScaler(-1);
  }
  outputValue = CubismMath.directionToRadian(parentGravity, translation);
  if (isInverted) {
    outputValue *= -1;
  }
  return outputValue;
}
function getRangeValue(min, max) {
  const maxValue = CubismMath.max(min, max);
  const minValue = CubismMath.min(min, max);
  return CubismMath.abs(maxValue - minValue);
}
function getDefaultValue(min, max) {
  const minValue = CubismMath.min(min, max);
  return minValue + getRangeValue(min, max) / 2;
}
function getOutputScaleTranslationX(translationScale, angleScale) {
  return JSON.parse(JSON.stringify(translationScale.x));
}
function getOutputScaleTranslationY(translationScale, angleScale) {
  return JSON.parse(JSON.stringify(translationScale.y));
}
function getOutputScaleAngle(translationScale, angleScale) {
  return JSON.parse(JSON.stringify(angleScale));
}
function updateParticles(strand, strandCount, totalTranslation, totalAngle, windDirection, thresholdValue, deltaTimeSeconds, airResistance) {
  let delay;
  let radian;
  let direction = new CubismVector2(0, 0);
  let velocity = new CubismVector2(0, 0);
  let force = new CubismVector2(0, 0);
  let newDirection = new CubismVector2(0, 0);
  strand[0].position = new CubismVector2(
    totalTranslation.x,
    totalTranslation.y
  );
  const totalRadian = CubismMath.degreesToRadian(totalAngle);
  const currentGravity = CubismMath.radianToDirection(totalRadian);
  currentGravity.normalize();
  for (let i = 1; i < strandCount; ++i) {
    strand[i].force = currentGravity.multiplyByScaler(strand[i].acceleration).add(windDirection);
    strand[i].lastPosition = new CubismVector2(
      strand[i].position.x,
      strand[i].position.y
    );
    delay = strand[i].delay * deltaTimeSeconds * 30;
    direction = strand[i].position.substract(strand[i - 1].position);
    radian = CubismMath.directionToRadian(strand[i].lastGravity, currentGravity) / airResistance;
    direction.x = CubismMath.cos(radian) * direction.x - direction.y * CubismMath.sin(radian);
    direction.y = CubismMath.sin(radian) * direction.x + direction.y * CubismMath.cos(radian);
    strand[i].position = strand[i - 1].position.add(direction);
    velocity = strand[i].velocity.multiplyByScaler(delay);
    force = strand[i].force.multiplyByScaler(delay).multiplyByScaler(delay);
    strand[i].position = strand[i].position.add(velocity).add(force);
    newDirection = strand[i].position.substract(strand[i - 1].position);
    newDirection.normalize();
    strand[i].position = strand[i - 1].position.add(
      newDirection.multiplyByScaler(strand[i].radius)
    );
    if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
      strand[i].position.x = 0;
    }
    if (delay != 0) {
      strand[i].velocity = strand[i].position.substract(strand[i].lastPosition);
      strand[i].velocity = strand[i].velocity.divisionByScalar(delay);
      strand[i].velocity = strand[i].velocity.multiplyByScaler(
        strand[i].mobility
      );
    }
    strand[i].force = new CubismVector2(0, 0);
    strand[i].lastGravity = new CubismVector2(
      currentGravity.x,
      currentGravity.y
    );
  }
}
function updateParticlesForStabilization(strand, strandCount, totalTranslation, totalAngle, windDirection, thresholdValue) {
  let force = new CubismVector2(0, 0);
  strand[0].position = new CubismVector2(
    totalTranslation.x,
    totalTranslation.y
  );
  const totalRadian = CubismMath.degreesToRadian(totalAngle);
  const currentGravity = CubismMath.radianToDirection(totalRadian);
  currentGravity.normalize();
  for (let i = 1; i < strandCount; ++i) {
    strand[i].force = currentGravity.multiplyByScaler(strand[i].acceleration).add(windDirection);
    strand[i].lastPosition = new CubismVector2(
      strand[i].position.x,
      strand[i].position.y
    );
    strand[i].velocity = new CubismVector2(0, 0);
    force = strand[i].force;
    force.normalize();
    force = force.multiplyByScaler(strand[i].radius);
    strand[i].position = strand[i - 1].position.add(force);
    if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
      strand[i].position.x = 0;
    }
    strand[i].force = new CubismVector2(0, 0);
    strand[i].lastGravity = new CubismVector2(
      currentGravity.x,
      currentGravity.y
    );
  }
}
function updateOutputParameterValue(parameterValue, parameterValueMinimum, parameterValueMaximum, translation, output) {
  let value;
  const outputScale = output.getScale(
    output.translationScale,
    output.angleScale
  );
  value = translation * outputScale;
  if (value < parameterValueMinimum) {
    if (value < output.valueBelowMinimum) {
      output.valueBelowMinimum = value;
    }
    value = parameterValueMinimum;
  } else if (value > parameterValueMaximum) {
    if (value > output.valueExceededMaximum) {
      output.valueExceededMaximum = value;
    }
    value = parameterValueMaximum;
  }
  const weight = output.weight / MaximumWeight;
  if (weight >= 1) {
    parameterValue[0] = value;
  } else {
    value = parameterValue[0] * (1 - weight) + value * weight;
    parameterValue[0] = value;
  }
}
function normalizeParameterValue(value, parameterMinimum, parameterMaximum, parameterDefault, normalizedMinimum, normalizedMaximum, normalizedDefault, isInverted) {
  let result = 0;
  const maxValue = CubismMath.max(parameterMaximum, parameterMinimum);
  if (maxValue < value) {
    value = maxValue;
  }
  const minValue = CubismMath.min(parameterMaximum, parameterMinimum);
  if (minValue > value) {
    value = minValue;
  }
  const minNormValue = CubismMath.min(
    normalizedMinimum,
    normalizedMaximum
  );
  const maxNormValue = CubismMath.max(
    normalizedMinimum,
    normalizedMaximum
  );
  const middleNormValue = normalizedDefault;
  const middleValue = getDefaultValue(minValue, maxValue);
  const paramValue = value - middleValue;
  switch (sign(paramValue)) {
    case 1: {
      const nLength = maxNormValue - middleNormValue;
      const pLength = maxValue - middleValue;
      if (pLength != 0) {
        result = paramValue * (nLength / pLength);
        result += middleNormValue;
      }
      break;
    }
    case -1: {
      const nLength = minNormValue - middleNormValue;
      const pLength = minValue - middleValue;
      if (pLength != 0) {
        result = paramValue * (nLength / pLength);
        result += middleNormValue;
      }
      break;
    }
    case 0: {
      result = middleNormValue;
      break;
    }
  }
  return isInverted ? result : result * -1;
}
var Live2DCubismFramework;
((Live2DCubismFramework2) => {
  Live2DCubismFramework2.CubismPhysics = CubismPhysics;
  Live2DCubismFramework2.Options = Options;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
Live2DFactory.registerRuntime({
  version: 5,
  ready: cubism5Ready,
  test(source) {
    return source instanceof Cubism5ModelSettings || Cubism5ModelSettings.isValidJSON(source);
  },
  isValidMoc(modelData) {
    if (modelData.byteLength < 4) {
      return false;
    }
    const view = new Int8Array(modelData, 0, 4);
    return String.fromCharCode(...view) === "MOC3";
  },
  createModelSettings(json) {
    return new Cubism5ModelSettings(json);
  },
  createCoreModel(data, options) {
    const moc = CubismMoc.create(data, !!(options == null ? void 0 : options.checkMocConsistency));
    try {
      const model = moc.createModel();
      model.__moc = moc;
      return model;
    } catch (e) {
      try {
        moc.release();
      } catch (e2) {
      }
      throw e;
    }
  },
  createInternalModel(coreModel, settings, options) {
    const model = new Cubism5InternalModel(coreModel, settings, options);
    const coreModelWithMoc = coreModel;
    if (coreModelWithMoc.__moc) {
      model.__moc = coreModelWithMoc.__moc;
      delete coreModelWithMoc.__moc;
      model.once("destroy", releaseMoc);
    }
    return model;
  },
  createPhysics(coreModel, data) {
    try {
      if (typeof data === "object") {
        const jsonString = JSON.stringify(data);
        const buffer = new TextEncoder().encode(jsonString);
        return CubismPhysics.create(buffer.buffer, buffer.byteLength);
      }
      return CubismPhysics.create(data, data.length);
    } catch (error) {
      throw error;
    }
  },
  createPose(coreModel, data) {
    try {
      if (typeof data === "object") {
        const jsonString = JSON.stringify(data);
        const buffer = new TextEncoder().encode(jsonString);
        const result = CubismPose.create(buffer.buffer, buffer.byteLength);
        return result;
      }
      return CubismPose.create(data, data.length);
    } catch (error) {
      throw error;
    }
  }
});
function releaseMoc() {
  var _a;
  (_a = this.__moc) == null ? void 0 : _a.release();
}
export {
  AudioAnalyzer,
  Constant,
  Cubism5ExpressionManager,
  Cubism5InternalModel,
  Cubism5ModelSettings,
  Cubism5MotionManager,
  CubismFramework,
  CubismOverrideMotion,
  ExpressionManager,
  FileLoader,
  FocusController,
  InternalModel,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  Live2DCubismFramework$m as Live2DCubismFramework,
  Live2DFactory,
  Live2DLoader,
  Live2DModel,
  Live2DTransform,
  LogLevel,
  ModelSettings,
  MotionBehavior,
  MotionManager,
  MotionPreloadStrategy,
  MotionPriority,
  MotionState,
  Option,
  SoundManager,
  VERSION,
  XHRLoader,
  ZipLoader,
  applyMixins,
  clamp,
  config,
  copyArray,
  copyProperty,
  csmDelete,
  cubism5Ready,
  folderName,
  logger,
  rand,
  remove,
  startUpCubism5,
  strtod
};

    // Export to global.PIXI.live2d
    global.PIXI.live2d.AudioAnalyzer = AudioAnalyzer;
    global.PIXI.live2d.Constant = Constant;
    global.PIXI.live2d.Cubism5ExpressionManager = Cubism5ExpressionManager;
    global.PIXI.live2d.Cubism5InternalModel = Cubism5InternalModel;
    global.PIXI.live2d.Cubism5ModelSettings = Cubism5ModelSettings;
    global.PIXI.live2d.Cubism5MotionManager = Cubism5MotionManager;
    global.PIXI.live2d.CubismFramework = CubismFramework;
    global.PIXI.live2d.CubismOverrideMotion = CubismOverrideMotion;
    global.PIXI.live2d.ExpressionManager = ExpressionManager;
    global.PIXI.live2d.FileLoader = FileLoader;
    global.PIXI.live2d.FocusController = FocusController;
    global.PIXI.live2d.InternalModel = InternalModel;
    global.PIXI.live2d.LOGICAL_HEIGHT = LOGICAL_HEIGHT;
    global.PIXI.live2d.LOGICAL_WIDTH = LOGICAL_WIDTH;
    global.PIXI.live2d.Live2DCubismFramework = Live2DCubismFramework;
    global.PIXI.live2d.Live2DFactory = Live2DFactory;
    global.PIXI.live2d.Live2DLoader = Live2DLoader;
    global.PIXI.live2d.Live2DModel = Live2DModel;
    global.PIXI.live2d.Live2DTransform = Live2DTransform;
    global.PIXI.live2d.LogLevel = LogLevel;
    global.PIXI.live2d.ModelSettings = ModelSettings;
    global.PIXI.live2d.MotionBehavior = MotionBehavior;
    global.PIXI.live2d.MotionManager = MotionManager;
    global.PIXI.live2d.MotionPreloadStrategy = MotionPreloadStrategy;
    global.PIXI.live2d.MotionPriority = MotionPriority;
    global.PIXI.live2d.MotionState = MotionState;
    global.PIXI.live2d.Option = Option;
    global.PIXI.live2d.SoundManager = SoundManager;
    global.PIXI.live2d.VERSION = VERSION;
    global.PIXI.live2d.XHRLoader = XHRLoader;
    global.PIXI.live2d.ZipLoader = ZipLoader;
    global.PIXI.live2d.applyMixins = applyMixins;
    global.PIXI.live2d.clamp = clamp;
    global.PIXI.live2d.config = config;
    global.PIXI.live2d.copyArray = copyArray;
    global.PIXI.live2d.copyProperty = copyProperty;
    global.PIXI.live2d.csmDelete = csmDelete;
    global.PIXI.live2d.cubism5Ready = cubism5Ready;
    global.PIXI.live2d.folderName = folderName;
    global.PIXI.live2d.logger = logger;
    global.PIXI.live2d.rand = rand;
    global.PIXI.live2d.remove = remove;
    global.PIXI.live2d.startUpCubism5 = startUpCubism5;
    global.PIXI.live2d.strtod = strtod;
    
})(typeof window !== 'undefined' ? window : this);
