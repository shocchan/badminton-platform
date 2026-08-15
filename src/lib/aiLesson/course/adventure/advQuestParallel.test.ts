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
  route, dueReviewCount: 0, weakGrammarIds: [], dateKey: '2026-08-15', nowISO: NOW,
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
        route, dueReviewCount: 0, weakGrammarIds: [], dateKey, nowISO: NOW,
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
    const waiting = new Set([
      ...(current.targets.n3UnitIds ?? []),
      ...(current.targets.n3GrammarIds ?? []),
    ]);
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
