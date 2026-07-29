// N3 Unit 攻略画面（§5・§8）。12単元すべてを同じコンポーネントで進行させる。
//
// RPG Shellを学習中も維持する: Area・Unit・現在地・主人公・Stage・進捗・完了後の世界変化を常に表示。
// ただし問題カードは白背景・高コントラストで読みやすさを最優先にする（装飾で学習情報を隠さない）。
import { useEffect, useMemo, useState } from 'react';
import type { FoundationItem } from '../../../lib/aiLesson/course/foundationTypes';
import type { UnitCoverageSpec } from '../../../lib/aiLesson/course/quality/unitCoverage';
import { cognateProfileFor } from '../../../lib/aiLesson/course/quality/cognateProfile';
import type { AssessQuestion } from '../../../lib/aiLesson/course/quality/assessQuestionEngine';
import {
  buildUnitQuestions, questionsForPhase, answerQuestion, advancePhaseIfDone,
  markDiagnosticNotLearned, clearMission, summarizeRun, emptyRunState, restoreRunState, worldChangeFor,
  type UnitRunState, type StoragePort, type LoadOutcome,
} from '../../../lib/aiLesson/course/n3unit/unitRuntime';
import { HeroSprite, ShokoSprite } from '../rpg/pixelAssets';
import type { AiCourseDict } from '../../../locales/aiCourse';

export interface N3UnitPanelProps {
  t: AiCourseDict;
  spec: UnitCoverageSpec;
  pool: FoundationItem[];
  storage: StoragePort;
  areaName: string;
  /** 次の単元（結果画面のCTA） */
  nextUnitTitleJa: string | null;
  onExit: () => void;
  onOpenNextUnit?: () => void;
  reducedMotion?: boolean;
  nowMs?: number;
  /**
   * 初期状態を直接渡す（SSR証拠harness・テスト用）。
   * 指定するとstorage.loadの待ち状態を挟まずに描画する。
   */
  initialRunState?: UnitRunState;
}

const phaseLabelOf = (t: AiCourseDict): Record<string, string> => ({
  intro: t.n3u.phaseIntro, diagnostic: t.n3u.phaseDiagnostic, stage1: t.n3u.phaseStage1,
  stage2: t.n3u.phaseStage2, stage3: t.n3u.phaseStage3, mission: t.n3u.phaseMission, result: t.n3u.phaseResult,
});

const STAGE_STEPS = ['diagnostic', 'stage1', 'stage2', 'stage3', 'mission'] as const;

/** 学習中も消えないRPGフレーム（世界の文脈＋学習情報を両方出す） */
const WorldFrame = ({ t, areaName, spec, state, progress, children }: {
  t: AiCourseDict; areaName: string; spec: UnitCoverageSpec; state: UnitRunState;
  progress: { done: number; total: number }; children: React.ReactNode;
}) => {
  const stepIndex = STAGE_STEPS.indexOf(state.phase as typeof STAGE_STEPS[number]);
  const PHASE_LABEL = phaseLabelOf(t);
  const zh = t.locale === 'zh';
  return (
    <div className="w-full">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-3 mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 shrink-0"><HeroSprite decorative /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-emerald-700">{areaName}・{zh ? spec.titleZh : spec.titleJa}</p>
            <p className="text-sm font-bold text-gray-900 truncate">{PHASE_LABEL[state.phase]}</p>
          </div>
          <div className="w-7 shrink-0"><ShokoSprite decorative pose="talk" /></div>
        </div>
        {/* Stage進行（テキストでも状態が分かる） */}
        <ol className="flex items-center gap-1" aria-label={t.n3u.stepsAria}>
          {STAGE_STEPS.map((st, i) => (
            <li key={st} className={`flex-1 h-1.5 rounded-full ${i < stepIndex ? 'bg-emerald-500' : i === stepIndex ? 'bg-emerald-300' : 'bg-gray-200'}`}
              aria-label={`${PHASE_LABEL[st]}${i < stepIndex ? t.n3u.stepDone : i === stepIndex ? t.n3u.stepActive : t.n3u.stepTodo}`} />
          ))}
        </ol>
        <p className="text-[11px] text-gray-500 mt-1">
          {PHASE_LABEL[state.phase]}
          {progress.total > 0 && <>{t.n3u.remaining(progress.total - progress.done, progress.total)}</>}
          {t.n3u.completesTo(zh ? worldChangeFor(spec).unlockZh : worldChangeFor(spec).unlockJa)}
        </p>
      </div>
      {children}
    </div>
  );
};

