// @vitest-environment jsdom
// 「戻る」でコースの前の画面へ帰れること。
// CEO報告: 初回の「はじめる前に」から別画面へ移ると、戻っても案内へ帰れず
// ホームに着地した。ここではその往復を実際の履歴で再現して確かめる。

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useStepHistory, type HistoryStepFor } from './useStepHistory';

type Step = 'loading' | 'guide' | 'home' | 'growth' | 'lesson';

// module scope（render ごとに作らない）
const historyStepFor: HistoryStepFor<Step> = (s) => {
  if (s === 'loading') return null;      // 認証前は積まない
  if (s === 'lesson') return 'home';     // レッスン中へは戻さない
  return s;
};

/** 画面名を出すだけの器。ボタンで step を動かす */
const Course = () => {
  const [step, setStep] = useState<Step>('loading');
  const navigate = useNavigate();
  useStepHistory(step, setStep, historyStepFor);
  return (
    <div>
      <p data-testid="screen">{step}</p>
      {(['guide', 'home', 'growth', 'lesson', 'loading'] as Step[]).map((s) => (
        <button key={s} onClick={() => setStep(s)}>{`go:${s}`}</button>
      ))}
      <button onClick={() => navigate(-1)}>戻る</button>
      <button onClick={() => navigate(1)}>進む</button>
    </div>
  );
};

/** コースの手前にもう1画面ある状態から始める（コース外へ出られるかも見るため） */
const renderApp = () => render(
  <MemoryRouter initialEntries={['/ja/', '/ja/ai-course']} initialIndex={1}>
    <Routes>
      <Route path="/:lang/" element={<p data-testid="screen">コース外</p>} />
      <Route path="/:lang/ai-course" element={<Course />} />
    </Routes>
  </MemoryRouter>,
);

const click = async (label: string) => {
  await act(async () => { screen.getByText(label).click(); });
};
const go = (s: Step) => click(`go:${s}`);
const back = () => click('戻る');
const forward = () => click('進む');
const current = () => screen.getByTestId('screen').textContent;

describe('useStepHistory', () => {
  afterEach(cleanup);

  it('別の画面へ移ったあと、戻るで元の画面へ帰れる', async () => {
    renderApp();
    await go('guide');
    await go('growth');
    expect(current()).toBe('growth');

    await back();
    expect(current()).toBe('guide');   // ← 直っていないと 'コース外' になる
  });

  it('2画面ぶん戻れる', async () => {
    renderApp();
    await go('guide');
    await go('home');
    await go('growth');

    await back();
    expect(current()).toBe('home');
    await back();
    expect(current()).toBe('guide');
  });

  it('最初の画面は履歴を増やさない（入った直後の戻るでコースを出られる）', async () => {
    renderApp();
    await go('guide');

    await back();
    expect(current()).toBe('コース外');
  });

  it('レッスン中に戻ると、レッスンへは再入場せずホームへ出る', async () => {
    renderApp();
    await go('guide');
    await go('home');
    await go('lesson');
    expect(current()).toBe('lesson');

    await back();
    expect(current()).not.toBe('lesson');
    expect(current()).toBe('guide');
  });

  it('履歴に載せない画面（ログイン等）へ移ったら、そこへ留まる', async () => {
    // ログアウトで step が 'loading'（履歴に載せない画面）へ移ったのに、
    // 履歴に残っていた画面へ引き戻され、ログイン画面に戻れなかった
    renderApp();
    await go('guide');
    await go('growth');

    await go('loading');
    expect(current()).toBe('loading');

    // 少し待っても引き戻されない
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(current()).toBe('loading');
  });

  it('戻ったあとに進むと、先の画面へ帰れる', async () => {
    renderApp();
    await go('guide');
    await go('growth');
    await back();
    expect(current()).toBe('guide');

    await forward();
    expect(current()).toBe('growth');
  });
});
