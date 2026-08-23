// /:lang/ai-course のエントリ振り分け
//   - /:lang/ai-course/login（forceApp） → 学習アプリ（未認証ならログイン画面）
//   - 認証済み or ?app=1（旧URL互換）  → 学習アプリ（AiCoursePage）※既存ブックマークを壊さない
//   - 未認証                           → 販売LP
//   - /shoko /yuto                     → 販売LP（variant, 広告用, noindex）
// 学習アプリは lazy 読込。LP訪問者に学習アプリのJSを読み込ませない（パフォーマンス）。
import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getSession } from '../../../lib/aiLesson/course/courseAuth';
import { AiCourseLandingPage } from './AiCourseLandingPage';
import { recordLpView } from '../../../lib/aiLesson/course/lp/lpViewBeacon';
import type { CharacterVariant } from './lpContent';

const AiCoursePage = lazy(() => import('../AiCoursePage'));

// コース入口の待ち表示。aria-labelが "loading" のままで学習者の言語に翻訳されていなかった（Phase B-3で修正）
const Loader = ({ lang }: { lang: string }) => (
  <div className="min-h-screen grid place-items-center bg-lp-ivory" role="status" aria-live="polite">
    <div className="w-8 h-8 rounded-full border-2 border-lp-line border-t-lp-coral motion-safe:animate-spin" />
    <span className="sr-only">{lang === 'zh' ? '加载中…' : '読み込み中…'}</span>
  </div>
);

export function AiCourseEntry({ variant, forceApp = false }: {
  variant?: CharacterVariant;
  /** /:lang/ai-course/login（受講者ログインの専用URL）から呼ばれるとき true */
  forceApp?: boolean;
}) {
  const [params] = useSearchParams();
  const { lang } = useLanguage();
  const forceAppByParam = params.get('app') === '1'; // 旧URL互換（既存ブックマーク・生徒案内済みURL）
  // ?lp=1: ログイン中でも販売LPを表示する（学習アプリ内の「料金プランを見る」用。
  // 認証済みだと /ai-course は自動でアプリへ入るため、LPへ戻る印が要る）
  const forceLp = params.get('lp') === '1';
  // variant / forceApp / ?app=1 / ?lp=1 は初期状態で確定（effect内の同期setStateを避ける）
  const [mode, setMode] = useState<'checking' | 'app' | 'lp'>(
    () => (variant || forceLp ? 'lp' : forceApp || forceAppByParam ? 'app' : 'checking'),
  );

  useEffect(() => {
    if (variant || forceLp || forceApp || forceAppByParam) return; // 初期状態で決定済み
    let alive = true;
    getSession()
      .then((u) => { if (alive) setMode(u ? 'app' : 'lp'); })
      .catch(() => { if (alive) setMode('lp'); });
    return () => { alive = false; };
  }, [variant, forceLp, forceApp, forceAppByParam]);

  /*
    LPが何人に見られたかを数える（CEO依頼 2026-08-23「このLPがどれだけの人に
    見られているかも管理ページから確認できるようにしたい」）。
    LPを出すと決まったときだけ・1ブラウザ1日1回だけ。自分（?notrack=1）と
    本番以外のドメインは数えない。詳しい約束は lpViewBeacon.ts に書いた。
  */
  useEffect(() => {
    if (mode !== 'lp') return;
    recordLpView({ path: window.location.pathname, lang, variant: variant ?? null });
  }, [mode, lang, variant]);

  if (mode === 'checking') return <Loader lang={lang} />;
  if (mode === 'app') return <Suspense fallback={<Loader lang={lang} />}><AiCoursePage /></Suspense>;
  return (
    <AiCourseLandingPage
      variant={variant || 'shoko'}
      noindex={!!variant}
      // variant指定なし（既定LP）は二人のAI先生を並べる。/shoko /yuto は広告用に1人のまま
      duo={!variant}
    />
  );
}

export default AiCourseEntry;
