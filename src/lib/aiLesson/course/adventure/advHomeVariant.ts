// ホーム（今日の冒険）の表示方式フラグ（2026-08-22・第2フェーズ）。
//
// 方式は2つ:
//   'v2' … 今日の街のヒーロー帯を敷き、始めるまでを短くした版。**既定**（2026-08-22 CEO承認）
//   'v1' … 旧ホーム。`?home=v1` でいつでも戻せる（絵が404でも帯が消えるだけで画面は成立する）
//
// 決め方（優先順）:
//   1. URLクエリ `?home=v2` / `?home=v1`（付いていれば localStorage にも保存＝画面遷移で落ちても保つ）
//      `?home=reset` で保存を消して既定へ戻す
//   2. localStorage `adv.home.variant`
//   3. 既定 'v2'（2026-08-22 CEO承認。それまでは 'v1'）
//
// 冒険マップの advWorldMapVariant と同じ作り。プロファイル（DB）は触らない。
export type HomeVariant = 'v1' | 'v2';

export const DEFAULT_HOME_VARIANT: HomeVariant = 'v2';
export const HOME_VARIANT_QUERY = 'home';
export const HOME_VARIANT_STORAGE_KEY = 'adv.home.variant';
/** `?home=reset` … 保存を消して既定へ戻す */
export const HOME_VARIANT_RESET = 'reset';

export type VariantStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const parseHomeVariant = (v: string | null | undefined): HomeVariant | null =>
  v === 'v1' || v === 'v2' ? v : null;

const queryValue = (search: string): string | null => {
  try {
    return new URLSearchParams(search).get(HOME_VARIANT_QUERY);
  } catch {
    return null;
  }
};

const storedValue = (storage: VariantStorage | null): string | null => {
  try {
    return storage?.getItem(HOME_VARIANT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
};

/**
 * 表示方式を決める。副作用は「URLに明示があれば保存する」だけ
 * （storage が無い/壊れていても落ちない＝private mode でも表示は続く）。
 */
export const resolveHomeVariant = (
  { search = '', storage = null }: { search?: string; storage?: VariantStorage | null } = {},
): HomeVariant => {
  const fromQuery = queryValue(search);
  if (fromQuery === HOME_VARIANT_RESET) {
    try { storage?.removeItem(HOME_VARIANT_STORAGE_KEY); } catch { /* private mode 等 */ }
    return DEFAULT_HOME_VARIANT;
  }
  const q = parseHomeVariant(fromQuery);
  if (q) {
    try { storage?.setItem(HOME_VARIANT_STORAGE_KEY, q); } catch { /* 保存できなくても表示は続ける */ }
    return q;
  }
  return parseHomeVariant(storedValue(storage)) ?? DEFAULT_HOME_VARIANT;
};

/** ブラウザの現在地から決める（SSR・テスト環境では既定） */
export const readHomeVariantFromWindow = (): HomeVariant => {
  if (typeof window === 'undefined') return DEFAULT_HOME_VARIANT;
  return resolveHomeVariant({ search: window.location.search, storage: window.localStorage });
};
