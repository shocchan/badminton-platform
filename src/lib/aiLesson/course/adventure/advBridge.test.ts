// §19（会話転用）・§20（人間レッスン）・§8（相棒）・content組立のテスト。
import { describe, it, expect } from 'vitest';
import { buildConversationMission, detectTargetUsage, nextAfterConversation } from './advConversationBridge';
import { buildLessonPrepSummary } from './advHumanLesson';
import { COMPANIONS, companionById, companionSvg } from './advCompanion';
import { buildDiagnosisPools, loadGrammarPools, stageContent } from './advContent';
import { defaultAdvProfile } from './advProfile';
import { generateRoute } from './advRoute';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import type { AdvMasteryAttempt } from './advTypes';

const NOW = '2026-07-31T12:00:00.000Z';

describe('advConversationBridge（§19）', () => {
  const draft = N3_GRAMMAR_DRAFTS[0];

  it('文法draftから会話ミッション仕様を作れる', () => {
    const m = buildConversationMission(draft as never);
    expect(m.grammarId).toBe(draft.grammarId);
    expect(m.starterJa.length).toBeGreaterThan(0);
    expect(m.starterZh.length).toBeGreaterThan(0);
    expect(m.acceptKeys.length).toBeGreaterThan(0);
    expect(m.introJa).toContain(draft.pattern);
  });

  it('使用判定は完全包含のみ（誇張しない）・言い直し/転用の次アクション', () => {
    const m = buildConversationMission(draft as never);
    const key = m.acceptKeys[0];
    const used = detectTargetUsage([`昨日、${key}という表現を使いました`], m);
    expect(used.used).toBe(true);
    expect(used.usedUtterances).toHaveLength(1);
    const notUsed = detectTargetUsage(['こんにちは'], m);
    expect(notUsed.used).toBe(false);
    expect(nextAfterConversation(used).kind).toBe('transfer');
    expect(nextAfterConversation(notUsed).kind).toBe('restate');
  });
});

describe('advHumanLesson（§20）', () => {
  it('サマリーは学習日数・苦手skill・候補・本人相談を持ち、会話本文を含まない', () => {
    const p = defaultAdvProfile(NOW);
    p.goalType = 'jlpt'; p.targetJlpt = 'N2';
    p.questLog = [
      { dateKey: '2026-07-29', completedSteps: 3, totalSteps: 4 },
      { dateKey: '2026-07-30', completedSteps: 2, totalSteps: 4 },
    ];
    p.skills.grammar = { currentScore: 40, confidence: 'medium', evidenceCount: 12, lastAssessedAt: NOW, band: 'n3' };
    p.skills.vocabulary = { currentScore: 70, confidence: 'medium', evidenceCount: 12, lastAssessedAt: NOW, band: 'n3' };
    const failing: AdvMasteryAttempt[] = [
      { dateKey: '2026-07-29', scorePct: 60, unseenRatio: 0.5, questionKeys: ['rec:x'], tier: 'normal', timed: false, completedAt: '2026-07-29T10:00:00Z' },
      { dateKey: '2026-07-30', scorePct: 55, unseenRatio: 0.5, questionKeys: ['cloze:x:1'], tier: 'normal', timed: false, completedAt: '2026-07-30T10:00:00Z' },
    ];
    p.mastery = { 'n2g-001': failing };
    p.humanLesson = { learnerTopics: ['長文読解の時間配分を相談したい'] };
    const s = buildLessonPrepSummary(p, NOW);
    expect(s.weekStudyDays).toBe(2);
    expect(s.goalLabelJa).toBe('N2合格');
    expect(s.weakSkillsJa[0]).toBe('文法');
    expect(s.focusCandidates.some((f) => f.targetId === 'n2g-001')).toBe(true);
    expect(s.learnerViewJa.some((t) => t.includes('相談したい'))).toBe(true);
    expect(s.learnerViewZh.length).toBeGreaterThan(0);
  });
});

