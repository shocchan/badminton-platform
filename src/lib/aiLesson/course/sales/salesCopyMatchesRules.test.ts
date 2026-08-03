// 販売文言が、実際の動きと合っていること。
//
// CEO発見: 料金ページのFAQに「残り時間は購入から30日間、いつでも続きから使えます」
// と書いてあったが、実装は「購入から7日以内に開始 → 開始してから24時間」だった。
// 買う前の説明が実物より甘いのは、いちばんやってはいけない間違い方なので、
// 数字を config から引いて突き合わせる。

import { describe, it, expect } from 'vitest';
import { SALES_PLAN_CATALOG } from './planConfig';
import { plansCopy } from './plansContent';

/** 時間制プラン（60分パスのように、開始操作と残り時間があるもの） */
const timeBased = SALES_PLAN_CATALOG.filter(
  (p) => p.includedActiveSeconds !== null && p.startDeadlineDays !== null,
);

describe('販売文言と実際の動きが合っている', () => {
  it('時間制プランがある（この検査が空振りしていない）', () => {
    expect(timeBased.length).toBeGreaterThan(0);
  });

  it.each(timeBased.map((p) => [p.planId, p] as const))(
    '%s: 台帳の期限が、開始期限＋開始後の時間 をちょうど覆う',
    (_id, plan) => {
      const startDays = plan.startDeadlineDays ?? 0;
      const afterHours = plan.validityHoursAfterActivation ?? 0;
      // 期限ぎりぎりに開始した人の「開始後の時間」が切れないだけの日数が要る
      const needed = startDays + Math.ceil(afterHours / 24);
      expect(plan.validityDays, '台帳が短すぎる: 開始できたのに途中で切れる')
        .toBeGreaterThanOrEqual(needed);
      expect(plan.validityDays, '台帳が長すぎる: 有効に見えるのに開始できない期間ができる')
        .toBe(needed);
    },
  );

  it.each(timeBased.map((p) => [p.planId, p] as const))(
    '%s: 説明文に「開始期限の日数」と「開始後の時間」が両方書いてある',
    (_id, plan) => {
      const days = String(plan.startDeadlineDays);
      const hours = String(plan.validityHoursAfterActivation);
      for (const [lang, lines] of [['ja', plan.featuresJa], ['zh', plan.featuresZh]] as const) {
        const text = lines.join('\n');
        expect(text, `${lang}: 開始期限 ${days}日 が書かれていない`).toContain(days);
        expect(text, `${lang}: 開始後 ${hours}時間 が書かれていない`).toContain(hours);
      }
    },
  );

  it.each(timeBased.map((p) => [p.planId, p] as const))(
    '%s: 実際より長く使えるように読める日数を書かない',
    (_id, plan) => {
      // 説明文に出てくる「N日/N天」は、開始期限より長くてはいけない。
      // 「30日使える」と読ませたのがまさにこの間違いだった。
      const limit = plan.startDeadlineDays ?? 0;
      for (const [lang, lines] of [['ja', plan.featuresJa], ['zh', plan.featuresZh]] as const) {
        for (const n of lines.join('\n').matchAll(/(\d+)\s*(日|天)/g)) {
          expect(Number(n[1]), `${lang}: 「${n[0]}」は開始期限（${limit}日）より長い`)
            .toBeLessThanOrEqual(limit);
        }
      }
    },
  );

  it('料金ページのFAQも、開始期限と開始後の時間を正しく書いている', () => {
    const pass = timeBased[0];
    const days = String(pass.startDeadlineDays);
    const hours = String(pass.validityHoursAfterActivation);

    for (const lang of ['ja', 'zh'] as const) {
      const faq = plansCopy(lang).faq.map((f) => `${f.q}\n${f.a}`).join('\n');
      // 「一度に使い切る必要があるか」への答えに、期限が両方入っていること
      const answer = plansCopy(lang).faq.find((f) => f.a.includes(hours));
      expect(answer, `${lang}: 開始後${hours}時間に触れたFAQが無い`).toBeTruthy();
      expect(answer?.a, `${lang}: 開始期限${days}日が書かれていない`).toContain(days);
      expect(faq, `${lang}: FAQが空`).not.toBe('');
      // 「validityDays の数字を含まない」という見張り方はしない。
      // キャンセル可能期間（購入から8日）など、無関係な同じ数字を誤検出するため。
      // 台帳の数字が売り場へ漏れるのは、下の「画面のコード」検査で捕まえる
    }
  });

  // 文言ファイルだけ直しても、画面が config から組み立てていたら意味がない。
  // 実際に「30日」と出ていたのは料金カードのこの行だった。
  it('料金カードと購入確認の「使える範囲」に、台帳側の期限を出さない', async () => {
    const sources = await Promise.all([
      import('../../../../pages/ai-lesson/plans/PlansPage?raw'),
      import('../../../../pages/ai-lesson/plans/PurchasePage?raw'),
    ]);
    for (const m of sources) {
      const code = (m as { default: string }).default;
      expect(code, 'validityDays を学習者向けの表示に使っている').not.toMatch(
        /\$\{plan\.validityDays\}\s*(日|天)/,
      );
    }
  });
});
