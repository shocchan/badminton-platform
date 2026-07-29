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

export interface N3UnitPanelProps {
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

const PHASE_LABEL: Record<string, string> = {
  intro: 'この単元について', diagnostic: 'できることの確認', stage1: 'Stage 1・理解',
  stage2: 'Stage 2・使い分け', stage3: 'Stage 3・実践', mission: '場面ミッション', result: '結果',
};

const STAGE_STEPS = ['diagnostic', 'stage1', 'stage2', 'stage3', 'mission'] as const;

/** 学習中も消えないRPGフレーム（世界の文脈＋学習情報を両方出す） */
const WorldFrame = ({ areaName, spec, state, progress, children }: {
  areaName: string; spec: UnitCoverageSpec; state: UnitRunState;
  progress: { done: number; total: number }; children: React.ReactNode;
}) => {
  const stepIndex = STAGE_STEPS.indexOf(state.phase as typeof STAGE_STEPS[number]);
  return (
    <div className="w-full">
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-3 mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 shrink-0"><HeroSprite decorative /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-emerald-700">{areaName}・{spec.titleJa}</p>
            <p className="text-sm font-bold text-gray-900 truncate">{PHASE_LABEL[state.phase]}</p>
          </div>
          <div className="w-7 shrink-0"><ShokoSprite decorative pose="talk" /></div>
        </div>
        {/* Stage進行（テキストでも状態が分かる） */}
        <ol className="flex items-center gap-1" aria-label="この単元の進み方">
          {STAGE_STEPS.map((st, i) => (
            <li key={st} className={`flex-1 h-1.5 rounded-full ${i < stepIndex ? 'bg-emerald-500' : i === stepIndex ? 'bg-emerald-300' : 'bg-gray-200'}`}
              aria-label={`${PHASE_LABEL[st]}${i < stepIndex ? '（完了）' : i === stepIndex ? '（実施中）' : '（未着手）'}`} />
          ))}
        </ol>
        <p className="text-[11px] text-gray-500 mt-1">
          {PHASE_LABEL[state.phase]}
          {progress.total > 0 && <> ・ 残り{progress.total - progress.done}問／{progress.total}問</>}
          {' '}・ 完了すると「{worldChangeFor(spec).unlockJa}」
        </p>
      </div>
      {children}
    </div>
  );
};

const moduleNowMs = Date.now();
const systemNow = () => Date.now();

export const N3UnitPanel = ({
  spec, pool, storage, areaName, nextUnitTitleJa, onExit, onOpenNextUnit, nowMs, initialRunState,
}: N3UnitPanelProps) => {
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
    if (advanced.phase !== state.phase) setAnnouncement(`${PHASE_LABEL[advanced.phase]}へ進みました`);
    persist(advanced);
    setWrongOnce(false); setBuilt([]);
  };

  // 「まだ習っていない」: 誤答扱いにせず診断だけ消化して先へ（Stage1で導入から学ぶ）
  const declineDiagnostic = (q: AssessQuestion) => {
    const advanced = advancePhaseIfDone(markDiagnosticNotLearned(state, q), set, spec, clock());
    if (advanced.phase !== state.phase) setAnnouncement(`${PHASE_LABEL[advanced.phase]}へ進みました`);
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
    return <div className="py-10 text-center text-sm text-gray-500" role="status">読み込んでいます…</div>;
  }

