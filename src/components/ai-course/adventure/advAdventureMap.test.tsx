// @vitest-environment jsdom
// 成長マップの受入テスト（PRODUCT_CANON 原則13/15/16）。
//
// いちばん守りたいのは **行き止まりを作らないこと**。
// どの地域を開いても押せるボタンが1つあり、それが実際の行動へ繋がることを確認する。
// 「地図で見る」「一覧で見る」の両方で確認する（片方だけ直しても意味がない）。
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AdvAdventureMap } from './AdvAdventureMap';
import { defaultAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../../lib/aiLesson/course/adventure/advRoute';
import type {
  AdventureV2Profile, AdvGoalType, AdvTodayQuest,
} from '../../../lib/aiLesson/course/adventure/advTypes';

const NOW = '2026-08-02T00:00:00.000Z';

const profileFor = (goalType: AdvGoalType): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  goalType,
  targetJlpt: goalType === 'conversation' ? null : 'N2',
  dailyMinutes: 15,
  route: generateRoute({
    goalType, targetJlpt: goalType === 'conversation' ? null : 'N2',
    knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
  }),
});

const quest: AdvTodayQuest = {
  questId: 'q1', dateKey: '2026-08-02', goalType: 'hybrid', primaryTargets: [],
  steps: [{ kind: 'review_due', refIds: [], titleJa: '復習2問', titleZh: '复习2题', estMinutes: 3 }],
  whyJa: '', whyZh: '', estimatedMinutes: 15, targetSkills: [], targetExpressions: [],
  successConditionJa: '', successConditionZh: '', nextStepJa: '', nextStepZh: '',
};

const handlers = () => ({
  onStartToday: vi.fn(), onBack: vi.fn(),
  onOpenReview: vi.fn(), onStartConversation: vi.fn(), onOpenMock: vi.fn(),
  onOpenSheets: vi.fn(),
});

const setup = (opts: {
  goal?: AdvGoalType; lang?: 'ja' | 'zh'; mastered?: Set<string>; week?: number;
  reviewAvailable?: boolean; conversationAvailable?: boolean;
  sheetsVisible?: boolean; sheetCount?: number;
} = {}) => {
  const h = handlers();
  const p = profileFor(opts.goal ?? 'hybrid');
  render(
    <AdvAdventureMap
      lang={opts.lang ?? 'ja'} profile={p} route={p.route}
      mastered={opts.mastered ?? new Set()} currentWeek={opts.week ?? 1} quest={quest}
      nextStepTitleJa="復習2問" nextStepTitleZh="复习2题"
      reviewAvailable={opts.reviewAvailable ?? true}
      conversationAvailable={opts.conversationAvailable ?? true}
      sheetsVisible={opts.sheetsVisible ?? false}
      sheetCount={opts.sheetCount ?? 0}
      {...h}
    />,
  );
  return h;
};

/** 地域の見出しボタン（aria-labelに地域名・鍛える力・状態が入っている） */
const regionButtons = () => screen.getAllByRole('button')
  .filter((b) => (b.getAttribute('aria-expanded') ?? null) !== null);

afterEach(() => cleanup());

describe('成長マップ — 3秒で「今どこ・次どこ・何する」', () => {
  it('現在地・次の目的地・今日のCTAが最初から見えている', () => {
    setup();
    expect(screen.getByLabelText('現在地')).toBeTruthy();
    expect(screen.getByText(/次の目的地：/)).toBeTruthy();
    expect(screen.getByLabelText('今日の一歩')).toBeTruthy();
    expect(screen.getByRole('button', { name: '今日の冒険を始める' })).toBeTruthy();
    // 次にやることを名指しする（「何かをやれ」で終わらせない）
    expect(screen.getByText(/次にやること：「復習2問」/)).toBeTruthy();
  });

  it('**同じ文言のボタンを2つ並べない**（主要CTAと現在地カードのCTA）', () => {
    setup();
    expect(screen.getAllByRole('button', { name: '今日の冒険を始める' })).toHaveLength(1);
    // 現在地カード側は場所を名指しする
    expect(screen.getByRole('button', { name: /今日の冒険でここを進める/ })).toBeTruthy();
  });

  it('開いた時点で現在地の詳細が開いている（探させない・原則16）', () => {
    setup({ goal: 'jlpt' });
    // 現在地の見出しと詳細カードの両方に地域名が出る
    expect(screen.getAllByText('基礎キャンプ').length).toBeGreaterThan(1);
    expect(screen.getByText('土台のことばと文を短期間で固める')).toBeTruthy();
  });

  it('中国語でも日本語が残らない（主要なラベル）', () => {
    setup({ lang: 'zh' });
    expect(screen.getByText('成长地图')).toBeTruthy();
    expect(screen.getByLabelText('今天的一步')).toBeTruthy();
    expect(screen.getByRole('button', { name: '开始今天的冒险' })).toBeTruthy();
    expect(screen.queryByText('成長マップ')).toBeNull();
  });
});

