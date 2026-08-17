// 先生による学習設計の調整（2026-08-17）の受入テスト。
//
// いちばん守りたいこと:
// - **学習の記録（mastery台帳・questLog・XP・答案用紙）が絶対に消えない**
// - 現在地を直すと、これから進む道（route）だけが引き直される
// - AIが測った値と先生が直した値が区別できる（原則13: 実測と判断を混ぜない）
import { describe, it, expect } from 'vitest';
import { applyTeacherPlan, TEACHER_BAND_OPTIONS } from './advAdminPlan';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile, AdvDiagnosisResult } from './advTypes';
import { generateRoute } from './advRoute';

const NOW = '2026-08-17T09:00:00.000Z';

const diagnosis = (band: AdvDiagnosisResult['knowledgeBand']): AdvDiagnosisResult => ({
  completedAt: '2026-08-15T00:00:00.000Z',
  knowledgeBand: band,
  conversationBand: 'needs_assessment',
  vocabularyGapIds: [], grammarGapIds: [],
  listeningConfidence: 'unknown',
  supportNeed: 'whenStuck',
  recommendedStartAreaId: 'area01-minato',
  routeExplanationJa: '', routeExplanationZh: '',
  askedQuestionKeys: [], conversationSampled: false,
});

/** 記録を持った学習者（李さん相当: 診断はn4_lateだが実際は初級） */
const learner = (): AdventureV2Profile => {
  const d = diagnosis('n4_late');
  return {
    ...defaultAdvProfile(NOW),
    enabled: true,
    goalType: 'jlpt',
    targetJlpt: 'N3',
    dailyMinutes: 15,
    weeklyDays: 5,
    diagnosis: d,
    route: generateRoute({
      goalType: 'jlpt', targetJlpt: 'N3', knowledgeBand: 'n4_late',
      conversationBand: 'needs_assessment', diagnosis: d, nowISO: NOW,
    }),
    xp: 120,
    questLog: [{ dateKey: '2026-08-16', completedSteps: 3, totalSteps: 3 }],
    mastery: {
      'n3u-1': [{
        dateKey: '2026-08-16', scorePct: 90, unseenRatio: 0.5,
        questionKeys: ['q1', 'q2'], tier: 'normal', timed: false,
        completedAt: '2026-08-16T10:00:00.000Z',
      }],
    },
  };
};

describe('現在地の調整', () => {
  it('**記録（mastery・questLog・XP）は消えない**', () => {
    const before = learner();
    const r = applyTeacherPlan(before, { knowledgeBand: 'pre_n5' }, NOW);
    expect(r.profile.mastery).toEqual(before.mastery);
    expect(r.profile.questLog).toEqual(before.questLog);
    expect(r.profile.xp).toBe(120);
  });

  it('現在地を下げるとルートが引き直され、基礎から始まる', () => {
    const r = applyTeacherPlan(learner(), { knowledgeBand: 'pre_n5' }, NOW);
    expect(r.routeRebuilt).toBe(true);
    expect(r.profile.route?.stages[0].kind).toBe('foundation_camp');
    // 古い道の続き（今日のクエスト）は破棄される
    expect(r.profile.lastQuest).toBeNull();
    expect(r.profile.todaySteps).toBeNull();
  });

  it('**AIの実測値と先生の判断を区別できる**（調整の記録が残る）', () => {
    const r = applyTeacherPlan(learner(), { knowledgeBand: 'n5' }, NOW);
    expect(r.profile.diagnosis?.knowledgeBand).toBe('n5');
    expect(r.profile.diagnosis?.adjustedByTeacherAt).toBe(NOW);
    expect(r.profile.diagnosis?.bandBeforeTeacherAdjust).toBe('n4_late');
  });

  it('二度調整しても「最初にAIが測った値」が保たれる', () => {
    const once = applyTeacherPlan(learner(), { knowledgeBand: 'n5' }, NOW);
    const twice = applyTeacherPlan(once.profile, { knowledgeBand: 'pre_n5' }, NOW);
    expect(twice.profile.diagnosis?.bandBeforeTeacherAdjust).toBe('n4_late');
  });
});

describe('量の調整', () => {
  it('分・日数だけの変更ではルートを引き直さない（道は変わらない）', () => {
    const before = learner();
    const r = applyTeacherPlan(before, { dailyMinutes: 5, weeklyDays: 3 }, NOW);
    expect(r.routeRebuilt).toBe(false);
    expect(r.profile.route).toBe(before.route);
    expect(r.profile.dailyMinutes).toBe(5);
    expect(r.profile.weeklyDays).toBe(3);
  });

  it('変更なしなら差分は空（誤操作で何も壊れない）', () => {
    const before = learner();
    const r = applyTeacherPlan(before, {}, NOW);
    expect(r.changes).toEqual([]);
    expect(r.routeRebuilt).toBe(false);
    expect(r.profile.mastery).toEqual(before.mastery);
  });
});

describe('先生に見せる選択肢', () => {
  it('ほぼゼロ〜N3後半まで、どの帯でも説明文がある（何が起きるか分かる）', () => {
    expect(TEACHER_BAND_OPTIONS.length).toBeGreaterThanOrEqual(5);
    for (const o of TEACHER_BAND_OPTIONS) {
      expect(o.ja.length).toBeGreaterThan(1);
      expect(o.zh.length).toBeGreaterThan(1);
      expect(o.note.ja.length).toBeGreaterThan(3);
    }
  });

  it('差分は生徒へ説明できる文（ja/zh）で返る', () => {
    const r = applyTeacherPlan(learner(), { knowledgeBand: 'n5', dailyMinutes: 5 }, NOW);
    expect(r.changes.length).toBe(2);
    for (const c of r.changes) {
      expect(c.ja.length).toBeGreaterThan(3);
      expect(c.zh.length).toBeGreaterThan(3);
    }
  });
});
