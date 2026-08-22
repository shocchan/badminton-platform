// 冒険の世界地図の表示方式フラグ（2026-08-22・画像差し替えの土台）。
//
// 方式は2つ:
//   'image' … ChatGPT生成の背景＋街タイル＋台座を敷く版（AdvWorldMapImage）。**既定**（2026-08-22 CEO承認）
//   'svg'   … 旧・自作SVG風景（AdvWorldMap）。`?map=svg` でいつでも戻せる。画像が無い/読めないときの自動の落とし先でもある
//
// 決め方（優先順）:
//   1. URLクエリ `?map=image` / `?map=svg`（付いていれば localStorage にも保存＝SPA内の画面遷移でクエリが落ちても保つ）
//      `?map=reset` で保存を消して既定に戻す
//   2. localStorage `adv.worldMap.variant`
//   3. 既定 'image'（2026-08-22 CEO承認。それまでは 'svg'）
//
// プロファイル（DB）は触らない。将来プロファイル側のフラグを足すときは AdvWorldMapSwitch の variant prop に渡す。
export type WorldMapVariant = 'svg' | 'image';

export const DEFAULT_WORLD_MAP_VARIANT: WorldMapVariant = 'image';
export const WORLD_MAP_VARIANT_QUERY = 'map';
export const WORLD_MAP_VARIANT_STORAGE_KEY = 'adv.worldMap.variant';
/** `?map=reset` … 保存を消して既定へ戻す */
export const WORLD_MAP_VARIANT_RESET = 'reset';

/** localStorage 相当（テストで差し替えられるよう最小のインターフェースにする） */
export type VariantStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const parseWorldMapVariant = (v: string | null | undefined): WorldMapVariant | null =>
  v === 'svg' || v === 'image' ? v : null;

/**
 * 表示方式を決める。副作用は「URLに明示があれば保存する」だけ（storage が無い/壊れていても落ちない）。
 * @param search  window.location.search 相当（'?map=image' など）。省略可
 * @param storage localStorage 相当。省略/null なら保存も参照もしない
 */
const queryValue = (search: string): string | null => {
  try {
    return new URLSearchParams(search).get(WORLD_MAP_VARIANT_QUERY);
  } catch {
    return null;
  }
};

const storedValue = (storage: VariantStorage | null): string | null => {
  try {
    return storage?.getItem(WORLD_MAP_VARIANT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
};

export const resolveWorldMapVariant = (
  { search = '', storage = null }: { search?: string; storage?: VariantStorage | null } = {},
): WorldMapVariant => {
  const fromQuery = queryValue(search);

  if (fromQuery === WORLD_MAP_VARIANT_RESET) {
    try { storage?.removeItem(WORLD_MAP_VARIANT_STORAGE_KEY); } catch { /* private mode 等 */ }
    return DEFAULT_WORLD_MAP_VARIANT;
  }
  const q = parseWorldMapVariant(fromQuery);
  if (q) {
    try { storage?.setItem(WORLD_MAP_VARIANT_STORAGE_KEY, q); } catch { /* 保存できなくても表示は続ける */ }
    return q;
  }

  return parseWorldMapVariant(storedValue(storage)) ?? DEFAULT_WORLD_MAP_VARIANT;
};

const windowStorage = (): VariantStorage | null => {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / storage 無効
  }
};

/** ブラウザ環境で window から決める（SSR/jsdom 無しでは既定） */
export const readWorldMapVariantFromWindow = (): WorldMapVariant => {
  if (typeof window === 'undefined') return DEFAULT_WORLD_MAP_VARIANT;
  return resolveWorldMapVariant({ search: window.location.search, storage: windowStorage() });
};
