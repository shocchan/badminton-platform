// @vitest-environment jsdom
// 購入導線の通し確認（§14 §19 §20）。
//
// 画面から実際に操作して「決済 → 利用権付与 → 学習開始の案内」まで到達することを固定する。
// 人の承認・招待コードの入力・順番待ちが一度も挟まらないことが要点。

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { PurchasePage } from './PurchasePage';
import { PlansPage } from './PlansPage';
import { resetSimulatedSales } from '../../../lib/aiLesson/course/sales/localSalesRepository';
import { purchasePathFor } from '../../../lib/aiLesson/course/sales/plansContent';
import { salesPlanById } from '../../../lib/aiLesson/course/sales/planConfig';

afterEach(cleanup);
beforeEach(() => resetSimulatedSales(window.localStorage));

/** `?checkout=sim` を付けて模擬決済モードで開く（vitest の MODE は production ではない） */
const open = (planId: string, lang: 'ja' | 'zh' = 'ja', search = '?checkout=sim') =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`${purchasePathFor(lang, planId)}${search}`]}>
        <Routes>
          <Route path="/:lang/ai-course/plans" element={<div>PLANS_PAGE</div>} />
          <Route path="/:lang/ai-course/plans/:planId" element={<PurchasePage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

const fillAndSubmit = (email = 'buyer@example.com', outcomeLabel?: string) => {
  fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: email } });
  if (outcomeLabel) fireEvent.click(screen.getByLabelText(outcomeLabel));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '支払いに進む' }));
};

