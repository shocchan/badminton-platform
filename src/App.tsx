import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
// 両ブランチとも trackPageView を入れていた（同じ import・置き場所だけ違う）。
// 発火箇所は AnimatedRoutes 側の1か所に寄せてある（下の useEffect）。
import { trackPageView } from './lib/analytics';
import { isPrivatePath } from './components/seo/privateRoutes';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ScrollToTop } from './components/ScrollToTop';
import { LanguageProvider } from './contexts/LanguageContext';
import { LessonFocusProvider, useLessonFocus } from './contexts/LessonFocusContext';
import { ToastProvider } from './components/ui/Toast';
import LangWrapper from './components/LangWrapper';
import { isAiCourseRoute } from './lib/aiLesson/course/courseRoutes';
import { captureTouch } from './lib/aiLesson/course/attribution';
import NavigateWithId from './components/NavigateWithId';
import { HomePageWrapper } from './components/HomePageWrapper';
import { ActivityPage, ActivityListPage } from './pages/ActivityPage';

// ページごとに遅延読み込み（コード分割）
const AuthLandingPage      = lazy(() => import('./pages/AuthLandingPage').then(m => ({ default: m.AuthLandingPage })));
const InternationalPage    = lazy(() => import('./pages/InternationalPage').then(m => ({ default: m.InternationalPage })));
// 地域ページ（2026-08-28）。会場名（芝園公民館）では見つかっているのに、
// 「川口市 バドミントンサークル」「戸田 バドミントン」のような地域名＋競技名の受け皿が無かった
const KawaguchiPage        = lazy(() => import('./pages/KawaguchiPage').then(m => ({ default: m.KawaguchiPage })));
const TodaPage             = lazy(() => import('./pages/TodaPage').then(m => ({ default: m.TodaPage })));
const TournamentTypePage   = lazy(() => import('./pages/TournamentTypePage').then(m => ({ default: m.TournamentTypePage })));
const TournamentDetailPage = lazy(() => import('./pages/TournamentDetailPage').then(m => ({ default: m.TournamentDetailPage })));
const BlogPage             = lazy(() => import('./pages/BlogPage').then(m => ({ default: m.BlogPage })));
const BlogDetailPage       = lazy(() => import('./pages/BlogDetailPage').then(m => ({ default: m.BlogDetailPage })));
const AdminPage            = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const LoginPage            = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SignupPage           = lazy(() => import('./pages/SignupPage').then(m => ({ default: m.SignupPage })));
const PasswordResetPage    = lazy(() => import('./pages/PasswordResetPage').then(m => ({ default: m.PasswordResetPage })));
const PasswordResetFormPage = lazy(() => import('./pages/PasswordResetFormPage').then(m => ({ default: m.PasswordResetFormPage })));
const PasswordResetSuccessPage = lazy(() => import('./pages/PasswordResetSuccessPage').then(m => ({ default: m.PasswordResetSuccessPage })));
const NotFoundPage         = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const LevelGuidePage       = lazy(() => import('./pages/LevelGuidePage').then(m => ({ default: m.LevelGuidePage })));
const CancelPolicyPage     = lazy(() => import('./pages/CancelPolicyPage').then(m => ({ default: m.CancelPolicyPage })));
const FaqPage              = lazy(() => import('./pages/FaqPage').then(m => ({ default: m.FaqPage })));
const CancelEntryPage      = lazy(() => import('./pages/CancelEntryPage').then(m => ({ default: m.CancelEntryPage })));
// chaoxianzu グループ用
const CXAdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: () => <m.AdminPage groupSlug="chaoxianzu" /> })));
// assistant グループ用（通常活動のみ管理可能なサブ管理者）
const AssistantAdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: () => <m.AdminPage groupSlug="assistant" /> })));
const Vol1Results = lazy(() => import('./pages/results/Vol1'));
const Vol2Results = lazy(() => import('./pages/results/Vol2'));
const Vol3Results = lazy(() => import('./pages/results/Vol3'));
const JoinPage            = lazy(() => import('./pages/JoinPage').then(m => ({ default: m.JoinPage })));
const VenueGuidePage      = lazy(() => import('./pages/VenueGuidePage').then(m => ({ default: m.VenueGuidePage })));
const ContactPage         = lazy(() => import('./pages/ContactPage').then(m => ({ default: m.ContactPage })));
const ShuttleRoadmapPage  = lazy(() => import('./pages/ShuttleRoadmapPage').then(m => ({ default: m.ShuttleRoadmapPage })));
const TacticsBoardPage    = lazy(() => import('./pages/TacticsBoardPage'));
const RallyGamePage       = lazy(() => import('./pages/RallyGamePage'));
const MyPage              = lazy(() => import('./pages/MyPage'));
// AI日本語学習デモ（限定公開: ナビ・sitemap・robots非掲載、パスコードゲートあり）
const AiLessonDemoPage    = lazy(() => import('./pages/ai-lesson/AiLessonDemoPage'));
// AI日本語コース：/ai-course のエントリ振り分け（未認証=販売LP／認証済み=学習アプリ）
const AiCourseEntry       = lazy(() => import('./pages/ai-lesson/landing/AiCourseEntry').then(m => ({ default: m.AiCourseEntry })));
// セルフサービス決済の完了ページ（Stripe Checkout の戻り先）
const AiCoursePurchaseComplete = lazy(() => import('./pages/ai-lesson/landing/PurchaseCompletePage').then(m => ({ default: m.PurchaseCompletePage })));
const AiCourseAdminPage   = lazy(() => import('./pages/ai-lesson/AiCourseAdminPage'));
// 問題バンク監査コンソール。
// **production ビルドではこの import 式ごと消える**（MODE が定数畳み込みされ、
// 三項の false 側が dead code として除去される）ので、chunk すら生成されない。
const QuestionBankConsole = import.meta.env.MODE === 'production'
  ? null
  : lazy(() => import('./pages/internal/QuestionBankConsole'));
