// @vitest-environment jsdom
// 大会カードの第一ボタンは「詳細を見る」であること（2026-08-24）。
//
// 【なぜテストで固定するか】
// この変更は一度 `feat/tournament-gallery-trust`（badminton-platform 側）で入れたのに、
// デプロイ元が badminton-aicourse へ移った際に置き去りになり、本番では
// 一覧からいきなり「申し込む」に戻っていた（CEO指摘 2026-08-24）。
// 同じ取り残しをもう一度起こさないよう、ここで固定する。
//
// 【なぜ詳細ページ経由にするのか】
// 一覧から直接申込フォームへ入ると、参加費・支払い方法・キャンセル条件を読まないまま
// 個人情報の入力に進む。返金不可などの条件は詳細ページにしか書いていない。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TournamentCard } from './TournamentCard';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { Tournament } from '../types';

afterEach(cleanup);

// カードは表示アニメーションで IntersectionObserver を使う。jsdom には無いので最小の代役を置く
// （「常に見えている」ことにする＝描画されない、で落ちるのを防ぐ）
// erasableSyntaxOnly のため、コンストラクタの引数プロパティ記法は使わない
class IO {
  cb: (e: { isIntersecting: boolean }[]) => void;
  constructor(cb: (e: { isIntersecting: boolean }[]) => void) { this.cb = cb; }
  observe() { this.cb([{ isIntersecting: true }]); }
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;

const base = {
  id: 42,
  title: '川口・蕨バド交流杯 9月17日 シングルス',
  event_date: '2099-09-17',
  start_time: '19:00',
  end_time: '21:00',
  location: '芝園公民館',
  entry_fee: 1500,
  capacity: 30,
  level: 'オープン',
  event_type: 'シングルス',
  status: 'active',
  visibility: 'published',
} as unknown as Tournament;

const show = (t: Partial<Tournament> = {}, entryCount = 0) =>
  render(
    <MemoryRouter>
      <TournamentCard tournament={{ ...base, ...t } as Tournament} entryCount={entryCount} onApply={() => {}} />
    </MemoryRouter>,
  );

describe('募集中の大会', () => {
  it('第一ボタンは「詳細を見る」（いきなり申込にしない）', () => {
    show();
    expect(screen.getByText('詳細を見る →')).toBeTruthy();
    expect(screen.queryByText('申し込む →'), '一覧から直接申込に入らせない').toBeNull();
  });

  it('詳細ページへのリンクである（押しても何も起きない飾りにしない）', () => {
    const { container } = show();
    const link = container.querySelector('a[aria-label*="詳細を見る"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/ja/tournaments/42');
  });

  it('カード全体のストレッチリンクに吸われない（relative z-10 がある）', () => {
    const { container } = show();
    const cls = container.querySelector('a[aria-label*="詳細を見る"]')?.className ?? '';
    expect(cls, 'z-10 が無いとカード全体の overlay に click を取られる').toContain('z-10');
    expect(cls).toContain('relative');
  });

  it('中国語では「查看详情」', () => {
    // lang は URL から LanguageProvider が導く。Provider が無いと既定の ja になる
    render(
      <MemoryRouter initialEntries={['/zh/']}>
        <LanguageProvider>
          <TournamentCard tournament={base} entryCount={0} onApply={() => {}} />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('查看详情 →')).toBeTruthy();
  });
});

describe('満席のとき', () => {
  it('キャンセル待ちは従来どおり申込ボタンのまま（詳細を見るに変えない）', () => {
    show({}, 30);
    expect(screen.getByText('キャンセル待ちで申し込む →')).toBeTruthy();
  });
});

describe('受付が終わっているとき', () => {
  it('中止の大会に申込導線を出さない', () => {
    show({ status: 'cancelled' } as Partial<Tournament>);
    expect(screen.queryByText('詳細を見る →')).toBeNull();
    expect(screen.queryByText('申し込む →')).toBeNull();
  });
});
