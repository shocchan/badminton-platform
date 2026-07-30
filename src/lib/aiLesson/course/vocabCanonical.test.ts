// B: ことば図鑑の正準スコープ・フィルター・状態・完了定義のテスト（§14）。
// - 数はすべて実データから（手計算の期待値は「その数が変わったら報告してから変える」ガードとして固定）
// - 自己申告・本人レベルから習得を自動判定しないことを機械検証する
import { describe, it, expect } from 'vitest';
import {
  vocabCanonicalStats, canonicalGroupOf, canonicalRoleOf,
  learnerWordStateOf, filterVocabItems, VOCAB_FILTER_KEYS,
  computeVocabCompletion, levelTierOf, unitLinksFor,
} from './vocabCanonical';
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';
import { aggregateCognates } from './vocabularyPacks';
import { cognateProfileFor } from './quality/cognateProfile';
import { N3_UNIT_SPECS } from './quality/n3UnitSpecs';
import { buildAssessQuestions } from './quality/assessQuestionEngine';
import { STAGE_OF } from './quality/unitCoverage';
import { createVocabProgressRepository } from './vocabProgress';
import { createVocabSpacedReviewRepository } from './vocabSpacedReview';
import { createLearningClock } from './learningClock';
import { aiCourseI18n } from '../../../locales/aiCourse';
import { levelMetaOf } from './vocabularyLevelMeta';
import { contentNoteOf } from './vocabContentMeta';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
};
const setup = () => {
  const st = mem();
  const repo = createVocabProgressRepository(st);
  const schedule = createVocabSpacedReviewRepository(st, createLearningClock(new Date(2026, 6, 30, 10, 0)));
  return { repo, schedule };
};
const items = allVocabularyItems();

describe('正準集計（vocabCanonicalStats・単一情報源）', () => {
  it('total＝実データの語数＝基礎＋N3準備（内訳が常に合計と一致）', () => {
    const s = vocabCanonicalStats();
    expect(s.total).toBe(items.length);
    expect(s.foundation + s.n3Prep).toBe(s.total);
    expect(s.n3Prep).toBe(N3_ITEMS.length);
  });
  it('現在の正準数: 140語＝基礎78＋N3準備62（変わったら報告してから更新する）', () => {
    const s = vocabCanonicalStats();
    expect(s.total).toBe(140);
    expect(s.foundation).toBe(78);
    expect(s.n3Prep).toBe(62);
  });
  it('role合計＝total（required 95・diagnostic 37・optional 7・enrichment 1）', () => {
    const s = vocabCanonicalStats();
    expect(s.roles.required + s.roles.diagnostic + s.roles.optional + s.roles.enrichment).toBe(s.total);
    expect(s.roles).toEqual({ required: 95, diagnostic: 37, optional: 7, enrichment: 1 });
  });
  it('IDに重複がない', () => {
    expect(new Set(items.map(i => i.id)).size).toBe(items.length);
  });
  it('高リスク同形語数はcognateProfileForの実数と一致（12語）', () => {
    const real = items.filter(i => cognateProfileFor(i).highRisk).length;
    expect(vocabCanonicalStats().highRisk).toBe(real);
    expect(real).toBe(12);
  });
});