describe('決済 → 利用権付与 → 学習開始（人の介在なし）', () => {
  it('60分パスを購入すると、その場で使えるようになる', async () => {
    open('ai-hour-pass');
    fillAndSubmit();

    await waitFor(() => expect(screen.getByTestId('purchase-complete-heading')).toBeTruthy());
    expect(screen.getByTestId('purchase-complete-heading').textContent)
      .toContain('60分AIパスが使えるようになりました');
    expect(screen.getByTestId('granted-minutes').textContent).toBe('60分');
    expect(screen.getByRole('link', { name: '学習を始める' })).toBeTruthy();
  });

  it('購入完了までに、承認待ち・招待コードの入力が一度も出てこない（§4-1）', async () => {
    open('ai-hour-pass');
    const beforeSubmit = document.body.textContent ?? '';
    // 「順番待ちはありません」のような**否定文**は正しい表示なので、
    // 待たせる側の語だけを見る
    for (const w of ['招待コード', '審査', '承認', 'お待ちください', '順番にご案内']) {
      expect(beforeSubmit.includes(w), `購入前に「${w}」が出ている`).toBe(false);
    }
    expect(beforeSubmit).toContain('順番待ちはありません');

    fillAndSubmit();
    await waitFor(() => expect(screen.getByTestId('purchase-complete-heading')).toBeTruthy());
    const afterSubmit = document.body.textContent ?? '';
    for (const w of ['招待コード', '審査', '承認', 'お待ちください', '順番にご案内']) {
      expect(afterSubmit.includes(w), `購入後に「${w}」が出ている`).toBe(false);
    }
    // 入力欄も残らない（次の一手が学習開始だけになっている）
    expect(screen.queryByRole('button', { name: '支払いに進む' })).toBeNull();
  });

  it('初回の案内は 目的 → 現在地 → 時間 → 開始 の順（§7）', async () => {
    open('ai-hour-pass');
    fillAndSubmit();
    await waitFor(() => expect(screen.getByTestId('purchase-complete-heading')).toBeTruthy());
    const text = document.body.textContent ?? '';
    expect(text.indexOf('目的を選ぶ')).toBeLessThan(text.indexOf('現在地を測る'));
    expect(text.indexOf('現在地を測る')).toBeLessThan(text.indexOf('今日使う時間を選ぶ'));
  });

  it('購入直後にアップセルを出さない（§12）', async () => {
    open('ai-hour-pass');
    fillAndSubmit();
    await waitFor(() => expect(screen.getByTestId('purchase-complete-heading')).toBeTruthy());
    const text = document.body.textContent ?? '';
    for (const w of ['1か月AIプラン', 'アップグレード', 'お得', '今なら']) {
      expect(text.includes(w), `購入直後に売り込み「${w}」`).toBe(false);
    }
  });

  it('zh でも同じ導線が通る', async () => {
    open('ai-hour-pass', 'zh');
    fireEvent.change(screen.getByLabelText(/邮箱地址/), { target: { value: 'buyer@example.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '前往支付' }));
    await waitFor(() => expect(screen.getByTestId('purchase-complete-heading')).toBeTruthy());
    expect(screen.getByTestId('purchase-complete-heading').textContent).toContain('已开通');
  });
});

describe('再購入（§11）', () => {
  it('2回目の購入では、進捗が残ることを画面で伝える', async () => {
    open('ai-hour-pass');
    fillAndSubmit('repeat@example.com');
    await waitFor(() => expect(screen.getByTestId('purchase-complete-heading')).toBeTruthy());
    cleanup();

    open('ai-hour-pass');
    fillAndSubmit('repeat@example.com');
    await waitFor(() => expect(screen.getByTestId('carryover-note')).toBeTruthy());
    expect(screen.getByTestId('carryover-note').textContent).toContain('診断のやり直しはありません');
    // 再購入者には目的選択・現在地測定を出さない
    expect(document.body.textContent?.includes('現在地を測る')).toBe(false);
  });
});

describe('支払いが通らなかったとき', () => {
  it('拒否されたら理由を出し、利用権は付かない', async () => {
    open('ai-hour-pass');
    fillAndSubmit('deny@example.com', 'カードが拒否される');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('カードが使えませんでした');
    expect(screen.queryByTestId('purchase-complete-heading')).toBeNull();
  });

  it('結果待ちは、失敗扱いにせず待てることを伝える', async () => {
    open('ai-hour-pass');
    fillAndSubmit('pending@example.com', '結果がすぐ出ない');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('結果を確認しています');
  });

  it('失敗のあとも同じ画面でやり直せる（行き止まりにしない）', async () => {
    open('ai-hour-pass');
    fillAndSubmit('retry@example.com', 'カードが拒否される');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    // フォームは残っている
    expect(screen.getByRole('button', { name: '支払いに進む' })).toBeTruthy();
  });
});

describe('決済モードの安全性', () => {
  it('オプトインが無ければ決済フォームは出ない', () => {
    open('ai-hour-pass', 'ja', '');
    expect(screen.queryByRole('button', { name: '支払いに進む' })).toBeNull();
    expect(document.body.textContent).toContain('オンライン決済は準備中');
  });

  it('模擬決済であることを画面で明示する', () => {
    open('ai-hour-pass');
    expect(document.body.textContent).toContain('模擬決済です');
    expect(document.body.textContent).toContain('本物のカード情報は入力しないでください');
  });

  it('本物のカード番号を入力する欄が存在しない', () => {
    const { container } = open('ai-hour-pass');
    const inputs = Array.from(container.querySelectorAll('input'));
    // メール・規約チェック・模擬結果のラジオだけ
    expect(inputs.map((i) => i.type).sort()).toEqual(['checkbox', 'email', 'radio', 'radio', 'radio', 'radio']);
    expect(container.querySelector('input[autocomplete="cc-number"]')).toBeNull();
  });

  it('6か月伴走には決済フォームを出さない（相談導線・§1）', () => {
    open('coach-6m');
    expect(screen.queryByRole('button', { name: '支払いに進む' })).toBeNull();
    expect(document.body.textContent).toContain('伴走コースのご相談');
  });
});

describe('入力（§14 最小入力）', () => {
  it('取る情報はメールと同意だけ（氏名・住所・電話を聞かない）', () => {
    open('ai-hour-pass');
    const text = document.body.textContent ?? '';
    for (const w of ['氏名', 'お名前', '住所', '電話']) {
      expect(text.includes(w), `「${w}」を聞いている`).toBe(false);
    }
  });

  it('同意していなければ送信できない', () => {
    open('ai-hour-pass');
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'a@example.com' } });
    expect(screen.getByRole('button', { name: '支払いに進む' }).hasAttribute('disabled')).toBe(true);
  });

  it('メールが空なら送信できない', () => {
    open('ai-hour-pass');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: '支払いに進む' }).hasAttribute('disabled')).toBe(true);
  });

  it('入力欄がモバイルで押せる高さを持つ（§19）', () => {
    open('ai-hour-pass');
    expect(screen.getByLabelText(/メールアドレス/).className).toMatch(/min-h-12/);
    expect(screen.getByRole('button', { name: '支払いに進む' }).className).toMatch(/min-h-12/);
  });
});

