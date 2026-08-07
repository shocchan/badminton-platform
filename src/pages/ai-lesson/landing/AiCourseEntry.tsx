// /:lang/ai-course のエントリ振り分け
//   - 認証済み or ?app=1 → 学習アプリ（AiCoursePage）※Andーは自動でここ＝現状維持
//   - 未認証           → 販売LP
//   - /shoko /yuto     → 販売LP（variant, 広告用, noindex）
// 学習アプリは lazy 読込。LP訪問者に学習アプリのJSを読み込ませない（パフォーマンス）。
import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getSession } from '../../../lib/aiLesson/course/courseAuth';
import { AiCourseLandingPage } from './AiCourseLandingPage';
import type { CharacterVariant } from './lpContent';

const AiCoursePage = lazy(() => import('../AiCoursePage'));

// コース入口の待ち表示。aria-labelが "loading" のままで学習者の言語に翻訳されていなかった（Phase B-3で修正）
const Loader = ({ lang }: { lang: string }) => (
  <div className="min-h-screen grid place-items-center bg-lp-ivory" role="status" aria-live="polite">
    <div className="w-8 h-8 rounded-full border-2 border-lp-line border-t-lp-coral motion-safe:animate-spin" />
    <span className="sr-only">{lang === 'zh' ? '加载中…' : '読み込み中…'}</span>
  </div>
);

export function AiCourseEntry({ variant }: { variant?: CharacterVariant }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const forceApp = params.get('app') === '1';
  // variant / ?app=1 は初期状態で確定（effect内の同期setStateを避ける）
  const [mode, setMode] = useState<'checking' | 'app' | 'lp'>(
    () => (variant ? 'lp' : forceApp ? 'app' : 'checking'),
  );

  useEffect(() => {
    if (variant || forceApp) return; // 初期状態で決定済み
    let alive = true;
    getSession()
      .then((u) => { if (alive) setMode(u ? 'app' : 'lp'); })
      .catch(() => { if (alive) setMode('lp'); });
    return () => { alive = false; };
  }, [variant, forceApp]);

  if (mode === 'checking') return <Loader lang={lang} />;
  if (mode === 'app') return <Suspense fallback={<Loader lang={lang} />}><AiCoursePage /></Suspense>;
  return (
    <AiCourseLandingPage
      variant={variant || 'shoko'}
      noindex={!!variant}
      // variant指定なし（既定LP）は二人のAI先生を並べる。/shoko /yuto は広告用に1人のまま
      duo={!variant}
      onSeeApp={() => navigate(`/${lang}/ai-course?app=1`)}
    />
  );
}

export default AiCourseEntry;
