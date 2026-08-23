// LP表示カウンタの約束（2026-08-23）。
// ここで守るのは「自分の動作確認で数字が膨らまない」ことと「個人を送らない」こと。
import { describe, it, expect } from 'vitest';
import { shouldRecord, referrerHostOf } from './lpViewBeacon';

const env = (over: Partial<Parameters<typeof shouldRecord>[0]> = {}) =>
  ({ prodHost: true, optedOut: false, webdriver: false, ...over });

describe('数える／数えない', () => {
  it('本番で、除外していない、人が見ているときだけ数える', () => {
    expect(shouldRecord(env())).toBe(true);
  });
  it('自分のブラウザ（?notrack=1）は数えない', () => {
    expect(shouldRecord(env({ optedOut: true }))).toBe(false);
  });
  it('staging・localhost は数えない（本番の数字に混ぜない）', () => {
    expect(shouldRecord(env({ prodHost: false }))).toBe(false);
  });
  it('自動操作は数えない', () => {
    expect(shouldRecord(env({ webdriver: true }))).toBe(false);
  });
});

describe('流入元', () => {
  it('ホスト名だけを取り出す（URL全体・クエリを送らない）', () => {
    expect(referrerHostOf('https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E', 'kawabado.com'))
      .toBe('www.google.com');
  });
  it('同じサイト内の移動は流入ではない', () => {
    expect(referrerHostOf('https://kawabado.com/ja/', 'kawabado.com')).toBeNull();
  });
  it('参照元なし・壊れた値でも落ちない', () => {
    expect(referrerHostOf('', 'kawabado.com')).toBeNull();
    expect(referrerHostOf('ダメな値', 'kawabado.com')).toBeNull();
  });
});