const moduleNowMs = Date.now();
const systemNow = () => Date.now();

export const N3UnitPanel = ({
  t, spec, pool, storage, areaName, nextUnitTitleJa, onExit, onOpenNextUnit, nowMs, initialRunState,
}: N3UnitPanelProps) => {
  const PHASE_LABEL = phaseLabelOf(t);
  const zh = t.locale === 'zh';
  // renderからは時計を呼ばない。初期値はmodule読み込み時刻、以後はhandler/effect内で取得する
  const clock = () => nowMs ?? systemNow();
  const set = useMemo(() => buildUnitQuestions(spec, pool), [spec, pool]);
  const itemById = useMemo(() => new Map(pool.map(i => [i.id, i])), [pool]);

  const [state, setState] = useState<UnitRunState>(() => initialRunState ?? emptyRunState(spec.unitId, nowMs ?? moduleNowMs));
  const [loadKind, setLoadKind] = useState<LoadOutcome['kind'] | 'loading'>(initialRunState ? 'resumed' : 'loading');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [built, setBuilt] = useState<string[]>([]);
  const [wrongOnce, setWrongOnce] = useState(false);
  const [missionStep, setMissionStep] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  // 復元（壊れた値・新しいschemaでも行き止まりにしない）
  useEffect(() => {
    if (initialRunState) return;
    let alive = true;
    void (async () => {
      try {
        const raw = await storage.load(spec.unitId);
        const outcome = restoreRunState(raw, spec.unitId, nowMs ?? systemNow());
        if (!alive) return;
        setState(outcome.state);
        setLoadKind(outcome.kind);
      } catch {
        if (alive) { setState(emptyRunState(spec.unitId, nowMs ?? systemNow())); setLoadKind('corrupted'); }
      }
    })();
    return () => { alive = false; };
  }, [spec.unitId, storage, nowMs, initialRunState]);

  const persist = (next: UnitRunState) => {
    setState(next);
    void storage.save(next).then(r => setSaveError(r.ok ? null : r.code));
  };

  const queue = questionsForPhase(set, state);
  const current: AssessQuestion | undefined = queue[0];
  const phaseTotal = state.phase === 'diagnostic' ? set.diagnostic.length
    : state.phase === 'stage1' ? set.byStage.understand.length
    : state.phase === 'stage2' ? set.byStage.distinguish.length
    : state.phase === 'stage3' ? set.byStage.apply.length : 0;

  const submit = (q: AssessQuestion, correct: boolean) => {
    if (!correct) {
      persist(answerQuestion(state, q, false, clock()));
      setWrongOnce(true); setBuilt([]);
      return;
    }
    const answered = answerQuestion(state, q, true, clock());
    const advanced = advancePhaseIfDone(answered, set, spec, clock());
    if (advanced.phase !== state.phase) setAnnouncement(t.n3u.phaseAdvanced(PHASE_LABEL[advanced.phase]));
    persist(advanced);
    setWrongOnce(false); setBuilt([]);
  };

  // 「まだ習っていない」: 誤答扱いにせず診断だけ消化して先へ（Stage1で導入から学ぶ）
  const declineDiagnostic = (q: AssessQuestion) => {
    const advanced = advancePhaseIfDone(markDiagnosticNotLearned(state, q), set, spec, clock());
    if (advanced.phase !== state.phase) setAnnouncement(t.n3u.phaseAdvanced(PHASE_LABEL[advanced.phase]));
    persist(advanced);
    setWrongOnce(false); setBuilt([]);
  };

  // 場面ミッション: 単元の語を使って場面を通す（複数項目を使う）
  const missionItems = spec.practicalMission.usesItemIds
    .map(id => itemById.get(id)).filter((x): x is FoundationItem => !!x);
  const missionQuestions = missionItems.map(item =>
    set.byStage.apply.find(q => q.itemId === item.id)
    ?? set.byStage.distinguish.find(q => q.itemId === item.id)).filter((q): q is AssessQuestion => !!q);

  const summary = summarizeRun(state, spec, set);

  if (loadKind === 'loading') {
    return <div className="py-10 text-center text-sm text-gray-500" role="status">{t.n3u.loading}</div>;
  }

  return (
    <WorldFrame t={t} areaName={areaName} spec={spec} state={state}
      progress={{ done: Math.max(0, phaseTotal - queue.length), total: phaseTotal }}>
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {/* 復元・保存の状態（技術用語を出さず、次の行動を1つ示す） */}
      {loadKind === 'corrupted' && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <p className="text-xs font-bold text-amber-800">{t.n3u.corruptedTitle}</p>
          <p className="text-[11px] text-amber-700">{t.n3u.corruptedBody}</p>
        </div>
      )}
      {loadKind === 'schema_newer' && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <p className="text-xs font-bold text-amber-800">{t.n3u.newerTitle}</p>
          <p className="text-[11px] text-amber-700">{t.n3u.newerBody}</p>
        </div>
      )}
      {saveError && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl" role="alert">
          <p className="text-xs font-bold text-rose-800">{t.n3u.saveFailedTitle}</p>
          <p className="text-[11px] text-rose-700 mb-2">{t.n3u.saveFailedBody}</p>
          <button type="button" onClick={() => void storage.save(state).then(r => setSaveError(r.ok ? null : r.code))}
            className="min-h-11 px-3 text-xs font-bold text-rose-800 border border-rose-300 rounded-xl">{t.n3u.saveRetry}</button>
        </div>
      )}

      {/* ── Intro ── */}
      {state.phase === 'intro' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-lg font-bold text-gray-900 mb-1">{spec.titleJa}</h2>
          <p className="text-xs text-gray-400 mb-3">{spec.titleZh}</p>
          <dl className="text-sm text-gray-800 space-y-1.5 mb-4">
            <div><dt className="inline font-bold">{t.n3u.introWords} </dt><dd className="inline">{spec.targetVocabularyIds.length}{t.n3u.wordsUnit}</dd></div>
            {spec.encounterVocabularyIds.length > 0 && (
              <div><dt className="inline font-bold">{t.n3u.introEncounter} </dt><dd className="inline">{spec.encounterVocabularyIds.length}{t.n3u.wordsUnit}</dd></div>
            )}
            {spec.highRiskCognateIds.length > 0 && (
              <div><dt className="inline font-bold">{t.n3u.introCognate} </dt>
                <dd className="inline">{spec.highRiskCognateIds.map(id => itemById.get(id)?.displayForm ?? id).join('・')}</dd></div>
            )}
            <div><dt className="inline font-bold">{t.n3u.introHow} </dt><dd className="inline">{t.n3u.introFlow}</dd></div>
            <div><dt className="inline font-bold">{t.n3u.introCount} </dt>
              <dd className="inline">{set.diagnostic.length + set.byStage.understand.length + set.byStage.distinguish.length + set.byStage.apply.length}{t.n3u.questionsUnit}</dd></div>
            <div><dt className="inline font-bold">{t.n3u.introCondition} </dt>
              <dd className="inline">{t.n3u.conditionText(zh ? spec.practicalMission.titleZh : spec.practicalMission.titleJa)}</dd></div>
            <div><dt className="inline font-bold">{t.n3u.introUnlock} </dt><dd className="inline">{zh ? worldChangeFor(spec).unlockZh : worldChangeFor(spec).unlockJa}</dd></div>
          </dl>
          <button type="button" onClick={() => persist(advancePhaseIfDone(state, set, spec, clock()))}
            className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">
            {t.n3u.start}
          </button>
          <button type="button" onClick={onExit} className="w-full min-h-11 mt-1 text-xs text-gray-400 underline">{t.n3u.backToWorld}</button>
        </div>
      )}

      {/* ── 問題フェーズ（診断・Stage1-3） ── */}
      {['diagnostic', 'stage1', 'stage2', 'stage3'].includes(state.phase) && current && (() => {
        const item = itemById.get(current.itemId);
        const profile = item ? cognateProfileFor(item) : null;
        return (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            {state.phase === 'diagnostic' && (
              <p className="text-[11px] text-gray-500 mb-2">
                {t.n3u.diagnosticHint}
              </p>
            )}
            {/* Stage1は理解フェーズなので、答えを含まない導入だけ出す */}
            {state.phase === 'stage1' && item && (
              <div className="mb-3 p-3 bg-slate-50 rounded-xl">
                <p className="text-xl font-bold text-gray-900">{item.displayForm}</p>
                {profile?.transferRiskZh && (
                  <p className="text-[11px] text-rose-700 mt-1">{t.n3u.cognateDiffers(profile.zhCognate ?? '')}</p>
                )}
              </div>
            )}
            <p className="text-sm font-bold text-gray-900 mb-1 whitespace-pre-line">{current.promptJa}</p>
            <p className="text-xs text-gray-400 mb-3">{current.promptZh}</p>
            {wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.n3u.wrongRetry}</p>}

            {current.kind === 'order' ? (
              <div>
                <div className="min-h-11 p-2 mb-2 bg-slate-50 rounded-xl text-base text-gray-900" aria-live="polite">
                  {built.length ? built.join('') : <span className="text-gray-300">{t.n3u.orderHere}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {current.choices.map((tok, i) => {
                    const target = current.orderAnswer ?? current.choices;
                    const used = built.filter(b => b === tok).length >= target.filter(t => t === tok).length;
                    return (
                      <button key={`${tok}-${i}`} type="button" disabled={used}
                        onClick={() => {
                          const nextBuilt = [...built, tok];
                          if (nextBuilt.length < target.length) { setBuilt(nextBuilt); return; }
                          submit(current, nextBuilt.join('') === target.join(''));
                        }}
                        className={`min-h-11 px-3 py-2 text-sm rounded-xl border ${used ? 'bg-gray-100 text-gray-300 border-gray-100' : 'bg-white border-emerald-200 hover:border-emerald-400'}`}>
                        {tok}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setBuilt([])} className="min-h-11 px-3 text-xs text-gray-400 underline">{t.n3u.orderReset}</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {current.choices.map((opt, i) => (
                  <button key={opt} type="button" onClick={() => submit(current, i === current.answerIndex)}
                    className="min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {state.phase === 'diagnostic' && (
              <button type="button" onClick={() => declineDiagnostic(current)}
                className="w-full min-h-11 mt-2 text-xs text-gray-500 underline">{t.n3u.notLearned}</button>
            )}
            <button type="button" onClick={onExit} className="w-full min-h-11 mt-2 text-xs text-gray-400 underline">
              {t.n3u.pauseSave}
            </button>
          </div>
        );
      })()}

      {/* 問題が尽きたら次フェーズへ（空フェーズの行き止まり防止） */}
      {['diagnostic', 'stage1', 'stage2', 'stage3'].includes(state.phase) && !current && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-gray-900 mb-2">{t.n3u.phaseDone(PHASE_LABEL[state.phase])}</p>
          <button type="button" onClick={() => persist(advancePhaseIfDone(state, set, spec, clock()))}
            className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">{t.n3u.next}</button>
        </div>
      )}

      {/* ── 場面ミッション ── */}
      {state.phase === 'mission' && (() => {
        const q = missionQuestions[missionStep];
        if (!q) {
          return (
            <div className="bg-white border border-emerald-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-gray-900 mb-2">{t.n3u.missionDone(zh ? spec.practicalMission.titleZh : spec.practicalMission.titleJa)}</p>
              <button type="button" onClick={() => persist(clearMission(state, clock()))}
                className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">{t.n3u.seeResult}</button>
            </div>
          );
        }
        return (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[11px] text-emerald-600 font-bold mb-1">
              {t.n3u.missionProgress(missionStep + 1, missionQuestions.length)}
            </p>
            <div className="mb-3 p-3 bg-emerald-50 rounded-xl">
              <p className="text-sm font-bold text-emerald-900">{zh ? spec.practicalMission.titleZh : spec.practicalMission.titleJa}</p>
              <p className="text-xs text-emerald-800 mt-0.5">{zh ? spec.practicalMission.situationZh : spec.practicalMission.situationJa}</p>
              <p className="text-[11px] text-emerald-700 mt-1">{t.n3u.missionGoal(zh ? spec.practicalMission.goalZh : spec.practicalMission.goalJa)}</p>
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1 whitespace-pre-line">{q.promptJa}</p>
            <p className="text-xs text-gray-400 mb-3">{q.promptZh}</p>
            {wrongOnce && <p className="text-xs text-rose-600 mb-2">{t.n3u.missionWrong}</p>}
            {q.kind === 'order' ? (
              <div>
                <div className="min-h-11 p-2 mb-2 bg-slate-50 rounded-xl text-base text-gray-900" aria-live="polite">
                  {built.length ? built.join('') : <span className="text-gray-300">{t.n3u.orderHere}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {q.choices.map((tok, i) => {
                    const target = q.orderAnswer ?? q.choices;
                    const used = built.filter(b => b === tok).length >= target.filter(t => t === tok).length;
                    return (
                      <button key={`${tok}-${i}`} type="button" disabled={used}
                        onClick={() => {
                          const nextBuilt = [...built, tok];
                          if (nextBuilt.length < target.length) { setBuilt(nextBuilt); return; }
                          if (nextBuilt.join('') === target.join('')) {
                            persist(answerQuestion(state, q, true, clock()));
                            setMissionStep(missionStep + 1); setBuilt([]); setWrongOnce(false);
                          } else { setBuilt([]); setWrongOnce(true); persist(answerQuestion(state, q, false, clock())); }
                        }}
                        className={`min-h-11 px-3 py-2 text-sm rounded-xl border ${used ? 'bg-gray-100 text-gray-300 border-gray-100' : 'bg-white border-emerald-200'}`}>
                        {tok}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {q.choices.map((opt, i) => (
                  <button key={opt} type="button"
                    onClick={() => {
                      const ok = i === q.answerIndex;
                      persist(answerQuestion(state, q, ok, clock()));
                      if (ok) { setMissionStep(missionStep + 1); setWrongOnce(false); } else setWrongOnce(true);
                    }}
                    className="min-h-11 px-3 py-2 text-left text-sm bg-white border border-gray-200 rounded-xl hover:border-emerald-400">
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 結果 ── */}
      {state.phase === 'result' && (
        <div className="bg-white border border-emerald-200 rounded-2xl p-4">
          <h2 className="text-lg font-bold text-emerald-700 mb-2">{t.n3u.resultDone(zh ? spec.titleZh : spec.titleJa)}</h2>
          <div className="p-3 bg-emerald-50 rounded-xl mb-3">
            <p className="text-sm text-emerald-900">{zh ? worldChangeFor(spec).unlockZh : worldChangeFor(spec).unlockJa}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 mb-3">
            {[[t.n3u.resultWords, `${summary.passedCount}／${summary.targetCount}${t.n3u.wordsUnit}`],
              [t.n3u.resultTried, `${summary.attemptedCount}${t.n3u.wordsUnit}`],
              [t.n3u.resultReview, `${summary.reviewScheduledCount}${t.n3u.wordsUnit}`],
              [t.n3u.resultAccuracy, `${Math.round(summary.accuracy * 100)}%`]].map(([k, v]) => (
              <div key={k} className="p-2.5 bg-white border border-gray-100 rounded-xl">
                <dt className="text-[10px] text-gray-400">{k}</dt>
                <dd className="text-base font-bold text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
          {summary.reviewScheduledCount > 0 && (
            <p className="text-xs text-violet-700 mb-3">
              {t.n3u.resultReviewNote(summary.reviewScheduledCount)}
            </p>
          )}
          {!summary.meetsMinimumAccuracy && (
            <p className="text-xs text-amber-700 mb-3">
              {t.n3u.resultRetryNote}
            </p>
          )}
          {nextUnitTitleJa && onOpenNextUnit ? (
            <button type="button" onClick={onOpenNextUnit}
              className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">
              {t.n3u.nextUnit(nextUnitTitleJa)}
            </button>
          ) : (
            <button type="button" onClick={onExit}
              className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">{t.n3u.backToWorld}</button>
          )}
          <button type="button" onClick={onExit} className="w-full min-h-11 mt-1 text-xs text-gray-400 underline">{t.n3u.backToWorld}</button>
        </div>
      )}
    </WorldFrame>
  );
};

export default N3UnitPanel;
