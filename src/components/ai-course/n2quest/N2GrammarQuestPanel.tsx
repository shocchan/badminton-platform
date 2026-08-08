// N2文法攻略「ソラノ塔」（FOREST FIRST §10）。180文型を12単元で一通り学べるlearner UI。
//
// 流れ: 単元一覧 → 文型一覧 → 詳細（説明・例文）→ 確認問題 → 使用練習 → 次の文型
//       単元の全文型が完了すると単元Result（Review接続つき）。
// データ: 完成draft（173）＋同義判断待ちpre-draft（7）を単元単位でdynamic import。
//        reviewStatus/humanReviewed/approved はUIから変更しない（自動昇格禁止）。
// 進捗: この端末のlocalStorageのみ。「サーバーに保存しました」とは表示しない。
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, BookOpen } from 'lucide-react';
import type { N2GrammarDraft } from '../../../lib/aiLesson/course/n2GrammarDrafts';
import { loadN2DraftsByUnit } from '../../../lib/aiLesson/course/n2GrammarDraftChunks';
import {
  readItemProgress, markRecognized, markProduced, unitQuestProgress,
  shuffleRecognition, productionUsesTarget,
} from '../../../lib/aiLesson/course/n2quest/n2QuestProgress';
import { ShokoSprite } from '../rpg/pixelAssets';
import type { AiCourseDict } from '../../../locales/aiCourse';
import { CourseLoading } from '../CourseLoading';

const browserStore = typeof window === 'undefined' ? null : window.localStorage;
const safeStore = browserStore ?? { getItem: () => null, setItem: () => {} };
const now = () => Date.now();

export interface N2GrammarQuestPanelProps {
  t: AiCourseDict;
  onBack: () => void;
  /** オモイデ庭園（期限復習）へ */
  onOpenReview?: () => void;
  /** 会話の広場へ（使用練習の仕上げ・§12） */
  onGoConversation?: () => void;
}

type UnitData = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: N2GrammarDraft[] };
type ItemPhase = 'detail' | 'quiz' | 'produce' | 'done';

const UNIT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NO_ITEMS: N2GrammarDraft[] = [];

/** CEO統合判断（2026-07-30）反映後: 全178文型が本編chunkに存在（予稿の別読みは不要） */
const loadUnitItems = async (unit: number): Promise<N2GrammarDraft[]> =>
  (await loadN2DraftsByUnit(unit)).sort((a, b) => a.grammarId.localeCompare(b.grammarId));