// 法務8ページ（ja/zh）。事実が確定するまでは LegalPage 側で入口へ戻す
const LegalPage           = lazy(() => import('./pages/ai-lesson/legal/LegalPage').then(m => ({ default: m.LegalPage })));
// バド本体の法務3ページ（特商法・プライバシー・利用規約）。AIコースのものとは別文書
const KawabadoLegalPage   = lazy(() => import('./pages/KawabadoLegalPage').then(m => ({ default: m.KawabadoLegalPage })));

/**
 * ルート切替時の待ち表示。aria-labelを日本語で固定していたため、
 * 中国語ページでもスクリーンリーダーが「読み込み中」と日本語で読んでいた（Phase B-3で修正）。
 * URLの言語セグメントから表示言語を決める。回転は prefers-reduced-motion では止まる。
 */
const PageLoader = ({ lang }: { lang: 'ja' | 'zh' }) => (
  <div className="flex items-center justify-center min-h-[60vh]" role="status" aria-live="polite">
    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full motion-safe:animate-spin" />
    <span className="sr-only">{lang === 'zh' ? '加载中…' : '読み込み中…'}</span>
  </div>
);

/**
 * /:lang/ai-course 配下の不明URL（P2-15）。絶対パスでコース入口へ戻す。
 * splatは空文字でもマッチするため、空のときはリダイレクトせず入口をそのまま描画する
 * （相対Navigateだと自分自身への無限リダイレクト＝空白画面になる）。
 */
const AiCourseCatchAll = () => {
  const params = useParams();
  const splat = params['*'] ?? '';
  const lang = params.lang === 'zh' ? 'zh' : 'ja';
  if (splat === '' || splat === '/') return <AiCourseEntry />;
  return <Navigate to={`/${lang}/ai-course`} replace />;
};