describe('フィルター11種（§7・検索と併用）', () => {
  it('フィルターキーは11種', () => {
    expect(VOCAB_FILTER_KEYS.length).toBe(11);
  });
  it('基礎とN3準備は全体を二分する（重複も漏れもない）', () => {
    const { repo, schedule } = setup();
    const f = filterVocabItems(items, 'foundation', '', repo, schedule);
    const n = filterVocabItems(items, 'n3prep', '', repo, schedule);
    expect(f.length + n.length).toBe(items.length);
    expect(f.some(i => canonicalGroupOf(i.id) !== 'foundation')).toBe(false);
    expect(n.some(i => canonicalGroupOf(i.id) !== 'n3prep')).toBe(false);
  });
  it('required/diagnosticフィルターは正準roleと一致', () => {
    const { repo, schedule } = setup();
    const s = vocabCanonicalStats();
    expect(filterVocabItems(items, 'required', '', repo, schedule).length).toBe(s.roles.required);
    expect(filterVocabItems(items, 'diagnostic', '', repo, schedule).length).toBe(s.roles.diagnostic);
  });
  it('同形語注意・意味範囲注意・日本語特有はcognate分類の実数と一致', () => {
    const { repo, schedule } = setup();
    const cog = aggregateCognates(items);
    expect(filterVocabItems(items, 'falseFriend', '', repo, schedule).length).toBe(cog.false_friend);
    expect(filterVocabItems(items, 'senseCaution', '', repo, schedule).length).toBe(cog.partial_overlap);
    expect(filterVocabItems(items, 'jpSpecific', '', repo, schedule).length).toBe(cog.japanese_specific);
  });
  it('検索とフィルターを併用すると両方の条件で絞られる', () => {
    const { repo, schedule } = setup();
    const all = filterVocabItems(items, 'all', '水', repo, schedule);
    const foundationOnly = filterVocabItems(items, 'foundation', '水', repo, schedule);
    expect(all.length).toBeGreaterThan(0);
    expect(foundationOnly.length).toBeLessThanOrEqual(all.length);
    expect(foundationOnly.every(i => canonicalGroupOf(i.id) === 'foundation')).toBe(true);
    expect(foundationOnly.every(i => i.lemma.includes('水') || i.readingKana.includes('水') || i.meaningZh.includes('水'))).toBe(true);
  });
  it('「覚えた」フィルターは自己申告タグで絞るだけ（未申告は空）', () => {
    const { repo, schedule } = setup();
    expect(filterVocabItems(items, 'selfKnown', '', repo, schedule).length).toBe(0);
    repo.setSelfAssessment(items[0].id, 'self_known');
    const r = filterVocabItems(items, 'selfKnown', '', repo, schedule);
    expect(r.map(i => i.id)).toEqual([items[0].id]);
  });
  it('未学習フィルターは初期状態で全語', () => {
    const { repo, schedule } = setup();
    expect(filterVocabItems(items, 'unseen', '', repo, schedule).length).toBe(items.length);
  });
});

describe('学習状態マッピング（習得の自動判定なし・§20）', () => {
  it('初期状態は未学習', () => {
    const { repo, schedule } = setup();
    expect(learnerWordStateOf(items[0].id, repo, schedule)).toBe('unseen');
  });
  it('カードを見たら学習中（開いただけでは定着候補にならない）', () => {
    const { repo, schedule } = setup();
    repo.recordEncounter(items[0].id);
    expect(learnerWordStateOf(items[0].id, repo, schedule)).toBe('learning');
  });
  it('復習予定に接続されたら復習中', () => {
    const { repo, schedule } = setup();
    schedule.markUncertain(items[0].id);
    expect(learnerWordStateOf(items[0].id, repo, schedule)).toBe('reviewing');
  });
  it('自己申告「覚えた」では定着候補にならない（申告≠習得）', () => {
    const { repo, schedule } = setup();
    repo.setSelfAssessment(items[0].id, 'self_known');
    expect(learnerWordStateOf(items[0].id, repo, schedule)).toBe('learning');
  });
});

