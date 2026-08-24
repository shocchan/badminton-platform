// 開催前日リマインドの「誰に送るか」と「何を書くか」を固定する。
//
// 実データの形に合わせている（2026-08-24 のバックアップ）:
//   entries          … status は 'confirmed' / 'cancelled'、email は全件あり、cancel_token を持つ
//   activity_entries … status は 'confirmed' / 'waitlist'、**email 列はまだ無い**
//                      （別途追加中。nullable なので null が来る前提で書く）
import { describe, it, expect } from 'vitest';
import {
  selectEventReminderTargets, buildEventReminderMail, eventReminderDedupeKey,
  reminderTargetDate, cancelUrlFor, jstDate, describeTarget,
  type ReminderEvent, type ReminderEntry,
} from '../../../supabase/functions/event-reminder/logic';
import { claimDecision } from '../../../supabase/functions/_shared/aiCourseLifecycle';

// 2026-08-24 18:00 JST に走らせる ＝ 明日は 2026-08-25
const NOW = Date.parse('2026-08-24T09:00:00Z');
const TOMORROW = '2026-08-25';

const tournament = (over: Partial<ReminderEvent> = {}): ReminderEvent => ({
  kind: 'tournament', id: '37', title: '川口・蕨バド交流杯 8月25日 混合ダブルス',
  date: TOMORROW, startTime: '19:00:00', endTime: '21:00:00',
  location: '芝園公民館', address: '埼玉県川口市芝園町３−１５',
  description: '<p>🏸 <strong>シャトル持参必須</strong>…</p>', status: 'active', ...over,
});
const activity = (over: Partial<ReminderEvent> = {}): ReminderEvent => ({
  kind: 'activity', id: '70753d2b-89d4-4ebf-be6f-7b2ec430dff1',
  title: '8/25（月）芝園公民館 19:00-21:00', date: TOMORROW,
  startTime: '19:00:00', endTime: '21:00:00',
  location: '芝園公民館', address: '埼玉県川口市芝園町3-15',
  priceJpy: 600, status: 'open', ...over,
});
const tEntry = (over: Partial<ReminderEntry> = {}): ReminderEntry => ({
  kind: 'tournament', entryId: '93', eventId: '37', name: '安田翔',
  email: 'player@example.com', status: 'confirmed', isCancelled: false,
  cancelToken: '3b66c2cb-dcd6-47a3-96ab-e479492c3309', ...over,
});
const aEntry = (over: Partial<ReminderEntry> = {}): ReminderEntry => ({
  kind: 'activity', entryId: '7d2d5bb4-93b2-42e7-96b0-7a11330160f1',
  eventId: '70753d2b-89d4-4ebf-be6f-7b2ec430dff1', name: 'しょっちゃん',
  email: 'member@example.com', status: 'confirmed', quantity: 1, ...over,
});
const run = (events: ReminderEvent[], entries: ReminderEntry[], nowMs = NOW) =>
  selectEventReminderTargets({ events, entries, nowMs });

describe('いつの開催回を拾うか', () => {
  it('JSTで「明日」の日付を見る（UTCで日付をまたぐ夜でも同じ）', () => {
    expect(reminderTargetDate(Date.parse('2026-08-24T09:00:00Z'))).toBe('2026-08-25');
    // 15:30 UTC = 翌日 00:30 JST。JSTでは既に8/25なので、明日は8/26
    expect(reminderTargetDate(Date.parse('2026-08-24T15:30:00Z'))).toBe('2026-08-26');
    expect(jstDate(Date.parse('2026-08-24T15:30:00Z'))).toBe('2026-08-25');
  });

  it('明日の開催回だけを送る（今日・明後日には送らない）', () => {
    const today = tournament({ id: '1', date: '2026-08-24' });
    const later = tournament({ id: '2', date: '2026-08-26' });
    const rows = [tEntry({ entryId: 'a', eventId: '1' }), tEntry({ entryId: 'b', eventId: '2' })];
    expect(run([today, later], rows)).toEqual([]);
  });

  it('中止・非公開になった開催回には送らない', () => {
    expect(run([tournament({ status: 'cancelled' })], [tEntry()])).toEqual([]);
    expect(run([activity({ status: 'cancelled' })], [aEntry()])).toEqual([]);
  });
});

describe('送ってはいけない相手', () => {
  it('キャンセル済みには送らない（実データの22件中15件がこれ）', () => {
    expect(run([tournament()], [tEntry({ status: 'cancelled' })])).toEqual([]);
    expect(run([tournament()], [tEntry({ isCancelled: true })])).toEqual([]);
  });

  it('補欠には送らない（参加が確定していない人に持ち物の話をしない）', () => {
    expect(run([activity()], [aEntry({ status: 'waitlist' })])).toEqual([]);
  });

  it('**メールを持っていない通常活動の申込には送らない**（列がまだ無い＝null で来る）', () => {
    expect(run([activity()], [aEntry({ email: null })])).toEqual([]);
    expect(run([activity()], [aEntry({ email: undefined })])).toEqual([]);
    expect(run([activity()], [aEntry({ email: '  ' })])).toEqual([]);
    expect(run([activity()], [aEntry({ email: 'wechat-id-only' })])).toEqual([]);
  });

  it('メールを持っている人にだけ送る（同じ開催回に混在していても）', () => {
    const t = run([activity()], [
      aEntry({ entryId: 'x', email: null }),
      aEntry({ entryId: 'y', email: 'has@example.com' }),
    ]);
    expect(t.map((x) => x.entry.entryId)).toEqual(['y']);
  });
});

