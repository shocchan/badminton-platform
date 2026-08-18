// 管理ページ 生徒詳細ビューの骨格（タブ2で選択後に一覧と切り替え表示）。
// 構成（§3.2）: ヘッダ → 警告バナー → V2サマリ → AI会話統計 → 利用とコスト＋累計行
//              → この生徒の問題報告 → panels スロット（AccessPanel等はintegratorが注入）。
// learner未作成のアカウント（andy/wang等）は案内＋panelsのみを出す。

import { useMemo } from 'react';
import { AlertTriangle, ChevronLeft, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AdminIssueReport, AdminUsageCost } from '../../../lib/aiLesson/course/courseAdminApi';
import type { CourseSessionRecord, ItemProgress } from '../../../lib/aiLesson/course/types';
import { CourseUsageCostCard } from '../CourseUsageCostCard';
import { AdminStudentV2Stats } from './AdminStudentV2Stats';
import { AdminConversationStats } from './AdminConversationStats';
import { TypeBadge, StateBadges, displayNameOf, jstDateLabel } from './AdminStudentsTab';
import type { AdminAccountView } from '../../../lib/aiLesson/course/admin/adminAccountModel';

interface Props {
  /** アカウント統合ビュー（adminAccountModel.buildAccountViews の出力） */
  view: AdminAccountView;
  sessions: CourseSessionRecord[];
  progress: ItemProgress[];
  usageCost: AdminUsageCost | null;
  issues: AdminIssueReport[];
  onBack: () => void;
  onOpenOps: () => void;
  /** C製パネル群（AdminAccessPanel → TeacherPlan → TeacherNote → Controls）をintegratorが注入 */
  panels: ReactNode;
}

const Banner = ({ tone, children }: { tone: 'amber' | 'red'; children: ReactNode }) => (
  <div className={`rounded-xl border p-3 flex items-start gap-2 ${tone === 'red'
    ? 'border-red-200 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${tone === 'red' ? 'text-red-600' : 'text-amber-600'}`} />
    <p className={`text-sm ${tone === 'red' ? 'text-red-800' : 'text-amber-800'}`}>{children}</p>
  </div>
);

export const AdminStudentDetail = ({
  view, sessions, progress, usageCost, issues, onBack, onOpenOps, panels,
}: Props) => {
  const nowISO = useMemo(() => new Date().toISOString(), []);
  const { account, learner, adv } = view;
  const name = displayNameOf(view);

  // この生徒の未解決の問題報告（learner未作成なら報告も存在しない）
  const myIssues = learner
    ? issues.filter((r) => !r.resolved && r.learnerId === learner.id)
    : [];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack}
        className="min-h-11 inline-flex items-center gap-1 text-sm text-emerald-700 underline-offset-2 hover:underline">
        <ChevronLeft className="w-4 h-4" />生徒一覧
      </button>

      {/* 1. ヘッダ */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-bold text-gray-900">{name}</h2>
          {name !== account.loginId && <span className="text-xs text-gray-400">({account.loginId})</span>}
          <TypeBadge type={view.type} />
          <StateBadges view={view} />
        </div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-500">
          <p>発行日 <span className="font-medium text-gray-700 tabular-nums">{jstDateLabel(account.userCreatedAtISO)}</span></p>
          <p>初回ログイン <span className="font-medium text-gray-700 tabular-nums">{learner ? jstDateLabel(learner.createdAtISO) : '未ログイン'}</span></p>
          <p className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" />
            最終認証 <span className="font-medium text-gray-700 tabular-nums">{account.lastSignInAtISO ? jstDateLabel(account.lastSignInAtISO) : '—'}</span>
          </p>
        </div>
      </div>

      {/* 2. 警告バナー */}
      {view.contradiction && (
        <Banner tone="amber">
          期間は「開始前」の設定ですが、すでにログイン／学習の記録があります。
          いまこの生徒は学習画面に入れない状態です。開始日の設定を確認してください（データ是正はCEO判断）。
        </Banner>
      )}
      {view.badge === 'expired' && (
        <Banner tone="red">
          受講期間が切れています。生徒は学習画面に入れません（学習記録は消えていません。延長すると続きから再開できます）。
        </Banner>
      )}
      {view.badge === 'active' && view.daysToExpiry !== null && view.daysToExpiry <= 30 && (
        <Banner tone="amber">受講期限まで残り{view.daysToExpiry}日です。</Banner>
      )}

      {learner ? (
        <>
          {/* 3. V2学習サマリ（オンボーディング済みのみ） */}
          {adv?.onboarded && <AdminStudentV2Stats view={view} nowISO={nowISO} />}

          {/* 4. AI会話統計（会話実績のある生徒のみ＝convTotal>0 が唯一の条件。
              JLPT目標でも過去の会話実績が実在するなら隠さない・原則13） */}
          {account.convSessionsTotal > 0 && (
            <AdminConversationStats sessions={sessions} progress={progress}
              convTotal={account.convSessionsTotal} />
          )}

          {/* 5. 利用とコスト（今月）＋全期間の累計（RPC ai_admin_list_accounts の実測値） */}
          {usageCost && (
            <div>
              <CourseUsageCostCard data={usageCost} />
              <p className="mt-1.5 px-1 text-xs text-gray-500 tabular-nums">
                累計 {account.usage.totalSessions}回・{Math.round(account.usage.totalSeconds / 60)}分・${account.usage.totalCostUsd.toFixed(2)}（全期間）
              </p>
            </div>
          )}

          {/* 6. この生徒の問題報告（未解決のみ） */}
          {myIssues.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-bold text-gray-800 mb-2">この生徒の問題報告（未解決 {myIssues.length}件）</p>
              <ul className="space-y-2">
                {myIssues.map((r) => (
                  <li key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                    <p className="text-sm text-gray-800 break-words">{r.comment || '（コメントなし）'}</p>
                    <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                      {r.createdAt.slice(0, 16).replace('T', ' ')}
                      {r.page ? ` ・ ${r.page}` : ''}
                      {r.errorCode ? ` ・ ${r.errorCode}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={onOpenOps}
                className="mt-2 min-h-9 px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white text-gray-700">
                運用タブで対応する
              </button>
            </div>
          )}
        </>
      ) : (
        /* learner未作成（andy/wang等）: 案内＋期間パネルのみ */
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-700">
            アカウント発行済み・初回ログイン待ちです。ログイン後に学習データが表示されます。
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            利用期間は下のパネルからログイン前でも設定できます。
          </p>
        </div>
      )}

      {/* 7. panels スロット（integratorが注入） */}
      {panels}
    </div>
  );
};
