// 設定画面。利用案内の再確認（§17）・プライバシー（§13）・問題報告（§18）・ログアウト。

import { useState } from 'react';
import { BookOpen, ShieldCheck, LifeBuoy, LogOut, Trash2, Check, Subtitles, Users } from 'lucide-react';
import { CourseIssueReport } from './CourseIssueReport';
import { deleteMyUtterances } from '../../lib/aiLesson/course/courseIssueApi';
import { effectiveSubtitleMode } from '../../lib/aiLesson/course/courseSubtitles';
import type { SubtitleMode } from '../../lib/aiLesson/course/courseSubtitles';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { Learner, LearnerSettings } from '../../lib/aiLesson/course/types';

interface Props {
  t: AiCourseDict;
  learner: Learner;
  onShowGuide: () => void;
  /** 設定変更を learner に保存（Supabaseへ。複数端末で同期） */
  onSaveSettings: (patch: Partial<LearnerSettings>) => void;
  onLogout: () => void;
  onBack: () => void;
}

const SUBTITLE_MODES: SubtitleMode[] = ['ja', 'ja_zh', 'whenStuck'];

export const CourseSettings = ({ t, learner, onShowGuide, onSaveSettings, onLogout, onBack }: Props) => {
  const ts = t.settings;
  const learnerId = learner.id;
  const [showIssue, setShowIssue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState<number | null>(null);
  const [subMode, setSubMode] = useState<SubtitleMode>(
    effectiveSubtitleMode(learner.settings, t.locale === 'zh' ? 'zh' : 'ja', learner.difficultyLevel),
  );
  const [subSaved, setSubSaved] = useState(false);
  const zhForcedOff = learner.settings.zhSupport === 'none';

  const chooseSubMode = (m: SubtitleMode) => {
    setSubMode(m);
    onSaveSettings({ subtitleMode: m });
    setSubSaved(true);
    setTimeout(() => setSubSaved(false), 1500);
  };

  const runDelete = async () => {
    setDeleting(true);
    const r = await deleteMyUtterances();
    setDeleting(false);
    setConfirmDelete(false);
    if (r.ok) setDeleted(r.deleted);
  };

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-6">
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

      {/* 字幕モード（中国語補助） */}
      <Section icon={<Subtitles className="w-4 h-4 text-blue-600" />} title={ts.subtitleTitle}>
        <p className="text-xs text-gray-500 mb-3">{ts.subtitleDescription}</p>
        {zhForcedOff ? (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">{ts.subtitleForcedJa}</p>
        ) : (
          <div className="space-y-2">
            {SUBTITLE_MODES.map((m) => (
              <button key={m} type="button" onClick={() => chooseSubMode(m)}
                aria-pressed={subMode === m}
                className={`w-full min-h-11 py-2.5 px-3 rounded-lg text-sm text-left border flex items-start gap-2 ${
                  subMode === m ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                <span className={`mt-0.5 w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${subMode === m ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                  {subMode === m && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span>
                  <span className="font-medium text-gray-800 block">{ts.subtitleModes[m]}</span>
                  <span className="text-[11px] text-gray-500 block">{ts.subtitleModeHints[m]}</span>
                </span>
              </button>
            ))}
            {subSaved && <p className="text-xs text-emerald-600 text-center">{ts.saved ?? ''}</p>}
          </div>
        )}
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

      {/* AI先生と人間コーチの役割（混同させない・§B-1） */}
      <Section icon={<Users className="w-4 h-4 text-emerald-600" />} title={ts.rolesTitle}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-blue-700 mb-1">{ts.rolesAiLabel}</p>
            <ul className="space-y-0.5">
              {ts.rolesAi.map((r, i) => <li key={i} className="text-xs text-gray-600">・{r}</li>)}
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-700 mb-1">{ts.rolesCoachLabel}</p>
            <ul className="space-y-0.5">
              {ts.rolesCoach.map((r, i) => <li key={i} className="text-xs text-gray-600">・{r}</li>)}
            </ul>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-3 select-all">{ts.rolesWechatHint}</p>
      </Section>

      {/* 問題を報告する */}
      <Section icon={<LifeBuoy className="w-4 h-4 text-blue-600" />} title={ts.supportTitle}>
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
