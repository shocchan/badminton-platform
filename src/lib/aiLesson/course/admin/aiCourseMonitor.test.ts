// 監視条件の単体テスト（Task 1）。
// 実DBへ検証用の行を置けない（学習テーブルは auth.users への外部キーがある）ため、
// 判定を純関数へ切り出してここで境界を固定する。
import { describe, it, expect } from 'vitest';
import {
  detectAlerts, shouldSendDigest, buildDigestMail, sortAlerts, DEFAULT_THRESHOLDS,
  type MonitorInput,
} from '../../../../../supabase/functions/_shared/aiCourseMonitor';

const NOW = '2026-09-20T12:00:00Z';
const MIN = 60_000;
const HOUR = 3_600_000;
const ago = (ms: number): string => new Date(Date.parse(NOW) - ms).toISOString();

const base = (over: Partial<MonitorInput> = {}): MonitorInput => ({
  purchases: [], sessions: [], cronJobs: [],
  recentEventCount: 5, hasRecentSessions: true, nowISO: NOW, ...over,
});
const purchase = (o: Partial<MonitorInput['purchases'][number]> = {}) => ({
  id: 'p1', status: 'provisioned', livemode: true, userId: 'u1',
  error: null, createdAtISO: ago(HOUR), provisionedAtISO: ago(HOUR), ...o,
});

describe('① 自動発行の失敗', () => {
  it('failed は1件でも critical で出す（ベータ期は見逃しが高くつく）', () => {
    const a = detectAlerts(base({ purchases: [purchase({ status: 'failed', error: 'auth_create_failed' })] }));
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe('critical');
    expect(a[0].kind).toBe('provision_failed');
  });

  it('**テスト決済は監視しない**', () => {
    expect(detectAlerts(base({ purchases: [purchase({ status: 'failed', livemode: false })] }))).toEqual([]);
  });

  it('正常に発行済みの購入は出さない', () => {
    expect(detectAlerts(base({ purchases: [purchase()] }))).toEqual([]);
  });
});

describe('② 発行の滞留', () => {
  it('決済済みで未発行が閾値を超えたら critical', () => {
    const a = detectAlerts(base({
      purchases: [purchase({ status: 'paid', provisionedAtISO: null, createdAtISO: ago(31 * MIN) })],
    }));
    expect(a.map((x) => x.kind)).toEqual(['provision_stuck']);
  });

  it('**閾値未満では騒がない**（webhookが数分遅れるのは正常）', () => {
    const a = detectAlerts(base({
      purchases: [purchase({ status: 'paid', provisionedAtISO: null, createdAtISO: ago(10 * MIN) })],
    }));
    expect(a).toEqual([]);
  });
});

describe('③ 会話エラーの集約', () => {
  const err = (code: string, h = 1) => ({ completionStatus: 'error', errorCode: code, startedAtISO: ago(h * HOUR) });

  it('同じコードが閾値以上でまとめて1件（大量通知しない）', () => {
    const a = detectAlerts(base({ sessions: [err('mic_denied'), err('mic_denied'), err('mic_denied')] }));
    expect(a).toHaveLength(1);
    expect(a[0].detail).toContain('3 件');
  });

  it('閾値未満は出さない', () => {
    expect(detectAlerts(base({ sessions: [err('mic_denied'), err('mic_denied')] }))).toEqual([]);
  });

  it('**24時間より前のエラーは数えない**', () => {
    const old = [err('mic_denied', 30), err('mic_denied', 30), err('mic_denied', 30)];
    expect(detectAlerts(base({ sessions: old }))).toEqual([]);
  });

  it('自己終了（errorCodeなし）はエラーに数えない', () => {
    const ok = Array.from({ length: 5 }, () => ({ completionStatus: 'completed', errorCode: null, startedAtISO: ago(HOUR) }));
    expect(detectAlerts(base({ sessions: ok }))).toEqual([]);
  });
});

