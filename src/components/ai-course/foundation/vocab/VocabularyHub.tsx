// ことば図鑑（Phase 2C+ §6-§7・§18-§26）。全learner利用可のlazy chunk（FOREST FIRST）。
// 内部レビュー画面（review/decisions/connectivity/onodrafts/n3grammar・sandbox）のみlabPreview管理者限定。
// トップは3ブロックのみ（今日のことば／カテゴリー／復習したいことば・§7）。
// 進捗はsessionStorage試作Repository。自己評価と検証状態は分離（§20）。
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { CourseChunkLoading } from '../../CourseLoading';
import { ArrowLeft, ArrowRight, BookOpen, Check, MessageCircle, ChevronDown } from 'lucide-react';
import type { FoundationItem } from '../../../../lib/aiLesson/course/foundationTypes';
import { allVocabularyItems, vocabByCategory } from '../../../../lib/aiLesson/course/foundationVocabBank';
import type { VocabCategory } from '../../../../lib/aiLesson/course/foundationVocabBank';
import { assetForItem } from '../../../../lib/aiLesson/course/visualAssetManifest';
import { createVocabProgressRepository, pickDailyWords } from '../../../../lib/aiLesson/course/vocabProgress';
import { shuffledChoicesSeeded } from '../../../../lib/aiLesson/course/foundationGrade';
import { buildImageToWordQuestion } from '../../../../lib/aiLesson/course/vocabImageQuestions';
import type { FoundationQuestion } from '../../../../lib/aiLesson/course/foundationTypes';
import { trackCourse, trackCourseOnce } from '../../../../lib/aiLesson/course/courseAnalytics';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import { VocabImage } from './VocabImage';
import { DoneIllustration, ResultBars, ReviewTimeline, PhaseTrail } from './LearningIllustrations';
import {
  isJourneySandboxActive, beginJourneySandbox, createJourneySandbox,
} from '../../../../lib/aiLesson/course/courseStorageRegistry';
import type { StorageLike } from '../../../../lib/aiLesson/course/courseStorageRegistry';
import type { JourneyTaskRepository } from '../../../../lib/aiLesson/course/journeyTaskContract';
import { buildLearnerResult } from '../../../../lib/aiLesson/course/learnerResultModel';
import type { JourneyResultSnapshot } from '../../../../lib/aiLesson/course/journeyTaskContract';
import { ActionButton } from '../ActionButton';
import { practiceForItem } from '../../../../lib/aiLesson/course/vocabConversationPractice';
import { levelMetaOf } from '../../../../lib/aiLesson/course/vocabularyLevelMeta';
import { VOCABULARY_PACKS, computePackProgress, currentPackForTrack, nextPackForTrack } from '../../../../lib/aiLesson/course/vocabularyPacks';
import type { VocabularyTrack, VocabularyPack as VocabularyPackT } from '../../../../lib/aiLesson/course/vocabularyPacks';
import { pickDiagnosticItems, buildDiagnosticQuestion, buildDiagnosticSet, applyDiagnosticAnswer, pickQuickReviewItems } from '../../../../lib/aiLesson/course/vocabDiagnostic';
import type { DiagnosticSetQuestion } from '../../../../lib/aiLesson/course/vocabDiagnostic';
import { meaningZhShortOf, contentNoteOf, senseOverridesOf } from '../../../../lib/aiLesson/course/vocabContentMeta';
import { furiganaForItem, resolveFuriganaMode } from '../../../../lib/aiLesson/course/vocabFurigana';
import { relationsForItem } from '../../../../lib/aiLesson/course/vocabRelations';
import { RubySegments } from './RubyText';
import type { FuriganaDisplayMode } from './RubyText';
import type { DiagnosticOutcome } from '../../../../lib/aiLesson/course/vocabProgress';
import { createVocabSpacedReviewRepository } from '../../../../lib/aiLesson/course/vocabSpacedReview';
import type { VocabSpacedReviewRepository, ReviewResult } from '../../../../lib/aiLesson/course/vocabSpacedReview';
import { defaultLearningClock } from '../../../../lib/aiLesson/course/learningClock';
import { detectFirstRunState, createFirstRunRepository } from '../../../../lib/aiLesson/course/firstRunJourney';
import { createJourneyTaskRepository } from '../../../../lib/aiLesson/course/journeyTaskContract';
import { LearnerErrorBoundary, LearnerRecovery } from './LearnerRecovery';
import { VocabularyHubHeader } from './VocabularyHubHeader';
import {
  vocabCanonicalStats, learnerWordStateOf, computeVocabCompletion, levelTierOf,
  filterVocabItems, unitLinksFor, VOCAB_FILTER_KEYS,
} from '../../../../lib/aiLesson/course/vocabCanonical';
import type { VocabFilterKey, LearnerWordState } from '../../../../lib/aiLesson/course/vocabCanonical';
// 教材レビューは管理用の重い画面のため別chunk（一般学習フローのchunkへ含めない・§31）
const VocabReviewPanelLazy = lazy(() => import('./VocabReviewPanel'));
const VocabDecisionConsoleLazy = lazy(() => import('./VocabDecisionConsole'));
const OnoDraftsPanelLazy = lazy(() => import('./OnoDraftsPanel'));
const N3GrammarDraftsPanelLazy = lazy(() => import('./N3GrammarDraftsPanel'));
const Chapter1AdventurePanelLazy = lazy(() => import('../../rpg/Chapter1AdventurePanel'));
const VocabDecisionBadgeLazy = lazy(() => import('./VocabDecisionBadge'));
const VocabConnectivityInspectorLazy = lazy(() => import('./VocabConnectivityInspector'));
const FirstRunJourneyLazy = lazy(() => import('./FirstRunJourney'));
import { assetById } from '../../../../lib/aiLesson/course/visualAssetManifest';
import { isVisibleAsset } from '../../../../lib/aiLesson/course/visualAssetTypes';
import { NiEDirectionDiagram, WoObjectDiagram, TeimasuTimelineDiagram } from './GrammarDiagrams';

export type VocabView = 'top' | 'category' | 'detail' | 'daily' | 'all' | 'practice' | 'roadmap' | 'diagnostic' | 'quickreview' | 'review' | 'decisions' | 'connectivity' | 'firstrun' | 'onodrafts' | 'n3grammar' | 'adventure';
export interface VocabHubState { view: VocabView; category: VocabCategory | null; itemId: string | null }
interface Props {
  t: AiCourseDict;
  onBack: () => void;
  /** 旧・汎用会話導線（§7の根本修正でスクリプト練習モードへ置換。互換のため任意受け取り） */
  onGoConversation?: () => void;
  initial?: Partial<VocabHubState>;
  onStateChange?: (s: VocabHubState) => void;
  /** 内部レビュー画面（review/decisions/connectivity/onodrafts/n3grammar・sandbox・draft画像）の表示。
      学習機能そのものは全learnerが利用できる（FOREST FIRST） */
  labPreview?: boolean;
  /** 本人の推定レベル（'N3'等）。図鑑ヘッダーの表示切替のみに使い、習得判定には使わない */
  learnerLevel?: string | null;
}

// 日付判定はLearningClockへ集約（ローカル日付・UTCで日付がずれない・2E-1.10 §5）
const dateKey = () => defaultLearningClock.localDateKey();