  return (
    <WorldFrame areaName={areaName} spec={spec} state={state}
      progress={{ done: Math.max(0, phaseTotal - queue.length), total: phaseTotal }}>
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {/* 復元・保存の状態（技術用語を出さず、次の行動を1つ示す） */}
      {loadKind === 'corrupted' && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <p className="text-xs font-bold text-amber-800">前回の続きが読み取れませんでした</p>
          <p className="text-[11px] text-amber-700">この単元は最初から始められます。学んだ記録は失われていません。</p>
        </div>
      )}
      {loadKind === 'schema_newer' && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
          <p className="text-xs font-bold text-amber-800">新しいバージョンの記録が見つかりました</p>
          <p className="text-[11px] text-amber-700">アプリを再読み込みすると、続きから始められます。</p>
        </div>
      )}
      {saveError && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl" role="alert">
          <p className="text-xs font-bold text-rose-800">まだ保存できていません</p>
          <p className="text-[11px] text-rose-700 mb-2">通信が戻ると自動で保存されます。今は続けて学習できます。</p>
          <button type="button" onClick={() => void storage.save(state).then(r => setSaveError(r.ok ? null : r.code))}
            className="min-h-11 px-3 text-xs font-bold text-rose-800 border border-rose-300 rounded-xl">もう一度保存する</button>
        </div>
      )}

      {/* ── Intro ── */}
      {state.phase === 'intro' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-lg font-bold text-gray-900 mb-1">{spec.titleJa}</h2>
          <p className="text-xs text-gray-400 mb-3">{spec.titleZh}</p>
          <dl className="text-sm text-gray-800 space-y-1.5 mb-4">
            <div><dt className="inline font-bold">学ぶことば: </dt><dd className="inline">{spec.targetVocabularyIds.length}語</dd></div>
            {spec.encounterVocabularyIds.length > 0 && (
              <div><dt className="inline font-bold">前に学んだことばの再確認: </dt><dd className="inline">{spec.encounterVocabularyIds.length}語</dd></div>
            )}
            {spec.highRiskCognateIds.length > 0 && (
              <div><dt className="inline font-bold">まちがえやすい同じ漢字の語: </dt>
                <dd className="inline">{spec.highRiskCognateIds.map(id => itemById.get(id)?.displayForm ?? id).join('・')}</dd></div>
            )}
            <div><dt className="inline font-bold">進め方: </dt><dd className="inline">確認 → 理解 → 使い分け → 実践 → 場面ミッション</dd></div>
            <div><dt className="inline font-bold">問題数のめやす: </dt>
              <dd className="inline">{set.diagnostic.length + set.byStage.understand.length + set.byStage.distinguish.length + set.byStage.apply.length}問</dd></div>
            <div><dt className="inline font-bold">完了条件: </dt>
              <dd className="inline">全ての語を確認し、「{spec.practicalMission.titleJa}」を成功させる</dd></div>
            <div><dt className="inline font-bold">完了すると: </dt><dd className="inline">{worldChangeFor(spec).unlockJa}</dd></div>
          </dl>
          <button type="button" onClick={() => persist(advancePhaseIfDone(state, set, spec, clock()))}
            className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">
            はじめる（できることの確認から）
          </button>
          <button type="button" onClick={onExit} className="w-full min-h-11 mt-1 text-xs text-gray-400 underline">世界へもどる</button>
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
                すでに使える語は、この確認で先へ進めます（分からなければ「まだ習っていない」を選べます）
              </p>
            )}
            {/* Stage1は理解フェーズなので、答えを含まない導入だけ出す */}
            {state.phase === 'stage1' && item && (
              <div className="mb-3 p-3 bg-slate-50 rounded-xl">
                <p className="text-xl font-bold text-gray-900">{item.displayForm}</p>
                {profile?.transferRiskZh && (
                  <p className="text-[11px] text-rose-700 mt-1">中国語の「{profile.zhCognate}」とは使い方が違います</p>
                )}
              </div>
            )}
            <p className="text-sm font-bold text-gray-900 mb-1 whitespace-pre-line">{current.promptJa}</p>
            <p className="text-xs text-gray-400 mb-3">{current.promptZh}</p>
            {wrongOnce && <p className="text-xs text-rose-600 mb-2">もう一度考えてみましょう。この語はあとで復習に出ます。</p>}

            {current.kind === 'order' ? (
              <div>
                <div className="min-h-11 p-2 mb-2 bg-slate-50 rounded-xl text-base text-gray-900" aria-live="polite">
                  {built.length ? built.join('') : <span className="text-gray-300">ここに文ができます</span>}
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
                <button type="button" onClick={() => setBuilt([])} className="min-h-11 px-3 text-xs text-gray-400 underline">やり直す</button>
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
                className="w-full min-h-11 mt-2 text-xs text-gray-500 underline">まだ習っていない（最初から学ぶ）</button>
            )}
            <button type="button" onClick={onExit} className="w-full min-h-11 mt-2 text-xs text-gray-400 underline">
              中断して世界へもどる（ここまでは保存されます）
            </button>
          </div>
        );
      })()}

      {/* 問題が尽きたら次フェーズへ（空フェーズの行き止まり防止） */}
      {['diagnostic', 'stage1', 'stage2', 'stage3'].includes(state.phase) && !current && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-gray-900 mb-2">{PHASE_LABEL[state.phase]}が終わりました</p>
          <button type="button" onClick={() => persist(advancePhaseIfDone(state, set, spec, clock()))}
            className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">次へ進む</button>
        </div>
      )}

      {/* ── 場面ミッション ── */}
      {state.phase === 'mission' && (() => {
        const q = missionQuestions[missionStep];
        if (!q) {
          return (
            <div className="bg-white border border-emerald-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-gray-900 mb-2">{spec.practicalMission.titleJa}を達成しました</p>
              <button type="button" onClick={() => persist(clearMission(state, clock()))}
                className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">結果を見る</button>
            </div>
          );
        }
        return (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[11px] text-emerald-600 font-bold mb-1">
              場面ミッション {missionStep + 1}／{missionQuestions.length}
            </p>
            <div className="mb-3 p-3 bg-emerald-50 rounded-xl">
              <p className="text-sm font-bold text-emerald-900">{spec.practicalMission.titleJa}</p>
              <p className="text-xs text-emerald-800 mt-0.5">{spec.practicalMission.situationJa}</p>
              <p className="text-[11px] text-emerald-700 mt-1">達成条件: {spec.practicalMission.goalJa}</p>
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1 whitespace-pre-line">{q.promptJa}</p>
            <p className="text-xs text-gray-400 mb-3">{q.promptZh}</p>
            {wrongOnce && <p className="text-xs text-rose-600 mb-2">もう一度。場面を思い浮かべてみましょう。</p>}
            {q.kind === 'order' ? (
              <div>
                <div className="min-h-11 p-2 mb-2 bg-slate-50 rounded-xl text-base text-gray-900" aria-live="polite">
                  {built.length ? built.join('') : <span className="text-gray-300">ここに文ができます</span>}
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
          <h2 className="text-lg font-bold text-emerald-700 mb-2">{spec.titleJa} 完了</h2>
          <div className="p-3 bg-emerald-50 rounded-xl mb-3">
            <p className="text-sm text-emerald-900">{worldChangeFor(spec).unlockJa}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 mb-3">
            {[['学んだことば', `${summary.passedCount}／${summary.targetCount}語`],
              ['取り組んだ語', `${summary.attemptedCount}語`],
              ['復習に回した語', `${summary.reviewScheduledCount}語`],
              ['正答率', `${Math.round(summary.accuracy * 100)}%`]].map(([k, v]) => (
              <div key={k} className="p-2.5 bg-white border border-gray-100 rounded-xl">
                <dt className="text-[10px] text-gray-400">{k}</dt>
                <dd className="text-base font-bold text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
          {summary.reviewScheduledCount > 0 && (
            <p className="text-xs text-violet-700 mb-3">
              まちがえた{summary.reviewScheduledCount}語は、日をおいて「オモイデ庭園」で再会します。
            </p>
          )}
          {!summary.meetsMinimumAccuracy && (
            <p className="text-xs text-amber-700 mb-3">
              もう一度この単元に取り組むと、まだ不安な語だけを確かめられます。
            </p>
          )}
          {nextUnitTitleJa && onOpenNextUnit ? (
            <button type="button" onClick={onOpenNextUnit}
              className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">
              次へ：{nextUnitTitleJa}
            </button>
          ) : (
            <button type="button" onClick={onExit}
              className="w-full min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">世界へもどる</button>
          )}
          <button type="button" onClick={onExit} className="w-full min-h-11 mt-1 text-xs text-gray-400 underline">世界へもどる</button>
        </div>
      )}
    </WorldFrame>
  );
};

export default N3UnitPanel;
