// 会話カリキュラムの入口をレベルで変える（2026-08-23）。
//
// 【直した問題】
// 会話ミッションは第1週1本目から順にしか出なかった。N1合格者が「会話」を目的に選ぶと、
// 初日に「名前を伝える／〜といいます」が出る。最初の3週間（15本）は既にできることの繰り返しになる。
//
// 【守るもの】
// 1. 診断で高い帯が出た人は、上の週から始まる
// 2. 未診断・低い帯の人は今までどおり第1週から（既存の生徒の体験を変えない）
// 3. 上の週の教材が無いときは自動で下の段へ落ちる＝**今日の会話が空にならない**
// 4. 週内の前提（5本目は同じ週の1〜4本目が要る）は壊さない
import { describe, it, expect } from 'vitest';
import { selectNextMission, conversationEntryWeekOf } from './courseEngine';
import { COURSE_MISSIONS } from './courseData';
import type { ItemProgress, Learner } from './types';

const makeLearner = (band: string | null): Learner => ({
  id: 'L1', userId: 'U1', startedAtISO: null, displayName: '検証', preferredLanguage: 'zh',
  estimatedLevel: 'N3', difficultyLevel: 2, currentWeek: 1, isActive: true, hearing: {},
  settings: {
    zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null,
    ...(band ? { adventureV2: { diagnosis: { knowledgeBand: band } } } : {}),
  } as Learner['settings'],
  adminOverrides: {},
});

const maxWeek = Math.max(...COURSE_MISSIONS.map((m) => m.week));

describe('診断の帯から開始週を決める', () => {
  it('N2帯以上は上級パート（13週）から', () => {
    expect(conversationEntryWeekOf(makeLearner('n2_plus'))).toBe(13);
    expect(conversationEntryWeekOf(makeLearner('n2'))).toBe(13);
  });

  it('N2手前・N3後半は実用場面（10週）から', () => {
    expect(conversationEntryWeekOf(makeLearner('n2_early'))).toBe(10);
    expect(conversationEntryWeekOf(makeLearner('n3_late'))).toBe(10);
  });

  it('N3帯は意見・理由（7週）から', () => {
    expect(conversationEntryWeekOf(makeLearner('n3'))).toBe(7);
    expect(conversationEntryWeekOf(makeLearner('n3_early'))).toBe(7);
  });

  it('未診断・基礎帯は今までどおり第1週から', () => {
    expect(conversationEntryWeekOf(makeLearner(null))).toBe(1);
    expect(conversationEntryWeekOf(makeLearner('needs_assessment'))).toBe(1);
    expect(conversationEntryWeekOf(makeLearner('pre_n5'))).toBe(1);
    expect(conversationEntryWeekOf(makeLearner('n4'))).toBe(1);
  });

  it('壊れたsettingsでも落ちない', () => {
    const broken = { ...makeLearner(null), settings: { adventureV2: 'こわれている' } as unknown as Learner['settings'] };
    expect(conversationEntryWeekOf(broken)).toBe(1);
  });
});

describe('最初に出るミッション', () => {
  const firstFor = (band: string | null, done: string[] = []) => {
    const progresses = done.map((id) => ({
      itemId: id, masteryState: 'retained_day7', reviewCount: 3,
    } as unknown as ItemProgress));
    return selectNextMission(makeLearner(band), progresses);
  };

  it('未診断の人には第1週1本目（既存の生徒の体験を変えない）', () => {
    expect(firstFor(null)?.id).toBe('w01m1');
  });

  it('N3帯の人に「〜といいます」を出さない', () => {
    const m = firstFor('n3')!;
    expect(m.week).toBeGreaterThanOrEqual(7);
    expect(m.targetExpression).not.toBe('〜といいます');
  });

  it('N2帯の人には、用意されている中でいちばん上の段から出す', () => {
    const m = firstFor('n2')!;
    // 上級パート（13週〜）があればそこから。無ければ梯子が10週へ落ちる
    expect(m.week).toBeGreaterThanOrEqual(maxWeek >= 13 ? 13 : 10);
  });

  it('教材が足りなくても必ず1本返る（今日の会話が空にならない）', () => {
    for (const band of ['n2_plus', 'n2', 'n2_early', 'n3_late', 'n3', 'n3_early', 'n4', null]) {
      expect(firstFor(band), `${band} で出題が無い`).not.toBeNull();
    }
  });

  it('飛ばした先でも週内の前提は守られる（いきなり総合回から始めない）', () => {
    // 各週の5本目は同じ週の1〜4本目を前提に持つ。飛ばした直後は何も学習していないので、
    // 最初に出るのは前提を持たないミッションでなければならない
    for (const band of ['n3', 'n2_early', 'n2']) {
      const m = firstFor(band)!;
      expect(m.requiredPreviousItems, `${band}: 前提を満たさないミッションが出ている`).toEqual([]);
    }
  });

  it('管理画面の強制指定は今までどおり最優先', () => {
    const l = { ...makeLearner('n2'), adminOverrides: { nextMissionId: 'w01m1' } };
    expect(selectNextMission(l, [])?.id).toBe('w01m1');
  });
});
