import { useState, useEffect, useRef } from 'react';
import { useTournaments } from '../hooks/useTournaments';
import { TournamentCard } from '../components/TournamentCard';
import { TournamentCardSkeleton } from '../components/TournamentCardSkeleton';
import { EntryForm } from '../components/EntryForm';
import { PreEntryModal } from '../components/PreEntryModal';
import { supabase } from '../services/supabaseClient';
import type { Tournament } from '../types';

// レベル別カラー
const levelColor = (level: string): string => {
  switch (level) {
    case 'オープン': return '#EAB308';
    case '中級':     return '#6366f1';
    case '初級':     return '#f97316';
    case '超初級':   return '#22c55e';
    default:         return '#6b7280';
  }
};

const LEVEL_LEGEND = [
  { label: 'オープン', color: '#EAB308' },
  { label: '中級',     color: '#6366f1' },
  { label: '初級',     color: '#f97316' },
  { label: '超初級',   color: '#22c55e' },
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
      const { data } = await supabase.from('entries').select('tournament_id');
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
    .filter(t => t.status === 'active')
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
      <div
        className="relative text-white overflow-hidden"
        style={{
          backgroundImage: 'url(/hero.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/80 via-blue-800/50 to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-24">
          <div className="max-w-lg">
            <h1 className="text-3xl sm:text-5xl font-extrabold mb-4 tracking-tight drop-shadow-lg">
              🏸 川口・蕨バド交流杯
            </h1>
            <p className="text-blue-100 text-base sm:text-xl leading-relaxed mb-8 drop-shadow">
              川口・蕨エリアで初心者から上級者まで<br className="hidden sm:inline" />
              楽しめるバドミントン大会を開催しています
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">📅 不定期開催</span>
              <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">👥 全レベル歓迎</span>
              <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">📍 川口・蕨エリア</span>
              <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">⚡ 短時間・複数試合保証</span>
            </div>
          </div>
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
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}
        {!loading && !error && activeTournaments.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">🏸</div>
            <p>現在予定されている大会はありません</p>
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
              <div className={`lg:block ${calendarOpen ? 'block' : 'hidden'}`}>
                <h2 className="text-base font-extrabold text-gray-800 mb-3 hidden lg:block">📅 開催カレンダー</h2>
                <TournamentCalendar
                  tournaments={activeTournaments}
                  selectedDate={selectedDate}
                  onSelectDate={handleDateSelect}
                />
                {selectedDate && (
                  <button
                    onClick={() => { setSelectedDate(null); setCalendarOpen(false); }}
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
          onClose={() => setSelectedTournament(null)}
        />
      )}
    </main>
  );
};
