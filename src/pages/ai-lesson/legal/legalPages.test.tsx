// @vitest-environment jsdom
// 法務8ページの構造・i18n・公開ガードを固定する。
//
// いちばん大事なのは「事実が未確定のまま学習者へ公開されないこと」と
// 「未確定を『準備中』や作り話で埋めないこと」の2点。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { LegalPage, LegalFooterLinks } from './LegalPage';
import { buildLegalPages, renderableLegalPage, legalPathFor, LEGAL_PAGE_IDS } from '../../../lib/aiLesson/course/legal/legalContent';
import { LEGAL_FACTS, LEGAL_PUBLISH, pendingLegalFacts, type LegalFacts } from '../../../lib/aiLesson/course/legal/legalFacts';

afterEach(cleanup);

const renderAt = (path: string) => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {LEGAL_PAGE_IDS.map((id) => (
          <Route key={id} path={`/:lang/ai-course/${id}`} element={<LegalPage id={id} />} />
        ))}
        <Route path="/:lang/ai-course" element={<div data-testid="course-entry">entry</div>} />
      </Routes>
    </MemoryRouter>
  </HelmetProvider>,
);

describe('法務8ページの構造', () => {
  it('8ページが定義され、IDが重複しない', () => {
    expect(LEGAL_PAGE_IDS).toHaveLength(8);
    expect(new Set(LEGAL_PAGE_IDS).size).toBe(8);
  });

  for (const lang of ['ja', 'zh'] as const) {
    it(`${lang}: 8ページすべてにタイトル・導入・節がある`, () => {
      const pages = buildLegalPages(lang);
      expect(pages).toHaveLength(8);
      for (const p of pages) {
        expect(p.title.trim().length, p.id).toBeGreaterThan(1);
        expect(p.intro.trim().length, p.id).toBeGreaterThan(5);
        expect(p.sections.length, p.id).toBeGreaterThan(0);
      }
    });

    it(`${lang}: タイトルが全ページで固有`, () => {
      const titles = buildLegalPages(lang).map((p) => p.title);
      expect(new Set(titles).size).toBe(titles.length);
    });
  }

  it('中国語版に日本語のかなが混ざらない（固有名詞・メールを除く）', () => {
    const kana = /[ぁ-んァ-ヴ]/;
    for (const p of buildLegalPages('zh')) {
      const text = [p.title, p.intro, ...p.sections.flatMap((s) => [s.heading, ...s.body])]
        .filter((x): x is string => !!x)
        .join(' ')
        .replace(/[「『][^」』]*[」』]/g, '');   // 日本語表現の引用は許す
      expect(kana.test(text), `${p.id} に日本語が残っている`).toBe(false);
    }
  });

  it('日本語版が中国語だけになっていない', () => {
    const kana = /[ぁ-んァ-ヴ]/;
    for (const p of buildLegalPages('ja')) {
      expect(kana.test(p.intro), p.id).toBe(true);
    }
  });
});

