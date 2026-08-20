// 受講権タブ（管理ページ刷新 §3.3）。アカウント×期間×商品の台帳。
//
// - 母集合は auth.users（RPC ai_admin_list_accounts）由来の全アカウント。種別フィルタなしで全部出す。
//   learner 未作成（未ログイン）の andy/wang もここに並び、行を開けば期間を変更できる
//   （8/18 時点で SQL 直叩きしか手段が無かった穴の恒久解消）。
// - 下部に商品カタログ（PLAN_CATALOG）の現況。表示のみ・原則13（見かけ禁止）に従い status を正直に出す。
// - 今後の単発販売・システム販売で自動発行されたアカウントは source='purchase' でこの台帳に合流する。
//
// 管理UIは日本語ハードコード（刷新仕様 原則5）。

import { useState } from 'react';
import { AdminAccessPanel, ACCESS_STATE_BADGE, ACCESS_SOURCE_BADGE, jstDateOf } from './AdminAccessPanel';
import type { AdminAccessRowLike } from './AdminAccessPanel';
import { allPlans, publishedPlans, planById } from '../../../lib/aiLesson/course/plans/planCatalog';
import type { PlanStatus } from '../../../lib/aiLesson/course/plans/planCatalog';
import { AdminPurchasesPanel } from './AdminPurchasesPanel';

/** アカウント種別（adminAccountModel の AdminAccountType と同値） */
export type LedgerAccountType = 'student' | 'test' | 'admin' | 'other';

/**
 * 台帳が使うアカウント行（構造互換型）。
 * adminAccountModel.ts の AdminAccountView はこの型の上位集合であり、そのまま渡せる。
 */
export interface LedgerAccountView {
  account: {
    userId: string;
    email: string;
    loginId: string;
    userCreatedAtISO: string;
    lastSignInAtISO: string | null;
    learnerId: string | null;
  };
  access: AdminAccessRowLike | null;
  type: LedgerAccountType;
  badge: 'active' | 'not_started' | 'expired' | 'none';
  daysToExpiry: number | null;
  contradiction: boolean;
}

const TYPE_BADGE: Record<LedgerAccountType, { label: string; cls: string }> = {
  student: { label: '生徒', cls: 'bg-emerald-100 text-emerald-700' },
  test: { label: 'テスト', cls: 'bg-amber-100 text-amber-700' },
  admin: { label: '管理者', cls: 'bg-blue-100 text-blue-700' },
  other: { label: 'その他', cls: 'bg-gray-100 text-gray-600' },
};

const TYPE_ORDER: Record<LedgerAccountType, number> = { student: 0, test: 1, admin: 2, other: 3 };

const PLAN_STATUS_LABEL: Record<PlanStatus, { label: string; cls: string }> = {
  published: { label: '公開中', cls: 'bg-emerald-100 text-emerald-700' },
  draft: { label: '準備中', cls: 'bg-gray-100 text-gray-500' },
  paused: { label: '停止中', cls: 'bg-amber-100 text-amber-700' },
};

/** 商品列の表示。plan_id があればカタログ名、無ければ手動 note（実契約の記述）を出す */
const planCellOf = (access: AdminAccessRowLike | null): string => {
  if (!access) return '—';
  if (access.planId) {
    const p = planById(access.planId);
    return p ? `${p.nameJa}${access.planVersion != null ? `（v${access.planVersion}）` : ''}` : access.planId;
  }
  return access.note ?? '—';
};

export const AdminAccessLedgerTab = ({ views, onSaved }: {
  views: LedgerAccountView[];
  onSaved: () => Promise<void>;
}) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = [...views].sort((a, b) =>
    TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.account.loginId.localeCompare(b.account.loginId));
  const published = publishedPlans();

  return (
    <div>
      {/* 決済で自動発行された購入を最初に見せる（初回の実顧客をここで確認する） */}
      <div className="mb-4">
        <AdminPurchasesPanel />
      </div>
      <div className="mb-3">
        <p className="text-sm font-bold text-gray-800">受講権の台帳（全{views.length}件）</p>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          アカウント（auth.users）を起点に、期間・商品とのひも付けを1行ずつ並べています。
          未ログインのアカウントも行を開けば期間を設定できます。
          今後の単発販売・システム販売で自動発行されたアカウントは、この台帳に source=購入 として並びます。
        </p>
      </div>

      <ul className="space-y-2">
        {sorted.map((v) => {
          const open = openId === v.account.userId;
          const state = ACCESS_STATE_BADGE[v.badge];
          const source = v.access?.source ?? null;
          return (
            <li key={v.account.userId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setOpenId(open ? null : v.account.userId)}
                className="w-full min-h-11 text-left px-3 py-2.5 hover:bg-gray-50">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-bold text-gray-900 break-all">{v.account.loginId}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${TYPE_BADGE[v.type].cls}`}>{TYPE_BADGE[v.type].label}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${state.cls}`}>{state.label}</span>
                  {source && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${ACCESS_SOURCE_BADGE[source].cls}`}>{ACCESS_SOURCE_BADGE[source].label}</span>
                  )}
                  {v.account.learnerId === null && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">未ログイン</span>
                  )}
                  {v.contradiction && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">矛盾</span>
                  )}
                  <span className="ml-auto text-gray-400 text-xs">{open ? '▾' : '▸'}</span>
                </div>
                <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
                  <p className="truncate">商品: <span className="text-gray-800">{planCellOf(v.access)}</span></p>
                  <p className="tabular-nums">期間: {v.access ? `${jstDateOf(v.access.validFromISO)} → ${jstDateOf(v.access.validUntilISO)}` : '—'}</p>
                  <p className="tabular-nums">残日数: {v.daysToExpiry != null ? `${v.daysToExpiry}日` : '—'}</p>
                  <p className="truncate">設定者: {v.access?.grantedBy ?? '—'}</p>
                </div>
              </button>
              {open && (
                <div className="border-t border-gray-100 p-3 bg-gray-50">
                  <AdminAccessPanel
                    userId={v.account.userId}
                    labelJa={v.account.loginId}
                    row={v.access}
                    learnerExists={v.account.learnerId !== null}
                    lastSignInAtISO={v.account.lastSignInAtISO}
                    onSaved={onSaved}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {views.length === 0 && (
        <p className="text-xs text-gray-500 bg-white border border-gray-200 rounded-xl p-4">アカウントがありません。</p>
      )}

      {/* 商品カタログ現況（planCatalog.ts が唯一の正・表示のみ） */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-bold text-gray-800 mb-2">商品カタログ（planCatalog.ts）</p>
        <ul className="space-y-1.5">
          {allPlans().map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="text-gray-800">{p.nameJa}</span>
              <span className="text-xs text-gray-500 tabular-nums">{p.priceLabelJa}</span>
              <span className={`ml-auto text-[11px] px-1.5 py-0.5 rounded-full ${PLAN_STATUS_LABEL[p.status].cls}`}>
                {PLAN_STATUS_LABEL[p.status].label}
              </span>
            </li>
          ))}
        </ul>
        {published.length === 0 && (
          <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            公開中の商品はまだありません（?plans=preview でLP確認）。
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
          カタログに無い実契約（例: 3ヶ月契約）は、商品なし＋手動メモのまま管理します。
        </p>
      </div>
    </div>
  );
};
