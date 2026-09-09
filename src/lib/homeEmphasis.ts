/**
 * トップページで何を主役にするか（2026-09-09 P2-8 / H-2）。
 *
 * 【なぜ関数にするか】
 * これまでトップは「大会のページ」と決め打ちで書かれていた。実際は
 *   直近90日の申込 … 通常活動203件 / 大会19件（＝9割が通常活動）
 *   今後の開催     … 通常活動9件 / 大会1件
 * なのに、ヒーローもカレンダーもカード一覧も大会が占め、通常活動は帯1本だった。
 *
 * ここで固定値に書き戻せないようにする。**実データ（今後の開催数）から決める。**
 * 大会が増えれば自然に大会が前に出るし、無い時期は通常活動が前に出る。
 * 人が「今日は大会を目立たせたい」で書き換えられる場所を作らない。
 *
 * 【SEOは触らない】
 * title / h1 / canonical は動かさない。動かすのは**ボタンとブロックの順番だけ**。
 * 検索での見え方を、表示の都合で毎回変えない。
 */

export type HomeEmphasis = 'activity' | 'tournament' | 'balanced';

export interface HomeCounts {
  /** 今日以降に開催予定の通常活動の数 */
  upcomingActivities: number;
  /** 今日以降に開催予定の大会の数 */
  upcomingTournaments: number;
}

/**
 * どちらを主役にするか。
 *  - 片方が0なら、もう片方が主役（無いものを主役にしない）
 *  - どちらもあるなら、開催予定が2倍以上多いほうが主役
 *  - 拮抗しているなら balanced（どちらも同じ強さで並べる）
 */
export const homeEmphasis = (c: HomeCounts): HomeEmphasis => {
  const a = Math.max(0, c.upcomingActivities);
  const t = Math.max(0, c.upcomingTournaments);
  if (a === 0 && t === 0) return 'balanced';
  if (t === 0) return 'activity';
  if (a === 0) return 'tournament';
  if (a >= t * 2) return 'activity';
  if (t >= a * 2) return 'tournament';
  return 'balanced';
};

/** 主CTAが通常活動を指すか（＝ヒーローの1番目のボタン） */
export const activityIsPrimary = (e: HomeEmphasis): boolean => e !== 'tournament';

/**
 * 「次回の通常活動」ブロックを大会一覧より上に出すか。
 * balanced でも上に出す——**申込の9割が通常活動**なので、拮抗しているなら
 * 実需の大きいほうを先に見せる。
 */
export const showActivityFirst = (e: HomeEmphasis): boolean => e !== 'tournament';
