// @vitest-environment jsdom
//
// フッターの関連サービス導線と法務ページ導線の回帰テスト。
// ここは「消えても画面が壊れない」ので、消えたことに気づけるようにテストで固定する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../contexts/LanguageContext';

const trackRelatedServiceClick = vi.fn();
vi.mock('../lib/analytics', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/analytics')>();
  return { ...actual, trackRelatedServiceClick: (...a: unknown[]) => trackRelatedServiceClick(...a) };
});

const { Footer } = await import('./Footer');

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider><Footer /></LanguageProvider>
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('関連サービスのクリック計測', () => {
  it('AI日本語コースのクリックで、どのページから出たかが残る', () => {
    renderAt('/ja/faq');
    fireEvent.click(screen.getByRole('link', { name: /AI日本語コース/ }));
    expect(trackRelatedServiceClick).toHaveBeenCalledWith('ai_course', '/ja/faq');
  });

  it('wildflow のクリックも同様に残る（中国語ページから）', () => {
    renderAt('/zh/venues');
    fireEvent.click(screen.getByRole('link', { name: /wildflow/ }));
    expect(trackRelatedServiceClick).toHaveBeenCalledWith('wildflow', '/zh/venues');
  });
});

describe('wildflow への外部リンク', () => {
  it('nofollow を付ける（逆向きの被リンクが無い一方向リンクのため）', () => {
    renderAt('/ja/');
    const link = screen.getByRole('link', { name: /wildflow/ });
    expect(link.getAttribute('rel')).toContain('nofollow');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('同じ運営者であることを文章で書いてある（踏む前に関係が分かる）', () => {
    renderAt('/ja/');
    expect(screen.getByText(/同じ運営者/)).toBeTruthy();
  });

  it('リンク自体は消さない', () => {
    renderAt('/ja/');
    expect(screen.getByRole('link', { name: /wildflow/ }).getAttribute('href')).toBe('https://wild-flow.com/');
  });
});

describe('法務ページへの導線', () => {
  it('日本語ページでは日本語のラベルで3本とも出る', () => {
    renderAt('/ja/');
    expect(screen.getByRole('link', { name: '特定商取引法に基づく表記' }).getAttribute('href')).toBe('/ja/tokushoho');
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' }).getAttribute('href')).toBe('/ja/privacy');
    expect(screen.getByRole('link', { name: '利用規約' }).getAttribute('href')).toBe('/ja/terms');
  });

  it('中国語ページでは中国語のラベル＋ /zh/ のURLになる', () => {
    renderAt('/zh/');
    expect(screen.getByRole('link', { name: '隐私政策' }).getAttribute('href')).toBe('/zh/privacy');
    expect(screen.getByRole('link', { name: '使用条款' }).getAttribute('href')).toBe('/zh/terms');
    expect(screen.getByRole('link', { name: '基于特定商业交易法的标示' }).getAttribute('href')).toBe('/zh/tokushoho');
  });

  it('既存の大会FAQ・キャンセルポリシーを追い出していない', () => {
    renderAt('/ja/');
    expect(screen.getAllByRole('link', { name: '大会FAQ' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: '大会キャンセルポリシー' }).length).toBeGreaterThan(0);
  });
});
