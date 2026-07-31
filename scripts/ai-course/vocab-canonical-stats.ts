// ことば図鑑の正準データ再計算（B1）。UIと同じ関数だけで数える（手計算・別ロジック禁止）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/vocab-canonical-stats.ts
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';
import { N3_ITEMS } from '../../src/lib/aiLesson/course/foundationVocabN3';
import { VOCABULARY_PACKS, roleFor, aggregateCognates } from '../../src/lib/aiLesson/course/vocabularyPacks';
import { levelMetaOf } from '../../src/lib/aiLesson/course/vocabularyLevelMeta';
import { N3_UNIT_SPECS } from '../../src/lib/aiLesson/course/quality/n3UnitSpecs';
import { summarizeCoverage } from '../../src/lib/aiLesson/course/quality/unitCoverage';
import { cognateProfileFor } from '../../src/lib/aiLesson/course/quality/cognateProfile';

const items = allVocabularyItems();
const n3Ids = new Set(N3_ITEMS.map(i => i.id));
const foundation = items.filter(i => !n3Ids.has(i.id));

// 役割: 図鑑の位置づけに合わせ「その語が属するパック」の代表トラックで判定
//   基礎語 → pack-life-basic-1 / life_basic、N3準備語 → pack-n3-prep-1 / n3_prep
const roleOf = (id: string) =>
  n3Ids.has(id) ? roleFor('pack-n3-prep-1', 'n3_prep', id) : roleFor('pack-life-basic-1', 'life_basic', id);
const roleTally: Record<string, string[]> = {};
for (const it of items) (roleTally[roleOf(it.id)] ??= []).push(it.id);

// cognate分類（単一集計関数）
const cog = aggregateCognates(items);

// N3単元との接続（orphan/duplicate/所属）
const cov = summarizeCoverage(N3_UNIT_SPECS, items);

// 高リスク語（contrast必須）
const highRisk = items.filter(i => cognateProfileFor(i).highRisk).map(i => i.id);

// 図鑑パック定義との整合
const packLife = VOCABULARY_PACKS[0];
const packN3 = VOCABULARY_PACKS[1];

// レベルタグ内訳
const levelTagTally: Record<string, number> = {};
for (const it of items) for (const tag of levelMetaOf(it.id).levelTags) levelTagTally[tag] = (levelTagTally[tag] ?? 0) + 1;

const out = {
  total: items.length,
  foundation: foundation.length,
  n3Prep: N3_ITEMS.length,
  packLifeItemCount: packLife.itemIds.length,
  packLifeExcludedCoreLevelB: foundation.length - packLife.itemIds.length + (packLife.itemIds.filter(id => n3Ids.has(id)).length),
  packN3ItemCount: packN3.itemIds.length,
  roles: Object.fromEntries(Object.entries(roleTally).map(([k, v]) => [k, v.length])),
  roleIdsNonRequired: {
    optional: roleTally['optional'] ?? [],
    enrichment: roleTally['enrichment'] ?? [],
  },
  cognates: cog,
  highRiskCount: highRisk.length,
  n3UnitCoverage: {
    units: cov.units,
    covered: cov.vocabularyCovered,
    orphans: cov.orphanVocabulary.length,
    orphanIds: cov.orphanVocabulary,
    duplicates: cov.duplicateAssignments,
    encounterLinks: cov.encounterLinks,
    unitsFailing: cov.unitsFailing,
  },
  levelTags: levelTagTally,
  duplicateIdCheck: items.length === new Set(items.map(i => i.id)).size ? 'OK（重複0）' : 'NG',
};
console.log(JSON.stringify(out, null, 2));
