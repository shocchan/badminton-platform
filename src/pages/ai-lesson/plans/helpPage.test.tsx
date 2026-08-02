// @vitest-environment jsdom
// 自己解決ヘルプの受入テスト（§15 §20）。
//
// 一番大事なのは「人を呼ばずに直る」ことと、
// 「それでも直らない人が問い合わせ先を見つけられる」ことの両立。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { HelpPage } from './HelpPage';
import {
  HELP_TOPICS, helpTopicById, describeResync, helpPathFor,
} from '../../../lib/aiLesson/course/sales/salesHelp';
import { resetSimulatedSales } from '../../../lib/aiLesson/course/sales/localSalesRepository';

afterEach(cleanup);
beforeEach(() => resetSimulatedSales(window.localStorage));

const open = (lang: 'ja' | 'zh' = 'ja') =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[helpPathFor(lang)]}>
        <Routes>
          <Route path="/:lang/ai-course/help" element={<HelpPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

describe('§15 が挙げた症状をすべて扱う', () => {
  const REQUIRED = [
    'purchased_but_unusable', 'otp_not_received', 'remaining_time_wrong', 'closed_browser',
    'no_audio', 'mic_not_working', 'switch_to_chinese', 'progress_seems_lost',
    'want_repurchase', 'want_month_plan', 'receipt_info',
  ];

  it('11項目すべてがある', () => {
    for (const id of REQUIRED) expect(helpTopicById(id), id).not.toBeNull();
    expect(HELP_TOPICS.length).toBe(REQUIRED.length);
  });

  it('全項目が画面に出る', () => {
    open('ja');
    for (const id of REQUIRED) expect(screen.getByTestId(`help-${id}`), id).toBeTruthy();
  });

  it('全項目が ja/zh の両方で書かれている', () => {
    for (const t of HELP_TOPICS) {
      expect(t.questionZh.length, t.id).toBeGreaterThan(0);
      expect(t.stepsZh.length, t.id).toBe(t.stepsJa.length);
    }
  });

  it('どの項目も「自分で試す手順」を必ず持つ（いきなり問い合わせにしない・§15）', () => {
    for (const t of HELP_TOPICS) {
      expect(t.stepsJa.length, `${t.id} に手順が無い`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('その場で直せる', () => {
  it('利用権が無い状態を、正直に伝える（直ったと言わない）', () => {
    open('ja');
    expect(screen.getByTestId('entitlement-summary').textContent).toContain('今使える利用権はありません');

    fireEvent.click(screen.getAllByRole('button', { name: '利用権を取り直す' })[0]);
    expect(screen.getByTestId('recovery-message').textContent).toContain('見つかりませんでした');
    // ここで初めて問い合わせを案内する
    expect(screen.getByTestId('recovery-message').textContent).toContain('お問い合わせください');
  });

  it('OTPの再送を、その場の操作で完結させる', () => {
    open('ja');
    fireEvent.click(screen.getByRole('button', { name: 'コードを送り直す' }));
    expect(screen.getByTestId('otp-message').textContent).toContain('送り直しました');
    expect(screen.getByTestId('otp-message').textContent).toContain('迷惑メール');
  });

  it('再購入・プラン変更は料金ページへつながる（行き止まりにしない）', () => {
    open('ja');
    const links = screen.getAllByRole('link', { name: '料金プランを見る' });
    expect(links.length).toBeGreaterThanOrEqual(2);   // 再購入と1か月への変更
    expect(links[0].getAttribute('href')).toBe('/ja/ai-course/plans');
  });
});

describe('再同期の結果の言い分け', () => {
  it('変化があったときだけ「更新しました」と言う', () => {
    const r = describeResync(
      { hasAccess: false, remainingActiveSeconds: 0 },
      { hasAccess: true, remainingActiveSeconds: 3600 },
    );
    expect(r.outcome).toBe('recovered');
    expect(r.messageJa).toContain('更新しました');
  });

  it('もともと正常だったときに「直しました」と言わない', () => {
    const same = { hasAccess: true, remainingActiveSeconds: 1200 };
    const r = describeResync(same, same);
    expect(r.outcome).toBe('nothing_to_fix');
    expect(r.messageJa).toContain('正常でした');
    expect(r.messageJa.includes('直しました')).toBe(false);
  });

  it('直らないときは、確認事項を出したうえで問い合わせへ導く', () => {
    const none = { hasAccess: false, remainingActiveSeconds: 0 };
    const r = describeResync(none, none);
    expect(r.outcome).toBe('still_failing');
    expect(r.messageJa).toContain('同じメールアドレス');
    expect(r.messageJa).toContain('お問い合わせ');
    expect(r.messageZh).toContain('联系我们');
  });
});

describe('問い合わせを隠さない（§15末尾）', () => {
  it('問い合わせ導線が必ずある（法務フッターにも出るので複数で良い）', () => {
    open('ja');
    expect(screen.getAllByRole('link', { name: 'お問い合わせ' }).length).toBeGreaterThanOrEqual(1);
  });

  it('ただし、手順より上には置かない（まず自分で試せる形にする）', () => {
    const { container } = open('ja');
    const text = container.textContent ?? '';
    expect(text.indexOf('よくある症状')).toBeLessThan(text.indexOf('それでも解決しないときは'));
  });

  it('zh でも問い合わせにたどり着ける', () => {
    open('zh');
    expect(screen.getAllByRole('link', { name: '联系我们' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('entitlement-summary').textContent).toContain('没有可用的使用权');
  });
});

describe('計測（§18 自己解決）', () => {
  it('再同期と問い合わせを、個人情報なしで記録する', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    open('ja');
    fireEvent.click(screen.getAllByRole('button', { name: '利用権を取り直す' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'コードを送り直す' }));

    const events = gtag.mock.calls.map((c) => c[1]);
    expect(events).toContain('otp_resend_succeeded');
    expect(events.some((e) => String(e).startsWith('entitlement_resync'))).toBe(true);
    // 送っているパラメータに自由記述・メールが混じらない
    for (const call of gtag.mock.calls) {
      const params = (call[2] ?? {}) as Record<string, unknown>;
      for (const v of Object.values(params)) {
        expect(String(v).includes('@'), '計測にメールが混じっている').toBe(false);
      }
    }
    delete (window as unknown as { gtag?: unknown }).gtag;
  });
});

describe('アクセシビリティ（§19）', () => {
  it('復旧結果が読み上げられる領域に出る', () => {
    open('ja');
    fireEvent.click(screen.getAllByRole('button', { name: '利用権を取り直す' })[0]);
    const el = screen.getByTestId('recovery-message');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('開閉できる項目のヘッダーが、指で押せる高さを持つ', () => {
    const { container } = open('ja');
    for (const s of Array.from(container.querySelectorAll('summary'))) {
      expect(s.className).toMatch(/min-h-11/);
    }
  });
});
