// @vitest-environment jsdom
// P0回帰テスト（管理ページ刷新 2026-08-18 §4）: stale settings 上書きの恒久解消。
//
// 旧実装のバグ: onApplied が learner 行を取り直さず、2回連続で設定を書くと
// 2回目の writeAdvProfile が「古い settings」を土台に全書き戻しして1回目が黙って消えた。
// 新実装の約束: settings を書く全経路は完了後に必ず refreshLearnerRow（adminGetLearner の
// 単行再取得）を await する。ここでは本物の AiCourseAdminPage をレンダリングし、
// supabase クライアントだけをメモリ表に差し替えて（=モック）、
// 「2回目の adminUpdateLearner に渡る settings に1回目の変更が含まれること」をDB側の値で確認する。
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const NOW = new Date().toISOString();

const { db } = vi.hoisted(() => ({
  db: {
    ai_learners: [],
    ai_admins: [{ email: 'admin@example.com' }],
    ai_item_progress: [],
    ai_learning_sessions: [],
    ai_usage_daily: [],
    ai_config: [],
    ai_issue_reports: [],
    ai_course_access: [],
    // RPC ai_admin_list_accounts が返す全アカウント（auth.users 相当）
    rpc_accounts: [],
  } as Record<string, Record<string, unknown>[]>,
}));

vi.mock('../../services/supabaseClient', () => {
  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let mode: 'select' | 'update' | 'upsert' = 'select';
    let payload: Record<string, unknown> = {};
    const rows = () => (db[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    const exec = () => {
      if (mode === 'update') {
        // 本物の adminUpdateLearner は .update({ settings }) で settings 列を丸ごと差し替える
        for (const r of rows()) Object.assign(r, payload);
        return { data: null, error: null };
      }
      if (mode === 'upsert') {
        // adminSetAccess は onConflict: 'user_id' の upsert
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
      gte: () => api,
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
        if (name === 'ai_admin_list_accounts') return { data: db.rpc_accounts, error: null };
        return { data: [], error: null };
      },
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'user-1', email: 'admin@example.com' } } } }),
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

const diag = {
  completedAt: NOW, knowledgeBand: 'n4_late', conversationBand: 'needs_assessment',
  vocabularyGapIds: [], grammarGapIds: [], listeningConfidence: 'none', supportNeed: 'grammar',
  recommendedStartAreaId: 'area03-toorimichi', routeExplanationJa: '', routeExplanationZh: '',
  askedQuestionKeys: [], conversationSampled: false,
};

const seed = () => {
  db.ai_learners.length = 0;
  db.ai_learners.push({
    id: 'learner-1', user_id: 'user-9', created_at: NOW, updated_at: NOW,
    display_name: '李さん', preferred_language: 'zh', estimated_level: 'N3',
    difficulty_level: 2, current_week: 1, is_active: true, is_test: false,
    hearing: {}, admin_overrides: {},
    settings: {
      adventureV2: {
        ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt', targetJlpt: 'N3',
        dailyMinutes: 30, weeklyDays: 5, diagnosis: diag,
        route: generateRoute({
          goalType: 'jlpt', targetJlpt: 'N3', knowledgeBand: 'n4_late',
          conversationBand: 'needs_assessment', diagnosis: diag as never, nowISO: NOW,
        }),
      },
    },
  });
  db.ai_course_access.length = 0;
  db.ai_course_access.push({
    user_id: 'user-9', valid_from: '2026-08-01T00:00:00+09:00', valid_until: '2027-08-01T23:59:59+09:00',
    note: '李さん: テスト用期間', granted_by: 'admin-ui', updated_at: NOW,
    plan_id: null, plan_version: null, source: 'manual', ai_seconds_limit: null,
  });
  // andy 相当: アカウント発行済み・access 行あり・learner 未作成（未ログイン）
  db.ai_course_access.push({
    user_id: 'user-andy', valid_from: '2026-09-01T00:00:00+09:00', valid_until: '2026-11-14T23:59:59+09:00',
    note: 'アンディさん: 3ヶ月', granted_by: 'admin-ui', updated_at: NOW,
    plan_id: null, plan_version: null, source: 'manual', ai_seconds_limit: null,
  });
  db.rpc_accounts.length = 0;
  db.rpc_accounts.push({
    user_id: 'user-9', email: 'li@id.badminton-platform.pages.dev',
    user_created_at: NOW, last_sign_in_at: NOW,
    is_admin_account: false, learner_id: 'learner-1',
    usage_total_sessions: 0, usage_total_seconds: 0, usage_total_cost_usd: 0,
    usage_last_date: null, conv_sessions_total: 0,
  }, {
    user_id: 'user-andy', email: 'andy@id.badminton-platform.pages.dev',
    user_created_at: NOW, last_sign_in_at: null,
    is_admin_account: false, learner_id: null,
    usage_total_sessions: 0, usage_total_seconds: 0, usage_total_cost_usd: 0,
    usage_last_date: null, conv_sessions_total: 0,
  });
};

