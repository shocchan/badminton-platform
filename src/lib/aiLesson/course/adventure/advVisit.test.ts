// 来た日（visit）と今日のことばの固定。
// ここで守りたいのは主に「嘘をつかない」ほう:
//   - 記録が始まる前の日を「来なかった日」として描かせない
//   - 開いただけの日が、勉強した日（streak）に混ざらない
//   - 同じ日に開き直しても今日のことばが変わらない
import { describe, it, expect } from 'vitest';
import {
  restoreVisit, emptyVisitState, recordVisit, markCardShown, shouldShowCheckin,
  daysAway, visitGreeting, visitStamps, visitedInCard, VISIT_CARD_DAYS,
} from './advVisit';
import { todayProverb, proverbOrdinal, PROVERB_TOTAL } from './advDailyGift';
import { PROVERBS } from './advProverbs';

const st = (days: string[], lastCardKey: string | null = null) => ({ days, lastCardKey });

describe('復元', () => {
  it('壊れた値でも空で返す', () => {
    expect(restoreVisit(null)).toEqual(emptyVisitState());
    expect(restoreVisit('x')).toEqual(emptyVisitState());
    expect(restoreVisit({ days: 'no' })).toEqual(emptyVisitState());
  });

  it('日付でない要素・重複を落として昇順にそろえる', () => {
    const r = restoreVisit({ days: ['2026-09-05', 'x', '2026-09-03', '2026-09-05', 42], lastCardKey: 'bad' });
    expect(r.days).toEqual(['2026-09-03', '2026-09-05']);
    expect(r.lastCardKey).toBeNull();
  });

  it('30日より古い記録は落とす（jsonbを太らせない）', () => {
    const many = Array.from({ length: 40 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`)
      .filter((d) => d <= '2026-07-31');
    expect(restoreVisit({ days: many }).days.length).toBeLessThanOrEqual(30);
  });
});

describe('記録', () => {
  it('同じ日に2回目は書かない（1日1回しか保存が増えない）', () => {
    const s = st(['2026-09-07']);
    expect(recordVisit(s, '2026-09-07')).toBeNull();
  });

  it('新しい日は追加する', () => {
    expect(recordVisit(st(['2026-09-05']), '2026-09-07')?.days)
      .toEqual(['2026-09-05', '2026-09-07']);
  });

  it('おかえりカードは1日1回', () => {
    const s = st(['2026-09-07'], '2026-09-07');
    expect(shouldShowCheckin(s, '2026-09-07')).toBe(false);
    expect(markCardShown(s, '2026-09-07')).toBeNull();
    expect(shouldShowCheckin(s, '2026-09-08')).toBe(true);
  });
});

describe('何日ぶり', () => {
  it('記録が今日しか無ければ言わない（初回に「1日ぶり」と言わせない）', () => {
    expect(daysAway(st(['2026-09-07']), '2026-09-07')).toBeNull();
    expect(visitGreeting(st([]), '2026-09-07').kind).toBe('first');
  });

  it('昨日も来ていれば連日あつかい', () => {
    expect(daysAway(st(['2026-09-06', '2026-09-07']), '2026-09-07')).toBe(1);
    expect(visitGreeting(st(['2026-09-06']), '2026-09-07').kind).toBe('consecutive');
  });

  it('2〜6日は short、7日以上は long', () => {
    expect(visitGreeting(st(['2026-09-04']), '2026-09-07')).toEqual({ kind: 'short', days: 3 });
    expect(visitGreeting(st(['2026-08-24']), '2026-09-07')).toEqual({ kind: 'long', days: 14 });
  });

  it('時計が巻き戻っても何も言わない（未来の記録を無視する）', () => {
    expect(daysAway(st(['2026-09-20']), '2026-09-07')).toBeNull();
  });
});

describe('スタンプ台紙', () => {
  const stamps = visitStamps(st(['2026-09-05', '2026-09-07']), '2026-09-07');

  it('今日を右端に14日ぶん出す', () => {
    expect(stamps).toHaveLength(VISIT_CARD_DAYS);
    expect(stamps.at(-1)).toMatchObject({ dateKey: '2026-09-07', today: true, visited: true });
  });

  it('記録が始まる前の日は「来なかった日」にしない', () => {
    const before = stamps.filter((s) => s.dateKey < '2026-09-05');
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((s) => s.beforeRecords && !s.visited)).toBe(true);
  });

  it('記録開始後の来ていない日は beforeRecords ではない', () => {
    expect(stamps.find((s) => s.dateKey === '2026-09-06'))
      .toMatchObject({ visited: false, beforeRecords: false });
  });

  it('押されたスタンプの数を数える', () => {
    expect(visitedInCard(stamps)).toBe(2);
  });
});

describe('今日のことば', () => {
  it('同じ日・同じ人なら何度呼んでも同じ（引き直せない）', () => {
    const a = todayProverb('2026-09-07', 'learner-1');
    const b = todayProverb('2026-09-07', 'learner-1');
    expect(a.id).toBe(b.id);
  });

  it('日が変われば変わる', () => {
    expect(todayProverb('2026-09-07', 'x').id).not.toBe(todayProverb('2026-09-08', 'x').id);
  });

  it('件数ぶん連続して重複しない（一巡するまで戻らない）', () => {
    const ids = Array.from({ length: PROVERB_TOTAL }, (_, i) => {
      const d = new Date(Date.parse('2026-09-07') + i * 86400000).toISOString().slice(0, 10);
      return todayProverb(d, 'learner-1').id;
    });
    expect(new Set(ids).size).toBe(PROVERB_TOTAL);
  });

  it('日付が壊れていても画面を空にしない', () => {
    expect(todayProverb('こわれた').id).toBe(PROVERBS[0].id);
  });

  it('通し番号は1〜件数に収まる', () => {
    const n = proverbOrdinal('2026-09-07', 'learner-1');
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(PROVERB_TOTAL);
  });
});

describe('ことばの中身（配るものの品質）', () => {
  it('idが重複していない', () => {
    expect(new Set(PROVERBS.map((p) => p.id)).size).toBe(PROVERBS.length);
  });

  it('全件によみ・日本語の意味・中国語の意味・例文がそろっている', () => {
    for (const p of PROVERBS) {
      expect(p.yomi, p.id).toMatch(/^[぀-ゟー]+$/); // よみはひらがなだけ
      expect(p.meaningJa.length, p.id).toBeGreaterThan(5);
      expect(p.meaningZh.length, p.id).toBeGreaterThan(3);
      expect(p.exampleJa, p.id).toContain(p.ja.replace(/[…]/g, '').slice(0, 2));
      expect(p.exampleZh.length, p.id).toBeGreaterThan(3);
    }
  });

  it('中国語の意味に日本語のかなが混ざっていない（訳し忘れを止める）', () => {
    for (const p of PROVERBS) {
      expect(p.meaningZh.replace(/「[^」]*」/g, ''), p.id).not.toMatch(/[぀-ゟ゠-ヿ]/);
    }
  });
});
