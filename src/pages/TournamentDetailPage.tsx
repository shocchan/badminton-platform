import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../services/supabaseClient';
import { PreEntryModal } from '../components/PreEntryModal';
import { EntryForm } from '../components/EntryForm';
import { EventSchema, tournamentToEventSchemaProps } from '../components/seo/EventSchema';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import { feeDisplay, feePerPerson, isDoublesEvent } from '../lib/fee';
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

const generateShareText = (tournament: Tournament, lang: string) => {
  const formatDate = (d: string) => new Date(d).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const fmtTime = (t: string) => t.slice(0, 5);
  const fee = isDoublesEvent(tournament)
    ? (lang === 'zh' ? `每人${feePerPerson(tournament)}日元` : `1人${feePerPerson(tournament).toLocaleString()}円`)
    : (lang === 'zh' ? `${tournament.entry_fee}日元` : `${tournament.entry_fee.toLocaleString()}円`);
  if (lang === 'zh') {
    return `【${tournament.title}】\n日期：${formatDate(tournament.event_date)}\n时间：${fmtTime(tournament.start_time)}〜${fmtTime(tournament.end_time)}\n地点：${tournament.location}\n参加费：${fee}\n详情・报名：`;
  }
  return `【${tournament.title}】\n日時：${formatDate(tournament.event_date)}\n時間：${fmtTime(tournament.start_time)}〜${fmtTime(tournament.end_time)}\n会場：${tournament.location}\n参加費：${fee}\n詳細・申し込み：`;
};

