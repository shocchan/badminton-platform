// 販売LPの閲覧数の集計（2026-08-23 CEO依頼）。
//
// **表示は純関数、I/Oは adminLpViewsApi**（原則13。buildKpis / buildCourseFunnel と同じ流儀）。
//
// この数字の性格を、画面にもここにも書いておく:
//   自前のカウンタなので、GA のような bot 除外はしていない。1ブラウザ1日1回だけ数え、
//   自分（?notrack=1）と本番以外のドメインは除いている。**目安の数字**として読む。

export interface LpViewRow {
  viewedOn: string;          // YYYY-MM-DD（JST）
  path: string;
  lang: string;
  referrerHost: string | null;
  utmSource: string | null;
}

export interface LpViewSummary {
  /** 直近7日・30日の表示数（1ブラウザ1日1回） */
  last7: number;
  last30: number;
  /** 表示があった日数（直近30日） */
  daysWithViews: number;
  /** 直近30日でいちばん新しい表示日。無ければ null */
  lastViewedOn: string | null;
  /** ページ別（多い順） */
  byPath: { path: string; count: number }[];
  /** 流入元別（多い順）。null は「直接／不明」にまとめる */
  byReferrer: { host: string; count: number }[];
  /** 日別（古い順・直近14日）。小さなグラフ用 */
  daily: { date: string; count: number }[];
}

const daysBetween = (fromISO: string, toISO: string): number =>
  Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);

const rank = <T extends string>(pairs: Map<T, number>): { key: T; count: number }[] =>
  [...pairs.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key));

/** todayKey は JST の YYYY-MM-DD。呼び出し側から渡す（時刻を関数の中で作らない） */
export const summarizeLpViews = (rows: LpViewRow[], todayKey: string): LpViewSummary => {
  const within = (r: LpViewRow, days: number) => {
    const d = daysBetween(r.viewedOn, todayKey);
    return d >= 0 && d < days;
  };
  const in30 = rows.filter((r) => within(r, 30));

  const byPath = new Map<string, number>();
  const byRef = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const r of in30) {
    byPath.set(r.path, (byPath.get(r.path) ?? 0) + 1);
    const host = r.referrerHost ?? '直接／不明';
    byRef.set(host, (byRef.get(host) ?? 0) + 1);
    byDay.set(r.viewedOn, (byDay.get(r.viewedOn) ?? 0) + 1);
  }

  // 直近14日は、表示が0の日も並べる（「見られていない日」が見えないと状況が読めない）
  const daily: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const t = new Date(`${todayKey}T00:00:00Z`).getTime() - i * 86_400_000;
    const date = new Date(t).toISOString().slice(0, 10);
    daily.push({ date, count: byDay.get(date) ?? 0 });
  }

  return {
    last7: rows.filter((r) => within(r, 7)).length,
    last30: in30.length,
    daysWithViews: byDay.size,
    lastViewedOn: in30.length
      ? in30.map((r) => r.viewedOn).sort().at(-1) ?? null
      : null,
    byPath: rank(byPath).map(({ key, count }) => ({ path: key, count })),
    byReferrer: rank(byRef).map(({ key, count }) => ({ host: key, count })),
    daily,
  };
};
