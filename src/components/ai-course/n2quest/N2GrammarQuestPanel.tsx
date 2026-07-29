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

const browserStore = typeof window === 'undefined' ? null : window.localStorage;
const safeStore = browserStore ?? { getItem: () => null, setItem: () => {} };
const now = () => Date.now();

export interface N2GrammarQuestPanelProps {
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

/** 同義判断待ち7件も学習対象として表示する（内部メタは出さない） */
const loadUnitItems = async (unit: number): Promise<N2GrammarDraft[]> => {
  const [drafts, pre] = await Promise.all([
    loadN2DraftsByUnit(unit),
    import('../../../lib/aiLesson/course/n2GrammarPredraftsAwaitingMerge')
      .then(m => m.N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE.filter(d => d.unit === unit)),
  ]);
  const seen = new Set(drafts.map(d => d.grammarId));
  return [...drafts, ...pre.filter(d => !seen.has(d.grammarId))]
    .sort((a, b) => a.grammarId.localeCompare(b.grammarId));
};

export const N2GrammarQuestPanel = ({ onBack, onOpenReview, onGoConversation }: N2GrammarQuestPanelProps) => {
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
          className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
          <ArrowLeft className="w-4 h-4" aria-hidden />第{unit}単元の一覧へ
        </button>

        {/* ヘッダー（塔の文脈＋文型） */}
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-violet-600">ソラノ塔・第{unit}単元・{idx + 1}/{items.length}</p>
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
              <div><dt className="text-[11px] text-gray-400">接続</dt><dd className="text-gray-800">{active.formation}</dd></div>
              <div><dt className="text-[11px] text-gray-400">使う場面</dt><dd className="text-gray-800">{active.usageScene}</dd></div>
              <div><dt className="text-[11px] text-gray-400">ニュアンス</dt><dd className="text-gray-800">{active.nuance}</dd></div>
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
              <p className="text-[11px] font-bold text-amber-800">よくある間違い</p>
              <p className="text-xs text-amber-900">{active.commonMistakesZh}</p>
            </div>
            {active.learnerFocus && (
              <p className="text-xs text-gray-500 mt-2">{active.learnerFocus}</p>
            )}
            {active.similarPatterns.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">似ている文型: {active.similarPatterns.join('・')}（{active.contrast}）</p>
            )}
            <button type="button" onClick={() => setPhase('quiz')}
              className="w-full min-h-12 mt-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
              確認問題へ
            </button>
          </div>
        )}

        {phase === 'quiz' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-indigo-500 mb-1">確認問題</p>
            <p className="text-sm font-bold text-gray-900 mb-3">{active.recognition.promptZh}</p>
            <div className="space-y-2" role="group" aria-label="選択肢">
              {shuffled.options.map((opt, i) => {
                const isAnswer = i === shuffled.answerIndex;
                const chosen = picked === i;
                return (
                  <button key={i} type="button" disabled={judged !== null}
                    onClick={() => setPicked(i)}
                    className={`w-full text-left min-h-11 px-3 py-2 rounded-xl border text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
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
                className="w-full min-h-12 mt-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm disabled:opacity-40">
                こたえあわせ
              </button>
            ) : (
              <div className="mt-3">
                <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {judged ? '正解です' : 'もう一度考えてみましょう'}
                </p>
                <p className="text-xs text-gray-600 mt-1">{active.recognition.explanationZh}</p>
                {judged ? (
                  <button type="button" onClick={() => setPhase('produce')}
                    className="w-full min-h-12 mt-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm">
                    使用練習へ
                  </button>
                ) : (
                  <button type="button" onClick={() => { setPicked(null); setJudged(null); }}
                    className="w-full min-h-12 mt-3 bg-white border border-indigo-200 text-indigo-700 rounded-2xl font-bold text-sm">
                    もう一度えらぶ
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'produce' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-indigo-500 mb-1">使用練習</p>
            <p className="text-sm font-bold text-gray-900">{active.production.promptJa}</p>
            <p className="text-xs text-gray-500 mb-3">{active.production.promptZh}</p>
            <textarea value={producedText} onChange={e => { setProducedText(e.target.value); setProduceResult(null); }}
              rows={3} aria-label="自分の文を書く"
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder={`「${active.pattern}」を使って書いてみましょう`} />
            {produceResult === 'ok' && (
              <p className="text-sm font-bold text-emerald-700 mt-2">「{active.pattern}」が使えました</p>
            )}
            {produceResult === 'retry' && (
              <p className="text-sm text-amber-700 mt-2">「{active.pattern}」を文の中に入れてみましょう（例: {active.examplesJa[1] ?? active.examplesJa[0]}）</p>
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
                className="flex-1 min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">
                書けたか確認する
              </button>
              <button type="button"
                onClick={() => { markProduced(safeStore, active.grammarId, now()); setPhase('done'); }}
                className="flex-1 min-h-12 bg-white border border-gray-200 text-gray-600 rounded-2xl font-bold text-sm">
                今日は読むだけにする
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="bg-white border border-emerald-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-emerald-800 mb-1">
              <Check className="inline w-4 h-4 -mt-0.5" aria-hidden /> 「{active.pattern}」の学習を記録しました（この端末）
            </p>
            <p className="text-xs text-gray-600 mb-3">会話の中で使うと、いちばん定着します。</p>
            <div className="p-2.5 bg-gray-50 rounded-xl mb-3">
              <p className="text-[11px] text-gray-400">会話のきっかけ</p>
              <p className="text-sm text-gray-800">{active.practice.starterJa}</p>
              <p className="text-xs text-gray-500">{active.practice.starterZh}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {nextItem ? (
                <button type="button" onClick={() => openItem(nextItem.grammarId)}
                  className="flex-1 min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">
                  次の文型「{nextItem.pattern}」へ
                </button>
              ) : (
                <button type="button" onClick={backToList}
                  className="flex-1 min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm">
                  単元の結果を見る
                </button>
              )}
              {onGoConversation && (
                <button type="button" onClick={onGoConversation}
                  className="flex-1 min-h-12 bg-white border border-indigo-200 text-indigo-700 rounded-2xl font-bold text-sm">
                  会話の広場で使ってみる
                </button>
              )}
            </div>
          </div>
        )}

        {prog.recognizedAtMs !== null && phase === 'detail' && (
          <p className="text-[11px] text-gray-400 mt-2">この文型は一度学習済みです。復習として読み直せます。</p>
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
          className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
          <ArrowLeft className="w-4 h-4" aria-hidden />単元一覧へ
        </button>
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-3 mb-3">
          <p className="text-[11px] text-violet-600">ソラノ塔（N2文法）</p>
          <h2 className="text-lg font-bold text-gray-900">第{unit}単元</h2>
          {unitData.status === 'ready' && (
            <p className="text-xs text-gray-500">{prog.done}/{prog.total}文型が完了</p>
          )}
        </div>

        {unitData.status === 'loading' && (
          <div className="py-10 text-center text-sm text-gray-500" role="status">塔の書物を開いています…</div>
        )}
        {unitData.status === 'error' && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
            <p className="text-sm font-bold text-rose-800 mb-2">内容を読み込めませんでした</p>
            <button type="button" onClick={() => { const u = unit; setUnit(null); setTimeout(() => setUnit(u), 0); }}
              className="min-h-11 px-5 bg-rose-600 text-white rounded-2xl font-bold text-sm">もう一度読み込む</button>
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
                    className={`w-full text-left p-3 rounded-2xl border min-h-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200 hover:border-indigo-300'}`}>
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
                <p className="text-sm font-bold text-emerald-800 mb-1">第{unit}単元・全{prog.total}文型を学びました</p>
                <p className="text-[11px] text-emerald-700 mb-3">塔の霧がひとつ晴れました。忘れたころの再会が定着のちからになります。</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {unit < 12 && (
                    <button type="button" onClick={() => setUnit(unit + 1)}
                      className="flex-1 min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm">
                      第{unit + 1}単元へ
                    </button>
                  )}
                  {onOpenReview && (
                    <button type="button" onClick={onOpenReview}
                      className="flex-1 min-h-12 bg-white border border-emerald-300 text-emerald-700 rounded-2xl font-bold text-sm">
                      オモイデ庭園で復習する
                    </button>
                  )}
                </div>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-3">
              内容はAIが作成した草稿で、先生の確認を順次進めています。学習記録はこの端末に保存されます。
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
        className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
        <ArrowLeft className="w-4 h-4" aria-hidden />もどる
      </button>
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-100 to-white p-4 mb-3">
        <p className="text-[11px] font-bold text-violet-600">ミナモ列島・第8エリア</p>
        <h2 className="text-lg font-bold text-gray-900">ソラノ塔（N2文法攻略）</h2>
        <p className="text-xs text-gray-600 mt-1">180の文型が12の階に分かれています。高く登るほど、書き言葉と改まった表現になります。</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {UNIT_NUMBERS.map(u => (
          <button key={u} type="button" onClick={() => setUnit(u)}
            className="text-left p-3.5 bg-white border border-gray-200 rounded-2xl min-h-16 hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
            <p className="text-sm font-bold text-gray-900">第{u}単元</p>
            <p className="text-[11px] text-gray-400">{u}階の文型を学ぶ</p>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">
        内容はAIが作成した草稿で、先生の確認を順次進めています。
      </p>
    </div>
  );
};

export default N2GrammarQuestPanel;
