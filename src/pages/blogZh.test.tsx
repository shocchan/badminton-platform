// @vitest-environment jsdom
//
// 右上の言語切替でブログ本文が中国語に入れ替わる（2026-08-25）。
//
// 【何を固定したいか】
// 1. 中国語版がある記事だけ中国語で出る。無い記事は**日本語のまま並べて**「日文」バッジを付ける
//    （訳済みだけを一覧に出すと、中国語で見たとき記事が数本しか無いサイトに見える）
// 2. canonical / hreflang は「その記事に中国語版があるか」で決まる。
//    未訳の記事は /ja へ寄せ、hreflang を**出さない**
//    （自己参照でない canonical と hreflang の併用は矛盾する。src/pages/blogSeo.ts 冒頭）
// 3. 本文が日本語なら <html lang> も ja。中国語UIでも「中身が中国語」と名乗らない
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { BlogPost } from '../types';
import {
  BLOG_META, hasZhBody, pickBlogText, blogPostCanonical, blogPostAlternates,
} from './blogSeo';

const JA_ONLY: BlogPost = {
  id: 23,
  title: '火瓶杯 バドミントン団体戦 参加レポート',
  content: '<p>芝園公民館で練習してきました。</p>',
  content_type: 'html',
  excerpt: '団体戦のレポートです。',
  status: 'published',
  published_at: '2026-08-01T00:00:00Z',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const TRANSLATED: BlogPost = {
  ...JA_ONLY,
  id: 9,
  title: '第1回 川口・蕨バド交流大会 開催レポート',
  excerpt: '7名が集まりました。',
  content: '<p>川口市芝園公民館で開催しました。</p>',
  title_zh: '第1回 川口・蕨バド交流大会 举办报告',
  excerpt_zh: '共有7名选手参加。',
  content_zh: '<p>在川口市芝園公民館举办。</p>',
};

// 一覧・詳細が使うフックだけ差し替える（DBには触らない）
const state: { posts: BlogPost[]; post: BlogPost | null } = { posts: [], post: null };
vi.mock('../hooks/useBlogPosts', () => ({
  useBlogPosts: () => ({ blogPosts: state.posts, loading: false, error: null }),
  useBlogPost: () => ({ post: state.post, loading: false, error: null }),
}));
vi.mock('../services/supabaseClient', () => ({
  supabase: { rpc: () => Promise.resolve({ error: null }) },
}));

const { BlogPage } = await import('./BlogPage');
const { BlogDetailPage } = await import('./BlogDetailPage');

afterEach(cleanup);

const renderList = (lang: 'ja' | 'zh', posts: BlogPost[]) => {
  state.posts = posts;
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/${lang}/blog`]}>
        <LanguageProvider>
          <Routes><Route path="/:lang/blog" element={<BlogPage />} /></Routes>
        </LanguageProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
};

const renderDetailPage = (lang: 'ja' | 'zh', post: BlogPost) => {
  state.post = post;
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/${lang}/blog/${post.id}`]}>
        <LanguageProvider>
          <Routes><Route path="/:lang/blog/:id" element={<BlogDetailPage />} /></Routes>
        </LanguageProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
};

/**
 * 詳細ページを描き、Helmet が <head> に入れたタグを読む。
 * Helmet の反映は非同期なので、canonical が入るまで待つ
 * （待たずに読むと前のテストの値が残ったまま通り、SEOの分岐が壊れていても気づけない）。
 */
const renderDetail = async (lang: 'ja' | 'zh', post: BlogPost) => {
  renderDetailPage(lang, post);
  await waitFor(() => {
    expect(document.head.querySelector('link[rel="canonical"]')).not.toBeNull();
  });
  return {
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    hreflangs: [...document.head.querySelectorAll('link[rel="alternate"]')]
      .map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]),
    htmlLang: document.documentElement.getAttribute('lang'),
    // JSON-LD は <head> ではなく本文側に出る。React 19 が自動で <head> へ持ち上げるのは
    // title / meta / link と async な script だけで、react-helmet-async もそれに乗っているため
    // （JSON-LDは body にあっても構造化データとして有効。ここは仕様であって不具合ではない）。
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent || '{}')),
  };
};

describe('どの言語で出すかの判定', () => {
  it('中国語本文があるかだけで決まる（タイトルだけ訳しても切り替えない）', () => {
    expect(hasZhBody(JA_ONLY)).toBe(false);
    expect(hasZhBody(TRANSLATED)).toBe(true);
    // 本文が空文字なら未翻訳（NULLと同じ扱い）
    expect(hasZhBody({ ...TRANSLATED, content_zh: '   ' })).toBe(false);
    // タイトルだけ中国語＝日本語の記事に中国語の見出しが付くだけなので切り替えない
    expect(hasZhBody({ ...JA_ONLY, title_zh: '标题' })).toBe(false);
  });

  it('zh要求＋中国語本文あり → 中国語で返る', () => {
    const t = pickBlogText(TRANSLATED, 'zh');
    expect(t.lang).toBe('zh');
    expect(t.translated).toBe(true);
    expect(t.showJaBadge).toBe(false);
    expect(t.title).toBe(TRANSLATED.title_zh);
    expect(t.content).toBe(TRANSLATED.content_zh);
  });

  it('zh要求＋中国語本文なし → 日本語のまま＋バッジ', () => {
    const t = pickBlogText(JA_ONLY, 'zh');
    expect(t.lang).toBe('ja');
    expect(t.translated).toBe(false);
    expect(t.showJaBadge).toBe(true);
    expect(t.title).toBe(JA_ONLY.title);
    expect(t.content).toBe(JA_ONLY.content);
  });

  it('ja要求のときは中国語版があっても日本語（バッジも出さない）', () => {
    const t = pickBlogText(TRANSLATED, 'ja');
    expect(t.lang).toBe('ja');
    expect(t.showJaBadge).toBe(false);
    expect(t.title).toBe(TRANSLATED.title);
  });

  it('本文だけ中国語でタイトルが未訳なら、タイトルは日本語で埋める', () => {
    const t = pickBlogText({ ...TRANSLATED, title_zh: null, excerpt_zh: '' }, 'zh');
    expect(t.translated).toBe(true);
    expect(t.title).toBe(TRANSLATED.title);
    expect(t.excerpt).toBe(TRANSLATED.excerpt);
  });
});

