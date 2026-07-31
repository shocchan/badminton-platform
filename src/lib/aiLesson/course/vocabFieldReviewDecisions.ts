// field単位のCEOレビュー判断（2026-07-28）。
//
// 既存の状態モデル（FoundationItem.review = item全体のdraft/human_reviewed/approved）を
// 壊さずに、**fieldごと**の判断状態を別構造で持つ（CEO指示 §2）。
//
// 重要:
//   - ここに載っているのは「そのfieldだけをCEOが判断した」記録であって、
//     item・sense・pack全体の human_reviewed / approved を意味しない
//   - 判断キューは、ここに載っているfieldを再度キューに出さない（excludedCeoDecided）
//   - 状態は ceo_decided → applied_draft（静的教材へ反映・validation・tests完了）
//     → human_review_candidate（staging表示確認済み）の順にのみ進む

export type FieldReviewStatus = 'ceo_decided' | 'applied_draft' | 'human_review_candidate';

export interface FieldReviewDecision {
  /** 判断キューの decisionId と同じ形式（rootIssueIdとして機能する） */
  decisionId: string;
  itemId: string;
  field: 'example' | 'meaning_zh' | 'cognate' | 'usage_note' | 'learning_focus';
  /** CEOが確定した値（cognateは分類名・テキストfieldは反映後の値） */
  decidedValueJa: string;
  decidedBy: 'ceo';
  decidedAt: string;            // ISO日付
  status: FieldReviewStatus;
  /** 反映先（人間が追えるように） */
  appliedTo: string;
}

const D = (
  decisionId: string, itemId: string, field: FieldReviewDecision['field'],
  decidedValueJa: string, appliedTo: string, status: FieldReviewStatus,
): FieldReviewDecision => ({
  decisionId, itemId, field, decidedValueJa,
  decidedBy: 'ceo', decidedAt: '2026-07-28', status, appliedTo,
});

/**
 * CEO判断 2026-07-28（14件）。
 * 反映・validation・tests完了で 'applied_draft'、staging表示確認後に 'human_review_candidate'。
 * 2026-07-28 staging実機で fi-namae（例文・ふりがな・訳・note・判断バッジ縮小）と
 * fi-yasui（false friend学習ポイント表示）を確認し、全件 human_review_candidate へ。
 * これは「人間レビュー待ち」であり human_reviewed / approved ではない。
 */
export const CEO_FIELD_DECISIONS: FieldReviewDecision[] = [
  D('fi-namae:example', 'fi-namae', 'example',
    '私の名前は王小明です。／我叫王小明。', 'foundationUnit1.ts + vocabFurigana.ts', 'human_review_candidate'),
  D('fi-namae:meaning_zh', 'fi-namae', 'meaning_zh',
    '姓名；名字（＋usageNoteZh: 在表格或正式场合，「名前」通常指姓名。）', 'foundationUnit1.ts', 'human_review_candidate'),
  D('fi-komaru:meaning_zh', 'fi-komaru', 'meaning_zh',
    '为难；困扰（維持）＋usageNoteZh: 表示“不知道怎么办”的为难或困扰感。', 'foundationVocabN3.ts', 'human_review_candidate'),
  D('fi-kyoumi:cognate', 'fi-kyoumi', 'cognate',
    'mostly_same（維持）＋learningFocusZh追記', 'vocabularyLevelMeta.ts(維持) + vocabContentMeta.ts', 'human_review_candidate'),
  D('fi-genki:cognate', 'fi-genki', 'cognate',
    'partial_overlap', 'vocabularyLevelMeta.ts + vocabContentMeta.ts', 'human_review_candidate'),
  D('fi-kaishain:cognate', 'fi-kaishain', 'cognate',
    'japanese_specific', 'vocabularyLevelMeta.ts + vocabContentMeta.ts', 'human_review_candidate'),
  D('fi-kibun:cognate', 'fi-kibun', 'cognate',
    'japanese_specific（＋usageNoteZh: ≠气氛）', 'vocabularyLevelMeta.ts + foundationVocabN3.ts', 'human_review_candidate'),
  D('fi-nanji:cognate', 'fi-nanji', 'cognate',
    'partial_overlap', 'vocabularyLevelMeta.ts + vocabContentMeta.ts', 'human_review_candidate'),
  D('fi-nihongo:cognate', 'fi-nihongo', 'cognate',
    'japanese_specific', 'vocabularyLevelMeta.ts + vocabContentMeta.ts', 'human_review_candidate'),
  D('fi-soudan:cognate', 'fi-soudan', 'cognate',
    'partial_overlap', 'vocabularyLevelMeta.ts + vocabContentMeta.ts', 'human_review_candidate'),
  D('fi-tomodachi:cognate', 'fi-tomodachi', 'cognate',
    'japanese_specific', 'vocabularyLevelMeta.ts + vocabContentMeta.ts', 'human_review_candidate'),
  D('fi-yakusoku:cognate', 'fi-yakusoku', 'cognate',
    'false_friend', 'vocabularyLevelMeta.ts + vocabContentMeta.ts + N3_POOL', 'human_review_candidate'),
  D('fi-yasui:cognate', 'fi-yasui', 'cognate',
    'false_friend', 'vocabularyLevelMeta.ts + vocabContentMeta.ts + BASIC_POOL', 'human_review_candidate'),
  D('fi-zenzen:cognate', 'fi-zenzen', 'cognate',
    'partial_overlap', 'vocabularyLevelMeta.ts + vocabContentMeta.ts + N3_POOL', 'human_review_candidate'),
];

const byId = new Map(CEO_FIELD_DECISIONS.map((d) => [d.decisionId, d]));

/** このfieldはCEO判断済みか（判断キューが再度キューに出さないための照会） */
export const isCeoDecidedField = (decisionId: string): boolean => byId.has(decisionId);

export const getFieldDecision = (decisionId: string): FieldReviewDecision | undefined => byId.get(decisionId);

/** 集計（報告・テスト用） */
export const fieldDecisionSummary = () => {
  const byStatus: Record<FieldReviewStatus, number> = {
    ceo_decided: 0, applied_draft: 0, human_review_candidate: 0,
  };
  const byField: Record<string, number> = {};
  for (const d of CEO_FIELD_DECISIONS) {
    byStatus[d.status] += 1;
    byField[d.field] = (byField[d.field] ?? 0) + 1;
  }
  return { total: CEO_FIELD_DECISIONS.length, byStatus, byField };
};
