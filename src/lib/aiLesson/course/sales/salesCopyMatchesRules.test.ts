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
    '%s: 実際より長く使えるように読める数字を書かない',
    (_id, plan) => {
      // validityDays は台帳側の別の期限で、学習者が使える期間ではない。
      // これを説明文へ出すと「30日使える」と誤解される
      const misleading = `${plan.validityDays}日`;
      const misleadingZh = `${plan.validityDays}天`;
      const ja = plan.featuresJa.join('\n');
      const zh = plan.featuresZh.join('\n');
      expect(ja, `ja: 「${misleading}」は実際に使える期間ではない`).not.toContain(misleading);
      expect(zh, `zh: 「${misleadingZh}」は実際に使える期間ではない`).not.toContain(misleadingZh);
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
      expect(faq, `${lang}: FAQに「${pass.validityDays}日/天」の誤解を招く記載が残っている`)
        .not.toMatch(new RegExp(`${pass.validityDays}\\s*(日|天)`));
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
