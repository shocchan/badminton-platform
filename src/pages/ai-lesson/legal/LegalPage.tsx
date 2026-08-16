// 法務8ページの共通描画（Phase Release Closure）。
//
// 事実が未確定のうちは学習者へ公開しない（LEGAL_PUBLISH=false）。
// そのとき route は 404 にせず、コース入口へ戻す。
// staging で中身を確認したいときだけ `?legal=preview` で開ける。
import { Helmet } from 'react-helmet-async';
import { Navigate, useParams, useLocation, Link } from 'react-router-dom';
import { buildLegalPages, renderableLegalPage, legalPathFor, type LegalPageId } from '../../../lib/aiLesson/course/legal/legalContent';
import { LEGAL_PUBLISH, isLegalPreview, pendingLegalFacts } from '../../../lib/aiLesson/course/legal/legalFacts';

/** LP・学習アプリの両方から使う法務リンク一覧。
 * exclude: その面では単独リンクとして出さないページ（ページ自体は生きたまま。
 * 特商法上の開示は tokushoho ページ内の「返品・キャンセル」節とLP側で担保する） */
export const LegalFooterLinks = ({ lang, className = '', exclude = [] }: {
  lang: 'ja' | 'zh'; className?: string; exclude?: LegalPageId[];
}) => {
  const pages = buildLegalPages(lang).filter((p) => !exclude.includes(p.id));
  return (
    <nav className={`flex flex-wrap gap-x-4 ${className}`} aria-label={lang === 'zh' ? '法律信息' : '法務情報'}>
      {pages.map((p) => (
        // モバイルで指が届く高さを確保する（文字は小さいまま、当たり判定だけ広げる）
        <Link
          key={p.id}
          to={legalPathFor(lang, p.id)}
          className="inline-flex items-center min-h-11 py-1 text-[0.78rem] underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          {p.title}
        </Link>
      ))}
    </nav>
  );
};

export const LegalPage = ({ id }: { id: LegalPageId }) => {
  const params = useParams();
  const location = useLocation();
  const lang: 'ja' | 'zh' = params.lang === 'zh' ? 'zh' : 'ja';
  const preview = isLegalPreview(location.search);

  // 事実が揃うまでは学習者へ見せない。404にはせず入口へ戻す（行き止まりを作らない）
  if (!LEGAL_PUBLISH && !preview) return <Navigate to={`/${lang}/ai-course`} replace />;

  const page = renderableLegalPage(buildLegalPages(lang).find((p) => p.id === id)!);
  const pending = pendingLegalFacts();

  return (
    <div className="min-h-screen bg-lp-ivory">
      <Helmet>
        <title>{page.title}</title>
        {/* 事実が未確定のうちは検索エンジンに拾わせない */}
        {!LEGAL_PUBLISH && <meta name="robots" content="noindex,nofollow" />}
        <link rel="canonical" href={`https://kawabado.com${legalPathFor(lang, id)}`} />
        <link rel="alternate" hrefLang="ja" href={`https://kawabado.com${legalPathFor('ja', id)}`} />
        <link rel="alternate" hrefLang="zh" href={`https://kawabado.com${legalPathFor('zh', id)}`} />
      </Helmet>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <Link to={`/${lang}/ai-course`} className="text-sm underline underline-offset-2 opacity-70">
          {lang === 'zh' ? '返回课程' : 'コースへ戻る'}
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-lp-ink mt-4 mb-2">{page.title}</h1>
        <p className="text-sm text-lp-ink-soft mb-6">{page.intro}</p>

        {preview && pending.length > 0 && (
          // CEO確認用の表示。学習者導線からは辿れない
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" role="note">
            <p className="font-bold mb-1">プレビュー表示（未公開）</p>
            <p>未確定の事実が {pending.length} 件あるため、この文書はまだ学習者に公開されていません。</p>
            <p className="mt-1 break-all">未確定: {pending.join(', ')}</p>
          </div>
        )}

        <div className="space-y-6">
          {page.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-bold text-lp-ink mb-1.5">{s.heading}</h2>
              {s.body.map((b, i) => (
                <p key={i} className="text-[0.92rem] leading-relaxed text-lp-ink-soft mb-2">{b}</p>
              ))}
            </section>
          ))}
        </div>

        <hr className="my-8 border-lp-line" />
        <LegalFooterLinks lang={lang} />
      </main>
    </div>
  );
};

export default LegalPage;
