// バド対決ゲームのコアロジック（描画に依存しない純関数のみ）。
// 難易度テーブル・乱数・ランク判定をここに集約する。
// 将来の抽選機能（Supabase Edge Function）はラリー数のみを受け取る想定なので、
// このファイルの値を変えてもサーバー側の当選確率テーブルには影響しない。

/** 30ラリー到達＝カンスト級（かなりの実力者）の閾値 */
export const LEGEND_RALLY = 30;

export interface ShotDifficulty {
  /** AIのショットが相手コート奥から手前に届くまでの時間(ms)。小さいほど速い */
  flightMs: number;
  /** スイングが「間に合った」と判定される着地前の猶予(ms)。小さいほどシビア */
  hitWindowMs: number;
  /** 着地コースの散らばり(0〜1)。1でコート全幅を使う */
  courseSpread: number;
  /** サイドライン際を狙い撃ちする確率(0〜0.6) */
  cornerBias: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** ラリー数 → その次にAIが打つショットの難易度 */
export function difficultyForRally(rally: number): ShotDifficulty {
  return {
    flightMs: clamp(1500 - rally * 28, 700, 1500),
    hitWindowMs: clamp(280 - rally * 4.5, 150, 280),
    courseSpread: Math.min(0.35 + rally * 0.022, 1),
    cornerBias: Math.min(rally * 0.02, 0.6),
  };
}

/**
 * シード付き乱数（mulberry32）。
 * リプレイ検証などでシードを固定できるよう分離してある。
 */
export function createRng(
  seed: number = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * AIショットの着地点を決める。
 * x: コート幅 -1〜1、d: 奥行き（0=自分のベースライン、0.5=ネット）。
 * ラリーが進むほど横は散らばり、前後もネット前ドロップ〜深いクリアまで揺さぶってくる。
 */
export function pickLanding(
  rng: () => number,
  diff: ShotDifficulty,
): { x: number; d: number } {
  let x: number;
  if (rng() < diff.cornerBias) {
    const side = rng() < 0.5 ? -1 : 1;
    x = side * diff.courseSpread * (0.8 + rng() * 0.2) * 0.95;
  } else {
    x = (rng() * 2 - 1) * diff.courseSpread * 0.95;
  }
  // 序盤は中央寄りの深さ、難易度が上がると 0.08（深い）〜0.42（ネット前）まで全部使う
  const depthRange = 0.10 + diff.courseSpread * 0.24;
  const d = 0.25 + (rng() * 2 - 1) * depthRange;
  return { x, d: Math.min(0.42, Math.max(0.08, d)) };
}

// ── スイングタイミング → 返球のブレ ──

/** これを超えて返球が横に流れたらアウトミス（サイドラインを割る） */
export const OUT_X = 0.98;
/** |err| がこれ未満ならPerfect＝ブレなし */
const PERFECT_ZONE = 0.35;
/** 最大ブレ量（err=±1のとき） */
const MAX_DEVIATION = 1.35;

export interface SwingTiming {
  /** -1(限界まで遅い)〜+1(限界まで早い)。0がスイートスポット */
  err: number;
  perfect: boolean;
  /** 返球X座標に加算される横ブレ。早振り=+側、遅振り=-側に流れる */
  deviation: number;
}

/**
 * スイング時刻の評価。remainMs=着地までの残り時間。
 * スイートスポットはウィンドウ中心（hitWindowMs*0.45）。
 * そこからずれるほど返球が横に流れ、ラインを割る＝アウトミスの危険が上がる。
 */
export function evaluateSwingTiming(
  remainMs: number,
  hitWindowMs: number,
): SwingTiming {
  const center = hitWindowMs * 0.45;
  const err = clamp((remainMs - center) / (hitWindowMs * 0.55), -1, 1);
  const perfect = Math.abs(err) < PERFECT_ZONE;
  const deviation = perfect
    ? 0
    : (Math.sign(err) * (Math.abs(err) - PERFECT_ZONE) * MAX_DEVIATION) /
      (1 - PERFECT_ZONE);
  return { err, perfect, deviation };
}

/** ラケット位置とブレから返球の着地Xを算出（|結果| > OUT_X ならアウトミス） */
export function computeReturnX(racketX: number, deviation: number): number {
  return -racketX * 0.35 + deviation;
}

export interface RallyRank {
  min: number;
  label: string;
  message: string;
  emoji: string;
}

export const RALLY_RANKS: RallyRank[] = [
  { min: LEGEND_RALLY, label: 'カンスト級', message: 'かなりの実力者！ここまで来たらもう本物です', emoji: '🏆' },
  { min: 20, label: 'エキスパート', message: '大会で勝てる反射神経！カンスト級まであと少し', emoji: '🔥' },
  { min: 10, label: '上級者', message: 'サークルのエース級！いい目してますね', emoji: '⚡' },
  { min: 5, label: '中級者', message: 'いい感じ！ラリーの流れが見えてきた', emoji: '💪' },
  { min: 0, label: 'ビギナー', message: 'まずは素振りから！次はもっと続くはず', emoji: '🏸' },
];

export function rankForRally(rally: number): RallyRank {
  return RALLY_RANKS.find((r) => rally >= r.min) ?? RALLY_RANKS[RALLY_RANKS.length - 1];
}
