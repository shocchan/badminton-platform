// バド対決ゲームの自己ベスト（この端末のlocalStorage）。
// マイページの表示とリザルト画面の「自己ベスト更新!」演出で使う。

const KEY = 'kawabado_rally_best';

export function getRallyBest(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** スコアを記録し、自己ベストを更新したら true を返す */
export function updateRallyBest(rally: number): boolean {
  const best = getRallyBest();
  if (rally > best) {
    try {
      localStorage.setItem(KEY, String(rally));
    } catch {
      /* プライベートモード等は無視 */
    }
    return true;
  }
  return false;
}
