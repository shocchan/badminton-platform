// 招待リンク限定ページ（2026-09-11 CEO決定）の約束。
// - 検索に出さない（noindex）
// - 締め切りは固定日・残り枠の数字は出さない
// - 書いてはいけない文言（配布文面ルール §1）を書かない。強気は「目標」の言い方まで
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { INVITE_CAMPAIGN, countdownTo, daysUntil, inviteCodeFromSearch } from '../../lib/aiLesson/course/plans/inviteCampaign';

const SRC = readFileSync(new URL('./InviteLandingPage.tsx', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

describe('公開範囲', () => {
  it('noindex で、ルートは /:lang/invite', () => {
    expect(SRC).toMatch(/name="robots" content="noindex, nofollow"/);
    expect(APP).toMatch(/path="invite"\s+element=\{<InviteLandingPage \/>\}/);
  });
  it('?invite= が無いと申し込み欄を出さない（案内だけ）', () => {
    expect(SRC).toMatch(/\{!invite \? \(/);
  });
});

describe('締め切りと定員', () => {
  it('締め切りは固定日（JST）で、過ぎたら閉じる', () => {
    expect(INVITE_CAMPAIGN.deadlineISO).toMatch(/\+09:00$/);
    const before = countdownTo('2026-09-14T23:59:59+09:00', new Date('2026-09-12T23:59:59+09:00'));
    expect(before).toMatchObject({ days: 2, hours: 0, minutes: 0, seconds: 0, closed: false });
    expect(countdownTo('2026-09-14T23:59:59+09:00', new Date('2026-09-15T00:00:00+09:00')).closed).toBe(true);
  });
  it('残り枠の数字は出さない（定員 100 名の印だけ）', () => {
    expect(SRC).not.toMatch(/残り\d|剩余\d|used_count|remainingSeats/);
    expect(SRC).toMatch(/INVITE_CAMPAIGN\.seats/);
  });
  it('JLPT までの日数は試験日から数える', () => {
    expect(daysUntil('2026-12-06T00:00:00+09:00', new Date('2026-09-11T12:00:00+09:00'))).toBe(86);
  });
  it('招待コードは URL の ?invite= からだけ拾う', () => {
    expect(inviteCodeFromSearch('?invite=abcd-2345')).toBe('ABCD2345');
    expect(inviteCodeFromSearch('?invite=O0IL1234')).toBe('');
    expect(inviteCodeFromSearch('')).toBe('');
  });
});

describe('文言', () => {
  it('書かないと決めたことを書いていない（合格保証・合格できます・問題数・AI会話が使える）', () => {
    expect(SRC).not.toMatch(/合格保証|合格できます|保证合格|包过|一定能考过|万問|万题|\d{3,}問収録/);
    expect(SRC).not.toMatch(/AI会話が使えます|可以用AI会话|AI会話も使えます/);
  });
  it('必ず書くこと: AI会話は含まない・7日で終わる・記録は消えない・合格を保証しない', () => {
    for (const s of ['AI会話は含みません', '不含AI会话', '7日で終わります', '7天后结束', '消えません', '不会清空', '合格を保証するものではありません', '不保证考试合格']) {
      expect(SRC, s).toContain(s);
    }
  });
  it('強気の言い方は「目標」として（合格・話せる）', () => {
    expect(SRC).toContain('目標は、合格。');
    expect(SRC).toContain('目标：考过。');
    expect(SRC).toContain('話せる自分');
  });
});