describe('「全部終えた」の定義（カードを開いた数ではない・§9）', () => {
  it('初期状態: 4条件すべて0・未完了。分母は正準数（必須95・注意語12）', () => {
    const { repo, schedule } = setup();
    const c = computeVocabCompletion(repo, schedule);
    expect(c.requiredTotal).toBe(95);
    expect(c.highRiskTotal).toBe(12);
    expect(c.requiredConfirmed).toBe(0);
    expect(c.highRiskConfirmed).toBe(0);
    expect(c.requiredUsed).toBe(0);
    expect(c.requiredReviewConnected).toBe(0);
    expect(c.complete).toBe(false);
  });
  it('カードを全部開いても確認数は増えない', () => {
    const { repo, schedule } = setup();
    for (const it2 of items) repo.recordEncounter(it2.id);
    const c = computeVocabCompletion(repo, schedule);
    expect(c.requiredConfirmed).toBe(0);
    expect(c.complete).toBe(false);
  });
  it('自己申告「覚えた」でも確認数は増えない（申告≠確認）', () => {
    const { repo, schedule } = setup();
    for (const it2 of items) repo.setSelfAssessment(it2.id, 'self_known');
    expect(computeVocabCompletion(repo, schedule).requiredConfirmed).toBe(0);
  });
  it('確認問題の記録で確認数・使用数が増える', () => {
    const { repo, schedule } = setup();
    const required = items.find(i => canonicalRoleOf(i.id) === 'required')!;
    repo.recordTest(required.id, 'meaning', true);
    let c = computeVocabCompletion(repo, schedule);
    expect(c.requiredConfirmed).toBe(1);
    expect(c.requiredUsed).toBe(0);
    repo.recordTest(required.id, 'usage', true);
    c = computeVocabCompletion(repo, schedule);
    expect(c.requiredUsed).toBe(1);
  });
});

describe('レベル別表示ティア（表示切替のみ・習得扱いにしない）', () => {
  it('estimatedLevel文字列を正しくマッピングする', () => {
    expect(levelTierOf('N5〜N4')).toBe('beginner');
    expect(levelTierOf('N4')).toBe('beginner');
    expect(levelTierOf('N3')).toBe('n3');
    expect(levelTierOf('N3前後（仮）')).toBe('n3');
    expect(levelTierOf('N2')).toBe('advanced');
    expect(levelTierOf('N1')).toBe('advanced');
    expect(levelTierOf(undefined)).toBe('beginner');
    expect(levelTierOf(null)).toBe('beginner');
  });
  it('上級ティアでも学習状態・完了定義は変わらない（レベルで習得扱いにしない）', () => {
    const { repo, schedule } = setup();
    // levelTierOfは表示専用の純関数で、repo/scheduleへ一切書き込まない
    levelTierOf('N1');
    expect(learnerWordStateOf(items[0].id, repo, schedule)).toBe('unseen');
    expect(computeVocabCompletion(repo, schedule).requiredConfirmed).toBe(0);
  });
});

describe('RPG接続（実データのみ・架空の対応なし・§10）', () => {
  it('全140語がいずれかのN3単元に実所属している（orphan 0の実画面版）', () => {
    for (const it2 of items) {
      expect(unitLinksFor(it2.id).length, `${it2.id} に単元所属がない`).toBeGreaterThan(0);
    }
  });
  it('リンク先はすべて実在するn3UnitSpecsで、ミッション表示は実データと一致', () => {
    const specIds = new Set(N3_UNIT_SPECS.map(s => s.unitId));
    for (const it2 of items) {
      for (const l of unitLinksFor(it2.id)) {
        expect(specIds.has(l.spec.unitId)).toBe(true);
        if (l.inMission) expect(l.spec.practicalMission.usesItemIds).toContain(it2.id);
        if (l.isPrimary) expect(l.spec.targetVocabularyIds).toContain(it2.id);
        if (l.isEncounter) expect(l.spec.encounterVocabularyIds).toContain(it2.id);
      }
    }
  });
});

