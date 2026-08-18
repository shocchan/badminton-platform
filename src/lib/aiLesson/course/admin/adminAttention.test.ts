// KPI・要対応リストの受入テスト（2026-08-18 管理ページ刷新）。
// いちばん守りたいこと:
// - 作りたての生徒（learner作成7日以内）を停滞扱いして騒がない
// - JLPT特化でAI会話0回の生徒も、questLogで学習していれば停滞にしない
// - 週次先生コメントの判定が週を跨いだ瞬間に「未送信」へ切り替わる
// - テスト・管理者アカウントは要対応の対象にしない
import { describe, it, expect } from 'vitest';
import { buildAttention, buildKpis } from './adminAttention';
import { buildAccountViews } from './adminAccountModel';
import type { AdminAccountRow, UsageLimits } from './adminAccountsApi';
import type { AdminAccessRow, AdminIssueReport, AdminLearnerRow, LearnerUsageSummary } from '../courseAdminApi';
import { defaultAdvProfile, writeAdvProfile } from '../adventure/advProfile';
import { jstDateKeyOf, weekStartKeyOf, type AdvTeacherNote } from '../adventure/advTeacherNote';
import type { LearnerSettings } from '../types';
import type { AdvRoute } from '../adventure/advTypes';

const NOW = '2026-08-18T12:00:00+09:00';
const TODAY = jstDateKeyOf(NOW);
const THIS_WEEK = weekStartKeyOf(TODAY);
const DAY_MS = 86400000;
const addDays = (key: string, n: number): string =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysAgoISO = (n: number): string => new Date(Date.parse(NOW) - n * DAY_MS).toISOString();

const LIMITS: UsageLimits = { monthlyMaxSessions: 80, monthlyMaxSeconds: 21600 };

const account = (over: Partial<AdminAccountRow> = {}): AdminAccountRow => ({
  userId: 'u-x', email: 'x@id.badminton-platform.pages.dev', loginId: 'x',
  userCreatedAtISO: daysAgoISO(30), lastSignInAtISO: null,
  isAdminAccount: false, learnerId: null,
  usage: { totalSessions: 0, totalSeconds: 0, totalCostUsd: 0, lastDate: null },
  convSessionsTotal: 0, ...over,
});

const learner = (over: Partial<AdminLearnerRow> = {}): AdminLearnerRow => ({
  id: 'l-x', userId: 'u-x', startedAtISO: daysAgoISO(30), displayName: 'X',
  preferredLanguage: 'zh', estimatedLevel: 'N3', difficultyLevel: 2, currentWeek: 1,
  isActive: true, hearing: {}, settings: {} as LearnerSettings, adminOverrides: {},
  createdAtISO: daysAgoISO(30), isTest: false, ...over,
});

const access = (over: Partial<AdminAccessRow> = {}): AdminAccessRow => ({
  userId: 'u-x', validFromISO: '2026-06-01T00:00:00+09:00', validUntilISO: '2027-02-28T23:59:59+09:00',
  note: null, updatedAtISO: '2026-06-01T00:00:00Z', planId: null, planVersion: null,
  source: 'manual', aiSecondsLimit: null, grantedBy: null, ...over,
});

const route: AdvRoute = {
  generatedAt: NOW, destinationJlpt: 'N2', destinationAreaId: 'area-n2',
  destinationLabelJa: 'N2', destinationLabelZh: 'N2', stages: [],
  explanationJa: '', explanationZh: '',
};

const note = (weekStartKey: string): AdvTeacherNote => ({
  id: `tn-${weekStartKey}`, weekStartKey, bodyJa: '今週の実測: クエスト3回', authorLabel: '先生',
  createdAtISO: `${weekStartKey}T09:00:00+09:00`, readAtISO: null,
});

const settingsWith = (questDays: string[], notes: AdvTeacherNote[] = []): LearnerSettings =>
  writeAdvProfile({} as LearnerSettings, {
    ...defaultAdvProfile(NOW), route,
    questLog: questDays.map((dateKey) => ({ dateKey, completedSteps: 1, totalSteps: 3 })),
    teacherNotes: notes,
  }, NOW);

const viewsOf = (
  accounts: AdminAccountRow[], learners: AdminLearnerRow[],
  accessMap: Record<string, AdminAccessRow> = {}, usageMap: Record<string, LearnerUsageSummary> = {},
) => buildAccountViews(accounts, learners, accessMap, usageMap, NOW);

const attention = (
  accounts: AdminAccountRow[], learners: AdminLearnerRow[],
  accessMap: Record<string, AdminAccessRow> = {}, usageMap: Record<string, LearnerUsageSummary> = {},
  issues: AdminIssueReport[] = [],
) => buildAttention(viewsOf(accounts, learners, accessMap, usageMap), issues, LIMITS, NOW);

