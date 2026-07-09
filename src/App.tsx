import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ScrollToTop } from './components/ScrollToTop';
import { LanguageProvider } from './contexts/LanguageContext';
import LangWrapper from './components/LangWrapper';
import NavigateWithId from './components/NavigateWithId';
import { ActivityPage, ActivityListPage } from './pages/ActivityPage';

// ページごとに遅延読み込み（コード分割）
const HomePage             = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const TournamentDetailPage = lazy(() => import('./pages/TournamentDetailPage').then(m => ({ default: m.TournamentDetailPage })));
const BlogPage             = lazy(() => import('./pages/BlogPage').then(m => ({ default: m.BlogPage })));
const BlogDetailPage       = lazy(() => import('./pages/BlogDetailPage').then(m => ({ default: m.BlogDetailPage })));
const AdminPage            = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const LoginPage            = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
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

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" aria-label="読み込み中" />
  </div>
);

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      <div key={location.pathname} className="page-fade">
        <Routes location={location}>

          {/* ── 川口・蕨グループ（新URL） ── */}
          <Route path="/:lang" element={<LangWrapper groupSlug="kawaguchi-warabi" />}>
            <Route index element={<HomePage />} />
          </Route>
          <Route path="/:lang/*" element={<LangWrapper groupSlug="kawaguchi-warabi" />}>
            <Route path="activity"        element={<ActivityListPage groupSlug="kawaguchi-warabi" />} />
            <Route path="activity/:id"    element={<ActivityPage groupSlug="kawaguchi-warabi" />} />
            <Route path="tournaments/:id" element={<TournamentDetailPage />} />
            <Route path="faq"             element={<FaqPage />} />
            <Route path="venues"          element={<VenueGuidePage />} />
            <Route path="contact"         element={<ContactPage />} />
            <Route path="level-guide"     element={<LevelGuidePage />} />
            <Route path="cancel-policy"   element={<CancelPolicyPage />} />
            <Route path="admin"           element={<AdminPage />} />
            <Route path="blog"            element={<BlogPage />} />
            <Route path="blog/:id"        element={<BlogDetailPage />} />
            <Route path="join"            element={<JoinPage />} />
            <Route path="shuttle-roadmap" element={<ShuttleRoadmapPage />} />
            <Route path="tactics-board"  element={<TacticsBoardPage />} />
            <Route path="game"            element={<RallyGamePage />} />
            <Route path="mypage"          element={<MyPage />} />
            <Route path="login"           element={<LoginPage />} />
          </Route>

          {/* ── chaoxianzu グループ（新URL） ── */}
          <Route path="/chaoxianzu/:lang/*" element={<LangWrapper groupSlug="chaoxianzu" />}>
            <Route path="activity"     element={<ActivityListPage groupSlug="chaoxianzu" />} />
            <Route path="activity/:id" element={<ActivityPage groupSlug="chaoxianzu" />} />
            <Route path="admin"        element={<CXAdminPage />} />
          </Route>

          {/* ── assistant グループ（通常活動のみ管理。公開一覧は /:lang/activity に統合表示） ── */}
          <Route path="/assistant/:lang/*" element={<LangWrapper groupSlug="assistant" />}>
            <Route path="activity/:id" element={<ActivityPage groupSlug="assistant" />} />
            <Route path="admin"        element={<AssistantAdminPage />} />
          </Route>

          {/* ── 言語によらないページ ── */}
          <Route path="/login"       element={<LoginPage />} />
          <Route path="/cancel"      element={<CancelEntryPage />} />
          <Route path="/results/vol1" element={<Vol1Results />} />
          <Route path="/results/vol2" element={<Vol2Results />} />
          <Route path="/results/vol3" element={<Vol3Results />} />
          <Route path="/:lang/results/vol1" element={<Vol1Results />} />
          <Route path="/:lang/results/vol2" element={<Vol2Results />} />
          <Route path="/:lang/results/vol3" element={<Vol3Results />} />

          {/* ── 旧URL → 新URLリダイレクト（React Router層） ── */}
          <Route path="/"                         element={<Navigate to="/ja/" replace />} />
          <Route path="/activity"                 element={<Navigate to="/ja/activity" replace />} />
          <Route path="/activity/:id"             element={<NavigateWithId to="/ja/activity" />} />
          <Route path="/activity-cn"              element={<Navigate to="/zh/activity" replace />} />
          <Route path="/activity-cn/:id"          element={<NavigateWithId to="/zh/activity" />} />
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
  return (
    <>
      <ScrollToTop />
      <LanguageProvider>
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Header />
          <div className="flex-1">
            <AnimatedRoutes />
          </div>
          <Footer />
        </div>
      </LanguageProvider>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

export default App;
