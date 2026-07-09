// 管理画面: バド対決ゲームの統計
// 実施回数・プレイ人数・最高ラリー・当選数などを表示（管理者のみ / admin_game_stats RPC）。
// 人数が増えたら累計記録・最高ラリーランキングとして育てていく想定。

import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Stats {
  total_plays: number;
  plays_today: number;
  plays_7d: number;
  plays_30d: number;
  unique_players: number;
  max_rally: number;
  avg_rally: number;
  total_draws: number;
  winners: number;
  ramen_total: number;
  badminton_total: number;
  top_rallies: { rally_count: number; played_at: string }[];
}

function Card({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-black ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function GameStatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.rpc('admin_game_stats').then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(`読み込みエラー: ${error.message}`);
      else setStats(data as Stats);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [refreshKey]);

  if (loading) return <p className="text-sm text-gray-500">読み込み中…</p>;
  if (error) return <p className="text-sm font-bold text-red-500">{error}</p>;
  if (!stats) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">バド対決ゲームの実績（管理者のみ表示）</p>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          🔄 更新
        </button>
      </div>

      {/* 実施回数 */}
      <h3 className="mb-2 text-sm font-bold text-gray-700">🎮 実施回数</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="累計プレイ数" value={stats.total_plays.toLocaleString()} accent="text-blue-600" />
        <Card label="今日" value={stats.plays_today.toLocaleString()} />
        <Card label="直近7日" value={stats.plays_7d.toLocaleString()} />
        <Card label="直近30日" value={stats.plays_30d.toLocaleString()} />
      </div>

      {/* 記録・人数 */}
      <h3 className="mb-2 mt-6 text-sm font-bold text-gray-700">🏆 記録・プレイヤー</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="最高ラリー" value={stats.max_rally} sub="回" accent="text-amber-600" />
        <Card label="平均ラリー" value={stats.avg_rally} sub="回" />
        <Card label="プレイ人数" value={stats.unique_players.toLocaleString()} sub="端末/会員ベース" />
        <Card label="抽選総回数" value={stats.total_draws.toLocaleString()} />
      </div>

      {/* 当選 */}
      <h3 className="mb-2 mt-6 text-sm font-bold text-gray-700">🎁 当選</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="当選総数" value={stats.winners} accent="text-emerald-600" />
        <Card label="🍜 ラーメン券" value={stats.ramen_total} sub="発行累計" />
        <Card label="🏸 バド無料券" value={stats.badminton_total} sub="発行累計" />
        <Card label="" value="" />
      </div>

      {/* 最高ラリーTOP5 */}
      <h3 className="mb-2 mt-6 text-sm font-bold text-gray-700">🥇 ラリー数ランキング（TOP5）</h3>
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        {stats.top_rallies.length === 0 ? (
          <p className="text-sm text-gray-400">まだ記録がありません</p>
        ) : (
          <ol className="space-y-1.5">
            {stats.top_rallies.map((r, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-5 text-center font-bold text-gray-400">{['🥇', '🥈', '🥉', '4', '5'][i]}</span>
                  <span className="font-bold text-gray-900">{r.rally_count}ラリー</span>
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(r.played_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-400">
        ※ 人数が増えたら「累計記録」「最高ラリーランキング」としてブログ発表にも活用できます。
      </p>
    </div>
  );
}
