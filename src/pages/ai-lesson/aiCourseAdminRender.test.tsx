// @vitest-environment jsdom
// 管理ページ刷新（2026-08-18）の描画検品テスト。
//
// 確かめること（検品仕様）:
//   1. 全タブ・全カードが「実データ props 経由」で描画される。
//      → seed した独自の値（$26.52 / 月77回 / XP777 / 7:77 等）が画面に現れることで、
//        ハードコードやダミー値では絶対に出ない数字が実データから流れてくるのを証明する。
//   2. 空データ（アカウント0・生徒0・セッション0）でも4タブ全部が壊れない。
//   3. RPC ai_admin_list_accounts が無い環境（マイグレーション未適用）でも
//      フェイルソフト合成（adminListLearners ∪ adminListAccess）でページが立つ。
//
// 日付は「今日から±N日」の相対で seed する（曜日・月境界に依存する断定はしない）。
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

const NOW_MS = Date.now();
const DAY = 86400000;
const iso = (deltaDays: number): string => new Date(NOW_MS + deltaDays * DAY).toISOString();
const JST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });
/** JSTの日付キー（YYYY-MM-DD）。today±N日 */
const key = (deltaDays: number): string => JST.format(new Date(NOW_MS + deltaDays * DAY));

const { db, rpcDown } = vi.hoisted(() => ({
  db: {
    ai_learners: [],
    ai_admins: [{ email: 'admin@example.com' }],
    ai_item_progress: [],
    ai_learning_sessions: [],
    ai_usage_daily: [],
    ai_config: [],
    ai_issue_reports: [],
    ai_course_access: [],
    rpc_accounts: [],       // RPC ai_admin_list_accounts の返り値（auth.users 相当）
    rpc_logins: [],         // RPC ai_admin_learner_logins（フェイルソフト用）
  } as Record<string, Record<string, unknown>[]>,
  // true にすると ai_admin_list_accounts がエラーを返す（マイグレーション未適用環境の再現）
  rpcDown: { accounts: false },
}));