describe('注文内容の一致（§17 別々の価格を出さない）', () => {
  it('注文画面の金額が PlanConfig と一致する', () => {
    open('ai-hour-pass');
    const plan = salesPlanById('ai-hour-pass')!;
    const summary = screen.getByRole('region', { name: '注文内容' });
    expect(within(summary).getByText(new RegExp(plan.priceAmount.toLocaleString('en-US')))).toBeTruthy();
  });

  it('価格が未確定のプランは、注文画面に候補値を出さない', () => {
    // 2026-08-02 CEO指示。候補値を確定価格のように見せない
    open('ai-month');
    expect(screen.queryByText(/2,980/), '候補値が画面に出ている').toBeNull();
    expect(screen.getAllByText(/準備中/).length).toBeGreaterThan(0);
  });
});

describe('購入済みの人に見せる料金ページ（§11 再購入）', () => {
  const openPlans = (lang: 'ja' | 'zh' = 'ja') =>
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/${lang}/ai-course/plans?checkout=sim`]}>
          <Routes>
            <Route path="/:lang/ai-course/plans" element={<PlansPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );

  it('未購入のうちは通常のCTA', () => {
    openPlans();
    expect(screen.queryByText('60分を追加する')).toBeNull();
  });

  it('購入後は「追加する」に変わり、続きから再開できると添える', async () => {
    open('ai-hour-pass');
    fillAndSubmit('again@example.com');
    await waitFor(() => expect(screen.getByTestId('purchase-complete-heading')).toBeTruthy());
    cleanup();

    openPlans();
    expect(screen.getByRole('link', { name: '60分を追加する' })).toBeTruthy();
    expect(screen.getByTestId('repurchase-note-ai-hour-pass').textContent)
      .toContain('新しいアカウントは作られません');
    // 買っていないプランのCTAは変わらない
    expect(screen.queryByTestId('repurchase-note-ai-month')).toBeNull();
  });
});

describe('スクリーンリーダー向けの名前（§19）', () => {
  it('入力欄が明示的に label と結ばれている（内包だけに頼らない）', () => {
    const { container } = open('ai-hour-pass');
    const email = container.querySelector('input[type=email]')!;
    const label = container.querySelector(`label[for="${email.id}"]`);
    expect(email.id).toBeTruthy();
    expect(label, 'htmlFor で結ばれた label が無い').toBeTruthy();
    expect(email.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('模擬結果のラジオが、カード番号ではなく意味で読み上げられる', () => {
    const { container } = open('ai-hour-pass');
    for (const r of Array.from(container.querySelectorAll('input[type=radio]'))) {
      const name = r.getAttribute('aria-label') ?? '';
      expect(name.length, 'aria-label が無い').toBeGreaterThan(0);
      expect(/^\d+$/.test(name), `カード番号が読み上げ名になっている: ${name}`).toBe(false);
    }
  });

  it('規約同意チェックにも名前がある', () => {
    const { container } = open('ai-hour-pass');
    expect(container.querySelector('input[type=checkbox]')!.getAttribute('aria-label')).toBeTruthy();
  });
});
