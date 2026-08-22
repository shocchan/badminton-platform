// @vitest-environment jsdom
// 本番更新の瞬間に開いていたタブを真っ白にしない（2026-08-22 CEO質問「利用中の人はどうなる？」）。
//
// 実測（本番）: 直前のビルドの部品は残っていたが、古いものは実際に 404 になっていた。
// 部品の読み込みに失敗すると React は描画を投げる。受け止める人がいないと画面ごと消える。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ChunkReloadBoundary, isChunkLoadError, shouldAutoReload } from './ChunkReloadBoundary';

afterEach(cleanup);

const Boom = ({ message }: { message: string }) => { throw new Error(message); };

/** 描画中の例外は React が console.error に出す。テスト出力を汚さないよう黙らせる */
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};

describe('部品の読み込み失敗の見分け', () => {
  it('ブラウザごとの言い回しを拾う', () => {
    for (const msg of [
      'Failed to fetch dynamically imported module: https://example.com/assets/AdvShell-x.js',
      'error loading dynamically imported module',
      'Loading chunk 42 failed.',
      'Importing a module script failed.',
    ]) expect(isChunkLoadError(new Error(msg)), msg).toBe(true);
  });

  it('ふつうのエラーは対象外', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('自動の読み込み直し', () => {
  it('1回だけ。60秒以内の2回目はやらない（無限ループを作らない）', () => {
    const s = memStorage();
    expect(shouldAutoReload(1_000_000, s)).toBe(true);
    expect(shouldAutoReload(1_000_500, s)).toBe(false);
    expect(shouldAutoReload(1_000_000 + 60_001, s)).toBe(true);
  });

  it('保存が使えない環境では自動でやらない（手動に倒す）', () => {
    expect(shouldAutoReload(1, null)).toBe(false);
  });
});

describe('画面', () => {
  it('部品の失敗: 自動で1回読み込み直す', () => {
    const spy = quiet();
    const onReload = vi.fn();
    render(
      <ChunkReloadBoundary lang="ja" onReload={onReload} storage={memStorage()} now={() => 5_000_000}>
        <Boom message="Failed to fetch dynamically imported module: /assets/AdvShell-old.js" />
      </ChunkReloadBoundary>,
    );
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(screen.getByText('アプリの新しい版が出ています')).toBeTruthy();
    spy.mockRestore();
  });

  it('2回目は自動でやらず、押せるボタンを出す', () => {
    const spy = quiet();
    const onReload = vi.fn();
    const storage = memStorage();
    storage.setItem('aiCourse.chunkReloadedAt', '5000000');
    render(
      <ChunkReloadBoundary lang="ja" onReload={onReload} storage={storage} now={() => 5_000_100}>
        <Boom message="Loading chunk failed" />
      </ChunkReloadBoundary>,
    );
    expect(onReload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '読み込み直す' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('ふつうのエラーは自動で読み込み直さない（文言も変える）', () => {
    const spy = quiet();
    const onReload = vi.fn();
    render(
      <ChunkReloadBoundary lang="ja" onReload={onReload} storage={memStorage()} now={() => 1}>
        <Boom message="Cannot read properties of undefined" />
      </ChunkReloadBoundary>,
    );
    expect(onReload).not.toHaveBeenCalled();
    expect(screen.getByText('この画面を表示できませんでした')).toBeTruthy();
    expect(screen.getByText(/学習の記録は消えません/)).toBeTruthy();
    spy.mockRestore();
  });

  it('中国語でも同じことを言う', () => {
    const spy = quiet();
    render(
      <ChunkReloadBoundary lang="zh" onReload={() => {}} storage={memStorage()} now={() => 1}>
        <Boom message="Failed to fetch dynamically imported module" />
      </ChunkReloadBoundary>,
    );
    expect(screen.getByText('应用有新版本了')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy();
    spy.mockRestore();
  });

  it('何も起きていなければ中身をそのまま出す', () => {
    render(<ChunkReloadBoundary lang="ja"><p>ふつうの画面</p></ChunkReloadBoundary>);
    expect(screen.getByText('ふつうの画面')).toBeTruthy();
  });
});