export const VocabularyHub = ({ t, onBack, onGoConversation, initial, onStateChange, labPreview = false, learnerLevel = null }: Props) => {
  const tv = t.vocab;
  const items = useMemo(() => allVocabularyItems(), []);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // 検証用サンドボックス（2E-1.14 §7）。動作中は通常キーを一切読まず・書かず、
  // sandbox名前空間だけを使う。通常の学習進捗を退避・削除して検証状態を作らないための仕組み。
  const [sandboxOn, setSandboxOn] = useState(() => isJourneySandboxActive(window.sessionStorage));
  const store = useMemo<StorageLike>(
    () => (sandboxOn ? createJourneySandbox(window.sessionStorage).storage : window.sessionStorage),
    [sandboxOn]);
  const repo = useMemo(() => createVocabProgressRepository(store), [store]);
  // 間隔反復（翌日/3日後/7日後）のpreview Repository（2E-1.10 §3・正式保存ではない）
  const schedule = useMemo(() => createVocabSpacedReviewRepository(store, defaultLearningClock), [store]);
  // Journey往復契約（2E-1.12 §6-§7・完了はJourney側の契約が一致した場合のみ）
  const journeyTask = useMemo(() => createJourneyTaskRepository(store), [store]);
  const firstRun = useMemo(() => createFirstRunRepository(store, repo, schedule), [store, repo, schedule]);
  /** 診断・練習が終わったときに、Journey契約があれば完了させてJourneyへ戻す（無ければ通常動作） */
  const finishJourneyTask = (type: 'diagnostic' | 'practice', snapshot: JourneyResultSnapshot) => {
    const c = journeyTask.get();
    if (!c || c.activeTaskType !== type || c.activeTaskStatus === 'completed') return false;
    const r = journeyTask.completeTask({ journeyId: c.journeyId, taskId: c.activeTaskId, token: c.completionToken, snapshot });
    if (!r.ok) return false;
    // Journeyのステップも進める（診断完了→Step3・練習完了→Step4）。完了は契約側で一度だけ（§7）
    if (type === 'diagnostic') firstRun.completeCheck(); else firstRun.completePractice();
    setView('firstrun');
    return true;
  };
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((v) => v + 1), []);

  const validCats: VocabCategory[] = ['verbs', 'iAdj', 'naAdj', 'nouns', 'scenes', 'all'];
  const [view, setViewRaw] = useState<VocabView>(() => {
    const v = initial?.view;
    if (v === 'practice' && initial?.itemId && itemById.has(initial.itemId)) return 'practice';
    if (v === 'detail' && initial?.itemId && itemById.has(initial.itemId)) return 'detail';
    if (v === 'category' && initial?.category && validCats.includes(initial.category)) return 'category';
    if (v === 'daily' || v === 'all' || v === 'roadmap' || v === 'diagnostic' || v === 'quickreview' || v === 'firstrun') return v;
    // 内部レビュー画面はlabPreview管理者のみURL復元を許可（learnerはtopへ）
    if ((v === 'review' || v === 'decisions' || v === 'connectivity' || v === 'onodrafts' || v === 'n3grammar') && labPreview) return v;
    return 'top';
  });
  const [category, setCategory] = useState<VocabCategory | null>(initial?.category && validCats.includes(initial.category) ? initial.category : null);
  const [itemId, setItemId] = useState<string | null>(initial?.itemId && itemById.has(initial.itemId) ? initial.itemId : null);
  const [query, setQuery] = useState('');
  // 図鑑トップのしぼり込み（11フィルター＋検索併用・B§7）。触るまで一覧は出さない
  const [scopeFilter, setScopeFilter] = useState<VocabFilterKey>('all');
  const [scopeQuery, setScopeQuery] = useState('');
  const [scopeTouched, setScopeTouched] = useState(false);
  const setView = (v: VocabView, cat: VocabCategory | null = null, id: string | null = null) => {
    setViewRaw(v); setCategory(cat); setItemId(id);
    onStateChange?.({ view: v, category: cat, itemId: id });
  };

  useEffect(() => { trackCourseOnce('view_ai_course_vocabulary'); }, []);
  // 不正itemId等の初期URLを1回だけ正規化（ことばトップへ・§59）
  useEffect(() => {
    if (initial?.itemId && !itemById.has(initial.itemId)) onStateChange?.({ view: 'top', category: null, itemId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ
  }, []);

  const daily = useMemo(
    () => pickDailyWords(items.filter((i) => i.coreLevel === 'A' || !i.coreLevel).map((i) => i.id), repo, [], dateKey()),
    [items, repo]);

  // 図鑑ヘッダーの正準集計（vocabCanonicalが単一情報源・tickで学習操作後に再計算）
  const canonical = useMemo(() => {
    const stateCounts: Record<LearnerWordState, number> = { unseen: 0, learning: 0, reviewing: 0, retained_candidate: 0 };
    for (const it of items) stateCounts[learnerWordStateOf(it.id, repo, schedule)] += 1;
    return {
      stats: vocabCanonicalStats(), stateCounts,
      completion: computeVocabCompletion(repo, schedule), tier: levelTierOf(learnerLevel),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick=学習操作後の手動再計算トリガー
  }, [items, repo, schedule, learnerLevel, tick]);


  const listFor = (cat: VocabCategory): FoundationItem[] => vocabByCategory(items, cat);
  const catMeta: { key: VocabCategory; label: string }[] = [
    { key: 'verbs', label: tv.catVerbs }, { key: 'iAdj', label: tv.catIAdj },
    { key: 'naAdj', label: tv.catNaAdj }, { key: 'nouns', label: tv.catNouns },
  ];

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => (view === 'top' ? onBack() : setView(view === 'detail' && category ? 'category' : 'top', view === 'detail' ? category : null))}
          aria-label={t.roadmap.back} className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-indigo-600" />{tv.title}</h1>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{t.lab.betaBadge}</span>
      </div>

      {/* 検証モードの常時表示（2E-1.14 §7）。控えめだが必ず見える位置に置き、
          「今どちらの状態か」を取り違えないようにする。終了はここからいつでも可能。 */}
      {sandboxOn && (
        <div role="status" className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <p className="text-[11px] font-bold text-amber-800">{tv.sandboxBanner}</p>
          <button type="button"
            onClick={() => {
              createJourneySandbox(window.sessionStorage).end();   // sandboxキーのみ削除
              setSandboxOn(false); setView('top');
            }}
            className="mt-1 min-h-10 text-[11px] text-amber-900 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.sandboxEnd}</button>
        </div>
      )}

      {view === 'top' && (
        <div>
          {/* ⓪-h 図鑑の正準ヘッダー（目的・スコープ・進捗・ゴール定義・レベル別表示・B§5-§6） */}
          <VocabularyHubHeader t={t} stats={canonical.stats} stateCounts={canonical.stateCounts}
            completion={canonical.completion} tier={canonical.tier} />
          {/* ⓪ 語彙の目標と現在のパック（§45/§50・第一表示） */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-gray-400">{tv.goalHeading}</p>
                <p className="text-sm font-bold text-gray-900">{tv.tracks[repo.getSettings().track] ?? tv.tracks.life_basic}</p>
              </div>
              <select aria-label={tv.changeGoal} value={repo.getSettings().track}
                onChange={(e) => { repo.setSettings({ track: e.target.value }); bump(); }}
                className="min-h-9 text-xs border border-gray-200 rounded-lg px-2 text-gray-600">
                {Object.entries(tv.tracks).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            {(() => {
              const pack = VOCABULARY_PACKS[0];
              const pp = computePackProgress(pack, repo);
              return (
                <div className="mt-3 border-t border-gray-50 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-gray-400">{tv.packHeading}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tv.packStates[pp.state]}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{t.locale === 'zh' ? pack.titleZh : pack.titleJa}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{tv.packProgress(pp.seenCount, pp.totalCount)}</p>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1.5" role="img" aria-label={tv.packProgress(pp.seenCount, pp.totalCount)}>
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pp.totalCount ? Math.round((pp.seenCount / pp.totalCount) * 100) : 0}%` }} />
                  </div>
                  {/* 詳細な内訳・状態はロードマップ/成長画面へ（同じ進捗を重複表示しない・§26） */}
                  <button type="button" onClick={() => setView('roadmap')}
                    className="min-h-10 mt-1 text-xs font-bold text-indigo-700 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.viewRoadmap} →</button>
                </div>
              );
            })()}
          </div>
          {/* ①-0 初回の案内（2E-1.11 §3・履歴がある人には出さない） */}
          {(() => {
            const fr = detectFirstRunState(window.sessionStorage, repo, schedule);
            if (fr.state !== 'true_first_run' && fr.state !== 'onboarding_in_progress') return null;
            return (
              <div className="bg-white rounded-2xl border border-indigo-200 p-5 mb-4">
                <p className="text-xs font-bold text-indigo-700 mb-1">{tv.frSteps.goal}</p>
                <p className="text-base font-bold text-gray-900 mb-3">{tv.frGoalHeading}</p>
                <ActionButton variant="primary" fullWidth onClick={() => setView('firstrun')}>{tv.frNext}</ActionButton>
              </div>
            );
          })()}
          {/* ①-a 今日の復習（期限ベース・第一表示・2E-1.10 §6）。0件のときは出さず次の行動へ誘導 */}
          {(() => {
            const s = schedule.getDueSummary();
            if (s.total === 0) return null;
            const minutes = Math.max(1, Math.round(s.total * 0.5));
            return (
              <div className="bg-white rounded-2xl border border-amber-200 p-5 mb-4">
                <p className="text-xs font-bold text-amber-700 mb-1">{tv.dueReviewTitle}</p>
                <p className="text-base font-bold text-gray-900 mb-3">{tv.dueReviewCount(s.total, minutes)}</p>
                <ActionButton variant="primary" fullWidth
                  onClick={() => { trackCourse('view_ai_course_daily_review', { count: String(s.total) }); setView('quickreview'); }}>
                  {tv.dueReviewStart}
                </ActionButton>
                <details className="mt-2">
                  <summary className="text-[11px] text-gray-500 cursor-pointer min-h-8 flex items-center">{tv.dueBreakdown}</summary>
                  <ul className="text-[11px] text-gray-600 mt-1 space-y-0.5">
                    {s.overdue > 0 && <li>・{tv.dueOverdue(s.overdue)}</li>}
                    {s.byStage.day1 > 0 && <li>・{tv.dueDay1(s.byStage.day1)}</li>}
                    {s.byStage.day3 > 0 && <li>・{tv.dueDay3(s.byStage.day3)}</li>}
                    {s.byStage.day7 > 0 && <li>・{tv.dueDay7(s.byStage.day7)}</li>}
                    {s.byStage.retention_candidate > 0 && <li>・{tv.dueRetention(s.byStage.retention_candidate)}</li>}
                  </ul>
                </details>
              </div>
            );
          })()}
          {/* ① 今日のことば（§7第一表示） */}
          <div className="bg-indigo-600 text-white rounded-2xl p-5 mb-4">
            <p className="text-xs font-bold text-indigo-200 mb-2">{tv.todayWordsHeading}</p>
            <div className="flex gap-2 mb-3">
              {daily.itemIds.map((id) => {
                const it = itemById.get(id);
                return it ? (
                  <div key={id} className="flex-1 bg-white/10 rounded-xl p-2 text-center min-w-0">
                    <p className="text-sm font-bold truncate">{it.displayForm}</p>
                    <p className="text-[10px] text-indigo-200 truncate">{it.meaningZh}</p>
                  </div>
                ) : null;
              })}
            </div>
            <button type="button" onClick={() => { trackCourse('start_ai_course_daily_words'); setView('daily'); }}
              className="action-raised action-secondary w-full min-h-12 py-3 bg-white text-indigo-700 font-bold rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{tv.dailyCta}</button>
            {(() => {
              const quickLeft = pickQuickReviewItems(items.map((i) => i.id), repo).length;
              return quickLeft > 0 ? (
                <button type="button" onClick={() => setView('quickreview')}
                  className="w-full min-h-10 mt-2 text-xs font-bold text-indigo-100 underline transition-colors active:bg-white/10 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.quickReviewChip(quickLeft)}</button>
              ) : null;
            })()}
          </div>
          {/* ①-b 図鑑のしぼり込み（11フィルター＋検索併用・モバイルはwrap表示・B§7） */}
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-500 mb-2">{t.vocabScope.filterHeading}</p>
            <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label={t.vocabScope.filterHeading}>
              {VOCAB_FILTER_KEYS.map((k) => (
                <button key={k} type="button"
                  onClick={() => { setScopeFilter(k); setScopeTouched(true); }} aria-pressed={scopeFilter === k}
                  className={`min-h-9 px-2.5 py-1 text-xs rounded-full border action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${scopeFilter === k ? 'bg-indigo-600 text-white border-indigo-600 font-bold' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {t.vocabScope.filters[k]}
                </button>
              ))}
            </div>
            <input type="search" value={scopeQuery}
              onChange={(e) => { setScopeQuery(e.target.value); setScopeTouched(true); }}
              placeholder={t.vocabScope.searchInFilter} aria-label={t.vocabScope.searchInFilter}
              className="w-full min-h-11 px-4 py-2.5 border border-gray-200 rounded-xl text-sm mb-2" />
            {scopeFilter === 'selfKnown' && <p className="text-[11px] text-gray-400 mb-2">{t.vocabScope.selfKnownNote}</p>}
            {scopeTouched && (() => {
              const list = filterVocabItems(items, scopeFilter, scopeQuery, repo, schedule);
              return (
                <>
                  <p className="text-[11px] text-gray-400 mb-2" aria-live="polite">{t.vocabScope.resultCount(list.length)}</p>
                  {list.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-6">{t.vocabScope.emptyResult}</p>
                    : <div className="space-y-2">{list.map((it) => (
                        <CompactCard key={it.id} t={t} repo={repo} item={it}
                          onOpen={() => setView('detail', 'all', it.id)} labPreview={labPreview} />
                      ))}</div>}
                </>
              );
            })()}
          </div>
          {/* ② カテゴリー（優先4つ大＋すべて・§7） */}
          <p className="text-xs font-bold text-gray-500 mb-2">{tv.categoriesHeading}</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {catMeta.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setView('category', key)}
                className="card-interactive min-h-16 bg-white rounded-xl border border-gray-100 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <p className="text-sm font-bold text-gray-900 flex items-center justify-between">{label}<ArrowRight className="w-3.5 h-3.5 text-gray-300" aria-hidden /></p>
                <p className="text-[11px] text-gray-400">{tv.wordsCount(listFor(key).length)}</p>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setView('all', 'all')}
            className="w-full min-h-11 py-2 mb-4 text-sm text-indigo-700 border border-indigo-100 rounded-xl action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.catAll}・{tv.catScenes}</button>
          {/* 復習はロードマップ・3分復習へ集約（同じ進捗の重複表示を避ける・§26） */}
          <p className="text-[11px] text-gray-400 mt-3">{tv.notSavedVocab}</p>
          {/* 内部レビュー入口（labPreview管理者のみ・learnerにはDOM自体を出さない・§14） */}
          {labPreview && (
            <>
              <button type="button" onClick={() => setView('review')}
                className="w-full min-h-10 mt-4 text-[11px] text-gray-400 underline text-left transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.internalReviewEntry}</button>
              <button type="button" onClick={() => setView('decisions')}
                className="w-full min-h-10 text-[11px] text-gray-400 underline text-left transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.decisionConsoleEntry}</button>
              <button type="button" onClick={() => setView('connectivity')}
                className="w-full min-h-10 text-[11px] text-gray-400 underline text-left transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.connectivityEntry}</button>
              <button type="button" onClick={() => setView('onodrafts')}
                className="w-full min-h-10 text-[11px] text-gray-400 underline text-left transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.onoDraftsEntry}</button>
              <button type="button" onClick={() => setView('n3grammar')}
                className="w-full min-h-10 text-[11px] text-gray-400 underline text-left transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.n3GrammarDraftsEntry}</button>
              <button type="button" onClick={() => setView('adventure')}
                className="w-full min-h-10 text-[11px] text-gray-400 underline text-left transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.adventureEntry}</button>
              {/* 検証用サンドボックス入口（2E-1.14 §7）。通常の学習記録を退避・削除せずに
                  初回Journeyを最初から試せるようにする。sandbox中は通常キーを読まない・書かない。 */}
              {!sandboxOn && (
                <button type="button"
                  onClick={() => { beginJourneySandbox(window.sessionStorage); setSandboxOn(true); setView('firstrun'); }}
                  className="w-full min-h-10 text-[11px] text-gray-400 underline text-left transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.sandboxEntry}</button>
              )}
            </>
          )}
        </div>
      )}

      {view === 'roadmap' && (
        <VocabRoadmapView t={t} repo={repo} itemById={itemById} onChanged={bump}
          onStartDiagnostic={() => setView('diagnostic')} onStartQuickReview={() => setView('quickreview')}
          onOpenDaily={() => setView('daily')} />
      )}
      {view === 'review' && (
        <Suspense fallback={<CourseChunkLoading t={t} scene="grains" />}>
          <VocabReviewPanelLazy t={t} items={items} initialItemId={itemId}
            onOpenItem={(id) => setView('review', null, id)} onBack={() => setView('top')} />
        </Suspense>
      )}
      {view === 'decisions' && (
        <Suspense fallback={<CourseChunkLoading t={t} scene="grains" />}>
          <VocabDecisionConsoleLazy t={t} onBack={() => setView('top')}
            onOpenItem={(id) => setView('detail', null, id)} />
        </Suspense>
      )}
      {view === 'firstrun' && (
        <LearnerErrorBoundary t={t} onHome={() => setView('top')} labPreview={labPreview}>
          <Suspense fallback={<CourseChunkLoading t={t} scene="grains" />}>
            <FirstRunJourneyLazy t={t} sandbox={sandboxOn} storage={store}
              onStartCheck={() => setView('diagnostic')}
              onStartPractice={() => setView('daily')}
              onHome={() => setView('top')}
              onComplete={() => setView('top')} />
          </Suspense>
        </LearnerErrorBoundary>
      )}
      {view === 'onodrafts' && (
        <Suspense fallback={<CourseChunkLoading t={t} scene="grains" />}>
          <OnoDraftsPanelLazy t={t} onBack={() => setView('top')} />
        </Suspense>
      )}
      {view === 'n3grammar' && (
        <Suspense fallback={<CourseChunkLoading t={t} scene="grains" />}>
          <N3GrammarDraftsPanelLazy t={t} onBack={() => setView('top')} />
        </Suspense>
      )}
      {view === 'adventure' && (
        <LearnerErrorBoundary t={t} onHome={() => setView('top')} labPreview={labPreview}>
          <Suspense fallback={<CourseChunkLoading t={t} scene="grains" />}>
            <Chapter1AdventurePanelLazy t={t} onBack={() => setView('top')} devTools={labPreview} />
          </Suspense>
        </LearnerErrorBoundary>
      )}
      {view === 'connectivity' && (
        <Suspense fallback={<CourseChunkLoading t={t} scene="grains" />}>
          <VocabConnectivityInspectorLazy t={t} onBack={() => setView('top')}
            onOpenItem={(id) => setView('detail', null, id)} onOpenDecisions={() => setView('decisions')} />
        </Suspense>
      )}
      {view === 'diagnostic' && (
        <VocabDiagnosticView t={t} repo={repo} itemById={itemById} items={items} journeyTask={journeyTask} onChanged={bump}
          onDone={() => {
            // Journeyから来ていれば結果を渡してStep3へ戻す（無ければ従来どおりロードマップへ）
            const pack = VOCABULARY_PACKS[0];
            const outcomes = repo.getDiagnosticOutcomes(pack.id);
            const ids = Object.keys(outcomes);
            const done = finishJourneyTask('diagnostic', {
              checkedCount: ids.length,
              independentCount: ids.filter((id) => outcomes[id] === 'basic_confirmed').length,
              supportedCount: ids.filter((id) => outcomes[id] === 'partially_confirmed').length,
              needsReviewCount: ids.filter((id) => outcomes[id] === 'remedial').length,
              partial: ids.length === 0,
            });
            if (!done) setView('roadmap');
          }} />
      )}
      {view === 'quickreview' && (
        <VocabQuickReviewView labPreview={labPreview} t={t} repo={repo} schedule={schedule} itemById={itemById} items={items}
          onChanged={bump} onDone={() => setView('top')} onTalk={onGoConversation} />
      )}
      {view === 'daily' && <DailyFlowView labPreview={labPreview} t={t} itemById={itemById} items={items} ids={daily.itemIds.filter((id) => itemById.has(id))} reasons={daily.reasons} repo={repo} schedule={schedule} journeyTask={journeyTask} onChanged={bump} onDone={() => {
        // Journeyの「最初の練習」から来ていれば結果を渡してStep4へ戻す（§7）
        const ids = daily.itemIds.filter((id) => itemById.has(id));
        const done = finishJourneyTask('practice', {
          checkedCount: ids.length,
          independentCount: ids.filter((id) => repo.getVerifiedState(id) === 'independent' || repo.getVerifiedState(id) === 'retained_candidate').length,
          supportedCount: ids.filter((id) => repo.getVerifiedState(id) === 'guided').length,
          needsReviewCount: ids.filter((id) => repo.getEntry(id).selfAssessment === 'needs_review').length,
          partial: ids.length === 0,
          // 表示は別軸のモデルで行う（合計の分解に見せない・2E-1.15 §3）
          learnerResult: buildLearnerResult(ids, repo, schedule),
        });
        if (!done) setView('top');
      }} onRestart={() => setView('daily')} />}
      {view === 'category' && category && <VocabCategoryList labPreview={labPreview} t={t} repo={repo} list={listFor(category)} query="" showSearch={false} onQuery={() => {}} onOpen={(id) => setView('detail', category, id)} />}
      {view === 'all' && <VocabCategoryList labPreview={labPreview} t={t} repo={repo} list={listFor('all')} query={query} showSearch onQuery={setQuery} onOpen={(id) => setView('detail', 'all', id)} />}
      {view === 'detail' && itemId && itemById.get(itemId) && (() => {
        const item = itemById.get(itemId)!;
        // 順次ナビの文脈（§3）: カテゴリ由来はその決定的並び順、直接URL等は同品詞カテゴリ順（§3E）
        const ctxCat: VocabCategory = category && category !== 'all' ? category
          : category === 'all' ? 'all'
          : item.partOfSpeech === 'verb' ? 'verbs' : item.partOfSpeech === 'iAdj' ? 'iAdj' : item.partOfSpeech === 'naAdj' ? 'naAdj' : 'nouns';
        const list = listFor(ctxCat);
        const idx = list.findIndex((i) => i.id === item.id);
        const nextItem = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
        const catLabel = ctxCat === 'verbs' ? tv.catVerbs : ctxCat === 'iAdj' ? tv.catIAdj : ctxCat === 'naAdj' ? tv.catNaAdj : ctxCat === 'all' ? tv.catAll : tv.catNouns;
        return (
          <>
          {/* 未処理判断がある語だけの導線（labPreview限定領域・2E-1.8 §6.2） */}
          <Suspense fallback={null}>
            <VocabDecisionBadgeLazy t={t} itemId={item.id} onOpen={() => setView('decisions')} />
          </Suspense>
          <VocabDetailView labPreview={labPreview} key={item.id} t={t} item={item} itemById={itemById} repo={repo} onChanged={bump}
            progressLabel={idx >= 0 ? tv.categoryProgress(catLabel, idx + 1, list.length) : null}
            nextItem={nextItem} backLabel={tv.backToList(catLabel)}
            onNext={() => { trackCourse('click_ai_course_vocabulary_next', { itemId: item.id }); if (nextItem) setView('detail', category, nextItem.id); else setView(ctxCat === 'all' ? 'all' : 'category', ctxCat === 'all' ? 'all' : ctxCat); }}
            onOpenItem={(id) => setView('detail', category, id)}
            onStartPractice={practiceForItem(item.id) ? () => { trackCourse('click_ai_course_vocabulary_conversation', { itemId: item.id }); setView('practice', category, item.id); } : undefined} />
          </>
        );
      })()}
      {view === 'practice' && itemId && itemById.get(itemId) && (
        <VocabPracticeView t={t} item={itemById.get(itemId)!} onDone={() => setView('detail', category, itemId)} />
      )}
    </div>
  );
};

// ── モジュールレベル部品（親再レンダーで再マウントさせない・§13 static-components） ──
import type { VocabProgressRepository } from '../../../../lib/aiLesson/course/vocabProgress';

/** 意味確認1問（決定的・誤答は同品詞の他Item訳・複数正解なし・§26） */
const meaningQuestionFor = (t: AiCourseDict, items: FoundationItem[], item: FoundationItem, seed: number): FoundationQuestion => {
  const pool = items.filter((i) => i.id !== item.id && i.partOfSpeech === item.partOfSpeech && i.meaningZh !== item.meaningZh);
  const others: string[] = [];
  let s = seed;
  while (others.length < 2 && pool.length > 0) {
    s = (s * 31 + 7) % 997;
    const cand = pool[s % pool.length].meaningZh;
    if (!others.includes(cand)) others.push(cand);
  }
  return {
    id: `vq-meaning-${item.id}`, targetItemId: item.id, dimension: 'meaning', type: 'single_choice',
    promptJa: t.vocab.meaningQuestion(item.displayForm), promptZh: t.vocab.meaningQuestion(item.displayForm),
    choices: [item.meaningZh, ...others], answerIndex: 0,
    explanationJa: `${item.displayForm}（${item.readingKana}）＝${item.meaningZh}`,
    explanationZh: `${item.displayForm}（${item.readingKana}）＝${item.meaningZh}`,
    errorTag: `vocab_meaning_${item.id}`, review: 'draft',
  };
};

const SelfAssessRow = ({ t, repo, id, onChanged, schedule }: {
  t: AiCourseDict; repo: VocabProgressRepository; id: string; onChanged: () => void;
  /** 渡された場合、自己評価を復習予定へも反映する（「覚えた」で予定は消えない・§4） */
  schedule?: VocabSpacedReviewRepository;
}) => {
  const tv = t.vocab;
  const cur = repo.getEntry(id).selfAssessment;
  const set = (sa: 'self_known' | 'needs_review') => {
    repo.setSelfAssessment(id, sa);
    if (sa === 'needs_review') schedule?.markUncertain(id);
    else schedule?.markSelfKnown(id);
    trackCourse('set_ai_course_vocabulary_self_assessment', { itemId: id, selfAssessment: sa });
    onChanged();
  };
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1.5">{tv.selfPrompt}</p>
      <div className="flex gap-2">
        <ActionButton variant="choice" selected={cur === 'self_known'} showCheck className={`flex-1 min-h-11 py-2.5 text-sm justify-center ${cur === 'self_known' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : ''}`}
          onClick={() => set('self_known')}>{tv.selfKnownBtn}</ActionButton>
        <ActionButton variant="choice" selected={cur === 'needs_review'} showCheck className={`flex-1 min-h-11 py-2.5 text-sm justify-center ${cur === 'needs_review' ? 'border-amber-400 bg-amber-50 text-amber-800' : ''}`}
          onClick={() => set('needs_review')}>{tv.needsReviewBtn}</ActionButton>
      </div>
    </div>
  );
};

