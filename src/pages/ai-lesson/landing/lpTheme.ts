// 販売LPの見た目（2026-08-27 試作 → 2026-08-28 冒険を既定に）。
//
// 【いまの状態】
// CEOが2案を見比べて「冒険の方がいい」と決定。冒険が既定になった。
// 何も指定しない訪問者には冒険の見た目が出る。
//
// 【暖色パレットを消していない理由】
// 同じときに「PCで見ると冒険の方イマイチに見える時を感じる」という指摘も出ている。
// PCの見え方はまだ直しきっていない（横長の風景を1枚起こす必要がある＝次の課題）。
// 途中で「やっぱり戻したい」となったときに、URL1本で戻せる道を残しておく。
// PCの件が片付いたら、暖色パレットとこの切り替えごと消す。
//
// 使い方:
//   /zh/ai-course                   … 冒険（既定）
//   /zh/ai-course?theme=default     … 暖色に戻す（そのブラウザで覚える）
//   /zh/ai-course?theme=adventure   … 冒険に戻す（保存も消える）

export type LpTheme = 'default' | 'adventure';

const KEY = 'kb_lp_theme_v1';

/** 何も指定がないときの見た目（2026-08-28 CEO決定で冒険へ） */
export const DEFAULT_LP_THEME: LpTheme = 'adventure';

const isTheme = (v: string | null): v is LpTheme => v === 'default' || v === 'adventure';

/**
 * いま使う見た目を決める。URLの指定が最優先、無ければ保存値、無ければ既定。
 * 非ブラウザ環境（prerender・テスト）では常に既定＝冒険。
 */
export const resolveLpTheme = (search: string, stored: string | null): LpTheme => {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return DEFAULT_LP_THEME; }
  const fromUrl = q.get('theme');
  if (isTheme(fromUrl)) return fromUrl;
  return isTheme(stored) ? stored : DEFAULT_LP_THEME;
};

/**
 * URLの指定を保存に反映する。
 * **既定と同じ指定なら保存を消す**（既定が変わったときに古い保存が残り続けない）。
 */
export const persistLpTheme = (search: string): void => {
  try {
    const fromUrl = new URLSearchParams(search).get('theme');
    if (!isTheme(fromUrl)) return;
    if (fromUrl === DEFAULT_LP_THEME) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, fromUrl);
  } catch { /* ストレージが使えなくてもURL指定だけで動く */ }
};

/** いまのブラウザで使う見た目 */
export const currentLpTheme = (): LpTheme => {
  try {
    persistLpTheme(window.location.search);
    return resolveLpTheme(window.location.search, localStorage.getItem(KEY));
  } catch {
    return DEFAULT_LP_THEME;
  }
};
