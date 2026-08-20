// @vitest-environment jsdom
// 体験終了後のアップグレード画面（2026-08-20 CEO指示）。
//
// 守りたいのは:
// - **その場で3択が出る**（LPの先頭へ戻さない＝決めやすい瞬間を捨てない）
// - 60分・1か月は**クレジット決済へ直行**、6か月は**連絡先フォーム**（人が対応する商品）
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const startCheckout = vi.fn();
const canStartCheckout = vi.fn();
vi.mock('../../lib/aiLesson/course/plans/planCheckout', () => ({
  startCheckout: (...a: unknown[]) => startCheckout(...a),
  canStartCheckout: (...a: unknown[]) => canStartCheckout(...a),
}));
vi.mock('../../lib/aiLesson/course/courseAnalytics', () => ({
  trackCourse: () => {}, trackCourseOnce: () => {},
}));

import { TrialEndedUpgrade } from './TrialEndedUpgrade';
import { publishedPlans, planView } from '../../lib/aiLesson/course/plans/planCatalog';

const setup = (lang: 'ja' | 'zh' = 'ja') => {
  const onApply = vi.fn();
  const onLogout = vi.fn();
  render(<TrialEndedUpgrade lang={lang} onApply={onApply} onLogout={onLogout} />);
  return { onApply, onLogout };
};

describe('体験終了後のアップグレード画面', () => {
  beforeEach(() => { startCheckout.mockReset(); canStartCheckout.mockReset().mockReturnValue(true); });
  afterEach(() => cleanup());

  it('**公開中の3プランがその場に並ぶ**（LPへ戻さない）', () => {
    setup();
    for (const p of publishedPlans()) {
      const v = planView(p, 'ja');
      expect(screen.getByText(v.name), v.id).toBeTruthy();
    }
    expect(screen.getByText(/60分の体験が終了しました/)).toBeTruthy();
  });

  it('価格・期間はカタログの表示をそのまま出す', () => {
    setup();
    const trial = planView(publishedPlans().find((p) => p.id === 'ai-trial-pass')!, 'ja');
    expect(screen.getAllByText(trial.priceLabel).length).toBeGreaterThan(0);
    expect(screen.getByText(trial.durationLabel)).toBeTruthy();
  });

  it('**60分パスはクレジット決済へ直行する**', async () => {
    startCheckout.mockResolvedValue({ ok: false, reason: 'network' }); // 遷移させない
    const { onApply } = setup();
    fireEvent.click(screen.getAllByRole('button', { name: /クレジットカードで購入/ })[0]);
    await waitFor(() => expect(startCheckout).toHaveBeenCalled());
    expect(startCheckout.mock.calls[0][0]).toBe('ai-trial-pass');
    // 決済が使えなかったときは申込フォームで受ける（行き止まりにしない）
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('ai-trial-pass'));
  });

  it('**1か月プランもクレジット決済へ直行する**', async () => {
    startCheckout.mockResolvedValue({ ok: false, reason: 'network' });
    setup();
    fireEvent.click(screen.getAllByRole('button', { name: /クレジットカードで購入/ })[1]);
    await waitFor(() => expect(startCheckout).toHaveBeenCalled());
    expect(startCheckout.mock.calls[0][0]).toBe('ai-month');
  });

  it('**6か月伴走コースは決済せず連絡先フォームへ**（人が対応する商品）', () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: /連絡先を送って相談する/ }));
    expect(onApply).toHaveBeenCalledWith('coach-6m');
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('決済が無効な環境では60分・1か月も申込フォームへ倒れる', () => {
    canStartCheckout.mockReturnValue(false);
    const { onApply } = setup();
    fireEvent.click(screen.getAllByRole('button', { name: /連絡先を送って相談する/ })[0]);
    expect(onApply).toHaveBeenCalled();
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('中国語でも日本語のラベルが残らない', () => {
    setup('zh');
    expect(screen.getByText(/60分钟的体验结束了/)).toBeTruthy();
    expect(screen.queryByText(/クレジットカードで購入/)).toBeNull();
  });
});
