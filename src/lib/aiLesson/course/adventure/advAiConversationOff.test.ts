// 先生が人ごとにAI会話を止められる（2026-09-06 CEO決定）。
//
// 李さんは目標N3だが診断の実力はn5。レベルの一律判定（N5・N4だけ出さない）では切れないので、
// 先生が個別に止められるスイッチを足した。止めた人の「今日の冒険」にAI会話が出ないこと。
import { describe, it, expect } from 'vitest';
import { aiConversationEnabledFor } from './advTypes';
import { generateTodayQuest } from './advQuest';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';

const NOW = '2026-09-06T00:00:00.000Z';
const route = generateRoute({
  goalType: 'jlpt', targetJlpt: 'N3',
  knowledgeBand: 'n5', conversationBand: 'n3', diagnosis: null, nowISO: NOW,
});

const questOn = (dateKey: string, off: boolean, minutes: 5 | 15 | 30 = 5) => generateTodayQuest({
  profile: {
    ...defaultAdvProfile(NOW), goalType: 'jlpt', targetJlpt: 'N3',
    dailyMinutes: minutes, route, aiConversationOff: off,
    kana: { needed: false, doneRowIds: [], checkedAt: NOW },
  },
  route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey, nowISO: NOW,
  daysToExam: null, masteredStageIds: new Set(), contentStage: route.stages[0],
  availability: {
    nextGrammarIds: [], nextUnitIds: [],
    conversationTargets: [{ refId: 'c1', expression: 'よろしく', themeJa: '自己紹介', themeZh: '自我介绍' }],
    confirmTargetIds: [], vocabBattleTargetId: 'vocab-n5', kanjiBattleTargetId: null,
  } as never,
});

const DAYS = Array.from({ length: 14 }, (_, i) =>
  new Date(Date.parse('2026-09-06T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));

describe('AI会話の個別スイッチ', () => {
  it('切った人には出さない（試験目標）', () => {
    expect(aiConversationEnabledFor({ goalType: 'jlpt', targetJlpt: 'N3', aiConversationOff: true })).toBe(false);
    expect(aiConversationEnabledFor({ goalType: 'jlpt', targetJlpt: 'N3', aiConversationOff: false })).toBe(true);
    expect(aiConversationEnabledFor({ goalType: 'jlpt', targetJlpt: 'N3' })).toBe(true);
  });

  it('**会話が目的の人は切らない**（会話そのものが目的なので消したら空になる）', () => {
    expect(aiConversationEnabledFor({ goalType: 'conversation', targetJlpt: null, aiConversationOff: true })).toBe(true);
  });

  it('切ると14日ぶんの冒険に**1つもAI会話が出ない**（5分・30分とも）', () => {
    for (const m of [5, 30] as const) {
      const withConv = DAYS.filter((d) => questOn(d, true, m).steps.some((s) => s.kind === 'conversation_mission'));
      expect(withConv, `${m}分でAI会話が出た日`).toEqual([]);
    }
  });

  it('切っても冒険は空にならない（毎日、何かしら出る）', () => {
    for (const d of DAYS) {
      const q = questOn(d, true);
      expect(q.steps.length, `${d} が空`).toBeGreaterThan(0);
      expect(q.steps.some((s) => s.kind === 'vocab_learn'), `${d} に新しいことばが無い`).toBe(true);
    }
  });

  // 5分の試験目標はもともとAI会話を出さない設計なので、30分で見る
  it('切らなければ従来どおり出る（30分設定）', () => {
    const withConv = DAYS.filter((d) => questOn(d, false, 30).steps.some((s) => s.kind === 'conversation_mission'));
    expect(withConv.length, '切っていないのに14日間で0日').toBeGreaterThan(0);
  });
});

// フラグは先生が立てるが、保存は生徒がする。readAdvProfile はここで拾わないと
// 生徒の次の保存で消える（この関数は明示したキーしか通さない）。
describe('保存で消えない', () => {
  it('読み込み→書き出しでフラグが残る', async () => {
    const { readAdvProfile, writeAdvProfile, defaultAdvProfile: def } = await import('./advProfile');
    const stored = { adventureV2: { ...def(NOW), schemaVersion: 1, aiConversationOff: true } };
    const back = readAdvProfile(stored as never);
    expect(back?.aiConversationOff, '読み込みで落ちている').toBe(true);
    const saved = writeAdvProfile(stored as never, back!, NOW);
    expect((saved.adventureV2 as { aiConversationOff?: boolean }).aiConversationOff).toBe(true);
  });

  it('立てていない人は false のまま（既存learnerに影響しない）', async () => {
    const { readAdvProfile, defaultAdvProfile: def } = await import('./advProfile');
    const back = readAdvProfile({ adventureV2: { ...def(NOW), schemaVersion: 1 } } as never);
    expect(back?.aiConversationOff).toBe(false);
  });
});
