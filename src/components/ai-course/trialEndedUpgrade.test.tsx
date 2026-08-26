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

/* ── 「あなたの現在地」（2026-08-26 ファネル監査 P1） ──────────────
   この画面はいきなり値段3つの表だった。60分やり切った直後に見たいのは
   値段ではなく自分が何をしたかで、続きを買う理由もそこにしかない。
   実データだけを出し、0件の項目は成果として見せない。
   数字は本番の実在の体験購入者（会話2回・199秒・復習4件）を模したもの。
   ただし表示の検証には 398秒（→7分）を使う。分の丸めが効く値のほうが壊れを見つけやすい。 */
describe('体験終了画面の「あなたの現在地」', () => {
  // cleanup は上の describe に閉じているので、この block にも要る
  // （無いとDOMが積み上がり「同じ文字が複数ある」で落ちる）
  beforeEach(() => { canStartCheckout.mockReturnValue(true); });
  afterEach(() => cleanup());

  const real = {
    conversations: 2, spokenSeconds: 398, saidIndependently: 1,
    expressions: ['〜といいます', '〜に住んでいます'],
    scheduledForReview: 4, nextExpression: '〜といいます', hasAnything: true,
  };

  /** 「話した時間」などのラベルに対応する数値を、その組から取り出す */
  const statValue = (label: string): string => {
    const dt = screen.getByText(label);
    return (dt.parentElement?.querySelector('dd')?.textContent ?? '').trim();
  };

  it('話した時間・回数・表現の数を実データで出す', () => {
    render(<TrialEndedUpgrade lang="ja" onApply={() => {}} onLogout={() => {}} summary={real} />);
    expect(screen.getByText('この60分であなたがやったこと')).toBeTruthy();
    expect(statValue('話した時間')).toBe('7分');      // 398秒 → 6.63分 → 四捨五入で7分
    expect(statValue('会話した回数')).toBe('2回');
    expect(statValue('練習した表現')).toBe('2個');
  });

  it('「続き」は売り文句ではなく、実際に予定されていた次の再会を書く', () => {
    render(<TrialEndedUpgrade lang="ja" onApply={() => {}} onLogout={() => {}} summary={real} />);
    expect(screen.getByText(/「〜といいます」など 4 個の表現/)).toBeTruthy();
    expect(screen.getByText(/続けたときに届きます/)).toBeTruthy();
  });

  it('自分から言えた回数が0なら、その行を出さない（0を成果にしない）', () => {
    render(<TrialEndedUpgrade lang="ja" onApply={() => {}} onLogout={() => {}}
      summary={{ ...real, saidIndependently: 0 }} />);
    expect(screen.queryByText(/自分から目標表現を使えました/)).toBeNull();
  });

  it('まとめが取れなければ何も出さない（作り話をしない）', () => {
    render(<TrialEndedUpgrade lang="ja" onApply={() => {}} onLogout={() => {}} summary={null} />);
    expect(screen.queryByText('この60分であなたがやったこと')).toBeNull();
  });

  it('中身が空なら出さない', () => {
    render(<TrialEndedUpgrade lang="ja" onApply={() => {}} onLogout={() => {}}
      summary={{ ...real, hasAnything: false }} />);
    expect(screen.queryByText('この60分であなたがやったこと')).toBeNull();
  });

  it('中国語でも同じ内容が出る', () => {
    render(<TrialEndedUpgrade lang="zh" onApply={() => {}} onLogout={() => {}} summary={real} />);
    expect(screen.getByText('你在这60分钟里做到的')).toBeTruthy();
    expect(screen.getByText(/这部分要继续才会送到你手上/)).toBeTruthy();
  });
});
