// 140語の単一監査インデックス（Phase 2E-1 §2）。
// 基礎78語とN3 62語を別々の監査処理で管理しない。UI・docs・テスト・完了報告の集計値は
// すべて buildVocabularyReviewRecords / auditSummary から生成する（手計算禁止）。
import type { FoundationItem } from './foundationTypes';
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';
import { levelMetaOf } from './vocabularyLevelMeta';
import type { VocabularyLevelMeta, ChineseCognateType } from './vocabularyLevelMeta';
import { VOCABULARY_PACKS, roleFor, aggregateCognates } from './vocabularyPacks';
import type { VocabularyPackItemRole, VocabularyTrack } from './vocabularyPacks';
import { contentNoteOf, meaningZhShortOf, exampleTypeOf, senseOverridesOf, aggregateSenseCognates } from './vocabContentMeta';
import type { VocabExampleType, SenseCognateOverride, SenseCognateSummary } from './vocabContentMeta';
import { furiganaForItem, furiganaCoverage } from './vocabFurigana';
import type { FuriganaTextSegment } from './vocabFurigana';
import { assetForItem } from './visualAssetManifest';
import type { VisualAsset } from './visualAssetTypes';
import { N3_ROLE_META } from './vocabularyRoleMeta';

export type VocabularyOutstandingIssue =
  | 'cognate_unreviewed' | 'zh_unreviewed' | 'furigana_missing' | 'no_image'
  | 'level_unreviewed' | 'sense_unreviewed' | 'source_external';

export interface VocabularyReviewRecord {
  itemId: string;
  item: FoundationItem;
  senseIds: string[];
  packs: string[];
  rolesByTrack: Partial<Record<VocabularyTrack, VocabularyPackItemRole>>;
  roleRationaleJa: string | null;
  meaningZhShort: string;
  learningFocusJa: string | null;
  learningFocusZh: string | null;
  exampleType: VocabExampleType;
  levelMeta: VocabularyLevelMeta;
  cognateDefault: ChineseCognateType;
  cognateSenseOverrides: SenseCognateOverride[];
  furiganaSegments: FuriganaTextSegment[] | null;
  furiganaStatus: 'draft' | 'none';
  imageAsset: VisualAsset | null;
  imageStatus: 'imported_draft' | 'planned' | 'none';
  /** コンテンツ全体の状態。AIが修正しただけではhuman_reviewedにしない（§9） */
  contentReviewStatus: 'draft' | 'unreviewed';
  outstandingIssues: VocabularyOutstandingIssue[];
}

const TRACKS: VocabularyTrack[] = ['life_basic', 'n3_prep', 'n2_prep', 'conversation'];

