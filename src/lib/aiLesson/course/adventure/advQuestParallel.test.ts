// 進度エンジン改善（2026-08-15）の受入テスト。
//
// 背景: 旧実装は「次のtargetは前のtargetの7日後確認が終わるまで出ない」直列設計で、
// 週7日満点でも21target完走に209日かかった（180日で物理的に完走不可能）。
// いちばん守りたいこと:
// - 7日待ちのtargetで学習が止まらない（次のtargetへ進む）
// - 確認が解禁されたら、その日のバトルは確認バトルになる（攻略を確定させる一手が最優先）
// - 文法束のlearnが束内を巡回する（先頭2項目のping-pongで3項目目以降が教われないバグの回帰防止）
import { describe, it, expect } from 'vitest';
import { generateTodayQuest, type QuestContentAvailability } from './advQuest';
import { classifyPendingDelay } from './advMastery';
import { defaultAdvProfile } from './advProfile';
import type { AdvMasteryAttempt, AdvRoute, AdvRouteStage } from './advTypes';

const NOW = '2026-08-15T12:00:00.000Z';

const stage = (stageId: string, kind: AdvRouteStage['kind'], targets: AdvRouteStage['targets']): AdvRouteStage => ({
  stageId, kind, areaId: 'area', titleJa: stageId, titleZh: stageId,
  purposeJa: '', purposeZh: '', targets, clearConditionJa: '', clearConditionZh: '',
});

const route: AdvRoute = {
  generatedAt: NOW, destinationJlpt: 'N3', destinationAreaId: 'dest',
  destinationLabelJa: 'N3', destinationLabelZh: 'N3', explanationJa: '', explanationZh: '',
  stages: [stage('stg-a', 'n3_practice', { n3UnitIds: ['u1'] })],
};

const attempt = (completedAt: string, scorePct = 90): AdvMasteryAttempt => ({
  dateKey: completedAt.slice(0, 10), scorePct, unseenRatio: 1,
  questionKeys: ['q:a', 'q:b', 'q:c'], tier: 'normal', timed: false, completedAt,
});
const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * 864e5).toISOString();

const quest = (availability: QuestContentAvailability) => generateTodayQuest({
  profile: { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N3', dailyMinutes: 15 },
  route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey: '2026-08-15', nowISO: NOW,
  availability, daysToExam: null, masteredStageIds: new Set(),
});

describe('classifyPendingDelay: 7日待ちと確認解禁の分類', () => {
  it('qualifying3日直後は waiting、3回目+7日を過ぎたら confirmReady', () => {
    const waitingLedger = { t1: [attempt(daysAgo(3)), attempt(daysAgo(2)), attempt(daysAgo(1))] };
    const readyLedger = { t2: [attempt(daysAgo(10)), attempt(daysAgo(9)), attempt(daysAgo(8))] };
    const w = classifyPendingDelay(waitingLedger, NOW);
    expect(w.waiting.has('t1')).toBe(true);
    expect(w.confirmReady.size).toBe(0);
    const r = classifyPendingDelay(readyLedger, NOW);
    expect(r.confirmReady.has('t2')).toBe(true);
    expect(r.waiting.size).toBe(0);
  });
});

describe('確認バトルの注入', () => {
  it('confirmTargetIdsがあれば今日のバトルは確認バトル（対象=待ちのtarget）', () => {
    const q = quest({
      nextGrammarIds: [], nextUnitIds: ['u2'], conversationTargets: [],
      confirmTargetIds: ['u1'],
    });
    const battle = q.steps.find((s) => s.kind === 'battle');
    expect(battle).toBeTruthy();
    expect(battle!.refIds).toEqual(['u1']);
    expect(battle!.titleJa).toContain('確認バトル');
  });

  it('confirmが無ければ従来どおり現在対象のバトル', () => {
    const q = quest({ nextGrammarIds: [], nextUnitIds: ['u2'], conversationTargets: [] });
    const battle = q.steps.find((s) => s.kind === 'battle');
    expect(battle!.refIds).toEqual(['u2']);
    expect(battle!.titleJa).not.toContain('確認バトル');
  });
});

describe('文法束learnの束内巡回（ping-pong回帰防止）', () => {
  const bundleMap = new Map([['g1', 'b1'], ['g2', 'b1'], ['g3', 'b1'], ['h1', 'b2']]);
  const availOf = (): QuestContentAvailability => ({
    nextGrammarIds: ['g1', 'g2', 'g3', 'h1'], nextUnitIds: [], conversationTargets: [],
    grammarBundleByItem: bundleMap,
  });

  it('連続する日で束内の全項目がlearnに出る（3項目目が置き去りにならない）', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 3; d++) {
      const dateKey = new Date(Date.parse('2026-08-15') + d * 864e5).toISOString().slice(0, 10);
      const q = generateTodayQuest({
        profile: { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N3', dailyMinutes: 15 },
        route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey, nowISO: NOW,
        availability: availOf(), daysToExam: null, masteredStageIds: new Set(),
      });
      const learn = q.steps.find((s) => s.kind === 'grammar_new');
      expect(learn).toBeTruthy();
      seen.add(learn!.refIds[0]);
      // 別束（h1/b2）へ飛ばない: バトルとlearnの束が常に一致する
      expect(['g1', 'g2', 'g3']).toContain(learn!.refIds[0]);
      const battle = q.steps.find((s) => s.kind === 'battle');
      expect(battle!.refIds).toEqual(['b1']);
    }
    expect(seen.size).toBe(3); // 3日で3項目すべてに触れた
  });
});

