// 視覚教材アセットのデータモデル（Phase 2C+ §15）。
// 画像ファイルはbundleへ埋め込まずpublic配下。存在しない段階のエントリはreviewStatus='planned'。
export type VisualAssetType =
  | 'scene_illustration' | 'contrast_illustration' | 'grammar_diagram'
  | 'timeline' | 'frequency_scale' | 'relation_diagram' | 'icon' | 'placeholder';
export type VisualSourceKind = 'ai_generated' | 'original_svg' | 'licensed' | 'internal' | 'placeholder';
export type VisualReviewStatus = 'planned' | 'generated' | 'draft' | 'reviewed' | 'approved' | 'rejected';

export interface VisualAsset {
  id: string;                        // 安定ID（例 va-verb-iku-scene）
  assetType: VisualAssetType;
  learningTargetType: 'item' | 'sense' | 'rule' | 'scene';
  learningTargetId: string;          // FoundationItem/Rule等のID
  senseId?: string;
  /** public相対パス（例 /images/ai-course/foundation/verbs/verb-go-scene-v1.webp）。未生成はnull */
  filePath: string | null;
  thumbnailPath: string | null;
  width: number | null;
  height: number | null;
  altJa: string;                     // 正解そのものを漏らさない範囲で意味を補助（§43）
  altZh: string;
  generationPrompt?: string;         // 生成プロンプト（PII・learner情報を含めない・§54）
  sourceKind: VisualSourceKind;
  reviewStatus: VisualReviewStatus;  // 画像が存在してもapprovedにしない（人間レビュー後のみ・§29）
  copyrightStatus: 'original' | 'ai_generated_internal' | 'licensed' | 'unknown';
}

/** 一般学習者へ表示可能か（approvedのみ）。labPreviewはdraft以上を表示可（§29） */
export const isVisibleAsset = (a: VisualAsset, labPreview: boolean): boolean => {
  if (!a.filePath) return false;
  if (a.reviewStatus === 'approved') return true;
  return labPreview && (a.reviewStatus === 'draft' || a.reviewStatus === 'reviewed' || a.reviewStatus === 'generated');
};
