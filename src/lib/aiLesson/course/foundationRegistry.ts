// しくみラボ 単元レジストリ（Phase 2B §17）。
// 単元データは動的importで単元別チャンクに分割し、メインbundleへ含めない。
// META は一覧表示用の最小情報のみ（教材本文を含めない）。
import type { FoundationUnit, FoundationItem, FoundationRule, FoundationQuestion, FoundationReviewStatus } from './foundationTypes';

export interface FoundationUnitBundle {
  unit: FoundationUnit;
  items: FoundationItem[];
  rules: FoundationRule[];
  questions: FoundationQuestion[];
}

export interface FoundationUnitMeta {
  id: string;
  titleJa: string; titleZh: string;
  level: 'N5' | 'N5-N4';
  recommendedWeek: number;
  estimatedMinutes: number;
  prerequisiteUnitIds: string[];
  review: FoundationReviewStatus;
}

export const FOUNDATION_UNIT_META: FoundationUnitMeta[] = [
  { id: 'fu-selfintro-1', titleJa: '自己紹介で使う基本のことば', titleZh: '自我介绍常用词与句型', level: 'N5', recommendedWeek: 1, estimatedMinutes: 6, prerequisiteUnitIds: [], review: 'draft' },
];

const loaders: Record<string, () => Promise<{ BUNDLE: FoundationUnitBundle }>> = {
  'fu-selfintro-1': () => import('./foundationUnit1'),
};

export const isKnownFoundationUnit = (id: string): boolean => Object.prototype.hasOwnProperty.call(loaders, id);

/** 単元データを動的ロード。未知IDは安全にエラー（呼び出し側でラボトップへ案内） */
export const loadFoundationUnit = async (id: string): Promise<FoundationUnitBundle> => {
  const l = loaders[id];
  if (!l) throw new Error(`unknown foundation unit: ${id}`);
  return (await l()).BUNDLE;
};
