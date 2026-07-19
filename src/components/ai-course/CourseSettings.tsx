// 設定画面。利用案内の再確認（§17）・プライバシー（§13）・問題報告（§18）・ログアウト。

import { useState } from 'react';
import { BookOpen, ShieldCheck, LifeBuoy, LogOut, Trash2, Check } from 'lucide-react';
import { CourseIssueReport } from './CourseIssueReport';
import { deleteMyUtterances } from '../../lib/aiLesson/course/courseIssueApi';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  learnerId: string | null;
  onShowGuide: () => void;
  onLogout: () => void;
  onBack: () => void;
}

export const CourseSettings = ({ t, learnerId, onShowGuide, onLogout, onBack }: Props) => {
  const ts = t.settings;
  const [showIssue, setShowIssue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState<number | null>(null);

  const runDelete = async () => {
    setDeleting(true);
    const r = await deleteMyUtterances();
    setDeleting(false);
    setConfirmDelete(false);
    if (r.ok) setDeleted(r.deleted);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button type="button" onClick={onBack} className="min-h-11 px-2 -ml-1 text-sm text-gray-500 mb-4">
        ← {t.roadmap.back}
      </button>

      {/* 使い方をもう一度見る */}
      <Section icon={<BookOpen className="w-4 h-4 text-blue-600" />} title={ts.guideTitle}>
        <p className="text-xs text-gray-500 mb-2">{ts.guideDescription}</p>
        <button type="button" onClick={onShowGuide}
          className="w-full min-h-11 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
          {ts.guideOpen}
        </button>
      </Section>

      {/* プライバシー・発話履歴 */}
      <Section icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />} title={ts.privacyTitle}>
        <p className="text-xs text-gray-600 leading-relaxed">{ts.privacyExplain}</p>
        <p className="text-xs text-gray-500 leading-relaxed mt-2">{ts.privacyRetention}</p>

        {deleted !== null ? (
          <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3 mt-3 flex items-center gap-1.5">
            <Check className="w-4 h-4" />{ts.deleteDone(deleted)}
          </p>
        ) : confirmDelete ? (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-800 leading-relaxed">{ts.deleteConfirm}</p>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => void runDelete()} disabled={deleting}
                className="flex-1 min-h-11 py-2 bg-red-600 text-white text-sm font-bold rounded-lg disabled:opacity-40">
                {deleting ? ts.deleting : ts.deleteYes}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="min-h-11 px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg">
                {ts.deleteNo}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)}
            className="w-full min-h-11 py-2.5 mt-3 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center justify-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />{ts.deleteUtterances}
          </button>
        )}
      </Section>

      {/* 問題を報告する */}
      <Section icon={<LifeBuoy className="w-4 h-4 text-violet-600" />} title={ts.supportTitle}>
        {showIssue ? (
          <CourseIssueReport t={t} learnerId={learnerId} sessionId={null} onClose={() => setShowIssue(false)} />
        ) : (
          <button type="button" onClick={() => setShowIssue(true)}
            className="w-full min-h-11 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            {ts.reportIssue}
          </button>
        )}
      </Section>

      <p className="text-[11px] text-gray-400 leading-relaxed my-4">{t.positioning}</p>

      <button type="button" onClick={onLogout}
        className="w-full min-h-11 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2">
        <LogOut className="w-4 h-4" />{t.login.logout}
      </button>
    </div>
  );
};

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
    <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-2">{icon}{title}</p>
    {children}
  </div>
);
