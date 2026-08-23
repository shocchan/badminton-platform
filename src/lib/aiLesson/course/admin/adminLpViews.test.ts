// LP閲覧数の集計（2026-08-23）。
// 人数が少ない段階なので、**0を0として見せる**ことがいちばん大事。
import { describe, it, expect } from 'vitest';
import { summarizeLpViews, type LpViewRow } from './adminLpViews';

const TODAY = '2026-08-23';
const row = (over: Partial<LpViewRow> = {}): LpViewRow => ({
  viewedOn: TODAY, path: '/ja/ai-course', lang: 'ja', referrerHost: null, utmSource: null, ...over,
});

describe('まだ誰も来ていないとき', () => {
  const s = summarizeLpViews([], TODAY);
  it('0件を素直に0で返す（空欄・ダッシュでごまかさない）', () => {
    expect(s.last7).toBe(0);
    expect(s.last30).toBe(0);
    expect(s.lastViewedOn).toBeNull();
    expect(s.byPath).toEqual([]);
    expect(s.byReferrer).toEqual([]);
  });
  it('直近14日は、0の日も並ぶ（見られていない日が見えないと状況が読めない）', () => {
    expect(s.daily).toHaveLength(14);
    expect(s.daily.every((d) => d.count === 0)).toBe(true);
    expect(s.daily.at(-1)!.date).toBe(TODAY);
  });
});

describe('期間の切り方', () => {
  const rows = [
    row({ viewedOn: '2026-08-23' }),
    row({ viewedOn: '2026-08-20' }),   // 7日以内
    row({ viewedOn: '2026-08-10' }),   // 30日以内・7日より前
    row({ viewedOn: '2026-07-01' }),   // 30日より前
  ];
  const s = summarizeLpViews(rows, TODAY);
  it('7日と30日を取り違えない', () => {
    expect(s.last7).toBe(2);
    expect(s.last30).toBe(3);
  });
  it('30日より前は数に入れない', () => {
    expect(s.last30).not.toBe(4);
  });
  it('最後に見られた日を返す', () => {
    expect(s.lastViewedOn).toBe('2026-08-23');
  });
});

describe('内訳', () => {
  const s = summarizeLpViews([
    row({ path: '/ja/ai-course' }), row({ path: '/ja/ai-course' }),
    row({ path: '/zh/ai-course', lang: 'zh' }),
    row({ referrerHost: 'www.google.com' }),
    row({ referrerHost: 'www.google.com' }),
    row({ referrerHost: 'x.com' }),
  ], TODAY);

  it('ページ別が多い順に並ぶ', () => {
    expect(s.byPath[0].count).toBeGreaterThanOrEqual(s.byPath[1]?.count ?? 0);
  });
  it('流入元が無いものは「直接／不明」にまとまる（消さない）', () => {
    const direct = s.byReferrer.find((r) => r.host === '直接／不明');
    expect(direct?.count).toBe(3);
  });
  it('流入元が多い順に並ぶ', () => {
    expect(s.byReferrer[0].host).toBe('直接／不明');
    expect(s.byReferrer.find((r) => r.host === 'www.google.com')?.count).toBe(2);
  });
});
