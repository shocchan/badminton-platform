import { Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CalendarDays, MapPin, ArrowRight, ChevronRight } from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { FAQSchema } from '../components/seo/FAQSchema';
import { useLanguage } from '../contexts/LanguageContext';
import { useTournaments } from '../hooks/useTournaments';
import { tournamentTypeBySlug, type TournamentTypeSlug } from '../lib/tournamentTypes';
import type { Tournament } from '../types';

/**
 * 種目別の恒常ページ（2026-08-24 新設）。
 *
 * 【解こうとしている問題】
 * 大会は終わるとトップの一覧から消える＝**開催するほど資産が消えていく**。
 * 「ミックスダブルス 大会 埼玉」のような種目＋地域の検索に受け皿が無かった。
 *
 * 【見えづらくならないための工夫（CEO指示 2026-08-24）】
 * - トップの大会一覧は**今までどおり開催予定だけ**。ここは触らない
 * - このページも、上から「説明 → 開催予定 → 条件」の順。過去の開催は
 *   <details> に畳んで最後に置く。開いた人にだけ見える
 * - 過去は直近12件まで。それ以上あるときは「ほかにN回」と件数だけ書く
 *
 * 【数字の扱い】
 * **参加人数は出さない。** 実績が薄い時期に「参加0人」と出しても誰も得しない。
 * 開催した事実（日付・会場・レベル）だけを積み上げる。ここは嘘ではなく、
 * 出す価値のある事実だけを選んでいる。
 */

const MAX_PAST_SHOWN = 12;

