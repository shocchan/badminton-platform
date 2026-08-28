// @vitest-environment jsdom
// 支払い方法の選択肢が、実際に受け付けられる手段と一致していることを固定する。
// 2026-08-28に銀行振込の受付を終了し、WeChat Pay / Alipay を追加した。
// ここが崩れると「選べるのに払えない」「払えるのに選べない」が起きる。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PaymentMethodSelector } from './PaymentMethodSelector';

const base = {
  entryFee: 1500,
  paypayId: 'shocchance',
  selected: null,
  onSelect: vi.fn(),
  lang: 'ja',
};

afterEach(cleanup);

describe('PaymentMethodSelector', () => {
  it('カード・PayPay・WeChat Pay/Alipay の3つを出し、銀行振込は出さない', () => {
    render(<PaymentMethodSelector {...base} creditAvailable redirectAvailable />);
    expect(screen.getByText('クレジットカード')).toBeTruthy();
    expect(screen.getByText('PayPay')).toBeTruthy();
    expect(screen.getByText('WeChat Pay / Alipay')).toBeTruthy();
    expect(screen.queryByText('銀行振込')).toBeNull();
  });

  it('追加受付中はオンライン決済だけ残す（PayPayは入金確認が間に合わない）', () => {
    render(<PaymentMethodSelector {...base} creditAvailable redirectAvailable creditOnly />);
    expect(screen.getByText('クレジットカード')).toBeTruthy();
    expect(screen.getByText('WeChat Pay / Alipay')).toBeTruthy();
    expect(screen.queryByText('PayPay')).toBeNull();
  });

  it('Stripeが使えない環境ではオンライン決済を出さない', () => {
    render(<PaymentMethodSelector {...base} creditAvailable={false} redirectAvailable={false} />);
    expect(screen.queryByText('クレジットカード')).toBeNull();
    expect(screen.queryByText('WeChat Pay / Alipay')).toBeNull();
    expect(screen.getByText('PayPay')).toBeTruthy();
  });

  it('選べる手段が1つも無いときは運営への連絡案内を出す（空欄で詰まらせない）', () => {
    render(
      <PaymentMethodSelector
        {...base}
        paypayId={undefined}
        creditAvailable={false}
        redirectAvailable={false}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('中文でも同じ3つが出る', () => {
    render(<PaymentMethodSelector {...base} lang="zh" creditAvailable redirectAvailable />);
    expect(screen.getByText('信用卡')).toBeTruthy();
    expect(screen.getByText('微信支付 / 支付宝')).toBeTruthy();
    expect(screen.queryByText('银行转账')).toBeNull();
  });
});
