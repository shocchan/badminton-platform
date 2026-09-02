// 会話目標の1日を、**本番と同じ値の作り方**で確かめる（2026-09-02）。
//
// 【なぜこのファイルが要るか】
// advConversationQuest.test.ts は「AI会話だけの日を作らない」を保証しているが、
// availability に `vocabBattleTargetId: 'vocab-1'` を**手で書いて**渡している。
// 本番の AdvShell はこの値を `vocabTargetForStage(stage.kind, ...)` から作り、
// その関数は会話stageで **null を返す**。
// つまり保証していたのは、会話目標の生徒には起こりえない条件だった。
//
// 実際にリンさん（N1申告・会話目標）の初日に出たのは「AI会話任務」1件だけ。
// AI会話は1回$0.54ほどかかるので、これは**毎日AIを焚くだけの日課**になる。
//
// ここでは availability を本番と同じ関数から作る。手で書かない。
import { describe, it, expect } from 'vitest';
import { generateTodayQuest, vocabTargetForStage } from './advQuest';
import { generateRoute } from './advRoute';
import { defaultAdvProfile, effectiveContentLevel } from './advProfile';
import type { AdvRoute, AdventureV2Profile } from './advTypes';

const NOW = '2026-09-02T09:00:00.000Z';

/** リンさん相当: JLPT N1を持っていて、目的は会話力の向上だけ */
const profileOf = (minutes: 5 | 15 | 30, route: AdvRoute): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  goalType: 'conversation', targetJlpt: null, declaredJlpt: 'N1',
  dailyMinutes: minutes, route,
  kana: { needed: false, doneRowIds: [], checkedAt: NOW },
});

const route: AdvRoute = generateRoute({
  goalType: 'conversation', targetJlpt: null, knowledgeBand: 'n2',
  conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW,
});

const DAYS = Array.from({ length: 14 }, (_, i) =>
  new Date(Date.parse('2026-09-02T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));

/**
 * 本番（AdvShell.tsx）と同じ作り方で availability を組む。
 *
 * - conversationTargets: 会話ルートのstageは文法targetを持たないので **必ず空**
 *   （advRoute.conversationStages が渡すのは conversationThemeIds と vocabularyIds だけ）
 * - vocabBattleTargetId: vocabTargetForStage から作る（手で書かない）
 * - kanjiBattleTargetId: 漢字はN5/N4の字しか無く、N1申告の人には null
 */
const questOn = (dateKey: string, minutes: 5 | 15 | 30) => {
  const profile = profileOf(minutes, route);
  const stage = route.stages[0];
  const dayNum = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  return generateTodayQuest({
    profile, route, reviewQuestionCount: 0, weakGrammarIds: [], dateKey, nowISO: NOW,
    daysToExam: null, masteredStageIds: new Set(), contentStage: stage,
    availability: {
      nextGrammarIds: [], nextUnitIds: [], conversationTargets: [], confirmTargetIds: [],
      vocabBattleTargetId: vocabTargetForStage(stage.kind, effectiveContentLevel(profile), dayNum),
      kanjiBattleTargetId: null,
    },
  });
};

const kinds = (q: { steps: { kind: string }[] }) => q.steps.map((s) => s.kind);

/**
 * 5分も必ず含める。リンさんの実際の設定が5分で、
 * この分岐だけ語彙バトルを一度も見ないまま毎日AI会話を出していた。
 * 15分・30分だけ確かめても、いちばん薄い設定の人が漏れる。
 */
const MINUTES = [5, 15, 30] as const;

describe('会話目標の1日（本番と同じ値の作り方）', () => {
  it('15分・30分では、AI会話の日にAI以外の学習も入る', () => {
    // 5分は「1日1つ」が設計なので、会話の日が会話1本なのは正しい。
    // ここで5分まで巻き込むと、5分設定に2つ出させることになり設定の意味が消える
    for (const d of DAYS) {
      for (const m of [15, 30] as const) {
        expect(kinds(questOn(d, m)), `${d}/${m}分 がAI会話だけ`).not.toEqual(['conversation_mission']);
      }
    }
  });

  it('どの日も空にならない', () => {
    for (const d of DAYS) {
      for (const m of MINUTES) {
        expect(kinds(questOn(d, m)).length, `${d}/${m}分 が空`).toBeGreaterThan(0);
      }
    }
  });

  it('AI会話は隔日（毎日は焚かない）', () => {
    for (const m of MINUTES) {
      const convDays = DAYS.filter((d) => kinds(questOn(d, m)).includes('conversation_mission'));
      expect(convDays.length, `${m}分設定でAI会話の日が半分になっていない`).toBe(7);
    }
  });

  it('AI会話が無い日にも、やることが必ずある', () => {
    for (const m of MINUTES) {
      const noConv = DAYS.filter((d) => !kinds(questOn(d, m)).includes('conversation_mission'));
      expect(noConv.length, `${m}分設定でAI会話の無い日が無い`).toBe(7);
      for (const d of noConv) {
        expect(questOn(d, m).estimatedMinutes, `${d}/${m}分 の学習時間が0分`).toBeGreaterThan(0);
      }
    }
  });

  it('5分設定でも1日1つに収める（会話の日に詰め込まない）', () => {
    // 5分を選んだ人に2つ出すと、選んだ意味が無くなる
    for (const d of DAYS) expect(kinds(questOn(d, 5)).length, `${d}`).toBe(1);
  });
});

describe('本番で使う関数そのものを固定する', () => {
  it('vocabTargetForStage は会話stageでも出題対象を返す', () => {
    // ここが null だと、会話目標の生徒の日課からバトルが丸ごと消える
    for (const kind of ['conversation_start', 'conversation_growth'] as const) {
      expect(vocabTargetForStage(kind, 'N2', 20330), `${kind} が null`).not.toBeNull();
    }
  });

  it('会話ルートのstageは文法targetを持たない（だから語彙で埋める必要がある）', () => {
    // この前提が変わったら上の設計を見直すこと
    for (const s of route.stages) {
      expect(s.targets.n3GrammarIds ?? [], `${s.stageId}`).toHaveLength(0);
      expect(s.targets.n2Units ?? [], `${s.stageId}`).toHaveLength(0);
      expect(s.targets.basicUnits ?? [], `${s.stageId}`).toHaveLength(0);
    }
  });
});
