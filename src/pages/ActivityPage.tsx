import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

interface Activity {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  capacity: number;
  price: number;
  status: 'open' | 'closed' | 'cancelled';
  created_at: string;
}

interface ActivityEntry {
  id: string;
  activity_id: string;
  name: string;
  member_type: 'member' | 'normal';
  source: 'line' | 'wechat' | 'web';
  cancel_code: string;
  quantity: number;
  created_at: string;
}

type ViewMode = 'list' | 'cancel';

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
};

const generateCancelCode = () => {
  return String(Math.floor(1000 + Math.random() * 9000));
};

export const ActivityPage = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [entries, setEntries] = useState<Record<string, ActivityEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // form state per activity
  const [formName, setFormName] = useState<Record<string, string>>({});
  const [formQty, setFormQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [successCode, setSuccessCode] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // cancel form state
  const [cancelActivityId, setCancelActivityId] = useState('');
  const [cancelName, setCancelName] = useState('');
  const [cancelCode, setCancelCode] = useState('');
  const [cancelQty, setCancelQty] = useState(1);
  const [cancelMsg, setCancelMsg] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const source = (() => {
    const p = new URLSearchParams(window.location.search).get('from') || 'web';
    return ['line', 'wechat', 'web'].includes(p) ? (p as 'line' | 'wechat' | 'web') : 'web';
  })();

  const fetchActivities = useCallback(async () => {
    const { data } = await supabase
      .from('activities')
      .select('*')
      .neq('status', 'cancelled')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true });
    if (data) setActivities(data);
  }, []);

  const fetchEntries = useCallback(async (activityIds: string[]) => {
    if (!activityIds.length) return;
    const { data } = await supabase
      .from('activity_entries')
      .select('*')
      .in('activity_id', activityIds)
      .order('created_at', { ascending: true });
    if (data) {
      const grouped: Record<string, ActivityEntry[]> = {};
      for (const e of data) {
        if (!grouped[e.activity_id]) grouped[e.activity_id] = [];
        grouped[e.activity_id].push(e);
      }
      setEntries(grouped);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchActivities();
      setLoading(false);
    })();
  }, [fetchActivities]);

  useEffect(() => {
    if (activities.length) {
      fetchEntries(activities.map(a => a.id));
    }
  }, [activities, fetchEntries]);

  // realtime
  useEffect(() => {
    if (!activities.length) return;
    const channel = supabase
      .channel('activity_entries_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_entries' }, () => {
        fetchEntries(activities.map(a => a.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activities, fetchEntries]);

  const getUsed = (activityId: string) =>
    (entries[activityId] || []).reduce((sum, e) => sum + e.quantity, 0);

  const handleSubmit = async (activity: Activity, memberType: 'member' | 'normal') => {
    const name = (formName[activity.id] || '').trim();
    if (!name) {
      setErrors(p => ({ ...p, [activity.id]: 'お名前を入力してください' }));
      return;
    }
    setErrors(p => ({ ...p, [activity.id]: '' }));

    const used = getUsed(activity.id);
    const qty = formQty[activity.id] || 1;
    if (used + qty > activity.capacity) {
      setErrors(p => ({ ...p, [activity.id]: '定員を超えています' }));
      return;
    }

    setSubmitting(p => ({ ...p, [activity.id]: true }));
    const code = generateCancelCode();

    const { error } = await supabase.from('activity_entries').insert({
      activity_id: activity.id,
      name,
      member_type: memberType,
      source,
      cancel_code: code,
      quantity: qty,
    });

    setSubmitting(p => ({ ...p, [activity.id]: false }));
    if (error) {
      setErrors(p => ({ ...p, [activity.id]: '申し込みに失敗しました。もう一度お試しください。' }));
    } else {
      setSuccessCode(p => ({ ...p, [activity.id]: code }));
      setFormName(p => ({ ...p, [activity.id]: '' }));
      setFormQty(p => ({ ...p, [activity.id]: 1 }));
    }
  };

  const handleCancel = async () => {
    if (!cancelName.trim() || !cancelCode.trim()) {
      setCancelError('お名前とキャンセルコードを入力してください');
      return;
    }
    setCancelSubmitting(true);
    setCancelError('');
    setCancelMsg('');

    const { data, error } = await supabase
      .from('activity_entries')
      .select('*')
      .eq('activity_id', cancelActivityId || undefined)
      .eq('name', cancelName.trim())
      .eq('cancel_code', cancelCode.trim())
      .maybeSingle();

    if (error || !data) {
      setCancelError('コードが違います。コードを忘れた場合は主催者にご連絡ください。');
      setCancelSubmitting(false);
      return;
    }

    const newQty = data.quantity - cancelQty;
    if (newQty <= 0) {
      const { error: delErr } = await supabase.from('activity_entries').delete().eq('id', data.id);
      if (delErr) {
        setCancelError('キャンセルに失敗しました');
      } else {
        setCancelMsg('キャンセルが完了しました。');
        setCancelName(''); setCancelCode(''); setCancelQty(1); setCancelActivityId('');
      }
    } else {
      const { error: updErr } = await supabase
        .from('activity_entries')
        .update({ quantity: newQty })
        .eq('id', data.id);
      if (updErr) {
        setCancelError('キャンセルに失敗しました');
      } else {
        setCancelMsg(`${cancelQty}人分をキャンセルしました。残り${newQty}人分は有効です。`);
        setCancelName(''); setCancelCode(''); setCancelQty(1); setCancelActivityId('');
      }
    }
    setCancelSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">活動申し込み</h1>
        <button
          onClick={() => setViewMode(viewMode === 'list' ? 'cancel' : 'list')}
          className="text-sm text-gray-500 underline"
        >
          {viewMode === 'list' ? 'キャンセルする' : '申し込み一覧へ'}
        </button>
      </div>

      {viewMode === 'cancel' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="font-bold text-gray-800 mb-4">申し込みキャンセル</h2>
          {activities.length > 0 && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">活動（任意）</label>
              <select
                value={cancelActivityId}
                onChange={e => setCancelActivityId(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">すべての活動から検索</option>
                {activities.map(a => (
                  <option key={a.id} value={a.id}>{formatDate(a.date)} {a.title}</option>
                ))}
              </select>
            </div>
          )}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">お名前</label>
            <input
              type="text"
              value={cancelName}
              onChange={e => setCancelName(e.target.value)}
              placeholder="申し込み時のお名前"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">4桁のキャンセルコード</label>
            <input
              type="text"
              value={cancelCode}
              onChange={e => setCancelCode(e.target.value)}
              placeholder="1234"
              maxLength={4}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">キャンセル人数</label>
            <select
              value={cancelQty}
              onChange={e => setCancelQty(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {[1, 2, 3].map(n => <option key={n} value={n}>{n}人</option>)}
            </select>
          </div>
          {cancelError && <p className="text-red-500 text-sm mb-3">{cancelError}</p>}
          {cancelMsg && <p className="text-green-600 text-sm mb-3">{cancelMsg}</p>}
          <button
            onClick={handleCancel}
            disabled={cancelSubmitting}
            className="w-full bg-gray-700 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {cancelSubmitting ? 'キャンセル中...' : 'キャンセルする'}
          </button>
          <p className="text-xs text-gray-400 mt-3">
            ※コードを忘れた場合は主催者までご連絡ください。無断キャンセルは原則禁止・費用発生の対象となります。
          </p>
        </div>
      )}

      {viewMode === 'list' && activities.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏸</p>
          <p>現在申し込み受付中の活動はありません</p>
        </div>
      )}

      {viewMode === 'list' && activities.map(activity => {
        const actEntries = entries[activity.id] || [];
        const used = actEntries.reduce((sum, e) => sum + e.quantity, 0);
        const remaining = activity.capacity - used;
        const isFull = remaining <= 0 || activity.status === 'closed';
        const code = successCode[activity.id];

        return (
          <div key={activity.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{activity.title}</h2>
                <p className="text-gray-500 text-sm mt-0.5">
                  {formatDate(activity.date)}　{activity.start_time.slice(0, 5)}〜{activity.end_time.slice(0, 5)}
                </p>
                <p className="text-gray-500 text-sm">{activity.location}</p>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <p className="text-2xl font-bold text-blue-600">¥{activity.price.toLocaleString()}</p>
                <p className="text-xs text-gray-400">/ 人</p>
              </div>
            </div>

            {/* 定員状況 */}
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-blue-400'}`}
                  style={{ width: `${Math.min(100, (used / activity.capacity) * 100)}%` }}
                />
              </div>
              <span className={`text-sm font-medium flex-shrink-0 ${isFull ? 'text-red-500' : 'text-gray-600'}`}>
                {isFull ? '満員' : `残り${remaining}枠`}　{used}/{activity.capacity}人
              </span>
            </div>

            {/* 申し込み者リスト */}
            {actEntries.length > 0 && (
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-sm text-gray-600 space-y-0.5">
                {actEntries.map((e, i) => (
                  <p key={e.id}>
                    {i + 1}. {e.name}
                    <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${e.member_type === 'member' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {e.member_type === 'member' ? '会員' : '通常'}
                    </span>
                    {e.quantity > 1 && <span className="ml-1 text-xs text-gray-400">・{e.quantity}人</span>}
                  </p>
                ))}
              </div>
            )}

            {/* 申し込み完了表示 */}
            {code && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <p className="text-green-800 font-medium text-sm mb-1">申し込みが完了しました！</p>
                <p className="text-green-700 text-sm">
                  キャンセルコード：<span className="font-bold text-lg tracking-widest">{code}</span>
                </p>
                <p className="text-green-600 text-xs mt-1">このコードはキャンセル時に必要です。スクリーンショットを保存してください。</p>
              </div>
            )}

            {/* 申し込みフォーム */}
            {!code && (
              <div>
                <div className="mb-3">
                  <input
                    type="text"
                    value={formName[activity.id] || ''}
                    onChange={e => setFormName(p => ({ ...p, [activity.id]: e.target.value }))}
                    placeholder="お名前"
                    disabled={isFull}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="mb-3">
                  <select
                    value={formQty[activity.id] || 1}
                    onChange={e => setFormQty(p => ({ ...p, [activity.id]: Number(e.target.value) }))}
                    disabled={isFull}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
                  >
                    <option value={1}>1人</option>
                    <option value={2}>2人</option>
                    <option value={3}>3人</option>
                  </select>
                </div>
                {errors[activity.id] && (
                  <p className="text-red-500 text-xs mb-3">{errors[activity.id]}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSubmit(activity, 'normal')}
                    disabled={isFull || submitting[activity.id]}
                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isFull ? '満員' : submitting[activity.id] ? '送信中...' : '申し込む（通常）'}
                  </button>
                  <div className="flex-1 flex flex-col">
                    <button
                      onClick={() => handleSubmit(activity, 'member')}
                      disabled={isFull || submitting[activity.id]}
                      className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {isFull ? '満員' : submitting[activity.id] ? '送信中...' : '申し込む（会員）'}
                    </button>
                    <p className="text-xs text-gray-400 text-center mt-1">※チャージ済みの方はこちら</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
};

export default ActivityPage;
