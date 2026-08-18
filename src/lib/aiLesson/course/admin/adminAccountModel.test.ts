// アカウント結合モデルの受入テスト（2026-08-18 管理ページ刷新）。
// いちばん守りたいこと:
// - 種別は**DB由来の列だけ**から導出する（表示名『テスト』の実生徒kanaを誤爆しない）
// - 未ログインの発行済み生徒（andy/wang）が student として台帳に乗る
// - 「開始前なのに学習記録あり」（実例: kana）を矛盾として機械検知する
// - 最終学習は settings 由来と ai_usage_daily 由来の合成max（3系統乖離の解消）
import { describe, it, expect } from 'vitest';
import { accountTypeOf, buildAccountViews, monthlyCapOf } from './adminAccountModel';
import type { AdminAccountRow, UsageLimits } from './adminAccountsApi';
import type { AdminAccessRow, AdminLearnerRow, LearnerUsageSummary } from '../courseAdminApi';
import { defaultAdvProfile, writeAdvProfile } from '../adventure/advProfile';
import type { LearnerSettings } from '../types';
import type { AdvRoute } from '../adventure/advTypes';

const NOW = '2026-08-18T12:00:00+09:00';

const account = (over: Partial<AdminAccountRow> = {}): AdminAccountRow => ({
  userId: 'u-x', email: 'x@id.badminton-platform.pages.dev', loginId: 'x',
  userCreatedAtISO: '2026-08-01T00:00:00Z', lastSignInAtISO: null,
  isAdminAccount: false, learnerId: null,
  usage: { totalSessions: 0, totalSeconds: 0, totalCostUsd: 0, lastDate: null },
  convSessionsTotal: 0, ...over,
});

const learner = (over: Partial<AdminLearnerRow> = {}): AdminLearnerRow => ({
  id: 'l-x', userId: 'u-x', startedAtISO: '2026-08-10T00:00:00Z', displayName: 'X',
  preferredLanguage: 'zh', estimatedLevel: 'N3', difficultyLevel: 2, currentWeek: 1,
  isActive: true, hearing: {}, settings: {} as LearnerSettings, adminOverrides: {},
  createdAtISO: '2026-08-10T00:00:00Z', isTest: false, ...over,
});

const access = (over: Partial<AdminAccessRow> = {}): AdminAccessRow => ({
  userId: 'u-x', validFromISO: '2026-08-01T00:00:00+09:00', validUntilISO: '2026-11-30T23:59:59+09:00',
  note: null, updatedAtISO: '2026-08-01T00:00:00Z', planId: null, planVersion: null,
  source: 'manual', aiSecondsLimit: null, grantedBy: null, ...over,
});

const route: AdvRoute = {
  generatedAt: NOW, destinationJlpt: 'N2', destinationAreaId: 'area-n2',
  destinationLabelJa: 'N2', destinationLabelZh: 'N2', stages: [],
  explanationJa: '', explanationZh: '',
};

/** questLog に学習日を持つ settings（V2オンボーディング済み） */
const settingsWithStudy = (dateKeys: string[]): LearnerSettings =>
  writeAdvProfile({} as LearnerSettings, {
    ...defaultAdvProfile(NOW), route,
    questLog: dateKeys.map((dateKey) => ({ dateKey, completedSteps: 1, totalSteps: 3 })),
  }, NOW);

describe('accountTypeOf（種別はDB由来の列だけから導出する）', () => {
  it('ai_admins 照合が最優先で admin（sho/CEO。learnerやaccessがあっても）', () => {
    expect(accountTypeOf(account({ isAdminAccount: true }), learner(), access())).toBe('admin');
    expect(accountTypeOf(account({ isAdminAccount: true }), null, null)).toBe('admin');
  });
  it('learner.isTest または access.source=test で test（kaiwa/jlpt等）', () => {
    expect(accountTypeOf(account(), learner({ isTest: true }), null)).toBe('test');
    expect(accountTypeOf(account(), null, access({ source: 'test' }))).toBe('test');
  });
  it('表示名が『テスト』でも isTest=false なら student（実生徒kanaを誤爆しない）', () => {
    expect(accountTypeOf(account(), learner({ displayName: 'テスト', isTest: false }), access())).toBe('student');
  });
  it('access行だけ（未ログインのandy/wang）でも student', () => {
    expect(accountTypeOf(account(), null, access())).toBe('student');
  });
  it('learner行だけ（access未設定）でも student', () => {
    expect(accountTypeOf(account(), learner(), null)).toBe('student');
  });
  it('learnerもaccessも無い雑多アカウントは other', () => {
    expect(accountTypeOf(account(), null, null)).toBe('other');
  });
});

