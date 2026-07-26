// 語彙パック（Phase 2C++ §43-§46）。同一Itemを複製せずitemIdsで参照。
// 表示語数は必ず実データ（itemIds）から計算する（手入力の語数を使わない・§43）。
import type { FoundationItem } from './foundationTypes';
import { allVocabularyItems } from './foundationVocabBank';
import type { VocabProgressRepository } from './vocabProgress';

export type VocabularyTrack = 'life_basic' | 'n3_prep' | 'n2_prep' | 'conversation' | 'business';

export interface VocabularyPack {
  id: string;
  titleJa: string; titleZh: string;
  descriptionJa: string; descriptionZh: string;
  targetTracks: VocabularyTrack[];
  itemIds: string[];          // 実在Itemのみ（テストで検証）
  requiredItemIds: string[];  // ゴール判定対象
  reviewStatus: 'draft';
  version: 1;
}

/**
 * 現在の78語の正式な位置づけ（§44）:
 * 「視覚語彙学習MVP・基礎/生活語彙の初期パック（draft）」。
 * N2まで対応した完成語彙ではない。N2/N3向けパックは未実装（存在するように見せない・§47）。
 */
export const VOCABULARY_PACKS: VocabularyPack[] = [
  (() => {
    const ids = allVocabularyItems().map((i) => i.id);
    return {
      id: 'pack-life-basic-1',
      titleJa: '生活・会話の基礎',
      titleZh: '生活与会话基础词汇',
      descriptionJa: '自己紹介や日本での生活で使う、基本のことばを確認します。',
      descriptionZh: '确认自我介绍和在日本生活中常用的基础词汇。',
      targetTracks: ['life_basic', 'n3_prep', 'n2_prep', 'conversation'],
      itemIds: ids,
      requiredItemIds: allVocabularyItems().filter((i) => i.coreLevel === 'A').map((i) => i.id),
      reviewStatus: 'draft',
      version: 1,
    };
  })(),
];

export const packById = (id: string): VocabularyPack | undefined => VOCABULARY_PACKS.find((p) => p.id === id);

/** パック状態（§46 MVP・self_knownだけでは完了にならない） */
export type PackState = 'not_started' | 'learning' | 'seen_all' | 'verifying' | 'retention_check' | 'reviewed_done';

export interface PackProgress {
  totalCount: number;         // itemIdsの実数
  seenCount: number;
  selfKnownCount: number;
  verifiedCount: number;      // reading/meaningをindependent以上で確認
  retainedCandidateCount: number;
  remainingCount: number;     // 未確認（unseen）
  state: PackState;
}

export const computePackProgress = (pack: VocabularyPack, repo: VocabProgressRepository): PackProgress => {
  let seen = 0, selfKnown = 0, verified = 0, retained = 0;
  for (const id of pack.itemIds) {
    const e = repo.getEntry(id);
    if (e.selfAssessment !== 'unseen') seen += 1;
    if (e.selfAssessment === 'self_known') selfKnown += 1;
    const v = repo.getVerifiedState(id);
    if (v === 'independent' || v === 'retained_candidate') verified += 1;
    if (v === 'retained_candidate') retained += 1;
  }
  const total = pack.itemIds.length;
  const requiredSeen = pack.requiredItemIds.every((id) => repo.getEntry(id).selfAssessment !== 'unseen');
  const requiredVerifiedRatio = pack.requiredItemIds.length === 0 ? 0 :
    pack.requiredItemIds.filter((id) => { const v = repo.getVerifiedState(id); return v === 'independent' || v === 'retained_candidate'; }).length / pack.requiredItemIds.length;
  // §46: 本人のself_knownだけではseen_allより先へ進まない（verifiedは問題履歴のみから）
  let state: PackState = 'not_started';
  if (seen > 0) state = 'learning';
  if (seen > 0 && requiredSeen) state = 'seen_all';
  if (requiredSeen && requiredVerifiedRatio >= 0.8) state = 'verifying';
  if (requiredSeen && requiredVerifiedRatio >= 0.8 && retained > 0) state = 'retention_check';
  // reviewed_done は人間レビュー済みパック＋定着条件確定後のみ（試作では到達させない・§46）
  return { totalCount: total, seenCount: seen, selfKnownCount: selfKnown, verifiedCount: verified, retainedCandidateCount: retained, remainingCount: total - seen, state };
};

/** 学習者の語彙トラック（試作: vocab sessionStorageに保存・本人が変更可能・§35） */
export const DEFAULT_TRACK: VocabularyTrack = 'life_basic';
export const trackItems = (items: FoundationItem[]): FoundationItem[] => items; // MVPは全語=基礎パック