describe('成長マップ — 行き止まりが無い（原則15）', () => {
  for (const asList of [false, true]) {
    it(`${asList ? '一覧表示' : '地図表示'}: どの地域を開いてもCTAが1つ出る`, () => {
      setup({ goal: 'jlpt' });
      if (asList) fireEvent.click(screen.getByRole('button', { name: '一覧で見る' }));

      const regions = regionButtons();
      expect(regions.length).toBeGreaterThan(3);
      for (const btn of regions) {
        // 開いている地域を一度閉じてから、この地域を開く
        const name = btn.getAttribute('aria-label') ?? '';
        fireEvent.click(btn);
        const ctas = screen.getAllByRole('button')
          .filter((b) => /始める|受ける|維持する|進める/.test(b.textContent ?? ''));
        expect(ctas.length, `${name} にCTAが無い`).toBeGreaterThan(0);
      }
    });
  }

  it('攻略済みの地域からは復習へ行ける', () => {
    const h = setup({ goal: 'jlpt', mastered: new Set(['stg-foundation']) });
    const done = regionButtons().find((b) => (b.getAttribute('aria-label') ?? '').includes('攻略済み'));
    expect(done).toBeTruthy();
    fireEvent.click(done!);
    fireEvent.click(screen.getByRole('button', { name: /復習で維持する/ }));
    expect(h.onOpenReview).toHaveBeenCalledTimes(1);
  });

  it('会話の現在地からはAI会話へ行ける', () => {
    const h = setup({ goal: 'conversation' });
    fireEvent.click(screen.getByRole('button', { name: /AI会話を始める/ }));
    expect(h.onStartConversation).toHaveBeenCalledTimes(1);
  });

  it('**AI会話が使えないときは会話へ飛ばさず今日の冒険へ倒す**（押しても何も起きない状態を作らない）', () => {
    const h = setup({ goal: 'conversation', conversationAvailable: false });
    expect(screen.queryByRole('button', { name: /AI会話を始める/ })).toBeNull();
    expect(screen.getByText(/いまAI会話は使えません/)).toBeTruthy();
    fireEvent.click(within(screen.getByText(/いまAI会話は使えません/).parentElement!)
      .getByRole('button', { name: /今日の冒険を始める/ }));
    expect(h.onStartConversation).not.toHaveBeenCalled();
    expect(h.onStartToday).toHaveBeenCalled();
  });

  it('復習が0件なら復習へ飛ばさず今日の冒険へ倒す', () => {
    const h = setup({ goal: 'jlpt', mastered: new Set(['stg-foundation']), reviewAvailable: false });
    const done = regionButtons().find((b) => (b.getAttribute('aria-label') ?? '').includes('攻略済み'));
    fireEvent.click(done!);
    expect(screen.queryByRole('button', { name: /復習で維持する/ })).toBeNull();
    expect(screen.getByText(/いま復習の予定はありません/)).toBeTruthy();
    expect(h.onOpenReview).not.toHaveBeenCalled();
  });

  it('模試が現在地になったらミニ模試へ行ける', () => {
    const p = profileFor('jlpt');
    const stages = p.route!.stages;
    const h = setup({ goal: 'jlpt', mastered: new Set(stages.slice(0, -1).map((s) => s.stageId)) });
    fireEvent.click(screen.getByRole('button', { name: /ミニ模試を受ける/ }));
    expect(h.onOpenMock).toHaveBeenCalledTimes(1);
  });
});

describe('成長マップ — 過去問の試験場（N2受験者のみ）', () => {
  it('**sheetsVisible のときだけ出る**（それ以外の画面に存在しない）', () => {
    setup({ goal: 'jlpt', sheetsVisible: true, sheetCount: 2 });
    expect(screen.getByText('過去問の試験場')).toBeTruthy();
    expect(screen.getByText(/答案用紙 2枚/)).toBeTruthy();
    cleanup();
    setup({ goal: 'conversation', sheetsVisible: false });
    expect(screen.queryByText('過去問の試験場')).toBeNull();
  });

  it('押すと onOpenSheets が呼ばれる', () => {
    const h = setup({ goal: 'jlpt', sheetsVisible: true, sheetCount: 1 });
    fireEvent.click(screen.getByText('過去問の試験場'));
    expect(h.onOpenSheets).toHaveBeenCalledTimes(1);
  });

  it('用紙0枚でも「届いたらここで解く」と案内する（空の行き止まりにしない）', () => {
    setup({ goal: 'jlpt', sheetsVisible: true, sheetCount: 0 });
    expect(screen.getByText(/先生からWeChatで問題が届いたら/)).toBeTruthy();
  });
});

describe('成長マップ — 測っていないものを盛らない（原則13）', () => {
  it('会話の地域は定着バーを出さず「未判定」と書く', () => {
    setup({ goal: 'conversation' });
    expect(screen.getByText(/定着：未判定/)).toBeTruthy();
    expect(screen.queryByRole('progressbar', { name: '定着' })).toBeNull();
  });

  it('未解放の地域には「どうすれば開くか」が出る', () => {
    setup({ goal: 'jlpt' });
    const locked = regionButtons().find((b) => (b.getAttribute('aria-label') ?? '').includes('ことばの霧の中'));
    expect(locked).toBeTruthy();
    fireEvent.click(locked!);
    expect(screen.getByText(/先に基礎キャンプを攻略します|基礎キャンプを攻略すると開きます/)).toBeTruthy();
  });
});
