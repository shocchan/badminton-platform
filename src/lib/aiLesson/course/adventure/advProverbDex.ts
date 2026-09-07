// ことば集め＝受け取った「今日のことば」がたまっていく（2026-09-07 第2版・CEO要望）。
//
// なぜ足すか:
//   初版は「その日に1つ読んで終わり」だった。読んだそばから消えるので、
//   **この教室が売っている「忘れるころに もう一度」の外側**に置かれたままだった。
//   スタンプが増えても手元には何も残らない＝集める楽しさもない。
//
//   なので3つ足す:
//     1. 受け取ったことばは**手元にたまる**（ことば集め）
//     2. 「おぼえた」と自分で決められる（読むだけ→自分で扱う、へ変わる）
//     3. おぼえたことばは**しばらくして1回だけ戻ってくる**（意味を隠して思い出す）
//
// 守ること:
//   - 「おぼえた」は**自己申告**。テストで測った定着ではないので、そう見せない（原則13）
//   - 戻ってくるのは1回だけ。何度も出して「まだ終わらないのか」を作らない
//   - ことばの本文はここに持たない。**PROVERBS が正準**で、ここは id と日付だけを持つ
import type { AdvProverbEntry } from './advTypes';
import { proverbById, type Proverb } from './advProverbs';

/** おぼえたことばが戻ってくるまでの日数（1回だけ） */
export const PROVERB_RECALL_DAYS = 10;
/** 手元に置く件数の上限（jsonbを太らせない。60件そろっても収まる） */
export const PROVERB_KEEP = 80;

const DAY_MS = 86400000;
const isDayKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

export const restoreProverbDex = (raw: unknown): AdvProverbEntry[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AdvProverbEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Partial<AdvProverbEntry>;
    // 本文の正準は PROVERBS。配列から消したことばの記録は落とす（画面に空欄を出さない）
    if (typeof r.id !== 'string' || !proverbById(r.id)) continue;
    if (!isDayKey(r.day) || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      day: r.day,
      learned: r.learned === true,
      recalledDay: isDayKey(r.recalledDay) ? r.recalledDay : null,
    });
  }
  return out.slice(-PROVERB_KEEP);
};

/** 受け取ったことばを手元に足す。すでに持っていれば null（1日1回しか保存が増えない） */
export const collectProverb = (
  dex: AdvProverbEntry[], id: string, todayKey: string,
): AdvProverbEntry[] | null => {
  if (!isDayKey(todayKey) || !proverbById(id)) return null;
  if (dex.some((e) => e.id === id)) return null;
  return [...dex, { id, day: todayKey, learned: false, recalledDay: null }].slice(-PROVERB_KEEP);
};

/** 「おぼえた」の自己申告を立てる／下ろす。変化が無ければ null */
export const markProverbLearned = (
  dex: AdvProverbEntry[], id: string, learned: boolean,
): AdvProverbEntry[] | null => {
  const cur = dex.find((e) => e.id === id);
  if (!cur || cur.learned === learned) return null;
  return dex.map((e) => (e.id === id ? { ...e, learned } : e));
};

/**
 * 今日「覚えていますか？」と1つだけ聞くことば。
 * - 「おぼえた」と言った日から PROVERB_RECALL_DAYS 日**以上**たっている
 *   （毎日開かない人でも取りこぼさない。ちょうどその日に限定しない）
 * - まだ1回も聞いていない（戻ってくるのは1回だけ）
 * - 古いものから
 */
export const dueProverbRecall = (
  dex: AdvProverbEntry[], todayKey: string,
): Proverb | null => {
  if (!isDayKey(todayKey)) return null;
  const target = dex
    .filter((e) => e.learned && e.recalledDay === null)
    .filter((e) => {
      const d = dayDiff(e.day, todayKey);
      return Number.isFinite(d) && d >= PROVERB_RECALL_DAYS;
    })
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))[0];
  return target ? proverbById(target.id) : null;
};

/** 「覚えていますか？」を出したことを記録する（1回だけにするため）。変化が無ければ null */
export const markProverbRecalled = (
  dex: AdvProverbEntry[], id: string, todayKey: string,
): AdvProverbEntry[] | null => {
  if (!isDayKey(todayKey)) return null;
  const cur = dex.find((e) => e.id === id);
  if (!cur || cur.recalledDay !== null) return null;
  return dex.map((e) => (e.id === id ? { ...e, recalledDay: todayKey } : e));
};

export interface ProverbStats {
  /** 手元にあることばの数 */
  collected: number;
  /** そのうち「おぼえた」と自分で決めた数（自己申告であってテストの結果ではない） */
  learned: number;
  /** 全部で何件あるか */
  total: number;
}

export const proverbStats = (dex: AdvProverbEntry[], total: number): ProverbStats => ({
  collected: dex.length,
  learned: dex.filter((e) => e.learned).length,
  total,
});

/**
 * 集めた数の節目（ここに達した日だけ祝う）。
 * ちょうど到達した回だけ返す＝飛び越えたぶんを遡って祝わない（advStreak.crossedMilestone と同じ考え方）。
 */
export const PROVERB_MILESTONES = [5, 10, 20, 30, 60] as const;
export const crossedProverbMilestone = (before: number, after: number): number | null => {
  if (after <= before) return null;
  return (PROVERB_MILESTONES as readonly number[]).includes(after) ? after : null;
};

/**
 * 今日の受け取りで節目に達したか。**状態を持たずに手元の記録から導く**（2026-09-07）。
 *
 * なぜ導出にするか: effect の中で setState すると連鎖描画になり、eslint も止める
 * （react-hooks/set-state-in-effect）。それに、状態で持つと**再読み込みで消える**——
 * 節目に達した日にページを開き直しただけで祝いが無かったことになるのは、実測の記録と
 * 画面が食い違う状態（原則13）。ここは記録から毎回導く。
 */
export const todaysProverbMilestone = (
  dex: AdvProverbEntry[], todayKey: string,
): number | null => {
  if (!dex.some((e) => e.day === todayKey)) return null;   // 今日は受け取っていない
  return (PROVERB_MILESTONES as readonly number[]).includes(dex.length) ? dex.length : null;
};

/** 手元のことば（新しい順）。画面はこれをそのまま並べる */
export const collectedProverbs = (
  dex: AdvProverbEntry[],
): { entry: AdvProverbEntry; proverb: Proverb }[] =>
  [...dex]
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .map((entry) => ({ entry, proverb: proverbById(entry.id) }))
    .filter((x): x is { entry: AdvProverbEntry; proverb: Proverb } => x.proverb !== null);
