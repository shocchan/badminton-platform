// 日本語のしくみラボ シェル（Phase 2B §7）。5領域（今日/ことば/しくみ/復習/履歴）＋単元ページ。
// labPreview管理者のみ（呼び出し側でも確認済み）。進捗はsessionStorageの試作Repository。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { FOUNDATION_UNIT_META, loadFoundationUnit, isKnownFoundationUnit } from '../../../lib/aiLesson/course/foundationRegistry';
import type { FoundationUnitBundle } from '../../../lib/aiLesson/course/foundationRegistry';
import { createFoundationProgressRepository } from '../../../lib/aiLesson/course/foundationProgress';
import { trackCourseOnce, trackCourse } from '../../../lib/aiLesson/course/courseAnalytics';
import type { AiCourseDict } from '../../../locales/aiCourse';
import { FoundationUnitPage } from './FoundationUnitPage';
import { FoundationTodayView } from './FoundationTodayView';
import { FoundationVocabularyView } from './FoundationVocabularyView';
import { FoundationRulesView } from './FoundationRulesView';
import { FoundationReviewView } from './FoundationReviewView';
import { FoundationHistoryView } from './FoundationHistoryView';

export type LabView = 'today' | 'words' | 'rules' | 'review' | 'history';
type BundleState = Record<string, FoundationUnitBundle | 'loading' | 'error'>;
export interface LabShellState { section: LabView; unit: string | null; step: string | null }
interface Props {
  t: AiCourseDict;
  onBack: () => void;
  /** URLからの位置復元（言語切替・リロード対応・§7）。不正unitはラボトップへ（§8） */
  initial?: { section?: LabView; unit?: string | null; step?: string | null };
  /** 表示位置の変化をURLへ同期するためのコールバック（回答内容は渡さない） */
  onStateChange?: (s: LabShellState) => void;
}

