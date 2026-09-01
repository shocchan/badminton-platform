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

  it('マークの読み上げが本文に混ざらない（画面の文章として読めなくならない）', () => {
    const { container } = render(<PaymentMethodsNote lang="ja" />);
    // aria-label は支援技術向け。見えている文字は日本語の文だけであること
    expect(container.textContent).not.toContain('Mastercard');
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

/* ── 支払いブランドのマーク（2026-09-01・CEO指摘 →「Stripe使うからいい。使って」）──
   もとは支付宝に 🅰️（Aボタンの絵文字。ブランドと無関係）、微信支付に 💬（汎用の吹き出し）を
   当てていた。お金を預ける画面で支払いブランドの記号が偽物に見えるのは、
   いちばん効く不信になる。

   いまは**Stripeが自分の決済画面で出しているものと同じマーク**を置いている。
   LPで見たマークと、実際に払う画面のマークが一致する。

   ここで機械的に止めること:
   - 絵文字へ戻さない
   - 色・縦横比を変えない（各社の規約が禁じている。改変したロゴはまた偽物になる）
   - 使えない支払い方法のロゴを出さない（それ自体が嘘になる）
   - 外部ホストから読まない（中国から見る人に届かないことがある） */
describe('支払いブランドのマーク', () => {
  const SRC = readFileSync('src/pages/ai-lesson/landing/sectionsD.tsx', 'utf8');
  const MARKS = readFileSync('src/pages/ai-lesson/landing/paymentMarks.tsx', 'utf8');
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('絵文字をブランドの記号として使わない', () => {
    const block = /export const PAYMENT_METHODS[\s\S]*?\n\];/.exec(SRC);
    expect(block, 'PAYMENT_METHODS が見つからない').toBeTruthy();
    expect(block![0]).not.toMatch(EMOJI);
  });

  it('icon という項目自体を持たない（また絵文字を入れられないように）', () => {
    const block = /export const PAYMENT_METHODS[\s\S]*?\n\];/.exec(SRC)![0];
    expect(block).not.toMatch(/\bicon\b/);
  });

  it('マークを描く側にも絵文字が無い', () => {
    expect(MARKS.replace(/^\/\/.*$/gm, '')).not.toMatch(EMOJI);
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

  it('マークは各社のブランド色で描かれている（勝手に単色化しない）', () => {
    // 実測（Stripeの決済画面が配信している値）と一致すること。
    // 色を変えるのは各社の規約違反で、変えた時点でまた偽物になる
    for (const [brand, color] of [
      ['Visa', '#1434CB'], ['Mastercard', '#eb001b'], ['JCB', '#047ab1'],
      ['Amex', '#016fd0'], ['支付宝', '#1C9FE5'], ['微信支付', '#65bf46'],
    ] as const) {
      expect(MARKS, `${brand} のブランド色が無い`).toContain(color);
    }
  });

  it('縦横比を固定する（潰したり伸ばしたりしない）', () => {
    // 高さだけを指定し、幅は viewBox の比から決める
    expect(MARKS).toContain('w-auto');
    expect(MARKS).toMatch(/viewBox=\{VIEW_BOX\[id\]\}/);
    // svg に width/height を直書きすると比が崩れる
    expect(MARKS).not.toMatch(/<svg[^>]*\swidth="/);
  });

  it('外部ホストから読み込まない（中国から見る人に届かないことがある）', () => {
    // URLはコメントに出どころとして残すが、コードで取りに行ってはいけない
    const code = MARKS.replace(/^\/\/.*$/gm, '');
    expect(code).not.toContain('js.stripe.com');
    expect(code).not.toMatch(/<img/);
  });

  it('準備中の支払い方法にはマークを出さない（使えないロゴを出すのは嘘になる）', () => {
    expect(SRC).toMatch(/\{m\.ready && <MethodMark/);
  });

  it('どこから持ってきたマークかがコードに書いてある（次に差し替える人のため）', () => {
    expect(MARKS).toContain('js.stripe.com');
    expect(MARKS).toContain('cs_live_');
    // 各社の配布素材をそのまま使えなかった理由も残す
    expect(MARKS).toContain('pay.weixin.qq.com/material/brand.shtml');
    expect(MARKS).toMatch(/分解・改変/);
  });

  it('画面に6つのマークが出る（カード4ブランド＋支付宝＋微信支付）', () => {
    const { container } = render(<PaymentMethodsNote lang="zh" />);
    const svgs = container.querySelectorAll('svg[role="img"]');
    expect(svgs).toHaveLength(6);
    expect([...svgs].map((s) => s.getAttribute('aria-label'))).toEqual(
      ['Visa', 'Mastercard', 'JCB', 'American Express', 'Alipay', 'WeChat Pay']);
  });
});
