// advReviewForecast（復習予報・渋滞レスキュー・新規負荷ガバナー）の受入テスト。
//
// いちばん守りたいこと:
// 1. **件数は実測だけ**（原則13）。mastery台帳に無いものを予報に出さない。
//    「まだ7日待ち」を今日の件数に混ぜない／解禁済みを見落とさない
// 2. **advMastery の classifyPendingDelay と完全に同じ集合**を見ていること。
//    予報だけ別基準になると「予報では0件なのに確認バトルが出る」行き止まりが生まれる
// 3. **所要時間は推定と分かる形**でしか出さない。文言に「約」と「推定 / 估算」が入る
// 4. **責めない文言**。「溜まっています」「遅れています」系の語を1つも出さない（煽り禁止）
// 5. **レスキューは全件を必ずどこかの日へ配る**（取りこぼし＝確認が永久に来ない行き止まり）
// 6. **渋滞中でも新規はゼロにしない**（reduce 止まり）。復習で1日が埋まる離脱パターンを作らない
// 7. 日付キーは実行環境のTZに依存しない（JST基準で固定）
import { describe, it, expect } from 'vitest';
import {
  buildReviewForecast, collectPendingConfirms, buildForecastDays, detectCongestion,
  planRescue, decideNewLoad, dateKeyOf, addDayKey, estimateMinutes, reviewBudgetMinutes,
  CONGESTION_RULES, RESCUE_RULES, NEW_LOAD_RULES, FORECAST_DAYS,
  MINUTES_PER_CONFIRM_BATTLE, MINUTES_PER_DUE_REVIEW_ITEM,
} from './advReviewForecast';
import { classifyPendingDelay, MASTERY_RULES } from './advMastery';
import type { AdvMasteryAttempt, AdvMasteryLedger } from './advTypes';

const NOW = '2026-08-17T03:00:00.000Z'; // JST 12:00
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): string => new Date(Date.parse(NOW) - n * DAY).toISOString();
const jstKey = (iso: string): string => dateKeyOf(iso, 'Asia/Tokyo');

const attempt = (completedAt: string, scorePct = 90): AdvMasteryAttempt => ({
  dateKey: jstKey(completedAt),
  scorePct,
  unseenRatio: 1,
  questionKeys: ['rec:a', 'cloze:b', 'meaning:c', 'form:d', 'rec:e'],
  tier: 'normal',
  timed: false,
  completedAt,
});

/**
 * 「別日3回80%」まで到達し、遅延確認だけが残っている台帳を作る。
 * 3日目の完了から MASTERY_RULES.delayDays 後に確認が解禁されるので、
 * opensInDays（負なら期限超過）で解禁タイミングを自由に置ける。
 */
const pendingAttempts = (opensInDays: number): AdvMasteryAttempt[] => {
  // 3日目の完了時刻 = 今 - (delayDays - opensInDays) 日
  const thirdDayAgo = MASTERY_RULES.delayDays - opensInDays;
  return [
    attempt(daysAgo(thirdDayAgo + 2)),
    attempt(daysAgo(thirdDayAgo + 1)),
    attempt(daysAgo(thirdDayAgo)),
  ];
};

const ledgerOf = (spec: Record<string, number>): AdvMasteryLedger =>
  Object.fromEntries(Object.entries(spec).map(([id, d]) => [id, pendingAttempts(d)]));

