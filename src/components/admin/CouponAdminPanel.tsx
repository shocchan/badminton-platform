// 管理画面: クーポン消込パネル
// 発行済みクーポンを一覧表示し、チェックボックスをパッと入れるだけで使用済みにできる。
// 提示コード・保有者で絞り込み可能。RPC（admin_list_coupons / admin_redeem_coupon）は
// site_admins に登録された管理者のみ実行可能。

import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Coupon {
  id: string;
  type: 'ramen' | 'badminton';
  status: 'unclaimed' | 'claimed' | 'reserved' | 'used';
  owner: string;
  issued_at: string;
  used_at: string | null;
}

const TYPE_LABEL = {
  ramen: { name: '🍜 ラーメン券', color: 'bg-orange-100 text-orange-800' },
  badminton: { name: '🏸 バド無料券', color: 'bg-emerald-100 text-emerald-800' },
} as const;

const STATUS_LABEL: Record<Coupon['status'], { text: string; color: string }> = {
  unclaimed: { text: '未受け取り', color: 'text-gray-400' },
  claimed: { text: '利用可能', color: 'text-emerald-600' },
  reserved: { text: '使用予約中', color: 'text-amber-600' },
  used: { text: '使用済み', color: 'text-gray-400' },
};

const code = (id: string) => id.slice(0, 8).toUpperCase();

export default function CouponAdminPanel() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUsed, setShowUsed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    let alive = true;
    supabase.rpc('admin_list_coupons').then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(`読み込みエラー: ${error.message}`);
      else setCoupons((data ?? []) as Coupon[]);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const redeem = async (c: Coupon) => {
    if (
      !confirm(
        `使用済みにしますか？\n${TYPE_LABEL[c.type].name} / ${c.owner}\nコード: ${code(c.id)}\n\n※この操作は取り消せません`,
      )
    )
      return;
    setBusyId(c.id);
    setError(null);
    const { data, error } = await supabase.rpc('admin_redeem_coupon', { p_coupon_id: c.id });
    setBusyId(null);
    if (error) {
      setError(`消込エラー: ${error.message}`);
      return;
    }
    if (data === true) {
      setCoupons(prev =>
        prev.map(x =>
          x.id === c.id ? { ...x, status: 'used', used_at: new Date().toISOString() } : x,
        ),
      );
    } else {
      setError('このクーポンは消込できない状態です');
    }
  };

  const q = filter.trim().toLowerCase();
  const visible = coupons.filter(c => {
    if (!showUsed && c.status === 'used') return false;
    if (!q) return true;
    return code(c.id).toLowerCase().includes(q) || c.owner.toLowerCase().includes(q);
  });

  const activeCount = coupons.filter(c => c.status === 'claimed' || c.status === 'reserved').length;

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value.toUpperCase())}
          placeholder="コード or 名前で絞り込み（例: 47B43D70）"
          className="flex-1 min-w-[220px] border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={reload}
          className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          🔄 更新
        </button>
        <label className="flex items-center gap-1.5 text-sm text-gray-500">
          <input type="checkbox" checked={showUsed} onChange={e => setShowUsed(e.target.checked)} />
          使用済みも表示
        </label>
      </div>

      <p className="text-sm text-gray-500 mb-3">
        利用可能なクーポン <span className="font-bold text-emerald-600">{activeCount}</span> 件。
        お客さんのコードを見つけて、左のチェックを入れると使用済みになります。
      </p>

      {error && <p className="mb-3 text-sm font-bold text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}

      {!loading && visible.length === 0 && (
        <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
          {coupons.length === 0
            ? 'まだ発行されたクーポンはありません。'
            : '該当するクーポンがありません。'}
        </div>
      )}

      <div className="space-y-2">
        {visible.map(c => {
          const usable = c.status === 'claimed' || c.status === 'reserved';
          const isUsed = c.status === 'used';
          return (
            <div
              key={c.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                isUsed ? 'border-gray-100 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'
              }`}
            >
              {/* チェックで消込 */}
              <input
                type="checkbox"
                checked={isUsed}
                disabled={!usable || busyId === c.id}
                onChange={() => usable && redeem(c)}
                className="h-6 w-6 flex-shrink-0 accent-emerald-600 disabled:opacity-50"
                aria-label="使用済みにする"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TYPE_LABEL[c.type].color}`}>
                    {TYPE_LABEL[c.type].name}
                  </span>
                  <span className="font-mono text-sm font-bold tracking-wider text-gray-900">
                    {code(c.id)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {c.owner}
                  {isUsed && c.used_at && ` ・ 使用: ${new Date(c.used_at).toLocaleString('ja-JP')}`}
                </p>
              </div>
              <span className={`flex-shrink-0 text-xs font-bold ${STATUS_LABEL[c.status].color}`}>
                {busyId === c.id ? '処理中…' : STATUS_LABEL[c.status].text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
