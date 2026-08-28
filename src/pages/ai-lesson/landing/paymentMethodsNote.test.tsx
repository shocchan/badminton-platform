// @vitest-environment jsdom
// 支払い方法の案内（2026-08-26 更新: Alipay / WeChat Pay が本番で利用可能に）。
//
// 【この画面が守ること】
// 1. 表示している決済手段が、実際にStripeで使える状態と一致していること
// 2. **Stripe側の決済ロジックには触らない**
//    payment_method_types / payment_method_options を Checkout セッションへ
//    明示的に入れると、Stripeの自動決済手段（Link含む）が上書きされて消える。
//    実測（2026-08-26）で、指定なしのまま Stripe ダッシュボードの設定だけで
//    银行卡・微信支付・支付宝 の3つが Checkout に出ることを確認済み。
//    **UIだけ足したつもりが決済を壊す**、を機械で止める。
// 3. 「必ず全部出る」と断定しない（国・端末でStripeが出し分けるため）
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PaymentMethodsNote, PAYMENT_METHODS } from './sectionsD';

// renderごとに片付ける。残すと同じ文言が複数出て getByText が「複数見つかった」で落ちる
afterEach(cleanup);

const ROOT = join(__dirname, '../../../..');
const checkoutClient = readFileSync(
  join(ROOT, 'src/lib/aiLesson/course/plans/planCheckout.ts'), 'utf8');
const checkoutServer = readFileSync(
  join(ROOT, 'supabase/functions/ai-course-checkout/index.ts'), 'utf8');

describe('承認が下りるまでの状態', () => {
  it('クレジットカードは使える', () => {
    expect(PAYMENT_METHODS.find((m) => m.id === 'card')?.ready).toBe(true);
  });

  it('Alipay・WeChat Pay も利用可能（Stripe実測 2026-08-26）', () => {
    expect(PAYMENT_METHODS.find((m) => m.id === 'alipay')?.ready).toBe(true);
    expect(PAYMENT_METHODS.find((m) => m.id === 'wechat')?.ready).toBe(true);
  });

  it('決済ロジックにAlipay・WeChat Payを入れていない（Link決済を消さない）', () => {
    for (const [name, src] of [['クライアント', checkoutClient], ['Edge Function', checkoutServer]] as const) {
      expect(src.toLowerCase(), `${name}にalipayが入っている`).not.toContain('alipay');
      expect(src.toLowerCase(), `${name}にwechatが入っている`).not.toContain('wechat');
      expect(src, `${name}に payment_method_types が入っている`).not.toContain('payment_method_types');
      expect(src, `${name}に payment_method_options が入っている`).not.toContain('payment_method_options');
    }
  });
});

describe('表示（日本語）', () => {
  it('3つとも並び、使えるものに「準備中」を付けない', () => {
    render(<PaymentMethodsNote lang="ja" />);
    expect(screen.getByText('クレジットカード')).toBeTruthy();
    expect(screen.getByText('Alipay（支付宝）')).toBeTruthy();
    expect(screen.getByText('WeChat Pay（微信支付）')).toBeTruthy();
    expect(screen.queryAllByText('準備中')).toHaveLength(0);
  });

  it('全部必ず出るとは断定しない（出なかった人に嘘をつかない）', () => {
    render(<PaymentMethodsNote lang="ja" />);
    expect(screen.getByText(/表示される方法が異なることがあります/)).toBeTruthy();
  });

  it('使える項目に aria-disabled を残さない（支援技術に古い状態を伝えない）', () => {
    const { container } = render(<PaymentMethodsNote lang="ja" />);
    expect(container.querySelectorAll('li[aria-disabled="true"]')).toHaveLength(0);
  });

  it('押せる要素を作らない（Stripeの画面で選ぶため、ここでは選ばせない）', () => {
    const { container } = render(<PaymentMethodsNote lang="ja" />);
    expect(container.querySelectorAll('button, a, input')).toHaveLength(0);
  });
});

describe('表示（中国語）', () => {
  it('中国語で3つとも並ぶ', () => {
    render(<PaymentMethodsNote lang="zh" />);
    expect(screen.getByText('信用卡')).toBeTruthy();
    expect(screen.getByText('支付宝')).toBeTruthy();
    expect(screen.getByText('微信支付')).toBeTruthy();
    expect(screen.queryAllByText('准备中')).toHaveLength(0);
  });

  it('中国語画面に日本語が混ざらない', () => {
    const { container } = render(<PaymentMethodsNote lang="zh" />);
    const text = container.textContent ?? '';
    for (const ja of ['準備中', 'クレジットカード', 'お支払い方法', 'ご利用の地域']) {
      expect(text, `中国語画面に「${ja}」が出ている`).not.toContain(ja);
    }
  });
});
