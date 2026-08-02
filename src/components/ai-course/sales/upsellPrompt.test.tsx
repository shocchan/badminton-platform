// @vitest-environment jsdom
// アップセル表示の受入テスト（§12 §13 §19）。
//
// 「出す/出さない」の判断は upsell.test.ts が担当する。
// ここは **押し付けていないか** だけを見る。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UpsellPrompt } from './UpsellPrompt';
import { decideUpsell, type UpsellContext } from '../../../lib/aiLesson/course/sales/upsell';

afterEach(cleanup);

const ctx = (over: Partial<UpsellContext> = {}): UpsellContext => ({
  sessionId: 's1', nowMs: 1_700_000_000_000, currentPlanId: 'ai-hour-pass',
  firstAdventureCompleted: true, activeMinutesUsed: 25, remainingMinutes: 35,
  entitlementExhausted: false, activeDays: 0, repeatedWeaknessCount: 0,
  examGoalDeclared: false, weakSkillCount: 0, humanHelpRequested: false, ...over,
});

const show = (over: Partial<UpsellContext> = {}, lang: 'ja' | 'zh' = 'ja', handlers = {}) => {
  const decision = decideUpsell(ctx(over), []);
  const onDismiss = vi.fn();
  const onAccept = vi.fn();
  render(
    <MemoryRouter>
      <UpsellPrompt decision={decision} lang={lang} onDismiss={onDismiss} onAccept={onAccept} {...handlers} />
    </MemoryRouter>,
  );
  return { decision, onDismiss, onAccept };
};

describe('押し付けない見せ方（§12）', () => {
  it('画面を覆わない（モーダルではない）', () => {
    const { container } = (() => { show(); return { container: document.body }; })();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByTestId('upsell-prompt').tagName).toBe('ASIDE');
  });

  it('「今はしない」が、進むボタンと同じ大きさで見えている', () => {
    show();
    const accept = screen.getByRole('link', { name: '1か月プランを見る' });
    const dismiss = screen.getByTestId('upsell-dismiss');
    // どちらも同じ高さ・同じ幅配分。断る側だけ小さくしていない
    expect(accept.className).toMatch(/min-h-12/);
    expect(dismiss.className).toMatch(/min-h-12/);
    expect(accept.className).toMatch(/flex-1/);
    expect(dismiss.className).toMatch(/flex-1/);
  });

  it('焦らせる要素を置かない', () => {
    show();
    const text = screen.getByTestId('upsell-prompt').textContent ?? '';
    // 「復習の予定が残ります」のような正当な語まで弾かないよう、
    // 急かす言い回しだけを見る
    for (const w of ['残りわずか', '残り時間', '期限が', '今だけ', '本日限定', '締切',
                     '急い', 'お早め', 'あと1', 'まもなく', '仅剩', '截止', '尽快', '马上就']) {
      expect(text.includes(w), `「${w}」が出ている`).toBe(false);
    }
    // カウントダウンの類も置かない
    expect(/\d+\s*(秒|分以内|時間以内|天内就)/.test(text)).toBe(false);
  });

  it('閉じる操作が通知される（記録して冷却期間に入るため）', () => {
    const { onDismiss } = show();
    fireEvent.click(screen.getByTestId('upsell-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('進む操作が通知される', () => {
    const { onAccept } = show();
    fireEvent.click(screen.getByRole('link', { name: '1か月プランを見る' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});

describe('出さないと決まったら描画しない', () => {
  it('条件を満たしていなければ何も出ない', () => {
    show({ firstAdventureCompleted: false, activeMinutesUsed: 0, remainingMinutes: 60 });
    expect(screen.queryByTestId('upsell-prompt')).toBeNull();
  });
});

describe('§13 6か月は相談へ', () => {
  it('購入ボタンではなく相談への導線になる', () => {
    show({ currentPlanId: 'ai-month', activeDays: 10 });
    expect(screen.getByRole('link', { name: '伴走コースについて相談する' })).toBeTruthy();
    expect(screen.getByTestId('upsell-dismiss').textContent).toBe('AI学習を続ける');
  });

  it('先生が何をするかを具体的に書く（§13の文面）', () => {
    show({ currentPlanId: 'ai-month', activeDays: 10 });
    const text = screen.getByTestId('upsell-prompt').textContent ?? '';
    for (const w of ['学習方針の修正', '苦手原因の分析', 'JLPT試験戦略', '重要な会話練習']) {
      expect(text).toContain(w);
    }
  });
});

describe('i18n とアクセシビリティ（§19）', () => {
  it('zh でも同じ構造で出る', () => {
    show({}, 'zh');
    expect(screen.getByRole('link', { name: '查看1个月计划' })).toBeTruthy();
    expect(screen.getByTestId('upsell-dismiss').textContent).toBe('现在不用');
  });

  it('領域に名前がついている', () => {
    show();
    const el = screen.getByTestId('upsell-prompt');
    const headingId = el.getAttribute('aria-labelledby')!;
    expect(document.getElementById(headingId)!.tagName).toBe('H3');
  });
});
