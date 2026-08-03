// @vitest-environment jsdom
// 冒険（V2）から旧コースの画面へ出ないこと（PAID STUDENT MINIMUM LINE §2）。
//
// 旧コースの5画面は教材を静的に持つため公開ビルドから外してある。
// そこへ繋がる導線が1本でも残ると「この機能は現在、冒険モードへ移行中です」で
// 行き止まりになる。実際に「今日の1つ目」と「復習」がそうなっていた。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateTodayQuest } from '../../../lib/aiLesson/course/adventure/advQuest';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import type { AdventureV2Profile, AdvRoute } from '../../../lib/aiLesson/course/adventure/advTypes';

const src = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const SHELL = src('src/components/ai-course/adventure/AdvShell.tsx');
const MAP = src('src/components/ai-course/adventure/AdvAdventureMap.tsx');
const PAGE = src('src/pages/ai-lesson/AiCoursePage.tsx');

/** 公開ビルドで LegacyGate に差し替わる＝行き止まりになる step 名 */
const LEGACY_STEPS = ['lab', 'vocab', 'adventure', 'n3area', 'n2grammar'];

describe('冒険から旧コースの画面へ出ない', () => {
  it('AdvShell が旧コースの入口を呼ばない', () => {
    // onOpenArea（旧N3エリア）と onOpenReview（旧オモイデ庭園）は、
    // どちらも公開ビルドで行き止まりになる先へ繋がっていた
    expect(SHELL).not.toMatch(/props\.onOpenArea\(/);
    expect(SHELL).not.toMatch(/props\.onOpenReview\b(?!\s*:)/);
  });

  it('復習は冒険の中で完結する（外の画面へ出さない）', () => {
    expect(SHELL).toContain('startReviewBattle');
    // 復習の3つの入口（今日の冒険のステップ・マップ・サブメニュー）が同じ処理を指す
    const uses = SHELL.match(/startReviewBattle/g) ?? [];
    expect(uses.length, '復習の入口が1つでも旧画面へ残っている').toBeGreaterThanOrEqual(4);
  });

  it('マップは教材を取りに行かない（鍵付きの先読みをしない）', () => {
    // 島の表示は profile と route だけで作る。fetch があれば locked の中身が漏れうる
    expect(MAP).not.toMatch(/fetch\(/);
    expect(MAP).not.toMatch(/fetchStageContent|startActivity/);
  });

  it('マップの島は必ずCTAを持つ（押しても何も起きない状態を作らない）', () => {
    expect(MAP).toContain('resolveAction');
    // 使えない行き先は今日の冒険へ倒す
    expect(MAP).toContain('onStartToday');
  });

  it('旧コースの画面は公開ビルドから外れたまま', () => {
    for (const s of LEGACY_STEPS) {
      expect(PAGE, `${s} が公開ビルドへ戻っている`).toMatch(
        new RegExp(`import\\.meta\\.env\\.DEV`),
      );
    }
    expect(PAGE).toContain('LegacyGate');
  });
});

describe('今日の冒険のステップに行き止まりが無い', () => {
  const route: AdvRoute = {
    stages: [{
      stageId: 'stg-1', kind: 'n3_bridge', areaId: 'area01-minato',
      titleJa: '基礎', titleZh: '基础',
      targets: { n3UnitIds: ['n3u-03-move'], n3GrammarIds: [], n2Units: [] },
    }],
  } as unknown as AdvRoute;

  const profile: AdventureV2Profile = {
    ...defaultAdvProfile('2026-08-04T00:00:00Z'),
    enabled: true, goalType: 'jlpt', targetJlpt: 'N3', dailyMinutes: 15,
  };

  const quest = generateTodayQuest({
    profile, route, dueReviewCount: 2, weakGrammarIds: [],
    dateKey: '2026-08-04', nowISO: '2026-08-04T00:00:00Z', daysToExam: null,
    availability: { nextGrammarIds: [], nextUnitIds: ['n3u-03-move'], conversationTargets: [] },
    examSkills: {
      weakestSkill: null, readingEvidence: 0, listeningEvidence: 0,
      readingTargetIds: ['read-n3-shortPassage'], listeningTargetIds: ['listen-n3-quickResponse'],
    },
  });

  it('ステップが1つ以上ある', () => {
    expect(quest.steps.length).toBeGreaterThan(0);
  });

  it('AdvShell が全ての step kind を処理している（無反応を作らない）', () => {
    const handled = ['review_due', 'conversation_mission', 'restate', 'reading_short',
      'listening_practice', 'vocab_new', 'grammar_new', 'weak_reinforce', 'battle'];
    for (const s of quest.steps) {
      expect(handled, `${s.kind} が runStep で処理されていない`).toContain(s.kind);
      expect(SHELL, `${s.kind} の分岐が AdvShell に無い`).toContain(`'${s.kind}'`);
    }
  });

  it('ことばのステップは、実際にやること（問題）を名乗る', () => {
    const vocab = quest.steps.find((s) => s.kind === 'vocab_new');
    expect(vocab).toBeTruthy();
    expect(vocab!.titleJa).toBe('単元のことばを問題で確認する');
    expect(vocab!.titleZh).toBe('用题目确认单元词汇');
    expect(vocab!.shortJa).toBe('ことばチャレンジ');
    expect(vocab!.shortZh).toBe('词汇挑战');
    // 「学ぶ」と言って問題を出す（説明画面が無いのに説明があるかのように読ませる）のをやめた
    expect(vocab!.titleJa).not.toContain('学ぶ');
  });
});
