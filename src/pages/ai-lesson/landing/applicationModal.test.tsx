// @vitest-environment jsdom
// 申込フォームの受入テスト。
//
// いちばん守りたいのは **「保存できなかったのに成功したと言わない」**。
// 「送信できました」と出して実際は消えている、が最悪の事故になる。
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const submitPlanApplication = vi.fn();
vi.mock('../../../lib/aiLesson/course/plans/planApplicationRepository', () => ({
  submitPlanApplication: (...a: unknown[]) => submitPlanApplication(...a),
}));
vi.mock('./lpHelpers', async (orig) => ({
  ...(await orig<typeof import('./lpHelpers')>()),
  track: () => {},
}));

import { ApplicationModal } from './ApplicationModal';
import { planById } from '../../../lib/aiLesson/course/plans/planCatalog';
import { TERMS_VERSION } from '../../../lib/aiLesson/course/legal/termsVersion';

/**
 * 相談もアカウント必須になった（§3）ので、モーダルを開いたらまずアカウント設定を通す。
 * 模擬モードなので実メールは送られず、画面に出た確認コードをそのまま入れる。
 */
const setUpAccount = (lang: 'ja' | 'zh' = 'ja') => {
  const L = (ja: string, zh: string) => (lang === 'zh' ? zh : ja);
  if (screen.queryByRole('button', { name: L('確認コードを送る', '发送验证码') }) === null) return;
  fireEvent.change(screen.getByLabelText(L('メールアドレス', '邮箱地址')), { target: { value: 'a@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: L('確認コードを送る', '发送验证码') }));
  const code = (screen.getByTestId('sim-otp-note').textContent ?? '').match(/(\d{6})/)?.[1] ?? '';
  fireEvent.change(screen.getByLabelText(L('確認コード', '验证码')), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: L('確認して続ける', '确认并继续') }));
};

const open = (lang: 'ja' | 'zh' = 'ja') => {
  const r = render(<ApplicationModal planId="coach-6m" onClose={() => {}} lang={lang} />);
  setUpAccount(lang);
  return r;
};

const fillValid = () => {
  fireEvent.change(screen.getByLabelText('お名前'), { target: { value: '山田太郎' } });
  fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'a@example.com' } });
  fireEvent.click(screen.getByRole('checkbox'));
};

describe('申込フォーム', () => {
  beforeEach(() => {
  window.sessionStorage.clear(); submitPlanApplication.mockReset(); });
  afterEach(() => cleanup());

  it('選んだプランの名前・価格・期間が出る', () => {
    open();
    const p = planById('coach-6m')!;
    expect(screen.getByText(p.nameJa)).toBeTruthy();
    expect(screen.getByText(new RegExp(p.priceLabelJa.replace(/[()（）]/g, '.')))).toBeTruthy();
  });

  it('**この画面では決済しないと明記する**', () => {
    open();
    expect(screen.getByText(/決済は行いません/)).toBeTruthy();
  });

  it('キャンセル・返金は断定せず暫定表示を出す', () => {
    open();
    expect(screen.getByText(/選択したプランおよび申込時にご案内する契約条件により異なります/)).toBeTruthy();
  });

  it('未入力・未同意では送信しない', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '申込内容を送る' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/お名前を入力してください/)).toBeTruthy();
    expect(screen.getByText(/規約への同意が必要です/)).toBeTruthy();
    expect(submitPlanApplication).not.toHaveBeenCalled();
  });

  it('**その人が見た価格ラベルと規約の版を記録する**', async () => {
    submitPlanApplication.mockResolvedValue({ ok: true });
    open();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: '申込内容を送る' }));
    await waitFor(() => expect(submitPlanApplication).toHaveBeenCalledTimes(1));
    const arg = submitPlanApplication.mock.calls[0][0];
    expect(arg.application.selectedPlanId).toBe('coach-6m');
    expect(arg.application.displayedPriceLabel).toBe(planById('coach-6m')!.priceLabelJa);
    expect(arg.application.planVersion).toBe(planById('coach-6m')!.version);
    expect(arg.application.applicationStatus).toBe('submitted');
    expect(arg.consent.termsVersion).toBe(TERMS_VERSION);
    // 同意は申込IDではなく**アカウント**に紐づく（§3）。
    // これで後から同じ人の申込・購入・利用権をつなげられる
    expect(arg.consent.subjectKind).toBe('learner');
    expect(arg.consent.subjectId).toBe(arg.application.learnerId);
    expect(arg.application.learnerId.length).toBeGreaterThan(0);
  });

  it('成功したら受付済みと出す', async () => {
    submitPlanApplication.mockResolvedValue({ ok: true });
    open();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: '申込内容を送る' }));
    await waitFor(() => expect(screen.getByText('申込を受け付けました')).toBeTruthy());
  });

  it('**保存先が無いときは成功と言わず、メール連絡先を出す**', async () => {
    submitPlanApplication.mockResolvedValue({ ok: false, reason: 'store_unavailable' });
    open();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: '申込内容を送る' }));
    await waitFor(() => expect(screen.getByText('いま申込を受け付けられませんでした')).toBeTruthy());
    expect(screen.queryByText('申込を受け付けました')).toBeNull();
    expect(screen.getByText('info@kawabado.com')).toBeTruthy();
  });

  it('保存に失敗したときも成功と言わない', async () => {
    submitPlanApplication.mockResolvedValue({ ok: false, reason: 'failed', message: 'boom' });
    open();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: '申込内容を送る' }));
    await waitFor(() => expect(screen.getByText('いま申込を受け付けられませんでした')).toBeTruthy());
    expect(screen.queryByText('申込を受け付けました')).toBeNull();
  });

  it('中国語でも日本語のラベルが残らない', () => {
    submitPlanApplication.mockResolvedValue({ ok: true });
    open('zh');
    expect(screen.getByLabelText('姓名')).toBeTruthy();
    expect(screen.getByRole('button', { name: '提交报名' })).toBeTruthy();
    expect(screen.queryByText('申込内容を送る')).toBeNull();
  });

  it('planId が null なら何も描画しない', () => {
    const { container } = render(<ApplicationModal planId={null} onClose={() => {}} lang="ja" />);
    expect(container.innerHTML).toBe('');
  });
});
