import { describe, it, expect } from 'vitest';
import { inviteMessage, inviteUrl, inviteFriendsSeen, markInviteFriendsSeen } from './referralInvite';

describe('友達招待の文面（2026-09-13）', () => {
  it('リンクは招待ページ（/:lang/invite?invite=CODE）', () => {
    expect(inviteUrl('ABCD2345', 'zh')).toBe('https://kawabado.com/zh/invite?invite=ABCD2345');
    expect(inviteUrl('ABCD2345', 'ja')).toBe('https://kawabado.com/ja/invite?invite=ABCD2345');
  });
  it('文面にリンクが入り、AI会話・合格保証・割引を約束しない', () => {
    for (const lang of ['zh', 'ja'] as const) {
      const m = inviteMessage('ABCD2345', lang, false);
      expect(m).toContain(inviteUrl('ABCD2345', lang));
      for (const ng of ['AI会话', 'AI会話', '保证', '保証', '折', '割引', '%']) expect(m).not.toContain(ng);
      expect(m).toMatch(/7天|7日/);
    }
  });
  it('画面が日本語でも、送る文面は中文・/zh のリンク（相手は中国語話者）', () => {
    const m = inviteMessage('ABCD2345', 'ja');
    expect(m).toContain('https://kawabado.com/zh/invite?invite=ABCD2345');
    expect(m).toContain('7天');
    expect(m).not.toContain('日本語学習システム');
  });
  it('ポップは閉じたセッションでは出さない（記録があれば出さない）', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(inviteFriendsSeen(s)).toBe(false);
    markInviteFriendsSeen(s);
    expect(inviteFriendsSeen(s)).toBe(true);
    expect(inviteFriendsSeen(null)).toBe(false);
  });
});
