// 管理者向け 4タブ管理ページ（2026-08-18 全面刷新）。ai_admins のRLSで保護。
// 一般ユーザーがアクセスしても、RLSにより他人のデータは取得できない（空表示）。
//
// 情報設計（刷新仕様 §1）:
//   [今日]   KPIチップ＋自動生成の要対応リスト（全員クリックしないと異常が見えない現状の廃止）
//   [生徒]   auth.users 起点の統合一覧（未ログインの発行済み生徒も見える）→ 選択で詳細ビュー
//   [受講権] アカウント×期間×商品の台帳＋商品カタログ現況
//   [運用]   問題報告 / コスト全体 / 上限設定 / テストデータ一括削除
//
// P0（stale settings 上書き）の恒久解消（§4）:
//   settings を書く全経路（学習設計調整・先生コメント・管理操作）は、書き込み完了後に必ず
//   refreshLearnerRow を await して learner 1行をDBから取り直す。選択中の生徒は learners
//   配列から導出しているため、配列の差し替えだけで詳細ビューも最新になる。
//   （旧実装は onApplied が learner 行を取り直さず、2回連続適用で1回目が黙って消えた）
//
// 管理UIは日本語ハードコード（管理者=CEOは日本人。刷新仕様 原則5）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { KeyRound, Sun, Users, Wrench, BookOpenCheck } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { parseAdminDeepLink, initialAdminTab, matchAccount } from '../../lib/aiLesson/course/admin/adminDeepLink';
import { aiCourseI18n } from '../../locales/aiCourse';
import { CourseHeader } from '../../components/ai-course/CourseHeader';
import { isCourseAdmin, getSession } from '../../lib/aiLesson/course/courseAuth';
import {
  adminDeleteTestLearners, adminDeleteUtterances, adminGetLearner, adminGetMonthlyUsageMap,
  adminGetProgress, adminGetSessions, adminGetUsageCost, adminListAccess, adminListIssueReports,
  adminListTopups, adminAddTopup, adminDeleteTopup,
  adminListLearners, adminResolveIssue, adminUpdateLearner,
} from '../../lib/aiLesson/course/courseAdminApi';
import type {
  AdminAccessRow, AdminIssueReport, AdminLearnerRow, AdminUsageCost, LearnerUsageSummary, CostTopupRow } from '../../lib/aiLesson/course/courseAdminApi';
import { adminGetUsageLimits, adminListAccounts } from '../../lib/aiLesson/course/admin/adminAccountsApi';
import type { AdminAccountRow, UsageLimits } from '../../lib/aiLesson/course/admin/adminAccountsApi';
import { buildAccountViews } from '../../lib/aiLesson/course/admin/adminAccountModel';
import type { AdminAccountType } from '../../lib/aiLesson/course/admin/adminAccountModel';
import { buildAttention, buildKpis } from '../../lib/aiLesson/course/admin/adminAttention';
import { DEFAULT_USAGE_LIMITS } from '../../lib/aiLesson/course/courseConfig';
import { AdminTodayTab } from '../../components/ai-course/admin/AdminTodayTab';
import { AdminFunnelCard } from '../../components/ai-course/admin/AdminFunnelCard';
import { AdminAlertsPanel } from '../../components/ai-course/admin/AdminAlertsPanel';
import { AdminContentReviewTab } from '../../components/ai-course/admin/AdminContentReviewTab';
import { AdminStudentsTab, displayNameOf } from '../../components/ai-course/admin/AdminStudentsTab';
import { AdminStudentDetail } from '../../components/ai-course/admin/AdminStudentDetail';
import { AdminAccessLedgerTab } from '../../components/ai-course/admin/AdminAccessLedgerTab';
import { AdminOpsTab } from '../../components/ai-course/admin/AdminOpsTab';
import { AdminAccessPanel } from '../../components/ai-course/admin/AdminAccessPanel';
import { AdminTeacherPlanPanel } from '../../components/ai-course/admin/AdminTeacherPlanPanel';
import { AdminTeacherNotePanel } from '../../components/ai-course/admin/AdminTeacherNotePanel';
import { AdminControlsPanel } from '../../components/ai-course/admin/AdminControlsPanel';
import type { AdminLearnerPatch } from '../../components/ai-course/admin/AdminControlsPanel';
import type { CourseSessionRecord, ItemProgress } from '../../lib/aiLesson/course/types';