const kinds = (items: { kind: string }[]): string[] => items.map((i) => i.kind);

describe('buildAttention: 停滞（stalled）', () => {
  it('最終学習が3日以上前なら停滞', () => {
    const items = attention([account()], [learner({ settings: settingsWith([addDays(TODAY, -3)]) })], { 'u-x': access() });
    expect(kinds(items)).toContain('stalled');
  });
  it('最終学習が昨日なら停滞ではない', () => {
    const items = attention([account()], [learner({ settings: settingsWith([addDays(TODAY, -1)]) })], { 'u-x': access() });
    expect(kinds(items)).not.toContain('stalled');
  });
  it('learner作成7日以内は停滞抑制（始めたばかりの李/ユウキ/kanaを騒がない）', () => {
    const fresh = learner({ createdAtISO: daysAgoISO(3), settings: settingsWith([addDays(TODAY, -3)]) });
    expect(kinds(attention([account()], [fresh], { 'u-x': access() }))).not.toContain('stalled');
    const freshNoStudy = learner({ createdAtISO: daysAgoISO(3) });
    expect(kinds(attention([account()], [freshNoStudy], { 'u-x': access() }))).not.toContain('stalled');
  });
  it('学習記録なしで作成7日以上なら停滞', () => {
    const items = attention([account()], [learner({ createdAtISO: daysAgoISO(8) })], { 'u-x': access() });
    expect(kinds(items)).toContain('stalled');
  });
  it('JLPT特化でAI会話0回でも、questLogで学習していれば停滞にしない（学習日はquestLog由来）', () => {
    const jlpt = learner({ settings: settingsWith([addDays(TODAY, -1)]) });
    const a = account({ convSessionsTotal: 0, usage: { totalSessions: 0, totalSeconds: 0, totalCostUsd: 0, lastDate: null } });
    expect(kinds(attention([a], [jlpt], { 'u-x': access() }))).not.toContain('stalled');
  });
  it('期限切れの生徒は停滞ではなく expired として出す', () => {
    const items = attention(
      [account()], [learner({ settings: settingsWith([addDays(TODAY, -10)]) })],
      { 'u-x': access({ validUntilISO: '2026-08-01T23:59:59+09:00' }) },
    );
    expect(kinds(items)).toContain('expired');
    expect(kinds(items)).not.toContain('stalled');
  });
  it('テスト・管理者アカウントは停滞の対象外', () => {
    const testLearner = learner({ isTest: true, settings: settingsWith([addDays(TODAY, -10)]) });
    expect(kinds(attention([account()], [testLearner], { 'u-x': access() }))).toEqual([]);
    const adminAcc = account({ isAdminAccount: true });
    expect(kinds(attention([adminAcc], [learner({ settings: settingsWith([addDays(TODAY, -10)]) })], { 'u-x': access() }))).toEqual([]);
  });
});

describe('buildAttention: 未ログイン・矛盾・上限接近', () => {
  it('発行3日以上でlearner無しなら not_logged_in（andy/wang）', () => {
    const items = attention([account({ userCreatedAtISO: daysAgoISO(5) })], [], { 'u-x': access() });
    expect(kinds(items)).toContain('not_logged_in');
  });
  it('発行から3日未満なら not_logged_in を出さない（発行直後を騒がない）', () => {
    const items = attention([account({ userCreatedAtISO: daysAgoISO(1) })], [], { 'u-x': access() });
    expect(kinds(items)).not.toContain('not_logged_in');
  });
  it('開始前×learnerあり（kana）は contradiction', () => {
    const items = attention(
      [account()], [learner({ createdAtISO: daysAgoISO(0) })],
      { 'u-x': access({ validFromISO: '2026-09-01T00:00:00+09:00' }) },
    );
    expect(kinds(items)).toContain('contradiction');
  });
  it('今月のAI会話が上限の85%以上なら near_cap（個別上限があればそちらで判定）', () => {
    const usage = (n: number): Record<string, LearnerUsageSummary> => ({ 'l-x': { sessions: n, costUsd: 1, lastDate: TODAY } });
    const l = learner({ settings: settingsWith([TODAY]) });
    expect(kinds(attention([account()], [l], { 'u-x': access() }, usage(68)))).toContain('near_cap');
    expect(kinds(attention([account()], [l], { 'u-x': access() }, usage(67)))).not.toContain('near_cap');
    const vip = learner({ settings: settingsWith([TODAY]), adminOverrides: { monthlyMaxSessions: 120 } });
    expect(kinds(attention([account()], [vip], { 'u-x': access() }, usage(68)))).not.toContain('near_cap');
  });
});

