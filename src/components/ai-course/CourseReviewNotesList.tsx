// 過去の復習ノート一覧（Feature 5）。完了レッスンのノートを新しい順に並べ、タップで開く。
import { ArrowLeft, BookOpen, ChevronRight, RefreshCw } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';

export interface ReviewNoteSummary {
  sessionId: string;
  dateISO: string;
  themeJa: string;
  themeZh: string;
  isReview: boolean;
}

interface Props {
  t: AiCourseDict;
  notes: ReviewNoteSummary[];
  onOpen: (sessionId: string) => void;
  onBack: () => void;
}

export const CourseReviewNotesList = ({ t, notes, onOpen, onBack }: Props) => {
  const tn = t.reviewNote;
  const zh = t.locale === 'zh';
  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={tn.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">{tn.navTitle}</h1>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-5 text-center">{tn.empty}</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.sessionId}>
              <button type="button" onClick={() => onOpen(n.sessionId)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 hover:bg-gray-50 transition-colors flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  {n.isReview ? <RefreshCw className="w-4 h-4 text-blue-600" /> : <BookOpen className="w-4 h-4 text-blue-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{zh ? n.themeZh : n.themeJa}</p>
                  <p className="text-[11px] text-gray-400">{n.dateISO}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
