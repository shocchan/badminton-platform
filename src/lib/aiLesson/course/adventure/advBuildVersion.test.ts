// 「開いたままのタブが古いJSで動き続ける」検知のテスト。2026-08-17。
//
// 実際に起きた事故: 「開いた瞬間に完了になる」不具合を直して本番へ出したのに、
// CEOの画面では直っていなかった。配信物は新しく、タブが古いchunkを保持していた。
// 直したはずの修正が届いていないことを、こちらから知る術がなかった。
import { describe, it, expect } from 'vitest';
import { runningBuildId, checkBuildVersion } from './advBuildVersion';

const docWith = (srcs: string[]): Document => ({
  querySelectorAll: () => srcs.map((src) => ({ getAttribute: () => src })),
} as unknown as Document);

const fetchOf = (body: unknown, ok = true): typeof fetch =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('実行中のビルドを名乗る', () => {
  it('読み込んだ index chunk のハッシュを拾う', () => {
    expect(runningBuildId(docWith(['/assets/vendor-x1.js', '/assets/index-BEk2w77H.js']))).toBe('BEk2w77H');
  });
  it('分からなければ null（推測しない）', () => {
    expect(runningBuildId(docWith(['/assets/vendor-x1.js']))).toBeNull();
  });
});

describe('配信中のビルドと比べる', () => {
  it('違えば stale', async () => {
    const v = await checkBuildVersion(fetchOf({ build: 'NEW12345' }), docWith(['/assets/index-OLD00000.js']));
    expect(v).toEqual({ running: 'OLD00000', latest: 'NEW12345', stale: true });
  });

  it('同じなら stale にしない', async () => {
    const v = await checkBuildVersion(fetchOf({ build: 'SAME1111' }), docWith(['/assets/index-SAME1111.js']));
    expect(v.stale).toBe(false);
  });

  it('**取得に失敗しても知らせない**（分からないのに「古い」と言わない）', async () => {
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const v = await checkBuildVersion(boom, docWith(['/assets/index-OLD00000.js']));
    expect(v).toEqual({ running: 'OLD00000', latest: null, stale: false });
  });

  it('version.json が壊れていても投げない', async () => {
    const v = await checkBuildVersion(fetchOf({ build: 123 }), docWith(['/assets/index-OLD00000.js']));
    expect(v.stale).toBe(false);
  });

  it('自分のビルドが分からなければ知らせない', async () => {
    const v = await checkBuildVersion(fetchOf({ build: 'NEW12345' }), docWith([]));
    expect(v.stale).toBe(false);
  });
});
