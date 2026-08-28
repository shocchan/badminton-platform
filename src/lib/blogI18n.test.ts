import { describe, it, expect } from 'vitest';
import { localizeHref } from './blogI18n';

describe('localizeHref', () => {
  it('日本語で読んでいるときは /ja のままにする', () => {
    expect(localizeHref('/ja/activity', 'ja')).toBe('/ja/activity');
    expect(localizeHref('https://kawabado.com/ja/blog/35', 'ja')).toBe('https://kawabado.com/ja/blog/35');
  });

  it('読んでいる言語に合わせて逆向きにも付け替える（日本語ページの /zh リンク）', () => {
    expect(localizeHref('https://kawabado.com/zh/blog/35', 'ja')).toBe('https://kawabado.com/ja/blog/35');
    expect(localizeHref('/zh/activity', 'ja')).toBe('/ja/activity');
    expect(localizeHref('/blog/31', 'ja')).toBe('/ja/blog/31');
  });

  it('サイト内の /ja リンクを /zh に付け替える', () => {
    expect(localizeHref('/ja/activity', 'zh')).toBe('/zh/activity');
    expect(localizeHref('https://kawabado.com/ja/blog/35', 'zh')).toBe('https://kawabado.com/zh/blog/35');
    expect(localizeHref('https://kawabado.com/ja', 'zh')).toBe('https://kawabado.com/zh');
  });

  it('言語が付いていないサイト内リンクにも /zh を足す（そのままだと /ja へ転送される）', () => {
    expect(localizeHref('/blog/31', 'zh')).toBe('/zh/blog/31');
    expect(localizeHref('https://kawabado.com/results/vol3', 'zh')).toBe('https://kawabado.com/zh/results/vol3');
  });

  it('すでに /zh のリンクは二重に付け替えない', () => {
    expect(localizeHref('/zh/activity', 'zh')).toBe('/zh/activity');
  });

  it('外部リンクとmailtoには触れない', () => {
    expect(localizeHref('https://minton.jp/Competition/detail/878', 'zh'))
      .toBe('https://minton.jp/Competition/detail/878');
    expect(localizeHref('https://www.google.com/maps/place/foo', 'zh'))
      .toBe('https://www.google.com/maps/place/foo');
    expect(localizeHref('mailto:info@kawabado.com', 'zh')).toBe('mailto:info@kawabado.com');
  });

  it('href が無いときは落ちない', () => {
    expect(localizeHref(undefined, 'zh')).toBeUndefined();
    expect(localizeHref('', 'zh')).toBeUndefined();
  });
});
