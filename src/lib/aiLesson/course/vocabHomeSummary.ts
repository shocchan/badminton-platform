// ホームHero用の語彙サマリー（Phase 2E-1 §18）。
// CourseHomeはメインbundleに入るため、語彙データ一式はこのモジュール経由の動的importでのみ読む
// （bundle増加を最小化・§31）。labPreviewのHero表示専用。
import { createVocabProgressRepository } from './vocabProgress';
import { currentPackForTrack, computePackProgress } from './vocabularyPacks';
import type { VocabularyTrack } from './vocabularyPacks';
import { assetById } from './visualAssetManifest';
import { createVocabSpacedReviewRepository } from './vocabSpacedReview';
import { defaultLearningClock } from './learningClock';

export interface VocabHomeSummary {
  track: VocabularyTrack;
  packTitleJa: string;
  packTitleZh: string;
  coverPath: string | null;      // 実ファイルがあるときのみ（placeholderを完成画像に見せない）
  coverThumbPath: string | null;
  seenCount: number;
  totalCount: number;
  /** 今日が期限の語彙復習（Phase 2E-1.10 §15・ホーム第一CTAの最優先判定に使う） */
  dueReviewCount: number;
  /** うち期限を過ぎたもの */
  overdueReviewCount: number;
}

// 成長画面向けの語彙状態サマリー（§25・自己評価と問題確認を混ぜない）
import { allVocabularyItems } from './foundationVocabBank';
import type { VocabQuestionDimension } from './vocabProgress';

export interface VocabGrowthSummary {
  startedCount: number;
  selfKnownCount: number;          // 自己評価（別表示・§25）
  retainedCandidateCount: number;
  needsReviewCount: number;
  confirmedByDimension: Record<VocabQuestionDimension, number>;
}

export const getVocabGrowthSummary = (): VocabGrowthSummary => {
  const repo = createVocabProgressRepository(window.sessionStorage);
  const ids = allVocabularyItems().map((i) => i.id);
  const stats = repo.getStats();
  const dims = repo.getDimensionStats(ids);
  return {
    startedCount: stats.seenCount,
    selfKnownCount: stats.selfKnownCount,
    retainedCandidateCount: stats.retainedCandidateCount,
    needsReviewCount: dims.needsReviewCount,
    confirmedByDimension: dims.confirmedByDimension,
  };
};

export const getVocabHomeSummary = (): VocabHomeSummary => {
  const repo = createVocabProgressRepository(window.sessionStorage);
  const track = repo.getSettings().track as VocabularyTrack;
  const pack = currentPackForTrack(track);
  const pp = computePackProgress(pack, repo);
  const cover = pack.coverAssetId ? assetById(pack.coverAssetId) : undefined;
  // 期限が来た語彙復習（ホーム第一CTAの最優先・2E-1.10 §15）
  const due = createVocabSpacedReviewRepository(window.sessionStorage, defaultLearningClock).getDueSummary();
  return {
    track,
    packTitleJa: pack.titleJa,
    packTitleZh: pack.titleZh,
    coverPath: cover?.filePath ?? null,
    coverThumbPath: cover?.thumbnailPath ?? null,
    seenCount: pp.seenCount,
    totalCount: pp.totalCount,
    dueReviewCount: due.total,
    overdueReviewCount: due.overdue,
  };
};