export const buildVocabularyReviewRecords = (): VocabularyReviewRecord[] => {
  const items = allVocabularyItems();
  const n3Ids = new Set(N3_ITEMS.map((i) => i.id));
  return items.map((item) => {
    const pack = VOCABULARY_PACKS.find((p) => p.itemIds.includes(item.id));
    const packs = VOCABULARY_PACKS.filter((p) => p.itemIds.includes(item.id)).map((p) => p.id);
    const rolesByTrack: Partial<Record<VocabularyTrack, VocabularyPackItemRole>> = {};
    if (pack) for (const tr of TRACKS) rolesByTrack[tr] = roleFor(pack.id, tr, item.id);
    const meta = levelMetaOf(item.id);
    const note = contentNoteOf(item.id);
    const segments = furiganaForItem(item.id);
    const asset = assetForItem(item.id) ?? null;
    const overrides = senseOverridesOf(item.id);
    const issues: VocabularyOutstandingIssue[] = [];
    if (meta.cognate === 'unreviewed') issues.push('cognate_unreviewed');
    if (meta.levelConfidence === 'unreviewed') issues.push('level_unreviewed');
    if (!segments) issues.push('furigana_missing');
    if (!asset || !asset.filePath) issues.push('no_image');
    if (overrides.some((o) => o.reviewStatus === 'unreviewed')) issues.push('sense_unreviewed');
    if (item.sources.every((sref) => sref.sourceMatchType === 'external_scope')) issues.push('source_external');
    // 中国語未確定: cognate未レビュー かつ 学習ポイント未作成のもの
    if (meta.cognate === 'unreviewed' && !note?.learningFocusZh) issues.push('zh_unreviewed');
    return {
      itemId: item.id,
      item,
      senseIds: (item.senses ?? []).map((sn) => sn.id),
      packs,
      rolesByTrack,
      roleRationaleJa: n3Ids.has(item.id) ? N3_ROLE_META[item.id]?.rationaleJa ?? null : null,
      meaningZhShort: meaningZhShortOf(item),
      learningFocusJa: note?.learningFocusJa ?? null,
      learningFocusZh: note?.learningFocusZh ?? null,
      exampleType: exampleTypeOf(item.id),
      levelMeta: meta,
      cognateDefault: meta.cognate,
      cognateSenseOverrides: overrides,
      furiganaSegments: segments,
      furiganaStatus: segments ? 'draft' : 'none',
      imageAsset: asset,
      imageStatus: asset?.filePath ? 'imported_draft' : asset ? 'planned' : 'none',
      contentReviewStatus: meta.cognate === 'unreviewed' || meta.levelConfidence === 'unreviewed' ? 'unreviewed' : 'draft',
      outstandingIssues: issues,
    };
  });
};

export interface VocabularyAuditSummary {
  totalItems: number;
  basicsItems: number;
  n3Items: number;
  itemCognates: Record<ChineseCognateType, number>;      // Item代表分類（基礎＋N3合算）
  basicsCognates: Record<ChineseCognateType, number>;
  n3Cognates: Record<ChineseCognateType, number>;
  senseCognates: SenseCognateSummary;
  unreviewedItemCount: number;                            // cognate未レビューItem数
  learningFocusZhCount: number;
  usageNoteZhCount: number;
  furigana: { total: number; withSegments: number; segmentCount: number };
  imagesImported: number;
  outstandingByIssue: Record<VocabularyOutstandingIssue, number>;
}

/** 単一の集計関数（§2・完了報告とdocsはこの出力のみ使用） */
export const auditSummary = (): VocabularyAuditSummary => {
  const records = buildVocabularyReviewRecords();
  const n3Ids = new Set(N3_ITEMS.map((i) => i.id));
  const basics = records.filter((r) => !n3Ids.has(r.itemId));
  const n3 = records.filter((r) => n3Ids.has(r.itemId));
  const cov = furiganaCoverage(records.map((r) => r.itemId));
  const outstandingByIssue = {
    cognate_unreviewed: 0, zh_unreviewed: 0, furigana_missing: 0, no_image: 0,
    level_unreviewed: 0, sense_unreviewed: 0, source_external: 0,
  } as Record<VocabularyOutstandingIssue, number>;
  for (const r of records) for (const iss of r.outstandingIssues) outstandingByIssue[iss] += 1;
  return {
    totalItems: records.length,
    basicsItems: basics.length,
    n3Items: n3.length,
    itemCognates: aggregateCognates(records.map((r) => r.item)),
    basicsCognates: aggregateCognates(basics.map((r) => r.item)),
    n3Cognates: aggregateCognates(n3.map((r) => r.item)),
    senseCognates: aggregateSenseCognates(),
    unreviewedItemCount: records.filter((r) => r.cognateDefault === 'unreviewed').length,
    learningFocusZhCount: records.filter((r) => r.learningFocusZh).length,
    usageNoteZhCount: records.filter((r) => r.item.usageNoteZh).length,
    furigana: { total: cov.total, withSegments: cov.withSegments, segmentCount: cov.segmentCount },
    imagesImported: records.filter((r) => r.imageStatus === 'imported_draft').length,
    outstandingByIssue,
  };
};
