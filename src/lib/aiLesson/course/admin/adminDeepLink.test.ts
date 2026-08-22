// 点検ボード → 管理画面の直リンクの受入テスト（2026-08-23）。
//
// 守るのは3つ:
//   ① ボードが出すURL（?tab=students&account=<学習ID>）でその人が開く
//   ② 学習ID・メール・userId のどれでも当たる
//   ③ **当たらないときは別の人を開かない**（黙って違う画面を出すのがいちばん危ない）
import { describe, it, expect } from 'vitest';
import { parseAdminDeepLink, initialAdminTab, matchAccount } from './adminDeepLink';

const accounts = [
  { userId: 'u-1', loginId: 'wang', email: 'wang@id.badminton-platform.pages.dev' },
  { userId: 'u-2', loginId: 'li', email: 'li@id.badminton-platform.pages.dev' },
  { userId: 'u-3', loginId: '', email: 'shodorannga@gmail.com' },
];

describe('URLの読み取り', () => {
  it('① ボードが出す形をそのまま読む', () => {
    const l = parseAdminDeepLink('?tab=students&account=wang');
    expect(l).toEqual({ tab: 'students', account: 'wang' });
    expect(initialAdminTab(l)).toBe('students');
  });

  it('人の指定だけなら生徒タブ、何も無ければ今日', () => {
    expect(initialAdminTab(parseAdminDeepLink('?account=li'))).toBe('students');
    expect(initialAdminTab(parseAdminDeepLink(''))).toBe('today');
  });

  it('知らないタブ名・空の指定は無視する（壊れたURLで開けなくしない）', () => {
    expect(parseAdminDeepLink('?tab=bogus&account=')).toEqual({ tab: null, account: null });
    expect(parseAdminDeepLink('?tab=ops')).toEqual({ tab: 'ops', account: null });
  });
});

describe('アカウントの解決', () => {
  it('② 学習ID・メール・userId・メールの@前、どれでも当たる', () => {
    expect(matchAccount(accounts, 'wang')?.userId).toBe('u-1');
    expect(matchAccount(accounts, 'WANG')?.userId).toBe('u-1');
    expect(matchAccount(accounts, 'li@id.badminton-platform.pages.dev')?.userId).toBe('u-2');
    expect(matchAccount(accounts, 'u-3')?.userId).toBe('u-3');
    expect(matchAccount(accounts, 'shodorannga')?.userId).toBe('u-3');
  });

  it('③ 当たらなければ null（近い人を勝手に開かない）', () => {
    expect(matchAccount(accounts, 'wan')).toBeNull();
    expect(matchAccount(accounts, 'unknown')).toBeNull();
    expect(matchAccount(accounts, null)).toBeNull();
    expect(matchAccount(accounts, '   ')).toBeNull();
    expect(matchAccount([], 'wang')).toBeNull();
  });
});
