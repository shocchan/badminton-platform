import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Wallet, AlertCircle, Users, ExternalLink, CreditCard } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../services/supabaseClient';
import { PreEntryModal } from '../components/PreEntryModal';
import { EntryForm } from '../components/EntryForm';
import { EventSchema, tournamentToEventSchemaProps } from '../components/seo/EventSchema';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { tournamentTypeByEventType } from '../lib/tournamentTypes';
import { useLanguage } from '../contexts/LanguageContext';
import { feeDisplay, feePerPerson, isDoublesEvent } from '../lib/fee';
import {
  effectiveEntryDeadline,
  standardEntryDeadline,
  isEntryClosed as computeEntryClosed,
  isLateEntryWindow,
  formatDeadline,
} from '../lib/entryDeadline';
import { trackViewTournament, trackBeginApplication } from '../lib/analytics';
import { getEntryTexts } from '../locales/entry';
import type { Tournament } from '../types';

// ページ全体はネイビー基調の1枚カード。レベルはヘッダー内チップでのみ表示する
type InfoRow = {
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  sub?: string;
  extra?: ReactNode;
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
      trackViewTournament(t.id, t.entry_fee);

      // 残り枠の表示に必要なのは件数だけ。個人情報を含む entries は直接読まない
      const { data: confirmed } = await supabase.rpc('get_tournament_entry_count', {
        p_tournament_id: Number(id),
      });
      setEntryCount(Number(confirmed ?? 0));
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

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
      <div className="skeleton h-[480px] w-full rounded-2xl" />
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

  // 申し込み締め切り。共通ルールは「大会14日前 23:59 JST」で、
  // late_entry_until が入っている大会だけ追加受付としてそこまで延長される（src/lib/entryDeadline.ts）
  const tLang = lang === 'zh' ? 'zh' : 'ja';
  const et = getEntryTexts(lang);
  const entryDeadline = effectiveEntryDeadline(tournament);
  const cancelDeadline = standardEntryDeadline(tournament.event_date);
  const isEntryClosed = computeEntryClosed(tournament);
  const lateEntry = isLateEntryWindow(tournament);
  const entryDeadlineStr = formatDeadline(entryDeadline, tLang);
  const pairFee = tournament.entry_fee.toLocaleString();

  // 強調はアンバー1色に限定（残席の逼迫のみ）。それ以外はニュートラル
  const badgeColor = remaining <= 0 ? 'bg-gray-200 text-gray-600' : remaining <= 3 ? 'bg-amber-100 text-amber-900' : remaining <= 7 ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600';

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

      {/* 大会情報カード：外枠は1つ。中はヘッダー／罫線区切りのセクション／フッターCTA */}
      <article className="relative bg-white rounded-2xl border border-gray-200 shadow-sm mb-6">
        {/* ヘッダー（全レベル共通のネイビー） */}
        <header className="bg-kb-navy rounded-t-2xl px-5 sm:px-6 py-6 text-white">
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
                    <div className="text-kb-navy-soft text-xs font-medium mb-0.5">{seriesLabel}</div>
                    <div className="text-xl sm:text-2xl font-bold">{mainTitle}</div>
                  </>
                );
              })()}
            </h1>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {remaining > 0 && remaining <= 3 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-300 text-amber-950">{lang === 'zh' ? `仅剩${remaining}位` : `残り${remaining}席`}</span>
              )}
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/15">
                {daysUntil < 0 ? (lang === 'zh' ? '已结束' : '開催済み') : daysUntil === 0 ? (lang === 'zh' ? '今日举办！' : '本日開催！') : (lang === 'zh' ? `还有${daysUntil}天` : `あと${daysUntil}日`)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/15 text-white">{tournament.level}</span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/15 text-white">{tournament.event_type}</span>
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
        </header>

        {/* 基本情報（罫線区切りの行） */}
        <div className="divide-y divide-gray-100">
          {([
            { Icon: Calendar, label: lang === 'zh' ? '日期' : '開催日', value: formatDate(tournament.event_date) },
            { Icon: Clock, label: lang === 'zh' ? '时间' : '時間', value: `${formatTime(tournament.start_time)} 〜 ${formatTime(tournament.end_time)}` },
            {
              Icon: MapPin, label: lang === 'zh' ? '场馆' : '会場', value: tournament.location, sub: tournament.venue_address,
              extra: (
                <a
                  href={`https://maps.google.com/maps?q=${encodeURIComponent(tournament.venue_address || tournament.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-kb-blue hover:underline mt-1"
                >
                  {lang === 'zh' ? '查看地图' : '地図を見る'}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ),
            },
            { Icon: Wallet, label: lang === 'zh' ? '参加费' : '参加費', value: feeDisplay(tournament, lang === 'zh' ? 'zh' : 'ja'), sub: isDoublesEvent(tournament) ? (lang === 'zh' ? `一对合计 ¥${tournament.entry_fee.toLocaleString()}` : `ペア合計 ¥${tournament.entry_fee.toLocaleString()}`) : undefined },
            { Icon: AlertCircle, label: lang === 'zh' ? '取消期限' : 'キャンセル期限', value: formatDate(cancelDeadline.toISOString().split('T')[0]) },
          ] satisfies InfoRow[]).map(({ Icon, label, value, sub, extra }) => (
            <div key={label} className="flex items-start gap-3 px-5 py-4">
              <Icon className="w-[18px] h-[18px] flex-shrink-0 mt-0.5 text-gray-400" strokeWidth={1.75} />
              <div>
                <div className="text-xs text-gray-400 mb-0.5">{label}</div>
                <div className="font-semibold text-gray-900 text-sm">{value}</div>
                {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
                {extra}
              </div>
            </div>
          ))}

          {/* 残席 */}
          <div className="flex items-center justify-between px-5 py-4">
            <span className="flex items-center gap-3 text-xs text-gray-500 font-medium">
              <Users className="w-[18px] h-[18px] text-gray-400" strokeWidth={1.75} />
              {lang === 'zh' ? '剩余名额' : '残席状況'}
            </span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>{lang === 'zh' ? `剩余${remaining}位` : `残り${remaining}席`}</span>
          </div>
        </div>

        {/* 追加受付（アンバーはこの帯と残席チップだけの強調色） */}
        {lateEntry && !isEntryClosed && (
          <section className="border-t border-gray-100 bg-amber-50/70 px-5 py-4">
            <p className="text-sm font-bold text-amber-900 mb-2">{et.lateTitle}</p>
            <ul className="space-y-1 text-sm text-amber-900">
              <li className="font-bold">{et.lateDeadline(entryDeadlineStr)}</li>
              <li>{et.lateCreditOnly}</li>
              <li className="font-bold">{et.latePairFee(pairFee)}</li>
            </ul>
            <p className="text-xs text-amber-800/90 mt-2.5 pt-2.5 border-t border-amber-200/70">{et.lateNoRefund}</p>
          </section>
        )}

        {/* 事前支払い */}
        {tournament.payment_required && (
          <section className="border-t border-gray-100 bg-gray-50 px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-1">
              <CreditCard className="w-[18px] h-[18px] text-kb-blue" strokeWidth={1.75} />
              {lang === 'zh' ? '本大会需提前支付参加费' : '事前支払いが必要な大会です'}
            </p>
            {lateEntry ? (
              // 追加受付はカード決済のみ＝申込と同時に決済が完了するため、
              // 「支払い期限」を出すと仕様と矛盾する
              <>
                <p className="text-xs font-bold text-gray-700">{et.latePayTiming}</p>
                <p className="text-xs text-gray-500 mt-0.5">{et.latePayTimingNote}</p>
              </>
            ) : tournament.payment_deadline ? (
              <p className="text-xs text-gray-500">{lang === 'zh' ? '支付期限' : '支払い期限'}：{formatDate(tournament.payment_deadline)}</p>
            ) : null}
          </section>
        )}

        {/* 説明文 */}
        {tournament.description && (
          <section className="border-t border-gray-100 px-5 py-4">
            <p className="text-xs text-gray-400 mb-2">{lang === 'zh' ? '大会详情' : '大会詳細'}</p>
            <div
              className="text-sm text-gray-600 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: tournament.description }}
            />
          </section>
        )}

        {/* シェア */}
        {tournament.status === 'active' && (
          <section className="border-t border-gray-100 px-5 py-4">
            <p className="text-xs text-gray-400 mb-2">{lang === 'zh' ? '分享：' : 'シェアする：'}</p>
            <div className="flex gap-3">
              <button
                onClick={handleLineShare}
                className="flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-xl bg-[#06C755] text-white font-bold text-sm hover:opacity-90 transition-opacity"
              >
                <img src="/icons/line.png" alt="LINE" className="w-6 h-6 rounded-lg" />
                {shareLabels.line}
              </button>
              <button
                onClick={handleWechatShare}
                className="flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-xl bg-[#07C160] text-white font-bold text-sm hover:opacity-90 transition-opacity"
              >
                <svg viewBox="0 0 40 40" className="w-6 h-6 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <rect width="40" height="40" rx="10" fill="white" fillOpacity="0.2"/>
                  <path d="M17.5 9C11.1 9 6 13.2 6 18.4c0 2.9 1.6 5.5 4.2 7.2l-1 3.4 3.8-1.9c1.1.3 2.3.5 3.5.5 6.4 0 11.5-4.2 11.5-9.4S23.9 9 17.5 9z" fill="white"/>
                  <path d="M34 23.5c0-4.4-4.4-8-9.8-8-.3 0-.6 0-.9.1 1.1 1.4 1.7 3 1.7 4.8 0 4.7-4.5 8.5-10 8.5-.5 0-1 0-1.5-.1C15.3 31 18 32.5 21 32.5c1 0 2-.2 3-.4l3.3 1.7-.9-3c2.2-1.5 3.6-3.7 3.6-6.3z" fill="white" fillOpacity="0.85"/>
                </svg>
                {shareLabels.wechat}
              </button>
            </div>
          </section>
        )}

        {/* フッターCTA：受付中だけカード内で追従。締切後は静的に収まる */}
        <div className={
          tournament.status === 'active' && !isEntryClosed && remaining > 0
            ? 'sticky bottom-0 rounded-b-2xl border-t border-gray-100 bg-white/95 backdrop-blur-sm px-4 py-3'
            : 'rounded-b-2xl border-t border-gray-100 px-4 py-3'
        }>
          {tournament.status !== 'active' ? (
            <div className="w-full bg-gray-100 text-gray-500 font-bold py-3.5 rounded-xl text-center text-sm">{lang === 'zh' ? '已中止' : '中止'}</div>
          ) : isEntryClosed ? (
            <div className="w-full bg-gray-100 text-gray-500 font-bold py-3.5 rounded-xl text-center text-sm cursor-not-allowed">
              {tournament.late_entry_until
                ? et.lateClosed(entryDeadlineStr)
                : lang === 'zh' ? `报名已截止（截止于${entryDeadlineStr}）` : `申し込み受付終了（${entryDeadlineStr}に締め切りました）`}
            </div>
          ) : remaining <= 0 ? (
            <div className="w-full bg-gray-100 text-gray-500 font-bold py-3.5 rounded-xl text-center text-sm">{lang === 'zh' ? '已满员' : '満員'}</div>
          ) : (
            <button
              onClick={() => setPreEntry(true)}
              className="w-full bg-kb-blue hover:bg-kb-blue-deep active:bg-kb-navy text-white font-bold py-4 rounded-xl transition-colors text-base"
            >
              {lang === 'zh' ? '报名本次大会 →' : 'この大会に申し込む →'}
            </button>
          )}
        </div>
      </article>

      {preEntry && !showForm && (
        <PreEntryModal
          tournament={tournament}
          onConfirm={() => { trackBeginApplication(tournament.id); setShowForm(true); setPreEntry(false); }}
          onClose={() => setPreEntry(false)}
        />
      )}
      {showForm && (
        <EntryForm tournament={tournament} entryCount={entryCount} onClose={() => setShowForm(false)} />
      )}

      {/* 同じ種目の常設ページへの導線（2026-08-24）。
          大会は終わるとトップの一覧から消えるので、終わった大会に辿り着いた人が
          「この種目は今後もやるのか」を確認できる場所へ戻せるようにする */}
      {(() => {
        const typeDef = tournamentTypeByEventType(tournament.event_type);
        if (!typeDef) return null;
        return (
          <div className="mt-6 text-center">
            <Link to={`/${lang === 'zh' ? 'zh' : 'ja'}/tournaments/${typeDef.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
              {lang === 'zh'
                ? `查看${typeDef.name.zh}比赛的全部信息`
                : `${typeDef.name.ja}の大会をまとめて見る`}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        );
      })()}
    </main>
    </>
  );
};
