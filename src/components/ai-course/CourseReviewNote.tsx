// 「今回の復習」ノート（Feature 5）。音声を使わず、目で確認して何度でも見返す備忘録。
// 既存データ（buildReviewNote）から生成済みの ReviewNote を表示するだけ（副作用なし）。

import { ArrowLeft, BookOpen, CheckCircle2, MessageSquare, Sparkles, AlertTriangle, CalendarDays, Volume2, Eye, Repeat } from 'lucide-react';
import { ShokoAvatar } from './ShokoAvatar';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { ReviewNote } from '../../lib/aiLesson/course/courseReviewNote';

interface Props {
  t: AiCourseDict;
  note: ReviewNote;
  onBack: () => void;
  /** 復習として記録（見て確認/声に出した）。任意 */
  onMarkReviewed?: (kind: 'viewed' | 'spoke') => void;
  /** もう一度音声で練習（任意） */
  onPractice?: () => void;
  reviewed?: boolean;
}

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4">{children}</div>
);
const Label = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <p className="text-[11px] font-medium text-gray-500 flex items-center gap-1.5 mb-1.5">{icon}{children}</p>
);

export const CourseReviewNote = ({ t, note, onBack, onMarkReviewed, onPractice, reviewed }: Props) => {
  const tn = t.reviewNote;
  const zh = t.locale === 'zh';
  const e = note.expression;

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={tn.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">{tn.todayTitle}</h1>
      </div>

      {/* 応援ヘッダー */}
      <div className="text-center mb-5">
        <ShokoAvatar size={64} expression="smile" className="mx-auto mb-2 ring-4 ring-emerald-50" />
        <p className="font-bold text-gray-900">{zh ? tn.wellDone : tn.wellDone}</p>
        <p className="text-xs text-gray-500 mt-0.5">{zh ? note.themeZh : note.themeJa}</p>
      </div>

      <div className="space-y-3">
        {/* 重要表現カード */}
        <Card>
          <Label icon={<BookOpen className="w-3.5 h-3.5 text-blue-600" />}>{tn.expression}</Label>
          <p className="text-xl font-bold text-gray-900 leading-snug break-words">{e.targetExpression}</p>
          <p className="text-sm text-gray-500 mt-0.5">{tn.reading}: {e.reading}</p>
          <p className="text-sm text-blue-700 mt-1">{tn.meaning}: {e.meaningZh}</p>
          <div className="mt-3 space-y-1.5">
            <p className="text-[15px] text-gray-900 leading-relaxed">💬 {e.simpleExample}</p>
            {e.naturalExample && e.naturalExample !== e.simpleExample && (
              <p className="text-sm text-gray-600 leading-relaxed">🗣 {e.naturalExample}</p>
            )}
          </div>
          <div className="mt-3 bg-gray-50 rounded-xl p-3">
            <Label icon={<Sparkles className="w-3.5 h-3.5 text-amber-400" />}>{tn.usage}</Label>
            <p className="text-sm text-gray-700 leading-relaxed">{zh ? e.usageZh : e.usageJa}</p>
          </div>
        </Card>

        {/* 自分が実際に話した例（実発話のみ） */}
        <Card>
          <Label icon={<MessageSquare className="w-3.5 h-3.5 text-emerald-600" />}>{tn.myUtterance}</Label>
          {e.myUtterances.length > 0 ? (
            <ul className="space-y-1.5">
              {e.myUtterances.map((u, i) => (
                <li key={i} className="text-sm text-gray-800 bg-emerald-50 rounded-lg px-3 py-1.5 leading-relaxed break-words select-text">{u}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">{tn.myUtteranceEmpty}</p>
          )}
        </Card>

        {/* より自然な言い方 */}
        {e.betterPhrasings.length > 0 && (
          <Card>
            <Label icon={<CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}>{tn.better}</Label>
            <ul className="space-y-2">
              {e.betterPhrasings.map((b, i) => (
                <li key={i} className="text-sm">
                  {b.original && <p className="text-gray-400 line-through decoration-red-300">{b.original}</p>}
                  <p className="text-gray-900 font-medium">→ {b.improved}</p>
                  {b.noteZh && <p className="text-xs text-gray-500 mt-0.5">{b.noteZh}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* 間違えやすいポイント */}
        {e.commonMistakes.length > 0 && (
          <Card>
            <Label icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}>{tn.mistakes}</Label>
            <ul className="space-y-1">
              {e.commonMistakes.map((m, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-1.5"><span className="text-amber-400 mt-0.5">•</span>{m}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* 翔子先生から一言 */}
        <Card>
          <Label icon={<ShokoAvatar size={16} />}>{tn.fromShoko}</Label>
          <p className="text-sm text-gray-800 leading-relaxed">{note.encouragementJa}</p>
          {note.achievements.length > 0 && (
            <ul className="mt-2 space-y-1">
              {note.achievements.map((a, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />{a}</li>
              ))}
            </ul>
          )}
        </Card>

        {/* 次の復習予定 */}
        <Card>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-blue-600" />{tn.nextReview}</span>
            <span className="font-bold text-gray-900">{note.nextReviewISO ?? tn.nextReviewNone}</span>
          </div>
        </Card>

        {/* 復習の記録（音声任意）。見て確認しただけでも記録可能 */}
        {onMarkReviewed && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            {reviewed ? (
              <p className="text-sm text-emerald-600 font-medium text-center">{tn.reviewRecorded}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => onMarkReviewed('viewed')}
                    className="min-h-11 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 flex items-center justify-center gap-1.5">
                    <Eye className="w-4 h-4 text-blue-600" />{tn.reviewDone}
                  </button>
                  <button type="button" onClick={() => onMarkReviewed('spoke')}
                    className="min-h-11 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 flex items-center justify-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-emerald-600" />{tn.reviewSpoke}
                  </button>
                </div>
                {onPractice && (
                  <button type="button" onClick={onPractice}
                    className="w-full min-h-11 py-2 mt-2 text-sm text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5">
                    <Repeat className="w-4 h-4" />{tn.reviewPractice}
                  </button>
                )}
                <p className="text-[11px] text-gray-400 text-center mt-2">{tn.voiceOptional}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
