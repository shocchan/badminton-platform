// Phase B-4: 語彙イラストの単一manifest。itemIdを正準キーにする。
//
// なぜ既存の visualAssetManifest と分けるか:
//   visualAssetManifest は「AI生成のラスター画像」を管理していて、
//   人間の編集レビュー（approved）が済むまで学習者に出さない設計になっている。
//   一方このSVGは決定的なコードで描く自前の図なので、
//   「意図しない写真が出る」種類の事故が起きない。よって別のassetTypeとして扱い、
//   人間の編集承認を待たずに学習者へ出せる（docs/ai-course/illustration-policy.md）。
//
// 将来1語ずつPNG/WebPへ差し替えても、itemId・alt・progress・route・testが
// 壊れないよう、UIは必ずこのmanifest経由でassetを取る。
import { SCENES_BATCH1 } from '../../../components/ai-course/foundation/vocab/vocabScenes1';
import { SCENES_BATCH2 } from '../../../components/ai-course/foundation/vocab/vocabScenes2';
import { SCENES_BATCH3 } from '../../../components/ai-course/foundation/vocab/vocabScenes3';
import { SCENES_BATCH4 } from '../../../components/ai-course/foundation/vocab/vocabScenes4';
import { SCENES_BATCH5 } from '../../../components/ai-course/foundation/vocab/vocabScenes5';
import type { VocabSceneSpec } from '../../../components/ai-course/foundation/vocab/VocabScene';
import { VISUAL_ASSETS } from './visualAssetManifest';

export type IllustrationAssetType = 'existing_image' | 'generated_image' | 'svg_fallback';
export type IllustrationState =
  | 'asset_exists' | 'generated_draft' | 'semantic_checked'
  | 'learner_visible' | 'human_review_candidate' | 'human_approved' | 'hold';

export interface IllustrationEntry {
  itemId: string;
  /** svg_fallback のときは null（描画はコードが持つ）。差し替え時はここにパスを入れる */
  assetPath: string | null;
  assetType: IllustrationAssetType;
  version: number;
  provenance: string;
  semanticState: IllustrationState;
  /** 学習者の画面に出してよいか */
  learnerVisible: boolean;
  humanReviewCandidate: boolean;
  humanApproved: boolean;
  /** 実写・撮り下ろしへ差し替える優先度（1が高い） */
  replacementPriority: 1 | 2 | 3;
  altJa: string;
  altZh: string;
  scene?: VocabSceneSpec;
}

export const ALL_SCENES: VocabSceneSpec[] = [
  ...SCENES_BATCH1, ...SCENES_BATCH2, ...SCENES_BATCH3, ...SCENES_BATCH4, ...SCENES_BATCH5,
];

/** 既存のAI生成画像（approved のみ学習者に出せる）を itemId で引けるようにする */
const approvedImageByItem = new Map<string, { path: string; altJa: string; altZh: string }>();
for (const a of VISUAL_ASSETS) {
  if (a.learningTargetType !== 'item' || !a.filePath) continue;
  if (a.reviewStatus !== 'approved') continue;
  if (!approvedImageByItem.has(a.learningTargetId)) {
    approvedImageByItem.set(a.learningTargetId, { path: a.filePath, altJa: a.altJa, altZh: a.altZh });
  }
}

const entries = new Map<string, IllustrationEntry>();
for (const scene of ALL_SCENES) {
  const approved = approvedImageByItem.get(scene.itemId);
  entries.set(scene.itemId, approved
    ? {
      itemId: scene.itemId, assetPath: approved.path, assetType: 'existing_image', version: 1,
      provenance: 'visualAssetManifest（人間承認済み）', semanticState: 'human_approved',
      learnerVisible: true, humanReviewCandidate: false, humanApproved: true,
      replacementPriority: 3, altJa: approved.altJa, altZh: approved.altZh,
    }
    : {
      itemId: scene.itemId, assetPath: null, assetType: 'svg_fallback', version: 1,
      provenance: 'vocabScenes（自前SVG・決定的描画）', semanticState: 'learner_visible',
      learnerVisible: true, humanReviewCandidate: true, humanApproved: false,
      replacementPriority: 2, altJa: scene.altJa, altZh: scene.altZh, scene,
    });
}

export const ILLUSTRATION_MANIFEST: IllustrationEntry[] = [...entries.values()];

export const illustrationFor = (itemId: string): IllustrationEntry | undefined => entries.get(itemId);

export interface IllustrationCoverage {
  total: number;
  assetExists: number;
  learnerVisible: number;
  svgFallback: number;
  existingImages: number;
  humanApproved: number;
  humanReviewCandidate: number;
  missing: string[];
}

/** 集計は必ずここから取る（画面や報告で手計算しない） */
export const illustrationCoverage = (itemIds: string[]): IllustrationCoverage => {
  const missing = itemIds.filter((id) => !entries.has(id));
  const list = itemIds.map((id) => entries.get(id)).filter((e): e is IllustrationEntry => !!e);
  return {
    total: itemIds.length,
    assetExists: list.length,
    learnerVisible: list.filter((e) => e.learnerVisible).length,
    svgFallback: list.filter((e) => e.assetType === 'svg_fallback').length,
    existingImages: list.filter((e) => e.assetType === 'existing_image').length,
    humanApproved: list.filter((e) => e.humanApproved).length,
    humanReviewCandidate: list.filter((e) => e.humanReviewCandidate).length,
    missing,
  };
};
