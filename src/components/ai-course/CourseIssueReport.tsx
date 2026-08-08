// 問題報告（§18）。Andyさんが困ったことを伝えられる導線。
//
// 自動で添付するのは、原因調査に必要な最小限だけ:
//   learner_id / 発生日時 / ページ / セッションID / エラーコード / ブラウザ / OS / 接続状態
// APIキー・OTP・発話本文は一切添付しない。

import { useState } from 'react';
import { LifeBuoy, Send, Check } from 'lucide-react';
import { submitIssueReport } from '../../lib/aiLesson/course/courseIssueApi';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  learnerId: string | null;
  sessionId: string | null;
  /** 直前に出ていたエラーコード（あれば） */
  errorCode?: string | null;
  onClose: () => void;
}

export const CourseIssueReport = ({ t, learnerId, sessionId, errorCode, onClose }: Props) => {
  const ti = t.issue;
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await submitIssueReport({
      learnerId, sessionId, errorCode: errorCode ?? null, comment: comment.trim(),
    });
    setBusy(false);
    if (ok) setSent(true); else setFailed(true);
  };

  if (sent) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
        <p className="text-sm text-green-800 font-medium">{ti.sent}</p>
        <button type="button" onClick={onClose}
          className="min-h-11 mt-2 text-sm text-green-700 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{ti.close}</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
        <LifeBuoy className="w-4 h-4 text-blue-600" />{ti.title}
      </p>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{ti.description}</p>

      <textarea
        value={comment} onChange={(e) => setComment(e.target.value)}
        rows={4} maxLength={1000} placeholder={ti.placeholder}
        className="w-full mt-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{ti.attachNote}</p>

      {failed && (
        <div className="mt-2">
          <p className="text-sm text-red-600">{ti.failed}</p>
          <p className="text-xs text-gray-600 mt-1">{t.support.emailDescription}</p>
          <a href={`mailto:${t.support.email}`} className="text-xs font-bold text-blue-700 underline">{t.support.contactByEmail}（{t.support.email}）</a>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button type="button" onClick={() => void submit()} disabled={busy || !comment.trim()}
          className="flex-1 min-h-11 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-1.5 action-raised action-primary-blue touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          <Send className="w-3.5 h-3.5" />{busy ? ti.sending : ti.submit}
        </button>
        <button type="button" onClick={onClose}
          className="min-h-11 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          {ti.cancel}
        </button>
      </div>
    </div>
  );
};
