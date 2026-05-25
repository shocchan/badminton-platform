import { useState, useEffect } from 'react';
import { useTournaments } from '../hooks/useTournaments';
import { TournamentCard } from '../components/TournamentCard';
import { EntryForm } from '../components/EntryForm';
import { supabase } from '../services/supabaseClient';
import type { Tournament } from '../types';

export const HomePage = () => {
  const { tournaments, loading, error } = useTournaments();
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [entryCounts, setEntryCounts] = useState<Record<number, number>>({});
  const [filterLevel, setFilterLevel] = useState<string>('全て');
  const [filterType, setFilterType] = useState<string>('全て');

  // エントリー数を取得
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

  // フィルター用の選択肢を動的に生成
  const levels = ['全て', ...Array.from(new Set(activeTournaments.map(t => t.level)))];
  const types = ['全て', ...Array.from(new Set(activeTournaments.map(t => t.event_type)))];

  // フィルタリング
  const filteredTournaments = activeTournaments.filter(t => {
    const levelOk = filterLevel === '全て' || t.level === filterLevel;
    const typeOk = filterType === '全て' || t.event_type === filterType;
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
        {/* オーバーレイ：左側を暗くしてテキストを読みやすく */}
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

        {/* タイトル＋フィルターバー */}
        {!loading && !error && activeTournaments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">開催予定の大会</h2>
            {(levels.length > 2 || types.length > 2) && (
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

        {!loading && !error && filteredTournaments.length === 0 && activeTournaments.length > 0 && (
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
              onApply={setSelectedTournament}
            />
          ))}
        </div>
      </div>

      {selectedTournament && (
        <EntryForm
          tournament={selectedTournament}
          onClose={() => setSelectedTournament(null)}
        />
      )}
    </main>
  );
};
