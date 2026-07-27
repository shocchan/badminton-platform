// 語彙パック（Phase 2C++ §43-§46）。同一Itemを複製せずitemIdsで参照。
// 表示語数は必ず実データ（itemIds）から計算する（手入力の語数を使わない・§43）。
import type { FoundationItem } from './foundationTypes';
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';
import { N3_ROLE_META } from './vocabularyRoleMeta';
import type { VocabProgressRepository } from './vocabProgress';
import { levelMetaOf } from './vocabularyLevelMeta';
import type { ChineseCognateType } from './vocabularyLevelMeta';

export type VocabularyTrack = 'life_basic' | 'n3_prep' | 'n2_prep' | 'conversation' | 'business';

export type VocabularyPackItemRole = 'required' | 'diagnostic' | 'optional' | 'remedial' | 'enrichment';

export interface VocabularyPack {
  id: string;
  titleJa: string; titleZh: string;
  descriptionJa: string; descriptionZh: string;
  targetTracks: VocabularyTrack[];
  itemIds: string[];          // 実在Itemのみ（テストで検証）
  requiredItemIds: string[];  // 後方互換（life_basicトラックのrequired）
  coverAssetId?: string;      // パックカバー画像（VisualAsset・§18）
  reviewStatus: 'draft';
  version: 1;
}

/**
 * トラック別の静的role（§3-§4・決定的ルール＋明示分類から導出）。
 * N3パックは語別監査（vocabularyRoleMeta・全62語に根拠つき）から引く。
 * 診断結果による動的変換（diagnostic→confirmed/remedial）はRepository側のoverrideで扱う。
 */
export const roleFor = (packId: string, track: VocabularyTrack, itemId: string): VocabularyPackItemRole => {
  const meta = levelMetaOf(itemId);
  const isTransparent = meta.cognate === 'transparent_same';
  const isConvCore = meta.levelTags.includes('conversation_core');
  const isN3 = N3_ITEMS.some((i) => i.id === itemId);
  if (packId === 'pack-n3-prep-1') {
    if (!isN3) return 'diagnostic';               // パック内の基礎語は確認のみ
    const audited = N3_ROLE_META[itemId];
    if (audited) {
      if (track === 'n2_prep') return audited.n2_prep;           // 原則diagnostic・false friend中核のみrequired（§3）
      if (track === 'conversation') return audited.conversation; // 発話で再利用しやすい語を重視
      return audited.n3_prep;                                    // N3準備: 読解・文法・日常語彙を重視
    }
    // 監査漏れ（テストで検出）は安全側=diagnostic
    return 'diagnostic';
  }
  // 生活・会話の基礎パック
  if (track === 'n3_prep' || track === 'n2_prep') {
    if (isConvCore) return 'required';            // 会話・文法単元で使う語のみrequired候補（§4）
    return 'diagnostic';                          // 基礎は短時間確認（誤答時のみremedialへ動的変換）
  }
  if (track === 'conversation') {
    if (isConvCore) return 'required';
    if (isTransparent) return 'diagnostic';
    return 'optional';
  }
  // life_basic / business
  if (isTransparent) return 'diagnostic';
  return 'required';
};

/** cognate集計（単一の集計関数・UI/テスト/docs/報告はこれを参照・手計算禁止・§5） */
export const aggregateCognates = (items: FoundationItem[]): Record<ChineseCognateType, number> => {
  const out: Record<ChineseCognateType, number> = {
    transparent_same: 0, mostly_same: 0, partial_overlap: 0, false_friend: 0,
    japanese_specific: 0, no_cognate: 0, unreviewed: 0,
  };
  for (const it of items) out[levelMetaOf(it.id).cognate] += 1;  // Item単位（Sense単位とは混在させない）
  return out;
};

export const roleCounts = (pack: VocabularyPack, track: VocabularyTrack): Record<VocabularyPackItemRole, number> => {
  const out: Record<VocabularyPackItemRole, number> = { required: 0, diagnostic: 0, optional: 0, remedial: 0, enrichment: 0 };
  for (const id of pack.itemIds) out[roleFor(pack.id, track, id)] += 1;
  return out;
};

/**
 * 現在の78語の正式な位置づけ（§44）:
 * 「視覚語彙学習MVP・基礎/生活語彙の初期パック（draft）」。
 * N2まで対応した完成語彙ではない。N2/N3向けパックは未実装（存在するように見せない・§47）。
 */
export const VOCABULARY_PACKS: VocabularyPack[] = [
  (() => {
    const basics = allVocabularyItems().filter((i) => i.coreLevel !== 'B');
    return {
      id: 'pack-life-basic-1',
      titleJa: '生活・会話の基礎',
      titleZh: '生活与会话基础词汇',
      descriptionJa: '自己紹介や日本での生活で使う、基本のことばを確認します。',
      descriptionZh: '确认自我介绍和在日本生活中常用的基础词汇。',
      targetTracks: ['life_basic', 'n3_prep', 'n2_prep', 'conversation'],
      itemIds: basics.map((i) => i.id),
      requiredItemIds: basics.filter((i) => roleFor('pack-life-basic-1', 'life_basic', i.id) === 'required').map((i) => i.id),
      coverAssetId: 'va-pack-life-basic-cover',
      reviewStatus: 'draft',
      version: 1,
    };
  })(),
  {
    id: 'pack-n3-prep-1',
    titleJa: 'N3準備・語彙拡張',
    titleZh: 'N3备考・词汇扩展',
    descriptionJa: '変化・理由・経験・意見など、会話と読解を広げることばを確認します（N3目安・公式語彙リストではありません）。',
    descriptionZh: '确认表达变化・理由・经验・意见等扩展会话与阅读的词汇（N3参考，非官方词表）。',
    targetTracks: ['n3_prep', 'n2_prep', 'conversation'],
    itemIds: N3_ITEMS.map((i) => i.id),
    requiredItemIds: N3_ITEMS.map((i) => i.id),
    coverAssetId: 'va-pack-n3-prep-cover',
    reviewStatus: 'draft',
    version: 1,
  },
];

/** トラック→現在のパック（決定的・§9: N2はまず基礎診断→N3不足確認） */
export const currentPackForTrack = (track: VocabularyTrack): VocabularyPack =>
  (track === 'n3_prep' || track === 'n2_prep') ? VOCABULARY_PACKS[0] : VOCABULARY_PACKS[0];
export const nextPackForTrack = (track: VocabularyTrack): VocabularyPack | null =>
  (track === 'n3_prep' || track === 'n2_prep' || track === 'conversation') ? VOCABULARY_PACKS[1] : null;

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
