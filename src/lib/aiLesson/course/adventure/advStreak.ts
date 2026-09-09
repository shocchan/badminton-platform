// つづけた日（ストリーク）＝祝い専用の連続日数（2026-08-19 CEO「もっとゲーム感」）。
//
// 鉄則:
// - **祝いのみ。** 途切れても責めない・「失った」「切れた」を出さない（advReviewForecast の設計原則）。
//   途切れたら数字が1へ戻るだけで、文言はどこにも出さない
// - **過去分を偽造しない**（原則13）: 初期値（seed）は実在の履歴（questLog∪mastery）から数える。
//   questLog直近60件・attempt束あたり24件（MASTERY_RULES.maxAttemptsKept）の間引きにより、
//   seedは**過小方向にしかズレない**＝実際より多い日数を出すことはない
// - 攻略・mastery・準備度には一切影響しない（advXp.ts と同じ立場の「冒険の実感」用）
// - 「活動した日」の定義は **advLearningDay（唯一の正）** に委譲する（2026-09-09・P0-1）。
//   以前はここが questLog∪mastery を自前で数えていたため、かな道場だけの日・
//   AI会話だけの日・途中でやめた日がストリークに入らなかった
//   （実測: かな18行を3日やった生徒の streak が null のまま）。
//   あゆみヒートマップ・管理画面・先生の一言も同じ集合を見る
import type { AdventureV2Profile, AdvStreakState } from './advTypes';
import { learningDayKeys } from './advLearningDay';

/** 学習日の判定に要るプロフィールの部分（advLearningDay と同じ範囲） */
type StreakSource = Pick<AdventureV2Profile,
  'learningDays' | 'questLog' | 'mastery' | 'restateLog' | 'todaySteps'>;

/** 祝う節目（ちょうど到達した日だけ祝う） */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const;

const DAY_MS = 86400000;

/** YYYY-MM-DD キー同士の日数差（UTC解釈で安定。daysAwayと同じ式） */
const dayDiff = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

/** 前日のキー */
const prevDayKey = (key: string): string => new Date(Date.parse(key) - DAY_MS).toISOString().slice(0, 10);

/**
 * 学習した日のキー集合（あゆみヒートマップ・管理画面と同一定義）。
 * 定義は advLearningDay.learningDayKeys が持つ＝ここでは数えない。
 * @param convDayKeys 会話セッションの日（持っている画面だけ渡す）
 */
export const activeDayKeys = (
  p: StreakSource, convDayKeys: readonly string[] = [],
): Set<string> => learningDayKeys(p, convDayKeys);

/** dateKey当日に意味のある学習行動があったか */
export const hasActivityOn = (
  p: StreakSource, dateKey: string, convDayKeys: readonly string[] = [],
): boolean => activeDayKeys(p, convDayKeys).has(dateKey);

/**
 * 履歴からの初期値。todayKeyを含む連続日数を過去へ遡って数える（今日の活動が無ければnull）。
 * 履歴の間引き（上記）により**過小方向にしかズレない**（偽造なし）
 */
export const seedStreak = (days: Set<string>, todayKey: string): AdvStreakState | null => {
  if (!days.has(todayKey)) return null;
  let current = 1;
  let cursor = todayKey;
  // days は有限集合なので必ず止まる（prevDayKey は毎回1日戻る）
  while (days.has(prevDayKey(cursor))) {
    current += 1;
    cursor = prevDayKey(cursor);
  }
  return { current, best: current, lastActiveKey: todayKey };
};

/**
 * 更新が必要なときだけ新しいstateを返す。不要（今日未活動 or 計上済み）ならnull。
 * - streak===null → seedStreak（hasActivityOnが真のときのみ）
 * - lastActiveKey===todayKey → null（冪等・1日1回しか保存が増えない）
 * - 前日から+1 / 2日以上空いたら1へリセット（**責め文言はどこにも出さない。数字が戻るだけ**）
 * - best = max(best, current)
 */
export const advanceStreak = (
  p: AdventureV2Profile, todayKey: string, convDayKeys: readonly string[] = [],
): AdvStreakState | null => {
  if (!hasActivityOn(p, todayKey, convDayKeys)) return null;
  const prev = p.streak;
  if (!prev) return seedStreak(activeDayKeys(p, convDayKeys), todayKey);
  if (prev.lastActiveKey === todayKey) return null;
  const gap = dayDiff(prev.lastActiveKey, todayKey);
  // 時計の巻き戻り・壊れたキー（NaN含む）では進めない（安全側＝何もしない）
  if (!Number.isFinite(gap) || gap <= 0) return null;
  const current = gap === 1 ? prev.current + 1 : 1;
  return { current, best: Math.max(prev.best, current), lastActiveKey: todayKey };
};

/**
 * 今回の更新でちょうど節目に到達したらその日数、そうでなければnull。
 * seedで節目を飛び越えた場合は祝わない（過去分を遡って祝う演出をしない）:
 * 「ちょうど到達」だけを返すので、飛び越え（例: 履歴seedでいきなり5日）は自然にnullになる
 */
export const crossedMilestone = (prev: AdvStreakState | null, next: AdvStreakState): number | null => {
  // 同日冪等・リセット（current=1）は節目になり得ない。ちょうど一致した日数だけ返す
  if (prev && prev.current >= next.current) return null;
  return (STREAK_MILESTONES as readonly number[]).includes(next.current) ? next.current : null;
};
