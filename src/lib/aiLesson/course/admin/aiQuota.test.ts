// OpenAI残高切れの扱いの単体テスト（2026-08-23 CEO指示）。
//
// ここで固定したいのは「誤検知しないこと」と「生徒より先にCEOが気づけること」。
// 通常のレート制限を残高切れと取り違えると、動くはずの会話を止めてしまう。
import { describe, it, expect } from 'vitest';
import {
  isQuotaError, isPaused, shouldMail, nextAvailability, lowBalanceAlert,
  buildQuotaMail, PAUSE_MINUTES, MAIL_COOLDOWN_HOURS,
} from '../../../../../supabase/functions/_shared/aiQuota';

const NOW = '2026-08-23T12:00:00Z';
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;

describe('残高切れの判定', () => {
  it('insufficient_quota は残高切れ', () => {
    expect(isQuotaError(429, 'insufficient_quota')).toBe(true);
  });
  it('請求まわりの停止も残高切れ扱い', () => {
    expect(isQuotaError(403, 'billing_hard_limit_reached')).toBe(true);
    expect(isQuotaError(403, 'account_deactivated')).toBe(true);
  });
  it('ただのレート制限は残高切れにしない（動く会話を止めない）', () => {
    expect(isQuotaError(429, 'rate_limit_exceeded')).toBe(false);
  });
  it('サーバー障害・不明なエラーも残高切れにしない', () => {
    expect(isQuotaError(500, 'server_error')).toBe(false);
    expect(isQuotaError(502, 'unknown')).toBe(false);
    expect(isQuotaError(429, null)).toBe(false);
  });
});

describe('一時停止は自動で切れる', () => {
  it('期限内は停止中', () => {
    expect(isPaused({ paused_until: plus(NOW, 10 * MIN) }, NOW)).toBe(true);
  });
  it('期限を過ぎたら勝手に元へ戻る（手作業の復旧を要らなくする）', () => {
    expect(isPaused({ paused_until: plus(NOW, -1 * MIN) }, NOW)).toBe(false);
  });
  it('記録が無ければ止まっていない', () => {
    expect(isPaused(null, NOW)).toBe(false);
    expect(isPaused({}, NOW)).toBe(false);
  });
  it('壊れた値は「止まっていない」と読む（フェイルオープン）', () => {
    expect(isPaused({ paused_until: 'ダメな値' }, NOW)).toBe(false);
  });
});

describe('CEOへのメール', () => {
  it('初回は必ず送る', () => {
    expect(shouldMail(null, NOW)).toBe(true);
  });
  it('クールダウン中は送らない（止まっている間じゅう鳴らさない）', () => {
    expect(shouldMail({ last_mail_at: plus(NOW, -1 * HOUR) }, NOW)).toBe(false);
  });
  it('クールダウンを過ぎたらまた送る（放置に気づけるように）', () => {
    expect(shouldMail({ last_mail_at: plus(NOW, -(MAIL_COOLDOWN_HOURS + 1) * HOUR) }, NOW)).toBe(true);
  });
  it('本文に「生徒には出ていない」ことと、足しかたが書いてある', () => {
    const m = buildQuotaMail('voice', NOW);
    expect(m.text).toContain('アップデート中');
    expect(m.text).toContain('platform.openai.com');
    expect(m.subject).toContain('AI会話が停止');
  });
  it('本文に生徒を特定する情報を入れない', () => {
    const m = buildQuotaMail('chat', NOW);
    expect(m.text).not.toMatch(/@/);
  });
});

describe('停止記録の更新', () => {
  it('停止の期限が伸び、理由が残る', () => {
    const v = nextAvailability(null, NOW, { mailed: true });
    expect(v.reason).toBe('quota');
    expect(Date.parse(v.paused_until!)).toBe(Date.parse(NOW) + PAUSE_MINUTES * MIN);
    expect(v.since).toBe(NOW);
    expect(v.last_mail_at).toBe(NOW);
  });
  it('止まり続けている間は「最初に止まった時刻」を書き換えない', () => {
    const first = nextAvailability(null, NOW, { mailed: true });
    const later = plus(NOW, 5 * MIN);
    const second = nextAvailability(first, later, { mailed: false });
    expect(second.since).toBe(NOW);
    expect(second.last_mail_at).toBe(NOW);   // 送っていないので基準は据え置き
  });
  it('いったん復旧してから再発したら、時刻を取り直す', () => {
    const old = { paused_until: plus(NOW, -2 * HOUR), since: plus(NOW, -3 * HOUR) };
    expect(nextAvailability(old, NOW, { mailed: false }).since).toBe(NOW);
  });
});

describe('尽きる前の予告', () => {
  it('しきい値を下回ったら出す', () => {
    expect(lowBalanceAlert(10, 8, 3)?.kind).toBe('ai_credit_low');
  });
  it('余裕があれば出さない（毎日鳴らさない）', () => {
    expect(lowBalanceAlert(10, 2, 3)).toBeNull();
  });
  it('チャージ記録が無いときは黙る（残高を知りようがない）', () => {
    expect(lowBalanceAlert(0, 5, 3)).toBeNull();
  });
  it('尽きていたら critical', () => {
    expect(lowBalanceAlert(10, 10.5, 3)?.severity).toBe('critical');
  });
  it('残りが読み取れる文になっている', () => {
    expect(lowBalanceAlert(10, 8, 3)?.detail).toContain('$2.00');
  });
});
