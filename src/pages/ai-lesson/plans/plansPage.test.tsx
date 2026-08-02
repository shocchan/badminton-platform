// @vitest-environment jsdom
// 料金ページの受入テスト（§5 §6 §19 §20）。
//
// 固定したいのは「初めて来た人が、聞かなくても判断できる」こと。
// 具体的には §6 の9項目が画面に出ていること、そして
// 「架空の実績・架空の画面」が入り込まないこと。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { PlansPage } from './PlansPage';
import { PurchasePage } from './PurchasePage';
import { visibleSalesPlans, salesPlanById, BANNED_SALES_CLAIMS } from '../../../lib/aiLesson/course/sales/planConfig';
import { plansCopy, plansPathFor, purchasePathFor } from '../../../lib/aiLesson/course/sales/plansContent';

afterEach(cleanup);

const renderPlans = (lang: 'ja' | 'zh' = 'ja', search = '') =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`${plansPathFor(lang)}${search}`]}>
        <Routes>
          <Route path="/:lang/ai-course/plans" element={<PlansPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

const renderPurchase = (planId: string, lang: 'ja' | 'zh' = 'ja') =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[purchasePathFor(lang, planId)]}>
        <Routes>
          <Route path="/:lang/ai-course/plans" element={<div>PLANS_PAGE</div>} />
          <Route path="/:lang/ai-course/plans/:planId" element={<PurchasePage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

describe('3プランの比較（§20 完了条件1）', () => {
  it('ja で3つのプランが並ぶ', () => {
    renderPlans('ja');
    for (const p of visibleSalesPlans()) {
      expect(screen.getByRole('heading', { name: p.nameJa, level: 3 })).toBeTruthy();
    }
  });

  it('zh でも同じ3プランが並ぶ（言語で商品が減らない）', () => {
    renderPlans('zh');
    for (const p of visibleSalesPlans()) {
      expect(screen.getByRole('heading', { name: p.nameZh, level: 3 })).toBeTruthy();
    }
  });

  it('価格・期間・内容がカード内にそろっている（§3 参考にした情報設計）', () => {
    renderPlans('ja');
    const card = screen.getByRole('heading', { name: '60分AIパス', level: 3 }).closest('article')!;
    const c = within(card);
    expect(c.getByText('600円')).toBeTruthy();
    // 「累計60分」は金額直下の利用範囲と、含まれるものの両方に出る（どちらも必要）
    expect(c.getAllByText(/累計60分/).length).toBeGreaterThanOrEqual(1);
    expect(c.getByText(/1万問以上の問題から/)).toBeTruthy();
  });

  it('プランカードはファーストビューの見出し直後に来る（§5）', () => {
    const { container } = renderPlans('ja');
    const h1 = container.querySelector('h1')!;
    const firstCard = container.querySelector('article')!;
    // h1 → 3プランのセクション の順に現れる（間に別のCTAセクションを挟まない）
    const pos = h1.compareDocumentPosition(firstCard);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const sections = Array.from(container.querySelectorAll('section'));
    expect(sections[0].contains(firstCard)).toBe(true);
  });
});

describe('§6 コールド流入がすぐ分かること', () => {
  it('9項目すべてが画面にある', () => {
    renderPlans('ja');
    const body = document.body.textContent ?? '';

    // 何ができるか / 誰向けか
    expect(body).toContain('このコースは、こういう人のためのものです');
    // 料金
    expect(body).toContain('600円');
    expect(body).toContain('100,000円');
    // どこまで利用できるか
    expect(screen.getByTestId('scope-ai-hour-pass').textContent).toContain('累計60分');
    // 人間レッスンの有無
    expect(body).toContain('人間の先生のレッスンは含まれません');
    // 自動更新の有無
    expect(body).toContain('自動更新はありません');
    // 購入後すぐ何が起きるか
    expect(body).toContain('買ったあと、すぐに起きること');
    // 問い合わせ方法（本文の導線と法務フッターの両方に出るので複数で良い）
    expect(screen.getAllByRole('link', { name: 'お問い合わせ' }).length).toBeGreaterThanOrEqual(1);
    // キャンセル条件
    expect(body).toContain('キャンセル');
  });

  it('zh でも9項目が欠けない', () => {
    renderPlans('zh');
    const body = document.body.textContent ?? '';
    expect(body).toContain('这门课程适合这样的人');
    expect(body).toContain('600日元');
    expect(body).toContain('不含真人老师的课程');
    expect(body).toContain('没有自动续费');
    expect(body).toContain('购买之后，马上会发生的事');
    expect(body).toContain('取消');
    expect(screen.getAllByRole('link', { name: '联系我们' }).length).toBeGreaterThanOrEqual(1);
  });

  it('架空の実績を出さず、実績が無いことを正直に書く（§6末尾）', () => {
    renderPlans('ja');
    const body = document.body.textContent ?? '';
    expect(screen.getByTestId('no-testimonial-note').textContent).toContain('公開できる合格実績や利用者の声はありません');
    // 実績風の表現が無い
    for (const w of ['合格者数', '受講生の声', '利用者数', '★★★', 'レビュー']) {
      expect(body.includes(w), `実績風の表現「${w}」`).toBe(false);
    }
  });

  it('根拠のない煽り文句が無い（§2）', () => {
    for (const lang of ['ja', 'zh'] as const) {
      cleanup();
      renderPlans(lang);
      const body = document.body.textContent ?? '';
      for (const w of BANNED_SALES_CLAIMS) {
        expect(body.includes(w), `${lang} に禁止語「${w}」`).toBe(false);
      }
    }
  });

  it('未実装の画面を載せない（§6）— 6画面はすべて実装済みのもの', () => {
    renderPlans('ja');
    const body = document.body.textContent ?? '';
    for (const name of ['今日の冒険', '問題バトル', 'AI会話', '学習レポート', '冒険マップ', '週のまとめ']) {
      expect(body).toContain(name);
    }
    expect(body).toContain('すべて今動いている画面です');
  });

  it('教材の全件取得を約束しない（§7 §8）', () => {
    renderPlans('ja');
    const body = document.body.textContent ?? '';
    expect(body).toContain('1万問以上の問題から、今のあなたに必要な問題をAIが選びます');
    expect(body).toContain('できません');   // まとめてダウンロードはできない、というFAQ
    expect(body.includes('1万問すべて')).toBe(false);
  });
});

describe('CTA', () => {
  it('各プランのCTAが、そのプランの入口へ向く（§2 §5）', () => {
    const { container } = renderPlans('ja');
    for (const p of visibleSalesPlans()) {
      const card = screen.getByRole('heading', { name: p.nameJa, level: 3 }).closest('article')!;
      const cta = within(card).getByRole('link');
      expect(cta.getAttribute('href'), p.planId).toBe(purchasePathFor('ja', p.planId));
    }
    // 6か月だけ、相談の文言であること（その場購入に見せない）
    expect(container.textContent).toContain('伴走コースについて相談する');
  });

  it('決済が無効なときは、購入CTAが申込文言に落ちる（§5）', () => {
    // 既定は決済OFF（test鍵が無い）。相談CTAは変わらない
    renderPlans('ja');
    expect(screen.getByRole('link', { name: '体験パスに申し込む' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '伴走コースについて相談する' })).toBeTruthy();
    expect(screen.getByTestId('checkout-notice').textContent).toContain('オンライン決済は準備中');
  });

  it('CTAのタップ領域が十分な高さ（モバイル・§19）', () => {
    renderPlans('ja');
    for (const name of ['体験パスに申し込む', '1か月プランに申し込む', '伴走コースについて相談する']) {
      const el = screen.getByRole('link', { name });
      expect(el.className).toMatch(/min-h-12/);
    }
  });
});

describe('アクセシビリティ（§19 §20）', () => {
  it('見出しが h1 → h2 → h3 の順で飛ばない', () => {
    const { container } = renderPlans('ja');
    const levels = Array.from(container.querySelectorAll('h1,h2,h3,h4'))
      .map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1], `${levels[i - 1]} → ${levels[i]}`).toBeLessThanOrEqual(1);
    }
  });

  it('各プランカードが名前付きの領域になっている（スクリーンリーダーで区別できる）', () => {
    renderPlans('ja');
    for (const p of visibleSalesPlans()) {
      const heading = screen.getByRole('heading', { name: p.nameJa, level: 3 });
      const article = heading.closest('article')!;
      expect(article.getAttribute('aria-labelledby')).toBe(heading.id);
    }
  });

  it('料金セクションに名前がついている', () => {
    renderPlans('ja');
    expect(screen.getByRole('region', { name: plansCopy('ja').planSectionLabel })).toBeTruthy();
  });

  it('lang=zh のときリンク文言まで中国語になる', () => {
    renderPlans('zh');
    expect(screen.getByRole('link', { name: '返回课程' })).toBeTruthy();
  });
});

