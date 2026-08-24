// 配信ログの状態機械。**同じ人に同じ用件を2通送らない**ことと、
// **失敗が痕跡を残す**ことの両立をここで固定する。
//
// 旧設計は送信失敗時にログ行を削除していたため、
// 「cronが動いていない」「対象0件」「送信失敗」がすべて 0行 に見えていた（2026-08-24）。
import { describe, it, expect } from 'vitest';
import {
  claimDecision, retryDelayMs, sendErrorCode, maskEmail, buildMailHealthAlerts,
  MAX_SEND_ATTEMPTS,
  type MailLogRow,
} from '../../../supabase/functions/_shared/aiCourseLifecycle';

const NOW = Date.parse('2026-08-24T01:30:00Z');
const row = (over: Partial<MailLogRow> = {}): MailLogRow => ({
  dedupe_key: 'trial_ended:p1', status: 'failed', attempts: 1,
  next_retry_at: new Date(NOW - 1000).toISOString(), ...over,
});

describe('二度送らない', () => {
  it('送信済みには何があっても送らない', () => {
    expect(claimDecision(row({ status: 'sent', attempts: 1 }), NOW))
      .toEqual({ action: 'skip', reason: 'already_sent' });
  });

  it('**2回実行しても1通しか送らない**（1回目で sent になるため）', () => {
    const first = claimDecision(null, NOW);
    expect(first).toEqual({ action: 'send', attempt: 1 });
    // 1通目の送信に成功したあとの台帳
    const after = row({ status: 'sent', attempts: 1, next_retry_at: null });
    expect(claimDecision(after, NOW).action).toBe('skip');
  });

  it('送信中（scheduled）の行は触らない＝落ちた実行の後始末で二重送信しない', () => {
    expect(claimDecision(row({ status: 'scheduled' }), NOW))
      .toEqual({ action: 'skip', reason: 'in_flight' });
  });
});

describe('失敗は消さずに残して、いつか送り直す', () => {
  it('再試行の時刻が来ていれば次の回として送る', () => {
    expect(claimDecision(row({ attempts: 2 }), NOW)).toEqual({ action: 'send', attempt: 3 });
  });

  it('再試行の時刻より前なら待つ', () => {
    const later = row({ next_retry_at: new Date(NOW + 3_600_000).toISOString() });
    expect(claimDecision(later, NOW)).toEqual({ action: 'skip', reason: 'waiting_retry' });
  });

  it('next_retry_at を書けずに終わった行も拾える（永久に止まらない）', () => {
    expect(claimDecision(row({ next_retry_at: null }), NOW).action).toBe('send');
  });

  it(`${MAX_SEND_ATTEMPTS}回失敗したら止める（無限に投げ続けない）`, () => {
    expect(claimDecision(row({ attempts: MAX_SEND_ATTEMPTS }), NOW))
      .toEqual({ action: 'skip', reason: 'gave_up' });
  });

  it('待ち時間は回を追うごとに伸びる', () => {
    const delays = [1, 2, 3, 4].map(retryDelayMs);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(delays[0]).toBeGreaterThan(0);
  });
});

describe('失敗理由に個人情報を入れない', () => {
  it.each([
    [500, 'provider_500'],
    [429, 'rate_limited_429'],
    [422, 'rejected_422'],
    [401, 'auth_401'],
    [403, 'auth_403'],
    [400, 'http_400'],
  ])('HTTP %i → %s', (status, code) => {
    expect(sendErrorCode(status as number)).toBe(code);
  });

  it('通信そのものが失敗したときも短いコードだけ', () => {
    expect(sendErrorCode(null, 'TypeError')).toBe('network_error:TypeError');
    expect(sendErrorCode(null)).toBe('network_error');
  });

  it('どのコードにもメールアドレスらしき文字列が混ざらない', () => {
    for (const s of [500, 429, 422, 401, 400]) {
      expect(sendErrorCode(s)).not.toMatch(/@/);
    }
  });
});

describe('ドライランの伏せ字', () => {
  it('誰か見分けはつくが、そのまま名簿にはならない', () => {
    // shocchance3 = 11文字 → 先頭2文字＋9個の伏せ字
    expect(maskEmail('shocchance3@gmail.com')).toBe('sh*********@gmail.com');
    expect(maskEmail('a@b.co')).toBe('a*@b.co');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('気づけるようにする（アラート）', () => {
  it('cron に登録されていないジョブがあれば critical', () => {
    const a = buildMailHealthAlerts({
      failed: 0, gaveUp: 0, stuck: 0, orphanAccess: 0,
      missingJobs: ['event-reminder-daily'],
    });
    expect(a.map((x) => x.kind)).toContain('mail_cron_missing');
    expect(a[0].severity).toBe('critical');
  });

  it('再試行を使い切った件があれば critical', () => {
    const a = buildMailHealthAlerts({
      failed: 0, gaveUp: 2, stuck: 0, orphanAccess: 0, missingJobs: [],
    });
    expect(a.map((x) => x.kind)).toEqual(['mail_send_gave_up']);
    expect(a[0].detail).toContain('2件');
  });

  it('宛先を引けない受講権が1件だけなら、その人へ飛べるようにする', () => {
    const a = buildMailHealthAlerts({
      failed: 0, gaveUp: 0, stuck: 0, orphanAccess: 1, orphanUserId: 'u1', missingJobs: [],
    });
    expect(a[0].kind).toBe('mail_orphan_access');
    expect(a[0].subjectUserId).toBe('u1');
  });

  it('複数いるときは特定の1人を指さない', () => {
    const a = buildMailHealthAlerts({
      failed: 0, gaveUp: 0, stuck: 0, orphanAccess: 3, orphanUserId: 'u1', missingJobs: [],
    });
    expect(a[0].subjectUserId).toBeNull();
  });

  it('何も起きていなければ1件も立てない（狼少年にしない）', () => {
    expect(buildMailHealthAlerts({
      failed: 0, gaveUp: 0, stuck: 0, orphanAccess: 0, missingJobs: [],
    })).toEqual([]);
  });

  it('**detail に個人情報を入れない**（件数とジョブ名だけ）', () => {
    const a = buildMailHealthAlerts({
      failed: 1, gaveUp: 1, stuck: 1, orphanAccess: 1,
      orphanUserId: 'u1', missingJobs: ['ai-course-lifecycle-daily'],
    });
    for (const x of a) {
      expect(x.detail).not.toMatch(/@/);
      expect(x.detail).not.toContain('u1');
    }
  });

  it('kind はアラート表の制約（小文字・数字・下線 2〜40文字）を満たす', () => {
    const a = buildMailHealthAlerts({
      failed: 1, gaveUp: 1, stuck: 1, orphanAccess: 1, missingJobs: ['x'],
    });
    expect(a).toHaveLength(5);
    for (const x of a) expect(x.kind).toMatch(/^[a-z0-9_]{2,40}$/);
  });

  it('dedupe_key は事象ごとに一意（同じ事象を毎日増やさない）', () => {
    const a = buildMailHealthAlerts({
      failed: 1, gaveUp: 1, stuck: 1, orphanAccess: 1, missingJobs: ['x'],
    });
    expect(new Set(a.map((x) => x.dedupeKey)).size).toBe(a.length);
  });
});
