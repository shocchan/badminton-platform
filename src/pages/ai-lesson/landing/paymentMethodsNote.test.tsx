// @vitest-environment jsdom
// 支払い方法の案内（2026-08-23・Alipay / WeChat Pay は承認待ち）。
//
// 【この画面が守ること】
// 1. 承認が下りるまで Alipay・WeChat Pay は「準備中」で、使えるように見せない
// 2. **Stripe側の決済ロジックには触らない**
//    capability が無いうちに payment_method_types / payment_method_options を
//    Checkout セッションへ入れると、Link 決済が消える事故が過去にあった。
//    UIだけ足したつもりが決済を壊す、を機械で止める。
//
// 承認が下りたら PAYMENT_METHODS の ready を true にし、**同時に**Stripe側を
// 有効化する。片方だけ変えるとこのテストが落ちる（3番目のテスト）。
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

  it('Alipay・WeChat Pay は準備中（承認前に使えるように見せない）', () => {
    expect(PAYMENT_METHODS.find((m) => m.id === 'alipay')?.ready).toBe(false);
    expect(PAYMENT_METHODS.find((m) => m.id === 'wechat')?.ready).toBe(false);
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
  it('3つとも並び、準備中の2つにラベルが付く', () => {
    render(<PaymentMethodsNote lang="ja" />);
    expect(screen.getByText('クレジットカード')).toBeTruthy();
    expect(screen.getByText('Alipay（支付宝）')).toBeTruthy();
    expect(screen.getByText('WeChat Pay（微信支付）')).toBeTruthy();
    expect(screen.getAllByText('準備中')).toHaveLength(2);
  });

  it('まだ使えないことを文章でも言う（ラベルだけに頼らない）', () => {
    render(<PaymentMethodsNote lang="ja" />);
    expect(screen.getByText(/まだご利用いただけません/)).toBeTruthy();
  });

  it('準備中の項目は aria-disabled（見た目のグレーアウトだけにしない）', () => {
    const { container } = render(<PaymentMethodsNote lang="ja" />);
    expect(container.querySelectorAll('li[aria-disabled="true"]')).toHaveLength(2);
  });

  it('押せる要素を作らない（Stripeの画面で選ぶため、ここでは選ばせない）', () => {
    const { container } = render(<PaymentMethodsNote lang="ja" />);
    expect(container.querySelectorAll('button, a, input')).toHaveLength(0);
  });
});

describe('表示（中国語）', () => {
  it('中国語で並び、准备中ラベルが付く', () => {
    render(<PaymentMethodsNote lang="zh" />);
    expect(screen.getByText('信用卡')).toBeTruthy();
    expect(screen.getByText('支付宝')).toBeTruthy();
    expect(screen.getByText('微信支付')).toBeTruthy();
    expect(screen.getAllByText('准备中')).toHaveLength(2);
  });

  it('中国語画面に日本語が混ざらない', () => {
    const { container } = render(<PaymentMethodsNote lang="zh" />);
    const text = container.textContent ?? '';
    for (const ja of ['準備中', 'クレジットカード', 'お支払い方法', 'ご利用']) {
      expect(text, `中国語画面に「${ja}」が出ている`).not.toContain(ja);
    }
  });
});