describe('購入・相談の入口', () => {
  it('注文内容が決済直前でもう一度そろって出る（別々の条件が出ない）', () => {
    renderPurchase('ai-hour-pass');
    const body = document.body.textContent ?? '';
    expect(body).toContain('600円');
    expect(body).toContain('累計60分');
    expect(body).toContain('自動更新');
  });

  it('6か月は相談の流れになり、その場購入にならない（§1 §14）', () => {
    renderPurchase('coach-6m');
    const body = document.body.textContent ?? '';
    expect(body).toContain('伴走コースのご相談');
    expect(body).toContain('担当が内容を確認してご連絡します');
    expect(body.includes('その場で利用権が付きます')).toBe(false);
  });

  it('60分は「順番待ちなし」で始まると明示する（§4-1）', () => {
    renderPurchase('ai-hour-pass');
    expect(document.body.textContent).toContain('順番待ちはありません');
  });

  it('存在しないプランのURLは料金ページへ戻す（行き止まりを作らない）', () => {
    renderPurchase('no-such-plan');
    expect(screen.getByText('PLANS_PAGE')).toBeTruthy();
  });

  it('zh でも注文内容が中国語で出る', () => {
    renderPurchase('ai-month', 'zh');
    const body = document.body.textContent ?? '';
    expect(body).toContain('1个月AI计划');
    expect(body).toContain('自动续费');
  });
});

describe('計測（§18）', () => {
  it('料金ページ表示で pricing_page_viewed を送り、個人情報を含めない', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    renderPlans('ja');
    const call = gtag.mock.calls.find((c) => c[1] === 'pricing_page_viewed');
    expect(call).toBeTruthy();
    const params = call![2] as Record<string, unknown>;
    expect(Object.keys(params).sort()).toEqual(['lang', 'plan_count']);
    delete (window as unknown as { gtag?: unknown }).gtag;
  });
});

describe('プラン定義との整合', () => {
  it('カードの内容は PlanConfig をそのまま映す（画面に別の条件を書かない）', () => {
    renderPlans('ja');
    const plan = salesPlanById('ai-month')!;
    const card = screen.getByRole('heading', { name: plan.nameJa, level: 3 }).closest('article')!;
    const text = card.textContent ?? '';
    for (const f of plan.featuresJa) expect(text).toContain(f);
    for (const l of plan.limitationsJa) expect(text).toContain(l);
  });
});