export const TournamentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preEntry, setPreEntry] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareToast, setShareToast] = useState('');

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

  const showToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(''), 2500);
  };

  const handleLineShare = async () => {
    if (!tournament) return;
    const baseUrl = `https://kawabado.com/${lang}/tournaments/${tournament.id}?from=line`;
    const text = generateShareText(tournament, lang);
    try {
      await navigator.clipboard.writeText(`${text}${baseUrl}`);
      showToast(lang === 'zh' ? '已复制。请粘贴到LINE进行分享。' : 'コピーしました。LINEに貼り付けてシェアしてください。');
    } catch {
      console.error('クリップボードへのコピーに失敗しました');
    }
  };

  const handleWechatShare = async () => {
    if (!tournament) return;
    const baseUrl = `https://kawabado.com/${lang}/tournaments/${tournament.id}?from=wechat`;
    const text = generateShareText(tournament, lang);
    try {
      await navigator.clipboard.writeText(`${text}${baseUrl}`);
      showToast(lang === 'zh' ? '已复制。请粘贴到微信进行分享。' : 'コピーしました。WeChatに貼り付けてシェアしてください。');
    } catch {
      console.error('クリップボードへのコピーに失敗しました');
    }
  };


  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="skeleton h-6 w-48 rounded-lg mb-4" />
      <div className="skeleton h-40 w-full rounded-2xl mb-4" />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="skeleton h-16 rounded-xl" />
        <div className="skeleton h-16 rounded-xl" />
        <div className="skeleton h-16 rounded-xl" />
        <div className="skeleton h-16 rounded-xl" />
      </div>
      <div className="skeleton h-12 w-full rounded-xl" />
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
  const pageDesc = `${tournament.event_date}開催。会場: ${tournament.location}。参加費: ${isDoublesEvent(tournament) ? `1人${feePerPerson(tournament)}円` : `${tournament.entry_fee}円`}。${tournament.level}クラス。`;

  const eventSchemaProps = tournamentToEventSchemaProps(tournament, {
    entryUrl: `https://kawabado.com/ja/tournaments/${tournament.id}`,
    image: 'https://kawabado.com/ogp.jpg',
    availability: tournament.status === 'cancelled' ? 'SoldOut' : remaining <= 0 ? 'SoldOut' : 'InStock',
  });

  const shareLabels = lang === 'zh'
    ? { line: '分享到LINE', wechat: '微信分享' }
    : { line: 'LINEでシェア', wechat: 'WeChatでシェア' };

  return (
    <>
      {shareToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-xs px-4 py-2 rounded-xl shadow-lg whitespace-nowrap">
          {shareToast}
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowShareModal(false)} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-gray-900 text-base mb-4 text-center">
              {lang === 'zh' ? '分享' : 'シェア'}
            </h3>
            <div className="space-y-2.5">
              <button onClick={() => { handleLineShare(); setShowShareModal(false); }}
                className="flex items-center gap-4 w-full px-5 py-3.5 rounded-2xl bg-[#06C755] text-white hover:opacity-90 transition-opacity">
                <img src="/icons/line.png" alt="LINE" className="w-9 h-9 flex-shrink-0 rounded-xl" />
                <span className="font-bold text-base">{shareLabels.line}</span>
              </button>
              <button onClick={() => { handleWechatShare(); setShowShareModal(false); }}
                className="flex items-center gap-4 w-full px-5 py-3.5 rounded-2xl bg-[#07C160] text-white hover:opacity-90 transition-opacity">
                <svg viewBox="0 0 40 40" className="w-9 h-9 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <rect width="40" height="40" rx="10" fill="white" fillOpacity="0.2"/>
                  <path d="M17.5 9C11.1 9 6 13.2 6 18.4c0 2.9 1.6 5.5 4.2 7.2l-1 3.4 3.8-1.9c1.1.3 2.3.5 3.5.5 6.4 0 11.5-4.2 11.5-9.4S23.9 9 17.5 9z" fill="white"/>
                  <path d="M34 23.5c0-4.4-4.4-8-9.8-8-.3 0-.6 0-.9.1 1.1 1.4 1.7 3 1.7 4.8 0 4.7-4.5 8.5-10 8.5-.5 0-1 0-1.5-.1C15.3 31 18 32.5 21 32.5c1 0 2-.2 3-.4l3.3 1.7-.9-3c2.2-1.5 3.6-3.7 3.6-6.3z" fill="white" fillOpacity="0.85"/>
                </svg>
                <span className="font-bold text-base">{shareLabels.wechat}</span>
              </button>
            </div>
            <button onClick={() => setShowShareModal(false)} className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600">
              {lang === 'zh' ? '取消' : 'キャンセル'}
            </button>
          </div>
        </div>
      )}

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
      </Helmet>
      <EventSchema {...eventSchemaProps} />
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Breadcrumbs items={[
        { label: lang === 'zh' ? '首页' : 'ホーム', path: `/${lang}/` },
        { label: tournament.title },
      ]} />
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
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            {lang === 'zh' ? '分享' : 'シェア'}
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
            { icon: '💰', label: '参加費', value: feeDisplay(tournament, lang === 'zh' ? 'zh' : 'ja'), sub: isDoublesEvent(tournament) ? `ペア合計 ¥${tournament.entry_fee.toLocaleString()}` : undefined },
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

      {/* シェアボタン */}
      {tournament.status !== 'active' ? null : (
        <div className="mb-6">
          <p className="text-xs text-gray-400 mb-2">{lang === 'zh' ? '分享：' : 'シェアする：'}</p>
          <div className="flex gap-3">
            <button
              onClick={handleLineShare}
              className="flex items-center gap-2 flex-1 justify-center px-4 py-3 rounded-2xl bg-[#06C755] text-white font-bold text-sm hover:opacity-90 transition-opacity"
            >
              <img src="/icons/line.png" alt="LINE" className="w-6 h-6 rounded-lg" />
              {shareLabels.line}
            </button>
            <button
              onClick={handleWechatShare}
              className="flex items-center gap-2 flex-1 justify-center px-4 py-3 rounded-2xl bg-[#07C160] text-white font-bold text-sm hover:opacity-90 transition-opacity"
            >
              <svg viewBox="0 0 40 40" className="w-6 h-6 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                <rect width="40" height="40" rx="10" fill="white" fillOpacity="0.2"/>
                <path d="M17.5 9C11.1 9 6 13.2 6 18.4c0 2.9 1.6 5.5 4.2 7.2l-1 3.4 3.8-1.9c1.1.3 2.3.5 3.5.5 6.4 0 11.5-4.2 11.5-9.4S23.9 9 17.5 9z" fill="white"/>
                <path d="M34 23.5c0-4.4-4.4-8-9.8-8-.3 0-.6 0-.9.1 1.1 1.4 1.7 3 1.7 4.8 0 4.7-4.5 8.5-10 8.5-.5 0-1 0-1.5-.1C15.3 31 18 32.5 21 32.5c1 0 2-.2 3-.4l3.3 1.7-.9-3c2.2-1.5 3.6-3.7 3.6-6.3z" fill="white" fillOpacity="0.85"/>
              </svg>
              {shareLabels.wechat}
            </button>
          </div>
        </div>
      )}

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
