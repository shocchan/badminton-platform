// @vitest-environment jsdom
/*
 * ブラウザの戻るでアプリごと出ていかない（2026-09-10 CEO報告）。
 * 個人専用URLから来た人はタブの履歴が1件しかないので、戻るで**タブごと閉じて**いた。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useExitGuard } from './useExitGuard';

const Probe = ({ atHome, onBack }: { atHome: boolean; onBack: () => void }) => {
  useExitGuard({ atHome, onBack });
  return null;
};

let pushSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { pushSpy = vi.spyOn(window.history, 'pushState'); });
afterEach(() => { cleanup(); pushSpy.mockRestore(); });

const popstate = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

describe('useExitGuard', () => {
  it('ホームでは履歴を積まない（本当に出たい人を邪魔しない）', () => {
    render(<Probe atHome onBack={() => {}} />);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('ホーム以外に入ったら履歴を1つ積む', () => {
    render(<Probe atHome={false} onBack={() => {}} />);
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it('**戻るでアプリを出ずにホームへ戻る**', () => {
    const onBack = vi.fn();
    render(<Probe atHome={false} onBack={onBack} />);
    popstate();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ホームに戻ったら購読を外す（ホームでの戻るは本当に戻る）', () => {
    const onBack = vi.fn();
    const { rerender } = render(<Probe atHome={false} onBack={onBack} />);
    rerender(<Probe atHome onBack={onBack} />);
    popstate();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('**onBackが作り直されても履歴を積み直さない**（1回の戻るで1段しか戻らない事故を防ぐ）', () => {
    const { rerender } = render(<Probe atHome={false} onBack={() => {}} />);
    rerender(<Probe atHome={false} onBack={() => {}} />);
    rerender(<Probe atHome={false} onBack={() => {}} />);
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it('最新の onBack が呼ばれる（古い閉包を掴んだままにしない）', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Probe atHome={false} onBack={first} />);
    rerender(<Probe atHome={false} onBack={latest} />);
    popstate();
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
