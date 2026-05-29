import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const cardRef = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

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
  const handleShare = async () => {
    const text = `【${tournament.title}】\n📅 ${formatDate(tournament.event_date)}\n🕐 ${formatTime(tournament.start_time)}〜${formatTime(tournament.end_time)}\n📍 ${tournament.location}\n💰 参加費 ¥${tournament.entry_fee.toLocaleString()}`;
    const url = `${window.location.origin}/tournaments/${tournament.id}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.title, text, url });
      } catch {
        // キャンセル等は無視
      }
    } else {
      // フォールバック: クリップボードコピー
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // 対応なし
      }
    }
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
    <Link
      to={`/tournaments/${tournament.id}`}
      ref={cardRef}
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-500 flex flex-col group ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      {/* ヘッダー */}
      <div className={`${config.headerBg} px-4 sm:px-6 py-4`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className={`${config.titleColor} font-bold text-base sm:text-lg leading-snug`}>{tournament.title}</h3>
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
            onClick={e => { e.preventDefault(); e.stopPropagation(); handleShare(); }}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${config.shareBtn}`}
            aria-label="この大会をシェア"
          >
            {copied ? (
              <>✅ <span>コピー済み</span></>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>シェア</span>
              </>
            )}
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
            <div className="font-medium text-gray-800 text-xs sm:text-sm">{formatDate(tournament.cancel_deadline)}</div>
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
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl px-4 py-2.5 transition-colors mb-4"
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
          <div
            className="text-sm text-gray-600 mb-5 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: tournament.description }}
          />
        )}

        <div className="mt-auto">
          {tournament.status !== 'active' ? (
            <div className="w-full bg-gray-200 text-gray-500 font-bold py-3 rounded-xl text-center text-sm">
              中止
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
    </Link>
  );
};