describe('buildAttention: 週次先生コメント（weekly_note_due）', () => {
  const studied = (notes: AdvTeacherNote[]) =>
    learner({ settings: settingsWith([addDays(TODAY, -1)], notes) });
  it('最新コメントが先週分なら「未送信」（週を跨いだ瞬間に切り替わる）', () => {
    const items = attention([account()], [studied([note(addDays(THIS_WEEK, -7))])], { 'u-x': access() });
    expect(kinds(items)).toContain('weekly_note_due');
  });
  it('今週分を送信済みなら出さない', () => {
    const items = attention([account()], [studied([note(addDays(THIS_WEEK, -7)), note(THIS_WEEK)])], { 'u-x': access() });
    expect(kinds(items)).not.toContain('weekly_note_due');
  });
  it('コメントが1件も無ければ「未送信」', () => {
    const items = attention([account()], [studied([])], { 'u-x': access() });
    expect(kinds(items)).toContain('weekly_note_due');
  });
  it('学習実績ゼロ（totalStudyDays=0）の生徒には出さない', () => {
    const l = learner({ settings: settingsWith([]) });
    const items = attention([account()], [l], { 'u-x': access() });
    expect(kinds(items)).not.toContain('weekly_note_due');
  });
});

describe('buildAttention: 全体項目と並び順', () => {
  const issue: AdminIssueReport = {
    id: 'i1', learnerId: null, sessionId: null, page: null, errorCode: null,
    userAgent: null, platform: null, online: null, comment: 'x', resolved: false, createdAt: NOW,
  };
  it('未解決の問題報告は全体で1項目（userId=null）', () => {
    const items = attention([], [], {}, {}, [issue]);
    const open = items.filter((i) => i.kind === 'open_issues');
    expect(open).toHaveLength(1);
    expect(open[0].userId).toBeNull();
    expect(open[0].severity).toBe('warn');
  });
  it('warn が info より先に並ぶ', () => {
    const l = learner({ settings: settingsWith([addDays(TODAY, -1)]) });
    const items = attention(
      [account()], [l],
      { 'u-x': access({ validUntilISO: `${addDays(TODAY, 10)}T23:59:59+09:00` }) }, {}, [issue],
    );
    const sevs = items.map((i) => i.severity);
    expect(sevs.indexOf('info')).toBeGreaterThan(sevs.lastIndexOf('warn'));
    expect(kinds(items)).toContain('expiring30');
  });
  it('要対応ゼロなら空配列（「今日は対応不要です」の根拠）', () => {
    const healthy = learner({ settings: settingsWith([TODAY, addDays(TODAY, -1)], [note(THIS_WEEK)]) });
    expect(attention([account()], [healthy], { 'u-x': access() })).toEqual([]);
  });
});

describe('buildKpis', () => {
  it('生徒数・未ログイン・今週学習・停滞・期限30日・コストの生徒/検証分離', () => {
    const accounts = [
      account({ userId: 'u-li' }),                                     // 学習中の生徒
      account({ userId: 'u-andy', userCreatedAtISO: daysAgoISO(5) }),  // 未ログイン生徒
      account({ userId: 'u-stall' }),                                  // 停滞生徒
      account({ userId: 'u-test' }),                                   // テスト
      account({ userId: 'u-sho', isAdminAccount: true }),              // 管理者
      account({ userId: 'u-other' }),                                  // その他
    ];
    const learners = [
      learner({ id: 'l-li', userId: 'u-li', settings: settingsWith([TODAY]) }),
      learner({ id: 'l-stall', userId: 'u-stall', settings: settingsWith([addDays(TODAY, -10)]) }),
      learner({ id: 'l-test', userId: 'u-test', isTest: true, settings: settingsWith([TODAY]) }),
      learner({ id: 'l-sho', userId: 'u-sho', settings: settingsWith([TODAY]) }),
    ];
    const accessMap = {
      'u-li': access({ userId: 'u-li', validUntilISO: `${addDays(TODAY, 20)}T23:59:59+09:00` }),
      'u-andy': access({ userId: 'u-andy' }),
      'u-stall': access({ userId: 'u-stall' }),
    };
    const usageMap: Record<string, LearnerUsageSummary> = {
      'l-li': { sessions: 10, costUsd: 2.5, lastDate: TODAY },
      'l-test': { sessions: 3, costUsd: 0.5, lastDate: TODAY },
      'l-sho': { sessions: 4, costUsd: 1.5, lastDate: TODAY },
    };
    const k = buildKpis(viewsOf(accounts, learners, accessMap, usageMap), NOW);
    expect(k.students).toBe(3);
    expect(k.notLoggedIn).toBe(1);
    expect(k.activeThisWeek).toBe(1);   // u-li（今日学習）。u-stall は10日前
    expect(k.stalled).toBe(1);          // u-stall
    expect(k.expiring30).toBe(1);       // u-li（残20日）
    expect(k.monthCostStudents).toBeCloseTo(2.5, 10);
    expect(k.monthCostOthers).toBeCloseTo(2.0, 10);  // テスト0.5 + 管理者1.5
  });
});
