import { describe, it, expect } from 'vitest';
import {
  evaluateThrottle, DEFAULT_LOGIN_THROTTLE, loginFailedMessage,
  resetRequestedMessage, redactForLog, type LoginAttempt,
} from './loginThrottle';

const T0 = 1_800_000_000_000;
const fail = (offsetMs: number): LoginAttempt => ({ atMs: T0 + offsetMs, ok: false });
const ok = (offsetMs: number): LoginAttempt => ({ atMs: T0 + offsetMs, ok: true });

describe('ログイン抑制（§6）', () => {
  it('初回の失敗では待たせない（打ち間違いは誰でもする）', () => {
    const s = evaluateThrottle([], T0);
    expect(s.kind).toBe('allow');
    if (s.kind === 'allow') expect(s.delayMs).toBe(0);
  });

  it('失敗が続くと段階的に待ち時間が伸びる', () => {
    const a = evaluateThrottle([fail(0)], T0 + 1000);
    const b = evaluateThrottle([fail(0), fail(1000)], T0 + 2000);
    expect(a.kind).toBe('allow');
    expect(b.kind).toBe('allow');
    if (a.kind === 'allow' && b.kind === 'allow') expect(b.delayMs).toBeGreaterThan(a.delayMs);
  });

  it('待ち時間には上限がある（長すぎるとサポート問い合わせになる）', () => {
    const many = Array.from({ length: 4 }, (_, i) => fail(i * 100));
    const s = evaluateThrottle(many, T0 + 500);
    if (s.kind === 'allow') expect(s.delayMs).toBeLessThanOrEqual(DEFAULT_LOGIN_THROTTLE.maxDelayMs);
  });

  it('5回連続失敗でlockする', () => {
    const five = Array.from({ length: 5 }, (_, i) => fail(i * 1000));
    const s = evaluateThrottle(five, T0 + 6000);
    expect(s.kind).toBe('locked');
  });

  it('lockは時間経過で自動解除される（永久lockにしない）', () => {
    const five = Array.from({ length: 5 }, (_, i) => fail(i * 1000));
    const afterLock = T0 + 4000 + DEFAULT_LOGIN_THROTTLE.lockDurationMs + 1;
    const s = evaluateThrottle(five, afterLock);
    expect(s.kind).toBe('allow');
  });

  it('成功したら失敗回数がresetされる（久しぶりの学習者を巻き込まない）', () => {
    const history = [fail(0), fail(1000), fail(2000), fail(3000), ok(4000), fail(5000)];
    const s = evaluateThrottle(history, T0 + 6000);
    expect(s.kind).toBe('allow');   // 成功後の失敗1回だけを数える
  });

  it('古い失敗は窓の外なので数えない', () => {
    const old = Array.from({ length: 5 }, (_, i) => fail(i * 1000));
    const s = evaluateThrottle(old, T0 + DEFAULT_LOGIN_THROTTLE.windowMs + 10_000);
    expect(s.kind).toBe('allow');
  });
});

describe('文言（§3・§4・§5: 登録の有無を推測させない）', () => {
  it('ログイン失敗は理由を問わず同じ文言', () => {
    expect(loginFailedMessage('ja')).toBe('ログインIDまたはパスワードが正しくありません。');
    // 「そのIDは存在しません」のような文言を混ぜていない
    expect(loginFailedMessage('ja')).not.toMatch(/存在|登録されて|見つかりません/);
    expect(loginFailedMessage('zh')).not.toMatch(/不存在|未注册/);
  });

  it('再設定の案内は登録有無で変わらない', () => {
    expect(resetRequestedMessage('ja')).toContain('該当する場合');
    expect(resetRequestedMessage('ja')).not.toMatch(/登録されていません|見つかりません/);
  });
});

describe('ログの伏字（§6）', () => {
  it('メールはドメインだけ残す', () => {
    expect(redactForLog('login failed for taro.yamada+test@example.com'))
      .toBe('login failed for ***@example.com');
  });

  it('JWTを伏せる', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWEifQ.abcdefghijklmnop';
    expect(redactForLog(`token=${jwt}`)).toContain('***jwt***');
    expect(redactForLog(`token=${jwt}`)).not.toContain('eyJzdWIiOiJ1c2VyLWEifQ');
  });

  it('アクセストークンを伏せる', () => {
    // テスト用の**架空**の値。実在のトークンは形が同じでもここへ書かない
    // （書くと git 履歴に残り、失効済みでも棚卸しのたびに調査対象になる）
    const fake = ['sbp', 'EXAMPLEexampleEXAMPLEexampleEXAMPLE00000'].join('_');
    expect(redactForLog(fake)).toContain('***token***');
    expect(redactForLog(fake)).not.toContain('EXAMPLE');
  });

  it('パスワードを伏せる', () => {
    expect(redactForLog({ loginId: 'MN-4K7Q', password: 'K7M3Q8' })).not.toContain('K7M3Q8');
    expect(redactForLog({ loginId: 'MN-4K7Q', password: 'K7M3Q8' })).toContain('***');
  });
});