describe('buildAccountViews（結合・期間バッジ・矛盾・合成最終学習）', () => {
  it('期間バッジ: 利用中/開始前/期限切れ/未設定を accessStateOf と同じ判定で出す', () => {
    const accounts = [
      account({ userId: 'u-active' }), account({ userId: 'u-before' }),
      account({ userId: 'u-expired' }), account({ userId: 'u-none' }),
    ];
    const accessMap = {
      'u-active': access({ userId: 'u-active' }),
      'u-before': access({ userId: 'u-before', validFromISO: '2026-09-01T00:00:00+09:00' }),
      'u-expired': access({ userId: 'u-expired', validUntilISO: '2026-08-10T23:59:59+09:00' }),
    };
    const views = buildAccountViews(accounts, [], accessMap, {}, NOW);
    expect(views.map((v) => v.badge)).toEqual(['active', 'not_started', 'expired', 'none']);
  });

  it('矛盾検知: 開始前なのに learner がある（実例kana: valid_from=9/1だが8/18に登録済み）', () => {
    const kanaAccess = access({ userId: 'u-kana', validFromISO: '2026-09-01T00:00:00+09:00' });
    const kanaLearner = learner({ id: 'l-kana', userId: 'u-kana', displayName: 'テスト' });
    const [v] = buildAccountViews([account({ userId: 'u-kana' })], [kanaLearner], { 'u-kana': kanaAccess }, {}, NOW);
    expect(v.badge).toBe('not_started');
    expect(v.contradiction).toBe(true);
    expect(v.type).toBe('student');
  });

  it('矛盾検知: learner無しでも認証記録があれば矛盾', () => {
    const a = account({ userId: 'u-y', lastSignInAtISO: '2026-08-15T00:00:00Z' });
    const [v] = buildAccountViews([a], [], { 'u-y': access({ userId: 'u-y', validFromISO: '2026-09-01T00:00:00+09:00' }) }, {}, NOW);
    expect(v.contradiction).toBe(true);
  });

  it('開始前でもログイン・認証の痕跡が無ければ矛盾ではない（andy型の未来開始）', () => {
    const [v] = buildAccountViews(
      [account({ userId: 'u-z' })], [],
      { 'u-z': access({ userId: 'u-z', validFromISO: '2026-09-01T00:00:00+09:00' }) }, {}, NOW,
    );
    expect(v.contradiction).toBe(false);
  });

  it('合成最終学習: adv(8/17) と usage(8/8) の新しい方を採る', () => {
    const l = learner({ settings: settingsWithStudy(['2026-08-17']) });
    const a = account({ usage: { totalSessions: 5, totalSeconds: 600, totalCostUsd: 1, lastDate: '2026-08-08' } });
    const [v] = buildAccountViews([a], [l], {}, {}, NOW);
    expect(v.lastStudyDateKey).toBe('2026-08-17');
  });

  it('合成最終学習: usage側が新しければそちら（会話だけしてクエスト未実施の日）', () => {
    const l = learner({ settings: settingsWithStudy(['2026-08-08']) });
    const a = account({ usage: { totalSessions: 5, totalSeconds: 600, totalCostUsd: 1, lastDate: '2026-08-17' } });
    const [v] = buildAccountViews([a], [l], {}, {}, NOW);
    expect(v.lastStudyDateKey).toBe('2026-08-17');
  });

  it('未ログイン（learner無し）は adv/monthUsage が null・最終学習も無し', () => {
    const [v] = buildAccountViews([account({ userId: 'u-andy' })], [], { 'u-andy': access({ userId: 'u-andy' }) }, {}, NOW);
    expect(v.learner).toBeNull();
    expect(v.adv).toBeNull();
    expect(v.monthUsage).toBeNull();
    expect(v.lastStudyDateKey).toBeNull();
  });

  it('monthUsage は learner.id で引く（userId ではない）', () => {
    const usageMap: Record<string, LearnerUsageSummary> = { 'l-x': { sessions: 3, costUsd: 0.5, lastDate: '2026-08-15' } };
    const [v] = buildAccountViews([account()], [learner()], {}, usageMap, NOW);
    expect(v.monthUsage).toEqual({ sessions: 3, costUsd: 0.5, lastDate: '2026-08-15' });
  });

  it('残日数: 期限切れは負・利用中は正（期限30日以内の判定材料）', () => {
    const views = buildAccountViews(
      [account({ userId: 'u-a' }), account({ userId: 'u-b' })], [],
      {
        'u-a': access({ userId: 'u-a', validUntilISO: '2026-09-10T23:59:59+09:00' }),
        'u-b': access({ userId: 'u-b', validUntilISO: '2026-08-10T23:59:59+09:00' }),
      }, {}, NOW,
    );
    expect(views[0].daysToExpiry).toBeGreaterThan(0);
    expect(views[0].daysToExpiry).toBeLessThanOrEqual(30);
    expect(views[1].daysToExpiry).toBeLessThan(0);
  });
});

describe('monthlyCapOf（月次上限の単一解決）', () => {
  const limits: UsageLimits = { monthlyMaxSessions: 80, monthlyMaxSeconds: 21600 };
  it('learner個別の上書きが最優先', () => {
    const [v] = buildAccountViews([account()], [learner({ adminOverrides: { monthlyMaxSessions: 120 } })], {}, {}, NOW);
    expect(monthlyCapOf(v, limits)).toBe(120);
  });
  it('上書きが無ければ全体設定の値', () => {
    const [v] = buildAccountViews([account()], [learner()], {}, {}, NOW);
    expect(monthlyCapOf(v, limits)).toBe(80);
  });
  it('learner無し（未ログイン）でも全体設定の値を返す', () => {
    const [v] = buildAccountViews([account()], [], {}, {}, NOW);
    expect(monthlyCapOf(v, limits)).toBe(80);
  });
});
