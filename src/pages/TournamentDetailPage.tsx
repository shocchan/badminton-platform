import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../services/supabaseClient';
import { PreEntryModal } from '../components/PreEntryModal';
import { EntryForm } from '../components/EntryForm';
import type { Tournament } from '../types';

const levelColors: Record<string, { bg: string; text: string }> = {
  '超初級': { bg: 'bg-green-100',  text: 'text-green-800' },
  '初級':   { bg: 'bg-orange-100', text: 'text-orange-800' },
  '中級':   { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'オープン': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
};

const levelAccent: Record<string, string> = {
  '超初級': 'from-green-500 to-green-400',
  '初級':   'from-orange-500 to-orange-400',
  '中級':   'from-indigo-600 to-indigo-500',
  'オープン': 'from-violet-600 to-purple-500',
};

export const TournamentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preEntry, setPreEntry] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: t, error: tErr } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      if (tErr || !t) { setError('大会が見つかりませんでした'); setLoading(false); return; }
      setTournament(t);

      const { data: entries } = await supabase
        .from('entries')
        .select('id')
        .eq('tournament_id', id)
        .eq('status', 'confirmed');
      setEntryCount(entries?.length ?? 0);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const formatTime = (t: string) => t.slice(0, 5);

  const getDaysUntil = (dateStr: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const event = new Date(dateStr); event.setHours(0, 0, 0, 0);
    return Math.ceil((event.getTime() - today.getTime()) / 86400000);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (!tournament) return;
    const text = `【${tournament.title}】\n📅 ${formatDate(tournament.event_date)}\n📍 ${tournament.location}\n💰 参加費 ¥${tournament.entry_fee.toLocaleString()}`;
    if (navigator.share) {
      try { await navigator.share({ title: tournament.title, text, url }); } catch { /* cancel */ }
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return (
    <div className="flex justify-center items-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  if (error || !tournament) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="text-4xl mb-4">🏸</div>
      <p className="text-gray-500 mb-6">{error ?? '大会が見つかりませんでした'}</p>
      <Link to="/" className="text-blue-600 hover:underline">← トップへ戻る</Link>
    </div>
  );

  // draft は直接URLでもアクセス不可
  if ((tournament.visibility ?? 'published') === 'draft') return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="text-4xl mb-4">🔒</div>
      <p className="text-gray-500 mb-6">この大会は現在非公開です</p>
      <Link to="/" className="text-blue-600 hover:underline">← トップへ戻る</Link>
    </div>
  );

  const remaining = tournament.capacity - entryCount;
  const daysUntil = getDaysUntil(tournament.event_date);

  // 申し込み締め切り = 大会14日前
  const entryDeadline = new Date(tournament.event_date);
  entryDeadline.setDate(entryDeadline.getDate() - 14);
  entryDeadline.setHours(23, 59, 59);
  const isEntryClosed = new Date() > entryDeadline;
  const entryDeadlineStr = entryDeadline.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });

  const accent = levelAccent[tournament.level] ?? 'from-blue-600 to-blue-500';
  const lColor = levelColors[tournament.level] ?? { bg: 'bg-gray-100', text: 'text-gray-700' };

  const badgeColor = remaining <= 3 ? 'bg-red-500 text-white' : remaining <= 7 ? 'bg-yellow-400 text-yellow-900' : 'bg-green-100 text-green-800';

  const pageTitle = `${tournament.title} | 川口・蕨バドミントン交流会`;
  const pageDesc = `${tournament.event_date}開催。会場: ${tournament.location}。参加費: ${tournament.entry_fee}円。${tournament.level}クラス。`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: tournament.title,
    startDate: `${tournament.event_date}T${tournament.start_time}+09:00`,
    endDate: `${tournament.event_date}T${tournament.end_time}+09:00`,
    location: {
      '@type': 'Place',
      name: tournament.location,
      address: {
        '@type': 'PostalAddress',
        addressRegion: '埼玉県',
        streetAddress: tournament.venue_address ?? '',
        addressCountry: 'JP',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: '川口・蕨バドミントン交流会',
    },
    offers: {
      '@type': 'Offer',
      price: tournament.entry_fee,
      priceCurrency: 'JPY',
      url: `https://kawabado.com/tournaments/${tournament.id}`,
    },
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={`https://kawabado.com/ja/tournaments/${tournament.id}`} />
        <meta property="og:locale" content="ja_JP" />
        <link rel="canonical" href={`https://kawabado.com/ja/tournaments/${tournament.id}`} />
        <link rel="alternate" hrefLang="ja" href={`https://kawabado.com/ja/tournaments/${tournament.id}`} />
        <link rel="alternate" hrefLang="zh" href={`https://kawabado.com/zh/tournaments/${tournament.id}`} />
        <link rel="alternate" hrefLang="x-default" href={`https://kawabado.com/ja/tournaments/${tournament.id}`} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* 戻るボタン */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
        ← 大会一覧に戻る
      </button>

      {/* ヒーローヘッダー */}
      <div className={`bg-gradient-to-r ${accent} rounded-2xl px-6 py-6 mb-6 text-white shadow-md`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="leading-snug">
            {(() => {
              const SERIES = '川口・蕨バドミントン交流会';
              const seriesLabel = tournament.edition != null
                ? `${SERIES} 第${tournament.edition}回`
                : SERIES;
              const rest = tournament.title.replace(SERIES, '').trim();
              const mainTitle = rest || tournament.title;
              return (
                <>
                  <div className="text-white/70 text-xs font-medium mb-0.5">{seriesLabel}</div>
                  <div className="text-xl sm:text-2xl font-extrabold">{mainTitle}</div>
                </>
              );
            })()}
          </h1>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {remaining > 0 && remaining <= 3 && (
              <span className="text-xs font-extrabold px-2 py-1 rounded-full bg-red-500 text-white animate-pulse">🔥 急募！</span>
            )}
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-white/20">
              {daysUntil < 0 ? '開催済み' : daysUntil === 0 ? '本日開催！' : `あと${daysUntil}日`}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${lColor.bg} ${lColor.text}`}>{tournament.level}</span>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/20">{tournament.event_type}</span>
          </div>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
          >
            {copied ? '✅ コピー済み' : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                シェア
              </>
            )}
          </button>
        </div>
      </div>

      {/* 大会詳細 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="divide-y divide-gray-50">
          {[
            { icon: '📅', label: '開催日', value: formatDate(tournament.event_date) },
            { icon: '🕐', label: '時間', value: `${formatTime(tournament.start_time)} 〜 ${formatTime(tournament.end_time)}` },
            { icon: '📍', label: '会場', value: tournament.location, sub: tournament.venue_address },
            { icon: '💰', label: '参加費', value: `¥${tournament.entry_fee.toLocaleString()}` },
            { icon: '⚠️', label: 'キャンセル期限', value: formatDate(entryDeadline.toISOString().split('T')[0]) },
          ].map(({ icon, label, value, sub }) => (
            <div key={label} className="flex items-start gap-3 px-5 py-4">
              <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">{label}</div>
                <div className="font-semibold text-gray-900 text-sm">{value}</div>
                {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* 残席バッジ */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-50">
          <span className="text-xs text-gray-500 font-medium">👥 残席状況</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>残り{remaining}席</span>
        </div>
      </div>

      {/* Google マップ */}
      <a
        href={`https://maps.google.com/maps?q=${encodeURIComponent(tournament.venue_address || tournament.location)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-2xl px-5 py-3.5 transition-colors mb-6"
      >
        <span className="text-lg">🗺️</span>
        <span className="font-medium">{tournament.venue_address || tournament.location} の地図を見る</span>
        <span className="ml-auto text-xs">→</span>
      </a>

      {/* 事前支払い */}
      {tournament.payment_required && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 mb-6">
          <p className="text-sm font-bold text-blue-900 mb-1">💳 事前支払いが必要な大会です</p>
          {tournament.payment_deadline && (
            <p className="text-xs text-blue-700">支払い期限：{formatDate(tournament.payment_deadline)}</p>
          )}
        </div>
      )}

      {/* 説明文 */}
      {tournament.description && (
        <div
          className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-6 text-sm text-gray-600 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: tournament.description }}
        />
      )}

      {/* 申し込みボタン */}
      <div className="sticky bottom-4">
        {tournament.status !== 'active' ? (
          <div className="w-full bg-gray-200 text-gray-500 font-bold py-4 rounded-2xl text-center shadow-lg">中止</div>
        ) : isEntryClosed ? (
          <div className="w-full bg-gray-200 text-gray-400 font-bold py-4 rounded-2xl text-center shadow-lg cursor-not-allowed">
            申し込み受付終了（{entryDeadlineStr}に締め切りました）
          </div>
        ) : remaining <= 0 ? (
          <div className="w-full bg-gray-200 text-gray-500 font-bold py-4 rounded-2xl text-center shadow-lg">満員</div>
        ) : (
          <button
            onClick={() => setPreEntry(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold py-4 rounded-2xl transition-colors shadow-lg text-base"
          >
            この大会に申し込む →
          </button>
        )}
      </div>

      {preEntry && !showForm && (
        <PreEntryModal
          tournament={tournament}
          onConfirm={() => { setShowForm(true); setPreEntry(false); }}
          onClose={() => setPreEntry(false)}
        />
      )}
      {showForm && (
        <EntryForm tournament={tournament} entryCount={entryCount} onClose={() => setShowForm(false)} />
      )}
    </main>
    </>
  );
};