describe('④ cron の健全性', () => {
  it('失敗は warning', () => {
    const a = detectAlerts(base({ cronJobs: [{ jobname: 'x', lastStatus: 'failed', lastStartISO: ago(HOUR) }] }));
    expect(a.map((x) => x.kind)).toEqual(['cron_failed']);
  });

  it('閾値を超えて動いていなければ warning', () => {
    const a = detectAlerts(base({ cronJobs: [{ jobname: 'x', lastStatus: 'succeeded', lastStartISO: ago(31 * HOUR) }] }));
    expect(a.map((x) => x.kind)).toEqual(['cron_stale']);
  });

  it('正常稼働中は出さない', () => {
    expect(detectAlerts(base({ cronJobs: [{ jobname: 'x', lastStatus: 'succeeded', lastStartISO: ago(2 * HOUR) }] }))).toEqual([]);
  });

  it('**一度も走っていないジョブでは騒がない**（登録直後の誤検知を避ける）', () => {
    expect(detectAlerts(base({ cronJobs: [{ jobname: 'new', lastStatus: null, lastStartISO: null }] }))).toEqual([]);
  });
});

describe('⑤ 計測の死活', () => {
  it('学習があるのにイベント0なら warning', () => {
    const a = detectAlerts(base({ recentEventCount: 0, hasRecentSessions: true }));
    expect(a.map((x) => x.kind)).toEqual(['events_missing']);
  });

  it('**そもそも学習が無い日は騒がない**', () => {
    expect(detectAlerts(base({ recentEventCount: 0, hasRecentSessions: false }))).toEqual([]);
  });
});

describe('重複抑制と通知判断', () => {
  it('同一事象は同じ dedupeKey になる（DB側で1行に集約される）', () => {
    const inp = base({ sessions: Array.from({ length: 4 }, () => ({ completionStatus: 'error', errorCode: 'net', startedAtISO: ago(HOUR) })) });
    const keys = detectAlerts(inp).map((a) => a.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['conversation_error:net']);
  });

  it('critical があればクールダウン中でも送る', () => {
    const alerts = detectAlerts(base({ purchases: [purchase({ status: 'failed' })] }));
    expect(shouldSendDigest({ alerts, lastDigestISO: ago(MIN), nowISO: NOW, cooldownHours: 20 })).toBe(true);
  });

  it('**warningだけならクールダウン中は送らない**（毎日同じ内容を送りつけない）', () => {
    const alerts = detectAlerts(base({ cronJobs: [{ jobname: 'x', lastStatus: 'failed', lastStartISO: ago(HOUR) }] }));
    expect(shouldSendDigest({ alerts, lastDigestISO: ago(2 * HOUR), nowISO: NOW, cooldownHours: 20 })).toBe(false);
    expect(shouldSendDigest({ alerts, lastDigestISO: ago(21 * HOUR), nowISO: NOW, cooldownHours: 20 })).toBe(true);
  });

  it('アラートが無ければ送らない', () => {
    expect(shouldSendDigest({ alerts: [], lastDigestISO: null, nowISO: NOW, cooldownHours: 20 })).toBe(false);
  });
});

describe('メール本文', () => {
  const alerts = detectAlerts(base({
    purchases: [purchase({ status: 'failed', error: 'auth_create_failed' })],
    cronJobs: [{ jobname: 'x', lastStatus: 'failed', lastStartISO: ago(HOUR) }],
  }));

  it('重大が先頭に並ぶ', () => {
    expect(sortAlerts(alerts)[0].severity).toBe('critical');
  });

  it('**個人情報を含めない**', () => {
    const m = buildDigestMail(alerts);
    expect(m.text).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i); // メールアドレス（本文中の管理画面URLは除く）
    expect(m.text).toContain('会話内容・氏名・メールアドレスは含まれません');
    expect(m.subject).toContain('重大 1');
  });
});

describe('既定のしきい値', () => {
  it('コードに散らさずここが正準', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      provisionStuckMinutes: 30, conversationErrorThreshold: 3, cronStaleHours: 30,
    });
  });
});
