import type { Tournament } from '../types';

interface TournamentCardProps {
  tournament: Tournament;
  onApply: (tournament: Tournament) => void;
}

const levelColors: Record<string, string> = {
  '初級OP': 'bg-green-100 text-green-800',
  '初級S': 'bg-blue-100 text-blue-800',
  '初級SS': 'bg-purple-100 text-purple-800',
  'オープン': 'bg-orange-100 text-orange-800',
};

export const TournamentCard = ({ tournament, onApply }: TournamentCardProps) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  };

  const formatTime = (timeStr: string) => timeStr.slice(0, 5);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-white font-bold text-lg leading-snug">{tournament.title}</h3>
          <div className="flex gap-2 flex-shrink-0">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${levelColors[tournament.level] || 'bg-gray-100 text-gray-700'}`}>
              {tournament.level}
            </span>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-white/20 text-white">
              {tournament.event_type}
            </span>
          </div>
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <div className="text-gray-500 text-xs mb-1">📅 開催日</div>
            <div className="font-medium text-gray-800">{formatDate(tournament.event_date)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">🕐 時間</div>
            <div className="font-medium text-gray-800">{formatTime(tournament.start_time)} 〜 {formatTime(tournament.end_time)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">📍 会場</div>
            <div className="font-medium text-gray-800">{tournament.location}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">💰 参加費</div>
            <div className="font-medium text-gray-800">¥{tournament.entry_fee.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">👥 定員</div>
            <div className="font-medium text-gray-800">{tournament.capacity}名</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">⚠️ キャンセル期限</div>
            <div className="font-medium text-gray-800">{formatDate(tournament.cancel_deadline)}</div>
          </div>
        </div>

        {tournament.cancel_fee && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-4">
            キャンセル料：期限後は¥{tournament.cancel_fee.toLocaleString()}
          </p>
        )}

        {tournament.description && (
          <div
            className="text-sm text-gray-600 mb-5 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: tournament.description }}
          />
        )}

        {tournament.status === 'active' ? (
          <button
            onClick={() => onApply(tournament)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            申し込む
          </button>
        ) : (
          <div className="w-full bg-gray-200 text-gray-500 font-bold py-3 rounded-xl text-center">
            中止
          </div>
        )}
      </div>
    </div>
  );
};
