// 初回の一本目を「必ず成功する会話」にする（2026-08-26 ファネル監査 P0）。
//
// 実測した問題:
//   LPが呼んでいる相手（N3〜N2の「読めるのに話せない」人）が N2 と申告すると
//   入口が第13週になり、**人生で最初の日本語会話が w13m1「〜ていらっしゃいます」**
//   ＝尊敬語から始まっていた。3分で「言えた」が作れず、その日に離れる。
//
// ここで固定するのは3つ:
//   1. 初回だけ易しい会話に差し替わる
//   2. 2回目からは申告レベルどおりの入口に戻る（前の修正を巻き戻さない）
//   3. 呼び出し側が明示的に指定したときだけ効く（通信失敗で第1週に戻す事故を防ぐ）
import { describe, it, expect } from 'vitest';
import {
  selectNextMission, buildLessonPlan, conversationEntryWeekOf, FIRST_EVER_MISSION_ID,
} from './courseEngine';
import { COURSE_MISSIONS } from './courseData';
import type { Learner, ItemProgress } from './types';

const learnerWith = (declaredJlpt: string | null): Learner => ({
  id: 'l1', userId: 'u1', startedAtISO: null, displayName: 'test',
  preferredLanguage: 'zh', estimatedLevel: 'N2', difficultyLevel: 3,
  currentWeek: 1, isActive: true, hearing: {},
  // 申告レベルは settings.adventureV2.declaredJlpt に入る（courseEngine の実装に合わせる）
  settings: (declaredJlpt ? { adventureV2: { declaredJlpt } } : {}) as Learner['settings'],
  adminOverrides: {} as Learner['adminOverrides'],
});

const NO_PROGRESS: ItemProgress[] = [];

describe('初回の一本目', () => {
  it('N2申告の通常の入口は第13週（この前提が崩れたらテストの意味が変わる）', () => {
    expect(conversationEntryWeekOf(learnerWith('N2'))).toBe(13);
  });

  it('N2申告でも、初回はやさしい会話になる（尊敬語から始めない）', () => {
    const first = selectNextMission(learnerWith('N2'), NO_PROGRESS, { firstEverConversation: true });
    expect(first?.id).toBe(FIRST_EVER_MISSION_ID);
    expect(first?.week).toBe(1);
  });

  it('差し替え先は公開済みで、実際に易しい（第1週）', () => {
    const m = COURSE_MISSIONS.find((x) => x.id === FIRST_EVER_MISSION_ID);
    expect(m, `${FIRST_EVER_MISSION_ID} が存在しない`).toBeTruthy();
    expect(m!.isPublished).toBe(true);
    expect(m!.week).toBe(1);
  });

  it.each(['N1', 'N2', 'N3'])('%s: 2回目からは申告レベルどおりの入口に戻る', (jlpt) => {
    const normal = selectNextMission(learnerWith(jlpt), NO_PROGRESS);
    expect(normal?.week).toBe(conversationEntryWeekOf(learnerWith(jlpt)));
    expect(normal?.id).not.toBe(FIRST_EVER_MISSION_ID);
  });

  it('指定しなければ効かない（progressの取得に失敗しても第1週へ戻さない）', () => {
    const noOpts = selectNextMission(learnerWith('N2'), NO_PROGRESS);
    expect(noOpts?.week).toBe(13);
  });

  it('もう学習済みなら初回扱いでも差し替えない（同じ回を二度出さない）', () => {
    const done = [{ itemId: FIRST_EVER_MISSION_ID, masteryState: 'learning' }] as unknown as ItemProgress[];
    const m = selectNextMission(learnerWith('N2'), done, { firstEverConversation: true });
    expect(m?.id).not.toBe(FIRST_EVER_MISSION_ID);
  });

  it('管理者の指定は初回ウォームアップより強い', () => {
    const l = learnerWith('N2');
    l.adminOverrides = { nextMissionId: 'w03m1' } as Learner['adminOverrides'];
    const m = selectNextMission(l, NO_PROGRESS, { firstEverConversation: true });
    expect(m?.id).toBe('w03m1');
  });

  it('buildLessonPlan からも指定が通る', () => {
    const plan = buildLessonPlan(learnerWith('N2'), NO_PROGRESS, undefined, { firstEverConversation: true });
    expect(plan?.main.mission.id).toBe(FIRST_EVER_MISSION_ID);
  });
});
