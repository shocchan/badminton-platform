/**
 * 通常活動の申込で受け取る「任意のメールアドレス」の扱い（2026-08-24）。
 *
 * 通常活動は 6月19人 → 7月83人 → 8月94人 と広告なしで伸びている唯一の実需だが、
 * 申込の insert に連絡先が無く、166件が名前だけのログとして溜まっていた。
 * だからといって必須にはしない。**申込のしやすさを落とさないことが最優先。**
 *
 * ActivityPage.tsx から切り出してあるのは、コンポーネント以外を export すると
 * Fast Refresh が効かなくなるため（react-refresh/only-export-components）。
 */

/**
 * 入力がある時だけ形式を見る＝入力ミスは弾くが、書かない自由は残す。
 * 空欄・空白のみは true（＝そのまま申し込める）。
 */
export const isValidOptionalEmail = (value: string): boolean => {
  const s = value.trim();
  if (!s) return true;
  if (s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
};

/** 保存する値。空欄は null（空文字を入れると「メールを書いた人」と区別できなくなる） */
export const normalizeOptionalEmail = (value: string): string | null => value.trim() || null;
