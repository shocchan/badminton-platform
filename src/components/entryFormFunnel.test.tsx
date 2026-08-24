// @vitest-environment jsdom
//
// 大会申込フォームの成果イベント（generate_lead / begin_checkout / purchase）の回帰テスト。
// いちばん守りたいのは **二重送信しないこと**。CVが水増しされると広告の判断ごと狂う。

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { getEntryTexts } from '../locales/entry';
import type { Tournament } from '../types';

// ── 外部依存はすべて差し替える（ネットワーク・Stripe・決済完了画面） ──

const rpc = vi.fn();
const insertSingle = vi.fn();
const insertedRows = vi.fn();

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      insert: (rows: unknown) => {
        insertedRows(rows);
        return { select: () => ({ single: () => insertSingle() }) };
      },
    }),
  },
}));

const fetchWithTimeout = vi.fn();
vi.mock('../lib/payment', () => ({
  isCreditPaymentAvailable: true,
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
  getStripe: () => null,
}));

const trackGenerateLead = vi.fn();
const trackBeginCheckout = vi.fn();
const trackPurchase = vi.fn();
vi.mock('../lib/analytics', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/analytics')>();
  return {
    ...actual,
    trackGenerateLead: (...a: unknown[]) => trackGenerateLead(...a),
    trackBeginCheckout: (...a: unknown[]) => trackBeginCheckout(...a),
    trackPurchase: (...a: unknown[]) => trackPurchase(...a),
  };
});

/** Stripe側が onSuccess を何回呼ぶか。1回のクリックで2回呼ばれる事故を再現するために可変にする */
let stripeSuccessCallsPerClick = 1;
vi.mock('./StripePaymentForm', () => ({
  StripePaymentForm: ({ onSuccess }: { onSuccess: (id: string) => void }) => (
    <button type="button" onClick={() => { for (let i = 0; i < stripeSuccessCallsPerClick; i++) onSuccess('pi_test'); }}>
      STRIPE_PAY
    </button>
  ),
}));
vi.mock('./PaymentCompletionPage', () => ({
  PaymentCompletionPage: () => <div>PAID</div>,
}));

let EntryForm: typeof import('./EntryForm').EntryForm;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  ({ EntryForm } = await import('./EntryForm'));
});

const t = getEntryTexts('ja');

const futureDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().slice(0, 10);
};

