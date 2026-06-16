import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useTournaments } from '../hooks/useTournaments';
import { TournamentCard } from '../components/TournamentCard';
import { TournamentCardSkeleton } from '../components/TournamentCardSkeleton';
import { EntryForm } from '../components/EntryForm';
import { PreEntryModal } from '../components/PreEntryModal';
import { supabase } from '../services/supabaseClient';
import type { Tournament } from '../types';

// レベル別カラー（TournamentCard・LevelGuidePage と統一）
const levelColor = (level: string): string => {
  switch (level) {
    case 'オープン': return '#7c3aed';  // violet-600
    case '中級':     return '#4f46e5';  // indigo-600
    case '初級':     return '#f97316';  // orange-500
    case '超初級':   return '#10b981';  // emerald-500
    default:         return '#6b7280';
  }
};

const LEVEL_LEGEND = [
  { label: 'オープン', color: '#7c3aed' },
  { label: '中級',     color: '#4f46e5' },
  { label: '初級',     color: '#f97316' },
  { label: '超初級',   color: '#10b981' },
];

// ── カレンダーコンポーネント ──────────────────────────────
interface CalendarProps {
  tournaments: Tournament[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

const TournamentCalendar = ({ tournaments, selectedDate, onSelectDate }: CalendarProps) => {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const toDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const todayStr =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const byDate: Record<string, Tournament[]> = {};
  tournaments.forEach(t => {
    const d = t.event_date.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={prevMonth}
          aria-label="前の月へ"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold transition-colors"
        >‹</button>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-gray-900 text-sm">
            {year}年 {month + 1}月
          </span>
          {(year !== today.getFullYear() || month !== today.getMonth()) && (
            <button
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
              className="text-xs text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full transition-colors font-medium"
            >
              今月
            </button>
          )}
        </div>
        <button
          onClick={nextMonth}
          aria-label="次の月へ"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold transition-colors"
        >›</button>
      </div>

      <div className="p-3">
        {/* 曜日 */}
        <div className="grid grid-cols-7 mb-1">
          {['日','月','火','水','木','金','土'].map((d, i) => (
            <div key={d} className={`text-center text-xs font-bold py-1 ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'
            }`}>{d}</div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day    = i + 1;
            const ds     = toDateStr(day);
            const tours  = byDate[ds] ?? [];
            const hasTour    = tours.length > 0;
            const isToday    = ds === todayStr;
            const isSelected = ds === selectedDate;
            const dow = new Date(year, month, day).getDay();

            return (
              <div
                key={day}
                onClick={() => hasTour && onSelectDate(isSelected ? null : ds)}
                className={[
                  'rounded-lg flex flex-col items-center py-1 px-0.5 min-h-[46px] transition-colors',
                  hasTour ? 'cursor-pointer hover:bg-blue-50' : '',
                  isSelected ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : '',
                  isToday && !isSelected ? 'bg-yellow-50 ring-2 ring-yellow-300 ring-inset' : '',
                ].join(' ')}
              >
                <span className={[
                  'text-xs font-semibold mb-0.5',
                  dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700',
                  isToday ? '!text-yellow-600 font-extrabold' : '',
                ].join(' ')}>
                  {day}
                </span>
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {tours.map(t => (
                    <span
                      key={t.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: levelColor(t.level) }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-2 px-3 pb-3">
        {LEVEL_LEGEND.map(item => (
          <div key={item.label} className="flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── メインページ ──────────────────────────────────────────
export const HomePage = () => {
  const { lang } = useLanguage();
  const { tournaments, loading, error } = useTournaments();
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [preEntryTournament, setPreEntryTournament] = useState<Tournament | null>(null);
  const [entryCounts, setEntryCounts]               = useState<Record<number, number>>({});
  const [filterLevel, setFilterLevel]               = useState<string>('全て');
  const [filterType,  setFilterType]                = useState<string>('全て');
  const [selectedDate, setSelectedDate]             = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen]             = useState<boolean>(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchEntryCounts = async () => {
      // confirmed のみカウント（waitlist・cancelled は残席に影響しない）
      const { data } = await supabase
        .from('entries')
        .select('tournament_id')
        .eq('status', 'confirmed');
      if (data) {
        const counts: Record<number, number> = {};
        data.forEach(e => {
          counts[e.tournament_id] = (counts[e.tournament_id] || 0) + 1;
        });
        setEntryCounts(counts);
      }
    };
    fetchEntryCounts();
  }, []);

  const activeTournaments = tournaments
    .filter(t => t.status === 'active' && (t.visibility ?? 'published') === 'published')
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
  const levels = ['全て', ...Array.from(new Set(activeTournaments.map(t => t.level)))];
  const types  = ['全て', ...Array.from(new Set(activeTournaments.map(t => t.event_type)))];

  const handleDateSelect = (date: string | null) => {
    setSelectedDate(date);
    // モバイル: 日付選択したらカレンダーを閉じてリスト部分へスクロール
    if (date) {
      setCalendarOpen(false);
      setTimeout(() => {
        listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  };

  const filteredTournaments = activeTournaments.filter(t => {
    const levelOk = filterLevel === '全て' || t.level === filterLevel;
    const typeOk  = filterType  === '全て' || t.event_type === filterType;
    const dateOk  = !selectedDate || t.event_date.slice(0, 10) === selectedDate;
    return levelOk && typeOk && dateOk;
  });

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
    : null;

  return (
    <main>
      {/* ヒーローセクション */}
      <div className="relative text-white overflow-hidden">
        <picture>
          <source srcSet="/hero.webp" type="image/webp" />
          <img
            src="/hero.jpg"
            alt="川口・蕨バドミントン交流会"
            fetchPriority="high"
            loading="eager"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/80 via-blue-800/50 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-24">
          <div className="max-w-lg">
            <p className="text-blue-200 text-sm sm:text-base font-semibold tracking-widest mb-2 drop-shadow">
              {lang === 'zh' ? '川口・蕨羽毛球交流会' : '川口・蕨バドミントン交流会'}
            </p>
            <h1 className="text-3xl sm:text-5xl font-extrabold mb-3 tracking-tight drop-shadow-lg leading-tight">
              {lang === 'zh' ? <>下班后，<br />4场以上！</> : <>仕事終わりに、<br />4試合以上。</>}
            </h1>
            <p className="text-blue-100 text-sm sm:text-lg leading-relaxed mb-8 drop-shadow">
              {lang === 'zh'
                ? <>平日夜间举办・川口・蕨地区羽毛球赛事。<br className="hidden sm:inline" />超初级〜公开组全级别欢迎！</>
                : <>平日夜開催・川口・蕨エリアのバドミントン交流会。<br className="hidden sm:inline" />超初級〜オープンまで全レベル歓迎！</>
              }
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              {lang === 'zh' ? <>
                <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">🌙 平日夜间举办</span>
                <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">🏆 保证4场以上</span>
                <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">👥 全级别欢迎</span>
                <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">📍 川口・蕨地区</span>
              </> : <>
                <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">🌙 平日夜開催</span>
                <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">🏆 4試合以上保証</span>
                <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">👥 全レベル歓迎</span>
                <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">📍 川口・蕨エリア</span>
              </>}
            </div>
          </div>
        </div>
      </div>

      {/* 大会ページ案内バナー */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-2 text-amber-800">
          <span className="text-base flex-shrink-0">🏆</span>
          <span className="font-semibold text-sm leading-snug">
            {lang === 'zh' ? '这里是赛事（比赛）页面。' : 'ここは大会のページです。'}
          </span>
          <span className="text-amber-600 text-xs hidden sm:inline">
            {lang === 'zh' ? '每次需要1,000日元以上的参赛费。' : '毎回1,000円〜の参加費が発生します。'}
          </span>
          <Link
            to={lang === 'zh' ? '/activity-cn' : '/activity'}
            className="ml-auto flex-shrink-0 text-xs font-semibold bg-emerald-500 text-white px-3 py-1.5 rounded-full hover:bg-emerald-600 transition-colors whitespace-nowrap"
          >
            {lang === 'zh' ? '日常活动 →' : '通常活動はこちら →'}
          </Link>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">

        {loading && (
          <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 lg:items-start">
            <div className="hidden lg:block">
              <div className="skeleton h-6 w-32 rounded mb-3" />
              <div className="skeleton h-72 w-full rounded-2xl" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <TournamentCardSkeleton key={i} />)}
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm flex items-start gap-3">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div>
              <p className="font-bold mb-1">データの取得に失敗しました</p>
              <p className="text-red-600">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 text-red-700 underline text-xs hover:no-underline"
              >
                再読み込みする
              </button>
            </div>
          </div>
        )}
        {!loading && !error && activeTournaments.length === 0 && (
          <div className="text-center py-24" role="status" aria-live="polite">
            <div className="text-6xl mb-6">🏸</div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">現在、開催予定の大会はありません</h2>
            <p className="text-sm text-gray-500 mb-6">新しい大会が決まり次第、こちらに掲載されます。<br />LINEやXでお知らせをお待ちください！</p>
            <a
              href="https://x.com/search?q=%E5%B7%9D%E5%8F%A3%E8%95%A8%E3%83%90%E3%83%89"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
              aria-label="Xで最新情報をチェック（外部リンク）"
            >
              Xで最新情報をチェック →
            </a>
          </div>
        )}

        {!loading && !error && activeTournaments.length > 0 && (
          /* デスクトップ: 左カレンダー sticky + 右リスト / モバイル: 縦並び */
          <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 lg:items-start">

            {/* ── 左: カレンダー（デスクトップで sticky） ── */}
            <div className="lg:sticky lg:top-6 mb-4 lg:mb-0">

              {/* モバイル用トグルボタン */}
              <button
                onClick={() => setCalendarOpen(o => !o)}
                aria-expanded={calendarOpen}
                aria-controls="tournament-calendar"
                className="lg:hidden w-full flex items-center justify-between bg-white border border-gray-200 rounded-2xl px-4 py-3.5 shadow-sm mb-2 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">📅</span>
                  <span className="font-extrabold text-gray-800 text-sm">
                    {selectedDate
                      ? `${new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} の大会を表示中`
                      : 'カレンダーで日程を絞り込む'}
                  </span>
                  {selectedDate && (
                    <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">絞込中</span>
                  )}
                </div>
                <span className={`text-gray-400 text-xs transition-transform duration-200 ${calendarOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {/* カレンダー本体（モバイル: トグル / デスクトップ: 常時表示） */}
              <div id="tournament-calendar" className={`lg:block ${calendarOpen ? 'block' : 'hidden'}`}>
                <h2 className="text-base font-extrabold text-gray-800 mb-3 hidden lg:block">📅 開催カレンダー</h2>
                <TournamentCalendar
                  tournaments={activeTournaments}
                  selectedDate={selectedDate}
                  onSelectDate={handleDateSelect}
                />
                {selectedDate && (
                  <button
                    onClick={() => { setSelectedDate(null); setCalendarOpen(false); }}
                    aria-label="日付の絞り込みを解除して全大会を表示"
                    className="mt-2 w-full text-xs text-blue-600 hover:underline py-1"
                  >
                    ✕ 絞り込みを解除して全大会を表示
                  </button>
                )}
              </div>
            </div>

            {/* ── 右: 大会リスト ── */}
            <div ref={listRef}>
              {/* リストヘッダー */}
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h2 className="text-base font-extrabold text-gray-800">
                  {selectedDateLabel
                    ? <span>📋 {selectedDateLabel}の大会</span>
                    : '📋 開催予定の大会'
                  }
                </h2>
              </div>

              {/* フィルター */}
              {!selectedDate && (levels.length > 2 || types.length > 2) && (
                <div className="flex flex-wrap gap-3 mb-5">
                  {levels.length > 2 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-gray-500 font-medium">レベル：</span>
                      {levels.map(level => (
                        <button
                          key={level}
                          onClick={() => setFilterLevel(level)}
                          aria-label={`レベル：${level}で絞り込む`}
                          aria-pressed={filterLevel === level}
                          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                            filterLevel === level
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  )}
                  {types.length > 2 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-gray-500 font-medium">種目：</span>
                      {types.map(type => (
                        <button
                          key={type}
                          onClick={() => setFilterType(type)}
                          aria-label={`種目：${type}で絞り込む`}
                          aria-pressed={filterType === type}
                          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                            filterType === type
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 大会カード */}
              {filteredTournaments.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="text-4xl mb-3">🏸</div>
                  <p className="text-sm">
                    {selectedDate ? 'この日の大会はありません' : '該当する大会がありません'}
                  </p>
                  {(selectedDate || filterLevel !== '全て' || filterType !== '全て') && (
                    <button
                      onClick={() => { setSelectedDate(null); setFilterLevel('全て'); setFilterType('全て'); }}
                      aria-label="フィルターをリセットしてすべての大会を表示"
                      className="mt-3 text-sm text-blue-600 hover:underline"
                    >
                      すべての大会を表示
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {filteredTournaments.map(tournament => (
                    <TournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      entryCount={entryCounts[tournament.id] || 0}
                      onApply={setPreEntryTournament}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* 通常活動バナー */}
      <div className="max-w-6xl mx-auto px-4 pb-10">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-white">
            <p className="text-xs font-semibold tracking-widest uppercase opacity-80 mb-1">REGULAR SESSION</p>
            <h2 className="text-xl font-extrabold mb-1">🏸 通常活動に参加しよう！</h2>
            <p className="text-emerald-100 text-sm">2時間 ¥600 ／ 定員制・事前申し込み制</p>
          </div>
          <Link
            to="/activity"
            className="flex-shrink-0 bg-white text-emerald-700 font-bold px-6 py-3 rounded-xl text-sm hover:bg-emerald-50 transition-colors shadow"
          >
            申し込みはこちら →
          </Link>
        </div>
      </div>

      {preEntryTournament && !selectedTournament && (
        <PreEntryModal
          tournament={preEntryTournament}
          onConfirm={() => {
            setSelectedTournament(preEntryTournament);
            setPreEntryTournament(null);
          }}
          onClose={() => setPreEntryTournament(null)}
        />
      )}
      {selectedTournament && (
        <EntryForm
          tournament={selectedTournament}
          entryCount={entryCounts[selectedTournament.id] || 0}
          onClose={() => setSelectedTournament(null)}
        />
      )}
    </main>
  );
};
