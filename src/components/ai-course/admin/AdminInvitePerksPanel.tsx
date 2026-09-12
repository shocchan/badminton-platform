// 紹介の特典（2026-09-12 CEO決定）。生徒の招待コードから来た人が7日間を始めると1件できる。
// 本人が選んだ特典を見て、MV・文法完全版は先生が渡してから「渡した」を押す。
// 1か月追加は選んだ瞬間にサーバーが期限を延ばしているので、渡すものは無い（自動で済）。
// 管理UIは日本語ハードコード（刷新仕様 原則5）。
import { useCallback, useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { supabase } from '../../../services/supabaseClient';

interface Row {
  id: string;
  referrerName: string;
  referrerEmail: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteCode: string;
  createdAt: string;
  perk: 'mv' | 'month' | 'grammar' | null;
  chosenAt: string | null;
  fulfilledAt: string | null;
  note: string | null;
}

const PERK_LABEL: Record<NonNullable<Row['perk']>, string> = {
  mv: 'オリジナルMV', month: '利用1か月追加', grammar: '文法完全版（スライド）',
};
const jst = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export const AdminInvitePerksPanel = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('ai_admin_invite_perks');
    const d = data as { ok?: boolean; rows?: Row[] } | null;
    setRows(d?.ok && Array.isArray(d.rows) ? d.rows : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fulfill = async (id: string, done: boolean) => {
    setBusy(id);
    await supabase.rpc('ai_admin_fulfill_invite_perk', { p_id: id, p_done: done });
    await load();
    setBusy(null);
  };

  const todo = (rows ?? []).filter((r) => r.perk && r.perk !== 'month' && !r.fulfilledAt).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4" data-testid="admin-invite-perks">
      <p className="text-sm font-bold text-gray-800 mb-1 inline-flex items-center gap-1.5">
        <Gift className="w-4 h-4 text-amber-600" aria-hidden="true" />紹介の特典
        {todo > 0 && <span className="ml-1 text-xs font-medium text-amber-700">渡すもの {todo}件</span>}
      </p>
      <p className="text-[11px] text-gray-500 mb-2">生徒の招待コードから来た人が7日間を始めると1件できます。本人が選んだ特典を渡したら「渡した」を押してください。1か月追加は自動で済んでいます。</p>
      {rows === null ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500">まだありません。</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const needsHand = r.perk && r.perk !== 'month';
            const open = needsHand && !r.fulfilledAt;
            return (
              <li key={r.id} className={`border rounded-lg p-3 text-xs ${open ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-gray-900">{r.referrerName}</span>
                    <span className="text-gray-500"> の紹介 → {r.inviteeName}</span>
                    <span className="ml-2 text-gray-400">{r.inviteCode}・開始 {jst(r.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${r.perk ? 'text-gray-800' : 'text-gray-500'}`}>
                      {r.perk ? PERK_LABEL[r.perk] : '未選択'}
                    </span>
                    {r.perk === 'month' && <span className="text-emerald-700">自動で済</span>}
                    {needsHand && (
                      <button type="button" disabled={busy === r.id} onClick={() => void fulfill(r.id, !r.fulfilledAt)}
                        className={`min-h-9 rounded-lg px-3 font-bold ${r.fulfilledAt ? 'border border-gray-300 text-gray-600' : 'bg-emerald-600 text-white'}`}>
                        {r.fulfilledAt ? `渡した（${jst(r.fulfilledAt)}）` : '渡した'}
                      </button>
                    )}
                  </div>
                </div>
                {r.referrerEmail && <p className="mt-1 text-gray-500">紹介者: {r.referrerEmail}{r.note ? `・${r.note}` : ''}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AdminInvitePerksPanel;
