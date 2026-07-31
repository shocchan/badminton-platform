// Adventure V2 コア（profile / skill / route / diagnosis）の受入テスト。
// §28 Persona A〜E の要点をユニットレベルで固定する。
import { describe, it, expect } from 'vitest';
import type { LearnerSettings } from '../types';
import { defaultAdvProfile, readAdvProfile, writeAdvProfile, isAdvEnabled, migrateLegacyEvidence, emptySkillProfile } from './advProfile';
import { bandAtLeast, scoreToBand, evidenceToConfidence, knowledgeBandOf, updateSkillScore } from './advSkillProfile';
import { generateRoute, conversationStartArea, currentStageOf, routeProgressPct, AREA_UNIT_MAP } from './advRoute';
import { selectDiagnosisQuestions, scoreDiagnosis, scoreConversationSample, seededShuffle, type DiagQuestion, type DiagnosisPools } from './advDiagnosis';
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';
import { WORLD_AREAS } from '../rpg/worldAtlas';

const NOW = '2026-07-31T12:00:00.000Z';
const baseSettings = (): LearnerSettings => ({
  zhSupport: 'grammar', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null,
});

const dq = (key: string, level: DiagQuestion['level'], skill: DiagQuestion['skill'], refId: string, answerIndex = 0): DiagQuestion => ({
  key, level, skill, promptJa: 'p', promptZh: 'p', choices: ['a', 'b', 'c', 'd'], answerIndex, explanationZh: 'e', refId,
});

const pools = (): DiagnosisPools => ({
  foundationVocab: Array.from({ length: 6 }, (_, i) => dq(`fv${i}`, 'foundation', 'vocabulary', `fi-${i}`)),
  n3Vocab: Array.from({ length: 6 }, (_, i) => dq(`nv${i}`, 'n3', 'vocabulary', `n3v-${i}`)),
  n3Grammar: Array.from({ length: 6 }, (_, i) => dq(`ng${i}`, 'n3', 'grammar', `n3g-${i}`)),
  n2Grammar: Array.from({ length: 6 }, (_, i) => dq(`n2${i}`, 'n2', 'grammar', `n2g-${i}`)),
});