export const FoundationLabShell = ({ t, onBack, initial, onStateChange }: Props) => {
  const tl = t.lab;
  const [view, setViewRaw] = useState<LabView>(initial?.section ?? 'today');
  const [activeUnitId, setActiveUnitIdRaw] = useState<string | null>(() =>
    (initial?.unit && isKnownFoundationUnit(initial.unit) ? initial.unit : null));
  const [unitStep, setUnitStep] = useState<string | null>(initial?.step ?? null);
  const notify = (next: { view?: LabView; unit?: string | null; step?: string | null }) => {
    onStateChange?.({
      section: next.view ?? view,
      unit: next.unit !== undefined ? next.unit : activeUnitId,
      step: next.step !== undefined ? next.step : unitStep,
    });
  };
  const setView = (v: LabView) => { setViewRaw(v); notify({ view: v, unit: null, step: null }); };
  const setActiveUnitId = (id: string | null) => { setActiveUnitIdRaw(id); setUnitStep(id ? 'intro' : null); notify({ unit: id, step: id ? 'intro' : null }); };
  const [bundles, setBundles] = useState<BundleState>({});
  const [, setProgressTick] = useState(0);
  const repo = useMemo(() => createFoundationProgressRepository(window.sessionStorage), []);
  const onProgressChanged = useCallback(() => setProgressTick((v) => v + 1), []);

  useEffect(() => { trackCourseOnce('view_ai_course_foundation_lab'); }, []);
  // 初期URLの不正unit等を1回だけ正規化（§8: 不正unit→ラボトップ・ループなし）
  useEffect(() => {
    if (initial?.unit && !isKnownFoundationUnit(initial.unit)) onStateChange?.({ section: initial?.section ?? 'today', unit: null, step: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ
  }, []);

  const loadUnit = useCallback((id: string) => {
    if (!isKnownFoundationUnit(id)) return; // 不正IDはロードしない（§23）
    setBundles((b) => (b[id] && b[id] !== 'error' ? b : { ...b, [id]: 'loading' }));
    loadFoundationUnit(id)
      .then((bundle) => setBundles((b) => ({ ...b, [id]: bundle })))
      .catch(() => setBundles((b) => ({ ...b, [id]: 'error' })));
  }, []);

  // URL復元で単元が直接開かれた場合もデータをロード（言語切替・リロード対応・microtaskで同期setState回避）
  useEffect(() => {
    if (!activeUnitId) return;
    let alive = true;
    void Promise.resolve().then(() => { if (alive) loadUnit(activeUnitId); });
    return () => { alive = false; };
  }, [activeUnitId, loadUnit]);

  // ことば/しくみ/復習/履歴はラベル解決のため全単元データが必要（lazy・ラボ内でのみロード）
  const needAll = view === 'words' || view === 'rules' || view === 'review' || view === 'history';
  useEffect(() => {
    if (!needAll) return;
    FOUNDATION_UNIT_META.forEach((m) => loadUnit(m.id));
  }, [needAll, loadUnit]);

  const openUnit = (id: string) => {
    if (!isKnownFoundationUnit(id)) { setActiveUnitId(null); setView('today'); return; } // 安全な案内（§23）
    loadUnit(id);
    setActiveUnitId(id);
  };

  const loadedAll = FOUNDATION_UNIT_META.every((m) => typeof bundles[m.id] === 'object');
  const anyError = FOUNDATION_UNIT_META.some((m) => bundles[m.id] === 'error');
  const summaries = Object.fromEntries(FOUNDATION_UNIT_META.map((m) => [m.id, repo.getUnitSummary(m.id)]));
  const active = activeUnitId ? bundles[activeUnitId] : undefined;

  const tabs: { key: LabView; label: string }[] = [
    { key: 'today', label: tl.tabToday }, { key: 'words', label: tl.tabWords }, { key: 'rules', label: tl.tabRules },
    { key: 'review', label: tl.tabReview }, { key: 'history', label: tl.tabHistory },
  ];

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => (activeUnitId ? setActiveUnitId(null) : onBack())} aria-label={t.roadmap.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><FlaskConical className="w-4 h-4 text-indigo-600" />{tl.title}</h1>
      </div>
      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 mb-4">{tl.draftNote}</p>

      {activeUnitId ? (
        active === 'loading' || active === undefined ? (
          <p className="text-sm text-gray-400 text-center py-10">{t.common.loading}</p>
        ) : active === 'error' ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-500 mb-3">{tl.loadError}</p>
            <button type="button" onClick={() => loadUnit(activeUnitId)} className="min-h-11 px-6 text-sm font-bold text-indigo-700 border border-indigo-200 rounded-xl">{t.common.retry}</button>
          </div>
        ) : (
          <FoundationUnitPage key={activeUnitId} t={t} bundle={active} repo={repo} onProgressChanged={onProgressChanged}
            initialPhase={unitStep}
            onPhaseChange={(p) => { setUnitStep(p); notify({ step: p }); }}
            onExit={() => setActiveUnitId(null)} onGoReview={() => { setActiveUnitId(null); setView('review'); }} />
        )
      ) : (
        <>
          <div className="flex gap-1 mb-4 overflow-x-auto" role="tablist">
            {tabs.map(({ key, label }) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
                className={`min-h-10 px-3 py-1.5 text-xs font-bold rounded-full whitespace-nowrap ${view === key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{label}</button>
            ))}
          </div>
          {needAll && !loadedAll && !anyError && <p className="text-sm text-gray-400 text-center py-8">{t.common.loading}</p>}
          {needAll && anyError && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-3">{tl.loadError}</p>
              <button type="button" onClick={() => FOUNDATION_UNIT_META.forEach((m) => loadUnit(m.id))}
                className="min-h-11 px-6 text-sm font-bold text-indigo-700 border border-indigo-200 rounded-xl">{t.common.retry}</button>
            </div>
          )}
          {view === 'today' && (
            <FoundationTodayView t={t} meta={FOUNDATION_UNIT_META} summaries={summaries} repo={repo} onOpenUnit={openUnit} onGoReview={() => setView('review')} />
          )}
          {view === 'words' && loadedAll && (
            <FoundationVocabularyView t={t} meta={FOUNDATION_UNIT_META} bundles={bundles as Record<string, FoundationUnitBundle>} repo={repo} />
          )}
          {view === 'rules' && loadedAll && (
            <FoundationRulesView t={t} meta={FOUNDATION_UNIT_META} bundles={bundles as Record<string, FoundationUnitBundle>} onOpenUnit={openUnit} />
          )}
          {view === 'review' && loadedAll && (
            <FoundationReviewView t={t} meta={FOUNDATION_UNIT_META} bundles={bundles as Record<string, FoundationUnitBundle>} repo={repo} onOpenUnit={openUnit} />
          )}
          {view === 'history' && loadedAll && (
            <FoundationHistoryView t={t} meta={FOUNDATION_UNIT_META} repo={repo}
              onReset={() => { repo.reset(); trackCourse('reset_ai_course_foundation_preview'); onProgressChanged(); }} />
          )}
        </>
      )}
    </div>
  );
};

export default FoundationLabShell;
