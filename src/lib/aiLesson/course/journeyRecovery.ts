// 初回Journeyの部分成功Recovery（Phase 2E-1.14 §5）。
//
// 練習の最終操作は「学習記録の保存 → 復習予定の生成 → 契約完了 → Journeyのstep更新 → 画面遷移」
// という複数の書き込みからなる。途中で再読込・タブを閉じる・保存失敗が起きると、
// 一部だけ成功した状態が残る。この関数は **保存済みの事実だけ** から
// 「どこまで成功したか」と「次に何をすればよいか」を決定的に判定する。
//
// 原則:
//   - URLやrouteでは判断しない（保存された契約とJourney状態だけを見る）
//   - 学習をやり直させない（学習記録が残っているなら再実行しない）
//   - tokenを再消費しない・completedTaskIdsを再追加しない
//   - 取得できなかった値を推測で作らない
//   - この関数自体は副作用を持たない（判定と適用を分ける）
import type { JourneyTaskContract } from './journeyTaskContract';
import type { JourneyStep } from './firstRunJourney';

/** 何が起きていたか（学習者には見せない・開発とテストのための語彙） */
export type JourneyRepairKind =
  /** 修復不要 */
  | 'none'
  /** 契約は完了しているのにJourneyのstepが前のまま（stepだけ直す） */
  | 'step_behind'
  /** 契約は完了・stepも正しい・画面だけ前（表示するだけ） */
  | 'view_behind'
  /** 学習は終わっているのに契約が未完了（契約完了を再試行する） */
  | 'contract_pending'
  /** 契約は完了したが結果が保存されていない（結果は再導出できる場合のみ） */
  | 'snapshot_missing';

export interface JourneyRepairPlan {
  kind: JourneyRepairKind;
  /** Journeyをこのstepにする（変更不要なら null） */
  setStep: JourneyStep | null;
  /** この画面を表示する（変更不要なら null） */
  showView: 'firstrun' | null;
  /** 契約完了を再試行してよいか（learner側の学習はやり直させない） */
  retryContractCompletion: boolean;
  /** 結果が欠けている（Step4では欠損として扱い、0と断定しない） */
  snapshotMissing: boolean;
}

const NO_REPAIR: JourneyRepairPlan = {
  kind: 'none', setStep: null, showView: null,
  retryContractCompletion: false, snapshotMissing: false,
};

export interface JourneyRepairInput {
  contract: JourneyTaskContract | null;
  /** Journeyの現在ステップ */
  step: JourneyStep;
  /** Journeyが完了済みか（完了後は修復しない） */
  journeyCompleted: boolean;
  /** 現在表示している画面 */
  currentView: string;
  /**
   * 学習側に「その回のタスクの結果」が残っているか。
   * 契約が未完了でも、これが true なら学習自体は終わっている＝やり直させない。
   */
  hasLearningResult: boolean;
}

/**
 * 契約の進行記録から「その回の練習が最後まで終わっているか」を判定する。
 * 総数が記録されていない古い契約では判定できないので false（＝やり直させない代わりに、
 * 勝手に完了ともしない）。
 */
export const isTaskFinished = (contract: JourneyTaskContract | null): boolean => {
  const p = contract?.taskProgress;
  if (!p || typeof p.totalWords !== 'number' || p.totalWords <= 0) return false;
  return p.completedWordIds.length >= p.totalWords;
};

/** 保存済みの事実から修復計画を決める（副作用なし・同じ入力なら必ず同じ結果） */
export const planJourneyRepair = (input: JourneyRepairInput): JourneyRepairPlan => {
  const { contract, step, journeyCompleted, currentView, hasLearningResult } = input;
  if (journeyCompleted) return NO_REPAIR;      // 完了したJourneyには触れない
  if (!contract) return NO_REPAIR;             // 契約が無ければ通常フロー

  const expectedStep: JourneyStep = contract.returnStep === 'practice' ? 'practice' : 'done';
  const isCompleted = contract.activeTaskStatus === 'completed'
    || contract.completedTaskIds.includes(contract.activeTaskId);

  if (isCompleted) {
    if (step !== expectedStep) {
      // 契約は完了・Journeyだけ前 → stepだけ直す。tokenもcompletedTaskIdsも触らない
      return {
        kind: 'step_behind', setStep: expectedStep, showView: 'firstrun',
        retryContractCompletion: false, snapshotMissing: contract.completionSnapshot === null,
      };
    }
    if (contract.completionSnapshot === null) {
      // 完了はしているが結果が無い。推測で数値を作らず、欠損として扱う
      return {
        kind: 'snapshot_missing', setStep: null, showView: 'firstrun',
        retryContractCompletion: false, snapshotMissing: true,
      };
    }
    if (currentView !== 'firstrun') {
      // 状態は完結・画面だけ前 → 表示するだけ（完了処理は再実行しない）
      return {
        kind: 'view_behind', setStep: null, showView: 'firstrun',
        retryContractCompletion: false, snapshotMissing: false,
      };
    }
    return NO_REPAIR;
  }

  // 契約は未完了。学習側に結果が残っているなら、学習ではなく契約完了だけをやり直す
  if (hasLearningResult) {
    return {
      kind: 'contract_pending', setStep: null, showView: null,
      retryContractCompletion: true, snapshotMissing: false,
    };
  }
  return NO_REPAIR;
};
