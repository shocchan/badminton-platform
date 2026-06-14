import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ScrollToTop } from './components/ScrollToTop';

// ページごとに遅延読み込み（コード分割）
const HomePage           = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const TournamentDetailPage = lazy(() => import('./pages/TournamentDetailPage').then(m => ({ default: m.TournamentDetailPage })));
const BlogPage           = lazy(() => import('./pages/BlogPage').then(m => ({ default: m.BlogPage })));
const BlogDetailPage     = lazy(() => import('./pages/BlogDetailPage').then(m => ({ default: m.BlogDetailPage })));
const AdminPage          = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const LoginPage          = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const NotFoundPage       = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const LevelGuidePage     = lazy(() => import('./pages/LevelGuidePage').then(m => ({ default: m.LevelGuidePage })));
const CancelPolicyPage   = lazy(() => import('./pages/CancelPolicyPage').then(m => ({ default: m.CancelPolicyPage })));
const FaqPage            = lazy(() => import('./pages/FaqPage').then(m => ({ default: m.FaqPage })));
const CancelEntryPage    = lazy(() => import('./pages/CancelEntryPage').then(m => ({ default: m.CancelEntryPage })));
const ActivityPage       = lazy(() => import('./pages/ActivityPage').then(m => ({ default: m.ActivityPage })));
const ActivityListPage   = lazy(() => import('./pages/ActivityPage').then(m => ({ default: m.ActivityListPage })));
const ActivityPageCN     = lazy(() => import('./pages/ActivityPageCN').then(m => ({ default: m.ActivityPageCN })));

// ローディングフォールバック
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" aria-label="読み込み中" />
  </div>
);

// ページ遷移フェード用ラッパー
const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      <div key={location.pathname} className="page-fade">
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:id" element={<BlogDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/level-guide" element={<LevelGuidePage />} />
          <Route path="/cancel-policy" element={<CancelPolicyPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/cancel" element={<CancelEntryPage />} />
          <Route path="/activity" element={<ActivityListPage />} />
          <Route path="/activity/:id" element={<ActivityPage />} />
          <Route path="/activity-cn/:id" element={<ActivityPageCN />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </Suspense>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />
        <div className="flex-1">
          <AnimatedRoutes />
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
