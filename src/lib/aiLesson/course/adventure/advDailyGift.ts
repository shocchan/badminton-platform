// 今日のことば＝その日に配るひとつを決める（2026-09-07 / 第2版で選び方を作り直し）。
//
// 決め方の要件:
//   1. **同じ日に何度開いても同じ**（引き直しでガチャにしない。学習の材料であって運試しではない）
//   2. **人によってずれる**（同じ日に全員が同じ言葉だと、先生が個別に話しづらい）
//   3. **まだ持っていないものから配る**（第2版）。集めるものなので、持っている札を
//      もう一度引かされると「集まっていく」感じが消える
//   4. **その日に合うものを優先する**（第2版）。久しぶりに戻ってきた人に「三日坊主」を
//      渡してはいけない。逆に、戻ってきた日に「七転び八起き」が来ると効く
//   5. **実力より上のことばばかり出さない**（第2版）。初級の人に「覆水盆に返らず」を
//      並べても読めない。ただし完全に閉じない——1つ上の帯も混ぜて、伸びる余地は残す
//   6. 乱数を使わない＝保存しなくても再現できる。日付・人・持ち物だけで決まる
import { PROVERBS, type Proverb, type ProverbBand, type ProverbMood } from './advProverbs';
import type { JlptLevel } from './advTypes';

const DAY_MS = 86400000;

/** 文字列 → 0以上の整数（安定・短い。暗号用途ではない） */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** 1970-01-01 からの日数（YYYY-MM-DD をUTCで解釈） */
const dayIndex = (dateKey: string): number => Math.floor(Date.parse(dateKey) / DAY_MS);

/**
 * 目標レベル → ことばの帯。**JLPTの級とことわざの難易度は別物**なので、
 * ここでやっているのは「初級の人に難しい言い回しを先に出さない」だけ（ProverbBand の注記）。
 */
export const bandForLevel = (level: JlptLevel | null | undefined): ProverbBand | null => {
  if (level === 'N5' || level === 'N4') return 'basic';
  if (level === 'N3') return 'middle';
  if (level === 'N2' || level === 'N1') return 'upper';
  return null;   // 未設定。**勝手にどちらかへ倒さない**（倒すと片側の札が一生出なくなる）
};

/**
 * その人に出してよい帯。1つ上まで混ぜる＝伸びる余地を残す。
 * 目標レベルが未設定の人には**しぼらない**（診断前の人から札を隠す理由がない）。
 */
const allowedBands = (band: ProverbBand | null): ProverbBand[] =>
  band === 'basic' ? ['basic', 'middle']
    : band === 'middle' ? ['basic', 'middle', 'upper']
      : band === 'upper' ? ['middle', 'upper']
        : ['basic', 'middle', 'upper'];

export interface GiftContext {
  /** ローカル日付キー YYYY-MM-DD */
  dateKey: string;
  /** 人ごとに並びをずらす種（learner id など） */
  seed?: string;
  /** すでに手元にあることばのid */
  collected?: string[];
  /** その日の状況（advVisit.visitGreeting から導く） */
  mood?: ProverbMood | null;
  /** 目標レベル。難しすぎることばを先に出さないため */
  level?: JlptLevel | null;
}

/**
 * 候補をしぼる。**しぼりすぎて0件になったら、ひとつ前の条件へ戻す**——
 * 条件に合うものが無い日に画面を空にしない（原則15: 行き止まりを作らない）。
 * 優先順: 未収集×帯×気分 → 未収集×帯 → 未収集 → 全部
 */
const candidatesFor = (ctx: GiftContext): Proverb[] => {
  const have = new Set(ctx.collected ?? []);
  const bands = new Set(allowedBands(bandForLevel(ctx.level)));
  const fresh = PROVERBS.filter((p) => !have.has(p.id));
  const inBand = fresh.filter((p) => bands.has(p.band));
  if (ctx.mood) {
    const byMood = inBand.filter((p) => p.mood.includes(ctx.mood as ProverbMood));
    if (byMood.length > 0) return byMood;
  }
  if (inBand.length > 0) return inBand;
  if (fresh.length > 0) return fresh;
  return PROVERBS;   // 全部集めた人には、また最初から回す（もらえない日を作らない）
};

/**
 * その日のことば。dateKey が壊れていたら先頭を返す（画面を空にしない）。
 */
export const todayProverbFor = (ctx: GiftContext): Proverb => {
  const pool = candidatesFor(ctx);
  const day = dayIndex(ctx.dateKey);
  if (!Number.isFinite(day)) return pool[0] ?? PROVERBS[0];
  // 日付と人から決まる位置。候補が減っても同じ日なら同じものが出る
  const i = (hash(`${ctx.dateKey}|${ctx.seed ?? ''}`) + day) % pool.length;
  return pool[i];
};

/** 旧シグネチャ（候補をしぼらない単純版）。テストと、文脈を持たない呼び出し用に残す */
export const todayProverb = (dateKey: string, learnerSeed = ''): Proverb =>
  todayProverbFor({ dateKey, seed: learnerSeed });

export const PROVERB_TOTAL = PROVERBS.length;
