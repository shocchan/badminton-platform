// @vitest-environment jsdom
//
// 30秒ノックを画面ごと30秒ぶん早送りして、**必ず結果画面に到達すること**を確かめる。
//
// 旧ラリーゲームは 166開始 / 93完了 ＝ 44%が結果画面に到達していなかった。
// 「時間切れ以外で終わらない」を実装で担保できているかは、ロジック単体ではなく
// コンポーネントの rAF ループまで通して見ないと意味がない。
//
// 2Dコンテキストが取れない環境（ここ）でも時間が進むこと自体が要件のひとつ。
// 描けない端末で「永遠に終わらない」を作らないため、更新と描画は分けてある。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import KnockGame from './KnockGame';
import { KNOCK_DURATION_MS, KNOCK_TARGETS } from '../lib/knockGame';

/** rAF と performance を止めて、任意の時間だけ進められるようにする */
const useFrameClock = () =>
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'Date',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
    ],
  });

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

/** 1〜6キーを全部叩く。どれかが光っているので必ず1本入る */
const swingAtEveryTarget = () => {
  for (let n = 1; n <= KNOCK_TARGETS.length; n++) {
    fireEvent.keyDown(window, { key: String(n) });
  }
};

beforeEach(() => {
  // jsdom には 2D コンテキストが無い（描画は飛ばされる）
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  useFrameClock();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('必ず結果画面に到達する', () => {
  it('一度も触らなくても、30秒で結果画面が出る', () => {
    render(<KnockGame />);
    fireEvent.click(screen.getByText('30秒スタート'));

    advance(KNOCK_DURATION_MS - 1_000);
    expect(screen.queryByText('30秒で打った本数')).toBeNull(); // まだ途中

    advance(1_100);
    expect(screen.getByText('30秒で打った本数')).toBeTruthy();
    expect(screen.getByText('もう1本いく')).toBeTruthy();
  });

  it('描画できない環境（2Dコンテキストなし）でも時間が進んで終わる', () => {
    // getContext は上の beforeEach で null 固定。それでも結果に到達する
    render(<KnockGame />);
    fireEvent.click(screen.getByText('30秒スタート'));
    advance(KNOCK_DURATION_MS + 200);
    expect(screen.getByText('30秒で打った本数')).toBeTruthy();
  });

  it('取り逃し続けても途中でゲームオーバーにならない（負けが存在しない）', () => {
    render(<KnockGame />);
    fireEvent.click(screen.getByText('30秒スタート'));
    // 5秒ごとに確認。29秒までは結果画面が出てはいけない
    for (let t = 5_000; t <= 25_000; t += 5_000) {
      advance(5_000);
      expect(screen.queryByText('30秒で打った本数')).toBeNull();
    }
    advance(5_500);
    expect(screen.getByText('30秒で打った本数')).toBeTruthy();
  });

  it('打てば本数が増え、結果に反映される', () => {
    const onGameEnd = vi.fn();
    render(<KnockGame onGameEnd={onGameEnd} />);
    fireEvent.click(screen.getByText('30秒スタート'));
    for (let i = 0; i < 20; i++) {
      advance(300);
      swingAtEveryTarget();
    }
    advance(KNOCK_DURATION_MS);
    expect(screen.getByText('30秒で打った本数')).toBeTruthy();
    const r = onGameEnd.mock.calls[0][0];
    expect(r.score).toBe(20); // 20回スイングして20本
    expect(r.maxCombo).toBeGreaterThan(0);
    // 大きい数字と「ベストN本」の2か所に出る
    expect(screen.getAllByText(String(r.score)).length).toBeGreaterThan(0);
    // 「初プレイ」表示＝前回が無い状態で結果が出ている
    expect(screen.getByText('初プレイ')).toBeTruthy();
    expect(screen.getByText('📸 スコア画像をシェア')).toBeTruthy();
  });

  it('結果画面はどこを触ってもすぐ次の30秒が始まる', () => {
    render(<KnockGame />);
    fireEvent.click(screen.getByText('30秒スタート'));
    advance(KNOCK_DURATION_MS + 200);
    const result = screen.getByText('30秒で打った本数');

    // 誤タップ保護（0.25秒）を越えてから触る。要件の0.5秒より短い
    advance(300);
    fireEvent.pointerDown(result.parentElement as HTMLElement);
    expect(screen.queryByText('30秒で打った本数')).toBeNull(); // もう次が始まっている
    advance(KNOCK_DURATION_MS + 200);
    expect(screen.getByText('30秒で打った本数')).toBeTruthy();
  });

  it('シェアボタンを押しても再開しない（背面の「どこでも再開」に飲まれない）', () => {
    render(<KnockGame />);
    fireEvent.click(screen.getByText('30秒スタート'));
    advance(KNOCK_DURATION_MS + 500);
    const share = screen.getByText('📸 スコア画像をシェア');
    fireEvent.pointerDown(share);
    fireEvent.click(share);
    expect(screen.getByText('30秒で打った本数')).toBeTruthy(); // 結果画面のまま
  });

  it('「もう1本いく」を押しても二重に開始しない', () => {
    const onGameStart = vi.fn();
    render(<KnockGame onGameStart={onGameStart} />);
    fireEvent.click(screen.getByText('30秒スタート'));
    expect(onGameStart).toHaveBeenCalledTimes(1);
    advance(KNOCK_DURATION_MS + 500);
    const again = screen.getByText('もう1本いく');
    fireEvent.pointerDown(again);
    fireEvent.click(again);
    expect(onGameStart).toHaveBeenCalledTimes(2);
  });

  it('0本のプレイも親に通知される（0ラリーが記録されていなかったのを直す）', () => {
    const onGameEnd = vi.fn();
    render(<KnockGame onGameEnd={onGameEnd} />);
    fireEvent.click(screen.getByText('30秒スタート'));
    advance(KNOCK_DURATION_MS + 200);
    expect(onGameEnd).toHaveBeenCalledTimes(1);
    expect(onGameEnd.mock.calls[0][0]).toMatchObject({ score: 0 });
  });

  it('結果は1回だけ通知される（二重記録しない）', () => {
    const onGameEnd = vi.fn();
    render(<KnockGame onGameEnd={onGameEnd} />);
    fireEvent.click(screen.getByText('30秒スタート'));
    advance(KNOCK_DURATION_MS + 5_000);
    expect(onGameEnd).toHaveBeenCalledTimes(1);
  });
});

describe('prefers-reduced-motion を尊重する', () => {
  const stubMatchMedia = (reduce: boolean) => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: reduce && q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  };

  it('reduce のときは振動させない', () => {
    const vibrate = vi.fn();
    Object.defineProperty(window.navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    stubMatchMedia(true);

    render(<KnockGame />);
    fireEvent.click(screen.getByText('30秒スタート'));
    for (let i = 0; i < 10; i++) {
      advance(300);
      swingAtEveryTarget();
    }
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('reduce でなければ振動する（対応端末のみ）', () => {
    const vibrate = vi.fn();
    Object.defineProperty(window.navigator, 'vibrate', {
      value: vibrate,
      configurable: true,
    });
    stubMatchMedia(false);

    render(<KnockGame />);
    fireEvent.click(screen.getByText('30秒スタート'));
    for (let i = 0; i < 10; i++) {
      advance(300);
      swingAtEveryTarget();
    }
    expect(vibrate).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(15);
  });
});