describe('スコープ文言の正直さ（ja/zh・偽装禁止）', () => {
  it('ja: 網羅ではないことを明記し、正準数を使う', () => {
    const ts = aiCourseI18n.ja.vocabScope;
    expect(ts.disclaimer(140)).toContain('網羅するものではありません');
    expect(ts.scopeSub(140)).toBe('基礎からN3準備までの140語');
    expect(ts.breakdown(78, 62)).toContain('78');
    expect(ts.breakdown(78, 62)).toContain('62');
  });
  it('zh: 同じ内容が中国語で存在する（UI文の日本語混入なし・固有名詞は除く）', () => {
    const ts = aiCourseI18n.zh.vocabScope;
    expect(ts.disclaimer(140)).toContain('并不能覆盖');
    expect(ts.scopeSub(140)).toContain('140');
    expect(ts.filters.all).toBe('全部');
    // フィルターキーはja/zhで同一集合
    expect(Object.keys(aiCourseI18n.zh.vocabScope.filters).sort()).toEqual(Object.keys(aiCourseI18n.ja.vocabScope.filters).sort());
    expect(Object.keys(aiCourseI18n.ja.vocabScope.filters).length).toBe(11);
  });
  it('N1対応や全語彙網羅を名乗る文言が存在しない', () => {
    for (const loc of [aiCourseI18n.ja.vocabScope, aiCourseI18n.zh.vocabScope]) {
      const all = JSON.stringify([loc.scopeTitle, loc.scopeSub(140), loc.disclaimer(140), loc.whatWhenDoneBody]);
      expect(all).not.toContain('N1');
      expect(all).not.toMatch(/全語彙を(学べます|カバー)|完全網羅|全部掌握N3/);
    }
  });
});

describe('注意分類語の中国語ノート網羅（夜間ブラッシュアップ2026-07-30）', () => {
  it('false friend・意味範囲注意・日本語特有の全語に中国語ノートが1つ以上ある', () => {
    for (const it2 of items) {
      const meta = levelMetaOf(it2.id);
      if (!['false_friend', 'partial_overlap', 'japanese_specific'].includes(meta.cognate)) continue;
      const hasNote = !!it2.usageNoteZh || !!contentNoteOf(it2.id)?.learningFocusZh || !!meta.cognateNoteZh;
      expect(hasNote, `${it2.id}（${meta.cognate}）に中国語ノートがない`).toBe(true);
    }
  });
});

describe('語彙問題Coverageの正準実数（§17・2026-07-30）', () => {
  it('Stage2接続 140/140・使用を直接測る問題（穴埋め∪コロケ）139/140・例外は勉強するのみ', () => {
    const noDirectUsage: string[] = [];
    for (const it2 of items) {
      const dims = new Set(buildAssessQuestions(it2, items, { introduced: false }).map(q => q.dimension));
      const distinguish = [...dims].filter(d => STAGE_OF[d] === 'distinguish');
      expect(distinguish.length, `${it2.id} がStage2未接続`).toBeGreaterThan(0);
      if (!dims.has('context') && !dims.has('collocation')) noDirectUsage.push(it2.id);
    }
    expect(noDirectUsage).toEqual(['fi-benkyo']);
  });
  it('勉強するは日中対照＋活用で確認される（直接使用問題の代替）', () => {
    const benkyo = items.find(i => i.id === 'fi-benkyo')!;
    const dims = new Set(buildAssessQuestions(benkyo, items, { introduced: false }).map(q => q.dimension));
    expect(dims.has('transfer_error')).toBe(true);
    expect(dims.has('conjugation')).toBe(true);
  });
});

describe('出身・都合の対照問題routing（§16・分類は不変のまま接続）', () => {
  it('両語とも対照問題が通常出題へ流れる（levelMeta=false_friendのまま・engine分類は不変）', async () => {
    const { cognateProfileFor } = await import('./quality/cognateProfile');
    for (const id of ['fi-shusshin', 'fi-tsugou']) {
      const it2 = items.find(i => i.id === id)!;
      // taxonomyは変更しない（engine=japanese_specific / UI=false_friend の二層のまま）
      expect(cognateProfileFor(it2).cognateClass).toBe('japanese_specific');
      expect(levelMetaOf(id).cognate).toBe('false_friend');
      const qs = buildAssessQuestions(it2, items, { introduced: false });
      const contrastDims = qs.filter(q => q.dimension === 'transfer_error' || q.dimension === 'scope_contrast' || q.dimension === 'register');
      expect(contrastDims.length, `${id} の対照問題が未接続`).toBeGreaterThan(0);
      // 二重出題なし（questionId一意）・導入問題（core_meaning）が先頭＝初学者負荷に配慮
      expect(new Set(qs.map(q => q.questionId)).size).toBe(qs.length);
      expect(qs[0].dimension).toBe('core_meaning');
    }
  });
});