vi.mock('../../services/supabaseClient', () => {
  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let mode: 'select' | 'update' | 'upsert' = 'select';
    let payload: Record<string, unknown> = {};
    const rows = () => (db[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    const exec = () => {
      if (mode === 'update') {
        for (const r of rows()) Object.assign(r, payload);
        return { data: null, error: null };
      }
      if (mode === 'upsert') {
        const hit = (db[table] ?? []).find((r) => r.user_id === payload.user_id);
        if (hit) Object.assign(hit, payload); else db[table].push({ ...payload });
        return { data: null, error: null };
      }
      return { data: rows(), error: null };
    };
    const api: Record<string, unknown> = {};
    Object.assign(api, {
      select: () => api,
      order: () => api,
      limit: () => api,
      gte: (c: string, v: string) => {
        // adminGetMonthlyUsageMap / adminGetUsageCost の usage_date >= 月初
        const arr = db[table] ?? [];
        db[`__gte_view_${table}`] = arr.filter((r) => String(r[c] ?? '') >= v);
        return {
          ...api,
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({
              data: (db[`__gte_view_${table}`] ?? []).filter((r) => filters.every(([c2, v2]) => r[c2] === v2)),
              error: null,
            }).then(res, rej),
          order: () => ({
            then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
              Promise.resolve({
                data: (db[`__gte_view_${table}`] ?? []).filter((r) => filters.every(([c2, v2]) => r[c2] === v2)),
                error: null,
              }).then(res, rej),
          }),
        };
      },
      eq: (c: string, v: unknown) => { filters.push([c, v]); return api; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (p: Record<string, unknown>) => { mode = 'update'; payload = p; return api; },
      upsert: (p: Record<string, unknown>) => { mode = 'upsert'; payload = p; return api; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    });
    return api;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: async (name: string) => {
        if (name === 'ai_admin_list_accounts') {
          if (rpcDown.accounts) return { data: null, error: { message: 'function does not exist' } };
          return { data: db.rpc_accounts, error: null };
        }
        if (name === 'ai_admin_learner_logins') return { data: db.rpc_logins, error: null };
        return { data: [], error: null };
      },
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'user-admin', email: 'admin@example.com' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import AiCourseAdminPage from './AiCourseAdminPage';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { defaultAdvProfile } from '../../lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../lib/aiLesson/course/adventure/advRoute';
import { weekStartKeyOf } from '../../lib/aiLesson/course/adventure/advTeacherNote';

const diag = {
  completedAt: iso(-30), knowledgeBand: 'n4_late', conversationBand: 'needs_assessment',
  vocabularyGapIds: [], grammarGapIds: [], listeningConfidence: 'none', supportNeed: 'grammar',
  recommendedStartAreaId: 'area03-toorimichi', routeExplanationJa: '', routeExplanationZh: '',
  askedQuestionKeys: [], conversationSampled: false,
};
const route = () => generateRoute({
  goalType: 'jlpt', targetJlpt: 'N3', knowledgeBand: 'n4_late',
  conversationBand: 'needs_assessment', diagnosis: diag as never, nowISO: iso(-30),
});

/** V2オンボーディング済みプロファイル（実測値だけを持つ） */
const profileOf = (over: Record<string, unknown>): Record<string, unknown> => ({
  ...defaultAdvProfile(iso(-30)), enabled: true, goalType: 'jlpt', targetJlpt: 'N3',
  dailyMinutes: 30, weeklyDays: 5, diagnosis: diag, route: route(), ...over,
});

const learnerRow = (o: Record<string, unknown>): Record<string, unknown> => ({
  created_at: iso(-30), updated_at: iso(0), preferred_language: 'zh', estimated_level: 'N3',
  difficulty_level: 2, current_week: 1, is_active: true, is_test: false,
  hearing: {}, admin_overrides: {}, settings: {}, ...o,
});

const accountRow = (o: Record<string, unknown>): Record<string, unknown> => ({
  user_created_at: iso(-30), last_sign_in_at: null, is_admin_account: false, learner_id: null,
  usage_total_sessions: 0, usage_total_seconds: 0, usage_total_cost_usd: 0,
  usage_last_date: null, conv_sessions_total: 0, ...o,
});

const clearDb = () => { for (const k of Object.keys(db)) if (k !== 'ai_admins') db[k].length = 0; };

/**
 * 実データ相当のフル seed。値はすべて「ハードコードでは出ない」独自の数字。
 *   李さん: 利用中・XP777・攻略2・今週学習・全期間 42回/70分/$12.34・会話累計25回
 *   美花さん: 停滞（最終学習10日前）＋期限20日後＋商品ひも付き（体験パスv1）
 *   太郎さん: 期限切れ
 *   佳奈さん: 開始前なのに学習記録あり（期間の矛盾）
 *   andy: アカウント発行済み・未ログイン（10日経過）
 *   テスト君: is_test / 翔子: 管理者 / ghost: その他（learnerもaccessも無し）
 */
const seedFull = () => {
  clearDb();
  rpcDown.accounts = false;
  db.ai_learners.push(
    learnerRow({
      id: 'learner-li', user_id: 'user-li', display_name: '李さん',
      settings: {
        adventureV2: profileOf({
          xp: 777,
          questLog: [
            { dateKey: key(-40), completedSteps: 1, totalSteps: 1 },   // 攻略1
            { dateKey: key(-10), completedSteps: 2, totalSteps: 3 },   // 未完
            { dateKey: key(0), completedSteps: 3, totalSteps: 3 },     // 攻略2（今日）
          ],
          mastery: { 'vocab-001': [{ dateKey: key(-10), tier: 'normal', correct: 5, total: 6, passed: true }] },
          mockLog: [{ mockId: 'mock-1', completedAt: iso(-10), dateKey: key(-10), level: 'N3', mode: 'short', totalCorrect: 8, totalQuestions: 10, totalUnanswered: 0, sectionsFinishedInTime: 2, sectionCount: 2 }],
          teacherNotes: [{ id: 'note-1', weekStartKey: weekStartKeyOf(key(0)), bodyJa: '今週もこの調子で。', authorLabel: '翔子先生', createdAtISO: iso(0), readAtISO: null }],
        }),
      },
    }),
    learnerRow({
      id: 'learner-mika', user_id: 'user-mika', display_name: '美花さん',
      settings: { adventureV2: profileOf({ xp: 50, questLog: [{ dateKey: key(-10), completedSteps: 2, totalSteps: 2 }] }) },
    }),
    learnerRow({
      id: 'learner-taro', user_id: 'user-taro', display_name: '太郎さん',
      settings: { adventureV2: profileOf({ questLog: [{ dateKey: key(-20), completedSteps: 1, totalSteps: 1 }] }) },
    }),
    learnerRow({
      id: 'learner-kana', user_id: 'user-kana', display_name: '佳奈さん', created_at: iso(-5),
      settings: { adventureV2: profileOf({ questLog: [{ dateKey: key(-40), completedSteps: 1, totalSteps: 1 }] }) },
    }),
    learnerRow({ id: 'learner-test', user_id: 'user-test', display_name: 'テスト君', is_test: true }),
    learnerRow({ id: 'learner-sho', user_id: 'user-sho', display_name: '翔子' }),
  );
  db.ai_course_access.push(
    { user_id: 'user-li', valid_from: iso(-60), valid_until: iso(120), note: '6ヶ月コース', granted_by: 'admin-ui', updated_at: iso(0), plan_id: null, plan_version: null, source: 'manual', ai_seconds_limit: null },
    { user_id: 'user-mika', valid_from: iso(-30), valid_until: iso(20), note: null, granted_by: 'admin-ui', updated_at: iso(0), plan_id: 'ai-trial-pass', plan_version: 1, source: 'manual', ai_seconds_limit: 3600 },
    { user_id: 'user-taro', valid_from: iso(-90), valid_until: iso(-5), note: '3ヶ月契約', granted_by: 'admin-ui', updated_at: iso(0), plan_id: null, plan_version: null, source: 'manual', ai_seconds_limit: null },
    { user_id: 'user-kana', valid_from: iso(14), valid_until: iso(104), note: '9月からの3ヶ月', granted_by: 'admin-ui', updated_at: iso(0), plan_id: null, plan_version: null, source: 'manual', ai_seconds_limit: null },
    { user_id: 'user-andy', valid_from: iso(-1), valid_until: iso(89), note: '3ヶ月', granted_by: 'admin-ui', updated_at: iso(0), plan_id: null, plan_version: null, source: 'manual', ai_seconds_limit: null },
  );
  db.rpc_accounts.push(
    accountRow({ user_id: 'user-li', email: 'li@id.badminton-platform.pages.dev', last_sign_in_at: iso(0), learner_id: 'learner-li', usage_total_sessions: 42, usage_total_seconds: 4200, usage_total_cost_usd: 12.34, usage_last_date: key(0), conv_sessions_total: 25 }),
    accountRow({ user_id: 'user-mika', email: 'mika@id.badminton-platform.pages.dev', last_sign_in_at: iso(-10), learner_id: 'learner-mika', usage_total_cost_usd: 2, usage_last_date: key(-10) }),
    accountRow({ user_id: 'user-taro', email: 'taro@id.badminton-platform.pages.dev', last_sign_in_at: iso(-20), learner_id: 'learner-taro', usage_total_cost_usd: 1, usage_last_date: key(-20) }),
    accountRow({ user_id: 'user-kana', email: 'kana@id.badminton-platform.pages.dev', last_sign_in_at: iso(-5), learner_id: 'learner-kana', usage_total_cost_usd: 0.5, usage_last_date: key(-40) }),
    accountRow({ user_id: 'user-andy', email: 'andy@id.badminton-platform.pages.dev', user_created_at: iso(-10) }),
    accountRow({ user_id: 'user-test', email: 'test@id.badminton-platform.pages.dev', last_sign_in_at: iso(-2), learner_id: 'learner-test', usage_total_cost_usd: 3 }),
    accountRow({ user_id: 'user-sho', email: 'shodorannga@gmail.com', is_admin_account: true, last_sign_in_at: iso(0), learner_id: 'learner-sho', usage_total_cost_usd: 7.68 }),
    accountRow({ user_id: 'user-ghost', email: 'ghost@example.com' }),
  );
  // 今月利用（usage_date は今日＝必ず月内）: 生徒 $3.21 / 検証（テスト＋管理者）$7.55
  db.ai_usage_daily.push(
    { learner_id: 'learner-li', usage_date: key(0), sessions_count: 7, seconds_used: 1200, estimated_cost_usd: 3.21 },
    { learner_id: 'learner-test', usage_date: key(0), sessions_count: 3, seconds_used: 300, estimated_cost_usd: 2 },
    { learner_id: 'learner-sho', usage_date: key(0), sessions_count: 5, seconds_used: 500, estimated_cost_usd: 5.55 },
  );
  // 上限は ai_config から（既定80ではない77にして、設定値が流れてくることを証明する）
  db.ai_config.push({ key: 'usage_limits', value: { monthly_max_sessions: 77, monthly_max_seconds: 2700 } });
  db.ai_issue_reports.push({ id: 'issue-1', learner_id: 'learner-li', session_id: null, page: '/study', error_code: null, user_agent: 'jsdom', platform: 'test', online: true, comment: '音が出ません', resolved: false, created_at: iso(0) });
  // 李さんの直近セッション（speech_metrics 付き2件＋なし1件）
  db.ai_learning_sessions.push(
    { id: 's1', learner_id: 'learner-li', mission_id: 'w1-1', mode: 'voice', lesson_kind: 'conversation', difficulty: 2, started_at: iso(0), ended_at: iso(0), duration_seconds: 180, completion_status: 'completed', end_reason: null, target_expression: '〜てもいいですか', target_used: true, target_used_independently: true, hints_used: 0, chinese_support_used: false, error_code: null, estimated_cost_usd: 0.4, report: { todaySummaryJa: '今日は注文の練習をしました' }, speech_metrics: { studentTurns: 4, studentChars: 120, longestStudentUtteranceChars: 40, reasonMarkers: 1, reusedExpressions: [] } },
    { id: 's2', learner_id: 'learner-li', mission_id: 'w1-2', mode: 'voice', lesson_kind: 'conversation', difficulty: 2, started_at: iso(-1), ended_at: iso(-1), duration_seconds: 200, completion_status: 'completed', end_reason: null, target_expression: '〜すぎる', target_used: true, target_used_independently: false, hints_used: 1, chinese_support_used: true, error_code: null, estimated_cost_usd: 0.5, report: null, speech_metrics: { studentTurns: 6, studentChars: 200, longestStudentUtteranceChars: 55, reasonMarkers: 0, reusedExpressions: [] } },
    { id: 's3', learner_id: 'learner-li', mission_id: 'w1-3', mode: 'voice', lesson_kind: 'conversation', difficulty: 2, started_at: iso(-2), ended_at: iso(-2), duration_seconds: 150, completion_status: 'interrupted', end_reason: 'user', target_expression: '〜ながら', target_used: false, target_used_independently: false, hints_used: 0, chinese_support_used: false, error_code: null, estimated_cost_usd: 0.3, report: null, speech_metrics: null },
  );
};

const seedEmpty = () => { clearDb(); rpcDown.accounts = false; };

/** RPC未適用環境: learners ∪ access のフェイルソフト合成で立つこと */
const seedFallback = () => {
  clearDb();
  rpcDown.accounts = true;
  db.ai_learners.push(learnerRow({
    id: 'learner-li', user_id: 'user-li', display_name: '李さん',
    settings: { adventureV2: profileOf({ questLog: [{ dateKey: key(0), completedSteps: 1, totalSteps: 1 }] }) },
  }));
  db.ai_course_access.push(
    { user_id: 'user-li', valid_from: iso(-60), valid_until: iso(120), note: '6ヶ月コース', granted_by: 'admin-ui', updated_at: iso(0) },
    { user_id: 'user-andy-0001-0000-000000000000', valid_from: iso(-1), valid_until: iso(89), note: '3ヶ月', granted_by: 'admin-ui', updated_at: iso(0) },
  );
  db.rpc_logins.push({ learner_id: 'learner-li', email: 'li@id.badminton-platform.pages.dev', last_sign_in_at: iso(0), user_created_at: iso(-30) });
};

const mount = () => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={['/ja/ai-course/admin']}>
      <LanguageProvider>
        <AiCourseAdminPage />
      </LanguageProvider>
    </MemoryRouter>
  </HelmetProvider>,
);

const gotoTab = (label: string) => {
  fireEvent.click(screen.getAllByRole('button', { name: label })[0]);
};

/** 分割テキスト（{a}/{b} 等）を含む要素の存在確認。タグ名で1要素に絞る */
const hasText = (tag: string, text: string): boolean =>
  Array.from(document.querySelectorAll(tag)).some((el) => (el.textContent ?? '').includes(text));

afterEach(cleanup);

describe('管理ページ描画検品: 実データ相当のフル構成', () => {
  it('今日タブ: KPIチップと要対応リストが seed 値どおりに出る', async () => {
    seedFull();
    mount();
    await screen.findByText('要対応');

    // KPI（生徒5・未ログイン1・今週学習1・停滞1・期限30日以内1）
    expect(screen.getByText('5人')).toBeTruthy();
    expect(screen.getByText('内 未ログイン1人')).toBeTruthy();
    // 今週学習/停滞/期限30日以内 はいずれも「1人」
    expect(screen.getAllByText('1人').length).toBe(3);
    // 今月AIコスト: 生徒 $3.21 / 検証分 $7.55（ai_usage_daily の実合算）
    expect(screen.getByText('$3.21')).toBeTruthy();
    expect(screen.getByText('検証分 $7.55')).toBeTruthy();

    // 要対応: 未ログイン / 期間の矛盾 / 期限切れ / 停滞 / 問題報告 / 期限30日 / 先生コメント
    expect(screen.getByText('未ログイン')).toBeTruthy();
    expect(screen.getByText(/andy: アカウント発行から10日/)).toBeTruthy();
    expect(screen.getByText('期間の矛盾')).toBeTruthy();
    expect(screen.getByText(/佳奈さん/)).toBeTruthy();
    expect(screen.getByText('期限切れ')).toBeTruthy();
    expect(screen.getByText('学習が停滞')).toBeTruthy();
    expect(screen.getByText(/美花さん: 最終学習から10日/)).toBeTruthy();
    expect(screen.getByText(/未解決の問題報告が1件/)).toBeTruthy();
    // 「期限30日以内」はKPIチップ＋要対応タイトルの2箇所
    expect(screen.getAllByText('期限30日以内').length).toBe(2);
    expect(screen.getByText(/受講期限まで残り20日/)).toBeTruthy();
    expect(screen.getByText('今週の先生コメント未送信')).toBeTruthy();

    // 要対応の「未ログイン」をタップ → andy の詳細（生徒タブ）へ飛ぶ
    fireEvent.click(screen.getByText(/andy: アカウント発行から10日/));
    await screen.findByText('アカウント発行済み・初回ログイン待ちです。ログイン後に学習データが表示されます。');
  });

  it('生徒タブ: 種別フィルタの母数と一覧の実値（7/77・累計$）が出る', async () => {
    seedFull();
    mount();
    await screen.findByText('要対応');
    gotoTab('生徒');

    // 種別フィルタの母数（生徒5/テスト1/管理者1/その他1/全部8）
    expect(screen.getByRole('button', { name: '生徒（5）' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'テスト（1）' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '管理者（1）' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'その他（1）' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '全部（8）' })).toBeTruthy();

    // 李さんのモバイルカード: 今月会話 7/77（ai_config の77が流れてくる）・累計$12.34（RPC全期間集計）
    const liCard = screen.getAllByRole('button', { name: /李さん/ })[0];
    expect(liCard.textContent).toContain('7/77');
    expect(liCard.textContent).toContain('累計$12.34');

    // 既定フィルタ=生徒。ghost（その他）は出ない → 全部に切り替えると出る
    expect(screen.queryByText(/ghost@example.com/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '全部（8）' }));
    expect(screen.getAllByText(/ghost@example.com/).length).toBeGreaterThan(0);
  });

  it('生徒詳細: XP777・攻略2・会話累計25回・全期間 42回/70分/$12.34・受講権パネルの日付が実値', async () => {
    seedFull();
    mount();
    await screen.findByText('要対応');
    gotoTab('生徒');
    fireEvent.click(screen.getAllByRole('button', { name: /李さん/ })[0]);
    await screen.findByText('冒険モードの学習状況');

    // V2サマリ（settings.adventureV2 の実測）
    expect(screen.getByText('777')).toBeTruthy();          // XP
    expect(screen.getByText('冒険完了').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('バトル').nextSibling?.textContent).toBe('1');
    expect(screen.getByText('ミニ模試').nextSibling?.textContent).toBe('1');
    expect(screen.getByText('累計学習').nextSibling?.textContent).toBe('3日');

    // AI会話統計（RPCの正確な全期間count）
    await screen.findByText('AI会話の統計');
    expect(screen.getByText('25回')).toBeTruthy();
    expect(screen.getByText(/直近3回の内訳/)).toBeTruthy();
    expect(screen.getByText('今日は注文の練習をしました')).toBeTruthy();
    // 除外＝speech_metrics の無い1件だけ（「除外数=全件」バグの回帰）
    expect(screen.getByText('1件')).toBeTruthy();

    // 全期間の累計行（RPC実測: 42回・4200秒→70分・$12.34）
    expect(hasText('p', '累計 42回・70分・$12.34（全期間）')).toBe(true);

    // この生徒の問題報告
    expect(screen.getByText(/この生徒の問題報告/)).toBeTruthy();
    expect(screen.getByText('音が出ません')).toBeTruthy();

    // 受講権パネル: 日付inputに ai_course_access の実値（JST）が入る
    await screen.findByText(/利用期間/);
    const dates = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    expect(dates[0].value).toBe(key(-60));
    expect(dates[1].value).toBe(key(120));
    expect((document.querySelector('input[placeholder*="メモ"]') as HTMLInputElement).value).toBe('6ヶ月コース');

    // 調整・コメント・操作パネルも実 learner から出ている
    expect(screen.getByText('学習設計の調整（先生用）')).toBeTruthy();
    expect(screen.getByText('管理操作')).toBeTruthy();
  });

  it('受講権タブ: 台帳が全8件・商品ひも付け（体験パスv1）と手動noteが区別されて出る', async () => {
    seedFull();
    mount();
    await screen.findByText('要対応');
    gotoTab('受講権');
    await screen.findByText(/受講権の台帳/);

    expect(hasText('p', '受講権の台帳（全8件）')).toBe(true);
    // 美花さん: planCatalog 由来の商品名＋付与時版
    expect(hasText('p', 'AI体験パス（v1）')).toBe(true);
    // 李さん: 商品なし＝手動note がそのまま商品列に出る
    expect(hasText('p', '6ヶ月コース')).toBe(true);
    // 商品カタログ現況（planCatalog.ts の3商品）
    expect(screen.getByText('商品カタログ（planCatalog.ts）')).toBeTruthy();
    expect(screen.getAllByText(/AI体験パス/).length).toBeGreaterThan(1);
    expect(screen.getByText('1か月AIお試し')).toBeTruthy();
    expect(screen.getByText('6か月 AI日本語伴走コース')).toBeTruthy();
  });

  it('運用タブ: コスト実合算（$10.76/$26.52）・上限77回45分・問題報告・テスト削除1件', async () => {
    seedFull();
    mount();
    await screen.findByText('要対応');
    gotoTab('運用');
    await screen.findByText('AI利用コスト（全体）');

    expect(screen.getByText('$10.76')).toBeTruthy();       // 今月合計 3.21+2+5.55
    expect(screen.getByText('$3.21')).toBeTruthy();        // うち生徒分
    expect(screen.getByText('$7.55')).toBeTruthy();        // うち検証分
    expect(screen.getByText('$26.52')).toBeTruthy();       // 累計（RPC全期間の合算）
    expect(hasText('p', '月77回・45分')).toBe(true);        // ai_config 由来（既定80/360分ではない）
    expect(screen.getByText('音が出ません')).toBeTruthy();  // 問題報告
    expect(screen.getByRole('button', { name: /テスト用生徒データを一括削除（1件）/ })).toBeTruthy();
  });
});

describe('管理ページ描画検品: 空データ（生徒0・セッション0）', () => {
  it('4タブ全部が壊れずに空表示になる', async () => {
    seedEmpty();
    mount();
    await screen.findByText('要対応');

    // 今日: 0人チップ＋対応不要
    expect(screen.getAllByText('0人').length).toBe(4);
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.getByText('今日は対応不要です')).toBeTruthy();

    gotoTab('生徒');
    await screen.findByText('該当するアカウントがありません。');
    expect(screen.getByRole('button', { name: '全部（0）' })).toBeTruthy();

    gotoTab('受講権');
    await screen.findByText('アカウントがありません。');
    expect(screen.getByText('商品カタログ（planCatalog.ts）')).toBeTruthy();

    gotoTab('運用');
    await screen.findByText('AI利用コスト（全体）');
    expect(screen.getByText('報告はまだありません。')).toBeTruthy();
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(2);
    const del = screen.getByRole('button', { name: /テスト用生徒データを一括削除（0件）/ });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('管理ページ描画検品: RPC未適用環境のフェイルソフト', () => {
  it('ai_admin_list_accounts が無くても learners∪access の合成でページが立つ', async () => {
    seedFallback();
    mount();
    await screen.findByText('要対応');

    gotoTab('生徒');
    const liCard = (await screen.findAllByRole('button', { name: /李さん/ }))[0];
    // フェイルソフトでは全期間集計が取れないため 0 表示（見かけの値は出さない設計）
    expect(liCard.textContent).toContain('累計$0.00');

    gotoTab('受講権');
    await screen.findByText(/受講権の台帳/);
    expect(hasText('p', '受講権の台帳（全2件）')).toBe(true);  // learner行 + access単独行
  });
});