describe('多重送信を防ぐ', () => {
  it('冪等キーは申込1件につき一意', () => {
    const t = run([tournament(), activity()], [tEntry(), aEntry()]);
    expect(t.map((x) => x.dedupeKey)).toEqual([
      'event_reminder:tournament:93',
      'event_reminder:activity:7d2d5bb4-93b2-42e7-96b0-7a11330160f1',
    ]);
    expect(new Set(t.map((x) => x.dedupeKey)).size).toBe(2);
  });

  it('大会と通常活動でIDが衝突しても別の鍵になる', () => {
    expect(eventReminderDedupeKey('tournament', '1'))
      .not.toBe(eventReminderDedupeKey('activity', '1'));
  });

  it('同じ申込が二重に読み込まれても1通しか作らない', () => {
    expect(run([tournament()], [tEntry(), tEntry()])).toHaveLength(1);
  });

  it('**2回実行しても2通目は送らない**（1回目の送信ログで止まる）', () => {
    const [t] = run([tournament()], [tEntry()]);
    const firstRun = claimDecision(null, NOW);
    expect(firstRun).toEqual({ action: 'send', attempt: 1 });
    const logged = {
      dedupe_key: t.dedupeKey, status: 'sent' as const, attempts: 1, next_retry_at: null,
    };
    expect(claimDecision(logged, NOW + 86_400_000).action).toBe('skip');
  });
});

describe('キャンセル導線', () => {
  it('大会は一件一意のトークン付きリンク', () => {
    const [t] = run([tournament()], [tEntry()]);
    expect(cancelUrlFor(t))
      .toBe('https://kawabado.com/cancel?token=3b66c2cb-dcd6-47a3-96ab-e479492c3309');
  });

  it('**旧ドメインを使わない**（process-cancel に残っている不具合を持ち込まない）', () => {
    const [t] = run([tournament()], [tEntry()]);
    const mail = buildEventReminderMail(t);
    expect(mail.text).not.toContain('badminton-platform.pages.dev');
    expect(mail.text).toContain('https://kawabado.com/cancel?token=');
  });

  it('通常活動は活動ページへ（キャンセルコードは本文に書かない）', () => {
    const [t] = run([activity()], [aEntry()]);
    const mail = buildEventReminderMail(t);
    expect(cancelUrlFor(t))
      .toBe('https://kawabado.com/ja/activity/70753d2b-89d4-4ebf-be6f-7b2ec430dff1');
    expect(mail.text).toContain('/ja/activity/');
    expect(mail.text).not.toMatch(/キャンセルコード[：:]\s*\d/);
  });

  it('トークンが無い大会エントリーはキャンセル導線なしでも本文が壊れない', () => {
    const [t] = run([tournament()], [tEntry({ cancelToken: null })]);
    const mail = buildEventReminderMail(t);
    expect(mail.text).not.toContain('null');
    expect(mail.text).not.toContain('undefined');
  });
});

describe('本文', () => {
  it('大会: 日時・会場・持ち物がそろっている', () => {
    const [t] = run([tournament()], [tEntry()]);
    const m = buildEventReminderMail(t);
    expect(m.subject).toContain('明日');
    expect(m.text).toContain('2026年8月25日（火）');
    expect(m.text).toContain('19:00〜21:00');
    expect(m.text).toContain('芝園公民館');
    expect(m.text).toContain('埼玉県川口市芝園町３−１５');
    expect(m.text).toContain('室内用シューズ');
  });

  it('シャトル持参制の大会だけ、シャトルの一行が出る', () => {
    const [withNote] = run([tournament()], [tEntry()]);
    expect(buildEventReminderMail(withNote).text).toContain('シャトル');
    const [without] = run([tournament({ description: '<p>楽しくやりましょう</p>' })], [tEntry()]);
    expect(buildEventReminderMail(without).text).not.toContain('シャトル');
  });

  it('通常活動: 日本語と中国語の両方で書く（申込者の言語が分からないため）', () => {
    const [t] = run([activity()], [aEntry()]);
    const m = buildEventReminderMail(t);
    expect(m.text).toContain('【日時】');
    expect(m.text).toContain('【时间】');
    expect(m.text).toContain('600円');
    expect(m.text).toContain('600日元');
  });

  it('**押し売りをしない**（次回の宣伝・追加購入の誘導を入れない）', () => {
    for (const [ev, en] of [[tournament(), tEntry()], [activity(), aEntry()]] as const) {
      const [t] = run([ev], [en]);
      const m = buildEventReminderMail(t);
      expect(m.text).not.toMatch(/お申し込みはお早めに|今すぐ|残りわずか|キャンペーン|割引|次回の.*もぜひ/);
    }
  });

  it('HTMLの案内文をそのまま本文へ流し込まない', () => {
    const [t] = run([tournament()], [tEntry()]);
    expect(buildEventReminderMail(t).text).not.toContain('<p>');
  });

  it('会場が未登録でも本文が壊れない', () => {
    const [t] = run([tournament({ location: null, address: null })], [tEntry()]);
    const m = buildEventReminderMail(t);
    expect(m.text).toContain('【会場】未定');
    expect(m.text).not.toContain('null');
  });
});

describe('ドライランの出力', () => {
  it('誰に・どの開催回が送られるはずかが分かり、宛先はそのまま名簿にならない', () => {
    const [t] = run([tournament()], [tEntry()]);
    const d = describeTarget(t);
    expect(d.to).toBe('pl****@example.com');
    expect(d.eventDate).toBe(TOMORROW);
    expect(d.eventTitle).toContain('川口・蕨バド交流杯');
    expect(JSON.stringify(d)).not.toContain('player@example.com');
  });
});
