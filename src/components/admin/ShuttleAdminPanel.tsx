import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

const VENUE_OPTIONS = ['芝園公民館', '蕨市民体育館', 'その他'];

export default function ShuttleAdminPanel() {
  const [count, setCount] = useState('');
  const [venue, setVenue] = useState(VENUE_OPTIONS[0]);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

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
        logged_at: new Date().toISOString().slice(0, 10),
      });

      if (error) throw new Error(error.message);

      setStatus('done');
      setCount('');
      setNote('');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : '送信に失敗しました');
    }
  };

  return (
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
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
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

      {status === 'done' && (
        <p className="text-sm text-green-700">記録しました。カウンターに反映されます。</p>
      )}
      {status === 'error' && <p className="text-sm text-red-600">{errorMsg}</p>}
    </form>
  );
}
