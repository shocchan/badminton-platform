import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

const VENUE_OPTIONS = ['芝園公民館', '蕨市民体育館', 'その他'];

interface LogEntry {
  id: string;
  count: number;
  venue: string | null;
  note: string | null;
  logged_at: string;
  created_at: string;
}

export default function ShuttleAdminPanel() {
  const [count, setCount] = useState('');
  const [venue, setVenue] = useState(VENUE_OPTIONS[0]);
  const [note, setNote] = useState('');
  const [loggedAt, setLoggedAt] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ count: '', venue: VENUE_OPTIONS[0], note: '', logged_at: '' });
  const [editStatus, setEditStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [editError, setEditError] = useState('');

  const fetchLogs = async () => {
    setLogsLoading(true);
    const { data, error } = await supabase
      .from('shuttle_retirement_log')
      .select('*')
      .order('logged_at', { ascending: false })
      .limit(20);
    if (!error && data) setLogs(data);
    setLogsLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const countNum = Number(count);
    if (!Number.isInteger(countNum) || countNum <= 0) {
      setStatus('error');
      setErrorMsg('本数は1以上の整数で入力してください');
      return;
    }
    setStatus('saving');
    try {
      const { error } = await supabase.from('shuttle_retirement_log').insert({
        count: countNum,
        venue,
        note: note || null,
        logged_at: loggedAt,
      });
      if (error) throw new Error(error.message);
      setStatus('done');
      setCount('');
      setNote('');
      setLoggedAt(new Date().toISOString().slice(0, 10));
      setTimeout(() => setStatus('idle'), 2500);
      fetchLogs();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : '送信に失敗しました');
    }
  };

  const startEdit = (log: LogEntry) => {
    setEditingId(log.id);
    setEditForm({
      count: String(log.count),
      venue: log.venue ?? VENUE_OPTIONS[0],
      note: log.note ?? '',
      logged_at: log.logged_at,
    });
    setEditStatus('idle');
    setEditError('');
  };

  const handleEditSave = async (id: string) => {
    const countNum = Number(editForm.count);
    if (!Number.isInteger(countNum) || countNum <= 0) {
      setEditStatus('error');
      setEditError('本数は1以上の整数で入力してください');
      return;
    }
    setEditStatus('saving');
    try {
      // 編集はログを直接更新し、カウンターを再集計
      const { error } = await supabase.from('shuttle_retirement_log').update({
        count: countNum,
        venue: editForm.venue,
        note: editForm.note || null,
        logged_at: editForm.logged_at,
      }).eq('id', id);
      if (error) throw new Error(error.message);

      // カウンターを全ログから再集計して更新
      await recalcCounter();

      setEditingId(null);
      setEditStatus('idle');
      fetchLogs();
    } catch (err) {
      setEditStatus('error');
      setEditError(err instanceof Error ? err.message : '更新に失敗しました');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このログを削除しますか？カウンターも更新されます。')) return;
    const { error } = await supabase.from('shuttle_retirement_log').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    await recalcCounter();
    fetchLogs();
  };

  // トリガーはINSERT専用なので編集・削除後はRPCで再集計
  const recalcCounter = async () => {
    const { data } = await supabase
      .from('shuttle_retirement_log')
      .select('count');
    const total = (data ?? []).reduce((s: number, r: { count: number }) => s + r.count, 0);
    const milestones = [50, 100, 300, 500, 1000];
    const lastMilestone = milestones.filter(m => m <= total).pop() ?? 0;
    await supabase.from('shuttle_counter').update({
      total_count: total,
      last_milestone: lastMilestone,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
  };

  return (
    <div className="space-y-8">
      {/* 記録フォーム */}
      <form
        onSubmit={handleSubmit}
        className="max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h3 className="text-base font-semibold text-gray-800">引退シャトルを記録</h3>

        <div>
          <label className="mb-1 block text-sm text-gray-600">本数</label>
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="例: 12"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">会場</label>
          <select
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          >
            {VENUE_OPTIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">日付</label>
          <input
            type="date"
            value={loggedAt}
            onChange={(e) => setLoggedAt(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">メモ(任意)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例: 第2回大会"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={status === 'saving'}
          className="w-full rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-50"
        >
          {status === 'saving' ? '送信中...' : '記録する'}
        </button>

        {status === 'done' && <p className="text-sm text-green-700">記録しました。</p>}
        {status === 'error' && <p className="text-sm text-red-600">{errorMsg}</p>}
      </form>

      {/* 記録履歴 */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 mb-3">記録履歴（直近20件）</h3>
        {logsLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-500">まだ記録がありません</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">日付</th>
                  <th className="px-4 py-3">本数</th>
                  <th className="px-4 py-3">会場</th>
                  <th className="px-4 py-3">メモ</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    {editingId === log.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={editForm.logged_at}
                            onChange={e => setEditForm(f => ({ ...f, logged_at: e.target.value }))}
                            className="w-32 border rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={1}
                            value={editForm.count}
                            onChange={e => setEditForm(f => ({ ...f, count: e.target.value }))}
                            className="w-16 border rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={editForm.venue}
                            onChange={e => setEditForm(f => ({ ...f, venue: e.target.value }))}
                            className="border rounded px-2 py-1 text-xs"
                          >
                            {VENUE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.note}
                            onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                            className="w-24 border rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-4 py-2 flex gap-2 items-center">
                          <button
                            onClick={() => handleEditSave(log.id)}
                            disabled={editStatus === 'saving'}
                            className="text-xs bg-amber-600 text-white px-2 py-1 rounded hover:bg-amber-700 disabled:opacity-50"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            キャンセル
                          </button>
                          {editStatus === 'error' && <span className="text-xs text-red-600">{editError}</span>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-gray-600">{log.logged_at}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{log.count}個</td>
                        <td className="px-4 py-3 text-gray-600">{log.venue ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{log.note ?? '—'}</td>
                        <td className="px-4 py-3 flex gap-3">
                          <button
                            onClick={() => startEdit(log)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(log.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            削除
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
