import { useState } from 'react';
import { useTournaments } from '../hooks/useTournaments';
import { TournamentCard } from '../components/TournamentCard';
import { EntryForm } from '../components/EntryForm';
import type { Tournament } from '../types';

export const HomePage = () => {
  const { tournaments, loading, error } = useTournaments();
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  const activeTournaments = tournaments.filter(t => t.status === 'active');

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">🏸 バドミントン大会案内</h1>
        <p className="text-gray-500">初心者から上級者まで楽しめるバドミントン大会を開催しています</p>
      </div>

      <h2 className="text-xl font-bold text-gray-800 mb-6">今月の大会</h2>

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

      <div className="grid md:grid-cols-2 gap-6">
        {activeTournaments.map(tournament => (
          <TournamentCard
            key={tournament.id}
            tournament={tournament}
            onApply={setSelectedTournament}
          />
        ))}
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