const AnimatedRoutes = () => {
  const location = useLocation();
  // SPAのルート遷移ごとに page_view を送る（GA4無効時はno-op）。
  // /admin を開いたブラウザは trackPageView 側で以後の計測から自動除外される
  useEffect(() => { trackPageView(location.pathname); }, [location.pathname]);
  /*
   * 流入元の取り込み（2026-08-26 Phase S1）。
   * どのページに着地しても拾えるようここに置く。LPだけに置くと
   * 「広告→大会ページ→AIコース」のような経路で流入元を落とす。
   * 初回来訪でしか使わないので location 依存にせず、マウント時1回だけ。
   */
  useEffect(() => { captureTouch(); }, []);
  // 管理画面・ログイン・マイページ等は検索結果に出さない。
  // ページごとに書くと必ず抜けるので、経路の判定はここ1か所（privateRoutes）に寄せる。
  // JSを実行しないクローラー向けには Worker が X-Robots-Tag を返す（二重で担保）
  const isPrivate = isPrivatePath(location.pathname);
  return (
    <Suspense fallback={<PageLoader lang={location.pathname.startsWith('/zh') ? 'zh' : 'ja'} />}>
      {isPrivate && (
        <Helmet><meta name="robots" content="noindex,nofollow" /></Helmet>
      )}
      <div key={location.pathname} className="page-fade">
        <Routes location={location}>

          {/* ── 旧URL → 新URLリダイレクト（最優先） ── */}
          <Route path="/"                         element={<Navigate to="/ja/" replace />} />
          <Route path="/admin"                    element={<Navigate to="/ja/admin" replace />} />
          <Route path="/login"                    element={<Navigate to="/ja/login" replace />} />
          <Route path="/activity"                 element={<Navigate to="/ja/activity" replace />} />
          <Route path="/activity/:id"             element={<NavigateWithId to="/ja/activity" />} />
          <Route path="/activity-cn"              element={<Navigate to="/zh/activity" replace />} />
          <Route path="/activity-cn/:id"          element={<NavigateWithId to="/zh/activity" />} />

          {/* ── 川口・蕨グループ（新URL） ── */}
          <Route path="/:lang" element={<LangWrapper groupSlug="kawaguchi-warabi" />}>
            <Route index element={<HomePageWrapper />} />
          </Route>
          <Route path="/:lang/*" element={<LangWrapper groupSlug="kawaguchi-warabi" />}>
            <Route path="activity"        element={<ActivityListPage groupSlug="kawaguchi-warabi" />} />
            <Route path="activity/:id"    element={<ActivityPage groupSlug="kawaguchi-warabi" />} />
            {/* 種目別の恒常ページ。**必ず tournaments/:id より前**に置く
                （後ろだと singles 等のスラッグが :id に吸われる） */}
            <Route path="tournaments/singles"       element={<TournamentTypePage slug="singles" />} />
            <Route path="tournaments/doubles"       element={<TournamentTypePage slug="doubles" />} />
            <Route path="tournaments/mixed-doubles" element={<TournamentTypePage slug="mixed-doubles" />} />
            <Route path="tournaments/:id" element={<TournamentDetailPage />} />
            <Route path="faq"             element={<FaqPage />} />
            <Route path="venues"          element={<VenueGuidePage />} />
            <Route path="international"   element={<InternationalPage />} />
            {/* 地域ページ。`tournaments/:id` のような動的セグメントを持たないので順序の制約は無いが、
                下の catch-all（path="*"）より前に置くこと */}
            <Route path="kawaguchi"       element={<KawaguchiPage />} />
            <Route path="toda"            element={<TodaPage />} />
            <Route path="contact"         element={<ContactPage />} />
            <Route path="level-guide"     element={<LevelGuidePage />} />
            <Route path="cancel-policy"   element={<CancelPolicyPage />} />
            {/* バド本体の法務3ページ（特商法・プライバシー・利用規約）。
                **この下の catch-all（path="*"）より前**に置くこと（後ろだと404に吸われる）。
                AIコース側の /ai-course/... の法務ページとは別の文書。
                両ブランチが同じ3ルートを別々に足していたので1組にまとめた */}
            <Route path="tokushoho"       element={<KawabadoLegalPage id="tokushoho" />} />
            <Route path="privacy"         element={<KawabadoLegalPage id="privacy" />} />
            <Route path="terms"           element={<KawabadoLegalPage id="terms" />} />
            <Route path="admin"           element={<AdminPage groupSlug="kawaguchi-warabi" />} />
            <Route path="blog"            element={<BlogPage />} />
            <Route path="blog/:id"        element={<BlogDetailPage />} />
            <Route path="join"            element={<JoinPage />} />
            <Route path="shuttle-roadmap" element={<ShuttleRoadmapPage />} />
            <Route path="tactics-board"  element={<TacticsBoardPage />} />
            <Route path="game"            element={<RallyGamePage />} />
            <Route path="mypage"          element={<MyPage />} />
            <Route path="ai-lesson-demo"  element={<AiLessonDemoPage />} />
              <Route path="ai-course"       element={<AiCourseEntry />} />
              {/* 受講者ログイン（LPと分離した専用URL）。?app=1 は既存ブックマーク互換で残す */}
              <Route path="ai-course/login" element={<AiCourseEntry forceApp />} />
              {/* 決済完了（Stripe success_url）。catch-all より前に置く */}
              <Route path="ai-course/purchase/complete" element={<AiCoursePurchaseComplete />} />
              <Route path="ai-course/shoko" element={<AiCourseEntry variant="shoko" />} />
              <Route path="ai-course/yuto"  element={<AiCourseEntry variant="yuto" />} />
              <Route path="ai-course/admin" element={<AiCourseAdminPage />} />
              {/* 法務8ページ。catch-allより前に置かないと全部入口へ吸われる */}
              <Route path="ai-course/terms"            element={<LegalPage id="terms" />} />
              <Route path="ai-course/privacy"          element={<LegalPage id="privacy" />} />
              <Route path="ai-course/ai-disclosure"    element={<LegalPage id="ai-disclosure" />} />
              <Route path="ai-course/tokushoho"        element={<LegalPage id="tokushoho" />} />
              <Route path="ai-course/cancel-policy"    element={<LegalPage id="cancel-policy" />} />
              <Route path="ai-course/data-deletion"    element={<LegalPage id="data-deletion" />} />
              <Route path="ai-course/account-deletion" element={<LegalPage id="account-deletion" />} />
              <Route path="ai-course/contact"          element={<LegalPage id="contact" />} />
              {/* コース配下の不明URLはコース入口へ戻す（P2-15: バドミントン側404へ落とさない）。
                  注意: splatは空文字にもマッチするため、空なら入口を描画して自己リダイレクトのループを防ぐ */}
              <Route path="ai-course/*"     element={<AiCourseCatchAll />} />
            <Route path="auth-landing"    element={<AuthLandingPage />} />
            <Route path="login"           element={<LoginPage />} />
            <Route path="signup"          element={<SignupPage />} />
            <Route path="password-reset"  element={<PasswordResetPage />} />
            <Route path="password-reset-form" element={<PasswordResetFormPage />} />
            <Route path="password-reset-success" element={<PasswordResetSuccessPage />} />
            {/* 未知のサブパスはヘッダー・フッター間が空にならないよう404を出す */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* ── chaoxianzu グループ（新URL） ── */}
          <Route path="/chaoxianzu/:lang/*" element={<LangWrapper groupSlug="chaoxianzu" />}>
            <Route path="activity"     element={<ActivityListPage groupSlug="chaoxianzu" />} />
            <Route path="activity/:id" element={<ActivityPage groupSlug="chaoxianzu" />} />
            <Route path="admin"        element={<CXAdminPage />} />
            <Route path="*"            element={<NotFoundPage />} />
          </Route>

          {/* ── assistant グループ（通常活動のみ管理。公開一覧は /:lang/activity に統合表示） ── */}
          <Route path="/assistant/:lang/*" element={<LangWrapper groupSlug="assistant" />}>
            <Route path="activity/:id" element={<ActivityPage groupSlug="assistant" />} />
            <Route path="admin"        element={<AssistantAdminPage />} />
            <Route path="*"            element={<NotFoundPage />} />
          </Route>

          {/*
            問題バンク監査コンソール（CEO・管理者用・読み取り専用）。
            **production ビルドには含めない。** MODE が production のときは
            ルートも lazy import も評価されないので、一般learnerのバンドルにコードが入らない。
          */}
          {QuestionBankConsole !== null && (
            <Route path="/internal/qa/question-bank" element={
              <Suspense fallback={<div className="p-6 text-sm text-gray-600">読み込み中…</div>}>
                <QuestionBankConsole />
              </Suspense>
            } />
          )}

          {/* ── 言語によらないページ ── */}
          <Route path="/cancel"      element={<CancelEntryPage />} />
          <Route path="/results/vol1" element={<Vol1Results />} />
          <Route path="/results/vol2" element={<Vol2Results />} />
          <Route path="/results/vol3" element={<Vol3Results />} />
          <Route path="/:lang/results/vol1" element={<Vol1Results />} />
          <Route path="/:lang/results/vol2" element={<Vol2Results />} />
          <Route path="/:lang/results/vol3" element={<Vol3Results />} />
          <Route path="/tournaments/:id"          element={<NavigateWithId to="/ja/tournaments" />} />
          <Route path="/faq"                      element={<Navigate to="/ja/faq" replace />} />
          <Route path="/contact"                  element={<Navigate to="/ja/contact" replace />} />
          <Route path="/level-guide"              element={<Navigate to="/ja/level-guide" replace />} />
          <Route path="/cancel-policy"            element={<Navigate to="/ja/cancel-policy" replace />} />
          <Route path="/admin"                    element={<Navigate to="/ja/admin" replace />} />
          <Route path="/blog"                     element={<Navigate to="/ja/blog" replace />} />
          <Route path="/blog/:id"                 element={<NavigateWithId to="/ja/blog" />} />
          <Route path="/chaoxianzu/activity"      element={<Navigate to="/chaoxianzu/ja/activity" replace />} />
          <Route path="/chaoxianzu/activity-cn"   element={<Navigate to="/chaoxianzu/zh/activity" replace />} />
          <Route path="/chaoxianzu/activity-kr"   element={<Navigate to="/chaoxianzu/ko/activity" replace />} />
          <Route path="/chaoxianzu/activity/:id"     element={<NavigateWithId to="/chaoxianzu/ja/activity" />} />
          <Route path="/chaoxianzu/activity-cn/:id"  element={<NavigateWithId to="/chaoxianzu/zh/activity" />} />
          <Route path="/chaoxianzu/activity-kr/:id"  element={<NavigateWithId to="/chaoxianzu/ko/activity" />} />
          <Route path="/chaoxianzu/admin"         element={<Navigate to="/chaoxianzu/ja/admin" replace />} />
          <Route path="/assistant/activity/:id"      element={<NavigateWithId to="/assistant/ja/activity" />} />
          <Route path="/assistant/activity-cn/:id"   element={<NavigateWithId to="/assistant/zh/activity" />} />
          <Route path="/assistant/admin"          element={<Navigate to="/assistant/ja/admin" replace />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </Suspense>
  );
};

function AppInner() {
  // AIレッスン中の集中モード（レッスン画面だけがtrueにする。一般ページは常に従来表示）
  const { focused } = useLessonFocus();
  // AIコースは通常会員向けではないため、専用ヘッダーに差し替える（通常ページには影響しない）
  const { pathname } = useLocation();
  // 戦術ボードは体育館でスマホ1画面に収める前提の全画面ツール。ヘッダー/フッターを外す
  // （外さないとページ高1,769pxのうち約964pxがFooterで、ボード本体が画面の55%を失う）。
  // TacticsBoard は lazy 分割しているので、判定式は import せずここに直接置く。
  const chromeless = focused || isAiCourseRoute(pathname) || /^\/(ja|zh)\/tactics-board(\/|$)/.test(pathname);
  // NOTE(2026-08-28 統合): security 側はここにも
  //   useEffect(() => { trackPageView(pathname); }, [pathname]);
  // を置いていたが、AnimatedRoutes 側に同じ発火が既にある（上の useEffect）。
  // AppInner と AnimatedRoutes は同じ遷移で両方が再評価されるため、両方残すと
  // page_view / Meta PageView が1遷移で2回飛び、GA4のPV・CV率が丸ごと狂う。
  // 機能は落とさず、発火箇所を AnimatedRoutes の1か所だけにした。
  return (
    <>
      <ScrollToTop />
      <LanguageProvider>
        <ToastProvider>
          <div className="min-h-screen flex flex-col bg-gray-50">
            {!chromeless && <Header />}
            <div className="flex-1">
              <AnimatedRoutes />
            </div>
            {!chromeless && <Footer />}
          </div>
        </ToastProvider>
      </LanguageProvider>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LessonFocusProvider>
        <AppInner />
      </LessonFocusProvider>
    </BrowserRouter>
  );
}

export default App;