const adv = () => {
  const s = db.ai_learners[0].settings as { adventureV2: Record<string, unknown> };
  return s.adventureV2;
};
const dbBand = () => (adv().diagnosis as { knowledgeBand?: string } | null)?.knowledgeBand ?? null;
const dbMinutes = () => adv().dailyMinutes as number | null;
const dbNotes = () => (adv().teacherNotes as unknown[] | undefined) ?? [];

const mount = () => render(
  <HelmetProvider>
    <MemoryRouter initialEntries={['/ja/ai-course/admin']}>
      <LanguageProvider>
        <AiCourseAdminPage />
      </LanguageProvider>
    </MemoryRouter>
  </HelmetProvider>,
);

/** 生徒タブ → 李さんの詳細ビューを開く（学習設計調整パネルが出るまで） */
const openLiDetail = async () => {
  mount();
  await screen.findByText('要対応');                                   // 今日タブがロード完了
  fireEvent.click(screen.getAllByRole('button', { name: '生徒' })[0]); // タブバー（sm用が先頭）
  const row = await screen.findByRole('button', { name: /李さん/ });   // モバイルカード（テーブル行はbutton roleでない）
  fireEvent.click(row);
  await screen.findByText('学習設計の調整（先生用）');
};

const selectWithOption = (value: string): HTMLSelectElement => {
  const all = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
  const hit = all.filter((s) => Array.from(s.options).some((o) => o.value === value));
  if (hit.length !== 1) throw new Error(`select for value=${value} not unique: ${hit.length}`);
  return hit[0];
};

const applyPlan = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'この設計で道を引き直す' }));
  await waitFor(() => expect(screen.getByText('適用しました（記録はそのまま）')).toBeTruthy());
};

beforeEach(seed);
afterEach(cleanup);

describe('管理ページ: 連続適用で1回目が消えない（P0・stale settings上書きの回帰）', () => {
  it('学習設計調整を2回連続適用しても、1回目の変更（現在地n5）がDBに残る', async () => {
    await openLiDetail();

    // ①現在地を n5 に
    fireEvent.change(selectWithOption('n5'), { target: { value: 'n5' } });
    await applyPlan();
    expect(dbBand()).toBe('n5');

    // ②同じ画面のまま 1日の量を15分に（旧実装ではここで①が n4_late に巻き戻った）
    fireEvent.change(selectWithOption('15'), { target: { value: '15' } });
    await applyPlan();
    expect(dbMinutes()).toBe(15);
    expect(dbBand()).toBe('n5');   // ← 1回目の変更が2回目の書き込み後も生きている
  });

  it('学習設計調整→先生コメント送信の連続実行でも、コメントの書き込みが調整後のsettingsを土台にする', async () => {
    await openLiDetail();

    // ①現在地を n5 に
    fireEvent.change(selectWithOption('n5'), { target: { value: 'n5' } });
    await applyPlan();
    expect(dbBand()).toBe('n5');

    // ②同じ画面のまま先生コメントを送信（settings 全書き戻しの2回目の書き込み）
    const bodyJa = document.querySelectorAll('textarea')[0] as HTMLTextAreaElement; // 先生コメントの日本語欄（DOM順で先頭）
    fireEvent.change(bodyJa, { target: { value: '今週もよく続けましたね。' } });
    fireEvent.click(screen.getByRole('button', { name: '生徒のホームに出す' }));
    await waitFor(() => expect(screen.getByText(/出しました/)).toBeTruthy());

    expect(dbNotes().length).toBe(1);   // コメントは書かれた
    expect(dbBand()).toBe('n5');        // かつ①の調整が消えていない（=最新settingsが土台）
  });

  it('受講権タブ: learner未作成（未ログイン）のアカウントでも期間を変更できる（SQL直叩きの穴の解消）', async () => {
    mount();
    await screen.findByText('要対応');
    fireEvent.click(screen.getAllByRole('button', { name: '受講権' })[0]);
    await screen.findByText(/受講権の台帳/);

    // andy の行（未ログインバッジ付き）を開く
    fireEvent.click(screen.getByRole('button', { name: /andy/ }));
    await screen.findByText('アカウント発行済み・初回ログイン待ちです。期間はここで先に設定できます。');

    // 開始日を 9/1 → 8/18 に前倒しして保存
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: '2026-08-18' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByText('保存しました')).toBeTruthy());

    const andy = db.ai_course_access.find((r) => r.user_id === 'user-andy');
    expect(andy?.valid_from).toBe('2026-08-18T00:00:00+09:00');
    expect(andy?.valid_until).toBe('2026-11-14T23:59:59+09:00');  // 変えていない側は保持
    expect(andy?.granted_by).toBe('admin-ui');
  });
});
