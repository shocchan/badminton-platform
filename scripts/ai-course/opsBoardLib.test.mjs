// 点検ボードの判定ロジックのテスト（2026-08-24 WAVE7）。
//
// このボードは毎朝スケジュールタスクが自動で貼り直す＝**壊れても誰も気づかない**。
// だから「数え方」と「異常かどうか」だけは、実際に起きた事故のケースで固定する。
//
// 実行: npx vitest run scripts/ai-course/opsBoardLib.test.mjs
import { describe, it, expect } from 'vitest';
import {
  personKey, personKeyKind, repeatStats,
  heartbeatVerdict, backupFreshness, machineChecks,
  costView, mailHealthView, entitlementIssues,
  ownerHoursView, revenuePerHour, monthMoney,
  reverseCalcView, nextSaleGap, wildflowView,
} from './opsBoardLib.mjs';
import { readWildflow, ANON_READABLE_TABLES } from './wildflow-read.mjs';

// ───────────────────────────────────────────────────────────
describe('personKey（名寄せ）', () => {
  it('user_id があれば必ずそれを使う', () => {
    expect(personKey({ user_id: 'u1', email_key: 'e1', name_key: 'n1' })).toBe('user:u1');
    expect(personKeyKind(personKey({ user_id: 'u1' }))).toBe('user');
  });

  it('user_id が無ければ email、両方無ければ name に落ちる', () => {
    expect(personKey({ user_id: null, email_key: 'e1', name_key: 'n1' })).toBe('mail:e1');
    expect(personKey({ user_id: null, email_key: null, name_key: 'n1' })).toBe('name:n1');
    expect(personKeyKind(personKey({ name_key: 'n1' }))).toBe('name');
  });

  it('空文字は「無い」として扱う（DBの空欄が別人になってしまうのを防ぐ）', () => {
    expect(personKey({ user_id: '  ', email_key: '', name_key: 'n1' })).toBe('name:n1');
  });
});

