import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import type { Tournament } from '../types';

interface TournamentCardProps {
  tournament: Tournament;
  entryCount?: number;
  onApply: (tournament: Tournament) => void;
}

const levelColors: Record<string, string> = {
  '超初級': 'bg-emerald-100 text-emerald-800',
  '初級':   'bg-orange-100 text-orange-800',
  '中級':   'bg-indigo-100 text-indigo-800',
  'オープン': 'bg-violet-100 text-violet-800',
};

type LevelConfig = {
  headerBg: string; titleColor: string; typeBadge: string;
  shareBtn: string; countdown: string; applyBtn: string;
};
const levelConfig: Record<string, LevelConfig> = {
  '超初級': {
    headerBg:  'bg-emerald-50',
    titleColor:'text-emerald-900',
    typeBadge: 'bg-emerald-100 text-emerald-800',
    shareBtn:  'text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200',
    countdown: 'bg-emerald-100 text-emerald-800',
    applyBtn:  'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700',
  },
  '初級': {
    headerBg:  'bg-orange-50',
    titleColor:'text-orange-900',
    typeBadge: 'bg-orange-100 text-orange-800',
    shareBtn:  'text-orange-700 hover:text-orange-900 bg-orange-100 hover:bg-orange-200',
    countdown: 'bg-orange-100 text-orange-800',
    applyBtn:  'bg-orange-500 hover:bg-orange-600 active:bg-orange-700',
  },
  '中級': {
    headerBg:  'bg-indigo-50',
    titleColor:'text-indigo-900',
    typeBadge: 'bg-indigo-100 text-indigo-800',
    shareBtn:  'text-indigo-700 hover:text-indigo-900 bg-indigo-100 hover:bg-indigo-200',
    countdown: 'bg-indigo-100 text-indigo-800',
    applyBtn:  'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800',
  },
  'オープン': {
    headerBg:  'bg-violet-50',
    titleColor:'text-violet-900',
    typeBadge: 'bg-violet-100 text-violet-800',
    shareBtn:  'text-violet-700 hover:text-violet-900 bg-violet-100 hover:bg-violet-200',
    countdown: 'bg-violet-100 text-violet-800',
    applyBtn:  'bg-violet-600 hover:bg-violet-700 active:bg-violet-800',
  },
};
const defaultConfig: LevelConfig = {
  headerBg: 'bg-blue-50', titleColor: 'text-blue-900',
  typeBadge: 'bg-blue-100 text-blue-800',
  shareBtn: 'text-blue-700 hover:text-blue-900 bg-blue-100 hover:bg-blue-200',
  countdown: 'bg-blue-100 text-blue-800',
  applyBtn: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
};

