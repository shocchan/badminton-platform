// 来た日（visit）＝**アプリを開いた日**の記録。2026-09-07 CEO決定。
//
// なぜ要るか（2026-09-07 の実測）:
//   生徒7人の最長連続学習日数は3日で、4日目に届いた人がまだ一人もいない。
//   途切れた人に届くものは何も無く、戻ってきた人を迎えるものも何も無かった。
//   「今日は時間がない」と「今日はやらない」のあいだに、**開くだけで意味がある一段**を作る。
//
// つづけた日（advStreak）との違い——混ぜないこと:
//   - streak  = **学習した日**（questLog∪mastery）。攻略の実感。数字は勉強の証拠
//   - visit   = **開いた日**。ここで押すスタンプは「来た」という意味しか持たない
//   画面の文言も分けて書く（「べんきょうした日」と「来た日」）。開いただけの日を
//   勉強した日として数えると、生徒の記録が嘘になる（原則13: 数字を作らない）。
//
// advStreak から引き継ぐ原則:
//   - **祝いのみ。責めない。** 空いた日数は事実として出すが、「サボった」「失った」は出さない
//   - 過去は偽造しない。記録が無い日は「来ていない」ではなく「記録が無い」として扱う
//     （visit は 2026-09-07 に始まった仕組みなので、それ以前は空で正しい）
import type { AdvVisitState } from './advTypes';

/** スタンプ台紙に出す日数（2週間ぶん）。保持はその倍を持って月替わりでも欠けないようにする */
export const VISIT_CARD_DAYS = 14;
const VISIT_KEEP_DAYS = 30;

const DAY_MS = 86400000;

/** YYYY-MM-DD 同士の日数差（UTC解釈。advStreak.dayDiff と同じ式） */
const dayDiff = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

const shiftDay = (key: string, delta: number): string =>
  new Date(Date.parse(key) + delta * DAY_MS).toISOString().slice(0, 10);

const isDayKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const emptyVisitState = (): AdvVisitState => ({ days: [], lastCardKey: null });

/** 保存値の復元（壊れた形・重複・古い日を落として昇順にそろえる） */
export const restoreVisit = (raw: unknown): AdvVisitState => {
  if (!raw || typeof raw !== 'object') return emptyVisitState();
  const r = raw as Record<string, unknown>;
  const days = Array.isArray(r.days)
    ? [...new Set(r.days.filter(isDayKey))].sort().slice(-VISIT_KEEP_DAYS)
    : [];
  return { days, lastCardKey: isDayKey(r.lastCardKey) ? r.lastCardKey : null };
};

/**
 * 今日の来訪を記録する。**必要なときだけ**新しい state を返す（不要なら null）。
 * 1日1回しか保存が増えない＝開くたびに書きに行かない。
 */
export const recordVisit = (state: AdvVisitState, todayKey: string): AdvVisitState | null => {
  if (!isDayKey(todayKey)) return null;
  if (state.days.includes(todayKey)) return null;
  return { ...state, days: [...state.days, todayKey].sort().slice(-VISIT_KEEP_DAYS) };
};

/** おかえりカードを見せたことを記録する（1日1回にするため）。不要なら null */
export const markCardShown = (state: AdvVisitState, todayKey: string): AdvVisitState | null => {
  if (!isDayKey(todayKey) || state.lastCardKey === todayKey) return null;
  return { ...state, lastCardKey: todayKey };
};

/** 今日はまだおかえりカードを出していないか */
export const shouldShowCheckin = (state: AdvVisitState, todayKey: string): boolean =>
  isDayKey(todayKey) && state.lastCardKey !== todayKey;

/**
 * 何日ぶりか。**今日を除いた直近の来訪日**からの日数。
 * - 記録が今日しか無い／1件も無い → null（初めて or 記録が始まる前。「◯日ぶり」を出さない）
 * - 時計の巻き戻り・壊れたキーでも null（安全側＝何も言わない）
 */
export const daysAway = (state: AdvVisitState, todayKey: string): number | null => {
  if (!isDayKey(todayKey)) return null;
  const prev = state.days.filter((d) => d < todayKey).at(-1);
  if (!prev) return null;
  const gap = dayDiff(prev, todayKey);
  return Number.isFinite(gap) && gap > 0 ? gap : null;
};

export type VisitGreeting =
  /** 昨日も来ていた（連日） */
  | { kind: 'consecutive'; days: null }
  /** 少し空いた（2〜6日） */
  | { kind: 'short'; days: number }
  /** しばらくぶり（7日以上） */
  | { kind: 'long'; days: number }
  /** 記録の始まり（初回・または visit 導入前からの人の初日） */
  | { kind: 'first'; days: null };

/**
 * 迎え方の種類だけを決める（文言は画面側・言語ごとに持つ）。
 * **空いた日数で扱いを変えるのは、責めるためではなく分量を変えるため**。
 * 久しぶりの人には「今日は3分だけ」を出し、連日の人には出さない。
 */
export const visitGreeting = (state: AdvVisitState, todayKey: string): VisitGreeting => {
  const away = daysAway(state, todayKey);
  if (away === null) return { kind: 'first', days: null };
  if (away === 1) return { kind: 'consecutive', days: null };
  if (away <= 6) return { kind: 'short', days: away };
  return { kind: 'long', days: away };
};

export interface VisitStamp {
  dateKey: string;
  /** 来た記録がある日 */
  visited: boolean;
  /** 今日 */
  today: boolean;
  /**
   * 記録が始まる前の日（visit 導入前）。**「来なかった日」と区別する**ために持つ。
   * 画面では空欄でも薄い印でもよいが、×（来なかった）として描いてはいけない
   */
  beforeRecords: boolean;
}

/**
 * スタンプ台紙。todayKey を右端にした直近 VISIT_CARD_DAYS 日ぶん。
 * 記録開始前の日は beforeRecords=true で返す（過去を「サボった日」に見せない）。
 */
export const visitStamps = (
  state: AdvVisitState, todayKey: string, span: number = VISIT_CARD_DAYS,
): VisitStamp[] => {
  if (!isDayKey(todayKey)) return [];
  const set = new Set(state.days);
  const firstRecord = state.days[0] ?? todayKey;
  const out: VisitStamp[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const dateKey = shiftDay(todayKey, -i);
    out.push({
      dateKey,
      visited: set.has(dateKey),
      today: dateKey === todayKey,
      beforeRecords: dateKey < firstRecord,
    });
  }
  return out;
};

/** 台紙のうち、記録が始まってから来た日の数（「今月◯日」の類を出すため） */
export const visitedInCard = (stamps: VisitStamp[]): number =>
  stamps.filter((s) => s.visited).length;