describe('advProfile', () => {
  it('default→write→read で往復し、他のsettingsフィールドを壊さない', () => {
    const s = baseSettings();
    const p = { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt' as const, targetJlpt: 'N2' as const };
    const next = writeAdvProfile(s, p, NOW);
    expect(next.zhSupport).toBe('grammar');
    expect(next.weeklyTarget).toBe(5);
    const back = readAdvProfile(next);
    expect(back?.enabled).toBe(true);
    expect(back?.goalType).toBe('jlpt');
    expect(back?.targetJlpt).toBe('N2');
    expect(isAdvEnabled(next)).toBe(true);
  });

  it('壊れたadventureV2でも落ちず、安全側defaultへ倒す', () => {
    const s = { ...baseSettings(), adventureV2: { schemaVersion: 1, enabled: 'yes', goalType: 'invalid', dailyMinutes: 7, skills: { vocabulary: { currentScore: 999 } } } };
    const p = readAdvProfile(s as LearnerSettings);
    expect(p).not.toBeNull();
    expect(p?.enabled).toBe(false);          // 'yes' は true ではない
    expect(p?.goalType).toBeNull();
    expect(p?.dailyMinutes).toBeNull();
    expect(p?.skills.vocabulary.currentScore).toBe(100); // clamp
    expect(p?.skills.grammar.band).toBe('needs_assessment');
  });

  it('schemaVersion違い・非objectは null（V2未使用扱い）', () => {
    expect(readAdvProfile({ ...baseSettings(), adventureV2: { schemaVersion: 2 } } as LearnerSettings)).toBeNull();
    expect(readAdvProfile({ ...baseSettings(), adventureV2: 'broken' } as LearnerSettings)).toBeNull();
    expect(readAdvProfile(baseSettings())).toBeNull();
    expect(isAdvEnabled(baseSettings())).toBe(false);
  });

  it('§23: 既存進捗からJLPTランクを認定しない（confidence low止まり・band未判定）', () => {
    const legacy = [
      { itemId: 'a', masteryState: 'retained_day30', masteryScore: 1, firstLearnedAt: NOW, lastPracticedAt: NOW, nextReviewAt: null, reviewStage: 'done', successfulReviews: 4, failedReviews: 0 },
      { itemId: 'b', masteryState: 'understood', masteryScore: 0.4, firstLearnedAt: NOW, lastPracticedAt: NOW, nextReviewAt: null, reviewStage: 'day1', successfulReviews: 0, failedReviews: 1 },
    ] as never[];
    const p = migrateLegacyEvidence(defaultAdvProfile(NOW), legacy, NOW);
    expect(p.skills.vocabulary.confidence).toBe('low');
    expect(p.skills.vocabulary.band).toBe('needs_assessment');
    expect(p.skills.grammar.confidence).toBe('none');
  });
});

describe('advSkillProfile', () => {
  it('band比較と未判定の扱い', () => {
    expect(bandAtLeast('n3', 'n3_early')).toBe(true);
    expect(bandAtLeast('n3_early', 'n3')).toBe(false);
    expect(bandAtLeast('needs_assessment', 'pre_n5')).toBe(false);
  });
  it('scoreToBand は段階制', () => {
    expect(scoreToBand(90, 'n3')).toBe('n3_late');
    expect(scoreToBand(20, 'n2')).toBe('n3_late');
    expect(scoreToBand(50, 'foundation')).toBe('n5');
  });
  it('confidenceは証拠数から', () => {
    expect(evidenceToConfidence(0)).toBe('none');
    expect(evidenceToConfidence(5)).toBe('low');
    expect(evidenceToConfidence(10)).toBe('medium');
    expect(evidenceToConfidence(30)).toBe('high');
  });
  it('知識ランクは語彙・文法の低い方（正直側）', () => {
    const s = emptySkillProfile();
    s.vocabulary = { ...s.vocabulary, band: 'n3_late', confidence: 'medium' };
    s.grammar = { ...s.grammar, band: 'n3', confidence: 'medium' };
    expect(knowledgeBandOf(s)).toBe('n3');
    s.grammar = { ...s.grammar, band: 'needs_assessment' };
    expect(knowledgeBandOf(s)).toBe('needs_assessment');
  });
  it('updateSkillScoreは1回の結果で帯を飛ばさない', () => {
    const prev = { currentScore: 50, confidence: 'medium' as const, evidenceCount: 10, lastAssessedAt: NOW, band: 'n3' as const };
    const next = updateSkillScore(prev, 100, 'n2_plus', NOW, 0.25, 5);
    expect(next.band).toBe('n3'); // 2段以上のジャンプは保留
    expect(next.currentScore).toBeGreaterThan(50);
    expect(next.currentScore).toBeLessThan(100);
  });
});

describe('advRoute（§5/§6/§28 Persona要点）', () => {
  it('AREA_UNIT_MAP は worldAtlas 実データと同期している（ガード）', () => {
    for (const area of WORLD_AREAS) {
      const mapped = AREA_UNIT_MAP[area.areaId];
      if (!mapped) continue;
      expect(mapped).toEqual(area.unitIds);
    }
    // 12単元すべてがいずれかのエリアに割当済み
    const all = Object.values(AREA_UNIT_MAP).flat().sort();
    expect(all).toEqual(N3_UNIT_SPECS.map((s) => s.unitId).sort());
  });

  it('Persona A: N2目標×現在地N3未満 → 目的地N2維持＋基礎補強経由地＋降格と言わない', () => {
    const r = generateRoute({ goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n4', conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW });
    expect(r.destinationJlpt).toBe('N2');
    expect(r.destinationAreaId).toBe('area08-sorano');
    const kinds = r.stages.map((s) => s.kind);
    expect(kinds).toContain('foundation_camp');
    expect(kinds).toContain('n3_bridge');
    expect(kinds).toContain('n2_grammar');
    expect(kinds[kinds.length - 1]).toBe('mock_boss');
    expect(r.explanationJa).toContain('N2を攻略するために');
    expect(r.explanationJa).not.toContain('降格');
    expect(r.explanationZh).toContain('为了攻略N2');
  });

  it('Persona B: N3目標×N5〜N4相当 → N3目的地＋foundation bridge', () => {
    const r = generateRoute({ goalType: 'jlpt', targetJlpt: 'N3', knowledgeBand: 'n5', conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW });
    expect(r.destinationJlpt).toBe('N3');
    expect(r.destinationAreaId).toBe('area07-katachi');
    expect(r.stages.some((s) => s.kind === 'foundation_camp')).toBe(true);
    expect(r.stages.some((s) => s.kind === 'n2_grammar')).toBe(false); // N3目標にN2を混ぜない
  });

  it('Persona C: 会話目的×知識N2×会話N3不安定 → 開始地点はN3エリア・JLPT stageなし', () => {
    const start = conversationStartArea('n3');
    expect(start.areaId).toBe('area05-yukari');
    const r = generateRoute({ goalType: 'conversation', targetJlpt: null, knowledgeBand: 'n2', conversationBand: 'n3', diagnosis: null, nowISO: NOW });
    expect(r.destinationJlpt).toBeNull();
    expect(r.stages.every((s) => s.kind === 'conversation_start' || s.kind === 'conversation_growth')).toBe(true);
    expect(r.explanationJa).toContain('知識を否定せず');
  });

  it('Persona D: hybrid → JLPT列に会話stageが合流', () => {
    const r = generateRoute({ goalType: 'hybrid', targetJlpt: 'N2', knowledgeBand: 'n3', conversationBand: 'n4_late', diagnosis: null, nowISO: NOW });
    expect(r.destinationJlpt).toBe('N2');
    expect(r.stages.some((s) => s.kind === 'conversation_start')).toBe(true);
    expect(r.stages.some((s) => s.kind === 'n2_grammar')).toBe(true);
  });

  it('上級現在地なら基礎経由地を積まない', () => {
    const r = generateRoute({ goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n3_late', conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW });
    const kinds = r.stages.map((s) => s.kind);
    expect(kinds).not.toContain('foundation_camp');
    expect(kinds).not.toContain('n3_bridge');
    expect(kinds[0]).toBe('n3_grammar');
  });

  it('currentStage/progressはmastered集合から決まる', () => {
    const r = generateRoute({ goalType: 'jlpt', targetJlpt: 'N3', knowledgeBand: 'n4', conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW });
    expect(currentStageOf(r, new Set())?.stageId).toBe(r.stages[0].stageId);
    const done = new Set([r.stages[0].stageId]);
    expect(currentStageOf(r, done)?.stageId).toBe(r.stages[1].stageId);
    expect(routeProgressPct(r, done)).toBeGreaterThan(0);
  });
});

describe('advDiagnosis（§10）', () => {
  it('seededShuffleは決定的', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 42)).toEqual(seededShuffle([1, 2, 3, 4, 5], 42));
  });

  it('N2目標は N2問題3問を含む12問・会話目的はN2を重くしない', () => {
    const qsN2 = selectDiagnosisQuestions(pools(), 'N2', 'jlpt', 1);
    expect(qsN2).toHaveLength(12);
    expect(qsN2.filter((q) => q.level === 'n2')).toHaveLength(3);
    const qsConv = selectDiagnosisQuestions(pools(), null, 'conversation', 1);
    expect(qsConv.filter((q) => q.level === 'n2')).toHaveLength(2);
  });

  it('全問正解＋会話良好 → 高い帯・gap無し', () => {
    const qs = selectDiagnosisQuestions(pools(), 'N2', 'jlpt', 1);
    const answers = qs.map((q) => ({ key: q.key, choiceIndex: q.answerIndex }));
    const out = scoreDiagnosis({ questions: qs, answers, convSamples: [{ studentText: '昨日は仕事が忙しかったですから、家で休みました。' }], conversationSampled: true, targetJlpt: 'N2', goalType: 'jlpt', nowISO: NOW });
    // 語彙はN3級までしか出題していない＝満点でも n3_late 止まり（測っていない帯を名乗らない）。
    // 知識ランクは語彙・文法の低い方なので n3_late が正直な上限
    expect(out.result.knowledgeBand).toBe('n3_late');
    expect(out.skills.grammar.band).toBe('n2_plus');
    expect(out.result.vocabularyGapIds).toHaveLength(0);
    expect(out.result.grammarGapIds).toHaveLength(0);
    expect(out.skills.reading.confidence).toBe('none'); // 測っていないものは未判定
    expect(out.skills.listening.confidence).toBe('none');
  });

  it('基礎で誤答多 → 低い帯＋gap抽出＋補助often', () => {
    const qs = selectDiagnosisQuestions(pools(), 'N2', 'jlpt', 1);
    const answers = qs.map((q) => ({ key: q.key, choiceIndex: q.answerIndex + 1 })); // 全誤答
    const out = scoreDiagnosis({ questions: qs, answers, convSamples: [], conversationSampled: false, targetJlpt: 'N2', goalType: 'jlpt', nowISO: NOW });
    expect(out.result.knowledgeBand).toBe('pre_n5');
    expect(out.result.vocabularyGapIds.length).toBeGreaterThan(0);
    expect(out.result.supportNeed).toBe('often');
    expect(out.result.conversationSampled).toBe(false);
    expect(out.skills.conversation.band).toBe('needs_assessment'); // skip時に会話を認定しない
  });

  it('未回答は集計にもgapにも入れない（推測しない）', () => {
    const qs = selectDiagnosisQuestions(pools(), 'N3', 'jlpt', 1);
    const answers = qs.slice(0, 3).map((q) => ({ key: q.key, choiceIndex: q.answerIndex }));
    const out = scoreDiagnosis({ questions: qs, answers, convSamples: [], conversationSampled: false, targetJlpt: 'N3', goalType: 'jlpt', nowISO: NOW });
    expect(out.result.vocabularyGapIds).toHaveLength(0);
    expect(out.skills.grammar.evidenceCount).toBeLessThanOrEqual(3);
  });

  it('会話サンプル採点は決定的で、空なら未判定', () => {
    expect(scoreConversationSample([]).band).toBe('needs_assessment');
    expect(scoreConversationSample([{ studentText: '你好' }]).band).toBe('pre_n5');
    expect(scoreConversationSample([{ studentText: 'すし' }]).band).toBe('n4');
    const good = scoreConversationSample([{ studentText: '仕事が忙しかったですから、昨日は家で休みました。' }]);
    expect(good.band).toBe('n3_late');
    expect(good.confidence).toBe('low'); // 1〜2往復でhighにしない
  });
});