describe('一覧（/zh/blog）', () => {
  it('未訳の記事も並べ、「日文」バッジを付ける', () => {
    renderList('zh', [JA_ONLY]);
    expect(screen.getByText(JA_ONLY.title)).toBeTruthy();
    expect(screen.getAllByTestId('ja-badge')[0].textContent).toContain(BLOG_META.zh.jaBadge);
  });

  it('訳済みの記事は中国語で出て、バッジは付かない', () => {
    renderList('zh', [TRANSLATED]);
    expect(screen.getByText(TRANSLATED.title_zh as string)).toBeTruthy();
    expect(screen.queryByText(TRANSLATED.title)).toBeNull();
    expect(screen.queryAllByTestId('ja-badge')).toEqual([]);
  });

  it('日本語UIではバッジを出さない（日本語話者に関係のない情報）', () => {
    renderList('ja', [JA_ONLY, TRANSLATED]);
    expect(screen.queryAllByTestId('ja-badge')).toEqual([]);
    expect(screen.getByText(TRANSLATED.title)).toBeTruthy();
  });
});

describe('詳細（canonical / hreflang / html lang）', () => {
  it('未訳の記事: /zh でも canonical は /ja、hreflang は出さない', async () => {
    const r = await renderDetail('zh', JA_ONLY);
    expect(r.canonical).toBe('https://kawabado.com/ja/blog/23');
    expect(r.hreflangs).toEqual([]);
    expect(r.htmlLang).toBe('ja');
  });

  it('訳済みの記事: /zh は自己参照canonical＋ja/zh/x-defaultのhreflang', async () => {
    const r = await renderDetail('zh', TRANSLATED);
    expect(r.canonical).toBe('https://kawabado.com/zh/blog/9');
    expect(r.hreflangs).toEqual([
      ['ja', 'https://kawabado.com/ja/blog/9'],
      ['zh', 'https://kawabado.com/zh/blog/9'],
      ['x-default', 'https://kawabado.com/ja/blog/9'],
    ]);
    expect(r.htmlLang).toBe('zh');
  });

  it('訳済みの記事: /ja 側も自己参照canonical＋同じhreflang（相互に結ぶ）', async () => {
    const r = await renderDetail('ja', TRANSLATED);
    expect(r.canonical).toBe('https://kawabado.com/ja/blog/9');
    expect(r.hreflangs.length).toBe(3);
    expect(r.htmlLang).toBe('ja');
  });

  it('中国語で表示した記事のJSON-LDは中国語の見出し・inLanguage zh', async () => {
    const r = await renderDetail('zh', TRANSLATED);
    const ld = r.jsonLd.find((o) => o['@type'] === 'BlogPosting');
    expect(ld.headline).toBe(TRANSLATED.title_zh);
    expect(ld.inLanguage).toBe('zh');
    expect(ld.mainEntityOfPage).toBe('https://kawabado.com/zh/blog/9');
  });

  it('未訳の記事のJSON-LDは日本語のまま（中身が日本語なので zh と名乗らない）', async () => {
    const r = await renderDetail('zh', JA_ONLY);
    const ld = r.jsonLd.find((o) => o['@type'] === 'BlogPosting');
    expect(ld.headline).toBe(JA_ONLY.title);
    expect(ld.inLanguage).toBe('ja');
  });

  it('下書き・限定公開はnoindexなのでhreflangを出さない', async () => {
    const r = await renderDetail('zh', { ...TRANSLATED, status: 'unlisted' });
    expect(r.hreflangs).toEqual([]);
  });

  it('本文が入れ替わる（中国語UIで日本語本文が残らない）', () => {
    renderDetailPage('zh', TRANSLATED);
    const body = screen.getByTestId('blog-body');
    expect(body.innerHTML).toContain('在川口市芝園公民館举办');
    expect(body.innerHTML).not.toContain('で開催しました');
    expect(body.getAttribute('lang')).toBe('zh');
  });
});

describe('SEOヘルパー単体', () => {
  it('canonicalは中国語版がある記事だけ言語別になる', () => {
    expect(blogPostCanonical(9, 'zh', true)).toBe('https://kawabado.com/zh/blog/9');
    expect(blogPostCanonical(9, 'ja', true)).toBe('https://kawabado.com/ja/blog/9');
    expect(blogPostCanonical(23, 'zh', false)).toBe('https://kawabado.com/ja/blog/23');
  });

  it('hreflangは中国語版がある記事にだけ出す（矛盾を作らない）', () => {
    expect(blogPostAlternates(23, false)).toBeNull();
    expect(blogPostAlternates(9, true)).toEqual({
      ja: 'https://kawabado.com/ja/blog/9',
      zh: 'https://kawabado.com/zh/blog/9',
      xDefault: 'https://kawabado.com/ja/blog/9',
    });
  });
});
