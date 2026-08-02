import { describe, it, expect, beforeEach } from 'vitest';
import {
  decideGate, saveIntent, loadIntent, clearIntent, isSafeReturnPath,
  resumePathAfterLogin, isOwned, type PendingIntent,
} from './accountGate';
import {
  startSimAccount, verifySimAccount, resolveSalesSession, readSimAccount, clearSimAccount,
} from './salesAccount';

const store = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

const intent = (over: Partial<PendingIntent> = {}): PendingIntent => ({
  action: 'purchase',
  planId: 'ai-hour-pass',
  locale: 'ja',
  returnPath: '/ja/ai-course/plans/ai-hour-pass',
  agreedBefore: false,
  createdAtMs: 1_000_000,
  ...over,
});

describe('アカウントが無ければ進ませない（§3）', () => {
  it('購入・相談・体験開始は、いずれもセッションが無いと止まる', () => {
    for (const a of ['purchase', 'consultation', 'trial_activation'] as const) {
      expect(decideGate(a, null).kind, a).toBe('require_account');
    }
  });

  it('セッションがあれば userId を返す（この id に購入も利用権も紐づく）', () => {
    const d = decideGate('purchase', { userId: 'u_1', email: 'a@b.c' });
    expect(d).toEqual({ kind: 'allow', userId: 'u_1' });
  });
});

describe('OTPの往復をまたいで元の場所へ戻る（§3）', () => {
  it('保存した intent を読み戻せる', () => {
    const s = store();
    expect(saveIntent(s, intent())).toBe(true);
    expect(loadIntent(s, 1_000_000)?.planId).toBe('ai-hour-pass');
  });

  it('ログイン後は元のプランの続きへ戻る', () => {
    expect(resumePathAfterLogin(intent(), 'ja')).toBe('/ja/ai-course/plans/ai-hour-pass');
  });

  it('intent が無ければ料金ページへ戻す（迷子にしない）', () => {
    expect(resumePathAfterLogin(null, 'zh')).toBe('/zh/ai-course/plans');
  });

  it('30分放置した intent は捨てる（共有端末で他人が続きを踏めないように）', () => {
    const s = store();
    saveIntent(s, intent());
    expect(loadIntent(s, 1_000_000 + 31 * 60_000)).toBeNull();
  });

  it('clear すると消える', () => {
    const s = store();
    saveIntent(s, intent());
    clearIntent(s);
    expect(loadIntent(s, 1_000_000)).toBeNull();
  });
});

describe('戻り先に外部URLを入れさせない（オープンリダイレクト防止）', () => {
  it.each([
    'https://example.com/steal',
    '//example.com/steal',
    'javascript:alert(1)',
    'http://example.com',
  ])('%s は拒否する', (p) => {
    expect(isSafeReturnPath(p)).toBe(false);
    expect(saveIntent(store(), intent({ returnPath: p }))).toBe(false);
  });

  it('アプリ内の絶対パスだけ許す', () => {
    expect(isSafeReturnPath('/ja/ai-course/plans')).toBe(true);
  });

  it('保存済みの値が後から書き換えられていても、読み出しで弾く', () => {
    const s = store();
    s.setItem('ai_course_pending_intent_v1', JSON.stringify(intent({ returnPath: 'https://evil.test' })));
    expect(loadIntent(s, 1_000_000)).toBeNull();
  });
});

describe('匿名のレコードを作らない（§3）', () => {
  it('learnerId が無い・空のレコードは所有者なしとして検出する', () => {
    expect(isOwned(null)).toBe(false);
    expect(isOwned({})).toBe(false);
    expect(isOwned({ learnerId: '' })).toBe(false);
    expect(isOwned({ learnerId: 'u_1' })).toBe(true);
  });
});

describe('模擬アカウント（OTPを飛ばせないこと）', () => {
  let s: ReturnType<typeof store>;
  beforeEach(() => { s = store(); });

  it('確認コードを入れるまではセッションにならない', () => {
    startSimAccount(s, 'a@b.c', 1_000);
    expect(readSimAccount(s)!.verified).toBe(false);
    expect(resolveSalesSession(null, s, true), 'OTP前に通ってはいけない').toBeNull();
  });

  it('確認コードが合えばセッションになる', () => {
    const acc = startSimAccount(s, 'a@b.c', 1_000);
    expect(verifySimAccount(s, acc.code).ok).toBe(true);
    expect(resolveSalesSession(null, s, true)?.userId).toBe(acc.userId);
  });

  it('違うコードでは通らない', () => {
    const acc = startSimAccount(s, 'a@b.c', 1_000);
    const wrong = String((Number(acc.code) + 1) % 1_000_000).padStart(6, '0');
    expect(verifySimAccount(s, wrong).ok).toBe(false);
    expect(resolveSalesSession(null, s, true)).toBeNull();
  });

  it('模擬が許されていない環境では、模擬アカウントを通さない', () => {
    const acc = startSimAccount(s, 'a@b.c', 1_000);
    verifySimAccount(s, acc.code);
    expect(resolveSalesSession(null, s, false), '本番で模擬セッションが通ってはいけない').toBeNull();
  });

  it('実セッションがあれば、そちらを優先する', () => {
    const acc = startSimAccount(s, 'a@b.c', 1_000);
    verifySimAccount(s, acc.code);
    expect(resolveSalesSession({ userId: 'real_1', email: 'r@b.c' }, s, true)?.userId).toBe('real_1');
  });

  it('模擬の userId は実 Supabase の id と混ざらない接頭辞を持つ', () => {
    expect(startSimAccount(s, 'a@b.c', 1_000).userId.startsWith('sim_')).toBe(true);
  });

  it('ログアウト相当で消える', () => {
    startSimAccount(s, 'a@b.c', 1_000);
    clearSimAccount(s);
    expect(readSimAccount(s)).toBeNull();
  });
});