describe('advCompanion（§8）', () => {
  it('3種・役割分担・SVGあり・既定は知識型', () => {
    expect(COMPANIONS).toHaveLength(3);
    for (const c of COMPANIONS) {
      const sum = c.emphasis.conversation + c.emphasis.knowledge + c.emphasis.practical;
      expect(Math.abs(sum - 1)).toBeLessThan(0.001);
      expect(companionSvg(c.id)).toContain('<svg');
      expect(c.nameZh.length).toBeGreaterThan(0);
    }
    expect(companionById(null).id).toBe('fukuro');
  });
});

describe('advContent（実データ組立）', () => {
  it('診断プールが実データから組めて、各プールが十分ある', async () => {
    const pools = await buildDiagnosisPools();
    expect(pools.foundationVocab.length).toBeGreaterThanOrEqual(3);
    expect(pools.n3Vocab.length).toBeGreaterThanOrEqual(3);
    expect(pools.n3Grammar).toHaveLength(76);
    expect(pools.n2Grammar).toHaveLength(178);
    for (const q of [...pools.foundationVocab, ...pools.n3Vocab].slice(0, 20)) {
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
      expect(q.answerIndex).toBeLessThan(q.choices.length);
    }
  });

  it('文法プール: N2は12単元へ展開・全itemに問題がある', async () => {
    const pools = await loadGrammarPools();
    expect(pools.n2Ids).toHaveLength(178);
    expect(pools.n3Ids).toHaveLength(76);
    expect([...pools.n2ByUnit.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const id of [...pools.n2Ids, ...pools.n3Ids]) {
      expect((pools.byItem.get(id) ?? []).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('単元(unitId)にもバトルプールがある（staging実画面P1の回帰ガード）', async () => {
    const pools = await loadGrammarPools();
    const { N3_UNIT_SPECS } = await import('../quality/n3UnitSpecs');
    for (const spec of N3_UNIT_SPECS) {
      const qs = pools.byItem.get(spec.unitId) ?? [];
      expect(qs.length).toBeGreaterThanOrEqual(5);
      // タイプ（u-dimension）が複数ある＝§15のタイプ多様性条件が機能する
      expect(new Set(qs.map((q) => q.type)).size).toBeGreaterThanOrEqual(2);
      for (const q of qs.slice(0, 10)) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
        expect(q.explanationZh.length).toBeGreaterThan(0);
      }
    }
    // 基礎キャンプstageの全バトル対象がプールを持つ（空バトル行き止まりの根絶）
    const route = generateRoute({ goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'pre_n5', conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW });
    const camp = route.stages[0];
    const ct = await stageContent(camp, new Set());
    expect(ct.battleTargetIds.length).toBeGreaterThan(0);
    for (const t2 of ct.battleTargetIds) {
      expect((pools.byItem.get(t2) ?? []).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('stageContentがmastered除外で次の対象と会話ミッションを返す', async () => {
    const route = generateRoute({ goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n3_late', conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW });
    const n3g = route.stages.find((s) => s.kind === 'n3_grammar');
    expect(n3g).toBeTruthy();
    const first = await stageContent(n3g!, new Set());
    expect(first.nextGrammarIds.length).toBeGreaterThan(0);
    expect(first.conversationTargets.length).toBeGreaterThan(0);
    expect(first.missionByGrammarId.size).toBeGreaterThan(0);
    const masteredAll = await stageContent(n3g!, new Set(first.nextGrammarIds.slice(0, 1)));
    expect(masteredAll.nextGrammarIds).not.toContain(first.nextGrammarIds[0]);
    // N2 stageはn2Unitsから展開される
    const n2g = route.stages.find((s) => s.kind === 'n2_grammar');
    const n2c = await stageContent(n2g!, new Set());
    expect(n2c.nextGrammarIds.length).toBe(178);
  });
});