// ── pickContentStage: stage境界でも学習が止まらない（実ルート・実プールで検証） ──
import { generateRoute } from './advRoute';
import { pickContentStage } from './advContent';

describe('pickContentStage: 現在stageが全部7日待ちなら先のstageを前倒し', () => {
  it('ゼロ→N3ルートで最初のstageの全targetが待ち → 次のstageの学習内容が出る', async () => {
    const realRoute = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N3',
      knowledgeBand: 'needs_assessment', conversationBand: 'needs_assessment',
      diagnosis: null, nowISO: NOW,
    });
    const current = realRoute.stages[0];
    // 待ちの集合は手書きせず攻略判定と同じ関数から作る
    // （stageにtargetを足したとき「全部待ち」の前提が静かに崩れるため。2026-08-17 初級文法追加で発覚）
    const pools = await loadGrammarPools();
    const waiting = new Set(stageMasteryTargetIds(
      current, pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem, pools.basicByUnit, pools.basicBundleByUnit,
    ));
    const { stage: contentStage, content } = await pickContentStage(
      realRoute, current, new Set(), new Set(), waiting);
    expect(contentStage.stageId).not.toBe(current.stageId);
    expect(content.nextUnitIds.length + content.nextGrammarIds.length).toBeGreaterThan(0);
  });

  it('待ちが無ければ現在stageのまま', async () => {
    const realRoute = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N3',
      knowledgeBand: 'needs_assessment', conversationBand: 'needs_assessment',
      diagnosis: null, nowISO: NOW,
    });
    const current = realRoute.stages[0];
    const { stage: contentStage } = await pickContentStage(
      realRoute, current, new Set(), new Set(), new Set());
    expect(contentStage.stageId).toBe(current.stageId);
  });
});

// ── 語彙バトルのデイリー配線（2026-08-15。語彙バンク約2,200語をループへ接続） ──
import { vocabTargetForStage } from './advQuest';