const tournament = (): Tournament => ({
  id: 7,
  title: 'テスト大会',
  level: '初級',
  event_type: 'ダブルス',
  location: '芝園公民館',
  event_date: futureDate(),
  start_time: '09:00:00',
  end_time: '12:00:00',
  capacity: 10,
  entry_fee: 1500,
  status: 'active',
  payment_required: true,
  paypay_id: 'kawabado',
  bank_account: 'テスト銀行 1234567',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const okJson = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  stripeSuccessCallsPerClick = 1;
  window.history.replaceState({}, '', '/ja/tournaments/7');
  // 案内メール送信（Edge Function）は素の fetch。常に成功させる
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

  // 既存申込なし → 定員に余裕あり
  rpc.mockImplementation((name: string) =>
    name === 'find_entry_for_resume' ? Promise.resolve({ data: [] }) : Promise.resolve({ data: 0 }),
  );
  insertSingle.mockResolvedValue({ data: { id: 101, cancel_token: 'tok-101' }, error: null });
  fetchWithTimeout.mockImplementation((url: string) =>
    url.includes('create-payment-intent')
      ? Promise.resolve(okJson({ clientSecret: 'cs_test', amount: 1500 }))
      : Promise.resolve(okJson({ success: true, amount: 1500, paid_at: '2026-08-24T00:00:00Z' })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 入力 → 確認 → 申し込む、まで進める */
const submitEntry = async () => {
  fireEvent.change(screen.getByPlaceholderText(t.phName), { target: { value: '山田太郎' } });
  fireEvent.change(screen.getByPlaceholderText('example@email.com'), { target: { value: 'a@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: t.toConfirm }));
  fireEvent.click(await screen.findByRole('button', { name: t.submit }));
  await screen.findByRole('radiogroup');
};

const selectMethod = (title: string) =>
  fireEvent.click(screen.getAllByRole('radio').find(b => b.getAttribute('aria-label')?.startsWith(title))!);

describe('generate_lead（申込レコード作成）', () => {
  it('申込が作られたときに1回だけ送る。流入元も申込に載る', async () => {
    window.history.replaceState({}, '', '/ja/tournaments/7?from=line');
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);

    await submitEntry();

    expect(trackGenerateLead).toHaveBeenCalledTimes(1);
    expect(trackGenerateLead).toHaveBeenCalledWith(7, 1500, 'confirmed');
    expect(insertedRows).toHaveBeenCalledWith([expect.objectContaining({ source: 'line' })]);
  });

  it('流入元が分からない申込は web として保存する', async () => {
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();
    expect(insertedRows).toHaveBeenCalledWith([expect.objectContaining({ source: 'web' })]);
  });

  it('migration 未適用（source 列なし）でも、流入元を落として申込は通す', async () => {
    insertSingle
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST204', message: "Could not find the 'source' column of 'entries' in the schema cache" },
      })
      .mockResolvedValueOnce({ data: { id: 101, cancel_token: 'tok-101' }, error: null });

    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();

    expect(insertedRows).toHaveBeenCalledTimes(2);
    expect(insertedRows.mock.calls[1][0][0]).not.toHaveProperty('source');
    expect(trackGenerateLead).toHaveBeenCalledTimes(1); // 申込は成立しているので計測もする
  });

  it('source 以外の失敗では入れ直さない（重複登録を作らない）', async () => {
    insertSingle.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });

    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(t.phName), { target: { value: '山田太郎' } });
    fireEvent.change(screen.getByPlaceholderText('example@email.com'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: t.toConfirm }));
    fireEvent.click(await screen.findByRole('button', { name: t.submit }));

    await waitFor(() => expect(insertedRows).toHaveBeenCalledTimes(1));
    expect(trackGenerateLead).not.toHaveBeenCalled();
  });

  it('【二重送信よけ】支払い画面から戻ってもう一度申し込んでも1回しか送らない', async () => {
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();

    // 「戻る」→ 確認画面 → もう一度「申し込む」
    fireEvent.click(screen.getByRole('button', { name: t.back }));
    fireEvent.click(await screen.findByRole('button', { name: t.submit }));
    await screen.findByRole('radiogroup');

    // 申込レコード側は重複チェックの責務。計測は何回通っても1回に抑える
    expect(trackGenerateLead).toHaveBeenCalledTimes(1);
  });

  it('キャンセル待ちでも送る（申込は成立しているため）', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'find_entry_for_resume' ? Promise.resolve({ data: [] }) : Promise.resolve({ data: 10 }),
    );
    render(<EntryForm tournament={tournament()} entryCount={10} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText(t.phName), { target: { value: '山田太郎' } });
    fireEvent.change(screen.getByPlaceholderText('example@email.com'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: t.toConfirm }));
    fireEvent.click(await screen.findByRole('button', { name: t.submitWaitlist }));

    await waitFor(() => expect(trackGenerateLead).toHaveBeenCalledTimes(1));
    expect(trackGenerateLead).toHaveBeenCalledWith(7, 1500, 'waitlist');
  });
});