type AdminTab = 'today' | 'students' | 'access' | 'ops' | 'content';

/**
 * タブと役割の一言説明（2026-08-19 CEO「受講権タブと生徒タブどう違う？」への恒久対応）。
 * - 生徒 = **学習の中身**（ログインして学習を始めた人の進捗・調整・コメント）
 * - 受講権 = **契約の台帳**（発行した全アカウント。未ログインの人もここに出る。期間と商品）
 * 選択中タブの説明をタブバー直下に常時出す
 */
const TABS: { id: AdminTab; label: string; desc: string; Icon: typeof Sun }[] = [
  { id: 'today', label: '今日', desc: '今日の要対応まとめ。学習した人・止まっている人・期限接近・矛盾がここに並びます', Icon: Sun },
  { id: 'students', label: '生徒', desc: '学習の中身。ログインして学習を始めた人の進捗を見る・調整する場所です', Icon: Users },
  { id: 'access', label: '受講権', desc: '契約の台帳。発行した全アカウント（未ログイン含む）の利用期間・商品を管理する場所です', Icon: KeyRound },
  { id: 'content', label: '教材', desc: '教材を1件ずつ人の目で確認する場所。語彙・N2文法・聴解の内容と音声をチェックします', Icon: BookOpenCheck },
  { id: 'ops', label: '運用', desc: '課題報告・AIコスト残高・上限設定・テストデータ削除', Icon: Wrench },
];

interface DetailData {
  progress: ItemProgress[];
  sessions: CourseSessionRecord[];
  usageCost: AdminUsageCost | null;
}
const EMPTY_DETAIL: DetailData = { progress: [], sessions: [], usageCost: null };

