// 問題バトルの出題選択と採点（§14・§15・§18）。
// 選択時に考慮: recent exposure / previous correctness / time since last seen /
// question variant / unseen ratio / target coverage。固定メニュー化を防ぐ。
import type { AdvEnemyTier, AdvMasteryAttempt } from './advTypes';
import type { AdvBattleQuestion } from './advVariants';
import { seededShuffle } from './advDiagnosis';

export interface EncounterSpec {
  tier: AdvEnemyTier;
  /** 出題対象（grammarId / unitId の束） */
  targetIds: string[];
  /** targetId → 出題可能プール（validated_beta以上のみ渡すこと・§18） */
  pool: Map<string, AdvBattleQuestion[]>;
  /** 既出問題キー（mastery台帳から） */
  seenKeys: Set<string>;
  /** 直近誤答キー（優先再出題） */
  recentWrongKeys: Set<string>;
  seed: number;
}

export interface Encounter {
  tier: AdvEnemyTier;
  questions: AdvBattleQuestion[];
  /** この編成での未出比率（§15の判定に使う実測値） */
  unseenRatio: number;
  timed: boolean;
  /** 制限時間（秒）。timed=falseなら null */
  timeLimitSec: number | null;
}

const TIER_SIZE: Record<AdvEnemyTier, { size: number; timed: boolean; secPerQ: number }> = {
  normal: { size: 7, timed: false, secPerQ: 0 },
  strong: { size: 10, timed: false, secPerQ: 0 },
  midboss: { size: 12, timed: true, secPerQ: 35 },
  rankboss: { size: 20, timed: true, secPerQ: 40 },
};

/**
 * 敵編成（§14）。
 * - normal: 1テーマ（targetIds先頭）5〜10問・理解確認
 * - strong: 複数テーマ・未出中心・ランダム
 * - midboss/rankboss: 制限時間つき・混合
 * プール不足時は size を実プールへ切り詰める（存在するふりをしない）。
 */
export const buildEncounter = (spec: EncounterSpec): Encounter => {
  const cfg = TIER_SIZE[spec.tier];
  const targets = spec.tier === 'normal' ? spec.targetIds.slice(0, 1) : spec.targetIds;
  const candidates: AdvBattleQuestion[] = [];
  for (const t of targets) candidates.push(...(spec.pool.get(t) ?? []));

  // 選択スコア: 未出+3 / 直近誤答+2 / タイプ多様性はグループ選抜で担保
  const scored = candidates.map((q) => ({
    q,
    score: (spec.seenKeys.has(q.key) ? 0 : 3) + (spec.recentWrongKeys.has(q.key) ? 2 : 0),
  }));
  // 同点はseedで決定的に混ぜる（毎回同じ並びを防ぐ・再現は可能）
  const shuffled = seededShuffle(scored, spec.seed);
  shuffled.sort((a, b) => b.score - a.score);

  // タイプの偏り防止: 同一タイプが上位を占めないよう round-robin で拾う
  const byType = new Map<string, AdvBattleQuestion[]>();
  for (const { q } of shuffled) {
    const list = byType.get(q.type) ?? [];
    list.push(q);
    byType.set(q.type, list);
  }
  const types = [...byType.keys()];
  const picked: AdvBattleQuestion[] = [];
  const used = new Set<string>();
  let i = 0;
  while (picked.length < Math.min(cfg.size, candidates.length) && types.length > 0) {
    const type = types[i % types.length];
    const list = byType.get(type) ?? [];
    const nextQ = list.find((q) => !used.has(q.key));
    if (nextQ) { picked.push(nextQ); used.add(nextQ.key); }
    else { types.splice(i % types.length, 1); continue; }
    i += 1;
  }
  const finalQs = seededShuffle(picked, spec.seed + 7);
  const unseen = finalQs.filter((q) => !spec.seenKeys.has(q.key)).length;
  return {
    tier: spec.tier,
    questions: finalQs,
    unseenRatio: finalQs.length === 0 ? 0 : Math.round((unseen / finalQs.length) * 100) / 100,
    timed: cfg.timed,
    timeLimitSec: cfg.timed ? finalQs.length * cfg.secPerQ : null,
  };
};

export interface EncounterAnswer { key: string; choiceIndex: number | null; }

export interface EncounterResult {
  scorePct: number;
  correctKeys: string[];
  wrongKeys: string[];
  /** 出題の未出比率（編成時の実測） */
  unseenRatio: number;
  withinTime: boolean | null;
  attempt: AdvMasteryAttempt;
}

/** 採点（未回答は誤答扱い＝バトルは逃げると倒せない）。mastery台帳用attemptも作る */
export const gradeEncounter = (
  enc: Encounter, answers: EncounterAnswer[], dateKey: string, nowISO: string, elapsedSec: number | null,
): EncounterResult => {
  const amap = new Map(answers.map((a) => [a.key, a.choiceIndex]));
  const correctKeys: string[] = [];
  const wrongKeys: string[] = [];
  for (const q of enc.questions) {
    const a = amap.get(q.key);
    if (a !== null && a !== undefined && a === q.answerIndex) correctKeys.push(q.key);
    else wrongKeys.push(q.key);
  }
  const total = enc.questions.length;
  const scorePct = total === 0 ? 0 : Math.round((correctKeys.length / total) * 100);
  const withinTime = enc.timed && enc.timeLimitSec !== null
    ? (elapsedSec !== null && elapsedSec <= enc.timeLimitSec)
    : null;
  return {
    scorePct, correctKeys, wrongKeys, unseenRatio: enc.unseenRatio, withinTime,
    attempt: {
      dateKey, scorePct, unseenRatio: enc.unseenRatio,
      questionKeys: enc.questions.map((q) => q.key),
      tier: enc.tier, timed: enc.timed, completedAt: nowISO,
    },
  };
};
