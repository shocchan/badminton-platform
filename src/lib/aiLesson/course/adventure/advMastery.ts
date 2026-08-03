// 80%攻略台帳（§15）。「1回80%」で攻略にしない:
// ① ランダム問題で80%以上（未出問題を一定割合含む） ② 別の日に3回 ③ 7日後の遅延確認でも80%以上
// ④ 問題ID暗記では達成できない（unseenRatio条件） ⑤ 複数問題タイプを含む。
import type { AdvMasteryAttempt, AdvMasteryLedger, AdvMasteryState } from './advTypes';

export const MASTERY_RULES = {
  passPct: 80,
  /** qualifying試行に必要な未出問題比率（プールが小さい場合は attempt側で下がるが、0は不可） */
  minUnseenRatio: 0.3,
  /** 別日回数 */
  requiredDays: 3,
  /** 遅延確認までの日数 */
  delayDays: 7,
  /** 5問以上の試行に求める問題タイプ数（プールに複数タイプがある場合） */
  minQuestionTypes: 2,
  /** 1target当たり保持する試行履歴の上限（jsonb肥大防止・古い順に間引く） */
  maxAttemptsKept: 24,
} as const;

/** 問題キーの型接頭辞（rec: / cloze: / meaning: / form: / n3q: …） */
export const questionTypeOf = (key: string): string => key.split(':')[0] ?? 'unknown';

/** 試行がqualifying（攻略にカウントできる）か */
export const isQualifyingAttempt = (a: AdvMasteryAttempt, poolHasMultipleTypes: boolean): boolean => {
  // 欠けた項目があっても落ちない。定着の記録が1件でも壊れていると
  // 学習画面が丸ごと真っ白になり、その生徒は二度と入れなくなる。
  // 判定できないものは「合格していない」に倒す（甘く数えない）
  if (typeof a?.scorePct !== 'number' || a.scorePct < MASTERY_RULES.passPct) return false;
  if (typeof a.unseenRatio !== 'number' || a.unseenRatio < MASTERY_RULES.minUnseenRatio) return false;
  const keys = Array.isArray(a.questionKeys) ? a.questionKeys : [];
  if (poolHasMultipleTypes && keys.length >= 5) {
    const types = new Set(keys.map(questionTypeOf));
    if (types.size < MASTERY_RULES.minQuestionTypes) return false;
  }
  return true;
};

/** 試行を台帳へ追記（イミュータブル・履歴上限あり） */
export const recordAttempt = (
  ledger: AdvMasteryLedger, targetId: string, attempt: AdvMasteryAttempt,
): AdvMasteryLedger => {
  const prev = ledger[targetId] ?? [];
  const next = [...prev, attempt];
  const kept = next.length > MASTERY_RULES.maxAttemptsKept
    ? next.slice(next.length - MASTERY_RULES.maxAttemptsKept)
    : next;
  return { ...ledger, [targetId]: kept };
};

/** この学習者が過去に見た問題キー（未出判定に使う） */
export const seenQuestionKeys = (ledger: AdvMasteryLedger, targetIds?: string[]): Set<string> => {
  const seen = new Set<string>();
  const entries = targetIds ?? Object.keys(ledger);
  for (const t of entries) for (const a of ledger[t] ?? []) for (const k of a.questionKeys) seen.add(k);
  return seen;
};

