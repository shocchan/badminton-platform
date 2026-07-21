import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Calendar, Clock, MapPin, JapaneseYen, AlertTriangle, Users,
  CreditCard, Trophy, ShieldCheck, Share2, Camera, ArrowRight, ChevronRight, Map,
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { PreEntryModal } from '../components/PreEntryModal';
import { EntryForm } from '../components/EntryForm';
import { EventSchema, tournamentToEventSchemaProps } from '../components/seo/EventSchema';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { LogoMark } from '../components/LogoMark';
import { useLanguage } from '../contexts/LanguageContext';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { feeDisplay, feePerPerson, isDoublesEvent } from '../lib/fee';
import type { Tournament } from '../types';

const levelColors: Record<string, { bg: string; text: string }> = {
  '超初級': { bg: 'bg-green-100',  text: 'text-green-800' },
  '初級':   { bg: 'bg-orange-100', text: 'text-orange-800' },
  '中級':   { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'オープン': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
};

// レベル別のアクセントバー（ヒーローカード上端の細い色帯）
const levelBar: Record<string, string> = {
  '超初級': 'bg-green-500',
  '初級':   'bg-orange-500',
  '中級':   'bg-indigo-500',
  'オープン': 'bg-violet-500',
};

// 「開催レポート」記事の判定（ギャラリーと同じ規約）
const isTournamentReport = (post: { title?: string; tags?: string[] }) =>
  post.tags?.includes('tournament') || (post.title ?? '').includes('開催レポート');

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
  const zh = lang === 'zh';
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preEntry, setPreEntry] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareToast, setShareToast] = useState('');

  // 過去の開催レポート（信頼表示。新しい順で最大3件）
  const { blogPosts } = useBlogPosts();
  const reports = blogPosts.filter(isTournamentReport).slice(0, 3);

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
    new Date(dateStr).toLocaleDateString(zh ? 'zh-CN' : 'ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

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
      showToast(zh ? '已复制。请粘贴到LINE进行分享。' : 'コピーしました。LINEに貼り付けてシェアしてください。');
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
      showToast(zh ? '已复制。请粘贴到微信进行分享。' : 'コピーしました。WeChatに貼り付けてシェアしてください。');
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

  const bar = levelBar[tournament.level] ?? 'bg-blue-500';
  const lColor = levelColors[tournament.level] ?? { bg: 'bg-gray-100', text: 'text-gray-700' };

  const badgeColor = remaining <= 3 ? 'bg-red-500 text-white' : remaining <= 7 ? 'bg-amber-400 text-amber-900' : 'bg-green-100 text-green-800';

  const pageTitle = `${tournament.title} | 川口・蕨バドミントン交流会`;
  const pageDesc = `${tournament.event_date}開催。会場: ${tournament.location}。参加費: ${isDoublesEvent(tournament) ? `1人${feePerPerson(tournament)}円` : `${tournament.entry_fee}円`}。${tournament.level}クラス。`;

  const eventSchemaProps = tournamentToEventSchemaProps(tournament, {
    entryUrl: `https://kawabado.com/ja/tournaments/${tournament.id}`,
    image: 'https://kawabado.com/ogp.jpg',
    availability: tournament.status === 'cancelled' ? 'SoldOut' : remaining <= 0 ? 'SoldOut' : 'InStock',
  });

  const shareLabels = zh
    ? { line: '分享到LINE', wechat: '微信分享' }
    : { line: 'LINEでシェア', wechat: 'WeChatでシェア' };

  const SERIES = '川口・蕨バドミントン交流会';
  const seriesLabel = tournament.edition != null ? `${SERIES} 第${tournament.edition}回` : SERIES;
  const mainTitle = tournament.title.replace(SERIES, '').trim() || tournament.title;

  const countdownLabel = daysUntil < 0
    ? (zh ? '已结束' : '開催済み')
    : daysUntil === 0 ? (zh ? '今日举办！' : '本日開催！')
    : (zh ? `还有${daysUntil}天` : `あと${daysUntil}日`);

  // 開催実績（実データのみ）
  const stats = [
    { Icon: Trophy, big: tournament.edition != null ? (zh ? `第${tournament.edition}届` : `第${tournament.edition}回`) : (zh ? '定期' : '定期'), label: zh ? '举办实绩' : '開催実績' },
    { Icon: Users, big: zh ? '初〜高级' : '初〜上級', label: zh ? '各水平欢迎' : '全レベル歓迎' },
    { Icon: ShieldCheck, big: zh ? '最少4场' : '最低4試合', label: zh ? '循环赛保证' : '総当たり保証' },
  ];

  const infoItems: { Icon: typeof Calendar; label: string; value: string; sub?: string }[] = [
    { Icon: Calendar, label: zh ? '日期' : '開催日', value: formatDate(tournament.event_date) },
    { Icon: Clock, label: zh ? '时间' : '時間', value: `${formatTime(tournament.start_time)} 〜 ${formatTime(tournament.end_time)}` },
    { Icon: MapPin, label: zh ? '场馆' : '会場', value: tournament.location, sub: tournament.venue_address },
    { Icon: JapaneseYen, label: zh ? '参加费' : '参加費', value: feeDisplay(tournament, zh ? 'zh' : 'ja'), sub: isDoublesEvent(tournament) ? (zh ? `一对合计 ¥${tournament.entry_fee.toLocaleString()}` : `ペア合計 ¥${tournament.entry_fee.toLocaleString()}`) : undefined },
    { Icon: AlertTriangle, label: zh ? '取消期限' : 'キャンセル期限', value: formatDate(entryDeadline.toISOString().split('T')[0]) },
  ];

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
              {zh ? '分享' : 'シェア'}
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
              {zh ? '取消' : 'キャンセル'}
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
        { label: zh ? '首页' : 'ホーム', path: `/${lang}/` },
        { label: tournament.title },
      ]} />
      {/* 戻るボタン */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
        ← {zh ? '返回大会列表' : '大会一覧に戻る'}
      </button>

      {/* ヒーローカード（白基調・上品なアクセントバー） */}
      <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className={`h-1.5 ${bar}`} />
        <div className="px-6 pt-5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium text-gray-400 mb-1">{seriesLabel}</div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-snug">{mainTitle}</h1>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {remaining > 0 && remaining <= 3 && (
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
                  {zh ? '仅剩少量' : '残りわずか'}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                <Clock className="w-3 h-3" /> {countdownLabel}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${lColor.bg} ${lColor.text}`}>{tournament.level}</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{tournament.event_type}</span>
            </div>
            <button
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              {zh ? '分享' : 'シェア'}
            </button>
          </div>
        </div>
      </div>

      {/* 開催実績バンド（実データ） */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {stats.map(({ Icon, big, label }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-3 text-center">
            <Icon className="w-5 h-5 text-blue-500 mx-auto mb-1.5" />
            <div className="text-sm font-extrabold text-gray-900 leading-tight">{big}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* 大会詳細 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className="divide-y divide-gray-50">
          {infoItems.map(({ Icon, label, value, sub }) => (
            <div key={label} className="flex items-start gap-3 px-5 py-3.5">
              <span className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                <Icon className="w-4 h-4 text-gray-500" />
              </span>
              <div className="min-w-0">
                <div className="text-xs text-gray-400 mb-0.5">{label}</div>
                <div className="font-semibold text-gray-900 text-sm">{value}</div>
                {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* 残席バッジ */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50/60 border-t border-gray-50">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <Users className="w-3.5 h-3.5" /> {zh ? '剩余名额' : '残席状況'}
          </span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>{zh ? `剩余${remaining}位` : `残り${remaining}席`}</span>
        </div>
      </div>

      {/* 地図リンク */}
      <a
        href={`https://maps.google.com/maps?q=${encodeURIComponent(tournament.venue_address || tournament.location)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 text-sm text-gray-700 bg-white border border-gray-100 shadow-sm hover:border-blue-200 rounded-2xl px-5 py-3.5 transition-colors mb-4"
      >
        <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Map className="w-4 h-4 text-blue-500" />
        </span>
        <span className="font-medium min-w-0 truncate">{tournament.venue_address || tournament.location}{zh ? ' 的地图' : ' の地図を見る'}</span>
        <ChevronRight className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" />
      </a>

      {/* 事前支払い */}
      {tournament.payment_required && (
        <div className="flex items-start gap-3 bg-white border border-gray-100 shadow-sm rounded-2xl px-5 py-4 mb-4">
          <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-4 h-4 text-blue-500" />
          </span>
          <div>
            <p className="text-sm font-bold text-gray-900">{zh ? '本大会需提前支付参加费' : '事前支払いが必要な大会です'}</p>
            {tournament.payment_deadline && (
              <p className="text-xs text-gray-500 mt-0.5">{zh ? '支付期限' : '支払い期限'}：{formatDate(tournament.payment_deadline)}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">{zh ? '支持信用卡・PayPay・银行转账' : 'クレジットカード・PayPay・銀行振込に対応'}</p>
          </div>
        </div>
      )}

      {/* 参加保証バナー */}
      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4 mb-4">
        <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-green-900">
            {zh ? '保证最少4场循环赛' : '最低4試合の総当たり戦を保証'}
          </p>
          <p className="text-xs text-green-700 mt-1">
            {zh
              ? '根据参加人数确保比赛场数。从初学者到高级者，营造让所有人都能尽兴的环境。'
              : '参加人数に応じた試合組数を確保。初心者から上級者まで、全員が楽しめる環境です。'}
          </p>
        </div>
      </div>

      {/* 説明文 */}
      {tournament.description && (
        <div
          className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-4 text-sm text-gray-600 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: tournament.description }}
        />
      )}

      {/* 過去の大会の様子（実レポート） */}
      {reports.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <Camera className="w-4 h-4 text-blue-500" /> {zh ? '往届赛事的现场' : '過去の大会の様子'}
            </h2>
            <Link to={`/${lang}/tournaments/gallery`} className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:underline">
              {zh ? '查看全部' : 'すべて見る'} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {reports.slice(0, 2).map(post => (
              <Link
                key={post.id}
                to={`/${lang}/blog/${post.id}`}
                className="group flex gap-3 sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="w-24 sm:w-full flex-shrink-0 aspect-square sm:aspect-video bg-gradient-to-br from-blue-100 to-blue-200 overflow-hidden">
                  {post.image_url ? (
                    <img src={post.image_url} alt={post.title} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" style={{ objectPosition: post.image_position || 'center center' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🏸</div>
                  )}
                </div>
                <div className="py-2.5 pr-3 sm:p-4 min-w-0 flex flex-col justify-center">
                  <h3 className="font-bold text-gray-900 text-xs sm:text-sm mb-1 line-clamp-2">{post.title}</h3>
                  {post.excerpt && <p className="text-gray-500 text-xs line-clamp-2 hidden sm:block">{post.excerpt}</p>}
                  <span className="mt-1 inline-flex items-center gap-0.5 text-blue-600 text-xs font-medium">
                    {zh ? '阅读回顾' : 'レポートを読む'} <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 主催者ブロック（ブランド・実在情報のみ） */}
      <div className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-6">
        <LogoMark className="h-12 w-12 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-gray-400 mb-0.5">{zh ? '主办方' : '主催'}</p>
          <p className="text-sm font-bold text-gray-900">kawabado（かわバド）{zh ? ' / 小翔运营' : ' / しょっちゃん運営'}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {zh
              ? '在川口・蕨地区举办的羽毛球交流赛。从初学者到高级者，致力于让所有人都能享受的大会。'
              : '川口・蕨エリアで開催するバドミントン交流大会。初心者から上級者まで、誰でも楽しめる大会を目指しています。'}
          </p>
        </div>
      </div>

      {/* 申し込みボタン */}
      <div className="sticky bottom-4">
        {tournament.status !== 'active' ? (
          <div className="w-full bg-gray-200 text-gray-500 font-bold py-4 rounded-2xl text-center shadow-lg">{zh ? '已中止' : '中止'}</div>
        ) : isEntryClosed ? (
          <div className="w-full bg-gray-200 text-gray-400 font-bold py-4 rounded-2xl text-center shadow-lg cursor-not-allowed">
            {zh ? `报名已截止（截止于${entryDeadlineStr}）` : `申し込み受付終了（${entryDeadlineStr}に締め切りました）`}
          </div>
        ) : remaining <= 0 ? (
          <div className="w-full bg-gray-200 text-gray-500 font-bold py-4 rounded-2xl text-center shadow-lg">{zh ? '已满员' : '満員'}</div>
        ) : (
          <button
            onClick={() => setPreEntry(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold py-4 rounded-2xl transition-colors shadow-lg text-base"
          >
            {zh ? '报名本次大会 →' : 'この大会に申し込む →'}
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
