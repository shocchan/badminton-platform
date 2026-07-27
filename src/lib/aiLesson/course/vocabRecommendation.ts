// 今日の語彙推薦（Phase 2E-1.10 §8）。
// roleと診断結果・自己評価・問題結果・復習期限を、実際の推薦順位へ接続する。
// 推薦理由は決定的（根拠不明な「AIのおすすめ」表現を作らない・§8）。
// preview simulation（§9）: 提案roleを試験適用して影響を確認できるが、教材のroleは変更しない。
import type { VocabProgressRepository } from './vocabProgress';
import type { VocabularyTrack, VocabularyPackItemRole } from './vocabularyPacks';
import { roleFor } from './vocabularyPacks';
import type { VocabSpacedReviewRepository } from './vocabSpacedReview';
import { levelMetaOf } from './vocabularyLevelMeta';
import { deriveDiagnosticOutcome } from './vocabProgress';

/** 推薦理由（利用者へそのまま説明できる決定的な根拠・§8） */
export type RecommendationReason =
  | 'overdue_review'        // 期限を過ぎた復習
  | 'due_today'             // 今日が復習の日
  | 'wrong_last_time'       // 前回間違えた
  | 'learner_uncertain'     // 本人が「まだ不安」にした
  | 'remedial'              // 診断で確認が必要になった
  | 'pack_required'         // 現在パックで必ず確認する語
  | 'pack_diagnostic'       // 現在パックで短く確認する語
  | 'current_unit'          // 今の単元・会話で使う語
  | 'optional'              // 任意の語
  | 'enrichment'            // 余裕があれば
  | 'explore';              // 自由探索

/** 理由の優先順位（§8の11段階・数値が小さいほど優先） */
export const REASON_PRIORITY: Record<RecommendationReason, number> = {
  overdue_review: 1, due_today: 2, wrong_last_time: 3, learner_uncertain: 4, remedial: 5,
  pack_required: 6, pack_diagnostic: 7, current_unit: 8, optional: 9, enrichment: 10, explore: 11,
};

export interface RecommendedWord {
  itemId: string;
  reason: RecommendationReason;
  /** 由来のrole（説明・シミュレーション比較用） */
  role: VocabularyPackItemRole;
  /** この語がroleにより順位を得たか（role接続の可視化・§8） */
  roleDriven: boolean;
}

export interface RecommendationInput {
  allIds: string[];
  packId: string;
  track: VocabularyTrack;
  currentUnitItemIds: string[];
  progress: VocabProgressRepository;
  schedule: VocabSpacedReviewRepository;
  /** roleの上書き（§9 preview simulation専用。教材データは変更しない） */
  roleOverrides?: Record<string, VocabularyPackItemRole>;
  /** 直近数日で既に出した語（同じ語を毎日繰り返さない・§8） */
  recentlyShownIds?: string[];
  count?: number;
}

const roleOf = (input: RecommendationInput, itemId: string): VocabularyPackItemRole =>
  input.roleOverrides?.[itemId] ?? roleFor(input.packId, input.track, itemId);

/**
 * 今日の推薦（決定的）。優先順位は §8 の11段階。
 * confirmed diagnosticは、別次元の弱点・期限・不安がない限り後回し（§8）。
 * N2トラックではtransparent_sameの基礎語を新語として優先しない（§8）。
 */