export interface MasteryStatus {
  state: AdvMasteryState;
  /** qualifying達成済みの別日（昇順・最大 requiredDays 表示） */
  qualifyingDays: string[];
  /** 遅延確認が可能になる日時（ISO）。null=まだ3日未達 */
  delayCheckOpensAt: string | null;
  /** 遅延確認済みか */
  delayedConfirmed: boolean;
  /** 次に必要なこと（正直な表示・§21） */
  nextJa: string; nextZh: string;
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

/**
 * 攻略状態の算出（純関数）。
 * poolHasMultipleTypes: 対象の問題プールに複数タイプが存在するか（存在しない場合はタイプ条件を課さない）
 */
export const computeMastery = (
  attempts: AdvMasteryAttempt[] | undefined, nowISO: string, poolHasMultipleTypes = true,
): MasteryStatus => {
  const all = attempts ?? [];
  if (all.length === 0) {
    return {
      state: 'not_started', qualifyingDays: [], delayCheckOpensAt: null, delayedConfirmed: false,
      nextJa: 'ランダム問題で80%以上を目指す', nextZh: '目标：随机题拿到80%以上',
    };
  }
  const qualifying = all.filter((a) => isQualifyingAttempt(a, poolHasMultipleTypes));
  const dayMap = new Map<string, AdvMasteryAttempt>();
  for (const a of qualifying) if (!dayMap.has(a.dateKey)) dayMap.set(a.dateKey, a);
  const days = [...dayMap.keys()].sort();

  if (days.length < MASTERY_RULES.requiredDays) {
    const remain = MASTERY_RULES.requiredDays - days.length;
    return {
      state: 'in_progress', qualifyingDays: days, delayCheckOpensAt: null, delayedConfirmed: false,
      nextJa: `別の日にあと${remain}回、80%以上（未出問題を含む）`,
      nextZh: `还需在不同的日子再拿${remain}次80%以上（含未见过的题）`,
    };
  }

  // 3日目のqualifying完了時刻から delayDays 後に遅延確認が開く
  const thirdDay = days[MASTERY_RULES.requiredDays - 1];
  const thirdAt = dayMap.get(thirdDay)?.completedAt ?? nowISO;
  const opensAt = addDays(thirdAt, MASTERY_RULES.delayDays);
  const delayed = qualifying.some((a) => a.completedAt >= opensAt);
  if (delayed) {
    return {
      state: 'mastered', qualifyingDays: days.slice(0, 3), delayCheckOpensAt: opensAt, delayedConfirmed: true,
      nextJa: '攻略済み。ときどき復習で維持', nextZh: '已攻克。偶尔复习保持',
    };
  }
  const open = nowISO >= opensAt;
  return {
    state: 'cleared_pending_delay', qualifyingDays: days.slice(0, 3), delayCheckOpensAt: opensAt, delayedConfirmed: false,
    nextJa: open ? '7日後の確認バトルで80%以上を取れば攻略' : '7日後に確認バトルがあります（忘れていないかの確認）',
    nextZh: open ? '通过7天后的复查战（80%以上）即攻克' : '7天后有一场复查战（确认没有遗忘）',
  };
};

/** ledger全体から mastered な targetId 集合 */
export const masteredTargetIds = (ledger: AdvMasteryLedger, nowISO: string): Set<string> => {
  const done = new Set<string>();
  for (const [t, attempts] of Object.entries(ledger)) {
    if (computeMastery(attempts, nowISO).state === 'mastered') done.add(t);
  }
  return done;
};

/** stage攻略判定: stage束target（targetId=stageId）が mastered か */
export const masteredStageIds = (ledger: AdvMasteryLedger, stageIds: string[], nowISO: string): Set<string> => {
  const done = new Set<string>();
  for (const s of stageIds) if (computeMastery(ledger[s], nowISO).state === 'mastered') done.add(s);
  return done;
};

/** 攻略率（qualifying日数と遅延確認を重みづけ。1回の高得点で跳ねない） */
export const masteryProgressPct = (attempts: AdvMasteryAttempt[] | undefined, nowISO: string, poolHasMultipleTypes = true): number => {
  const st = computeMastery(attempts, nowISO, poolHasMultipleTypes);
  if (st.state === 'mastered') return 100;
  const dayPart = Math.min(st.qualifyingDays.length, 3) * 25; // 3日で75%
  const delayPart = st.state === 'cleared_pending_delay' ? 10 : 0;
  return Math.min(85, dayPart + delayPart);
};
