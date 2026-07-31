// 問題バトルの出題選択と採点（§14・§15・§18 ＋ ASSESSMENT INTEGRITY §10〜§14）。
// 選択時に考慮: recent exposure / previous correctness / question variant / unseen ratio / target coverage。
// 採点は **correctChoiceId** のみで行い、表示位置は使わない。
import type { AdvEnemyTier, AdvMasteryAttempt } from './advTypes';
import type { AdvBattleQuestion } from './advVariants';
import { seededShuffle } from './advDiagnosis';
import { presentBattle, isCorrectAnswer, type PresentedQuestion } from './advChoiceOrder';
import { battleScopeName, type ExamSkill } from './advExamSkills';

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
  /** 提示順つき（表示・採点はこちらを使う） */
  presented: PresentedQuestion[];
  /** この編成での未出比率（§15の判定に使う実測値） */
  unseenRatio: number;
  timed: boolean;
  /** 制限時間（秒）。timed=falseなら null */
  timeLimitSec: number | null;
  /** この編成が鍛えている試験科目（§10・表示必須） */
  skills: ExamSkill[];
  attemptSeed: number;
}

const TIER_SIZE: Record<AdvEnemyTier, { size: number; timed: boolean; secPerQ: number }> = {
  normal: { size: 7, timed: false, secPerQ: 0 },
  strong: { size: 10, timed: false, secPerQ: 0 },
  midboss: { size: 12, timed: true, secPerQ: 35 },
  rankboss: { size: 20, timed: true, secPerQ: 40 },
};

/**
 * 敵編成（§14）。プール不足時は size を実プールへ切り詰める（存在するふりをしない）。
 * attemptSeed は「この挑戦」固有の値を渡すこと（同一attemptで安定・次attemptで変化）。
 */
export const buildEncounter = (spec: EncounterSpec & { attemptSeed?: number }): Encounter => {
  const cfg = TIER_SIZE[spec.tier];
  const targets = spec.tier === 'normal' ? spec.targetIds.slice(0, 1) : spec.targetIds;
  const candidates: AdvBattleQuestion[] = [];
  for (const t of targets) candidates.push(...(spec.pool.get(t) ?? []));

  // 選択スコア: 未出+3 / 直近誤答+2
  const scored = candidates.map((q) => ({
    q,
    score: (spec.seenKeys.has(q.key) ? 0 : 3) + (spec.recentWrongKeys.has(q.key) ? 2 : 0),
  }));
  const shuffled = seededShuffle(scored, spec.seed);
  shuffled.sort((a, b) => b.score - a.score);

  // タイプの偏り防止: round-robin で拾う
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
  const attemptSeed = spec.attemptSeed ?? spec.seed;
  return {
    tier: spec.tier,
    questions: finalQs,
    presented: presentBattle(finalQs, attemptSeed),
    unseenRatio: finalQs.length === 0 ? 0 : Math.round((unseen / finalQs.length) * 100) / 100,
    timed: cfg.timed,
    timeLimitSec: cfg.timed ? finalQs.length * cfg.secPerQ : null,
    skills: [...new Set(finalQs.map((q) => q.skill))],
    attemptSeed,
  };
};

/** この編成の名前（文法だけなら「文法バトル」・§5） */
export const encounterName = (enc: Encounter, level: 'N2' | 'N3', lang: 'ja' | 'zh'): string =>
  battleScopeName(enc.skills, level, lang);

/** 回答（choiceId。未回答はnull） */
export interface EncounterAnswer { key: string; choiceId: string | null; }

export interface EncounterResult {
  scorePct: number;
  correctKeys: string[];
  wrongKeys: string[];
  unseenRatio: number;
  withinTime: boolean | null;
  attempt: AdvMasteryAttempt;
  /** skill別の正誤（準備度へ渡す・§9） */
  bySkill: Record<string, { correct: number; total: number; unseen: number }>;
}

/** 採点（未回答は誤答扱い）。mastery台帳用attemptも作る */
export const gradeEncounter = (
  enc: Encounter, answers: EncounterAnswer[], dateKey: string, nowISO: string, elapsedSec: number | null,
  seenKeysAtStart?: Set<string>,
): EncounterResult => {
  const amap = new Map(answers.map((a) => [a.key, a.choiceId]));
  const pmap = new Map(enc.presented.map((p) => [p.key, p]));
  const correctKeys: string[] = [];
  const wrongKeys: string[] = [];
  const bySkill: EncounterResult['bySkill'] = {};
  for (const q of enc.questions) {
    const p = pmap.get(q.key);
    const picked = amap.get(q.key) ?? null;
    const ok = p ? isCorrectAnswer(p, picked ?? null) : false;
    (ok ? correctKeys : wrongKeys).push(q.key);
    const row = bySkill[q.skill] ?? { correct: 0, total: 0, unseen: 0 };
    row.total += 1;
    if (ok) row.correct += 1;
    if (seenKeysAtStart && !seenKeysAtStart.has(q.key)) row.unseen += 1;
    bySkill[q.skill] = row;
  }
  const total = enc.questions.length;
  const scorePct = total === 0 ? 0 : Math.round((correctKeys.length / total) * 100);
  const withinTime = enc.timed && enc.timeLimitSec !== null
    ? (elapsedSec !== null && elapsedSec <= enc.timeLimitSec)
    : null;
  return {
    scorePct, correctKeys, wrongKeys, unseenRatio: enc.unseenRatio, withinTime, bySkill,
    attempt: {
      dateKey, scorePct, unseenRatio: enc.unseenRatio,
      questionKeys: enc.questions.map((q) => q.key),
      tier: enc.tier, timed: enc.timed, completedAt: nowISO,
      skills: enc.skills,
      bySkill,
    },
  };
};
