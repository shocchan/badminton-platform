// 管理者向け: 生徒ごとの利用状況テーブル（冒険モードV2）。
// 「どれくらいログインして、各々どれくらい使っているか」を1画面で見る（CEO要望 2026-08-15）。
// 表示は実記録のみ（原則13）。未オンボーディングの生徒は「準備前」と正直に出す。
import { Users } from 'lucide-react';
import type { AdminLearnerRow, LearnerLoginInfo, LearnerUsageSummary } from '../../lib/aiLesson/course/courseAdminApi';
import { advLearnerUsageOf } from '../../lib/aiLesson/course/adventure/advAdminUsage';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

/** 相対表示（今日/昨日/N日前）。読み手は毎朝見るCEOなので絶対日時より速く読める */
/** 目的の表示名（goalType → 人が読める形） */
const goalLabel = (lang: L, goal: string | null): string => {
  if (goal === 'jlpt') return tx(lang, 'JLPT合格', 'JLPT合格');
  if (goal === 'conversation') return tx(lang, '会話', '会话');
  if (goal === 'hybrid') return tx(lang, 'JLPT＋会話', 'JLPT＋会话');
  return '—';
};

/** 診断帯の表示名（現在地。「N2目標なのにN3攻略」の理由が一目で分かる） */
const bandLabel = (band: string | null): string => {
  const map: Record<string, string> = {
    needs_assessment: '要確認', pre_n5: '入門前', n5: 'N5', n4: 'N4',
    n3_early: 'N3前半', n3_late: 'N3後半', n2_ready: 'N2圏',
  };
  return band ? (map[band] ?? band) : '—';
};

const rel = (lang: L, iso: string | null): { text: string; stale: boolean } => {
  if (!iso) return { text: tx(lang, 'まだ', '还没有'), stale: true };
  const days = Math.floor((Date.now() - Date.parse(iso)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return { text: tx(lang, '今日', '今天'), stale: false };
  if (days === 1) return { text: tx(lang, '昨日', '昨天'), stale: false };
  return { text: tx(lang, `${days}日前`, `${days}天前`), stale: days >= 3 };
};

export function CourseV2UsageTable({ lang, learners, logins, usageMap, nowISO }: {
  lang: L;
  learners: AdminLearnerRow[];
  logins: Record<string, LearnerLoginInfo>;
  usageMap: Record<string, LearnerUsageSummary>;
  nowISO: string;
}) {
  if (learners.length === 0) return null;
  const th = 'px-2 py-1.5 text-left text-[11px] font-bold text-gray-500 whitespace-nowrap';
  const td = 'px-2 py-2 text-sm text-gray-800 whitespace-nowrap';
  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-800">
        <Users className="h-4 w-4 text-blue-600" aria-hidden />
        {tx(lang, '生徒ごとの利用状況', '每位学生的使用情况')}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={th}>{tx(lang, '生徒', '学生')}</th>
              <th className={th}>{tx(lang, '目的', '目标类型')}</th>
              <th className={th}>{tx(lang, '目標', '目标')}</th>
              <th className={th}>{tx(lang, '診断の現在地', '诊断位置')}</th>
              <th className={th}>{tx(lang, '最終ログイン', '最近登录')}</th>
              <th className={th}>{tx(lang, '最終学習', '最近学习')}</th>
              <th className={th}>{tx(lang, '学習日数(7日)', '学习天数(7天)')}</th>
              <th className={th}>{tx(lang, '(30日)', '(30天)')}</th>
              <th className={th}>{tx(lang, '累計', '累计')}</th>
              <th className={th}>{tx(lang, 'やりきった冒険', '完成的冒险')}</th>
              <th className={th}>{tx(lang, 'バトル', '战斗')}</th>
              <th className={th}>{tx(lang, '模試', '模拟考')}</th>
              <th className={th}>{tx(lang, 'AI会話(今月)', 'AI会话(本月)')}</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => {
              const u = advLearnerUsageOf(l.settings, nowISO);
              const login = logins[l.id];
              const signIn = rel(lang, login?.lastSignInAt ?? null);
              const study = rel(lang, u.lastStudyDateKey ? `${u.lastStudyDateKey}T12:00:00` : null);
              const conv = usageMap[l.id];
              return (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className={td}>
                    <span className="font-semibold">{l.displayName || '—'}</span>
                    {login && <span className="ml-1 text-[11px] text-gray-400">({login.loginId})</span>}
                    {!u.onboarded && (
                      <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        {tx(lang, '準備前', '未开始')}
                      </span>
                    )}
                  </td>
                  <td className={td}>{goalLabel(lang, u.goalType)}</td>
                  <td className={`${td} text-blue-700 font-semibold`}>{u.targetJlpt ?? '—'}</td>
                  <td className={td}>{bandLabel(u.diagnosisBand)}</td>
                  <td className={`${td} ${signIn.stale ? 'font-semibold text-amber-700' : ''}`}>{signIn.text}</td>
                  <td className={`${td} ${study.stale ? 'font-semibold text-amber-700' : ''}`}>{study.text}</td>
                  <td className={td}>{u.studyDays7}</td>
                  <td className={td}>{u.studyDays30}</td>
                  <td className={td}>{u.totalStudyDays}</td>
                  <td className={td}>{u.completedQuests}</td>
                  <td className={td}>{u.battleAttempts}</td>
                  <td className={td}>{u.mockCount}</td>
                  <td className={td}>{conv ? tx(lang, `${conv.sessions}回`, `${conv.sessions}次`) : '0'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        {tx(lang,
          '3日以上あいた項目はオレンジで表示。学習日＝冒険またはバトルの記録がある日。',
          '超过3天未活动的项目以橙色显示。学习日＝有冒险或战斗记录的日子。')}
      </p>
    </div>
  );
}
