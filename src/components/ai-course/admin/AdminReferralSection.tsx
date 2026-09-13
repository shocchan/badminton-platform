// 生徒詳細: この人の招待リンクと、誰を招待できたか（2026-09-13 CEO指示）。
// 「誰が誰を」は ai_admin_referral_tree（管理者だけ）。この人が**紹介した側**の行だけを出す。
import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { fetchReferralTree, referralStageOf, type ReferralTreeRow } from '../../../lib/aiLesson/course/admin/adminReferralApi';

const jst = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const STAGE_CLS: Record<ReturnType<typeof referralStageOf>, string> = {
  '登録': 'bg-gray-100 text-gray-600', '開始': 'bg-blue-50 text-blue-700', '診断済': 'bg-amber-50 text-amber-800',
  '延長済': 'bg-emerald-50 text-emerald-700', '上限': 'bg-gray-100 text-gray-500',
};

export const AdminReferralSection = ({ userId, referredBy }: { userId: string; referredBy?: ReferralTreeRow | null }) => {
  const [rows, setRows] = useState<ReferralTreeRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchReferralTree().then((all) => { if (alive) setRows(all.filter((r) => r.referrerUserId === userId)); });
    return () => { alive = false; };
  }, [userId]);
  const code = rows?.[0]?.code ?? null;
  const rewarded = (rows ?? []).filter((r) => r.rewardedAtISO).length;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm" data-testid="admin-referral-section">
      <p className="font-bold text-gray-800 inline-flex items-center gap-1.5"><Gift className="w-4 h-4 text-amber-600" aria-hidden />紹介</p>
      {referredBy && (
        <p className="mt-1 text-[12px] text-gray-600">この人は <b>{referredBy.referrerName}</b> の招待（{referredBy.code}）から登録。</p>
      )}
      {rows === null ? (
        <p className="mt-2 text-xs text-gray-500">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">この人の招待から登録した人はまだいません。{code ? '' : '（招待リンクは本人が学習画面を開いたときに作られます）'}</p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-gray-600">
            招待コード <span className="font-mono">{code}</span>・登録 {rows.length}人・延長済み {rewarded}人
          </p>
          <ul className="mt-2 divide-y divide-gray-100">
            {rows.map((r) => {
              const stage = referralStageOf(r);
              return (
                <li key={r.inviteeUserId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12px]">
                  <span className="font-bold text-gray-900">{r.inviteeName}</span>
                  <span className="text-gray-500">{r.inviteeEmail}{r.wechatId ? `・WeChat ${r.wechatId}` : ''}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_CLS[stage]}`}>{stage}</span>
                  <span className="text-gray-400 tabular-nums">登録 {jst(r.signedUpAtISO)}{r.diagnosedAtISO ? `・診断 ${jst(r.diagnosedAtISO)}` : ''}{r.rewardedAtISO ? `・延長 ${jst(r.rewardedAtISO)}` : ''}</span>
                  {r.isTest && <span className="text-[10px] text-gray-400">テスト</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default AdminReferralSection;