const fmtDate = (iso: string, l: 'ja' | 'zh') =>
  new Date(`${iso.slice(0, 10)}T00:00:00+09:00`).toLocaleDateString(
    l === 'zh' ? 'zh-CN' : 'ja-JP',
    { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' },
  );

export const TournamentTypePage = ({ slug }: { slug: TournamentTypeSlug }) => {
  const { lang } = useLanguage();
  const l: 'ja' | 'zh' = lang === 'zh' ? 'zh' : 'ja';
  const def = tournamentTypeBySlug(slug);
  const { tournaments, loading } = useTournaments();

  // 未知のスラッグは大会一覧へ返す（行き止まりを作らない）
  if (!def) return <Navigate to={`/${l}/`} replace />;

  const todayJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const ofType = (tournaments ?? []).filter(
    (t: Tournament) => t.event_type === def.eventType
      && (t.visibility ?? 'published') === 'published'
      && t.status !== 'cancelled'
      && !!t.event_date,
  );
  const upcoming = ofType
    .filter((t) => t.event_date.slice(0, 10) >= todayJst)
    .sort((a, b) => (a.event_date < b.event_date ? -1 : 1));
  const past = ofType
    .filter((t) => t.event_date.slice(0, 10) < todayJst)
    .sort((a, b) => (a.event_date > b.event_date ? -1 : 1));

  const url = `https://kawabado.com/${l}/tournaments/${def.slug}`;
  const faqItems = def.faq.map((f) => ({ question: f.question[l], answer: f.answer[l] }));

  return (
    <>
      <Helmet>
        <html lang={l} />
        <title>{def.title[l]}</title>
        <meta name="description" content={def.description[l]} />
        <meta property="og:title" content={def.title[l]} />
        <meta property="og:description" content={def.description[l]} />
        <meta property="og:url" content={url} />
        <meta property="og:locale" content={l === 'zh' ? 'zh_CN' : 'ja_JP'} />
        <link rel="canonical" href={url} />
        <link rel="alternate" hrefLang="ja" href={`https://kawabado.com/ja/tournaments/${def.slug}`} />
        <link rel="alternate" hrefLang="zh" href={`https://kawabado.com/zh/tournaments/${def.slug}`} />
        <link rel="alternate" hrefLang="x-default" href={`https://kawabado.com/ja/tournaments/${def.slug}`} />
      </Helmet>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <Breadcrumbs items={[
          { label: l === 'zh' ? '首页' : 'ホーム', path: `/${l}/` },
          { label: def.name[l] },
        ]} />

        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-3">{def.h1[l]}</h1>
          <p className="text-gray-600 leading-relaxed">{def.lead[l]}</p>
        </header>

        {/* 開催予定を最初に出す。無ければ隠さず「いま無い」と言い、次の行き先を示す */}
        <section aria-labelledby="upcoming" className="mb-10">
          <h2 id="upcoming" className="text-lg font-bold text-gray-900 mb-3">
            {l === 'zh' ? '即将举办' : '開催予定'}
          </h2>
          {loading ? (
            <p className="text-sm text-gray-500">{l === 'zh' ? '加载中…' : '読み込み中…'}</p>
          ) : upcoming.length > 0 ? (
            <ul className="space-y-2.5">
              {upcoming.map((t) => (
                <li key={t.id}>
                  <Link to={`/${l}/tournaments/${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 hover:border-kb-blue transition-colors">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-[0.98rem] truncate">{t.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{fmtDate(t.event_date, l)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />{t.location}
                        </span>
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-kb-blue" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                {l === 'zh'
                  ? '目前没有这个项目的举办计划。其他项目的比赛可以在赛事信息页查看。'
                  : 'いまこの種目の開催予定はありません。ほかの種目の大会は大会案内からご覧いただけます。'}
              </p>
              <Link to={`/${l}/`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
                {l === 'zh' ? '查看全部赛事' : '大会案内を見る'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>

        {/* 参加条件（費用・持ち物・申込方法）。FaqPage と同じ事実 */}
        <section aria-labelledby="facts" className="mb-10">
          <h2 id="facts" className="text-lg font-bold text-gray-900 mb-3">
            {l === 'zh' ? '参加条件' : '参加のしかた'}
          </h2>
          <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {def.facts.map((f) => (
              <div key={f.label.ja} className="flex flex-col sm:flex-row gap-1 sm:gap-4 p-4">
                <dt className="text-xs font-bold text-gray-500 sm:w-24 sm:shrink-0 sm:pt-0.5">{f.label[l]}</dt>
                <dd className="text-sm text-gray-800 leading-relaxed">{f.value[l]}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="faq" className="mb-10">
          <h2 id="faq" className="text-lg font-bold text-gray-900 mb-3">
            {l === 'zh' ? '常见问题' : 'よくある質問'}
          </h2>
          <FAQSchema items={faqItems} />
          <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {def.faq.map((f) => (
              <div key={f.question.ja} className="p-4">
                <dt className="font-bold text-gray-900 text-[0.95rem] mb-1.5">{f.question[l]}</dt>
                <dd className="text-sm text-gray-600 leading-relaxed">{f.answer[l]}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 過去の開催は畳んで最後に。開いた人にだけ見せる＝開催予定を埋もれさせない */}
        {past.length > 0 && (
          <details className="rounded-2xl border border-gray-200 bg-white">
            <summary className="cursor-pointer list-none p-4 text-sm font-bold text-gray-700 flex items-center justify-between gap-2">
              <span>
                {l === 'zh' ? `过去的举办记录（${past.length}次）` : `これまでの開催（${past.length}回）`}
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </summary>
            <ul className="divide-y divide-gray-100 border-t border-gray-100">
              {past.slice(0, MAX_PAST_SHOWN).map((t) => (
                <li key={t.id}>
                  <Link to={`/${l}/tournaments/${t.id}`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{t.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {fmtDate(t.event_date, l)}・{t.location}・{t.level}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            {past.length > MAX_PAST_SHOWN && (
              <p className="border-t border-gray-100 p-4 text-xs text-gray-500">
                {l === 'zh'
                  ? `另有 ${past.length - MAX_PAST_SHOWN} 次举办记录（此处只显示最近的 ${MAX_PAST_SHOWN} 次）。`
                  : `ほかに${past.length - MAX_PAST_SHOWN}回の開催があります（ここには直近${MAX_PAST_SHOWN}回まで表示しています）。`}
              </p>
            )}
          </details>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-2.5">
          <Link to={`/${l}/`}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl bg-kb-blue px-5 text-sm font-bold text-white hover:bg-kb-blue-deep transition-colors">
            {l === 'zh' ? '查看全部赛事' : '大会案内を見る'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to={`/${l}/faq`}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
            {l === 'zh' ? '赛事常见问题' : '大会のよくある質問'}
          </Link>
        </div>
      </main>
    </>
  );
};

export default TournamentTypePage;
