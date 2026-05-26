import { useState, useEffect } from 'react';
import { useTournaments } from '../hooks/useTournaments';
import { TournamentCard } from '../components/TournamentCard';
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
  entryCounts: Record<number, number>;
  onApply: (t: Tournament) => void;
}

const TournamentCalendar = ({ tournaments, entryCounts, onApply }: CalendarProps) => {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=日

  const toDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const todayStr =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 日付→大会 マッピング
  const byDate: Record<string, Tournament[]> = {};
  tournaments.forEach(t => {
    const d = t.event_date.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  const selectedTournaments = selectedDate ? (byDate[selectedDate] ?? []) : [];

  return (
    <div>
      {/* カレンダー本体 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold transition-colors text-lg"
          >‹</button>
          <span className="font-extrabold text-gray-900 text-base">
            {year}年 {month + 1}月
          </span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold transition-colors text-lg"
          >›</button>
        </div>

        <div className="p-3 sm:p-4">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 mb-1">
            {['日','月','火','水','木','金','土'].map((d, i) => (
              <div
                key={d}
                className={`text-center text-xs font-bold py-1.5 ${
                  i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'
                }`}
              >{d}</div>
            ))}
          </div>

          {/* 日付グリッド */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {/* 空白セル */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {/* 日付セル */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day  = i + 1;
              const ds   = toDateStr(day);
              const tours = byDate[ds] ?? [];
              const hasTour    = tours.length > 0;
              const isToday    = ds === todayStr;
              const isSelected = ds === selectedDate;
              const dow = new Date(year, month, day).getDay();
              const isSun = dow === 0;
              const isSat = dow === 6;

              return (
                <div
                  key={day}
                  onClick={() => hasTour && setSelectedDate(isSelected ? null : ds)}
                  className={[
                    'rounded-xl flex flex-col items-center py-1.5 px-0.5 min-h-[50px] sm:min-h-[56px] transition-colors',
                    hasTour ? 'cursor-pointer hover:bg-blue-50' : '',
                    isSelected ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : '',
                    isToday && !isSelected ? 'bg-yellow-50 ring-2 ring-yellow-300 ring-inset' : '',
                  ].join(' ')}
                >
                  <span className={[
                    'text-xs font-bold mb-1',
                    isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700',
                    isToday ? '!text-yellow-600' : '',
                  ].join(' ')}>
                    {day}
                  </span>
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {tours.map(t => (
                      <span
                        key={t.id}
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: levelColor(t.level) }}
                        title={t.title}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 mt-3 px-1">
        {LEVEL_LEGEND.map(item => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded border-2 border-yellow-300 flex-shrink-0" />
          今日
        </div>
      </div>

      {/* 選択日の大会一覧 */}
      {selectedDate && (
        <div className="mt-6">
          <h3 className="font-bold text-gray-800 text-sm mb-3">
            📅{' '}
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', {
              month: 'long', day: 'numeric', weekday: 'short',
            })}の大会
          </h3>
          {selectedTournaments.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {selectedTournaments.map(tournament => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  entryCount={entryCounts[tournament.id] || 0}
                  onApply={onApply}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">この日の大会はありません</p>
          )}
        </div>
      )}

      {/* 大会がない月の場合 */}
      {Object.keys(byDate).length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-6">
          この月に予定されている大会はありません
        </p>
      )}
    </div>
  );
};

// ── メインページ ──────────────────────────────────────────
export const HomePage = () => {
  const { tournaments, loading, error } = useTournaments();
  const [selectedTournament, setSelectedTournament]   = useState<Tournament | null>(null);
  const [preEntryTournament, setPreEntryTournament]   = useState<Tournament | null>(null);
  const [entryCounts, setEntryCounts]                 = useState<Record<number, number>>({});
  const [filterLevel, setFilterLevel]                 = useState<string>('全て');
  const [filterType,  setFilterType]                  = useState<string>('全て');
  const [viewMode, setViewMode]                       = useState<'list' | 'calendar'>('list');

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

  const activeTournaments = tournaments.filter(t => t.status === 'active');
  const levels = ['全て', ...Array.from(new Set(activeTournaments.map(t => t.level)))];
  const types  = ['全て', ...Array.from(new Set(activeTournaments.map(t => t.event_type)))];

  const filteredTournaments = activeTournaments.filter(t => {
    const levelOk = filterLevel === '全て' || t.level === filterLevel;
    const typeOk  = filterType  === '全て' || t.event_type === filterType;
    return levelOk && typeOk;
  });

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

        {!loading && !error && activeTournaments.length > 0 && (
          <div className="mb-8">
            {/* タイトル＋ビュー切り替え */}
            <div className="flex items-center justify-between mb-4 gap-4">
              <h2 className="text-xl font-bold text-gray-800">開催予定の大会</h2>
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1 flex-shrink-0">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span>📋</span> リスト
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                    viewMode === 'calendar'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span>📅</span> カレンダー
                </button>
              </div>
            </div>

            {/* フィルター（リストビューのみ表示） */}
            {viewMode === 'list' && (levels.length > 2 || types.length > 2) && (
              <div className="flex flex-wrap gap-4">
                {levels.length > 2 && (
                  <div className="flex items-center gap-2 flex-wrap">
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
                  <div className="flex items-center gap-2 flex-wrap">
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
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
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

        {/* カレンダービュー */}
        {!loading && !error && viewMode === 'calendar' && (
          <TournamentCalendar
            tournaments={activeTournaments}
            entryCounts={entryCounts}
            onApply={setPreEntryTournament}
          />
        )}

        {/* リストビュー */}
        {!loading && !error && viewMode === 'list' && (
          <>
            {filteredTournaments.length === 0 && activeTournaments.length > 0 && (
              <div className="text-center py-12 text-gray-400">
                <p>該当する大会がありません</p>
                <button
                  onClick={() => { setFilterLevel('全て'); setFilterType('全て'); }}
                  className="mt-3 text-sm text-blue-600 hover:underline"
                >
                  フィルターをリセット
                </button>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
              {filteredTournaments.map(tournament => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  entryCount={entryCounts[tournament.id] || 0}
                  onApply={setPreEntryTournament}
                />
              ))}
            </div>
          </>
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
