// バド本体の法務3ページ（特商法表記・プライバシーポリシー・利用規約）の共通描画。
// 事実が未確定のうちは公開しない（AI講座側 src/pages/ai-lesson/legal/LegalPage.tsx と同じ方針）。
// staging で中身を確認したいときだけ ?legal=preview で開ける。
import { Helmet } from 'react-helmet-async';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import {
  buildKawabadoLegalPages,
  renderableKawabadoLegalPage,
  kawabadoLegalPath,
  KAWABADO_LEGAL_SEO,
  type KawabadoLegalPageId,
} from '../lib/legal/kawabadoLegalContent';
import {
  KAWABADO_LEGAL_PUBLISH,
  isKawabadoLegalPreview,
  pendingKawabadoLegalFacts,
} from '../lib/legal/kawabadoLegalFacts';

const SITE = 'https://kawabado.com';

export const KawabadoLegalPage = ({ id }: { id: KawabadoLegalPageId }) => {
  const { lang } = useLanguage();
  const location = useLocation();
  const l: 'ja' | 'zh' = lang === 'zh' ? 'zh' : 'ja';
  const preview = isKawabadoLegalPreview(location.search);

  // 事実が揃うまでは公開しない。404にはせずトップへ戻す（行き止まりを作らない）
  if (!KAWABADO_LEGAL_PUBLISH && !preview) return <Navigate to={`/${l}/`} replace />;

  const page = renderableKawabadoLegalPage(
    buildKawabadoLegalPages(l).find((p) => p.id === id)!
  );
  const pending = pendingKawabadoLegalFacts();
  const seo = KAWABADO_LEGAL_SEO[id][l];
  const canonical = `${SITE}${kawabadoLegalPath(l, id)}`;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Helmet>
        {/* 素のHTMLは全ページ lang="ja" 固定。中国語ページで差し替える（Worker側と同じ扱い） */}
        <html lang={l} />
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:locale" content={l === 'zh' ? 'zh_CN' : 'ja_JP'} />
        {/* 事実が未確定のうちは検索エンジンに拾わせない（プレビューで開いたときだけ通る経路） */}
        {!KAWABADO_LEGAL_PUBLISH && <meta name="robots" content="noindex,nofollow" />}
        <link rel="canonical" href={canonical} />
        <link rel="alternate" hrefLang="ja" href={`${SITE}${kawabadoLegalPath('ja', id)}`} />
        <link rel="alternate" hrefLang="zh" href={`${SITE}${kawabadoLegalPath('zh', id)}`} />
        <link rel="alternate" hrefLang="x-default" href={`${SITE}${kawabadoLegalPath('ja', id)}`} />
      </Helmet>

      <Breadcrumbs
        items={[
          { label: l === 'zh' ? '首页' : 'ホーム', path: `/${l}/` },
          { label: page.title },
        ]}
      />

      <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">{page.title}</h1>
      <p className="text-sm text-gray-600 leading-relaxed mb-8">{page.intro}</p>

      {preview && pending.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="note">
          <p className="font-bold mb-1">プレビュー表示（未公開）</p>
          <p>未確定の事実が {pending.length} 件あるため、この文書はまだ公開されていません。</p>
          <p className="mt-1 break-all">未確定: {pending.join(', ')}</p>
        </div>
      )}

      <dl className="divide-y divide-gray-100 border-y border-gray-100">
        {page.sections.map((s) => (
          <div key={s.heading} className="py-4 sm:flex sm:gap-6">
            <dt className="text-sm font-bold text-gray-900 sm:w-56 sm:shrink-0 mb-1 sm:mb-0">
              {s.heading}
            </dt>
            <dd className="text-sm text-gray-700 leading-relaxed space-y-2">
              {s.body.map((b, i) => <p key={i}>{b}</p>)}
            </dd>
          </div>
        ))}
      </dl>

      <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {buildKawabadoLegalPages(l)
          .filter((p) => p.id !== id)
          .map((p) => (
            <Link key={p.id} to={kawabadoLegalPath(l, p.id)} className="text-blue-600 hover:underline">
              {p.title}
            </Link>
          ))}
        <Link to={`/${l}/cancel-policy`} className="text-blue-600 hover:underline">
          {l === 'zh' ? '赛事取消政策' : '大会キャンセルポリシー'}
        </Link>
      </nav>
    </main>
  );
};

export default KawabadoLegalPage;
