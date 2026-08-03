// @vitest-environment jsdom
// 発行画面の受入テスト。
//
// CEO報告: 「文面をコピーする」を押しても押した感覚がない。
// コピーは画面が何も変わらないと成功したか分からないので、
// 押したことが見た目で分かること・失敗を成功に見せないことを確かめる。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AiCourseIssuePage } from './AiCourseIssuePage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

const ISSUED = {
  loginId: 'MT-D4PW', password: 'GM7P5J',
  startDate: '2026-08-03', endDate: '2027-02-03',
  planId: 'six_month_coaching', purpose: 'owner_pilot_test',
};

const open = () => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={['/ja/ai-course/issue']}>
      <Routes><Route path="/:lang/ai-course/issue" element={<AiCourseIssuePage />} /></Routes>
    </MemoryRouter>
  </HelmetProvider>,
);

/** 発行済みの画面まで進める（合言葉は本物を使わない） */
const issue = async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(ISSUED), { status: 200 })));
  open();
  fireEvent.change(screen.getByLabelText('合言葉（運営用）'), { target: { value: 'test-pass' } });
  fireEvent.change(screen.getByLabelText('生徒のメールアドレス'), { target: { value: 'a@example.test' } });
  fireEvent.change(screen.getByLabelText('登録名'), { target: { value: 'テスト' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'アカウントを発行する' })); });
  expect(screen.getByText('発行しました')).toBeTruthy();
};

const copyButton = () => screen.getByRole('button', { name: /コピー/ });

describe('発行画面のコピーボタン', () => {
  it('押すと「コピーしました」に変わり、少し経つと元に戻る', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    await issue();
    expect(copyButton().textContent).toContain('文面をコピーする');

    await act(async () => { fireEvent.click(copyButton()); });
    expect(copyButton().textContent).toContain('コピーしました');

    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(copyButton().textContent).toContain('文面をコピーする');
  });

  it('コピーした文面にログインIDとパスワードが入っている', async () => {
    const writeText = vi.fn(async (text: string) => { void text; });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    await issue();
    await act(async () => { fireEvent.click(copyButton()); });

    const text = writeText.mock.calls[0][0];
    expect(text).toContain('MT-D4PW');
    expect(text).toContain('GM7P5J');
    expect(text).toContain('/ja/ai-course/login');
  });

  it('コピーできなかったときは成功に見せず、代わりの手順を出す', async () => {
    const writeText = vi.fn(async () => { throw new Error('denied'); });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    await issue();
    await act(async () => { fireEvent.click(copyButton()); });

    expect(copyButton().textContent).not.toContain('コピーしました');
    expect(screen.getByRole('alert').textContent).toContain('コピーできませんでした');
  });

  it('パスワードは発行直後の1回だけ表示し、次の発行へ進むと消える', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } });
    await issue();
    expect(screen.getByText('GM7P5J')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByText('続けてもう1件発行する')); });
    expect(screen.queryByText('GM7P5J')).toBeNull();
  });
});