export const N2GrammarQuestPanel = ({ t, onBack, onOpenReview, onGoConversation }: N2GrammarQuestPanelProps) => {
  const [unit, setUnit] = useState<number | null>(null);
  const [unitData, setUnitData] = useState<UnitData>({ status: 'loading' });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ItemPhase>('detail');
  const [picked, setPicked] = useState<number | null>(null);
  const [judged, setJudged] = useState<boolean | null>(null);
  const [producedText, setProducedText] = useState('');
  const [produceResult, setProduceResult] = useState<'ok' | 'retry' | null>(null);
  const [, setTick] = useState(0);
  const bump = () => setTick(v => v + 1);

  useEffect(() => {
    if (unit === null) return;
    let alive = true;
    // effect内同期setStateを避ける（リポジトリ既定のmicrotaskパターン）
    void Promise.resolve().then(() => { if (alive) setUnitData({ status: 'loading' }); });
    loadUnitItems(unit)
      .then(items => { if (alive) setUnitData({ status: 'ready', items }); })
      .catch(() => { if (alive) setUnitData({ status: 'error' }); });
    return () => { alive = false; };
  }, [unit]);

  const items = unitData.status === 'ready' ? unitData.items : NO_ITEMS;
  const active = useMemo(() => items.find(d => d.grammarId === activeId) ?? null, [items, activeId]);
  const shuffled = useMemo(
    () => (active ? shuffleRecognition(active.grammarId, active.recognition.options, active.recognition.answerIndex) : null),
    [active]);

  const openItem = (id: string) => {
    setActiveId(id); setPhase('detail');
    setPicked(null); setJudged(null); setProducedText(''); setProduceResult(null);
  };

  const backToList = () => { setActiveId(null); bump(); };

  // ── 文型の学習画面（詳細→確認→使用練習） ──
  if (unit !== null && active && shuffled) {
    const prog = readItemProgress(safeStore, active.grammarId);
    const idx = items.findIndex(d => d.grammarId === active.grammarId);
    const nextItem = items[idx + 1] ?? null;
    return (
      <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
        <button type="button" onClick={backToList}
          className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-colors active:bg-gray-100">
          <ArrowLeft className="w-4 h-4" aria-hidden />{t.n2q.backToUnitList(unit)}
        </button>

        {/* ヘッダー（塔の文脈＋文型） */}
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-violet-600">{t.n2q.itemPos(unit, idx + 1, items.length)}</p>
              <p className="text-lg font-bold text-gray-900">{active.pattern}</p>
              <p className="text-xs text-gray-500">{active.reading}・{active.meaningJa}</p>
            </div>
            <div className="w-8 shrink-0"><ShokoSprite decorative pose="talk" /></div>
          </div>
        </div>

        {phase === 'detail' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-sm text-gray-900 font-bold mb-1">{active.explanationZh}</p>
            <dl className="space-y-2 mt-3 text-sm">
              <div><dt className="text-[11px] text-gray-400">{t.n2q.connection}</dt><dd className="text-gray-800">{active.formation}</dd></div>
              <div><dt className="text-[11px] text-gray-400">{t.n2q.scene}</dt><dd className="text-gray-800">{active.usageScene}</dd></div>
              <div><dt className="text-[11px] text-gray-400">{t.n2q.nuance}</dt><dd className="text-gray-800">{active.nuance}</dd></div>
            </dl>
            <div className="mt-3 space-y-2">
              {active.examplesJa.map((ex, i) => (
                <div key={i} className="p-2.5 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-900">{ex}</p>
                  {i === 0 && <p className="text-[11px] text-gray-400 mt-0.5">{active.furigana}</p>}
                  {active.examplesZh[i] && <p className="text-xs text-gray-500 mt-0.5">{active.examplesZh[i]}</p>}
                </div>
              ))}
            </div>
            <div className="mt-3 p-2.5 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-[11px] font-bold text-amber-800">{t.n2q.mistakes}</p>
              <p className="text-xs text-amber-900">{active.commonMistakesZh}</p>
            </div>
            {active.learnerFocus && (
              <p className="text-xs text-gray-500 mt-2">{active.learnerFocus}</p>
            )}
            {active.similarPatterns.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">{t.n2q.similar(active.similarPatterns.join('・'))}（{active.contrast}）</p>
            )}
            <button type="button" onClick={() => setPhase('quiz')}
              className="w-full min-h-12 mt-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent]">
              {t.n2q.toQuiz}
            </button>
          </div>
        )}

        {phase === 'quiz' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-indigo-500 mb-1">{t.n2q.quiz}</p>
            <p className="text-sm font-bold text-gray-900 mb-3">{active.recognition.promptZh}</p>
            <div className="space-y-2" role="group" aria-label={t.n2q.choicesAria}>
              {shuffled.options.map((opt, i) => {
                const isAnswer = i === shuffled.answerIndex;
                const chosen = picked === i;
                return (
                  <button key={i} type="button" disabled={judged !== null}
                    onClick={() => setPicked(i)}
                    aria-pressed={chosen}
                    className={`w-full text-left min-h-11 px-3 py-2 rounded-xl border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 action-raised action-choice touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none
                      ${judged !== null && isAnswer ? 'border-emerald-400 bg-emerald-50' : chosen ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
            {judged === null ? (
              <button type="button" disabled={picked === null}
                onClick={() => {
                  const ok = picked === shuffled.answerIndex;
                  setJudged(ok);
                  if (ok) { markRecognized(safeStore, active.grammarId, now()); }
                }}
                className="w-full min-h-12 mt-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm disabled:opacity-40 action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                {t.n2q.check}
              </button>
            ) : (
              <div className="mt-3">
                <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {judged ? t.n2q.correct : t.n2q.tryAgain}
                </p>
                <p className="text-xs text-gray-600 mt-1">{active.recognition.explanationZh}</p>
                {judged ? (
                  <button type="button" onClick={() => setPhase('produce')}
                    className="w-full min-h-12 mt-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                    {t.n2q.toPractice}
                  </button>
                ) : (
                  <button type="button" onClick={() => { setPicked(null); setJudged(null); }}
                    className="w-full min-h-12 mt-3 bg-white border border-indigo-200 text-indigo-700 rounded-2xl font-bold text-sm action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                    {t.n2q.chooseAgain}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'produce' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-indigo-500 mb-1">{t.n2q.practice}</p>
            <p className="text-sm font-bold text-gray-900">{active.production.promptJa}</p>
            <p className="text-xs text-gray-500 mb-3">{active.production.promptZh}</p>
            <textarea value={producedText} onChange={e => { setProducedText(e.target.value); setProduceResult(null); }}
              rows={3} aria-label={t.n2q.writeAria}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder={t.n2q.practicePlaceholder(active.pattern)} />
            {produceResult === 'ok' && (
              <p className="text-sm font-bold text-emerald-700 mt-2">{t.n2q.usedOk(active.pattern)}</p>
            )}
            {produceResult === 'retry' && (
              <p className="text-sm text-amber-700 mt-2">{t.n2q.useInSentence(active.pattern, active.examplesJa[1] ?? active.examplesJa[0])}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button type="button"
                onClick={() => {
                  if (productionUsesTarget(active, producedText)) {
                    setProduceResult('ok');
                    markProduced(safeStore, active.grammarId, now());
                    setPhase('done');
                  } else {
                    setProduceResult('retry');
                  }
                }}
                className="flex-1 min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                {t.n2q.practiceCheck}
              </button>
              <button type="button"
                onClick={() => { markProduced(safeStore, active.grammarId, now()); setPhase('done'); }}
                className="flex-1 min-h-12 bg-white border border-gray-200 text-gray-600 rounded-2xl font-bold text-sm action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                {t.n2q.practiceSkip}
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="bg-white border border-emerald-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-emerald-800 mb-1">
              <Check className="inline w-4 h-4 -mt-0.5" aria-hidden /> {t.n2q.recorded(active.pattern)}
            </p>
            <p className="text-xs text-gray-600 mb-3">{t.n2q.recordedBody}</p>
            <div className="p-2.5 bg-gray-50 rounded-xl mb-3">
              <p className="text-[11px] text-gray-400">{t.n2q.talkStarter}</p>
              <p className="text-sm text-gray-800">{active.practice.starterJa}</p>
              <p className="text-xs text-gray-500">{active.practice.starterZh}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {nextItem ? (
                <button type="button" onClick={() => openItem(nextItem.grammarId)}
                  className="flex-1 min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                  {t.n2q.nextGrammar(nextItem.pattern)}
                </button>
              ) : (
                <button type="button" onClick={backToList}
                  className="flex-1 min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                  {t.n2q.seeUnitResult}
                </button>
              )}
              {onGoConversation && (
                <button type="button" onClick={onGoConversation}
                  className="flex-1 min-h-12 bg-white border border-indigo-200 text-indigo-700 rounded-2xl font-bold text-sm action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                  {t.n2q.useInPlaza}
                </button>
              )}
            </div>
          </div>
        )}

        {prog.recognizedAtMs !== null && phase === 'detail' && (
          <p className="text-[11px] text-gray-400 mt-2">{t.n2q.alreadyLearned}</p>
        )}
      </div>
    );
  }

  // ── 単元内の文型一覧 ──
  if (unit !== null) {
    const prog = unitQuestProgress(safeStore, items);
    return (
      <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
        <button type="button" onClick={() => { setUnit(null); bump(); }}
          className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-colors active:bg-gray-100">
          <ArrowLeft className="w-4 h-4" aria-hidden />{t.n2q.backToUnits}
        </button>
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-3 mb-3">
          <p className="text-[11px] text-violet-600">{t.n2q.towerHeader}</p>
          <h2 className="text-lg font-bold text-gray-900">{t.n2q.unitName(unit)}</h2>
          {unitData.status === 'ready' && (
            <p className="text-xs text-gray-500">{t.n2q.unitDone(prog.done, prog.total)}</p>
          )}
        </div>

        {unitData.status === 'loading' && (
          <CourseLoading t={t} scene="map" minHeightClass="min-h-[120px]" />
        )}
        {unitData.status === 'error' && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
            <p className="text-sm font-bold text-rose-800 mb-2">{t.n2q.loadError}</p>
            <button type="button" onClick={() => { const u = unit; setUnit(null); setTimeout(() => setUnit(u), 0); }}
              className="min-h-11 px-5 bg-rose-600 text-white rounded-2xl font-bold text-sm action-raised action-amber touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{t.n2q.reload}</button>
          </div>
        )}
        {unitData.status === 'ready' && (
          <>
            <div className="space-y-2 mb-4">
              {items.map(d => {
                const p = readItemProgress(safeStore, d.grammarId);
                const done = p.recognizedAtMs !== null && p.producedAtMs !== null;
                return (
                  <button key={d.grammarId} type="button" onClick={() => openItem(d.grammarId)}
                    className={`w-full text-left p-3 rounded-2xl border min-h-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 card-interactive touch-manipulation [-webkit-tap-highlight-color:transparent] ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200 hover:border-indigo-300'}`}>
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden className={`w-6 h-6 shrink-0 grid place-items-center rounded-full text-[10px] font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {done ? <Check className="w-3.5 h-3.5" /> : <BookOpen className="w-3 h-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-gray-900">{d.pattern}</span>
                        <span className="block text-[11px] text-gray-500 truncate">{d.meaningJa}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" aria-hidden />
                    </div>
                  </button>
                );
              })}
            </div>
            {prog.complete && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <p className="text-sm font-bold text-emerald-800 mb-1">{t.n2q.unitAllDone(unit, prog.total)}</p>
                <p className="text-[11px] text-emerald-700 mb-3">{t.n2q.reviewCleared}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {unit < 12 && (
                    <button type="button" onClick={() => setUnit(unit + 1)}
                      className="flex-1 min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm action-raised action-emerald touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                      {t.n2q.toNextUnit(unit + 1)}
                    </button>
                  )}
                  {onOpenReview && (
                    <button type="button" onClick={onOpenReview}
                      className="flex-1 min-h-12 bg-white border border-emerald-300 text-emerald-700 rounded-2xl font-bold text-sm action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
                      {t.n2q.reviewInGarden}
                    </button>
                  )}
                </div>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-3">
              {t.n2q.draftNoticeSaved}
            </p>
          </>
        )}
      </div>
    );
  }

  // ── 単元一覧（12単元） ──
  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
      <button type="button" onClick={onBack}
        className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-colors active:bg-gray-100">
        <ArrowLeft className="w-4 h-4" aria-hidden />{t.n2q.back}
      </button>
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-100 to-white p-4 mb-3">
        <p className="text-[11px] font-bold text-violet-600">{t.n2q.areaBadge}</p>
        <h2 className="text-lg font-bold text-gray-900">{t.n2q.towerTitle}</h2>
        <p className="text-xs text-gray-600 mt-1">{t.n2q.towerBody}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {UNIT_NUMBERS.map(u => (
          <button key={u} type="button" onClick={() => setUnit(u)}
            className="text-left p-3.5 bg-white border border-gray-200 rounded-2xl min-h-16 hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 card-interactive touch-manipulation [-webkit-tap-highlight-color:transparent]">
            <p className="text-sm font-bold text-gray-900">{t.n2q.unitName(u)}</p>
            <p className="text-[11px] text-gray-400">{t.n2q.unitFloor(u)}</p>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">
        {t.n2q.draftNotice}
      </p>
    </div>
  );
};

export default N2GrammarQuestPanel;
