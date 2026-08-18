// @vitest-environment jsdom
// 冒険マップの模試CTAは「模試を出せる級」だけに出す（2026-08-18）。
//
// 何が起きていたか（実測）:
//   AdvShell 側は mockLevelOf で N5/N4 の模試入口を塞いだが、**冒険マップは別配線**だった。
//   N5ルートの最終地域「N5達成の確認」（kind: 'mock_boss'）のCTAは無条件に
//   `kind: 'mock'` で、押すと onOpenMock → 「N5のミニ模試はまだありません」の画面。
//   ルートの最終地域が「受けられない模試」を指す＝**行き止まり**だった（原則15）。
//   ホーム側だけ直してマップを見落とすと、生徒には同じ嘘がもう一方の画面から見える。
//
// 直し方（2026-08-18 更新）:
//   mock_boss / n2_gate のCTAは**全級とも今日の冒険（ボス戦step）**へ返す。
//   当初は「模試を出せる級だけ mock CTA を残す」形にしたが、実測するとN3/N2でも同じ嘘だった:
//   ミニ模試の結果は `mock-n3` / `mock-n2` へ記録され、**ボスstageの台帳には入らない**。
//   つまりカードに「別の日にあと3回、80%以上」と出したまま、その回数が永久に増えないボタンだった。
//   ボス戦は今日の冒険のstepとして出す（advQuest の bossStep）ので、そこへ返すのが実装と一致する。
//   ミニ模試は別の練習として、ホームのメニューと準備度画面に残っている（教材のある級だけ）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AdvAdventureMap } from './AdvAdventureMap';
import { buildAdventureMap } from '../../../lib/aiLesson/course/adventure/advMapModel';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../../lib/aiLesson/course/adventure/advRoute';
import {
  ACTIVE_TARGET_LEVELS, type AdventureV2Profile, type JlptLevel, type AdvTodayQuest,
} from '../../../lib/aiLesson/course/adventure/advTypes';

afterEach(cleanup);

const NOW = '2026-08-18T00:00:00.000Z';

const profileFor = (target: JlptLevel): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  enabled: true,
  goalType: 'jlpt',
  targetJlpt: target,
  dailyMinutes: 15,
  route: generateRoute({
    goalType: 'jlpt', targetJlpt: target,
    knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
  }),
});

describe('ボス地域のCTAは模試ではなく今日の冒険（ボス戦）へ行く', () => {
  for (const target of ACTIVE_TARGET_LEVELS) {
    it(`目標${target}: mock_boss地域のCTAが今日の冒険を指す`, () => {
      const p = profileFor(target);
      // 確認stageが**現在地**の状態で見る。霧の中（未解放）の地域は
      // 「現在地にもどる」CTAへ一律で置き換わるので、模試CTAの判定が見えない
      const stages = p.route!.stages;
      const map = buildAdventureMap(
        p, p.route, new Set(stages.slice(0, -1).map((s) => s.stageId)), 1, 'exam', NOW,
      );
      const bosses = map.regions.filter((r) => r.id.endsWith('boss'));
      expect(bosses.length, `${target}ルートに確認stageが無い`).toBeGreaterThan(0);
      for (const b of bosses) {
        // 模試CTAはここには出さない（結果がこのstageの攻略に効かないため）
        expect(b.action.kind, `${b.id} のCTA`).toBe('today');
      }
    });
  }

  it('**どの地域にもCTAが残る**（模試を消したぶんが行き止まりにならない・原則15）', () => {
    for (const target of ACTIVE_TARGET_LEVELS) {
      const p = profileFor(target);
      for (const mastered of [new Set<string>(), new Set(p.route!.stages.map((s) => s.stageId))]) {
        const map = buildAdventureMap(p, p.route, mastered, 1, 'exam', NOW);
        for (const r of map.regions) {
          expect(r.action.labelJa.length, `${target}/${r.id} のCTAが空`).toBeGreaterThan(0);
          expect(r.action.labelZh.length, `${target}/${r.id} のCTA(zh)が空`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('画面でも「受けられない模試」へ誘わない', () => {
  const quest: AdvTodayQuest = {
    questId: 'q1', dateKey: '2026-08-18', goalType: 'jlpt', primaryTargets: [],
    steps: [{ kind: 'review_due', refIds: [], titleJa: '復習2問', titleZh: '复习2题', estMinutes: 3 }],
    whyJa: '', whyZh: '', estimatedMinutes: 15, targetSkills: [], targetExpressions: [],
    successConditionJa: '', successConditionZh: '', nextStepJa: '', nextStepZh: '',
  };

  const setup = (target: JlptLevel) => {
    const p = profileFor(target);
    const stages = p.route!.stages;
    const h = {
      onStartToday: vi.fn(), onBack: vi.fn(), onOpenReview: vi.fn(),
      onStartConversation: vi.fn(), onOpenMock: vi.fn(),
      onOpenSheets: vi.fn(), onOpenInterview: vi.fn(),
    };
    render(
      <AdvAdventureMap
        lang="ja" profile={p} route={p.route}
        /* 最終地域（確認stage）が現在地になった状態 */
        mastered={new Set(stages.slice(0, -1).map((s) => s.stageId))}
        currentWeek={1} quest={quest}
        nextStepTitleJa="復習2問" nextStepTitleZh="复习2题"
        reviewAvailable conversationAvailable
        sheetsVisible={false} sheetCount={0} interviewVisible={false}
        {...h}
      />,
    );
    return h;
  };

  for (const target of ACTIVE_TARGET_LEVELS) {
    it(`目標${target}: 最終地域に模試ボタンが無く、押せるCTAは今日の冒険へ行く`, () => {
      const h = setup(target);
      expect(screen.queryByRole('button', { name: /ミニ模試を受ける/ })).toBeNull();
      // 現在地カードのCTA（todayAction は現在地で「ここを進める」に言い換わる）
      fireEvent.click(screen.getByRole('button', { name: '今日の冒険でここを進める' }));
      expect(h.onOpenMock).not.toHaveBeenCalled();
      expect(h.onStartToday).toHaveBeenCalled();
    });
  }
});