describe('begin_checkout（クレジット決済の開始）', () => {
  it('PaymentIntent の作成に成功したときだけ送る', async () => {
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();

    selectMethod(t.pmCredit);

    await waitFor(() => expect(trackBeginCheckout).toHaveBeenCalledTimes(1));
    expect(trackBeginCheckout).toHaveBeenCalledWith(7, 1500);
  });

  it('【二重送信よけ】戻ってやり直し、もう一度クレジットを選んでも1回のまま', async () => {
    // 2回目の申込は「支払い前の申込が残っている」→ 再開扱いになる（本番と同じ挙動）
    rpc.mockImplementation((name: string) =>
      name === 'find_entry_for_resume'
        ? Promise.resolve({ data: [{ id: 101, status: 'confirmed', cancel_token: 'tok-101', payment_status: 'pending' }] })
        : Promise.resolve({ data: 0 }),
    );
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);

    // 1回目（再開ルートに入るので generate_lead は送られない）
    fireEvent.change(screen.getByPlaceholderText(t.phName), { target: { value: '山田太郎' } });
    fireEvent.change(screen.getByPlaceholderText('example@email.com'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: t.toConfirm }));
    fireEvent.click(await screen.findByRole('button', { name: t.submit }));
    await screen.findByRole('radiogroup');

    selectMethod(t.pmCredit);
    await waitFor(() => expect(trackBeginCheckout).toHaveBeenCalledTimes(1));

    // 戻る → もう一度申し込む → もう一度クレジットを選ぶ
    fireEvent.click(screen.getByRole('button', { name: t.back }));
    fireEvent.click(await screen.findByRole('button', { name: t.submit }));
    await screen.findByRole('radiogroup');
    selectMethod(t.pmCredit);

    await waitFor(() => expect(screen.getByRole('button', { name: 'STRIPE_PAY' })).toBeTruthy());
    expect(trackBeginCheckout).toHaveBeenCalledTimes(1);
    expect(trackGenerateLead).not.toHaveBeenCalled(); // 再開なので新しいリードにはしない
  });

  it('【二重送信よけ】準備に失敗 → 再試行で成功、でも送るのは1回', async () => {
    fetchWithTimeout.mockImplementationOnce(() => Promise.resolve({ ok: false, json: async () => ({ error: 'ng' }) }));
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();

    selectMethod(t.pmCredit);
    // 失敗した時点では送らない
    const retry = await screen.findByRole('button', { name: t.payRetry });
    expect(trackBeginCheckout).not.toHaveBeenCalled();

    fireEvent.click(retry);
    await waitFor(() => expect(trackBeginCheckout).toHaveBeenCalledTimes(1));
  });
});

describe('purchase（クレジット決済の完了）', () => {
  it('決済が確認できたら送る', async () => {
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();
    selectMethod(t.pmCredit);

    fireEvent.click(await screen.findByRole('button', { name: 'STRIPE_PAY' }));

    await waitFor(() => expect(trackPurchase).toHaveBeenCalledTimes(1));
    expect(trackPurchase).toHaveBeenCalledWith(7, 1500);
  });

  it('【二重送信よけ】Stripe の成功コールバックが2回来ても1回しか送らない', async () => {
    stripeSuccessCallsPerClick = 2;
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();
    selectMethod(t.pmCredit);

    fireEvent.click(await screen.findByRole('button', { name: 'STRIPE_PAY' }));

    await screen.findByText('PAID');
    await waitFor(() => expect(fetchWithTimeout).toHaveBeenCalledTimes(3)); // PI作成1 + 決済確認2
    expect(trackPurchase).toHaveBeenCalledTimes(1);
  });

  it('【二重計上よけ】already_completed（同じ決済の再送）では送らない', async () => {
    fetchWithTimeout.mockImplementation((url: string) =>
      url.includes('create-payment-intent')
        ? Promise.resolve(okJson({ clientSecret: 'cs_test', amount: 1500 }))
        : Promise.resolve(okJson({ success: true, already_completed: true })),
    );
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();
    selectMethod(t.pmCredit);

    fireEvent.click(await screen.findByRole('button', { name: 'STRIPE_PAY' }));

    await screen.findByText('PAID');
    expect(trackPurchase).not.toHaveBeenCalled();
  });

  it('決済確認に失敗したときは送らない（売上が立っていないため）', async () => {
    fetchWithTimeout.mockImplementation((url: string) =>
      url.includes('create-payment-intent')
        ? Promise.resolve(okJson({ clientSecret: 'cs_test', amount: 1500 }))
        : Promise.resolve(okJson({ success: false, error: 'ng' })),
    );
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();
    selectMethod(t.pmCredit);

    fireEvent.click(await screen.findByRole('button', { name: 'STRIPE_PAY' }));

    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    expect(trackPurchase).not.toHaveBeenCalled();
  });
});

describe('PayPay / 銀行振込', () => {
  it('purchase は送らない（この時点では入金されていないため）。申込の generate_lead だけ残る', async () => {
    render(<EntryForm tournament={tournament()} entryCount={0} onClose={() => {}} />);
    await submitEntry();

    selectMethod(t.pmPaypay);
    fireEvent.click(await screen.findByRole('button', { name: t.payPaypayBtn }));

    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull());
    expect(trackPurchase).not.toHaveBeenCalled();
    expect(trackBeginCheckout).not.toHaveBeenCalled();
    expect(trackGenerateLead).toHaveBeenCalledTimes(1);
  });
});
