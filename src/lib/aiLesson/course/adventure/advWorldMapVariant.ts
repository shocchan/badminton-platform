// 冒険の世界地図の表示方式フラグ（2026-08-22・画像差し替えの土台）。
//
// 方式は2つ:
//   'svg'   … 現行の自作SVG風景（AdvWorldMap）。**既定**。CEO確認前に既定を変えない
//   'image' … ChatGPT生成の背景画像を敷く版（AdvWorldMapImage）。画像が無い/読めないときは svg へ自動フォールバック
//
// 決め方（優先順）:
//   1. URLクエリ `?map=image` / `?map=svg`（付いていれば localStorage にも保存＝SPA内の画面遷移でクエリが落ちても保つ）
//      `?map=reset` で保存を消して既定に戻す
//   2. localStorage `adv.worldMap.variant`
//   3. 既定 'svg'
//
// プロファイル（DB）は触らない。将来プロファイル側のフラグを足すときは AdvWorldMapSwitch の variant prop に渡す。
export type WorldMapVariant = 'svg' | 'image';

export const DEFAULT_WORLD_MAP_VARIANT: WorldMapVariant = 'svg';
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
export const resolveWorldMapVariant = (
  { search = '', storage = null }: { search?: string; storage?: VariantStorage | null } = {},
): WorldMapVariant => {
  let fromQuery: string | null = null;
  try {
    fromQuery = new URLSearchParams(search).get(WORLD_MAP_VARIANT_QUERY);
  } catch {
    fromQuery = null;
  }

  if (fromQuery === WORLD_MAP_VARIANT_RESET) {
    try { storage?.removeItem(WORLD_MAP_VARIANT_STORAGE_KEY); } catch { /* private mode 等 */ }
    return DEFAULT_WORLD_MAP_VARIANT;
  }
  const q = parseWorldMapVariant(fromQuery);
  if (q) {
    try { storage?.setItem(WORLD_MAP_VARIANT_STORAGE_KEY, q); } catch { /* 保存できなくても表示は続ける */ }
    return q;
  }

  let stored: string | null = null;
  try { stored = storage?.getItem(WORLD_MAP_VARIANT_STORAGE_KEY) ?? null; } catch { stored = null; }
  return parseWorldMapVariant(stored) ?? DEFAULT_WORLD_MAP_VARIANT;
};

/** ブラウザ環境で window から決める（SSR/jsdom 無しでは既定） */
export const readWorldMapVariantFromWindow = (): WorldMapVariant => {
  if (typeof window === 'undefined') return DEFAULT_WORLD_MAP_VARIANT;
  let storage: VariantStorage | null = null;
  try { storage = window.localStorage; } catch { storage = null; }
  return resolveWorldMapVariant({ search: window.location.search, storage });
};
