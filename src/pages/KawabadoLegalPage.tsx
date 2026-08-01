// バド本体の法務3ページ（特商法表記・プライバシーポリシー・利用規約）の共通描画。
// 事実が未確定のうちは公開しない（AI講座側 LegalPage.tsx と同じ方針）。
// staging で中身を確認したいときだけ ?legal=preview で開ける。
import { Helmet } from 'react-helmet-async';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import {
  buildKawabadoLegalPages,
  renderableKawabadoLegalPage,
  kawabadoLegalPath,
  type KawabadoLegalPageId,
} from '../lib/legal/kawabadoLegalContent';
import {
  KAWABADO_LEGAL_PUBLISH,
  isKawabadoLegalPreview,
  pendingKawabadoLegalFacts,
} from '../lib/legal/kawabadoLegalFacts';

/** フッターに並べる法務リンク */
export const KawabadoLegalLinks = ({ className = '' }: { className?: string }) => {
  const { lang } = useLanguage();
  const l = lang === 'zh' ? 'zh' : 'ja';
  if (!KAWABADO_LEGAL_PUBLISH) return null;
  return (
    <>
      {buildKawabadoLegalPages(l).map((p) => (
        <Link key={p.id} to={kawabadoLegalPath(l, p.id)} className={className}>
          {p.title}
        </Link>
      ))}
    </>
  );
};

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
  const siteName = l === 'zh' ? '川口・蕨羽毛球交流会' : '川口・蕨バドミントン交流会';

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Helmet>
        <title>{`${page.title} | ${siteName}`}</title>
        <meta name="description" content={page.intro} />
        {!KAWABADO_LEGAL_PUBLISH && <meta name="robots" content="noindex,nofollow" />}
        <link rel="canonical" href={`https://kawabado.com${kawabadoLegalPath(l, id)}`} />
        <link rel="alternate" hrefLang="ja" href={`https://kawabado.com${kawabadoLegalPath('ja', id)}`} />
        <link rel="alternate" hrefLang="zh" href={`https://kawabado.com${kawabadoLegalPath('zh', id)}`} />
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
          {l === 'zh' ? '取消政策' : 'キャンセルポリシー'}
        </Link>
      </nav>
    </main>
  );
};

export default KawabadoLegalPage;