/** n件すべてが期限超過の指定（他の解禁予定と混ぜられるように spec を返す） */
const overdueSpec = (n: number): Record<string, number> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${String(i).padStart(2, '0')}`, -(i + 1)]));

/** 何日ぶん溜まっているか（すべて期限超過）の台帳 */
const overdueLedger = (n: number): AdvMasteryLedger => ledgerOf(overdueSpec(n));

/** 今日じゅう（JST 18:00）に解禁されるぶんを1件足した台帳 */
const withSameDayUnlock = (n: number): AdvMasteryLedger => ledgerOf({ ...overdueSpec(n), sameDay: 0.25 });

/** 要約文から数字を取り出す（要約と他の欄が食い違っていないかを突き合わせるため） */
const numIn = (text: string, re: RegExp): number | null => {
  const m = text.match(re);
  return m ? Number(m[1]) : null;
};
const summaryNumbers = (ja: string, zh: string) => ({
  jaConfirm: numIn(ja, /確認バトル(\d+)件/),
  jaDue: numIn(ja, /復習(\d+)件/),
  jaMinutes: numIn(ja, /約(\d+)分の見込み/),
  zhConfirm: numIn(zh, /(\d+)场复查战/),
  zhDue: numIn(zh, /(\d+)项复习/),
  zhMinutes: numIn(zh, /大约(\d+)分钟/),
});

// ────────────────────────────── 1 & 2: 実測だけ・既存判定と一致 ──────────────────────────────

describe('collectPendingConfirms: 実測（mastery台帳）だけを見る', () => {
  it('遅延確認待ちでない target は1件も拾わない（存在しないデータを作らない）', () => {
    const ledger: AdvMasteryLedger = {
      notStarted: [],
      inProgress: [attempt(daysAgo(1))],                       // 別日1回だけ＝in_progress
      lowScore: [attempt(daysAgo(3), 50), attempt(daysAgo(2), 50), attempt(daysAgo(1), 50)],
    };
    expect(collectPendingConfirms(ledger, NOW)).toEqual([]);
  });

  it('classifyPendingDelay の waiting / confirmReady とまったく同じ集合になる', () => {
    const ledger = ledgerOf({ ready1: -3, ready2: -1, waiting1: 2, waiting2: 6 });
    const legacy = classifyPendingDelay(ledger, NOW);
    const pending = collectPendingConfirms(ledger, NOW);

    const ready = new Set(pending.filter((p) => p.ready).map((p) => p.targetId));
    const waiting = new Set(pending.filter((p) => !p.ready).map((p) => p.targetId));
    expect([...ready].sort()).toEqual([...legacy.confirmReady].sort());
    expect([...waiting].sort()).toEqual([...legacy.waiting].sort());
  });

  it('解禁が古い順に並ぶ（いちばん忘れかけている確認から先に配れるように）', () => {
    const pending = collectPendingConfirms(ledgerOf({ newest: -1, oldest: -5, middle: -3 }), NOW);
    expect(pending.map((p) => p.targetId)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('呼び出し側が確認バトルの対象を絞っているなら、予報も同じ絞り込みに従う', () => {
    // AdvShell は confirmTargetIds から reading- / listening- / mock 系を除外している。
    // 除外分を数えると「予報12件・実際8件」の嘘になるので、フィルタは予報にも効かせる
    const ledger = ledgerOf({ 'n3-u1': -1, 'reading-a': -1, 'listening-b': -1, 'mock-c': -1 });
    const filter = (id: string) => !/^(reading-|listening-|mock)/.test(id);
    expect(collectPendingConfirms(ledger, NOW).length).toBe(4);
    expect(collectPendingConfirms(ledger, NOW, 'Asia/Tokyo', filter).map((p) => p.targetId)).toEqual(['n3-u1']);

    const f = buildReviewForecast({ ledger, nowISO: NOW, includeTargetId: filter });
    expect(f.today.count).toBe(1);
    expect(f.byDay[0].targetIds).toEqual(['n3-u1']);
  });

  it('壊れた台帳（配列でない値）でも落ちない', () => {
    const broken = { t1: undefined, t2: null, t3: 'x' } as unknown as AdvMasteryLedger;
    expect(() => collectPendingConfirms(broken, NOW)).not.toThrow();
    expect(collectPendingConfirms(broken, NOW)).toEqual([]);
  });

  it('1件の壊れた記録（completedAt が日付として読めない）で予報まるごとを落とさない', () => {
    // computeMastery は completedAt を日付として扱うため、壊れた値だと解禁日時の計算で投げる。
    // 台帳を全周する予報が道連れで落ちると、無事なtargetの予報まで画面から消える
    const broken: AdvMasteryLedger = {
      ...ledgerOf({ healthy: -1 }),
      damaged: pendingAttempts(-1).map((a, i) => (i === 2 ? { ...a, completedAt: 'not-a-date' } : a)),
    };
    expect(() => collectPendingConfirms(broken, NOW)).not.toThrow();
    expect(collectPendingConfirms(broken, NOW).map((p) => p.targetId)).toEqual(['healthy']);

    const f = buildReviewForecast({ ledger: broken, nowISO: NOW });
    expect(f.today.count).toBe(1);
    expect(f.byDay[0].targetIds).toEqual(['healthy']);
  });
});

describe('予報: 今日・明日・今週', () => {
  it('期限超過は今日の欄へ畳み込み、まだ7日待ちのものは解禁日の欄に入れる', () => {
    const f = buildReviewForecast({ ledger: ledgerOf({ over1: -2, over2: -1, tmr: 1, d3: 3 }), nowISO: NOW });
    expect(f.overdue.count).toBe(2);
    expect(f.today.count).toBe(2);          // 期限超過2件（今日解禁は無し）
    expect(f.tomorrow.count).toBe(1);
    expect(f.week.count).toBe(4);
    expect(f.byDay).toHaveLength(FORECAST_DAYS);
    expect(f.byDay[0].dateKey).toBe(f.todayKey);
    expect(f.byDay[3].targetIds).toEqual(['d3']);
  });

  it('今日じゅうに解禁されるもの（まだ ready でない）も今日の件数に入る', () => {
    // JST 12:00 時点で「今日の18:00に解禁」= まだ waiting だが予報上は今日ぶん
    const ledger = ledgerOf({ later: 0.25 });
    const pending = collectPendingConfirms(ledger, NOW);
    expect(pending[0].ready).toBe(false);
    expect(pending[0].opensDateKey).toBe(jstKey(NOW));
    const f = buildReviewForecast({ ledger, nowISO: NOW });
    expect(f.today.count).toBe(1);
    expect(f.overdue.count).toBe(0); // 「期限超過」ではない＝内数はゼロ
  });

  it('8日目以降に解禁されるものは今週に含めず laterCount で正直に返す', () => {
    const f = buildReviewForecast({ ledger: ledgerOf({ soon: 2, far: 10 }), nowISO: NOW });
    expect(f.week.count).toBe(1);
    expect(f.laterCount).toBe(1);
    expect(f.byDay.every((d) => !d.targetIds.includes('far'))).toBe(true);
  });

  it('台帳が空なら全部0（推測で埋めない）', () => {
    const f = buildReviewForecast({ ledger: {}, nowISO: NOW });
    expect(f.today).toEqual({ count: 0, estimatedMinutes: 0 });
    expect(f.week.count).toBe(0);
    expect(f.laterCount).toBe(0);
    expect(f.rescue).toBeNull();
  });
});

// ────────────────────────────── 3: 所要時間は「推定」 ──────────────────────────────

describe('所要時間の目安（推定であることを隠さない）', () => {
  it('件数×定数で出す。0件のときだけ0分、1件以上は最低1分', () => {
    expect(estimateMinutes(0, MINUTES_PER_CONFIRM_BATTLE)).toBe(0);
    expect(estimateMinutes(3, MINUTES_PER_CONFIRM_BATTLE)).toBe(3 * MINUTES_PER_CONFIRM_BATTLE);
    expect(estimateMinutes(1, MINUTES_PER_DUE_REVIEW_ITEM)).toBe(1); // 0.5分でも「0分」とは言わない
    expect(estimateMinutes(10, MINUTES_PER_DUE_REVIEW_ITEM)).toBe(5);
  });

  it('期限ベース復習（dueCount）の分も今日の合計に足す', () => {
    const f = buildReviewForecast({ ledger: ledgerOf({ a: -1 }), nowISO: NOW, dueCount: 8 });
    expect(f.dueCount).toBe(8);
    expect(f.todayTotalEstimatedMinutes).toBe(MINUTES_PER_CONFIRM_BATTLE + 4); // 4分 + 8語×0.5分
  });

  it('文言に「約」と「推定 / 估算」が入る（実測の所要と誤解させない）', () => {
    const f = buildReviewForecast({ ledger: ledgerOf({ a: -1, b: -2 }), nowISO: NOW });
    expect(f.summaryJa).toContain('約');
    expect(f.summaryJa).toContain('推定');
    expect(f.summaryZh).toContain('大约');
    expect(f.summaryZh).toContain('估算');
  });

  it('確認バトルと期限ベース復習を1つの件数に合算しない（何が何件か読めなくなるため）', () => {
    const f = buildReviewForecast({ ledger: ledgerOf({ a: -1, b: -2 }), nowISO: NOW, dueCount: 6 });
    expect(f.summaryJa).toBe('今日は確認バトル2件と復習6件、約11分の見込みです（推定）');
    expect(f.summaryZh).toBe('今天有2场复查战和6项复习，大约11分钟（估算）');
    expect(f.summaryJa).not.toContain('8件'); // 2+6 を足した数を出さない
  });

  it('片方が0件のときはその項目を出さない（0件と書かない）', () => {
    const onlyDue = buildReviewForecast({ ledger: {}, nowISO: NOW, dueCount: 6 });
    expect(onlyDue.summaryJa).toBe('今日は復習6件、約3分の見込みです（推定）');
    const onlyConfirm = buildReviewForecast({ ledger: ledgerOf({ a: -1 }), nowISO: NOW });
    expect(onlyConfirm.summaryJa).toBe('今日は確認バトル1件、約4分の見込みです（推定）');
  });

  it('やることが無い日は所要を語らない（0分と書かない）', () => {
    const f = buildReviewForecast({ ledger: ledgerOf({ far: 5 }), nowISO: NOW });
    expect(f.summaryJa).toBe('今日の復習はありません');
    expect(f.summaryJa).not.toContain('分');
    expect(f.summaryZh).not.toContain('分钟');
  });

  it('明日ぶんがあるときは「今日は無し・明日は◯件」まで見せる（不意打ちにしない）', () => {
    const f = buildReviewForecast({ ledger: ledgerOf({ tmr: 1 }), nowISO: NOW });
    expect(f.summaryJa).toBe('今日の復習はありません。明日は確認バトルが1件あります');
    expect(f.summaryZh).toBe('今天没有要复习的。明天有1场复查战');
  });

  it('件数には必ず名詞が付く（「今日は2件」が何の2件か読めない状態にしない）', () => {
    const cases: AdvMasteryLedger[] = [
      ledgerOf({ a: -1 }),            // 渋滞なし
      overdueLedger(14),              // 渋滞
      withSameDayUnlock(6),           // 渋滞＋同日解禁
    ];
    for (const ledger of cases) {
      const f = buildReviewForecast({ ledger, nowISO: NOW, dueCount: 6, dailyMinutes: 15 });
      // 「今日は<数字>件」「今天是<数字>项」のような裸の件数を出さない
      expect(f.summaryJa).not.toMatch(/今日は\d+件/);
      expect(f.summaryZh).not.toMatch(/今天是\d+/);
      expect(f.summaryJa).toMatch(/確認バトル\d+件/);
      expect(f.summaryZh).toMatch(/\d+场复查战/);
    }
  });
});

// ────────── 【最重要】要約と他の欄で数字が食い違わない（渋滞パスを含む） ──────────

describe('要約の不変条件: 同じ画面に別の数字を並べない', () => {
  /** 渋滞・同日解禁・期限ベース復習の有無を掛け合わせた表（渋滞×dueCount>0×同日解禁が抜けていた） */
  const CASES: { label: string; ledger: AdvMasteryLedger; dueCount: number; dailyMinutes: 5 | 15 | 30 | null; congested: boolean }[] = [
    { label: '渋滞なし・確認だけ', ledger: ledgerOf({ a: -1 }), dueCount: 0, dailyMinutes: 15, congested: false },
    { label: '渋滞なし・確認＋期限復習', ledger: ledgerOf({ a: -1, b: -2 }), dueCount: 6, dailyMinutes: 15, congested: false },
    { label: '渋滞・期限復習あり', ledger: overdueLedger(6), dueCount: 30, dailyMinutes: 15, congested: true },
    { label: '渋滞・同日解禁あり', ledger: withSameDayUnlock(6), dueCount: 0, dailyMinutes: 15, congested: true },
    { label: '渋滞・同日解禁＋期限復習', ledger: withSameDayUnlock(6), dueCount: 30, dailyMinutes: 15, congested: true },
    { label: '渋滞・5分コース', ledger: overdueLedger(5), dueCount: 4, dailyMinutes: 5, congested: true },
    { label: '渋滞・大量＋30分コース', ledger: overdueLedger(40), dueCount: 12, dailyMinutes: 30, congested: true },
    { label: '期限復習だけ', ledger: {}, dueCount: 20, dailyMinutes: 15, congested: false },
  ];

  it.each(CASES)('$label: 要約の分数 === todayTotalEstimatedMinutes（newLoad と同じ数字）', (c) => {
    const f = buildReviewForecast({ ledger: c.ledger, nowISO: NOW, dueCount: c.dueCount, dailyMinutes: c.dailyMinutes });
    expect(f.congestion.congested).toBe(c.congested);
    const n = summaryNumbers(f.summaryJa, f.summaryZh);
    expect(n.jaMinutes).toBe(f.todayTotalEstimatedMinutes);
    expect(n.zhMinutes).toBe(f.todayTotalEstimatedMinutes);
    // 新規負荷の文言も同じ分数から作られている（画面に 8分 と 23分 が並ばない）
    expect(f.newLoad.todayReviewMinutes).toBe(f.todayTotalEstimatedMinutes);
  });

  it.each(CASES)('$label: 要約の件数 === 今日じっさいに出す件数（確認バトル・期限復習とも）', (c) => {
    const f = buildReviewForecast({ ledger: c.ledger, nowISO: NOW, dueCount: c.dueCount, dailyMinutes: c.dailyMinutes });
    // 今日出す確認バトル = レスキュー後の期限超過ぶん ＋ 今日じゅうに自然解禁されるぶん
    const sameDayUnlock = f.today.count - f.overdue.count;
    const expected = f.rescue ? f.rescue.todayCount + sameDayUnlock : f.today.count;
    expect(f.todayConfirmCount).toBe(expected);

    const n = summaryNumbers(f.summaryJa, f.summaryZh);
    expect(n.jaConfirm).toBe(f.todayConfirmCount > 0 ? f.todayConfirmCount : null);
    expect(n.zhConfirm).toBe(f.todayConfirmCount > 0 ? f.todayConfirmCount : null);
    // 期限ベース復習（アプリ側で分散できないぶん）を渋滞時に要約から落とさない
    expect(n.jaDue).toBe(c.dueCount > 0 ? c.dueCount : null);
    expect(n.zhDue).toBe(c.dueCount > 0 ? c.dueCount : null);
  });

  it.each(CASES)('$label: 合計分は 件数×定数 の積み上げと一致する（数字を作らない）', (c) => {
    const f = buildReviewForecast({ ledger: c.ledger, nowISO: NOW, dueCount: c.dueCount, dailyMinutes: c.dailyMinutes });
    expect(f.todayTotalEstimatedMinutes).toBe(
      estimateMinutes(f.todayConfirmCount, MINUTES_PER_CONFIRM_BATTLE)
      + estimateMinutes(f.dueCount, MINUTES_PER_DUE_REVIEW_ITEM),
    );
  });

  it('【再発防止】渋滞×期限復習30件: 要約と新規負荷が同じ23分を語る', () => {
    // 修正前は要約が rescue.notice をそのまま返し「今日は2件・約8分」、
    // 同じ画面の newLoad が「約23分」と言っていた（語彙復習30件が要約から消えていた）
    const f = buildReviewForecast({ ledger: overdueLedger(6), nowISO: NOW, dueCount: 30, dailyMinutes: 15 });
    expect(f.summaryJa).toBe('今日のぶんに振り分けました。今日は確認バトル2件と復習30件、約23分の見込みです（推定）。のこりの確認バトルは2日に分けています');
    expect(f.summaryZh).toBe('今天的份量已经分好了。今天有2场复查战和30项复习，大约23分钟（估算）。剩下的复查战已分到之后的2天');
    expect(f.newLoad.reasonJa).toContain('約23分');
  });

  it('【再発防止】渋滞×同日解禁: 今日じゅうに解禁されるぶんも要約に入る', () => {
    // 修正前は rescue.todayCount（期限超過の分散ぶん）しか語らず、同日解禁ぶんが消えていた
    const f = buildReviewForecast({ ledger: withSameDayUnlock(6), nowISO: NOW, dailyMinutes: 15 });
    expect(f.today.count).toBe(7);
    expect(f.overdue.count).toBe(6);
    expect(f.todayConfirmCount).toBe(f.rescue!.todayCount + 1);
    expect(f.summaryJa).toContain(`確認バトル${f.todayConfirmCount}件`);
    expect(f.summaryJa).toContain(`約${f.todayTotalEstimatedMinutes}分`);
  });
});

// ────────────────────────────── 4: 責めない文言 ──────────────────────────────

describe('文言: 責めない・煽らない（原則21）', () => {
  /** 使ってはいけない語（喪失恐怖・非難・危機を煽る系） */
  const BANNED = [
    '溜ま', 'たまって', '遅れ', 'サボ', '放置', '失敗', '危険', 'まずい', '警告', '減ります', '失います',
    '堆积', '积压', '落后', '危险', '失败', '警告', '会失去', '扣',
  ];
  const allTexts = (ledger: AdvMasteryLedger, dueCount = 0): string[] => {
    const f = buildReviewForecast({ ledger, nowISO: NOW, dueCount });
    return [
      f.summaryJa, f.summaryZh, f.newLoad.reasonJa, f.newLoad.reasonZh,
      f.rescue?.noticeJa ?? '', f.rescue?.noticeZh ?? '',
    ];
  };

  it('渋滞していてもいなくても、禁止語を1つも出さない', () => {
    const cases: [string, AdvMasteryLedger, number][] = [
      ['空', {}, 0],
      ['少しあり', ledgerOf({ a: -1, b: 1 }), 3],
      ['渋滞', overdueLedger(14), 0],
      ['大量に渋滞', overdueLedger(40), 0],
      ['期限復習が多い', ledgerOf({ a: -1 }), 60],
    ];
    // 違反があれば「どのケースのどの語がどの文に出たか」が読める形で落とす
    const hits = cases.flatMap(([label, ledger, due]) =>
      allTexts(ledger, due).flatMap((text) =>
        BANNED.filter((w) => text.includes(w)).map((w) => `${label}: 「${w}」→「${text}」`)));
    expect(hits).toEqual([]);
  });

  it('渋滞時の要約は「振り分けました。今日は確認バトル◯件、約◯分」の形（責任追及をしない）', () => {
    const f = buildReviewForecast({ ledger: overdueLedger(14), nowISO: NOW });
    expect(f.congestion.congested).toBe(true);
    expect(f.summaryJa).toContain('今日のぶんに振り分けました');
    expect(f.summaryJa).toMatch(/今日は確認バトル\d+件、約\d+分の見込みです（推定）/);
    expect(f.summaryZh).toContain('今天的份量已经分好了');
  });

  it('ja / zh の両方を必ず返す（片方だけ空にしない）', () => {
    for (const ledger of [{}, ledgerOf({ a: -1 }), overdueLedger(14)]) {
      const f = buildReviewForecast({ ledger, nowISO: NOW });
      expect(f.summaryJa.length).toBeGreaterThan(0);
      expect(f.summaryZh.length).toBeGreaterThan(0);
      expect(f.newLoad.reasonJa.length).toBeGreaterThan(0);
      expect(f.newLoad.reasonZh.length).toBeGreaterThan(0);
    }
  });
});

// ────────────────────────────── 渋滞の検知 ──────────────────────────────

describe('渋滞の検知: その人の「今日の復習予算」を超えたかで判定する', () => {
  it('予算はコース時間から導く（判定と分散が同じ式を使う）', () => {
    expect(reviewBudgetMinutes(15)).toBe(15 * RESCUE_RULES.reviewShare);
    expect(reviewBudgetMinutes(null)).toBe(RESCUE_RULES.defaultDailyMinutes * RESCUE_RULES.reviewShare);
    expect(reviewBudgetMinutes(undefined)).toBe(reviewBudgetMinutes(null));
  });

  it('予算内なら渋滞ではない', () => {
    const c = detectCongestion(1, 15);
    expect(c.congested).toBe(false);
    expect(c.reasons).toEqual([]);
    expect(c.budgetMinutes).toBe(reviewBudgetMinutes(15));
  });

  it('予算ちょうどまでは渋滞にしない・超えたら渋滞（境界を固定）', () => {
    // 30分コース → 復習予算18分。16分（4件）は渋滞にせず、20分（5件）で渋滞
    expect(detectCongestion(4, 30).estimatedMinutes).toBeLessThanOrEqual(reviewBudgetMinutes(30));
    expect(detectCongestion(4, 30).congested).toBe(false);
    expect(detectCongestion(5, 30).congested).toBe(true);
  });

  it('【再発防止】5分コースの人は「予算の4倍」を抱えたら渋滞になる（固定20分では見逃していた）', () => {
    const c = detectCongestion(5, 5); // 推定20分 vs 予算3分
    expect(c.congested).toBe(true);
    expect(c.reasons).toEqual(['minutes']);
    expect(c.estimatedMinutes).toBeGreaterThan(c.budgetMinutes * 4);
  });

  it('同じ件数でも、時間が取れる人ほど渋滞になりにくい（一律の分数で切らない）', () => {
    expect(detectCongestion(4, 5).congested).toBe(true);
    expect(detectCongestion(4, 15).congested).toBe(true);
    expect(detectCongestion(4, 30).congested).toBe(false);
  });

  it('件数の閾値は予算に関係なく効く安全弁', () => {
    const c = detectCongestion(CONGESTION_RULES.overdueCount + 1, 30);
    expect(c.reasons).toContain('count');
    expect(c.congested).toBe(true);
  });

  it('渋滞判定に使った予算を持ち帰る（あとから根拠を確認できる）', () => {
    expect(detectCongestion(3, 5).budgetMinutes).toBe(3);
    expect(detectCongestion(3, 30).budgetMinutes).toBe(18);
  });

  it('【再発防止】5分コース×期限超過5件は救済される（判定が dailyMinutes を見ている）', () => {
    // 修正前は固定20分の閾値ちょうどで渋滞にならず、いちばん救済を要する人に rescue が出なかった
    const f = buildReviewForecast({ ledger: overdueLedger(5), nowISO: NOW, dailyMinutes: 5 });
    expect(f.congestion.congested).toBe(true);
    expect(f.rescue).not.toBeNull();
    expect(f.rescue!.todayCount).toBeLessThan(5);
    expect(f.todayTotalEstimatedMinutes).toBeLessThan(f.overdue.estimatedMinutes);
  });
});

// ────────────────────────────── 5: レスキュー計画 ──────────────────────────────

describe('レスキュー計画: 均等分散・取りこぼしゼロ', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

  it('全件がどこかの日へ必ず配られる（1件も消えない＝確認が永久に来ない状態を作らない）', () => {
    for (const n of [1, 5, 10, 23, 40]) {
      const plan = planRescue({ overdueTargetIds: ids(n), todayKey: '2026-08-17', dailyMinutes: 15 });
      const assigned = plan.days.flatMap((d) => d.targetIds);
      expect(assigned).toHaveLength(n);
      expect(new Set(assigned).size).toBe(n);
      expect(plan.days.reduce((s, d) => s + d.count, 0)).toBe(n);
    }
  });

  it('均等配分。余りは前の日へ寄せる（古い確認から先に片づける）', () => {
    const plan = planRescue({ overdueTargetIds: ids(11), todayKey: '2026-08-17', spreadDays: 3 });
    expect(plan.days.map((d) => d.count)).toEqual([4, 4, 3]);
    expect(plan.days[0].targetIds).toEqual(['t0', 't1', 't2', 't3']);
    expect(plan.todayCount).toBe(4);
  });

  it('日付は今日から連続する（呼び出し側がそのまま予定表に使える）', () => {
    const plan = planRescue({ overdueTargetIds: ids(6), todayKey: '2026-08-30', spreadDays: 3 });
    expect(plan.days.map((d) => d.dateKey)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });

  it('分散日数を省略すると「1日の予算 × reviewShare」から自動算出する', () => {
    // 15分 × 0.6 = 9分 → 4分/件なので1日2件 → 10件なら5日
    const plan = planRescue({ overdueTargetIds: ids(10), todayKey: '2026-08-17', dailyMinutes: 15 });
    expect(plan.spreadDays).toBe(5);
    expect(plan.todayCount).toBe(2);
    // 5分コースの人は予算が小さいぶん、より薄く（ただし上限日数まで）
    const light = planRescue({ overdueTargetIds: ids(10), todayKey: '2026-08-17', dailyMinutes: 5 });
    expect(light.todayCount).toBeLessThanOrEqual(plan.todayCount);
  });

  it('どれだけ溜まっても maxSpreadDays より先へは薄めない（永久に終わらない計画を作らない）', () => {
    const plan = planRescue({ overdueTargetIds: ids(200), todayKey: '2026-08-17', dailyMinutes: 5 });
    expect(plan.spreadDays).toBe(RESCUE_RULES.maxSpreadDays);
    expect(plan.days.reduce((s, d) => s + d.count, 0)).toBe(200);
  });

  it('予算が1件ぶんに満たなくても必ず1日1件は進む', () => {
    const plan = planRescue({ overdueTargetIds: ids(3), todayKey: '2026-08-17', dailyMinutes: 5 });
    expect(plan.todayCount).toBeGreaterThanOrEqual(1);
  });

  it('明示された spreadDays は尊重する（1未満は1へクランプ）', () => {
    expect(planRescue({ overdueTargetIds: ids(9), todayKey: '2026-08-17', spreadDays: 0 }).spreadDays).toBe(1);
    expect(planRescue({ overdueTargetIds: ids(9), todayKey: '2026-08-17', spreadDays: 9 }).spreadDays).toBe(9);
  });

  it('振り分けるものが無ければ「0件・約0分」と言わない（0分と書かない原則）', () => {
    const plan = planRescue({ overdueTargetIds: [], todayKey: '2026-08-17', dailyMinutes: 15 });
    expect(plan.totalCount).toBe(0);
    expect(plan.spreadDays).toBe(0);
    expect(plan.days).toEqual([]);
    for (const text of [plan.noticeJa, plan.noticeZh]) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/0件|0分|0场|0分钟/);
    }
  });

  it('【再発防止】将来日に自然解禁されるぶんを見て、その日の残り容量にだけ詰める', () => {
    // 明日は自然解禁4件（＝16分）で復習予算（15分×0.6=9分）を超えている。
    // ここへ機械的に2件を上乗せすると、予定表の「明日は2件」が実負担6件とズレる
    const plan = planRescue({
      overdueTargetIds: Array.from({ length: 6 }, (_, i) => `t${i}`),
      todayKey: '2026-08-17',
      dailyMinutes: 15,
      naturalCountsByDay: [0, 4, 0, 0, 0, 0, 0],
    });
    expect(plan.days.map((d) => d.count)).toEqual([2, 0, 2, 2]);
    expect(plan.days[1].naturalCount).toBe(4);
    expect(plan.days[1].totalCount).toBe(4);           // 上乗せしない
    expect(plan.days[1].totalEstimatedMinutes).toBe(4 * MINUTES_PER_CONFIRM_BATTLE);
    expect(plan.days.reduce((s, d) => s + d.count, 0)).toBe(6); // 取りこぼしゼロ
    // 「のこりは◯日」は実際に振り分けた日だけ数える（0件の日を数えない）
    expect(plan.noticeJa).toContain('のこりの確認バトルは2日に分けています');
  });

  it('各日の RescueDay は「振り分けたぶん」と「その日の実負担」を別々に持つ', () => {
    const plan = planRescue({
      overdueTargetIds: ['a', 'b'],
      todayKey: '2026-08-17',
      dailyMinutes: 30, // 復習予算18分 → 1日4件まで
      naturalCountsByDay: [1, 0, 0, 0, 0, 0, 0],
    });
    expect(plan.days[0].count).toBe(2);          // 振り分けたぶん（残り容量3件に収まる）
    expect(plan.days[0].naturalCount).toBe(1);   // その日に自然解禁されるぶん
    expect(plan.days[0].totalCount).toBe(3);     // 予定表に出すのはこちら
    expect(plan.days[0].totalEstimatedMinutes).toBe(3 * MINUTES_PER_CONFIRM_BATTLE);
    expect(plan.todayCount).toBe(plan.days[0].count);
  });

  it('今日が自然解禁で埋まっていても、今日ぶんが0件になって止まることはない', () => {
    const plan = planRescue({
      overdueTargetIds: ['a', 'b', 'c'],
      todayKey: '2026-08-17',
      dailyMinutes: 15,
      naturalCountsByDay: [9, 0, 0, 0, 0, 0, 0],
    });
    expect(plan.todayCount).toBeGreaterThanOrEqual(1);
    expect(plan.days.reduce((s, d) => s + d.count, 0)).toBe(3);
  });

  it('buildReviewForecast は予報の日別件数をそのまま容量計算へ渡す（別々に数えない）', () => {
    // 期限超過6件＋明日4件が自然解禁される台帳
    const ledger = ledgerOf({ ...overdueSpec(6), tm1: 1, tm2: 1, tm3: 1, tm4: 1 });
    const f = buildReviewForecast({ ledger, nowISO: NOW, dailyMinutes: 15 });
    expect(f.tomorrow.count).toBe(4);
    const tomorrowPlan = f.rescue!.days[1];
    expect(tomorrowPlan.naturalCount).toBe(f.tomorrow.count);
    expect(tomorrowPlan.count).toBe(0);
    expect(tomorrowPlan.totalCount).toBe(f.tomorrow.count);
  });

  it('渋滞判定が立ったときだけ forecast.rescue が入る（不要な分散案を出さない）', () => {
    expect(buildReviewForecast({ ledger: ledgerOf({ a: -1 }), nowISO: NOW }).rescue).toBeNull();
    expect(buildReviewForecast({ ledger: overdueLedger(14), nowISO: NOW }).rescue).not.toBeNull();
  });

  it('レスキュー後の「今日」は分散前より軽い（救済になっている）', () => {
    const f = buildReviewForecast({ ledger: overdueLedger(14), nowISO: NOW, dailyMinutes: 15 });
    expect(f.overdue.count).toBe(14);
    expect(f.rescue!.todayCount).toBeLessThan(f.overdue.count);
    expect(f.todayTotalEstimatedMinutes).toBeLessThan(f.overdue.estimatedMinutes);
  });
});

// ────────────────────────────── 6: 新規学習の負荷ガバナー ──────────────────────────────

describe('新規学習の負荷ガバナー', () => {
  it('復習が軽ければ normal', () => {
    const d = decideNewLoad({ todayReviewMinutes: 4, upcomingCount: 0, dailyMinutes: 15 });
    expect(d.mode).toBe('normal');
  });

  it('復習が予算の reduceRatio 以上なら reduce', () => {
    const d = decideNewLoad({ todayReviewMinutes: 15 * NEW_LOAD_RULES.reduceRatio, upcomingCount: 0, dailyMinutes: 15 });
    expect(d.mode).toBe('reduce');
  });

  it('復習だけで1日の予算が埋まるなら reviewOnly', () => {
    const d = decideNewLoad({ todayReviewMinutes: 15, upcomingCount: 0, dailyMinutes: 15 });
    expect(d.mode).toBe('reviewOnly');
  });

  it('今日が軽くても、今後3日の解禁が多ければ先回りして reduce する', () => {
    const d = decideNewLoad({ todayReviewMinutes: 0, upcomingCount: NEW_LOAD_RULES.reduceUpcomingCount, dailyMinutes: 15 });
    expect(d.mode).toBe('reduce');
    expect(d.reasonJa).toContain(`${NEW_LOAD_RULES.upcomingDays}日`);
  });

  it('dailyMinutes 未設定でも既定予算で判定できる（判定不能で止めない）', () => {
    const d = decideNewLoad({ todayReviewMinutes: NEW_LOAD_RULES.defaultDailyMinutes, upcomingCount: 0, dailyMinutes: null });
    expect(d.dailyBudgetMinutes).toBe(NEW_LOAD_RULES.defaultDailyMinutes);
    expect(d.mode).toBe('reviewOnly');
  });

  it('30分コースの人は同じ復習量でも新規を続けられる（一律に止めない）', () => {
    expect(decideNewLoad({ todayReviewMinutes: 12, upcomingCount: 0, dailyMinutes: 15 }).mode).toBe('reduce');
    expect(decideNewLoad({ todayReviewMinutes: 12, upcomingCount: 0, dailyMinutes: 30 }).mode).toBe('normal');
  });

  it('【渋滞中でも新規はゼロにしない】分散で収まる量なら reduce 止まり（復習で1日を埋めない）', () => {
    for (const n of [12, 20, 21]) {
      const f = buildReviewForecast({ ledger: overdueLedger(n), nowISO: NOW, dailyMinutes: 15 });
      expect(f.congestion.congested).toBe(true);
      expect(f.newLoad.mode).toBe('reduce');
      expect(f.rescue!.todayEstimatedMinutes).toBeLessThan(15);
    }
  });

  it('分散中は今日が軽く見えても normal へは戻さない（残件より増える速度が勝つのを防ぐ）', () => {
    const f = buildReviewForecast({ ledger: overdueLedger(12), nowISO: NOW, dailyMinutes: 15 });
    // 今日の負担は予算の reduceRatio 未満（＝分数だけ見れば normal になる量）
    expect(f.todayTotalEstimatedMinutes).toBeLessThan(15 * NEW_LOAD_RULES.reduceRatio);
    expect(f.newLoad.congested).toBe(true);
    expect(f.newLoad.mode).toBe('reduce');
  });

  it('7日に分散してもなお予算を超える量なら、できるふりをせず reviewOnly と言う', () => {
    const f = buildReviewForecast({ ledger: overdueLedger(40), nowISO: NOW, dailyMinutes: 15 });
    expect(f.rescue!.spreadDays).toBe(RESCUE_RULES.maxSpreadDays);
    expect(f.newLoad.mode).toBe('reviewOnly');
  });

  it('分散できない期限ベース復習（dueCount）が予算を埋めるときも reviewOnly', () => {
    const f = buildReviewForecast({ ledger: {}, nowISO: NOW, dueCount: 40, dailyMinutes: 15 }); // 40語×0.5分=20分
    expect(f.congestion.congested).toBe(false); // 遅延確認は0件＝渋滞ではない
    expect(f.newLoad.mode).toBe('reviewOnly');
    expect(f.newLoad.reasonJa).toContain('明日からで大丈夫');
  });

  it('「今後3日」に今日を二重計上しない', () => {
    // 今日6件・明日以降0件。upcomingCount は 0 のはず（今日ぶんは todayReviewMinutes で数えている）
    const ledger = ledgerOf(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`t${i}`, -(i + 1)])));
    const f = buildReviewForecast({ ledger, nowISO: NOW, dailyMinutes: 30 });
    expect(f.today.count).toBe(6);
    expect(f.newLoad.upcomingCount).toBe(0);
  });
});

// ────────────────────────────── 7: 日付キーはTZ非依存 ──────────────────────────────

describe('日付キー: 実行環境のTZに依存しない', () => {
  it('JST基準で丸める（UTC 15:00 は翌日、UTC 14:59 は当日）', () => {
    expect(dateKeyOf('2026-08-17T14:59:00.000Z')).toBe('2026-08-17');
    expect(dateKeyOf('2026-08-17T15:00:00.000Z')).toBe('2026-08-18');
  });

  it('月またぎ・年またぎの加算が正しい', () => {
    expect(addDayKey('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('timeZone を指定すればその基準で予報の今日が決まる', () => {
    const utcMorning = '2026-08-17T16:00:00.000Z'; // JST 8/18 01:00 / UTC 8/17
    expect(buildReviewForecast({ ledger: {}, nowISO: utcMorning }).todayKey).toBe('2026-08-18');
    expect(buildReviewForecast({ ledger: {}, nowISO: utcMorning, timeZone: 'UTC' }).todayKey).toBe('2026-08-17');
  });

  it('buildForecastDays は必ず指定日数ぶん返す（欠けた日を作らない）', () => {
    const days = buildForecastDays([], '2026-08-17');
    expect(days).toHaveLength(FORECAST_DAYS);
    expect(days.map((d) => d.dateKey)).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23',
    ]);
  });
});
