// 目標までの「残り量」と実測ペース（CEO要望 2026-08-14:
// 「あとどれくらい打ち込めば目標達成レベルになるか、理想と現状のギャップと残りを見せる」）。
//
// 鉄則（PRODUCT_CANON 原則13: 数字を作らない）:
// - 残り量（地域数・項目数）はいつでも正確に数えられるので常に返す
// - ペースと完了予測は実測が MIN_PACE_DAYS 分たまるまで null（未測定）を返す
// - 予測は推定。UI側では「合格できる/できない」の断定表現にしない
import type { AdvRoute, AdvMasteryLedger } from './advTypes';
import { isConversationStage, stageMasteryTargetIds } from './advRoute';
import { masteredTargetIds, masteredTargetIdsAsOf } from './advMastery';

export interface AdvPace {
  /** 未攻略の地域（stage）数。会話レーンは攻略判定が無いので母数から除く */
  remainingStages: number;
  /** 未攻略の項目数（単元・文法束）。会話レーン配下は含まない */
  remainingTargets: number;
  /** 実測: 直近window（最大4週）の週あたり新規定着数。実測2週未満は null */
  measuredPerWeek: number | null;
  /** このペースでの残り週数（切上・推定）。ペース未測定/0なら null。残り0なら 0 */
  estWeeksLeft: number | null;
  /** 受験日までに終えるのに必要な週あたり定着数（切上）。受験日なし/過ぎは null */
  neededPerWeek: number | null;
  /** 推定残り週数が受験日に収まるか。どちらか欠けていれば null（断定しない） */
  onTrack: boolean | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** ペースを口にするのに必要な最低実測日数（2週間） */
export const MIN_PACE_DAYS = 14;
/** ペース実測の遡り上限（直近4週の実測を「いまのペース」と呼ぶ） */
export const PACE_WINDOW_DAYS = 28;

export const computePace = (input: {
  route: AdvRoute;
  ledger: AdvMasteryLedger;
  nowISO: string;
  /** 試験まで日数（shellの daysToExamOf の値。試験後は null を渡す） */
  daysToExam: number | null;
  /** deriveMasteredStageIds の結果（ボス撃破記録も含む攻略済stage） */
  stageDone: Set<string>;
  n3Ids: string[];
  n2ByUnit: Map<number, string[]>;
  n3BundleByItem?: Map<string, string>;
  basicByUnit?: Map<string, string[]>;
  basicBundleByUnit?: Map<string, string>;
}): AdvPace => {
  const { route, ledger, nowISO, daysToExam, stageDone, n3Ids, n2ByUnit, n3BundleByItem, basicByUnit, basicBundleByUnit } = input;
  const masteredNow = masteredTargetIds(ledger, nowISO);

  const remainingTargetSet = new Set<string>();
  let remainingStages = 0;
  for (const s of route.stages) {
    if (isConversationStage(s) || stageDone.has(s.stageId)) continue;
    remainingStages += 1;
    for (const id of stageMasteryTargetIds(s, n3Ids, n2ByUnit, n3BundleByItem, basicByUnit, basicBundleByUnit)) {
      if (!masteredNow.has(id)) remainingTargetSet.add(id);
    }
  }
  const remainingTargets = remainingTargetSet.size;

  // 実測ペース: 最古attemptから14日以上たっていれば、直近window内の新規定着数を数える
  let earliest: string | null = null;
  for (const attempts of Object.values(ledger)) {
    for (const a of attempts ?? []) {
      if (earliest === null || a.completedAt < earliest) earliest = a.completedAt;
    }
  }
  const now = Date.parse(nowISO);
  const observedDays = earliest !== null ? Math.floor((now - Date.parse(earliest)) / DAY_MS) : 0;
  let measuredPerWeek: number | null = null;
  if (observedDays >= MIN_PACE_DAYS) {
    const windowDays = Math.min(PACE_WINDOW_DAYS, observedDays);
    const beforeSet = masteredTargetIdsAsOf(ledger, new Date(now - windowDays * DAY_MS).toISOString());
    const delta = [...masteredNow].filter((t) => !beforeSet.has(t)).length;
    measuredPerWeek = Math.round((delta / (windowDays / 7)) * 10) / 10;
  }

  const estWeeksLeft = remainingTargets === 0 ? 0
    : measuredPerWeek !== null && measuredPerWeek > 0
      ? Math.ceil(remainingTargets / measuredPerWeek)
      : null;
  const neededPerWeek = daysToExam === null || daysToExam <= 0 ? null
    : remainingTargets === 0 ? 0
      : Math.ceil(remainingTargets / (daysToExam / 7));
  const onTrack = daysToExam === null || estWeeksLeft === null ? null
    : estWeeksLeft * 7 <= daysToExam;

  return { remainingStages, remainingTargets, measuredPerWeek, estWeeksLeft, neededPerWeek, onTrack };
};
