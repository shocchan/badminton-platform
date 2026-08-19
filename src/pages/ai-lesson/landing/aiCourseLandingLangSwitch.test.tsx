// @vitest-environment jsdom
// LP言語切替の回帰テスト（2026-07-31 P1修正）。
// issue report「中国語にならない」の根本原因: /zh/ai-course は存在するのに
// /ja/ai-course から到達する導線が0本だった。ヘッダー＋フッターのリンクを保証する。
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { AiCourseLandingPage } from './AiCourseLandingPage';

afterEach(cleanup);

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <HelmetProvider>
      <LanguageProvider>
        <AiCourseLandingPage />
      </LanguageProvider>
    </HelmetProvider>
  </MemoryRouter>,
);

describe('LP言語切替（ja⇄zh）', () => {
  it('/ja のLPヘッダーに「中文」リンクがあり /zh/ai-course を指す', () => {
    const { container } = renderAt('/ja/ai-course');
    const link = container.querySelector('[data-lp-lang-switch]');
    expect(link?.textContent).toBe('中文');
    expect(link?.getAttribute('href')).toBe('/zh/ai-course');
    // 中国語話者向けにaria-labelは中国語
    expect(link?.getAttribute('aria-label')).toBe('切换到中文页面');
  });
  it('/zh のLPヘッダーに「日本語」リンクがあり /ja/ai-course を指す', () => {
    const { container } = renderAt('/zh/ai-course');
    const link = container.querySelector('[data-lp-lang-switch]');
    expect(link?.textContent).toBe('日本語');
    expect(link?.getAttribute('href')).toBe('/ja/ai-course');
  });
  it('フッターにも切替リンクがある（長いページの末尾からも切替できる）', () => {
    const { container } = renderAt('/ja/ai-course');
    const link = container.querySelector('[data-lp-lang-switch-footer]');
    expect(link?.textContent).toBe('中文版');
    expect(link?.getAttribute('href')).toBe('/zh/ai-course');
  });
});

describe('受講者ログイン導線（LPと分離した専用URL）', () => {
  it('ヘッダーのログインリンクは /ja/ai-course/login を指す（?app=1 を使わない）', () => {
    const { container } = renderAt('/ja/ai-course');
    const link = container.querySelector('[data-lp-login-cta]');
    expect(link?.getAttribute('href')).toBe('/ja/ai-course/login');
  });
  it('/zh では /zh/ai-course/login を指す', () => {
    const { container } = renderAt('/zh/ai-course');
    const link = container.querySelector('[data-lp-login-cta]');
    expect(link?.getAttribute('href')).toBe('/zh/ai-course/login');
  });
  it('?v2=1 で来た場合はログインURLへ招待印を引き継ぐ', () => {
    // loginPath は window.location.search を読む（MemoryRouterはwindowを書き換えないため自前で設定）
    window.history.replaceState(null, '', '/ja/ai-course?v2=1');
    try {
      const { container } = renderAt('/ja/ai-course?v2=1');
      const link = container.querySelector('[data-lp-login-cta]');
      expect(link?.getAttribute('href')).toBe('/ja/ai-course/login?v2=1');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
