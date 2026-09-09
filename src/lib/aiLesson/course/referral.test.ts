import { describe, it, expect, beforeEach } from 'vitest';
import {
  isValidReferralCode, readReferralFromSearch, rememberReferral, storedReferral,
  referralUrl, referralMessage, shouldShowReferral, referralCodeDisplay,
  readReferralDismissedAt, writeReferralDismissedAt, type ReferralSignals,
} from './referral';

const NOW = '2026-09-09T00:00:00.000Z';

/** node 環境で走るので、ブラウザ保存は自前の入れ物で代用する */
const makeStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    clear: () => m.clear(),
  };
};
let store = makeStorage();

const signals = (over: Partial<ReferralSignals> = {}): ReferralSignals => ({
  completedConversations: 0,
  completedReviews: 0,
  streakDays: 0,
  reportsViewed: 0,
  dismissedAtISO: null,
  nowISO: NOW,
  ...over,
});

beforeEach(() => { store = makeStorage(); });

describe('コードの形', () => {
  it('8桁・紛らわしい文字なし', () => {
    expect(isValidReferralCode('K7PX29QM')).toBe(true);
    expect(isValidReferralCode('k7px29qm')).toBe(true);
    expect(isValidReferralCode('K7PX-29QM')).toBe(true);
  });

  it('推測しやすい文字列は通らない', () => {
    for (const bad of ['andy', '12345678', 'password', 'K7PX29Q', 'K7PX29QMX']) {
      expect(isValidReferralCode(bad), `${bad} が通る`).toBe(false);
    }
    // 0 O 1 I L U は使わない
    expect(isValidReferralCode('K7PX29Q0')).toBe(false);
    expect(isValidReferralCode('K7PX29QO')).toBe(false);
  });
});

describe('readReferralFromSearch', () => {
  it('?ref= から読む', () => {
    expect(readReferralFromSearch('?ref=K7PX29QM')).toBe('K7PX29QM');
    expect(readReferralFromSearch('?utm_source=wechat&ref=k7px29qm')).toBe('K7PX29QM');
  });

  it('形が違うものは無視する（黙って壊れたコードを保存しない）', () => {
    expect(readReferralFromSearch('?ref=hello')).toBe(null);
    expect(readReferralFromSearch('')).toBe(null);
    expect(readReferralFromSearch('?ref=')).toBe(null);
  });
});

describe('rememberReferral', () => {
  it('最初に紹介してくれた人を上書きしない（手柄の横取りをしない）', () => {
    rememberReferral('K7PX29QM', store);
    rememberReferral('AAAA2222', store);
    expect(storedReferral(store)).toBe('K7PX29QM');
  });

  it('壊れたコードは保存しない', () => {
    rememberReferral('nope', store);
    expect(storedReferral(store)).toBe(null);
  });
});

describe('referralUrl / display', () => {
  it('中国語話者が主なので既定は zh', () => {
    expect(referralUrl('K7PX29QM')).toBe('https://kawabado.com/zh/ai-course?ref=K7PX29QM');
  });

  it('言語とオリジンを差し替えられる（stagingでの確認用）', () => {
    expect(referralUrl('K7PX29QM', 'ja', 'https://staging.badminton-platform.pages.dev'))
      .toBe('https://staging.badminton-platform.pages.dev/ja/ai-course?ref=K7PX29QM');
  });

  it('表示は4桁区切り', () => {
    expect(referralCodeDisplay('K7PX29QM')).toBe('K7PX-29QM');
  });
});

describe('referralMessage', () => {
  it('割引が効くときだけ割引を書く', () => {
    const on = referralMessage('K7PX29QM', 'zh', true, 50);
    expect(on).toContain('50%');
    expect(on).toContain('https://kawabado.com/zh/ai-course?ref=K7PX29QM');
  });

  it('割引が効かないときは割引を約束しない（いちばんやってはいけないこと）', () => {
    const off = referralMessage('K7PX29QM', 'zh', false, 50);
    expect(off).not.toContain('50%');
    expect(off).not.toContain('便宜');
    expect(off).toContain('https://kawabado.com/zh/ai-course?ref=K7PX29QM');
  });

  it('日本語版も同じ規則', () => {
    expect(referralMessage('K7PX29QM', 'ja', true).includes('オフ')).toBe(true);
    expect(referralMessage('K7PX29QM', 'ja', false).includes('オフ')).toBe(false);
  });
});

describe('shouldShowReferral（D-5）', () => {
  it('ログイン直後・何もしていない人には出さない', () => {
    expect(shouldShowReferral(signals())).toBe(false);
    expect(shouldShowReferral(signals({ completedConversations: 1 }))).toBe(false);
  });

  it('成功体験のあとに出す', () => {
    expect(shouldShowReferral(signals({ completedConversations: 2 }))).toBe(true);
    expect(shouldShowReferral(signals({ completedReviews: 1 }))).toBe(true);
    expect(shouldShowReferral(signals({ streakDays: 3 }))).toBe(true);
    expect(shouldShowReferral(signals({ reportsViewed: 2 }))).toBe(true);
  });

  it('閉じられたら30日は出さない（毎回出して押し売りにしない）', () => {
    const dismissed = signals({
      completedConversations: 5,
      dismissedAtISO: '2026-09-01T00:00:00.000Z',
    });
    expect(shouldShowReferral(dismissed)).toBe(false);
    expect(shouldShowReferral({ ...dismissed, nowISO: '2026-10-05T00:00:00.000Z' })).toBe(true);
  });

  it('壊れた日時でも落ちない', () => {
    expect(() => shouldShowReferral(signals({ dismissedAtISO: 'not-a-date', completedConversations: 5 })))
      .not.toThrow();
  });
});

describe('閉じた記録', () => {
  it('保存して読み戻せる', () => {
    writeReferralDismissedAt(store, NOW);
    expect(readReferralDismissedAt(store)).toBe(NOW);
  });

  it('ストレージが使えなくても落ちない', () => {
    const broken = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    expect(readReferralDismissedAt(broken)).toBe(null);
    expect(() => writeReferralDismissedAt(broken, NOW)).not.toThrow();
  });
});
