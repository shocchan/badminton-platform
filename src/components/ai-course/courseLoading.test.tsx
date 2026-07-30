// @vitest-environment jsdom
// Phase B-3: 待ち時間表示の要件を固定する。
// 「componentを作った」ではなく「学習者に対して正しく振る舞う」ことをテストする。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { CourseLoading } from './CourseLoading';
import { aiCourseI18n } from '../../locales/aiCourse';

const ja = aiCourseI18n.ja;
const zh = aiCourseI18n.zh;

afterEach(() => { cleanup(); vi.useRealTimers(); setOnline(true); });
beforeEach(() => { vi.useFakeTimers(); });

const setOnline = (v: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { value: v, configurable: true });
};
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('CourseLoading（Phase B-3）', () => {
  it('200ms未満で終わる処理では何も読み上げない（ちらつき防止）', () => {
    const { container } = render(<CourseLoading t={ja} />);
    advance(150);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('待っている間もレイアウトは動かない（先に高さを確保している）', () => {
    const { container } = render(<CourseLoading t={ja} minHeightClass="min-h-[96px]" />);
    const before = container.firstElementChild as HTMLElement;
    expect(before.className).toContain('min-h-[96px]');
    expect(before.getAttribute('aria-hidden')).toBe('true');   // 未表示中は支援技術にも出さない
    advance(250);
    const after = container.firstElementChild as HTMLElement;
    expect(after.className).toContain('min-h-[96px]');         // 表示後も同じ高さ
  });

  it('200msを超えたら role=status / aria-live で処理中だと分かる', () => {
    const { container } = render(<CourseLoading t={ja} scene="mist" />);
    advance(250);
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status!.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText(ja.common.loadingMist)).toBeTruthy();
  });

  it('中国語表示では中国語で読み上げる（日本語が混ざらない）', () => {
    render(<CourseLoading t={zh} scene="grains" />);
    advance(250);
    expect(screen.getByText(zh.common.loadingGrains)).toBeTruthy();
    expect(document.body.textContent).not.toContain(ja.common.loadingGrains);
  });

  it('場面ごとに文言が変わる（全部同じ「読み込み中」にしない）', () => {
    const seen = new Set<string>();
    for (const scene of ['mist', 'grains', 'map', 'step'] as const) {
      cleanup();
      render(<CourseLoading t={ja} scene={scene} />);
      advance(250);
      seen.add(screen.getByRole('status').textContent!.trim());
    }
    expect(seen.size).toBe(4);
  });

  it('時間がかかりすぎたら、そう言って学習者に打つ手を出す', () => {
    render(<CourseLoading t={ja} timeoutMs={5000} />);
    advance(250);
    expect(screen.queryByRole('button')).toBeNull();
    advance(5000);
    expect(screen.getByText(ja.common.loadingSlow)).toBeTruthy();
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('やり直せる処理では再読み込みではなく「もう一度」を出し、実際に呼ぶ', () => {
    const onRetry = vi.fn();
    render(<CourseLoading t={ja} timeoutMs={3000} onRetry={onRetry} />);
    advance(3300);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toBe(ja.common.retry);
    act(() => { btn.click(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('オフラインなら「読み込み中」と嘘をつかず、オフラインだと伝える（待たずに即座に）', () => {
    setOnline(false);
    render(<CourseLoading t={ja} />);
    // delay前でもオフラインは隠さない
    expect(screen.getByText(ja.common.loadingOffline)).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('オフライン中も中国語で伝える', () => {
    setOnline(false);
    render(<CourseLoading t={zh} />);
    expect(screen.getByText(zh.common.loadingOffline)).toBeTruthy();
  });

  it('回線が戻れば通常の待ち表示に戻る', () => {
    setOnline(false);
    render(<CourseLoading t={ja} scene="map" />);
    expect(screen.getByText(ja.common.loadingOffline)).toBeTruthy();
    setOnline(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    advance(250);
    expect(screen.getByText(ja.common.loadingMap)).toBeTruthy();
  });

  it('reduced motionで止まるように、アニメはmotion-safe:限定にしている', () => {
    for (const scene of ['mist', 'grains', 'map', 'step'] as const) {
      cleanup();
      const { container } = render(<CourseLoading t={ja} scene={scene} />);
      advance(250);
      const animated = [...container.querySelectorAll('[class*="animate-"]')];
      expect(animated.length).toBeGreaterThan(0);
      for (const el of animated) {
        // 「animate-」が motion-safe: を伴わずに使われていないこと
        expect(el.className).not.toMatch(/(^|\s)animate-/);
      }
    }
  });

  it('演出そのものは支援技術に読ませない（状態は文言だけで伝える）', () => {
    const { container } = render(<CourseLoading t={ja} scene="grains" />);
    advance(250);
    const status = container.querySelector('[role="status"]')!;
    // status配下の装飾要素はaria-hidden
    for (const el of status.querySelectorAll('span[class*="rounded-full"], div[class*="rounded-full"]')) {
      expect(el.closest('[aria-hidden="true"]')).toBeTruthy();
    }
    expect(status.textContent!.trim()).toBe(ja.common.loadingGrains);
  });

  it('処理が終わって消えたあとは、同じ状態を読み上げ続けない', () => {
    const { container, rerender } = render(<div><CourseLoading t={ja} /></div>);
    advance(250);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    rerender(<div />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('unmount後にタイマーが状態更新しない（警告・リークを出さない）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<CourseLoading t={ja} timeoutMs={1000} />);
    unmount();
    advance(3000);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