describe('語彙バトルの配線', () => {
  const availWithVocab = (vocabTarget: string | null): QuestContentAvailability => ({
    nextGrammarIds: [], nextUnitIds: ['u2'], conversationTargets: [],
    vocabBattleTargetId: vocabTarget,
  });
  const questOn = (dateKey: string, minutes: 15 | 30, vocabTarget: string | null) => generateTodayQuest({
    profile: { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N3', dailyMinutes: minutes },
    route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey, nowISO: NOW,
    availability: availWithVocab(vocabTarget), daysToExam: null, masteredStageIds: new Set(),
  });

  it('15分: 3日に1回、バトル枠が語彙バトルになる', () => {
    // dayNum % 3 の巡回で、3日間のうちちょうど1日だけ語彙になる
    const days = ['2026-08-15', '2026-08-16', '2026-08-17'];
    const vocabDays = days.filter((d) => {
      const q = questOn(d, 15, 'vocab-n3');
      const battles = q.steps.filter((s) => s.kind === 'battle');
      return battles.some((b) => b.refIds[0] === 'vocab-n3');
    });
    expect(vocabDays.length).toBe(1);
  });

  it('30分: 文法バトルに加えて語彙バトルが毎日入る', () => {
    const q = questOn('2026-08-15', 30, 'vocab-n4');
    const battles = q.steps.filter((s) => s.kind === 'battle');
    expect(battles.map((b) => b.refIds[0])).toContain('u2');        // 文法/単元バトル
    expect(battles.map((b) => b.refIds[0])).toContain('vocab-n4');  // 語彙バトル
    expect(battles.find((b) => b.refIds[0] === 'vocab-n4')!.titleJa).toBe('語彙バトル');
  });

  it('確認バトルが最優先（確認の日は語彙を積まない）', () => {
    const q = generateTodayQuest({
      profile: { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N3', dailyMinutes: 30 },
      route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey: '2026-08-15', nowISO: NOW,
      availability: { ...availWithVocab('vocab-n3'), confirmTargetIds: ['u1'] },
      daysToExam: null, masteredStageIds: new Set(),
    });
    const battles = q.steps.filter((s) => s.kind === 'battle');
    expect(battles.length).toBe(1);
    expect(battles[0].refIds).toEqual(['u1']);
  });

  it('vocabTargetForStage: 基礎はN5/N4交互・N3圏はN3・会話stageは出さない', () => {
    expect(['vocab-n5', 'vocab-n4']).toContain(vocabTargetForStage('foundation_camp', 'N3', 100));
    expect(vocabTargetForStage('foundation_camp', 'N3', 100)).not.toBe(vocabTargetForStage('foundation_camp', 'N3', 101));
    expect(vocabTargetForStage('n3_grammar', 'N3', 100)).toBe('vocab-n3');
    expect(['vocab-n2', 'vocab-n3']).toContain(vocabTargetForStage('n2_grammar', 'N2', 100));
    expect(vocabTargetForStage('conversation_start', 'N3', 100)).toBeNull();
  });
});

// ── N2文法の束攻略化（2026-08-15。項目単位178個では半年で完走不可能だった） ──
import { stageMasteryTargetIds } from './advRoute';
import { loadGrammarPools } from './advContent';

describe('N2文法の束攻略', () => {
  it('N2 stageの攻略targetは単元束（n2g-unit-*）になり、項目単位178個にならない', async () => {
    const pools = await loadGrammarPools();
    const n2Route = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N2',
      knowledgeBand: 'n3_late', conversationBand: 'n3',
      diagnosis: null, nowISO: NOW,
    });
    const all = new Set<string>();
    for (const s of n2Route.stages) {
      for (const id of stageMasteryTargetIds(s, pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem)) all.add(id);
    }
    const n2Bundles = [...all].filter((id) => id.startsWith('n2g-unit-'));
    expect(n2Bundles.length).toBeGreaterThanOrEqual(10);   // 12単元前後
    expect(n2Bundles.length).toBeLessThanOrEqual(14);
    expect([...all].some((id) => id.startsWith('n2g-') && !id.startsWith('n2g-unit-'))).toBe(false);
    // ルート全体のtarget総数が半年で攻略可能な規模（≈200個から大幅減）
    expect(all.size).toBeLessThan(60);
  });

  it('束のプールに問題が集約され、項目→束の対応がある', async () => {
    const pools = await loadGrammarPools();
    const bundle1 = pools.byItem.get('n2g-unit-1') ?? [];
    expect(bundle1.length).toBeGreaterThanOrEqual(17); // qualifying3日に必要な最低問題数
    const anyN2Item = pools.n2Ids[0];
    expect(pools.n3BundleByItem.get(anyN2Item)).toMatch(/^n2g-unit-\d+$/);
  });
});