export const TournamentCard = ({ tournament, entryCount = 0, onApply }: TournamentCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareToast, setShareToast] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);
  const { lang } = useLanguage();

  // 説明文のプレーンテキスト長（短ければ折りたたみトグルを出さない）
  const descTextLength = (tournament.description || '').replace(/<[^>]*>/g, '').length;
  const isDescLong = descTextLength > 80;

  // ── フェードインアニメーション ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  // ── シェア機能 ──
  const showToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(''), 2500);
  };

  const generateShareText = () => {
    const d = formatDate(tournament.event_date);
    const t = `${formatTime(tournament.start_time)}〜${formatTime(tournament.end_time)}`;
    if (lang === 'zh') {
      return `【${tournament.title}】\n日期：${d}\n时间：${t}\n地点：${tournament.location}\n参加费：${tournament.entry_fee}日元\n详情・报名：`;
    }
    return `【${tournament.title}】\n日時：${d}\n時間：${t}\n会場：${tournament.location}\n参加費：${tournament.entry_fee}円\n詳細・申し込み：`;
  };

  const handleLineShare = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const baseUrl = `https://kawabado.com/${lang}/tournaments/${tournament.id}?from=line`;
    const text = generateShareText();
    try {
      await navigator.clipboard.writeText(`${text}${baseUrl}`);
      showToast(lang === 'zh' ? '已复制。请粘贴到LINE进行分享。' : 'コピーしました。LINEに貼り付けてシェアしてください。');
    } catch { /* 対応なし */ }
    setShowShareModal(false);
  };

  const handleWechatShare = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const baseUrl = `https://kawabado.com/${lang}/tournaments/${tournament.id}?from=wechat`;
    const text = generateShareText();
    try {
      await navigator.clipboard.writeText(`${text}${baseUrl}`);
      showToast(lang === 'zh' ? '已复制。请粘贴到微信进行分享。' : 'コピーしました。WeChatに貼り付けてシェアしてください。');
    } catch { /* 対応なし */ }
    setShowShareModal(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  };

  const formatTime = (timeStr: string) => timeStr.slice(0, 5);

  const getDaysUntil = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const event = new Date(dateStr);
    event.setHours(0, 0, 0, 0);
    return Math.ceil((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const remaining = tournament.capacity - entryCount;
  const daysUntil = getDaysUntil(tournament.event_date);
  const isEntryClosed = daysUntil >= 0 && daysUntil < 14;
  const config = levelConfig[tournament.level] ?? defaultConfig;

  const remainingColor = remaining <= 3
    ? 'bg-red-500 text-white'
    : remaining <= 7
    ? 'bg-yellow-400 text-yellow-900'
    : 'bg-green-100 text-green-800';

  const countdownLabel = daysUntil < 0
    ? '開催済み'
    : daysUntil === 0
    ? '本日開催！'
    : `あと${daysUntil}日`;

  const countdownColor = daysUntil <= 3
    ? 'bg-red-100 text-red-700'
    : config.countdown;

  return (
    <>
    {/* アンカー入れ子（hydrationエラー）回避のため、カード本体はdiv +
        タイトルLinkの::afterをカード全体に広げるstretched linkパターン。
        ボタン・地図リンク等は relative z-10 でLinkレイヤーの上に置く */}
    <div
      ref={cardRef}
      className={`relative bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-500 flex flex-col group ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      {/* ヘッダー */}
      <div className={`${config.headerBg} px-4 sm:px-6 py-4`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="leading-snug">
            {(() => {
              const SERIES = '川口・蕨バドミントン交流会';
              const seriesLabel = tournament.edition != null
                ? `${SERIES} 第${tournament.edition}回`
                : SERIES;
              const rest = tournament.title.replace(SERIES, '').trim();
              const mainTitle = rest || tournament.title;
              return (
                <Link
                  to={`/${lang === 'zh' ? 'zh' : 'ja'}/tournaments/${tournament.id}`}
                  className="block after:absolute after:inset-0 after:content-['']"
                >
                  <div className="text-xs text-gray-400 font-medium mb-0.5">{seriesLabel}</div>
                  <div className={`${config.titleColor} font-bold text-base sm:text-lg`}>{mainTitle}</div>
                </Link>
              );
            })()}
          </h3>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {remaining > 0 && remaining <= 3 && (
              <span className="text-xs font-extrabold px-2 py-1 rounded-full bg-red-500 text-white animate-pulse">
                🔥 急募！
              </span>
            )}
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${countdownColor}`}>
              {countdownLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${levelColors[tournament.level] || 'bg-gray-100 text-gray-700'}`}>
              {tournament.level}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${config.typeBadge}`}>
              {tournament.event_type}
            </span>
          </div>
          {/* シェアボタン */}
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); setShowShareModal(true); }}
            className={`relative z-10 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${config.shareBtn}`}
            aria-label="この大会をシェア"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>{lang === 'zh' ? '分享' : 'シェア'}</span>
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="px-4 sm:px-6 py-5 flex flex-col flex-1">
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <div className="text-gray-500 text-xs mb-1">📅 開催日</div>
            <div className="font-medium text-gray-800 text-xs sm:text-sm">{formatDate(tournament.event_date)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">🕐 時間</div>
            <div className="font-medium text-gray-800 text-xs sm:text-sm">{formatTime(tournament.start_time)} 〜 {formatTime(tournament.end_time)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">📍 会場</div>
            <div className="font-medium text-gray-800 text-xs sm:text-sm">{tournament.location}</div>
            {tournament.venue_address && (
              <div className="text-gray-400 text-xs mt-0.5">{tournament.venue_address}</div>
            )}
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">💰 参加費</div>
            <div className="font-medium text-gray-800 text-xs sm:text-sm">¥{tournament.entry_fee.toLocaleString()}</div>
          </div>
          <div className="col-span-2">
            <div className="text-gray-500 text-xs mb-1">⚠️ キャンセル期限</div>
            <div className="font-medium text-gray-800 text-xs sm:text-sm">{formatDate((() => { const d = new Date(tournament.event_date); d.setDate(d.getDate() - 14); return d.toISOString().split('T')[0]; })())}</div>
          </div>
        </div>

        {/* 残席バッジ */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-gray-500 font-medium">👥 残席状況</span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${remainingColor}`}>
            残り{remaining}席
          </span>
        </div>

        {/* Google マップリンク */}
        <a
          href={`https://maps.google.com/maps?q=${encodeURIComponent(tournament.venue_address || tournament.location)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="relative z-10 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl px-4 py-2.5 transition-colors mb-4"
        >
          <span>🗺️</span>
          <span className="font-medium">{tournament.location} の地図を見る</span>
          <span className="ml-auto text-xs">→</span>
        </a>

        {tournament.payment_required && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 mb-4">
            <p className="text-xs text-blue-700 font-medium mb-1">💳 事前支払いが必要です</p>
            {tournament.payment_deadline && (
              <p className="text-xs text-blue-600">支払い期限：{formatDate(tournament.payment_deadline)}</p>
            )}
          </div>
        )}

        {tournament.description && (
          <div className="relative z-10 mb-5">
            <div
              className={`text-sm text-gray-600 prose prose-sm max-w-none ${
                isDescLong && !descExpanded ? 'line-clamp-3' : ''
              }`}
              dangerouslySetInnerHTML={{ __html: tournament.description }}
            />
            {isDescLong && (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); setDescExpanded(v => !v); }}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {descExpanded
                  ? (lang === 'zh' ? '收起 ▲' : '閉じる ▲')
                  : (lang === 'zh' ? '查看详情 ▼' : '詳細を見る ▼')}
              </button>
            )}
          </div>
        )}

        <div className="relative z-10 mt-auto">
          {tournament.status !== 'active' ? (
            <div className="w-full bg-gray-200 text-gray-500 font-bold py-3 rounded-xl text-center text-sm">
              中止
            </div>
          ) : daysUntil < 0 ? (
            <div className="w-full bg-gray-100 text-gray-400 font-bold py-3 rounded-xl text-center text-sm">
              開催終了
            </div>
          ) : isEntryClosed ? (
            <div className="w-full bg-gray-200 text-gray-400 font-bold py-3 rounded-xl text-center text-sm cursor-not-allowed">
              申し込み受付終了
            </div>
          ) : remaining <= 0 ? (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onApply(tournament); }}
              aria-label={`${tournament.title}のキャンセル待ちに申し込む`}
              className="w-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold py-3 rounded-xl transition-colors text-sm sm:text-base"
            >
              キャンセル待ちで申し込む →
            </button>
          ) : (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onApply(tournament); }}
              aria-label={`${tournament.title}に申し込む`}
              className={`w-full ${config.applyBtn} text-white font-bold py-3 rounded-xl transition-colors text-sm sm:text-base`}
            >
              申し込む →
            </button>
          )}
        </div>
      </div>
    </div>

      {/* トースト */}
      {shareToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-xs px-4 py-2 rounded-xl shadow-lg whitespace-nowrap pointer-events-none">
          {shareToast}
        </div>
      )}

      {/* シェアモーダル */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
          <div className="absolute inset-0 bg-black/40" onClick={e => { e.preventDefault(); e.stopPropagation(); setShowShareModal(false); }} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-gray-900 text-base mb-4 text-center">
              {lang === 'zh' ? '分享' : 'シェア'}
            </h3>
            <div className="space-y-2.5">
              <button onClick={handleLineShare}
                className="flex items-center gap-4 w-full px-5 py-3.5 rounded-2xl bg-[#06C755] text-white hover:opacity-90 transition-opacity">
                <img src="/icons/line.png" alt="LINE" className="w-9 h-9 flex-shrink-0 rounded-xl" />
                <span className="font-bold text-base">{lang === 'zh' ? '分享到LINE' : 'LINEでシェア'}</span>
              </button>
              <button onClick={handleWechatShare}
                className="flex items-center gap-4 w-full px-5 py-3.5 rounded-2xl bg-[#07C160] text-white hover:opacity-90 transition-opacity">
                <svg viewBox="0 0 40 40" className="w-9 h-9 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <rect width="40" height="40" rx="10" fill="white" fillOpacity="0.2"/>
                  <path d="M17.5 9C11.1 9 6 13.2 6 18.4c0 2.9 1.6 5.5 4.2 7.2l-1 3.4 3.8-1.9c1.1.3 2.3.5 3.5.5 6.4 0 11.5-4.2 11.5-9.4S23.9 9 17.5 9z" fill="white"/>
                  <path d="M34 23.5c0-4.4-4.4-8-9.8-8-.3 0-.6 0-.9.1 1.1 1.4 1.7 3 1.7 4.8 0 4.7-4.5 8.5-10 8.5-.5 0-1 0-1.5-.1C15.3 31 18 32.5 21 32.5c1 0 2-.2 3-.4l3.3 1.7-.9-3c2.2-1.5 3.6-3.7 3.6-6.3z" fill="white" fillOpacity="0.85"/>
                </svg>
                <span className="font-bold text-base">{lang === 'zh' ? '微信分享' : 'WeChatでシェア'}</span>
              </button>
            </div>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setShowShareModal(false); }}
              className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600"
            >
              {lang === 'zh' ? '取消' : 'キャンセル'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
