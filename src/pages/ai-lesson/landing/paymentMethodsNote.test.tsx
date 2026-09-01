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

/* ── 支払いブランドの記号を偽物にしない（2026-09-01・CEO指摘） ──────────
   支付宝に 🅰️（Aボタンの絵文字。ブランドと無関係）、微信支付に 💬（汎用の吹き出し）を
   当てていた。お金を預ける画面で支払いブランドの記号が偽物に見えるのは、
   いちばん効く不信になる。

   本物のロゴも置かない。微信支付の公式素材を実際に取得して確認したところ、
   配布されているのは作図ガイドのシートで、きれいなロゴ単体は入っていない。
   取り出すにはガイドを切り抜くことになり、規約が禁じる「分解・改変」に当たる。
   規約を外れた素材を置けば、結局また偽物になる。

   いまは**名前だけ**を並べる。名前を書くのは「この方法が使える」と言っているだけで、
   ロゴの使用ではない。本物のロゴは実際に払う Stripe の決済ページに出る。 */
describe('支払いブランドの記号', () => {
  const SRC = readFileSync('src/pages/ai-lesson/landing/sectionsD.tsx', 'utf8');

  it('絵文字をブランドの記号として使わない', () => {
    const block = /export const PAYMENT_METHODS[\s\S]*?\n\];/.exec(SRC);
    expect(block, 'PAYMENT_METHODS が見つからない').toBeTruthy();
    // 絵文字（記号・その他）が1つでも入っていたら落とす
    expect(block![0]).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u);
  });

  it('icon という項目自体を持たない（また絵文字を入れられないように）', () => {
    const block = /export const PAYMENT_METHODS[\s\S]*?\n\];/.exec(SRC)![0];
    expect(block).not.toMatch(/\bicon\b/);
  });

  it('支払い方法の名前は正式名称で書く', () => {
    for (const m of PAYMENT_METHODS) {
      expect(m.label.ja.length).toBeGreaterThan(0);
      expect(m.label.zh.length).toBeGreaterThan(0);
    }
    const zh = PAYMENT_METHODS.map((m) => m.label.zh).join(' ');
    expect(zh).toContain('支付宝');
    expect(zh).toContain('微信支付');
  });

  it('本物のマークは決済ページで見られると案内する', () => {
    expect(SRC).toContain('公式マーク');
    expect(SRC).toContain('官方标识');
  });

  it('なぜロゴを置かないのかがコードに書いてある（次に絵文字へ戻さないため）', () => {
    expect(SRC).toContain('pay.weixin.qq.com/material/brand.shtml');
    expect(SRC).toMatch(/分解・改変/);
  });
});
