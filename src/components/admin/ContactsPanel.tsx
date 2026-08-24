// 問い合わせタブの中身（2026-08-24）。
//
// 出すのは「やること」から。未返信を古い順に上へ積み、何日放置しているかを先に見せる。
// 無いときは空の枠を並べず「ありません」と言い切る。
// ここからメールを自動送信することは無い。宛先はメーラーを開くリンクだけ。
import { useState } from 'react';
import { toast } from '../ui/Toast';
import {
  categoryLabel,
  daysSince,
  isUnreplied,
  sortForBoard,
  STATUS_LABEL,
  type Contact,
  type ContactStatus,
} from './adminContacts';

interface Props {
  contacts: Contact[];
  loading: boolean;
  unavailable: boolean;
  onUpdateStatus: (id: string, status: ContactStatus) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const ageTone = (days: number): string =>
  days >= 3 ? 'bg-red-100 text-red-700'
  : days >= 1 ? 'bg-amber-100 text-amber-700'
  : 'bg-gray-100 text-gray-600';

const ageText = (days: number): string => (days === 0 ? '今日' : `${days}日経過`);

const statusTone: Record<ContactStatus, string> = {
  new: 'bg-red-100 text-red-700',
  replied: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
};

export default function ContactsPanel({ contacts, loading, unavailable, onUpdateStatus, onRefresh }: Props) {
  const [unrepliedOnly, setUnrepliedOnly] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const unrepliedCount = contacts.filter(isUnreplied).length;
  const visible = sortForBoard(contacts).filter(c => !unrepliedOnly || isUnreplied(c));

  const change = async (c: Contact, status: ContactStatus) => {
    setBusyId(c.id);
    try {
      await onUpdateStatus(c.id, status);
      toast.success(`${c.name}さんの問い合わせを「${STATUS_LABEL[status]}」にしました`);
    } catch (err) {
      console.error(err);
      toast.error('状態の更新に失敗しました: ' + (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (unavailable) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-6 text-sm text-gray-500">
        問い合わせを読み込めませんでした。
        <span className="block mt-1 text-xs text-gray-400">
          管理者用RPC（admin_list_contacts）が未適用の可能性があります。
          マイグレーション <span className="font-mono">20260824120000_admin_ops_payment_and_contacts.sql</span> を適用してください。
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-800">問い合わせ</h2>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unrepliedOnly}
              onChange={e => setUnrepliedOnly(e.target.checked)}
              className="rounded"
            />
            未返信のみ
            {unrepliedCount > 0 && (
              <span className="bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{unrepliedCount}</span>
            )}
          </label>
        </div>
        <button
          onClick={() => { void onRefresh(); }}
          className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
        >
          再読み込み
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-10 text-center text-sm text-gray-500">
          {unrepliedOnly ? '未返信の問い合わせはありません' : '問い合わせはまだありません'}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(c => {
            const days = daysSince(c.created_at);
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {isUnreplied(c) && (
                    <span className={`text-xs px-2 py-1 rounded-full font-bold ${ageTone(days)}`}>{ageText(days)}</span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusTone[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-slate-100 text-slate-600">
                    {categoryLabel(c.category)}
                  </span>
                  {c.lang === 'zh' && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-50 text-red-600">中文</span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(c.created_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p className="font-medium text-gray-900">
                  {c.name}
                  <a href={`mailto:${c.email}`} className="ml-2 text-sm font-normal text-blue-600 hover:underline break-all">
                    {c.email}
                  </a>
                </p>

                <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">{c.message}</p>

                <div className="flex flex-wrap gap-2 mt-4">
                  {c.status !== 'replied' && (
                    <button
                      onClick={() => change(c, 'replied')}
                      disabled={busyId === c.id}
                      className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      返信済みにする
                    </button>
                  )}
                  {c.status !== 'closed' && (
                    <button
                      onClick={() => change(c, 'closed')}
                      disabled={busyId === c.id}
                      className="text-xs border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      対応完了にする
                    </button>
                  )}
                  {c.status !== 'new' && (
                    <button
                      onClick={() => change(c, 'new')}
                      disabled={busyId === c.id}
                      className="text-xs text-gray-400 hover:text-gray-600 hover:underline disabled:opacity-40"
                    >
                      未返信に戻す
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
