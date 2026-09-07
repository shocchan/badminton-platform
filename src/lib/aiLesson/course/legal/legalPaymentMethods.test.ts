// 支払い方法の表示が、**販売ページと法定表示でずれない**ようにする（2026-09-07）。
//
// なぜ要るか（実際に起きたこと）:
//   Alipay・WeChat Pay は 2026-08-26 に本番Checkoutで使えるようになり、LP側は同日に
//   更新された。ところが**特商法表記（legalFacts.paymentMethods）だけが古いまま**で、
//   「LPでは使えると書いてあるのに、法定表示には載っていない」状態が12日続いた。
//   さらにLPのFAQは「準備中で使えません」と逆のことを言っていた（同日に修正）。
//
//   置き場所が3つ（LPの一覧・LPのFAQ・特商法表記）ある以上、人が揃え続けるのは無理。
//   ここで機械が突き合わせる。
//
// この検査が守るのは「一致」であって「正しさ」ではない。
// 実際にStripeで何が出るかは実測でしか分からないので、**足すときはCheckoutを開いて確かめること**。
import { describe, it, expect } from 'vitest';
import { LEGAL_FACTS } from './legalFacts';
import { PAYMENT_METHODS } from '../../../../pages/ai-lesson/landing/sectionsD';
import { LP } from '../../../../pages/ai-lesson/landing/lpContent';

/** 表記ゆれを吸収して「どの手段か」だけを見る */
const kindsOf = (texts: string[]): Set<string> => {
  const out = new Set<string>();
  for (const t of texts) {
    if (/カード|信用卡|card/i.test(t)) out.add('card');
    if (/alipay|支付宝/i.test(t)) out.add('alipay');
    if (/wechat|微信支付/i.test(t)) out.add('wechat');
  }
  return out;
};

const lpKinds = kindsOf(PAYMENT_METHODS.filter((m) => m.ready).flatMap((m) => [m.label.ja, m.label.zh]));
const legalKinds = kindsOf((LEGAL_FACTS.paymentMethods ?? []).flatMap((m) => [m.ja, m.zh]));

describe('支払い方法: 販売ページと特商法表記', () => {
  it('前提: LPに使える手段が並んでいる', () => {
    expect(lpKinds.size).toBeGreaterThan(0);
  });

  it('LPで「使える」と書いた手段は、特商法表記にも載っている', () => {
    for (const k of lpKinds) {
      expect(legalKinds.has(k), `${k} がLPには出ているが特商法表記に無い`).toBe(true);
    }
  });

  it('特商法表記にあるオンライン手段は、LPにも出ている（逆向きのズレも止める）', () => {
    for (const k of legalKinds) {
      // 銀行振込はLPの一覧に出さない運用（6か月コースの案内で個別に伝える）ので対象外
      expect(lpKinds.has(k), `${k} が特商法表記にあるがLPに出ていない`).toBe(true);
    }
  });
});

describe('支払い方法: LPのFAQが一覧と食い違っていない', () => {
  const faqAnswer = (lang: 'ja' | 'zh'): string =>
    LP.faq.items[lang].find((q) => /支払い方法|如何付款/.test(q.q))?.a ?? '';

  it('FAQの項目そのものがある（消えたら気づく）', () => {
    expect(faqAnswer('ja').length).toBeGreaterThan(20);
    expect(faqAnswer('zh').length).toBeGreaterThan(20);
  });

  it('使える手段を「準備中／まだ使えない」と書いていない', () => {
    for (const lang of ['ja', 'zh'] as const) {
      const a = faqAnswer(lang);
      for (const ng of ['準備中', '正在准备中', 'まだご利用いただけません', '还不能使用']) {
        expect(a.includes(ng), `FAQ(${lang}) に「${ng}」が残っている`).toBe(false);
      }
    }
  });

  it('FAQでもAlipay・WeChat Payに触れている（一覧にあるのにFAQで黙らない）', () => {
    for (const lang of ['ja', 'zh'] as const) {
      const k = kindsOf([faqAnswer(lang)]);
      for (const want of lpKinds) {
        expect(k.has(want), `FAQ(${lang}) が ${want} に触れていない`).toBe(true);
      }
    }
  });
});
