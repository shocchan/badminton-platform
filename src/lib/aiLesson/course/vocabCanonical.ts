// ことば図鑑の正準スコープ・フィルター・学習状態の単一情報源（B: 図鑑の目的・レベル・ゴール可視化）。
//
// 原則:
// - 数はここで実データから数える（UI・報告・テストの手計算禁止）。
// - 「覚えた」は本人申告のタグであり、習得判定ではない（検証はVerifiedState/診断が持つ）。
// - 「全部終えた」はカードを開いた数ではなく、required確認・高リスク確認・使用・復習接続で定義する。
// - RPG接続（この語を使う場所）は実データ（n3UnitSpecs/worldAtlas）だけから引く。架空の対応は作らない。
import type { FoundationItem } from './foundationTypes';
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';
import { roleFor } from './vocabularyPacks';
import type { VocabularyPackItemRole } from './vocabularyPacks';
import { levelMetaOf } from './vocabularyLevelMeta';
import { cognateProfileFor } from './quality/cognateProfile';
import { N3_UNIT_SPECS } from './quality/n3UnitSpecs';
import type { UnitCoverageSpec } from './quality/unitCoverage';
import { areaForUnit } from './rpg/worldAtlas';
import type { WorldArea } from './rpg/worldAtlas';
import type { VocabProgressRepository } from './vocabProgress';
import type { VocabSpacedReviewRepository } from './vocabSpacedReview';

const n3IdSet = new Set(N3_ITEMS.map(i => i.id));

/** 語の正準グループ（基礎 or N3準備）。図鑑のスコープ表示・フィルターの基準 */
export const canonicalGroupOf = (itemId: string): 'foundation' | 'n3prep' =>
  n3IdSet.has(itemId) ? 'n3prep' : 'foundation';

/** 語の正準role。属するパックの代表トラックで判定（vocab-canonical-stats.tsと同一ロジック） */
export const canonicalRoleOf = (itemId: string): VocabularyPackItemRole =>
  n3IdSet.has(itemId) ? roleFor('pack-n3-prep-1', 'n3_prep', itemId) : roleFor('pack-life-basic-1', 'life_basic', itemId);

export interface VocabCanonicalStats {
  total: number;
  foundation: number;
  n3Prep: number;
  roles: Record<'required' | 'diagnostic' | 'optional' | 'enrichment', number>;
  highRisk: number;
}

let statsCache: VocabCanonicalStats | null = null;
/** 図鑑全体の正準集計（決定的・実データのみ） */
export const vocabCanonicalStats = (): VocabCanonicalStats => {
  if (statsCache) return statsCache;
  const items = allVocabularyItems();
  const roles = { required: 0, diagnostic: 0, optional: 0, enrichment: 0 };
  for (const it of items) {
    const r = canonicalRoleOf(it.id);
    if (r === 'required' || r === 'diagnostic' || r === 'optional' || r === 'enrichment') roles[r] += 1;
  }
  statsCache = {
    total: items.length,
    foundation: items.filter(i => !n3IdSet.has(i.id)).length,
    n3Prep: items.filter(i => n3IdSet.has(i.id)).length,
    roles,
    highRisk: items.filter(i => cognateProfileFor(i).highRisk).length,
  };
  return statsCache;
};

// ── 学習状態（表示用の正直なマッピング。習得の自動判定はしない） ──
/** 未学習=触れていない / 学習中=見た・自己申告のみ / 復習中=復習予定に接続済み / 定着候補=検証で複数回確認 */
export type LearnerWordState = 'unseen' | 'learning' | 'reviewing' | 'retained_candidate';

export const learnerWordStateOf = (
  itemId: string, repo: VocabProgressRepository, schedule: VocabSpacedReviewRepository,
): LearnerWordState => {
  if (repo.getVerifiedState(itemId) === 'retained_candidate') return 'retained_candidate';
  if (schedule.get(itemId)) return 'reviewing';
  const e = repo.getEntry(itemId);
  if (e.firstSeenAt !== null || e.selfAssessment !== 'unseen' || e.tests.length > 0) return 'learning';
  return 'unseen';
};

// ── フィルター（11種・検索と併用可能） ──
export type VocabFilterKey =
  | 'all' | 'foundation' | 'n3prep' | 'required' | 'diagnostic'
  | 'selfKnown' | 'needsReview' | 'unseen'
  | 'falseFriend' | 'senseCaution' | 'jpSpecific';

export const VOCAB_FILTER_KEYS: VocabFilterKey[] = [
  'all', 'foundation', 'n3prep', 'required', 'diagnostic',
  'selfKnown', 'needsReview', 'unseen', 'falseFriend', 'senseCaution', 'jpSpecific',
];

