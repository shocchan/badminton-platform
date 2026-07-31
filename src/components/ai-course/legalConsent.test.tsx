// @vitest-environment jsdom
// 申込前の同意ゲート（Gate③のコード側）。
//
// ここで守りたいのは「まだ読めない文書への同意を求めない」こと。
// 法務ページが未公開のあいだ同意欄を出すと、学習者はリンク先を読めないまま
// チェックさせられることになるので、公開ゲートと連動させている。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CourseLogin } from './CourseLogin';
import { aiCourseI18n } from '../../locales/aiCourse';
import { LEGAL_PUBLISH } from '../../lib/aiLesson/course/legal/legalFacts';

afterEach(cleanup);

const renderLogin = (t: typeof aiCourseI18n.ja) => render(
  <MemoryRouter><CourseLogin t={t} onLoggedIn={() => {}} /></MemoryRouter>,
);

describe('申込前の同意（法務ページの公開と連動）', () => {
  it('法務ページが未公開のあいだは同意欄を出さない（読めない文書に同意させない）', () => {
    renderLogin(aiCourseI18n.ja);
    if (!LEGAL_PUBLISH) {
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(document.body.textContent).not.toContain(aiCourseI18n.ja.login.consentLabel);
    }
  });

  it('未公開のあいだも、メールを入れれば送信ボタンは押せる（同意で塞がない）', () => {
    renderLogin(aiCourseI18n.ja);
    const email = document.querySelector('input[type="email"]') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'a@example.com' } });
    const send = screen.getByRole('button', { name: new RegExp(aiCourseI18n.ja.login.sendCode) });
    expect((send as HTMLButtonElement).disabled).toBe(LEGAL_PUBLISH ? true : false);
  });

  it('ja/zh 両方に同意まわりの文言が用意されている', () => {
    for (const t of [aiCourseI18n.ja, aiCourseI18n.zh]) {
      for (const k of ['consentLabel', 'consentTerms', 'consentPrivacy', 'consentAi', 'consentRequired'] as const) {
        expect(t.login[k], `${t.locale}.${k}`).toBeTruthy();
        expect(String(t.login[k]).length).toBeGreaterThan(1);
      }
    }
  });

  it('中国語の同意文言に日本語のかなが混ざらない', () => {
    const kana = /[ぁ-んァ-ヴ]/;
    const zh = aiCourseI18n.zh.login;
    for (const k of ['consentLabel', 'consentTerms', 'consentPrivacy', 'consentAi', 'consentRequired'] as const) {
      expect(kana.test(String(zh[k])), k).toBe(false);
    }
  });
});

describe('公開後のふるまい（事実が揃った状態を模擬）', () => {
  it('LEGAL_PUBLISH=true なら同意チェックが出て、未チェックでは送信できない', async () => {
    vi.resetModules();
    vi.doMock('../../lib/aiLesson/course/legal/legalFacts', async () => {
      const actual = await vi.importActual<typeof import('../../lib/aiLesson/course/legal/legalFacts')>(
        '../../lib/aiLesson/course/legal/legalFacts');
      return { ...actual, LEGAL_PUBLISH: true };
    });
    const { CourseLogin: Published } = await import('./CourseLogin');
    const t = aiCourseI18n.ja;
    render(<MemoryRouter><Published t={t} onLoggedIn={() => {}} /></MemoryRouter>);

    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box).toBeTruthy();
    const email = document.querySelector('input[type="email"]') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'a@example.com' } });

    const send = screen.getByRole('button', { name: new RegExp(t.login.sendCode) }) as HTMLButtonElement;
    expect(send.disabled, '未チェックでは送信できない').toBe(true);

    fireEvent.click(box);
    expect(send.disabled, '同意すれば送信できる').toBe(false);

    // 規約・プライバシー・AI説明の3本へ実際に行ける
    const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/ja/ai-course/terms');
    expect(hrefs).toContain('/ja/ai-course/privacy');
    expect(hrefs).toContain('/ja/ai-course/ai-disclosure');
    vi.doUnmock('../../lib/aiLesson/course/legal/legalFacts');
  });
});
