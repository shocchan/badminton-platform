// 読解と聴解が「両方とも必要」な人に、片方だけしか出ない状態を作らない（2026-08-18）。
//
// 見つかった不具合:
//   examCandidates の交互配分は `日付 % 2 === 0` で読解を選んでいたが、
//   15分設定の試験技能ゲートは `examDay = 日付 % 2 === 1` だった。
//   2つの条件が排他なので、読解と聴解の両方が必要な生徒（＝新規生徒は必ずこれ）には
//   **読解が1日も出ない**。実測で N2目標・15分・両方未着手の28日間で 読解0日 / 聴解14日。
//   15分は実在の有料生徒3人が使っている設定なので、そのまま本番に残せない。
//
// この番人は「片方だけ0日」を落とす。日数の厳密な等分は求めない（配分ルールは変わりうる）。
import { describe, it, expect } from 'vitest';
import { generateRoute } from './advRoute';
import { generateTodayQuest } from './advQuest';
import { defaultAdvProfile } from './advProfile';
import type { AdvKanaState, AdvRouteStage, JlptLevel } from './advTypes';

const NOW = '2026-09-01T09:00:00.000Z';
const KANA_DONE: AdvKanaState = { needed: false, doneRowIds: [], checkedAt: NOW };

/** 読解stageではない普通のstageで28日ぶん回し、読解/聴解stepが出た日数を数える */
const countExamSteps = (target: JlptLevel, minutes: 5 | 15 | 30) => {
  const route = generateRoute({
    goalType: 'jlpt', targetJlpt: target, knowledgeBand: 'n3',
    conversationBand: 'n3', diagnosis: null, nowISO: NOW,
  });
  // 攻略条件が読解そのものの stage（reading_listening）は毎日必ず読解を出す別ルートなので、
  // ここでは「交互配分に委ねられる普通のstage」だけを見る
  const stage: AdvRouteStage =
    route.stages.find((s) => s.kind === 'n3_practice' || s.kind === 'n2_grammar') ?? route.stages[0];
  let reading = 0;
  let listening = 0;
  for (let d = 1; d <= 28; d++) {
    const dateKey = `2026-09-${String(d).padStart(2, '0')}`;
    const profile = {
      ...defaultAdvProfile(NOW),
      goalType: 'jlpt' as const, targetJlpt: target, dailyMinutes: minutes,
      route, kana: KANA_DONE,
    };
    const quest = generateTodayQuest({
      profile, route, reviewQuestionCount: 0, weakGrammarIds: [],
      dateKey, nowISO: NOW, daysToExam: null,
      masteredStageIds: new Set([route.stages[0].stageId]),
      contentStage: stage,
      availability: {
        nextGrammarIds: ['n2g-001'], nextUnitIds: [], conversationTargets: [],
        confirmTargetIds: [], vocabBattleTargetId: 'vocab-n2',
      },
      examSkills: {
        // 新規生徒の状態: 読解も聴解もまだ1問も解いていない（＝両方 needed）
        weakestSkill: null, readingEvidence: 0, listeningEvidence: 0,
        readingTargetIds: ['reading-n2'], listeningTargetIds: ['listening-n2'],
      },
    });
    for (const s of quest.steps) {
      if (s.kind === 'reading_short') reading += 1;
      if (s.kind === 'listening_practice') listening += 1;
    }
  }
  return { reading, listening };
};

describe('読解と聴解の交互配分', () => {
  it.each([
    ['N3', 15], ['N2', 15], ['N3', 30], ['N2', 30],
  ] as const)('%s目標・%d分: 両方未着手の28日で、読解も聴解も1日以上出る', (target, minutes) => {
    const { reading, listening } = countExamSteps(target, minutes);
    expect(reading, `読解が28日中${reading}日しか出ない（聴解は${listening}日）`).toBeGreaterThan(0);
    expect(listening, `聴解が28日中${listening}日しか出ない（読解は${reading}日）`).toBeGreaterThan(0);
  });

  it('偏りが3倍以上にならない（片方に寄せない）', () => {
    for (const target of ['N3', 'N2'] as const) {
      for (const minutes of [15, 30] as const) {
        const { reading, listening } = countExamSteps(target, minutes);
        const ratio = Math.max(reading, listening) / Math.min(reading, listening);
        expect(ratio, `${target}/${minutes}分: 読解${reading}日 vs 聴解${listening}日`).toBeLessThan(3);
      }
    }
  });
});