export default function AiCourseAdminPage() {
  const { lang } = useLanguage();
  const t = aiCourseI18n[lang === 'zh' ? 'zh' : 'ja'];
  const ta = t.admin;
  const [state, setState] = useState<'loading' | 'nologin' | 'noauth' | 'ready'>('loading');
  /**
   * 直リンクで開いたときの指定（2026-08-23）。
   * 点検ボードの1行から「その人の画面」へ直接来られるようにする。
   *   ?tab=students&account=wang  … 学習IDでもメールでもuserIdでも当てる
   * 情報を探しに行かせた時点で使われなくなる（管理ページが実際そうなった）ので、
   * ボード→操作をひと跳びにする
   */
  const deepLink = useMemo(
    () => parseAdminDeepLink(typeof window === 'undefined' ? '' : window.location.search), []);
  const [tab, setTab] = useState<AdminTab>(initialAdminTab(deepLink));

  // ── データ（§7 ページのデータロード） ──
  const [accounts, setAccounts] = useState<AdminAccountRow[]>([]);
  const [learners, setLearners] = useState<AdminLearnerRow[]>([]);
  const [accessMap, setAccessMap] = useState<Record<string, AdminAccessRow>>({});
  const [usageMap, setUsageMap] = useState<Record<string, LearnerUsageSummary>>({});
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [issues, setIssues] = useState<AdminIssueReport[]>([]);

  // ── UI状態 ──
  const [filter, setFilter] = useState<AdminAccountType | 'all'>('student');
  const [selUserId, setSelUserId] = useState<string | null>(null);
  // 詳細データは「どの learner のものか」を持たせ、表示側で一致チェックする
  // （選択切替時に effect 内で同期 setState して消す必要をなくす）
  const [detail, setDetail] = useState<{ learnerId: string; data: DetailData } | null>(null);
  const [saved, setSaved] = useState(false);
  const [utterMsg, setUtterMsg] = useState('');   // 発話ログ削除の結果（詳細ビュー）
  const [opsMsg, setOpsMsg] = useState('');       // テストデータ削除の結果（運用タブ）
  /** 直リンクで指定された人が見つからなかったとき（黙って別の画面を出さない） */
  const [deepLinkMiss, setDeepLinkMiss] = useState<string | null>(null);
  const [topups, setTopups] = useState<CostTopupRow[]>([]);   // AIコストのチャージ記録

  const loadAll = useCallback(async () => {
    const [acc, lrs, access, usage, lim, iss, tps] = await Promise.all([
      adminListAccounts(), adminListLearners(), adminListAccess(),
      adminGetMonthlyUsageMap(), adminGetUsageLimits(), adminListIssueReports(),
      adminListTopups(),
    ]);
    setAccounts(acc); setLearners(lrs); setAccessMap(access);
    setUsageMap(usage); setLimits(lim); setIssues(iss); setTopups(tps);
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getSession();
      if (!user) { setState('nologin'); return; }
      if (!(await isCourseAdmin())) { setState('noauth'); return; }
      await loadAll();
      setState('ready');
    })();
  }, [loadAll]);

  // 上限の単一ソース（§2.2）。ロード完了前だけ既定値（adminGetUsageLimits と同じ既定）
  const effLimits = useMemo<UsageLimits>(() => limits ?? {
    monthlyMaxSessions: DEFAULT_USAGE_LIMITS.monthly_max_sessions,
    monthlyMaxSeconds: DEFAULT_USAGE_LIMITS.monthly_max_seconds,
  }, [limits]);

  // アカウント統合ビュー＋KPI＋要対応（すべて実データ集計の純関数・原則13）
  const model = useMemo(() => {
    const nowISO = new Date().toISOString();
    const views = buildAccountViews(accounts, learners, accessMap, usageMap, nowISO);
    return {
      views,
      kpis: buildKpis(views, nowISO),
      attention: buildAttention(views, issues.filter((r) => !r.resolved), effLimits, nowISO),
    };
  }, [accounts, learners, accessMap, usageMap, issues, effLimits]);

  const totalCostAll = useMemo(
    () => accounts.reduce((s, a) => s + a.usage.totalCostUsd, 0), [accounts]);
  const testLearners = useMemo(() => learners.filter((l) => l.isTest), [learners]);

  /**
   * P0: stale settings 上書きの恒久解消（刷新仕様 §4）。
   * settings を書く操作の完了後は必ずこれを await し、learner 1行をDBから取り直す。
   * 古い settings を土台に writeAdvProfile で全書き戻しすると直前の変更が黙って消えるため、
   * 「書いたら取り直す」をページの唯一の約束にする。
   */
  const refreshLearnerRow = useCallback(async (learnerId: string) => {
    const fresh = await adminGetLearner(learnerId);
    if (fresh) setLearners((prev) => prev.map((l) => (l.id === learnerId ? fresh : l)));
  }, []);

  // 選択中アカウント（learners 配列から毎render導出＝差し替えだけで最新になる）
  const selView = selUserId
    ? model.views.find((v) => v.account.userId === selUserId) ?? null
    : null;
  const selLearner = selView?.learner ?? null;
  // 選択中 learner のものだけを表示（他人の・古い選択のデータは出さない）
  const selDetail: DetailData =
    selLearner && detail?.learnerId === selLearner.id ? detail.data : EMPTY_DETAIL;

  // 詳細ビューの付随データ。learner 行が差し替わったら（=設定を書いたら）取り直す
  useEffect(() => {
    if (!selUserId || !limits) return;
    const learner = learners.find((l) => l.userId === selUserId) ?? null;
    if (!learner) return;
    let alive = true;
    void (async () => {
      const [progress, sessions, usageCost] = await Promise.all([
        adminGetProgress(learner.id),
        adminGetSessions(learner.id, 60),   // 直近60回（§8: 内訳・成長根拠のソース）
        adminGetUsageCost(learner, limits),
      ]);
      if (alive) setDetail({ learnerId: learner.id, data: { progress, sessions, usageCost } });
    })();
    return () => { alive = false; };
  }, [selUserId, learners, limits]);

  /**
   * 直リンクの account= を、アカウント一覧が届いた時点で1回だけ解決する。
   * 学習ID・メール・userId のどれでも当てる（ボードは学習IDを出している）
   */
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !deepLink.account || accounts.length === 0) return;
    deepLinkDone.current = true;
    const hit = matchAccount(accounts, deepLink.account);
    if (hit) { setTab('students'); setSelUserId(hit.userId); }
    else setDeepLinkMiss(deepLink.account);
  }, [accounts, deepLink.account]);

  // ── ハンドラ群 ──

  const openAccount = useCallback((userId: string) => {
    setTab('students');
    setSelUserId(userId);
    setSaved(false);
    setUtterMsg('');
  }, []);

  const reloadAccess = useCallback(async () => {
    setAccessMap(await adminListAccess());
  }, []);

  const updateLearner = useCallback(async (learnerId: string, patch: AdminLearnerPatch) => {
    const ok = await adminUpdateLearner(learnerId, patch);
    if (ok) {
      await refreshLearnerRow(learnerId);   // P0: 書いたら必ず単行再取得
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    }
  }, [refreshLearnerRow]);

  const deleteUtterances = useCallback(async (learnerId: string) => {
    const n = await adminDeleteUtterances(learnerId);
    setUtterMsg(`発話ログを${n}件削除しました`);
  }, []);

  const resolveIssue = useCallback(async (id: string, resolved: boolean) => {
    await adminResolveIssue(id, resolved);
    setIssues(await adminListIssueReports());
  }, []);

  const deleteTestLearners = useCallback(async (): Promise<number> => {
    const n = await adminDeleteTestLearners();
    setOpsMsg(`テスト用の学習データを${n}件削除しました`);
    await loadAll();
    return n;
  }, [loadAll]);

  // ── 詳細ビューへ注入するパネル群（§3.5。selLearner の narrowing はJSX内でも維持される） ──
  const panels = selView && (
    <div>
      <AdminAccessPanel
        userId={selView.account.userId}
        labelJa={displayNameOf(selView)}
        row={selView.access}
        learnerExists={selLearner !== null}
        lastSignInAtISO={selView.account.lastSignInAtISO}
        onSaved={reloadAccess}
      />
      {selLearner && (
        <>
          <AdminTeacherPlanPanel learner={selLearner}
            onApplied={() => refreshLearnerRow(selLearner.id)} />
          <AdminTeacherNotePanel learner={selLearner}
            onApplied={() => refreshLearnerRow(selLearner.id)} />
          <AdminControlsPanel learner={selLearner} saved={saved} dataMsg={utterMsg}
            onUpdate={(p) => updateLearner(selLearner.id, p)}
            onDeleteUtterances={() => deleteUtterances(selLearner.id)} />
        </>
      )}
    </div>
  );

  if (state === 'loading') return (
    <><CourseHeader t={t} /><div className="max-w-md mx-auto px-4 py-12 text-center text-gray-500">{t.common.loading}</div></>
  );
  /**
   * 未ログイン（2026-08-19 CEO報告）。以前は権限なしと同じ「管理者のみ」を出して
   * 突き放していたが、stagingと本番はドメインが別＝ログインが引き継がれないため、
   * ログイン済みのつもりのCEOがここに落ちて詰まった。ログインへの道を出す
   */
  if (state === 'nologin') return (
    <>
      <CourseHeader t={t} />
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-sm text-gray-600">ログインしていません。管理者アカウントでログインしてください。</p>
        <p className="mt-2 text-xs text-gray-400">※ staging と本番は別サイトなので、ログインもそれぞれ必要です</p>
        <a href={`/${lang === 'zh' ? 'zh' : 'ja'}/login`}
          className="mt-6 inline-block w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">
          ログイン画面へ
        </a>
      </div>
    </>
  );
  if (state === 'noauth') return (
    <>
      <CourseHeader t={t} />
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-sm text-gray-600">{ta.noAccess}</p>
      </div>
    </>
  );

  return (
    <>
      <CourseHeader t={t} />
      <Helmet><title>{ta.title} | kawabado</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      {/* バド側の管理画面へ戻る（2026-08-18 CEO指示: 相互に行き来できるように） */}
      <div className="max-w-5xl mx-auto px-4 pt-3">
        <a href="/ja/admin" className="text-sm text-emerald-700 underline-offset-2 hover:underline">← バドミントン管理画面へ</a>
      </div>
      {/* 直リンクの人が見つからなかった（消えた・IDが変わった）。黙って別の画面を出さない */}
      {deepLinkMiss && (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            「{deepLinkMiss}」のアカウントが見つかりませんでした。一覧から探してください。
          </p>
        </div>
      )}
      {/* モバイルは下固定タブバーの分だけ pb を確保（§6） */}
      <div className="max-w-5xl mx-auto px-4 py-4 pb-24 sm:pb-8">
        <h1 className="text-lg font-bold text-gray-900 mb-3">{ta.title}</h1>

        {/* sm以上: コンテンツ上部の通常タブ */}
        <div className="hidden sm:flex gap-1 mb-4 rounded-xl border border-gray-200 bg-white p-1">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`flex-1 min-h-11 rounded-lg text-sm inline-flex items-center justify-center gap-1.5 ${tab === id
                ? 'bg-blue-50 text-blue-700 font-bold'
                : 'text-gray-600 font-medium hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
        {/* いま開いているタブの役割（モバイルでも出す） */}
        <p className="mb-4 -mt-1 text-xs text-gray-500">{TABS.find((x) => x.id === tab)?.desc}</p>

        {tab === 'today' && (
          <div className="space-y-4">
            <AdminTodayTab kpis={model.kpis} items={model.attention}
              onOpenAccount={openAccount} onOpenOps={() => setTab('ops')} />
            {/* 学習ファネル（Phase 1 計測基盤）。自前fetchなので model には触らない */}
            <AdminFunnelCard />
          </div>
        )}

        {tab === 'students' && (selView ? (
          <AdminStudentDetail view={selView}
            sessions={selDetail.sessions} progress={selDetail.progress} usageCost={selDetail.usageCost}
            issues={issues}
            onBack={() => setSelUserId(null)} onOpenOps={() => setTab('ops')}
            panels={panels} />
        ) : (
          <AdminStudentsTab views={model.views} limits={effLimits}
            filter={filter} onFilter={setFilter} onSelect={openAccount} />
        ))}

        {tab === 'access' && (
          <AdminAccessLedgerTab views={model.views} onSaved={reloadAccess} />
        )}

        {tab === 'content' && <AdminContentReviewTab />}

        {tab === 'ops' && (
          <div className="space-y-4">
          {/* 運用アラート（Task 1）。自前fetchなので model には触らない */}
          <AdminAlertsPanel onOpenAccount={openAccount} />
          <AdminOpsTab issues={issues} onResolve={resolveIssue}
            testLearners={testLearners} onDeleteTestLearners={deleteTestLearners}
            monthCostStudents={model.kpis.monthCostStudents}
            monthCostOthers={model.kpis.monthCostOthers}
            totalCostAll={totalCostAll} limits={effLimits} dataMsg={opsMsg}
            topups={topups}
            onAddTopup={async (amountUsd, note) => {
              const r = await adminAddTopup(amountUsd, note);
              if (r.ok) setTopups(await adminListTopups());   // 記録した瞬間に残高へ反映
              return r;
            }}
            onDeleteTopup={async (id) => {
              const r = await adminDeleteTopup(id);
              if (r.ok) setTopups(await adminListTopups());
              return r;
            }} />
          </div>
        )}
      </div>

      {/* モバイル: 画面下固定タブバー（§1・§6） */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`flex-1 min-h-11 py-1.5 flex flex-col items-center justify-center gap-0.5 ${tab === id ? 'text-blue-700' : 'text-gray-500'}`}>
              <Icon className="w-5 h-5" />
              <span className={`text-[10px] ${tab === id ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
