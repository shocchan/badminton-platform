// 販売LPの見た目を切り替える（2026-08-27・CEO依頼で試作）。
//
// 【なぜフラグにするか】
// 既定の暖色パレットは本番で動いているもの。試作を直接差し替えると、
// 見比べられないまま片方が消える。CEOが選ぶまで**両方残す**。
// （デザインの試作は必ず新旧を切り替えられる形にする、という運用に合わせる）
//
// 使い方:
//   /zh/ai-course?theme=adventure   … 冒険の書パレット
//   /zh/ai-course?theme=default     … 既定に戻す（保存も消える）
//   /zh/ai-course                   … 既定（保存があればそれに従う）
//
// 一度指定したら、そのブラウザでは覚えておく。
// 言語切替やセクション移動のたびにURLへ付け直さなくても見比べられるようにするため。
// **本番の一般訪問者には既定しか出ない**（URLに付けた人だけが試作を見る）。

export type LpTheme = 'default' | 'adventure';

const KEY = 'kb_lp_theme_v1';

const isTheme = (v: string | null): v is LpTheme => v === 'default' || v === 'adventure';

/**
 * いま使う見た目を決める。URLの指定が最優先、無ければ保存値、無ければ既定。
 * 非ブラウザ環境（prerender・テスト）では常に既定。
 */
export const resolveLpTheme = (search: string, stored: string | null): LpTheme => {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return 'default'; }
  const fromUrl = q.get('theme');
  if (isTheme(fromUrl)) return fromUrl;
  return isTheme(stored) ? stored : 'default';
};

/** URLの指定を保存に反映する。default を明示したら保存も消す（戻れなくならない） */
export const persistLpTheme = (search: string): void => {
  try {
    const fromUrl = new URLSearchParams(search).get('theme');
    if (!isTheme(fromUrl)) return;
    if (fromUrl === 'default') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, fromUrl);
  } catch { /* ストレージが使えなくてもURL指定だけで動く */ }
};

/** いまのブラウザで使う見た目 */
export const currentLpTheme = (): LpTheme => {
  try {
    persistLpTheme(window.location.search);
    return resolveLpTheme(window.location.search, localStorage.getItem(KEY));
  } catch {
    return 'default';
  }
};
