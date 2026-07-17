// ロードマップの調整用定数（12-7 の定着度重み ＋ 推定計算のチューニング値）
// 数値はすべて仮設定。管理画面/Supabaseから変更できるようUI・計算ロジックから分離している。

import type { MasteryState } from './roadmapTypes';

/** 定着度の重み。初回学習だけでは100%にしない（12-7） */
export const MASTERY_WEIGHTS: Record<MasteryState, number> = {
  untouched: 0,
  introduced: 0.2,
  understood: 0.35,
  usedWithHint: 0.5,
  usedSelf: 0.65,
  reviewedDay1: 0.75,
  reviewedDay3: 0.85,
  retainedDay7: 0.95,
  retainedDay30: 1,
};

/** 状態の順序（昇格判定用）。MASTERY_WEIGHTS の重み順と一致させる */
export const MASTERY_ORDER: MasteryState[] = [
  'untouched',
  'introduced',
  'understood',
  'usedWithHint',
  'usedSelf',
  'reviewedDay1',
  'reviewedDay3',
  'retainedDay7',
  'retainedDay30',
];

/** 残りミッション推定のぶれ幅（±20%を基本レンジとする） */
export const MISSION_ESTIMATE_SPREAD = { minFactor: 0.8, maxFactor: 1.2 } as const;

/** 定着率が低い場合に上限を広げる係数（復習のやり直しぶん） */
export const LOW_RETENTION_PENALTY = { threshold: 0.5, maxFactorBoost: 1.15 } as const;

/** 1か月あたりの週数（期間換算用） */
export const WEEKS_PER_MONTH = 4.33;

/** 苦手と表示する苦手度のしきい値 */
export const WEAKNESS_BADGE_THRESHOLD = 0.5;
