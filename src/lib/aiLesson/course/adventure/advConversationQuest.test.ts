// 会話目標の「今日の冒険」の中身（2026-08-23 CEO決定で作り直し）。
//
// 【直した問題】
// 会話stageは battle が null 固定で、語彙・漢字バトルも抑制されていた。
// その結果、会話目標の1日は「AI会話ミッション4分」の**1ステップだけ**。
// 1日30分を選んでも10分にならず、AI会話1回$0.54のコストに対して中身が薄かった。
//
// 【この形にした理由】
// ・AI会話を隔日にする → コストが半分。毎日開く習慣はバトルで保つ
// ・会話が無い日はバトルを出す → AIを使わないのでコストは増えない
// ・会話の日とバトルの日を**交互**にする → どちらかの日が空にならない
import { describe, it, expect } from 'vitest';
import { generateTodayQuest } from './advQuest';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';
import type { AdvRoute } from './advTypes';

const NOW = '2026-08-23T09:00:00.000Z';
const route: AdvRoute = generateRoute({
  goalType: 'conversation', targetJlpt: null, knowledgeBand: 'n2',
  conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW,
});

const questOn = (dateKey: string, minutes: 5 | 15 | 30) => generateTodayQuest({
  profile: {
    ...defaultAdvProfile(NOW), goalType: 'conversation', targetJlpt: null,
    dailyMinutes: minutes, route, kana: { needed: false, doneRowIds: [], checkedAt: NOW },
  },
  route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey, nowISO: NOW, daysToExam: null,
  masteredStageIds: new Set(), contentStage: route.stages[0],
  availability: {
    nextGrammarIds: [], nextUnitIds: [], conversationTargets: [],
    confirmTargetIds: [], vocabBattleTargetId: 'vocab-1', kanjiBattleTargetId: 'kanji-1',
  },
});

const kinds = (q: { steps: { kind: string }[] }) => q.steps.map((s) => s.kind);
/** 2週間ぶんの日付（月をまたぐので実際の日付計算で作る） */
const DAYS = Array.from({ length: 14 }, (_, i) =>
  new Date(Date.parse('2026-08-23T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));

describe('会話目標の1日', () => {
  it('AI会話だけの日を作らない（必ずバトルが入る）', () => {
    for (const d of DAYS) {
      for (const m of [15, 30] as const) {
        const k = kinds(questOn(d, m));
        expect(k.length, `${d}/${m}分 が空`).toBeGreaterThan(0);
        expect(k, `${d}/${m}分 がAI会話だけ`).not.toEqual(['conversation_mission']);
        expect(k.includes('battle'), `${d}/${m}分 にバトルが無い`).toBe(true);
      }
    }
  });

  it('AI会話は隔日（毎日は出さない＝コストが倍にならない）', () => {
    const convDays = DAYS.filter((d) => kinds(questOn(d, 15)).includes('conversation_mission'));
    expect(convDays.length, '会話の日が半分になっていない').toBe(7);
  });

  it('会話の日とバトルだけの日が交互に来る', () => {
    const flags = DAYS.map((d) => kinds(questOn(d, 15)).includes('conversation_mission'));
    for (let i = 1; i < flags.length; i++) {
      expect(flags[i], `${DAYS[i]} が前日と同じ`).toBe(!flags[i - 1]);
    }
  });

  it('会話が無い日も学習が空にならない', () => {
    const noConv = DAYS.filter((d) => !kinds(questOn(d, 30)).includes('conversation_mission'));
    expect(noConv.length).toBeGreaterThan(0);
    for (const d of noConv) {
      expect(questOn(d, 30).estimatedMinutes, `${d} の学習時間が0分`).toBeGreaterThan(0);
    }
  });

  it('30分を選んだ人には15分より多く出す', () => {
    // 会話の無い日は漢字バトルが増えるぶん、30分設定のほうが厚くなる
    const d = DAYS.find((x) => !kinds(questOn(x, 15)).includes('conversation_mission'))!;
    expect(questOn(d, 30).estimatedMinutes).toBeGreaterThan(questOn(d, 15).estimatedMinutes);
  });

  it('会話の日は「今日のゴール」でAI会話を約束する', () => {
    const d = DAYS.find((x) => kinds(questOn(x, 15)).includes('conversation_mission'))!;
    expect(questOn(d, 15).successConditionJa).toContain('AI会話');
  });

  it('会話が無い日は出ないものを約束しない', () => {
    const d = DAYS.find((x) => !kinds(questOn(x, 15)).includes('conversation_mission'))!;
    expect(questOn(d, 15).successConditionJa).not.toContain('AI会話');
  });
});
