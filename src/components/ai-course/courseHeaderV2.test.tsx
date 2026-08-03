// @vitest-environment jsdom
// V2の生徒に出すヘッダーは3つだけ（今日の冒険 / 冒険マップ / 設定）。
//
// CEO報告: 冒険の画面なのにヘッダーが旧コースの5項目（ホーム・成長・ロードマップ・
// 学習記録・設定）に戻っていた。原因は画面ごとに v2Mode を渡していたこと。
// ここでは「V2なら3つ」「旧コースなら5つ」を固定して、渡し忘れに気づけるようにする。

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { CourseHeader } from './CourseHeader';
import { aiCourseI18n } from '../../locales/aiCourse';

afterEach(cleanup);

const show = (v2Mode: boolean) => render(
  <HelmetProvider>
    <MemoryRouter>
      <CourseHeader
        t={aiCourseI18n.ja} showNav current="home" v2Mode={v2Mode}
        onNavigate={() => {}} onLogout={() => {}} lang="ja" onToggleLang={() => {}}
      />
    </MemoryRouter>
  </HelmetProvider>,
);

/** ナビ内のリンク文言（ログアウト・言語切替はナビの外なので拾わない） */
const navLabels = (): string[] => {
  const nav = screen.getAllByRole('navigation')[0];
  return within(nav).getAllByRole('button').map((b) => b.textContent?.trim() ?? '');
};

describe('コースのヘッダー', () => {
  it('V2の生徒には3つだけ出す', () => {
    show(true);
    const labels = navLabels();
    expect(labels).toContain('今日の冒険');
    expect(labels).toContain('冒険マップ');
    expect(labels).toContain('設定');
  });

  it('V2の生徒には旧コースの導線を出さない', () => {
    show(true);
    const labels = navLabels().join(' ');
    // 「成長」「学習記録」は冒険マップへ一本化した（現在地の指標を2つ出さない）
    expect(labels).not.toContain('成長');
    expect(labels).not.toContain('学習記録');
    expect(labels).not.toContain('ロードマップ');
  });

  it('旧コースの生徒はこれまでどおり5項目', () => {
    show(false);
    const labels = navLabels();
    expect(labels).toEqual(
      expect.arrayContaining(['ホーム', '成長', 'ロードマップ', '学習記録', '設定']),
    );
  });
});