export const recommendWords = (input: RecommendationInput): RecommendedWord[] => {
  const { allIds, progress, schedule, currentUnitItemIds, track } = input;
  const count = input.count ?? 3;
  const recent = new Set(input.recentlyShownIds ?? []);
  const idSet = new Set(allIds);
  const picked: RecommendedWord[] = [];
  const seen = new Set<string>();
  const add = (itemId: string, reason: RecommendationReason, roleDriven: boolean) => {
    if (picked.length >= count || seen.has(itemId) || !idSet.has(itemId)) return;
    seen.add(itemId);
    picked.push({ itemId, reason, role: roleOf(input, itemId), roleDriven });
  };

  // ①② 期限の復習（期限超過→今日）。既出でも復習は出す（毎日繰り返し除外の対象外）
  for (const d of schedule.getDue()) add(d.itemId, d.overdueDays > 0 ? 'overdue_review' : 'due_today', false);
  // ③ 直近の問題で誤答した語（自己申告の「まだ不安」は④で別理由にする＝表示理由を正確に保つ）
  for (const id of progress.getReviewItemIds()) {
    const tests = progress.getEntry(id).tests;
    if (tests.length > 0 && !tests[tests.length - 1].correct) add(id, 'wrong_last_time', false);
  }
  // ④ 本人が「まだ不安」（スケジュール側のフラグ＋自己評価の両方を見る）
  for (const s of schedule.getAll()) if (s.learnerUncertain) add(s.itemId, 'learner_uncertain', false);
  for (const id of allIds) if (progress.getEntry(id).selfAssessment === 'needs_review') add(id, 'learner_uncertain', false);
  // ⑤ 診断でremedialになった語
  const outcomes = progress.getDiagnosticOutcomes(input.packId);
  for (const id of allIds) if (deriveDiagnosticOutcome(progress.getDiagnosticEntry(input.packId, id)) === 'remedial') add(id, 'remedial', true);

  // ここから新規学習。同じ語を毎日繰り返さない（recentは後回し）
  const fresh = allIds.filter((id) => !recent.has(id));
  const isUntouched = (id: string) => progress.getEntry(id).selfAssessment === 'unseen';
  const isConfirmedDiagnostic = (id: string) => outcomes[id] === 'basic_confirmed';
  // N2準備では、中国語と同形で意味が通じる基礎語を新語として優先しない（§8）
  const deprioritized = (id: string) => track === 'n2_prep' && levelMetaOf(id).cognate === 'transparent_same';

  // ⑥ 現在パックのrequired未確認（roleが推薦へ効く中心・§8）
  for (const id of fresh) if (roleOf(input, id) === 'required' && isUntouched(id) && !deprioritized(id)) add(id, 'pack_required', true);
  // ⑦ 現在パックのdiagnostic未確認（確認済みは後回し）
  for (const id of fresh) if (roleOf(input, id) === 'diagnostic' && isUntouched(id) && !isConfirmedDiagnostic(id) && !deprioritized(id)) add(id, 'pack_diagnostic', true);
  // ⑧ 今の単元・会話で使う語
  for (const id of currentUnitItemIds) if (!recent.has(id) && isUntouched(id)) add(id, 'current_unit', false);
  // ⑨⑩ optional / enrichment
  for (const id of fresh) if (roleOf(input, id) === 'optional' && isUntouched(id)) add(id, 'optional', true);
  for (const id of fresh) if (roleOf(input, id) === 'enrichment' && isUntouched(id)) add(id, 'enrichment', true);
  // ⑪ 自由探索（後回し語・既出語を含む最後の受け皿。空画面にしない）
  for (const id of allIds) if (isUntouched(id)) add(id, 'explore', false);
  return picked;
};

/** role提案のpreview比較（§9・教材は変更しない） */
export interface RolePreviewComparison {
  current: RecommendedWord[];
  proposed: RecommendedWord[];
  /** 提案roleで推薦に入るようになった語 */
  addedItemIds: string[];
  /** 提案roleで推薦から外れた語 */
  removedItemIds: string[];
  /** 影響を受けた語数（推薦順位・理由が変わった語） */
  changedCount: number;
}

export const compareRolePreview = (
  input: RecommendationInput, roleOverrides: Record<string, VocabularyPackItemRole>,
): RolePreviewComparison => {
  const current = recommendWords({ ...input, roleOverrides: undefined });
  const proposed = recommendWords({ ...input, roleOverrides });
  const cur = new Map(current.map((r) => [r.itemId, r.reason]));
  const pro = new Map(proposed.map((r) => [r.itemId, r.reason]));
  return {
    current, proposed,
    addedItemIds: [...pro.keys()].filter((id) => !cur.has(id)),
    removedItemIds: [...cur.keys()].filter((id) => !pro.has(id)),
    changedCount: [...pro.entries()].filter(([id, r]) => cur.get(id) !== r).length,
  };
};