const CompactCard = ({ t, repo, item, onOpen, labPreview }: { t: AiCourseDict; repo: VocabProgressRepository; item: FoundationItem; onOpen: () => void; labPreview: boolean }) => (
  <button type="button" onClick={onOpen} aria-label={item.displayForm}
    className="card-interactive w-full text-left bg-white rounded-xl border border-gray-100 p-3 flex gap-3 items-center min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
    <VocabImage item={item} asset={assetForItem(item.id)} labPreview={labPreview} lang={t.locale === 'zh' ? 'zh' : 'ja'} className="w-16 shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-base font-bold text-gray-900">{item.displayForm}</span>
        <span className="text-xs text-gray-500">{item.readingKana}</span>
      </div>
      <p className="text-xs text-gray-600 truncate">{item.meaningZh}</p>
    </div>
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{t.vocab.states[repo.getEntry(item.id).selfAssessment]}</span>
    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" aria-hidden />
  </button>
);

const VocabCategoryList = ({ t, repo, list, query, showSearch, onQuery, onOpen, labPreview }: {
  t: AiCourseDict; repo: VocabProgressRepository; list: FoundationItem[];
  query: string; showSearch: boolean; onQuery: (q: string) => void; onOpen: (id: string) => void;
  labPreview: boolean;
}) => {
  const tv = t.vocab;
  const filtered = list.filter((i) => query.trim() === '' || i.lemma.includes(query.trim()) || i.readingKana.includes(query.trim()) || i.meaningZh.includes(query.trim()));
  return (
    <div>
      {showSearch && (
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={tv.searchPlaceholder}
          aria-label={tv.searchPlaceholder} className="w-full min-h-11 px-4 py-2.5 border border-gray-200 rounded-xl text-sm mb-3" />
      )}
      <div className="space-y-2">
        {filtered.map((it) => <CompactCard key={it.id} t={t} repo={repo} item={it} onOpen={() => onOpen(it.id)} labPreview={labPreview} />)}
      </div>
      {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">{t.lab.emptyWords}</p>}
    </div>
  );
};

const VocabDetailView = ({ t, item, itemById, repo, onChanged, progressLabel, nextItem, backLabel, onNext, onOpenItem, onStartPractice, labPreview }: {
  t: AiCourseDict; item: FoundationItem; itemById: Map<string, FoundationItem>;
  repo: VocabProgressRepository; onChanged: () => void;
  progressLabel: string | null;
  nextItem: FoundationItem | null;
  backLabel: string;
  onNext: () => void;
  onOpenItem: (id: string) => void;
  onStartPractice?: () => void;
  labPreview: boolean;
}) => {
  const tv = t.vocab;
  useEffect(() => {
    repo.recordEncounter(item.id, { imageViewed: !!assetForItem(item.id) });
    trackCourse('view_ai_course_vocabulary_item', { itemId: item.id, partOfSpeech: item.partOfSpeech });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- item表示ごとに1回
  }, [item.id]);
  const antonym = item.antonymId ? itemById.get(item.antonymId) : null;
  const meta = levelMetaOf(item.id);
  const sa = repo.getEntry(item.id).selfAssessment;
  const assessed = sa === 'self_known' || sa === 'needs_review';
  // ふりがな設定の実効モード（§13: hard_only=難読のみ・off=非表示＋補助操作。リロード不要で反映）
  const furigana = repo.getSettings().furigana;
  const entry = repo.getEntry(item.id);
  const lastWrong = entry.tests.length > 0 && !entry.tests[entry.tests.length - 1].correct;
  const isWeak = sa === 'needs_review' || lastWrong || meta.cognate === 'false_friend';
  const mode: FuriganaDisplayMode = resolveFuriganaMode(furigana, { isFirstTime: entry.encounterCount <= 1, isWeak });
  const [readingOverride, setReadingOverride] = useState(false);   // 「読みを表示」補助操作（アクセシビリティ・§13）
  const effectiveMode: FuriganaDisplayMode = readingOverride ? 'all' : mode;
  const showReading = effectiveMode === 'all';
  const segments = furiganaForItem(item.id);
  const note = contentNoteOf(item.id);
  // hashアンカーへの移動（2E-1.9 §11・keyboard利用者にはfocusも移す）
  useEffect(() => {
    const h = window.location.hash;
    if (!h.startsWith('#vsec-')) return;
    const el = document.querySelector<HTMLElement>(h);
    if (el) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  const zhShort = meaningZhShortOf(item);
  const senseOverrides = senseOverridesOf(item.id);
  const Diagram = item.id === 'fi-iku' || item.id === 'fi-noru' ? NiEDirectionDiagram
    : item.id === 'fi-benkyo' || item.id === 'fi-nihongo' ? WoObjectDiagram
    : item.id === 'fi-sumu' || item.id === 'fi-hataraku' ? TeimasuTimelineDiagram : null;
  return (
    <div className="space-y-3 pb-28">
      {progressLabel && <p className="text-xs font-mono text-gray-400">{progressLabel}</p>}
      {/* セクションanchor（2E-1.9 §11: hashで意味/例文へ直接移動・focusも移動） */}
      <div id="vsec-meaning" tabIndex={-1} className="bg-white rounded-2xl border border-gray-100 p-5 focus:outline-none">
        <VocabImage item={item} asset={assetForItem(item.id)} labPreview={labPreview} lang={t.locale === 'zh' ? 'zh' : 'ja'} size="detail" className="mb-3" />
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold text-gray-900">{item.displayForm}</span>
          {showReading && <span className="text-sm text-gray-500">{item.readingKana}</span>}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{t.lab.pos[item.partOfSpeech]}</span>
          {item.verbGroup && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">{t.lab.verbGroups[item.verbGroup]}</span>}
          {/* 読み確認の補助操作（設定がoff/難読のみでも読みへ到達できる・§13） */}
          {!showReading && (
            <button type="button" onClick={() => setReadingOverride(true)}
              className="min-h-8 px-2 text-[11px] text-indigo-600 underline transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.showReadingBtn}</button>
          )}
        </div>
        {/* 中心意味を先に表示（全文の羅列をしない・§8）。第2義以降はsenses/展開で確認 */}
        <p className="text-base text-gray-800 mt-1">{zhShort}</p>
        {note?.learningFocusZh && (
          <details className="mt-2 bg-indigo-50/60 rounded-lg px-2.5 py-1.5">
            <summary className="text-[11px] font-bold text-indigo-700 cursor-pointer min-h-6 flex items-center gap-1">
              <ChevronDown className="w-3 h-3" aria-hidden />{tv.learningFocus}
            </summary>
            <p className="text-xs text-gray-700 mt-1">{note.learningFocusZh}</p>
          </details>
        )}
        {/* 中国語との関係（レビュー済み分類のみ表示・§40/§41） */}
        {meta.cognate === 'transparent_same' && <p className="text-[11px] text-sky-700 bg-sky-50 rounded-lg px-2.5 py-1.5 mt-2">{tv.cognateSame}</p>}
        {meta.cognate === 'false_friend' && (
          <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2">{tv.cognateDiff}{meta.cognateNoteZh ? `（${meta.cognateNoteZh}）` : ''}</p>
        )}
        {assessed && (
          <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1" aria-live="polite">
            <Check className="w-3.5 h-3.5" aria-hidden />{tv.states[sa]}・{tv.savedNote}
          </p>
        )}
      </div>
      <div id="vsec-examples" tabIndex={-1} className="bg-white rounded-xl border border-gray-100 p-4 focus:outline-none">
        <p className="text-xs font-bold text-gray-500 mb-1">{tv.detailUsage}</p>
        {/* 例文の構造化ふりがな（§11）。segmentsが無い語はplain textへ安全にフォールバック（§12） */}
        {segments ? (
          <p className="text-[15px] leading-7 text-gray-800"><RubySegments segments={segments} mode={effectiveMode} /></p>
        ) : (
          <p className="text-sm text-gray-800">{item.exampleJa}</p>
        )}
        <p className="text-xs text-gray-500">{item.exampleZh}</p>
        {item.commonFormsJa && item.commonFormsJa.length > 0 && (
          <p className="text-xs text-gray-600 mt-1.5">{item.commonFormsJa.slice(0, 2).map((f) => `「${f}」`).join('・')}</p>
        )}
        {item.usageNoteZh && <p className="text-xs text-amber-700 mt-1.5">💡 {item.usageNoteZh}</p>}
        {antonym && (
          <p className="text-xs text-gray-600 mt-2">{tv.antonym}: <button type="button" className="text-indigo-700 font-bold underline min-h-6 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2" onClick={() => onOpenItem(antonym.id)}>{antonym.displayForm}（{antonym.meaningZh}）</button></p>
        )}
        {/* 近似・類義関係（§24: high confidence draftのみ・最大2件で密度を上げない） */}
        {relationsForItem(item.id).slice(0, 2).map((rel) => {
          const otherId = rel.itemId === item.id ? rel.relatedItemId : rel.itemId;
          const other = itemById.get(otherId);
          if (!other) return null;
          return (
            <p key={otherId} className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5 mt-2">
              <button type="button" className="text-indigo-700 font-bold underline min-h-6 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2" onClick={() => onOpenItem(other.id)}>{other.displayForm}</button>
              ： {t.locale === 'zh' ? rel.explanationZh : rel.explanationJa}
            </p>
          );
        })}
      </div>
      {(item.senses && item.senses.length > 1) && (
        <details className="bg-white rounded-xl border border-gray-100 p-4">
          <summary className="text-xs font-bold text-gray-500 cursor-pointer min-h-6" aria-expanded="false">{tv.senses}</summary>
          <div className="mt-1 space-y-1.5">
            {item.senses.map((sn) => {
              // Sense別の中国語との関係（§7・レビュー済み=draftのみ表示。unreviewedは断定しない）
              const ov = senseOverrides.find((o) => o.senseId === sn.id && o.reviewStatus === 'draft');
              return (
                <div key={sn.id}>
                  <p className="text-xs text-gray-700">・{sn.meaningZh}{sn.noteJa ? `（${sn.noteJa}）` : ''}</p>
                  {ov && <p className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1 mt-0.5 ml-3">{ov.learningFocusZh}</p>}
                </div>
              );
            })}
          </div>
        </details>
      )}
      {Diagram && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-500 mb-1">{tv.detailStructure}</p>
          <Diagram t={t} />
        </div>
      )}
      {/* この語を使う場所（n3UnitSpecs/worldAtlasの実データのみ・架空の対応なし・B§10） */}
      {(() => {
        const links = unitLinksFor(item.id);
        if (links.length === 0) return null;
        return (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-bold text-gray-500 mb-1">{t.vocabScope.whereUsed}</p>
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.spec.unitId} className="text-xs text-gray-700">
                  {l.area ? `${l.area.nameJa.split('（')[0]}・` : ''}{t.locale === 'zh' ? l.spec.titleZh : l.spec.titleJa}
                  <span className="text-[10px] text-gray-400 ml-1">
                    {[l.isPrimary ? t.vocabScope.usedAsPrimary : null,
                      l.isEncounter ? t.vocabScope.usedAsEncounter : null,
                      l.inMission ? t.vocabScope.usedInMission : null].filter(Boolean).join('・')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
      {onStartPractice && (
        <ActionButton variant="secondary" fullWidth onClick={onStartPractice} className="text-indigo-700 border-indigo-200">
          <MessageCircle className="w-4 h-4" aria-hidden />{tv.practiceCta}
        </ActionButton>
      )}
      <p className="text-[11px] text-gray-400">{tv.notSavedVocab}</p>
      {/* Sticky Action Area（§6）: 自己評価前=2択／評価後=次のことばへ。本文と二重表示しない */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-gray-200 px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <div className="max-w-md mx-auto">
          {!assessed ? (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">{tv.selfPrompt}</p>
              <div className="flex gap-2">
                <ActionButton variant="choice" selected={false} className="flex-1 min-h-11 py-2.5 text-sm justify-center"
                  onClick={() => { repo.setSelfAssessment(item.id, 'self_known'); trackCourse('set_ai_course_vocabulary_self_assessment', { itemId: item.id, selfAssessment: 'self_known' }); onChanged(); }}>
                  {tv.selfKnownBtn}
                </ActionButton>
                <ActionButton variant="choice" selected={false} className="flex-1 min-h-11 py-2.5 text-sm justify-center"
                  onClick={() => { repo.setSelfAssessment(item.id, 'needs_review'); trackCourse('set_ai_course_vocabulary_self_assessment', { itemId: item.id, selfAssessment: 'needs_review' }); onChanged(); }}>
                  {tv.needsReviewBtn}
                </ActionButton>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex gap-2 mb-1.5">
                <ActionButton variant="choice" selected={sa === 'self_known'} showCheck className="flex-1 min-h-9 py-1.5 text-xs justify-center"
                  onClick={() => { repo.setSelfAssessment(item.id, 'self_known'); onChanged(); }}>{tv.selfKnownBtn}</ActionButton>
                <ActionButton variant="choice" selected={sa === 'needs_review'} showCheck className="flex-1 min-h-9 py-1.5 text-xs justify-center"
                  onClick={() => { repo.setSelfAssessment(item.id, 'needs_review'); onChanged(); }}>{tv.needsReviewBtn}</ActionButton>
              </div>
              <ActionButton variant="primary" fullWidth onClick={onNext} aria-live="polite">
                {nextItem ? tv.nextWord : backLabel}<ArrowRight className="w-4 h-4" aria-hidden />
              </ActionButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** 1語の中の段階順（PhaseTrailの現在位置算出に使う） */
const PHASE_ORDER = ['card', 'quiz', 'assess'] as const;

const DailyFlowView = ({ t, items, itemById, ids, reasons, repo, schedule, journeyTask, onChanged, onDone, onRestart, labPreview }: {
  t: AiCourseDict; items: FoundationItem[]; itemById: Map<string, FoundationItem>;
  ids: string[]; reasons: Record<string, string>;
  repo: VocabProgressRepository;
  /** 今日のことばの結果も間隔反復へ入れる（2E-1.13で接続。これがないと復習予定が生まれない） */
  schedule: VocabSpacedReviewRepository;
  /** 再開位置の保存先（2E-1.14 §3・確定した操作だけを書く） */
  journeyTask: JourneyTaskRepository;
  onChanged: () => void; onDone: () => void; onRestart: () => void;
  labPreview: boolean;
}) => {
  const tv = t.vocab; const zh = t.locale === 'zh';
  // 再開位置は契約から復元する（再読込しても済んだフェーズをやり直させない・§4）
  const saved = journeyTask.get();
  const resume = saved?.activeTaskType === 'practice' && saved.activeTaskStatus !== 'completed'
    ? saved.taskProgress : undefined;
  const [idx, setIdx] = useState(() => (resume && resume.wordIndex < ids.length ? resume.wordIndex : 0));
  const [phase, setPhase] = useState<'card' | 'quiz' | 'assess'>(() => (resume?.phase ?? 'card'));
  /** 確定した操作のあとだけ呼ぶ（未確定の選択は保存しない） */
  const saveProgress = (wordIndex: number, ph: 'card' | 'quiz' | 'assess') => {
    journeyTask.saveProgress({
      wordIndex, phase: ph,
      completedWordIds: ids.slice(0, wordIndex),
      totalWords: ids.length,
    });
  };
  const [picked, setPicked] = useState<number | null>(null);
  const [judged, setJudged] = useState<boolean | null>(null);
  if (ids.length === 0) return <p className="text-sm text-gray-400 text-center py-8">{tv.emptyReview}</p>;
  if (idx >= ids.length) {
    // 完了画面（§3A: 確認した3語＋状態＋第一CTA一つ＋補助CTA）
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-base font-bold text-gray-900 mb-1">{tv.dailyDone}</p>
        <p className="text-sm text-gray-600 mb-3">{tv.dailyDoneBody}</p>
        <div className="space-y-1.5 mb-4">
          {ids.map((id) => {
            const it = itemById.get(id);
            const sa = repo.getEntry(id).selfAssessment;
            return it ? (
              <p key={id} className="text-sm text-gray-800 flex justify-between">
                <span>{it.displayForm} <span className="text-xs text-gray-400">{it.meaningZh}</span></span>
                <span className="text-xs text-gray-500">{tv.states[sa]}</span>
              </p>
            ) : null;
          })}
        </div>
        <ActionButton variant="primary" fullWidth onClick={() => { trackCourse('complete_ai_course_daily_words'); onDone(); }}>{tv.dailyFinish}</ActionButton>
        <ActionButton variant="ghost" fullWidth className="mt-1" onClick={() => { setIdx(0); setPhase('card'); setPicked(null); setJudged(null); onRestart(); }}>{tv.dailyAgain}</ActionButton>
        <p className="text-[11px] text-gray-400 mt-3">{tv.notSavedVocab}</p>
      </div>
    );
  }
  const item = itemById.get(ids[idx])!;
  const isLast = idx === ids.length - 1;
  const imgQ = buildImageToWordQuestion(item, assetForItem(item.id), items, idx + 11, labPreview);
  const q = imgQ ?? meaningQuestionFor(t, items, item, idx + 11);
  const order = shuffledChoicesSeeded(q, idx + 3);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-500">{tv.reasons[reasons[item.id]] ?? ''}</span>
        <span className="text-xs font-mono text-gray-400">{tv.dailyStep(idx + 1, ids.length)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2" role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={ids.length}>
        <div className="h-full bg-indigo-500 rounded-full motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${Math.round(((idx + 1) / ids.length) * 100)}%` }} />
      </div>
      {/* 語の中の3段階。「何問目か」だけでは今の一歩が見えないので併記する（2E-1.13） */}
      <PhaseTrail ariaLabel={tv.dailyPhaseLabel} currentIndex={PHASE_ORDER.indexOf(phase)}
        phases={[tv.dailyPhaseSee, tv.dailyPhaseTry, tv.dailyPhaseReflect]} />
      {phase === 'card' && (
        // 視線の順路: 絵 → ことば → 読み → 意味 → 例文 → 次へ。区切り線で塊を分ける
        <div key={item.id} className="motion-safe:animate-[pageFadeIn_260ms_ease-out]">
          <VocabImage item={item} asset={assetForItem(item.id)} labPreview={labPreview} lang={t.locale === 'zh' ? 'zh' : 'ja'} size="detail" className="mb-3" />
          <p className="text-[28px] leading-tight font-bold text-gray-900">{item.displayForm}</p>
          <p className="text-sm text-gray-500 mt-0.5">{item.readingKana}</p>
          <p className="text-base text-gray-800 mt-2 pb-3 border-b border-gray-100">{item.meaningZh}</p>
          <p className="text-xs text-gray-600 mt-3 leading-relaxed">{item.exampleJa}</p>
          <p className="text-xs text-gray-400 leading-relaxed">{item.exampleZh}</p>
          {item.usageNoteZh && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 mt-2">💡 {item.usageNoteZh}</p>
          )}
          <ActionButton variant="primary" fullWidth className="mt-4"
            onClick={() => { repo.recordEncounter(item.id, { imageViewed: true }); setPhase('quiz'); saveProgress(idx, 'quiz'); onChanged(); }}>{tv.detailCheck}</ActionButton>
        </div>
      )}
      {phase === 'quiz' && (
        <div>
          {q.type === 'image_to_word' && <VocabImage item={item} asset={assetForItem(item.id)} labPreview={labPreview} lang={t.locale === 'zh' ? 'zh' : 'ja'} decorative size="detail" className="mb-3" />}
          <p className="text-sm font-bold text-gray-900 mb-3">{zh ? q.promptZh : q.promptJa}</p>
          <div className="space-y-2">
            {order.map((orig) => (
              <ActionButton key={orig} variant="choice" fullWidth selected={picked === orig} showCheck={judged === null}
                disabled={judged !== null}
                className={judged !== null && orig === q.answerIndex ? 'border-emerald-400 bg-emerald-50' : ''}
                onClick={() => setPicked(orig)}>
                <span className="flex-1">{q.choices![orig]}</span>
                {judged !== null && orig === q.answerIndex && <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />}
              </ActionButton>
            ))}
          </div>
          {judged === null ? (
            <ActionButton variant="primary" fullWidth className="mt-3" disabled={picked === null}
              onClick={() => {
                const ok = picked === q.answerIndex;
                setJudged(ok);
                repo.recordTest(item.id, 'meaning', ok);
                // 誤答→翌日・自力正解→7日後。同日の再正解では段階を進めない（vocabSpacedReview側で担保）
                schedule.recordResult({ itemId: item.id, result: ok ? 'independent' : 'wrong', dimension: 'meaning', source: 'daily' });
                onChanged();
              }}>{t.lab.check}</ActionButton>
          ) : (
            <div className="mt-3" aria-live="polite">
              <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-gray-700'}`}>{judged ? t.lab.correct : t.lab.notYet}</p>
              <p className="text-xs text-gray-600 mt-1">{zh ? q.explanationZh : q.explanationJa}</p>
              <ActionButton variant="primary" fullWidth className="mt-3"
                onClick={() => { setPhase('assess'); saveProgress(idx, 'assess'); }}>{t.lab.next}<ArrowRight className="w-4 h-4" aria-hidden /></ActionButton>
            </div>
          )}
        </div>
      )}
      {phase === 'assess' && (
        <div>
          <p className="text-lg font-bold text-gray-900 mb-0.5">{item.displayForm} <span className="text-sm font-normal text-gray-500">{item.readingKana}</span></p>
          <p className="text-sm text-gray-700 mb-3">{item.meaningZh}</p>
          <SelfAssessRow t={t} repo={repo} id={item.id} onChanged={onChanged} schedule={schedule} />
          {(repo.getEntry(item.id).selfAssessment === 'self_known' || repo.getEntry(item.id).selfAssessment === 'needs_review') && (
            <ActionButton variant="primary" fullWidth className="mt-3" aria-live="polite"
              onClick={() => { setIdx(idx + 1); setPhase('card'); setPicked(null); setJudged(null); saveProgress(idx + 1, 'card'); }}>
              {isLast ? tv.dailyCompleteCta : tv.nextWord}<ArrowRight className="w-4 h-4" aria-hidden />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
};

/** 語彙会話練習（スクリプト版・§8-§12）: 対象語と本当に接続する決定的練習。
 * LLM接続は通常会話セッション（履歴・利用上限）と分離できるEdge設計が必要なためPhase 2E（docs参照）。
 * 保存なし・通常会話/週進行/XPへ一切書かない。 */
const VocabPracticeView = ({ t, item, onDone }: { t: AiCourseDict; item: FoundationItem; onDone: () => void }) => {
  const tv = t.vocab; const zh = t.locale === 'zh';
  const practice = practiceForItem(item.id);
  const [phase, setPhase] = useState<'intro' | 'chat'>('intro');
  const [turns, setTurns] = useState<{ role: 'ai' | 'user'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [usedTarget, setUsedTarget] = useState(false);
  const [closed, setClosed] = useState(false);
  if (!practice) { onDone(); return null; }
  const target = practice.targetExpressions[0];
  const start = () => {
    trackCourse('start_ai_course_vocabulary_conversation', { itemId: item.id });
    setTurns([{ role: 'ai', text: zh ? practice.starterQuestionZh : practice.starterQuestionJa }]);
    setPhase('chat');
  };
  const send = (text: string) => {
    if (!text.trim() || closed) return;
    const hit = practice.targetExpressions.some((e) => text.includes(e.replace('〜', '')));
    const next: { role: 'ai' | 'user'; text: string }[] = [...turns, { role: 'user', text }];
    if (hit && !usedTarget) {
      setUsedTarget(true);
      next.push({ role: 'ai', text: tv.practiceUsedTarget(target) });
      next.push({ role: 'ai', text: zh ? practice.followUpQuestionZh : practice.followUpQuestionJa });
    } else if (hit && usedTarget) {
      next.push({ role: 'ai', text: tv.practiceClose });
      setClosed(true);
      trackCourse('complete_ai_course_vocabulary_conversation', { itemId: item.id });
    } else {
      next.push({ role: 'ai', text: tv.practiceTryTarget(target) });
    }
    setTurns(next);
    setInput('');
  };
  return (
    <div className="space-y-3">
      {phase === 'intro' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-base font-bold text-gray-900 mb-1">{tv.practiceTitle(item.displayForm)}</p>
          <p className="text-xs text-gray-500">{tv.practiceTheme}</p>
          <p className="text-sm text-gray-800 mb-2">{zh ? practice.themeZh : practice.themeJa}</p>
          <p className="text-xs text-gray-500">{tv.practiceFirstQ}</p>
          <p className="text-sm text-gray-800 mb-2">{zh ? practice.starterQuestionZh : practice.starterQuestionJa}</p>
          <p className="text-[11px] text-gray-400 mb-3">{t.lab.aboutMinutes(practice.estimatedMinutes)}</p>
          <ActionButton variant="primary" fullWidth onClick={start}>{tv.practiceStart}</ActionButton>
          <p className="text-[11px] text-gray-400 mt-2">{tv.practiceNote}</p>
        </div>
      )}
      {phase === 'chat' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="space-y-2 mb-3" aria-live="polite">
            {turns.map((m, i) => (
              <p key={i} className={`text-sm px-3 py-2 rounded-xl max-w-[85%] ${m.role === 'ai' ? 'bg-indigo-50 text-gray-800' : 'bg-gray-100 text-gray-800 ml-auto'}`}>{m.text}</p>
            ))}
          </div>
          {!closed && (
            <div>
              <p className="text-[11px] text-gray-500 mb-1.5">{tv.practiceYourTurn}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(zh ? practice.supportExpressionsZh : practice.supportExpressionsJa).map((e2, i) => (
                  <button key={i} type="button" onClick={() => setInput(practice.supportExpressionsJa[i] ?? e2)}
                    className="min-h-9 px-2.5 py-1 text-xs rounded-lg border border-indigo-100 text-indigo-700 bg-indigo-50/60 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{e2}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={input} onChange={(e2) => setInput(e2.target.value)}
                  onKeyDown={(e2) => { if (e2.key === 'Enter' && !e2.nativeEvent.isComposing) send(input); }}
                  placeholder={tv.practiceInput} aria-label={tv.practiceInput}
                  className="flex-1 min-h-11 px-3 py-2 border border-gray-300 rounded-xl text-sm" />
                <ActionButton variant="primary" className="min-h-11 px-4 py-2 text-sm" onClick={() => send(input)}>{tv.practiceSend}</ActionButton>
              </div>
            </div>
          )}
          {closed && <ActionButton variant="primary" fullWidth className="mt-2" onClick={onDone}>{tv.practiceDone}</ActionButton>}
        </div>
      )}
    </div>
  );
};


const PackCard = ({ t, repo, pack, isCurrent }: { t: AiCourseDict; repo: VocabProgressRepository; pack: VocabularyPackT; isCurrent: boolean }) => {
  const tv = t.vocab; const zh = t.locale === 'zh';
  const pp = computePackProgress(pack, repo);
  const cover = pack.coverAssetId ? assetById(pack.coverAssetId) : undefined;
  return (
    <div className={`rounded-2xl border p-4 ${isCurrent ? 'bg-white border-indigo-200' : 'bg-gray-50/60 border-gray-100'}`}>
      {cover && isVisibleAsset(cover, true) && cover.filePath && (
        <img src={cover.thumbnailPath ?? cover.filePath} alt={cover.altJa} loading="lazy" width={cover.width ?? 400} height={cover.height ?? 300}
          className="w-full rounded-xl mb-2 object-cover" style={{ aspectRatio: '4 / 3' }} />
      )}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-400">{isCurrent ? tv.packHeading : tv.nextPackHeading}</p>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tv.packStates[pp.state]}</span>
      </div>
      <p className="text-sm font-bold text-gray-900">{zh ? pack.titleZh : pack.titleJa}</p>
      <p className="text-xs text-gray-500 mt-0.5">{zh ? pack.descriptionZh : pack.descriptionJa}</p>
      {pack.id === 'pack-n3-prep-1' && <p className="text-[10px] text-gray-400 mt-1">{tv.n3PackNote}</p>}
      {isCurrent && (
        <div className="mt-2 space-y-1.5">
          {/* 学習開始と問題確認は別バー（§21・混ぜない） */}
          <div>
            <p className="text-[10px] text-gray-500 flex justify-between"><span>{tv.statStarted}</span><span>{pp.seenCount} / {pp.totalCount}</span></p>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pp.totalCount ? Math.round((pp.seenCount / pp.totalCount) * 100) : 0}%` }} /></div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 flex justify-between"><span>{tv.statVerifiedLabel}</span><span>{pp.verifiedCount} / {pp.totalCount}</span></p>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-teal-500 rounded-full" style={{ width: `${pp.totalCount ? Math.round((pp.verifiedCount / pp.totalCount) * 100) : 0}%` }} /></div>
          </div>
          <p className="text-[10px] text-gray-500">{tv.statRetainedLabel}: {pp.retainedCandidateCount}・{tv.statRemaining}: {pp.remainingCount}</p>
        </div>
      )}
    </div>
  );
};

/** ロードマップの旅ステップ（§24・モジュールレベル・ロック乱発なし） */
const RoadmapStep = ({ label, why, done, active, children }: {
  label: string; why?: string; done?: boolean; active?: boolean; children: React.ReactNode;
}) => (
  <div className="relative pl-6 pb-4 last:pb-0">
    {/* 縦タイムラインの接続線とノード */}
    <span className="absolute left-[7px] top-5 bottom-0 w-px bg-indigo-100" aria-hidden />
    <span className={`absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-2 ${done ? 'bg-indigo-500 border-indigo-500' : active ? 'bg-white border-indigo-500' : 'bg-white border-gray-200'}`} aria-hidden />
    <p className={`text-[11px] font-bold ${active ? 'text-indigo-700' : 'text-gray-400'}`}>{label}</p>
    {/* なぜこのステップか（§20・1行だけ） */}
    {why && <p className="text-[11px] text-gray-400 mb-1">{why}</p>}
    {!why && <span className="block mb-1" />}
    {children}
  </div>
);

/** 語彙ロードマップ（§24: 目標→パック→診断→毎日→確認→定着→次 の旅として表示・状態を混ぜない） */
const VocabRoadmapView = ({ t, repo, itemById, onChanged, onStartDiagnostic, onStartQuickReview, onOpenDaily }: {
  t: AiCourseDict; repo: VocabProgressRepository; itemById: Map<string, FoundationItem>; onChanged: () => void;
  onStartDiagnostic: () => void; onStartQuickReview: () => void; onOpenDaily: () => void;
}) => {
  const tv = t.vocab;
  const track = repo.getSettings().track as VocabularyTrack;
  const current = currentPackForTrack(track);
  const next = nextPackForTrack(track);
  useEffect(() => { trackCourse('view_ai_course_vocabulary_roadmap', { goal: track }); }, [track]);
  const diagLeft = pickDiagnosticItems(current, track, itemById, repo).length;
  const quickLeft = pickQuickReviewItems(current.itemIds, repo).length;
  const pp = computePackProgress(current, repo);
  const steps = tv.roadmapSteps;
  return (
    <div className="space-y-1">
      <RoadmapStep label={steps.goal} active done={false}>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-gray-900">{tv.tracks[track] ?? tv.tracks.life_basic}</p>
            <select aria-label={tv.changeGoal} value={track}
              onChange={(e) => { repo.setSettings({ track: e.target.value }); trackCourse('select_ai_course_vocabulary_goal', { goal: e.target.value }); onChanged(); }}
              className="min-h-9 text-xs border border-gray-200 rounded-lg px-2 text-gray-600">
              {Object.entries(tv.tracks).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          {(track === 'n2_prep') && <p className="text-[11px] text-gray-500 mt-1.5">{tv.n2Note}</p>}
        </div>
      </RoadmapStep>
      <RoadmapStep label={steps.pack} active done={pp.state !== 'not_started'}>
        <PackCard t={t} repo={repo} pack={current} isCurrent />
      </RoadmapStep>
      <RoadmapStep label={steps.diagnostic} why={tv.roadmapStepWhy.diagnostic} active={diagLeft > 0} done={diagLeft === 0}>
        {diagLeft > 0
          ? <ActionButton variant="primary" fullWidth onClick={onStartDiagnostic}>{tv.diagnosticCta}（{diagLeft}）</ActionButton>
          : <p className="text-xs text-gray-400">{tv.outcomes.basic_confirmed}・{tv.outcomes.partially_confirmed}・{tv.outcomes.remedial}</p>}
      </RoadmapStep>
      <RoadmapStep label={steps.learn} why={tv.roadmapStepWhy.learn} active done={pp.state === 'seen_all' || pp.state === 'verifying' || pp.state === 'retention_check'}>
        <ActionButton variant="secondary" fullWidth onClick={onOpenDaily}>{tv.dailyCta}</ActionButton>
      </RoadmapStep>
      <RoadmapStep label={steps.verify} why={tv.roadmapStepWhy.verify} active={quickLeft > 0} done={pp.state === 'verifying' || pp.state === 'retention_check'}>
        <ActionButton variant="secondary" fullWidth disabled={quickLeft === 0} onClick={onStartQuickReview}>
          {quickLeft > 0 ? tv.quickReviewChip(quickLeft) : tv.quickReviewEmpty}
        </ActionButton>
      </RoadmapStep>
      <RoadmapStep label={steps.retention} why={tv.roadmapStepWhy.retention} done={pp.retainedCandidateCount > 0}>
        <p className="text-xs text-gray-600">{tv.statRetainedLabel}: {pp.retainedCandidateCount}</p>
      </RoadmapStep>
      {next && (
        <RoadmapStep label={steps.next}>
          {/* 次のパックは説明のみ・クリック不可（ロックバッジを乱発しない・§24） */}
          <PackCard t={t} repo={repo} pack={next} isCurrent={false} />
          <p className="text-[11px] text-gray-400 mt-1">{tv.roadmapNextNote}</p>
        </RoadmapStep>
      )}
      <p className="text-[11px] text-gray-400 pt-2">{tv.notSavedVocab}</p>
    </div>
  );
};

/** パック開始診断（§4-§6・タップ式・次元別記録。読み問題では対象語の読みを事前に出さない） */
const VocabDiagnosticView = ({ t, repo, itemById, items, journeyTask, onChanged, onDone }: {
  t: AiCourseDict; repo: VocabProgressRepository; itemById: Map<string, FoundationItem>; items: FoundationItem[];
  /** 再開情報の保存先（2E-1.14 §4・途中で再読込しても同じ問題を続けられるようにする） */
  journeyTask: JourneyTaskRepository;
  onChanged: () => void; onDone: () => void;
}) => {
  const tv = t.vocab; const zh = t.locale === 'zh';
  const track = repo.getSettings().track as VocabularyTrack;
  const pack = currentPackForTrack(track);
  // 中断した診断があれば同じ問題で再開する。無ければ新しいセットを作る。
  // セットは学習記録から作られるため、回答が増えたあとに作り直すと別の問題になってしまう。
  const savedDiagnostic = (() => {
    const c = journeyTask.get();
    if (!c || c.activeTaskType !== 'diagnostic' || c.activeTaskStatus === 'completed') return null;
    const d = c.taskProgress?.diagnostic;
    return d && d.questions.length > 0 ? d : null;
  })();
  const [setQs] = useState<DiagnosticSetQuestion[]>(
    () => savedDiagnostic?.questions ?? buildDiagnosticSet(pack, track, itemById, repo, items));
  const [idx, setIdx] = useState(savedDiagnostic?.index ?? 0);
  const [picked, setPicked] = useState<number | null>(null);
  const [judged, setJudged] = useState<boolean | null>(null);
  useEffect(() => { trackCourseOnce('start_ai_course_vocabulary_diagnostic'); }, []);
  // 問題が1問も作れない場合は学習を止めず、代替の練習へ誘導する（2E-1.11 §7）
  if (setQs.length === 0 && !repo.getDiagnosticOutcomes(pack.id)) {
    return <LearnerRecovery t={t} kind="empty_pool" onHome={onDone} onAlternative={onDone} />;
  }
  if (setQs.length === 0 || idx >= setQs.length) {
    // 結果はRepositoryの導出値から表示（ローカルカウントの二重管理をしない・§6）
    const outcomes = repo.getDiagnosticOutcomes(pack.id);
    const itemIds = Array.from(new Set(setQs.map((x) => x.itemId)));
    const count = (o: DiagnosticOutcome) => itemIds.filter((id) => outcomes[id] === o).length;
    const dims = Array.from(new Set(setQs.map((x) => x.vocabDimension)));
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-base font-bold text-gray-900 mb-2">{tv.diagnosticDone}</p>
        <p className="text-xs font-bold text-gray-500 mb-1">{tv.diagnosticResultHeading}</p>
        <div className="space-y-1 mb-2">
          {dims.map((d) => {
            const inDim = setQs.filter((x) => x.vocabDimension === d);
            const ok = inDim.filter((x) => {
              const e = repo.getDiagnosticEntry(pack.id, x.itemId);
              return e?.dims[d] === 'confirmed' || e?.dims[d] === 'supported';
            }).length;
            return <p key={d} className="text-xs text-gray-700 flex justify-between"><span>{tv.diagDims[d]}</span><span>{ok} / {inDim.length}</span></p>;
          })}
        </div>
        <p className="text-sm text-gray-700">{tv.diagnosticBasic(count('basic_confirmed'))}</p>
        <p className="text-sm text-gray-700">{tv.diagnosticPartial(count('partially_confirmed'))}</p>
        <p className="text-sm text-gray-700 mb-1">{tv.diagnosticRemedial(count('remedial'))}</p>
        <p className="text-[11px] text-gray-400 mb-3">{tv.outcomeNote}</p>
        <ActionButton variant="primary" fullWidth onClick={() => {
          trackCourse('complete_ai_course_vocabulary_diagnostic', { goal: track });
          for (const d of dims) trackCourse('complete_ai_course_vocabulary_diagnostic_dimension', { dimension: d });
          onDone();
        }}>{tv.backToVocabTop}</ActionButton>
        <p className="text-[11px] text-gray-400 mt-2">{tv.notSavedVocab}</p>
      </div>
    );
  }
  const { itemId: curItemId, vocabDimension, q } = setQs[idx];
  const item = itemById.get(curItemId)!;
  const order = shuffledChoicesSeeded(q, idx + 7);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-500">{tv.diagnosticIntro}</span>
        <span className="text-xs font-mono text-gray-400">{idx + 1} / {setQs.length}</span>
      </div>
      <p className="text-[10px] font-bold text-indigo-500 mb-1">{tv.diagDims[vocabDimension]}</p>
      <p className="text-sm font-bold text-gray-900 mb-3">{zh ? q.promptZh : q.promptJa}</p>
      <div className="space-y-2">
        {order.map((orig) => (
          <ActionButton key={orig} variant="choice" fullWidth selected={picked === orig} showCheck={judged === null} disabled={judged !== null}
            className={judged !== null && orig === q.answerIndex ? 'border-emerald-400 bg-emerald-50' : ''}
            onClick={() => setPicked(orig)}>
            <span className="flex-1">{q.choices![orig]}</span>
          </ActionButton>
        ))}
      </div>
      {judged === null ? (
        <ActionButton variant="primary" fullWidth className="mt-3" disabled={picked === null}
          onClick={() => {
            const ok = picked === q.answerIndex;
            setJudged(ok);
            const outcome = applyDiagnosticAnswer(repo, pack.id, item.id, vocabDimension, ok);
            if (ok) repo.recordEncounter(item.id);
            // 確定した回答の分だけ再開位置を進める（未確定の選択は保存しない）
            journeyTask.saveProgress({
              wordIndex: 0, phase: 'card', completedWordIds: [],
              diagnostic: { index: idx + 1, questions: setQs },
            });
            trackCourse('answer_ai_course_vocabulary_diagnostic', { dimension: vocabDimension, outcome });
            onChanged();
          }}>{t.lab.check}</ActionButton>
      ) : (
        <div className="mt-3" aria-live="polite">
          {/* 次元別の結果表示（「習得済み」とは言わない・§4） */}
          <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-gray-700'}`}>
            {tv.diagDims[vocabDimension]}: {judged ? tv.dimStates.confirmed : tv.dimStates.needs_review}
          </p>
          <p className="text-xs text-gray-600 mt-1">{zh ? q.explanationZh : q.explanationJa}</p>
          <ActionButton variant="primary" fullWidth className="mt-3" onClick={() => { setIdx(idx + 1); setPicked(null); setJudged(null); }}>{t.lab.next}</ActionButton>
        </div>
      )}
    </div>
  );
};

/** 3分復習（§25・弱点だけ3〜7問・同じItemの別形式可） */
/**
 * 学習完了画面（Phase 2E-1.10 §16-§17）。
 * 「今日できたこと」と「次回の復習予定」を示し、一覧へ戻すだけにしない。
 * 内部state名（day1 / retention_candidate 等）は表示しない。第一CTAは一つ。
 */
const LearningCompletionView = ({ t, schedule, itemById, results, onFinish, onTalk, onAgain }: {
  t: AiCourseDict; schedule: VocabSpacedReviewRepository; itemById: Map<string, FoundationItem>;
  results: { itemId: string; correct: boolean }[];
  onFinish: () => void; onTalk?: () => void; onAgain?: () => void;
}) => {
  const tv = t.vocab;
  useEffect(() => { trackCourseOnce('view_ai_course_learning_completion'); }, []);
  const checked = new Set(results.map((r) => r.itemId)).size;
  const uncertain = results.filter((r) => !r.correct);
  const summary = schedule.getDueSummary();
  // 明日もう一度確認する語の代表（1語だけ具体名を出す・情報を並べすぎない・§17）
  const tomorrowWord = results.map((r) => schedule.get(r.itemId))
    .find((e) => e && e.reviewStage === 'day1');
  const tomorrowName = tomorrowWord ? itemById.get(tomorrowWord.itemId)?.displayForm : undefined;
  const hasSchedule = summary.upcoming.tomorrow + summary.upcoming.inThreeDays + summary.upcoming.inSevenDays > 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5" aria-live="polite">
      {/* 見出しの横に絵を置き、視線の起点を作る（CEO指示・2E-1.13） */}
      <div className="flex items-center gap-3 mb-2">
        <DoneIllustration />
        <h3 className="text-base font-bold text-gray-900 leading-snug">{tv.completionTitle}</h3>
      </div>
      <ul className="text-sm text-gray-700 space-y-1 mb-2">
        <li>・{tv.completionChecked(checked)}</li>
        {uncertain.length > 0 && <li>・{tv.completionUncertain(uncertain.length)}</li>}
      </ul>
      {/* 数字と同じ内容を棒でも示す（図が読めなくても文章で分かる） */}
      <div className="mb-3">
        <ResultBars total={checked} bars={[
          // ラベルはStep4と統一（どちらもクイズ正誤由来・2026-07-28 CEO承認の軽微修正）
          { label: tv.lrBarCorrect, count: checked - uncertain.length, tone: 'good' },
          { label: tv.lrBarIncorrect, count: uncertain.length, tone: 'review' },
        ]} />
      </div>
      {/* 次回予定（日付を並べすぎない・学習を強制する印象にしない・§17） */}
      <div className="bg-indigo-50/60 rounded-xl p-3 mb-4">
        <p className="text-xs font-bold text-indigo-800 mb-1">{tv.completionNextHeading}</p>
        {hasSchedule ? (
          <>
            {tomorrowName && <p className="text-sm text-gray-800">{tv.completionNextWord(tomorrowName)}</p>}
            <p className="text-xs text-gray-600 mt-1">
              {[summary.upcoming.tomorrow > 0 ? tv.completionNextTomorrow(summary.upcoming.tomorrow) : null,
                summary.upcoming.inThreeDays > 0 ? tv.completionNextThree(summary.upcoming.inThreeDays) : null,
                summary.upcoming.inSevenDays > 0 ? tv.completionNextSeven(summary.upcoming.inSevenDays) : null]
                .filter(Boolean).join('・')}
            </p>
          </>
        ) : <p className="text-xs text-gray-500">{tv.completionNoSchedule}</p>}
        {hasSchedule && (
          <ReviewTimeline todayLabel={tv.frTimelineToday} points={[
            { label: tv.frTimelineTomorrow, count: summary.upcoming.tomorrow, emphasis: true },
            { label: tv.frTimelineThree, count: summary.upcoming.inThreeDays },
            { label: tv.frTimelineSeven, count: summary.upcoming.inSevenDays },
          ]} />
        )}
      </div>
      {/* 第一CTAは一つ（§16）。補助CTAは弱いスタイル */}
      <ActionButton variant="primary" fullWidth
        onClick={() => { trackCourse('click_ai_course_completion_next_action', { action: 'finish' }); onFinish(); }}>
        {tv.completionFinish}
      </ActionButton>
      <div className="flex flex-wrap gap-2 mt-2">
        {onTalk && (
          <button type="button" className="flex-1 min-h-10 px-3 text-xs text-indigo-700 border border-indigo-100 rounded-xl action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            onClick={() => { trackCourse('click_ai_course_completion_next_action', { action: 'talk' }); onTalk(); }}>
            {tv.completionTalk}
          </button>
        )}
        {onAgain && (
          <button type="button" className="flex-1 min-h-10 px-3 text-xs text-gray-600 border border-gray-200 rounded-xl action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            onClick={() => { trackCourse('click_ai_course_completion_next_action', { action: 'again' }); onAgain(); }}>
            {tv.completionAgain}
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">{tv.notSavedVocab}</p>
    </div>
  );
};

const VocabQuickReviewView = ({ t, repo, schedule, itemById, items, onChanged, onDone, onTalk, labPreview }: {
  t: AiCourseDict; repo: VocabProgressRepository; schedule: VocabSpacedReviewRepository;
  itemById: Map<string, FoundationItem>; items: FoundationItem[];
  onChanged: () => void; onDone: () => void; onTalk?: () => void;
  labPreview: boolean;
}) => {
  const tv = t.vocab; const zh = t.locale === 'zh';
  // 期限が来た復習を優先し、足りない分を従来の弱点候補で補う（空画面にしない・§6）
  const ids = useMemo(() => {
    const due = schedule.getDue().map((d) => d.itemId).filter((id) => itemById.has(id));
    const fallback = pickQuickReviewItems(items.map((i) => i.id), repo).filter((id) => itemById.has(id));
    return [...new Set([...due, ...fallback])];
  }, [items, itemById, repo, schedule]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [judged, setJudged] = useState<boolean | null>(null);
  const [done, setDone] = useState<{ itemId: string; correct: boolean }[]>([]);
  useEffect(() => { trackCourseOnce('start_ai_course_daily_review'); }, []);
  // 空でも行き止まりにしない（P2-11）: 理由と次の行動を必ず示す
  if (ids.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-sm text-gray-600">{tv.quickReviewEmpty}</p>
        <p className="text-xs text-gray-400 mt-1 mb-3">{tv.quickReviewEmptyHint}</p>
        <div className="space-y-2">
          <button type="button" onClick={onDone}
            className="w-full min-h-11 px-4 bg-teal-600 text-white rounded-xl font-bold text-sm action-raised action-emerald touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.quickReviewEmptyBack}</button>
          {onTalk && (
            <button type="button" onClick={onTalk}
              className="w-full min-h-11 px-4 bg-white border border-teal-200 text-teal-700 rounded-xl font-bold text-sm action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tv.quickReviewEmptyTalk}</button>
          )}
        </div>
      </div>
    );
  }
  if (idx >= ids.length) {
    return <LearningCompletionView t={t} schedule={schedule} itemById={itemById} results={done}
      onFinish={() => { trackCourse('complete_ai_course_daily_review'); onDone(); }}
      onTalk={onTalk} onAgain={() => { setIdx(0); setDone([]); setPicked(null); setJudged(null); }} />;
  }
  const item = itemById.get(ids[idx])!;
  // 弱点軸を維持: 前回readingを誤答→読み形式、それ以外は意味/画像形式（§25）
  const lastWrongReading = item && repo.getEntry(item.id).tests.slice().reverse().find((x) => !x.correct)?.dimension === 'reading';
  const imgQ = !lastWrongReading ? buildImageToWordQuestion(item, assetForItem(item.id), items, idx + 23, labPreview) : null;
  const q = imgQ ?? buildDiagnosticQuestion(item, items, lastWrongReading ? 1 : 0);
  const order = shuffledChoicesSeeded(q, idx + 13);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-500">{tv.quickReviewCta}</span>
        <span className="text-xs font-mono text-gray-400">{idx + 1} / {ids.length}</span>
      </div>
      {q.type === 'image_to_word' && <VocabImage item={item} asset={assetForItem(item.id)} labPreview={labPreview} lang={t.locale === 'zh' ? 'zh' : 'ja'} decorative size="detail" className="mb-3" />}
      <p className="text-sm font-bold text-gray-900 mb-3">{zh ? q.promptZh : q.promptJa}</p>
      <div className="space-y-2">
        {order.map((orig) => (
          <ActionButton key={orig} variant="choice" fullWidth selected={picked === orig} showCheck={judged === null} disabled={judged !== null}
            className={judged !== null && orig === q.answerIndex ? 'border-emerald-400 bg-emerald-50' : ''}
            onClick={() => setPicked(orig)}>
            <span className="flex-1">{q.choices![orig]}</span>
          </ActionButton>
        ))}
      </div>
      {judged === null ? (
        <ActionButton variant="primary" fullWidth className="mt-3" disabled={picked === null}
          onClick={() => {
            const ok = picked === q.answerIndex;
            const dim = q.dimension === 'reading' ? 'reading' as const : 'meaning' as const;
            setJudged(ok);
            repo.recordTest(item.id, dim, ok);
            // 間隔反復へ反映（誤答→翌日・自力正解→7日後。同日の再正解では段階を進めない）
            const result: ReviewResult = ok ? 'independent' : 'wrong';
            schedule.recordResult({ itemId: item.id, result, dimension: dim, source: 'quick_review' });
            trackCourse('schedule_ai_course_vocabulary_review', { itemId: item.id, stage: schedule.get(item.id)?.reviewStage ?? '' });
            setDone((prev) => [...prev, { itemId: item.id, correct: ok }]);
            onChanged();
          }}>{t.lab.check}</ActionButton>
      ) : (
        <div className="mt-3" aria-live="polite">
          <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-gray-700'}`}>{judged ? t.lab.correct : t.lab.notYet}</p>
          <p className="text-xs text-gray-600 mt-1">{zh ? q.explanationZh : q.explanationJa}</p>
          <ActionButton variant="primary" fullWidth className="mt-3" onClick={() => { setIdx(idx + 1); setPicked(null); setJudged(null); }}>{t.lab.next}</ActionButton>
        </div>
      )}
    </div>
  );
};

export default VocabularyHub;

