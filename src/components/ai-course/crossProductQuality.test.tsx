// @vitest-environment jsdom
// Phase B-5: 横断品質監査で見つけたP1を、修正したまま固定する。
//
// 静的監査は scripts/ai-course/audit-cross-product.mjs が担当する。
// こちらは「実際にレンダリングして学習者に何が出るか」で確認する。
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SupportReportButton } from './ops/SupportReportButton';
import { CourseTextLesson } from './CourseTextLesson';
import { PlatformFeatures } from '../../pages/ai-lesson/landing/sectionsB';
import { aiCourseI18n } from '../../locales/aiCourse';
import type { SupportAdapter } from '../../lib/aiLesson/course/ops/supportReport';
import { COURSE_MISSIONS } from '../../lib/aiLesson/course/courseData';

afterEach(cleanup);

// jsdomは scrollTo を実装していない。会話画面は描画直後に呼ぶので補う。
beforeAll(() => {
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

const KANA = /[ぁ-んァ-ヴ]/;
const adapter: SupportAdapter = { send: async () => ({ ok: true, deliveredTo: 'adapter' }) };
const ctx = {
  route: 'settings', feature: 'support', locale: 'zh',
  appVersion: 'test', contentVersion: 'course-v1', deviceClass: 'unknown',
} as const;

describe('困ったときの導線が中国語でも中国語で出る（B-5 P1）', () => {
  it('中国語表示のとき、開くボタンに日本語が出ない', () => {
    render(<SupportReportButton lang="zh" adapter={adapter} context={{ ...ctx }} />);
    expect(document.body.textContent).not.toMatch(KANA);
  });

  it('中国語表示で報告フォームを開くと、案内文がすべて中国語になる', () => {
    render(<SupportReportButton lang="zh" adapter={adapter} context={{ ...ctx }} />);
    fireEvent.click(screen.getByRole('button'));
    // 画面の案内（見出し・入力ラベル・注意書き・送信・やめる）に日本語を残さない
    for (const zhText of ['哪一项最接近？', '详细说明（选填・这部分不会被发送）', '告诉我们', '取消']) {
      expect(screen.getByText(zhText)).toBeTruthy();
    }
    expect(document.body.textContent).not.toContain('どれが近いですか？');
    expect(document.body.textContent).not.toContain('知らせる');
  });

  it('カテゴリは学習者の言語が主・日本語は補助（zhで日本語が主にならない）', () => {
    render(<SupportReportButton lang="zh" adapter={adapter} context={{ ...ctx }} />);
    fireEvent.click(screen.getByRole('button'));
    const cat = screen.getByText('内容有误');           // zhラベル
    expect(cat).toBeTruthy();
    // 日本語は同じボタン内の補助表示（小さいspan）に降りている
    const sub = screen.getByText('内容が間違っている');
    expect(sub.tagName).toBe('SPAN');
    expect(cat.contains(sub)).toBe(true);
  });

  it('中国語表示では、端末に控えた場合の案内も中国語になる', async () => {
    const failing: SupportAdapter = { send: async () => ({ ok: false, code: 'SUPPORT_SEND_FAILED' }) };
    render(
      <SupportReportButton lang="zh" adapter={failing} context={{ ...ctx }}
        contactFallback={{ ja: '先生にお知らせください。', zh: '请直接告诉老师。' }} />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('内容有误'));
    fireEvent.click(screen.getByText('告诉我们'));
    expect(await screen.findByText('已保存在这台设备上')).toBeTruthy();
    expect(screen.getByText(/请直接告诉老师。/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('先生にお知らせください');
  });

  it('日本語表示では日本語で出る（zh固定にしていない）', () => {
    render(<SupportReportButton lang="ja" adapter={adapter} context={{ ...ctx, locale: 'ja' }} />);
    expect(screen.getByRole('button').textContent).toMatch(KANA);
  });
});

describe('会話画面の送信ボタンが学習者の言語で読み上げられる（B-5 P1）', () => {
  // 実在のミッションを使う（作り物のfixtureだと本番の描画と食い違う）
  const base = {
    step: { mission: COURSE_MISSIONS[0], kind: 'new' as const, hideTarget: false },
    sessionId: null, learner: null,
    onComplete: () => {}, onExit: () => {},
  };
  it('中国語表示では aria-label が中国語（"send" のままにしない）', () => {
    const { container } = render(<CourseTextLesson t={aiCourseI18n.zh} {...base} />);
    const labels = [...container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
    expect(labels).not.toContain('send');
    expect(labels.some((l) => l === '发送')).toBe(true);
  });
  it('日本語表示では日本語の aria-label', () => {
    const { container } = render(<CourseTextLesson t={aiCourseI18n.ja} {...base} />);
    const labels = [...container.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
    expect(labels).not.toContain('send');
    expect(labels.some((l) => l === '送信')).toBe(true);
  });
});

describe('LPに「準備中」の空枠を出さない（B-5 P1）', () => {
  for (const lang of ['ja', 'zh'] as const) {
    it(`${lang}: 準備中 / 准备中 / coming soon が出ない`, () => {
      render(<PlatformFeatures lang={lang} />);
      const text = document.body.textContent ?? '';
      expect(text).not.toContain('準備中');
      expect(text).not.toContain('准备中');
      expect(text.toLowerCase()).not.toContain('coming soon');
    });
  }
});
