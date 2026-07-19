// 学習履歴。過去セッションを新しい順に一覧表示。

import { ArrowLeft, Mic, PenLine, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseSessionRecord } from '../../lib/aiLesson/course/types';
import { missionById } from '../../lib/aiLesson/course/courseEngine';

interface Props {
  t: AiCourseDict;
  sessions: CourseSessionRecord[];
  onBack: () => void;
}

export const CourseHistory = ({ t, sessions, onBack }: Props) => {
  const th = t.history;
  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={th.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">{th.title}</h1>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">{th.empty}</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-2">{th.totalSessions(sessions.length)}</p>
          <div className="space-y-2">
            {sessions.map((s) => {
              const mission = missionById(s.missionId);
              const min = Math.floor(s.durationSeconds / 60);
              const sec = s.durationSeconds % 60;
              return (
                <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.mode === 'voice' ? <Mic className="w-4 h-4 text-blue-500 shrink-0" /> : <PenLine className="w-4 h-4 text-gray-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.targetExpression || mission?.targetExpression}</p>
                        <p className="text-[11px] text-gray-400">{s.startedAt.slice(0, 10)} ・ {th.kinds[s.lessonKind]} ・ {min}:{String(sec).padStart(2, '0')}</p>
                      </div>
                    </div>
                    <StatusIcon status={s.completionStatus} />
                  </div>
                  {s.completionStatus === 'completed' && (
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      {s.targetUsedIndependently ? '✅ 自力で使用' : s.targetUsed ? '💡 ヒントあり使用' : '📖 意味を確認'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

const StatusIcon = ({ status }: { status: CourseSessionRecord['completionStatus'] }) => {
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (status === 'error') return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  if (status === 'interrupted') return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  return <span className="w-4 h-4 shrink-0" />;
};
