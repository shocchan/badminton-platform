// 管理ページ 生徒詳細: AI会話統計カード（会話実績がある生徒のみ）。
// - 累計は RPC ai_admin_list_accounts の conv_sessions_total（DBの正確なcount）を正とする
//   ＝「直近30件で頭打ち」の根治（P1）。内訳統計は渡された直近セッションから算出し
//   「直近N回の内訳」とラベルで明記して全期間の含意を消す。
// - 成長根拠は speech_metrics 実測（マッピング修復後は平均往復数が実値になる）。
// - 旧コース進捗（x/60）は ai_item_progress が存在する生徒だけ小カードで出す（P2）。

import { learnerStats } from '../../../lib/aiLesson/course/courseStats';
import { calculateSpeakingGrowth } from '../../../lib/aiLesson/course/courseGrowth';
import { COURSE_MISSIONS } from '../../../lib/aiLesson/course/courseData';
import type { CourseSessionRecord, ItemProgress } from '../../../lib/aiLesson/course/types';

interface Props {
  sessions: CourseSessionRecord[];
  progress: ItemProgress[];
  /** ai_learning_sessions の全期間count（RPC値）。0なら親が描画しない契約 */
  convTotal: number;
}

const pct = (r: number): string => `${Math.round(r * 100)}%`;

const Row = ({ label, v }: { label: string; v: string }) => (
  <li className="flex justify-between gap-2">
    <span>{label}</span><span className="font-medium tabular-nums">{v}</span>
  </li>
);

export const AdminConversationStats = ({ sessions, progress, convTotal }: Props) => {
  if (convTotal <= 0) return null;

  const stats = learnerStats(sessions, progress);
  const growth = calculateSpeakingGrowth(sessions, progress);
  // 除外＝発話メトリクス未算出のセッション数（「除外数=全件」バグの実値化）
  const excluded = sessions.filter((s) => !s.speechMetrics).length;
  const recentReport = sessions.find((s) => s.report)?.report ?? null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-sm font-bold text-gray-800">AI会話の統計</p>
        <p className="text-xs text-gray-500">
          累計 <span className="font-bold text-gray-900 tabular-nums">{convTotal}回</span>（全期間・DB集計）
        </p>
      </div>

      {/* 直近N回の内訳（全期間ではない） */}
      <p className="text-[11px] text-gray-500 mb-1.5">直近{sessions.length}回の内訳</p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Tile label="自力" v={pct(stats.selfRate)} />
        <Tile label="ヒント" v={pct(stats.hintRate)} />
        <Tile label="中文補助" v={pct(stats.zhRate)} />
        <Tile label="エラー" v={String(stats.errorCount)} warn={stats.errorCount > 0} />
        <Tile label="中断" v={String(stats.interruptedCount)} />
        <Tile label="連続日数" v={`${stats.streak}日`} />
      </div>

      {/* 成長根拠（生徒に見せている成長表示の裏付け・speech_metrics実測） */}
      <div className="mt-3 rounded-xl border border-gray-100 p-3">
        <p className="text-xs font-bold text-gray-700 mb-2">成長根拠（直近{sessions.length}回から算出）</p>
        <ul className="text-xs text-gray-600 space-y-1">
          <Row label="データ量"
            v={growth.sufficient ? `OK（${growth.sessionsAnalyzed}回）` : `分析中（あと${growth.sessionsUntilReady}回）`} />
          <Row label="自力使用率" v={pct(growth.independentRate)} />
          <Row label="表現の再使用率" v={pct(growth.reuseRate)} />
          <Row label="補助なし率" v={`${pct(growth.withoutZhRate)}${growth.zhReductionImproved ? ' ↑' : ''}`} />
          <Row label="平均往復数" v={growth.avgRoundtrips > 0 ? growth.avgRoundtrips.toFixed(1) : '—'} />
          <Row label="理由付け率" v={pct(growth.reasonRate)} />
          <Row label="除外（メトリクス未算出セッション）" v={`${excluded}件`} />
        </ul>
      </div>

      {/* 直近レポート（ai_learning_sessions.report.todaySummaryJa） */}
      {recentReport && (
        <div className="mt-3 rounded-xl border border-gray-100 p-3">
          <p className="text-[11px] text-gray-500 mb-1">直近レポート</p>
          <p className="text-sm text-gray-800">{recentReport.todaySummaryJa}</p>
        </div>
      )}

      {/* 旧コース進捗（60ミッション）。ai_item_progress がある生徒のみ */}
      {progress.length > 0 && (
        <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
          <p className="text-[11px] text-gray-500 mb-1.5">旧コース進捗（60表現ミッション）</p>
          <div className="flex gap-4 text-xs text-gray-700 tabular-nums flex-wrap">
            <p>学習 <span className="font-bold">{stats.learnedCount}/{COURSE_MISSIONS.length}</span></p>
            <p>定着 <span className="font-bold">{stats.retainedCount}</span></p>
            <p className={stats.overdueReviews > 0 ? 'text-amber-700' : ''}>
              復習期限超過 <span className="font-bold">{stats.overdueReviews}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const Tile = ({ label, v, warn }: { label: string; v: string; warn?: boolean }) => (
  <div className="bg-white rounded-lg border border-gray-100 p-2.5">
    <p className="text-[10px] text-gray-500">{label}</p>
    <p className={`font-bold text-sm tabular-nums ${warn ? 'text-red-600' : 'text-gray-900'}`}>{v}</p>
  </div>
);