describe('repeatStats（リピート率）', () => {
  // 既存166行の形。20260824110000 より前の申込は user_id も email も持っていない
  const legacy = [
    { user_id: null, email_key: null, name_key: 'hashA', day: '2026-07-01' },
    { user_id: null, email_key: null, name_key: 'hashA', day: '2026-07-08' },
    { user_id: null, email_key: null, name_key: 'hashB', day: '2026-07-01' },
  ];

  it('既存行は氏名フォールバックになり、誤差ありと言い切る', () => {
    const s = repeatStats(legacy);
    expect(s.people).toBe(2);
    expect(s.repeaters).toBe(1);          // hashA が2回
    expect(s.rate).toBeCloseTo(0.5);
    expect(s.nameFallbackPeople).toBe(2); // 全員が氏名しか手がかりが無い
    expect(s.approximate).toBe(true);
  });

  it('同じ回に2行あってもリピートに数えない（開催日で数える）', () => {
    const s = repeatStats([
      { name_key: 'hashA', day: '2026-07-01' },
      { name_key: 'hashA', day: '2026-07-01' },
    ]);
    expect(s.people).toBe(1);
    expect(s.repeaters).toBe(0);
  });

  it('本人IDで名寄せできていれば誤差なしと言える', () => {
    const s = repeatStats([
      { user_id: 'u1', day: '2026-08-01' },
      { user_id: 'u1', day: '2026-08-08' },
      { user_id: null, email_key: 'mailX', day: '2026-08-01' },
    ]);
    expect(s.approximate).toBe(false);
    expect(s.nameFallbackPeople).toBe(0);
    expect(s.repeaters).toBe(1);
  });

  it('0人のとき 0% と言い切らない（null を返す）', () => {
    expect(repeatStats([]).rate).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────
describe('heartbeatVerdict（生存確認の5分岐）', () => {
  const now = Date.parse('2026-08-24T12:00:00Z');
  const hb = (o) => JSON.stringify({ staleAfterHours: 36, ...o });

  it('①ファイルが無い → 一度も完走していない', () => {
    const v = heartbeatVerdict(null, now, { path: '/x.json' });
    expect(v.level).toBe('missing');
    expect(v.lines[0]).toContain('一度も完走していません');
  });

  it('②36時間より古い → 動いていない（8日死んでいた事故の再現）', () => {
    const v = heartbeatVerdict(hb({ lastRunAt: '2026-08-16T10:05:00Z', status: 'OK' }), now);
    expect(v.level).toBe('stale');
    expect(v.lines[0]).toContain('動いていません');
  });

  it('②-b 古いうえに前回ERRORなら理由も一緒に出す', () => {
    const v = heartbeatVerdict(hb({ lastRunAt: '2026-08-16T10:05:00Z', status: 'ERROR', error: 'spawnSync node ENOENT' }), now);
    expect(v.level).toBe('stale');
    expect(v.lines.join('\n')).toContain('spawnSync node ENOENT');
  });

  it('③status=ERROR → 失敗している', () => {
    const v = heartbeatVerdict(hb({ lastRunAt: '2026-08-24T10:05:00Z', status: 'ERROR', error: 'boom' }), now);
    expect(v.level).toBe('error');
    expect(v.lines[0]).toContain('boom');
  });

  it('④status=ALERT → alerts をそのまま出す', () => {
    const v = heartbeatVerdict(hb({ lastRunAt: '2026-08-24T10:05:00Z', status: 'ALERT', alerts: ['未返信の問い合わせ: 5件', '招待0件'] }), now);
    expect(v.level).toBe('alert');
    expect(v.lines).toEqual(['未返信の問い合わせ: 5件', '招待0件']);
  });

  it('⑤status=OK かつ新しい → 何も言わない', () => {
    const v = heartbeatVerdict(hb({ lastRunAt: '2026-08-24T10:05:00Z', status: 'OK' }), now);
    expect(v.level).toBe('ok');
    expect(v.lines).toEqual([]);
  });

  it('21時間前（ボードが毎朝読む状態）を誤警報にしない', () => {
    // ボードは07:32・点検は10:05に動くので、常に約21時間前の点検を読む
    const v = heartbeatVerdict(hb({ lastRunAt: '2026-08-23T15:05:00Z', status: 'OK' }), Date.parse('2026-08-24T12:00:00Z'));
    expect(v.level).toBe('ok');
  });

  it('JSONが壊れていても落ちない', () => {
    expect(heartbeatVerdict('{oops', now).level).toBe('broken');
    expect(heartbeatVerdict(hb({ lastRunAt: 'いつか', status: 'OK' }), now).level).toBe('broken');
  });
});

describe('backupFreshness', () => {
  const now = Date.parse('2026-08-24T12:00:00+09:00');
  it('今日のバックアップがあれば正常', () => {
    expect(backupFreshness('2026-08-24', now).ok).toBe(true);
  });
  it('止まっていれば異常', () => {
    const r = backupFreshness('2026-08-20', now);
    expect(r.ok).toBe(false);
    expect(r.text).toContain('止まっています');
  });
  it('1件も無ければ異常', () => {
    expect(backupFreshness(null, now).ok).toBe(false);
  });
  it('途中終了（ai_learners.json 欠落）を拾う', () => {
    const r = backupFreshness('2026-08-24', now, false);
    expect(r.ok).toBe(false);
    expect(r.text).toContain('ai_learners.json');
  });
});

describe('machineChecks', () => {
  const now = Date.parse('2026-08-24T12:00:00+09:00');
  it('全部正常なら問題ゼロ', () => {
    const r = machineChecks({
      heartbeatRaw: JSON.stringify({ lastRunAt: '2026-08-24T01:05:00Z', status: 'OK', staleAfterHours: 36 }),
      nowMs: now, backupLatestDay: '2026-08-24', mailLogCount: 3,
    });
    expect(r.problems).toEqual([]);
  });

  it('配信ログ0件は異常として出す（一度も送られていなかった事故の再発検知）', () => {
    const r = machineChecks({
      heartbeatRaw: JSON.stringify({ lastRunAt: '2026-08-24T01:05:00Z', status: 'OK', staleAfterHours: 36 }),
      nowMs: now, backupLatestDay: '2026-08-24', mailLogCount: 0,
    });
    expect(r.problems.map((p) => p.kind)).toContain('メール');
  });

  it('配信ログが読めないとき（未適用）は異常にしない', () => {
    const r = machineChecks({
      heartbeatRaw: JSON.stringify({ lastRunAt: '2026-08-24T01:05:00Z', status: 'OK', staleAfterHours: 36 }),
      nowMs: now, backupLatestDay: '2026-08-24', mailLogCount: null,
    });
    expect(r.problems).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────
describe('costView（AI原価）', () => {
  it('ai_cost_summary が未適用なら日次集計にフォールバックし、その旨を持つ', () => {
    const v = costView(null, 4.93);
    expect(v.available).toBe(false);
    expect(v.dailyUsd).toBe(4.93);
    expect(v.note).toContain('ai_usage_daily');
  });

  it('推定と実トークンを混ぜずに分けて出す', () => {
    const v = costView({
      ok: true, from: '2026-08-01', to: '2026-08-24',
      eventsTotalUsd: 10, dailyTotalUsd: 6, gapUsd: 4,
      byKind: [
        { kind: 'realtime', source: 'estimated', costUsd: 6 },
        { kind: 'chat', source: 'reported', costUsd: 3 },
        { kind: 'report', source: 'reported', costUsd: 1 },
      ],
    }, 6);
    expect(v.available).toBe(true);
    expect(v.estimatedUsd).toBe(6);
    expect(v.reportedUsd).toBe(4);
    expect(v.billedUsd).toBe(0);
    // 明細にあって日次に無い原価（＝これまでボードが過少計上していたぶん）
    expect(v.gapUsd).toBe(4);
    expect(v.byKind[0]).toEqual({ kind: 'realtime', usd: 6 });
  });

  it('ok:false（権限なし）でも落ちない', () => {
    expect(costView({ ok: false, code: 'forbidden' }, 1.5).available).toBe(false);
  });
});

describe('mailHealthView', () => {
  it('未適用なら「読めない」と言い、異常にはしない', () => {
    const v = mailHealthView(null, null);
    expect(v.available).toBe(false);
    expect(v.problems).toEqual([]);
  });

  it('cronに登録されていないジョブを異常として出す', () => {
    const v = mailHealthView([
      { job: 'ai-course-lifecycle-daily', is_scheduled: false },
      { job: 'event-reminder-daily', is_scheduled: true, cron_last_start: '2026-08-24T01:00:00Z', cron_last_status: 'succeeded' },
    ], 5);
    expect(v.problems).toHaveLength(1);
    expect(v.problems[0]).toContain('ai-course-lifecycle-daily');
  });

  it('登録済みなのに一度も動いていない／失敗を拾う', () => {
    const v = mailHealthView([
      { job: 'a', is_scheduled: true, cron_last_start: null },
      { job: 'b', is_scheduled: true, cron_last_start: '2026-08-24T01:00:00Z', cron_last_status: 'failed' },
    ], 5);
    expect(v.problems.join('\n')).toContain('一度も実行されていません');
    expect(v.problems.join('\n')).toContain('failed');
  });

  it('配信ログ0件も異常に入れる', () => {
    const v = mailHealthView([{ job: 'a', is_scheduled: true, cron_last_start: '2026-08-24T01:00:00Z', cron_last_status: 'succeeded' }], 0);
    expect(v.problems.join('\n')).toContain('0件');
  });
});

describe('entitlementIssues（受講権）', () => {
  const now = Date.parse('2026-08-24T12:00:00Z');

  it('期限切れなのにプランが残っている行を拾う', () => {
    const r = entitlementIssues([{
      login_id: 'x', plan_id: 'ai-trial-pass', source: 'purchase',
      valid_from: '2026-07-19T00:00:00Z', valid_until: '2026-08-19T00:00:00Z', has_purchase: true,
    }], now);
    expect(r.map((i) => i.text).join('\n')).toContain('ai-trial-pass');
  });

  it('期間が逆転している行を拾う', () => {
    const r = entitlementIssues([{
      login_id: 'x', plan_id: null, source: 'manual',
      valid_from: '2026-09-01T00:00:00Z', valid_until: '2026-08-01T00:00:00Z',
    }], now);
    expect(r.map((i) => i.text).join('\n')).toContain('逆転');
  });

  it('購入由来なのにプランが空（格下げの疑い）を拾う', () => {
    const r = entitlementIssues([{
      login_id: 'x', plan_id: null, source: 'purchase',
      valid_from: '2026-08-01T00:00:00Z', valid_until: '2026-09-30T00:00:00Z', has_purchase: true,
    }], now);
    expect(r.map((i) => i.text).join('\n')).toContain('格下げ');
  });

  it('1人1行の前提が壊れていたら拾う', () => {
    const row = {
      login_id: 'dup', plan_id: null, source: 'manual',
      valid_from: '2026-08-01T00:00:00Z', valid_until: '2026-09-30T00:00:00Z',
    };
    const r = entitlementIssues([row, { ...row }], now);
    expect(r.map((i) => i.text).join('\n')).toContain('1人1行');
  });

  it('手動発行（plan_id なし・期間内）は異常ではない', () => {
    expect(entitlementIssues([{
      login_id: 'ok', plan_id: null, source: 'manual',
      valid_from: '2026-08-01T00:00:00Z', valid_until: '2026-09-30T00:00:00Z',
    }], now)).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────
describe('本人稼働時間と1時間あたり売上', () => {
  it('ファイルが無ければ「未入力」。推測しない', () => {
    const v = ownerHoursView(null, '2026-08');
    expect(v.entered).toBe(false);
    expect(revenuePerHour(100000, v.hours)).toBeNull();
  });

  it('当月の入力が無ければ未入力', () => {
    const v = ownerHoursView(JSON.stringify({ months: { '2026-07': { hours: 10 } } }), '2026-08');
    expect(v.entered).toBe(false);
    expect(v.reason).toContain('2026-08');
  });

  it('入力があれば時間と実入金を読む', () => {
    const v = ownerHoursView(JSON.stringify({
      months: { '2026-08': { hours: 40, activityCashJpy: 61000, updatedAt: '2026-08-24' } },
    }), '2026-08');
    expect(v).toMatchObject({ entered: true, hours: 40, activityCashJpy: 61000 });
    expect(revenuePerHour(80000, v.hours)).toBe(2000);
  });

  it('JSONが壊れていても落ちない', () => {
    expect(ownerHoursView('{broken', '2026-08').entered).toBe(false);
  });

  it('0時間は割らない', () => {
    expect(revenuePerHour(1000, 0)).toBeNull();
  });
});

describe('monthMoney（3事業の足し方）', () => {
  it('通常活動が理論値のときは includesTheory を立てる', () => {
    const m = monthMoney({ aiPaidJpy: 0, tourPaidJpy: 1000, tourUnpaidJpy: 2500, activityTheoryJpy: 66800 });
    expect(m.total).toBe(67800);           // 未入金は合計に入れない
    expect(m.activity.basis).toBe('theory');
    expect(m.includesTheory).toBe(true);
  });

  it('CEOが実入金を入れたら理論値を使わない', () => {
    const m = monthMoney({ aiPaidJpy: 600, tourPaidJpy: 1000, activityTheoryJpy: 66800, activityCashJpy: 52000 });
    expect(m.activity).toEqual({ jpy: 52000, basis: 'cash' });
    expect(m.total).toBe(53600);
    expect(m.includesTheory).toBe(false);
  });

  it('軸2は計測なしのまま（0円と言い切らない）', () => {
    expect(monthMoney({}).axis2Jpy).toBeNull();
  });
});

describe('reverseCalcView（軸2の鮮度）', () => {
  const md = [
    '## 月間目標と現在地（最終更新: 2026-04-27 09:00 daily-pf-analytics自動取得）',
    '**→ 最大ボトルネック: ①プロフクリック率0.7% ②有料記事CVR 0%**',
  ].join('\n');

  it('最終更新日と経過日数を出す（4か月前ならそう出る）', () => {
    const v = reverseCalcView(md, Date.parse('2026-08-24T12:00:00+09:00'));
    expect(v.updatedOn).toBe('2026-04-27');
    expect(v.ageDays).toBe(119);
    expect(v.stale).toBe(true);
    expect(v.bottleneck).toContain('プロフクリック率');
  });

  it('ファイルが無ければ available:false（0日前と言わない）', () => {
    expect(reverseCalcView(null, Date.now()).available).toBe(false);
  });
});

describe('nextSaleGap', () => {
  it('流入が足りないときは「あと何人」を出す', () => {
    const g = nextSaleGap({ lpViews30d: 2 });
    expect(g.neededViews).toBe(100);
    expect(g.shortfallViews).toBe(98);
    expect(g.enoughTraffic).toBe(false);
  });

  it('流入が足りているのに売れていないなら、原因は流入ではないと言える', () => {
    const g = nextSaleGap({ lpViews30d: 300, paidCountMonth: 0 });
    expect(g.enoughTraffic).toBe(true);
    expect(g.shortfallViews).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────
describe('wild-flow（別プロジェクト）', () => {
  it('未接続でも落ちず、未接続と表示できる', () => {
    const v = wildflowView({ connected: false, reason: '接続情報が見つかりません' });
    expect(v.connected).toBe(false);
    expect(v.lines[0]).toContain('未接続');
  });

  it('null を渡しても落ちない', () => {
    expect(() => wildflowView(null)).not.toThrow();
    expect(wildflowView(null).connected).toBe(false);
  });

  it('読めたものと読めないものを分けて出す', () => {
    const v = wildflowView({
      connected: true,
      ga4: { configured: false },
      counts: {
        lessons: { ok: true, count: 1 },
        quiz_leads: { ok: false, reason: 'anonキーでは読めません（RLSで0件に見える）' },
      },
    });
    expect(v.lines.join('\n')).toContain('レッスン在庫: 1件');
    expect(v.lines.join('\n')).toContain('読めません');
    expect(v.ga4Configured).toBe(false);
  });

  it('接続情報が無ければ connected:false を返し、例外を投げない', async () => {
    const r = await readWildflow({
      config: { ok: false, reason: 'テスト用に無し', ga4: { configured: false } },
      fetch: () => { throw new Error('呼ばれてはいけない'); },
    });
    expect(r.connected).toBe(false);
    expect(r.reason).toBe('テスト用に無し');
  });

  it('fetch が落ちても例外にせず「読めない」で返す', async () => {
    const r = await readWildflow({
      config: { ok: true, url: 'https://sfpgajxqmcymzetjwypz.supabase.co', key: 'k', keyKind: 'service_role', ga4: { configured: false } },
      tables: ['lessons'],
      fetch: async () => { throw new Error('ECONNREFUSED'); },
    });
    expect(r.connected).toBe(true);
    expect(r.counts.lessons.ok).toBe(false);
    expect(r.counts.lessons.reason).toContain('ECONNREFUSED');
  });

  it('anonキーのときは RLSで0件に見えるテーブルを問い合わせない', async () => {
    const asked = [];
    const r = await readWildflow({
      config: { ok: true, url: 'https://sfpgajxqmcymzetjwypz.supabase.co', key: 'k', keyKind: 'anon', ga4: { configured: false } },
      tables: ['lessons', 'quiz_leads'],
      fetch: async (url) => {
        asked.push(url);
        return { ok: true, headers: { get: () => '0-0/1' } };
      },
    });
    expect(ANON_READABLE_TABLES.has('lessons')).toBe(true);
    expect(asked.join('\n')).toContain('lessons');
    expect(asked.join('\n')).not.toContain('quiz_leads');
    expect(r.counts.quiz_leads.ok).toBe(false);
    expect(r.counts.lessons).toEqual({ ok: true, count: 1 });
  });

  it('権限がないときは http コードではなく「権限がありません」と言う', async () => {
    const r = await readWildflow({
      config: { ok: true, url: 'https://sfpgajxqmcymzetjwypz.supabase.co', key: 'k', keyKind: 'service_role', ga4: { configured: false } },
      tables: ['quiz_leads'],
      fetch: async () => ({ ok: false, status: 401, headers: { get: () => null } }),
    });
    expect(r.counts.quiz_leads.reason).toContain('権限がありません');
  });
});