describe('未確定の事実を作文しない・「準備中」も出さない', () => {
  const banned = /TODO|FIXME|準備中|准备中|coming soon|未定|待定|xxx|〇〇|●●/i;

  it('本文に placeholder 表現が無い', () => {
    for (const lang of ['ja', 'zh'] as const) {
      for (const p of buildLegalPages(lang)) {
        const text = [p.title, p.intro, ...p.sections.flatMap((s) => [s.heading, ...s.body])].join(' ');
        expect(banned.test(text), `${lang}/${p.id}`).toBe(false);
      }
    }
  });

  it('事実が未確定の節は、節ごと描画対象から外れる', () => {
    for (const lang of ['ja', 'zh'] as const) {
      for (const p of buildLegalPages(lang)) {
        const r = renderableLegalPage(p);
        for (const s of r.sections) {
          expect(s.body.every((b) => typeof b === 'string' && b.length > 0), `${lang}/${p.id}/${s.heading}`).toBe(true);
        }
      }
    }
  });

  it('事実がすべて埋まれば、特商法ページに販売事業者・価格の節が出る', () => {
    const filled: LegalFacts = {
      ...LEGAL_FACTS,
      operatorName: 'テスト事業者', address: 'on_request', phone: 'on_request',
      // 価格は planCatalog 由来の文字列（商品が複数あるので数値1つでは足りない）。
      // 実在の金額はここに書かない（planCatalog.test.ts のハードコード検査に引っかかるため）
      priceJpyTaxIncluded: { ja: 'テストプラン：9,999円（税込）', zh: '测试方案：9,999日元（含税）' },
      paymentMethods: [{ ja: '銀行振込', zh: '银行转账' }],
      paymentTiming: { ja: '申込時', zh: '报名时' },
      serviceStartTiming: { ja: '決済確認後', zh: '确认付款后' },
      refundPolicy: { ja: '開始前は全額返金', zh: '开始前全额退款' },
      retentionPeriod: { ja: '受講終了後1年', zh: '结束后1年' },
      deletionSlaDays: 30, improvementUseAllowed: false,
      minimumAge: 18, externalAiVendors: ['OpenAI'],
      governingLaw: { ja: '日本法', zh: '日本法' },
    };
    const page = buildLegalPages('ja', filled).find((p) => p.id === 'tokushoho')!;
    const r = renderableLegalPage(page, filled);
    const headings = r.sections.map((s) => s.heading);
    expect(headings).toContain('販売事業者');
    expect(headings).toContain('販売価格');
    // 価格はカタログ由来の文字列がそのまま出る（数値の整形はここでしない）
    expect(r.sections.find((s) => s.heading === '販売価格')!.body[0]).toBe(filled.priceJpyTaxIncluded!.ja);
    // zhでは「日元（含税）」表記になる（UX-005）
    const zhPage = buildLegalPages('zh', filled).find((p) => p.id === 'tokushoho')!;
    const zhR = renderableLegalPage(zhPage, filled);
    expect(zhR.sections.find((s) => s.heading === '销售价格')!.body[0]).toBe(filled.priceJpyTaxIncluded!.zh);
    expect(pendingLegalFacts(filled)).toEqual([]);
  });

  it('CEO入力が完了し、14項目すべてが埋まっている（公開可能）', () => {
    expect(pendingLegalFacts()).toEqual([]);
    expect(LEGAL_PUBLISH).toBe(true);
  });
});

describe('公開ガードと導線', () => {
  it('公開後は法務URLがそのまま表示される（入口へ戻されない）', () => {
    renderAt('/ja/ai-course/terms');
    expect(screen.queryByTestId('course-entry')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('利用規約');
  });

  it('公開後は未確定の注記を出さない', () => {
    renderAt('/ja/ai-course/terms');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('中国語ページは中国語で出る', () => {
    renderAt('/zh/ai-course/privacy');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('隐私政策');
  });

  it('公開後は noindex を付けない（検索エンジンに拾わせる）', () => {
    renderAt('/ja/ai-course/privacy');
    // LEGAL_PUBLISH=true なので robots メタは出さない
    expect(document.head.querySelector('meta[name="robots"][content*="noindex"]')).toBeNull();
  });

  it('footerリンクが8本あり、言語ごとに正しいURLを指す', () => {
    const { container } = render(
      <MemoryRouter><LegalFooterLinks lang="zh" /></MemoryRouter>,
    );
    const links = [...container.querySelectorAll('a')];
    expect(links).toHaveLength(8);
    for (const id of LEGAL_PAGE_IDS) {
      expect(links.some((a) => a.getAttribute('href') === legalPathFor('zh', id)), id).toBe(true);
    }
  });

  it('問い合わせ先は info@kawabado.com に集約されている', () => {
    for (const lang of ['ja', 'zh'] as const) {
      const contact = renderableLegalPage(buildLegalPages(lang).find((p) => p.id === 'contact')!);
      expect(contact.sections.flatMap((s) => s.body).join(' ')).toContain('info@kawabado.com');
    }
  });

  it('最低年齢が18未満のときは保護者同意の条項も出る（CEO決定）', () => {
    for (const lang of ['ja', 'zh'] as const) {
      const terms = renderableLegalPage(buildLegalPages(lang).find((p) => p.id === 'terms')!);
      const sec = terms.sections.find((s) => s.heading.includes('受講資格') || s.heading.includes('报名资格'))!;
      expect(sec.body.length, `${lang}: 年齢＋保護者同意の2文が要る`).toBe(2);
      expect(sec.body.join('')).toMatch(lang === 'ja' ? /保護者/ : /监护人/);
    }
  });

  it('削除の導線が学習データとアカウントの両方にある', () => {
    for (const lang of ['ja', 'zh'] as const) {
      const ids = buildLegalPages(lang).map((p) => p.id);
      expect(ids).toContain('data-deletion');
      expect(ids).toContain('account-deletion');
    }
  });
});