export const vocabFilterPredicate = (
  key: VocabFilterKey, repo: VocabProgressRepository, schedule: VocabSpacedReviewRepository,
): ((item: FoundationItem) => boolean) => {
  switch (key) {
    case 'all': return () => true;
    case 'foundation': return (i) => canonicalGroupOf(i.id) === 'foundation';
    case 'n3prep': return (i) => canonicalGroupOf(i.id) === 'n3prep';
    case 'required': return (i) => canonicalRoleOf(i.id) === 'required';
    case 'diagnostic': return (i) => canonicalRoleOf(i.id) === 'diagnostic';
    // 本人申告のタグ（習得判定ではない）。復習予定は消えない
    case 'selfKnown': return (i) => repo.getEntry(i.id).selfAssessment === 'self_known';
    case 'needsReview': return (i) => repo.getEntry(i.id).selfAssessment === 'needs_review' || schedule.getDue().some(d => d.itemId === i.id);
    case 'unseen': return (i) => learnerWordStateOf(i.id, repo, schedule) === 'unseen';
    case 'falseFriend': return (i) => levelMetaOf(i.id).cognate === 'false_friend';
    case 'senseCaution': return (i) => levelMetaOf(i.id).cognate === 'partial_overlap';
    case 'jpSpecific': return (i) => levelMetaOf(i.id).cognate === 'japanese_specific';
  }
};

/** 検索（lemma・かな・中国語訳）とフィルターの併用。順序は元リスト順（決定的） */
export const filterVocabItems = (
  items: FoundationItem[], key: VocabFilterKey, query: string,
  repo: VocabProgressRepository, schedule: VocabSpacedReviewRepository,
): FoundationItem[] => {
  const pred = vocabFilterPredicate(key, repo, schedule);
  const q = query.trim();
  return items.filter(i => pred(i) && (q === '' || i.lemma.includes(q) || i.readingKana.includes(q) || i.meaningZh.includes(q)));
};

// ── 「全部終えた」の定義（カードを開いた数ではない） ──
export interface VocabCompletionBreakdown {
  /** required語のうち、確認問題・診断で1回以上確認できた語 */
  requiredConfirmed: number;
  requiredTotal: number;
  /** 高リスク同形語のうち確認済みの語 */
  highRiskConfirmed: number;
  highRiskTotal: number;
  /** required語のうち、使用系（usage/collocation）の確認に正解した語 */
  requiredUsed: number;
  /** required語のうち、復習予定（間隔反復）に接続された語 */
  requiredReviewConnected: number;
  /** 4条件すべてが100%のときのみtrue */
  complete: boolean;
}

const confirmedOf = (itemId: string, repo: VocabProgressRepository): boolean => {
  if (repo.getVerifiedState(itemId) !== 'not_tested') return true;
  // 診断で確認された語（basic/partially confirmed）も「確認済み」
  for (const packId of ['pack-life-basic-1', 'pack-n3-prep-1']) {
    const o = repo.getDiagnosticOutcomes(packId)[itemId];
    if (o === 'basic_confirmed' || o === 'partially_confirmed') return true;
  }
  return false;
};

export const computeVocabCompletion = (
  repo: VocabProgressRepository, schedule: VocabSpacedReviewRepository,
): VocabCompletionBreakdown => {
  const items = allVocabularyItems();
  const required = items.filter(i => canonicalRoleOf(i.id) === 'required');
  const highRisk = items.filter(i => cognateProfileFor(i).highRisk);
  const usedOf = (id: string) => repo.getEntry(id).tests.some(tr => (tr.dimension === 'usage' || tr.dimension === 'collocation') && tr.correct);
  const b: VocabCompletionBreakdown = {
    requiredConfirmed: required.filter(i => confirmedOf(i.id, repo)).length,
    requiredTotal: required.length,
    highRiskConfirmed: highRisk.filter(i => confirmedOf(i.id, repo)).length,
    highRiskTotal: highRisk.length,
    requiredUsed: required.filter(i => usedOf(i.id)).length,
    requiredReviewConnected: required.filter(i => !!schedule.get(i.id)).length,
    complete: false,
  };
  b.complete = b.requiredConfirmed === b.requiredTotal && b.highRiskConfirmed === b.highRiskTotal
    && b.requiredUsed === b.requiredTotal && b.requiredReviewConnected === b.requiredTotal;
  return b;
};

// ── レベル別表示（本人のレベルで表示を変えるが、習得扱いにはしない） ──
export type VocabLevelTier = 'beginner' | 'n3' | 'advanced';

/** learner.estimatedLevel（'N5〜N4'/'N4'/'N3'/'N2'/'N1'/'N3前後（仮）'等）→表示ティア。不明はbeginner */
export const levelTierOf = (estimatedLevel: string | null | undefined): VocabLevelTier => {
  const s = (estimatedLevel ?? '').toUpperCase();
  if (s.includes('N1') || s.includes('N2')) return 'advanced';
  if (s.includes('N3')) return 'n3';
  return 'beginner';
};

// ── RPG接続（実データのみ。この語を使うエリア・単元・ミッション） ──
export interface VocabUnitLink {
  spec: UnitCoverageSpec;
  area: WorldArea | undefined;
  /** この単元で新しく学ぶ（primary） */
  isPrimary: boolean;
  /** 再登場（encounter） */
  isEncounter: boolean;
  /** 実用ミッションで使う */
  inMission: boolean;
}

export const unitLinksFor = (itemId: string): VocabUnitLink[] => {
  const out: VocabUnitLink[] = [];
  for (const spec of N3_UNIT_SPECS) {
    const isPrimary = spec.targetVocabularyIds.includes(itemId);
    const isEncounter = spec.encounterVocabularyIds.includes(itemId);
    const inMission = spec.practicalMission.usesItemIds.includes(itemId);
    if (isPrimary || isEncounter || inMission) {
      out.push({ spec, area: areaForUnit(spec.unitId), isPrimary, isEncounter, inMission });
    }
  }
  return out;
};
