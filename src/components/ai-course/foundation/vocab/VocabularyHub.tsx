// ことば図鑑（Phase 2C+ §6-§7・§18-§26）。labPreview限定・lazy chunk。
// トップは3ブロックのみ（今日のことば／カテゴリー／復習したいことば・§7）。
// 進捗はsessionStorage試作Repository。自己評価と検証状態は分離（§20）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, MessageCircle } from 'lucide-react';
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
import { NiEDirectionDiagram, WoObjectDiagram, TeimasuTimelineDiagram } from './GrammarDiagrams';

export type VocabView = 'top' | 'category' | 'detail' | 'daily' | 'all';
export interface VocabHubState { view: VocabView; category: VocabCategory | null; itemId: string | null }
interface Props {
  t: AiCourseDict;
  onBack: () => void;
  onGoConversation: () => void;   // AI会話への補助導線（既存会話ホームへ・§34）
  initial?: Partial<VocabHubState>;
  onStateChange?: (s: VocabHubState) => void;
}

const dateKey = () => new Date().toISOString().slice(0, 10);

export const VocabularyHub = ({ t, onBack, onGoConversation, initial, onStateChange }: Props) => {
  const tv = t.vocab;
  const items = useMemo(() => allVocabularyItems(), []);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const repo = useMemo(() => createVocabProgressRepository(window.sessionStorage), []);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((v) => v + 1), []);

  const validCats: VocabCategory[] = ['verbs', 'iAdj', 'naAdj', 'nouns', 'scenes', 'all'];
  const [view, setViewRaw] = useState<VocabView>(() => {
    const v = initial?.view;
    if (v === 'detail' && initial?.itemId && itemById.has(initial.itemId)) return 'detail';
    if (v === 'category' && initial?.category && validCats.includes(initial.category)) return 'category';
    if (v === 'daily' || v === 'all') return v;
    return 'top';
  });
  const [category, setCategory] = useState<VocabCategory | null>(initial?.category && validCats.includes(initial.category) ? initial.category : null);
  const [itemId, setItemId] = useState<string | null>(initial?.itemId && itemById.has(initial.itemId) ? initial.itemId : null);
  const [query, setQuery] = useState('');
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
  const reviewIds = repo.getReviewItemIds().filter((id) => itemById.has(id));
  const stats = repo.getStats();


  const listFor = (cat: VocabCategory): FoundationItem[] => vocabByCategory(items, cat);
  const catMeta: { key: VocabCategory; label: string }[] = [
    { key: 'verbs', label: tv.catVerbs }, { key: 'iAdj', label: tv.catIAdj },
    { key: 'naAdj', label: tv.catNaAdj }, { key: 'nouns', label: tv.catNouns },
  ];

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => (view === 'top' ? onBack() : setView(view === 'detail' && category ? 'category' : 'top', view === 'detail' ? category : null))}
          aria-label={t.roadmap.back} className="min-h-11 min-w-11 flex items-center justify-center text-gray-500"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-indigo-600" />{tv.title}</h1>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{t.lab.betaBadge}</span>
      </div>

      {view === 'top' && (
        <div>
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
              className="w-full min-h-12 py-3 bg-white text-indigo-700 font-bold rounded-xl">{tv.dailyCta}</button>
          </div>
          {/* ② カテゴリー（優先4つ大＋すべて・§7） */}
          <p className="text-xs font-bold text-gray-500 mb-2">{tv.categoriesHeading}</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {catMeta.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setView('category', key)}
                className="min-h-16 bg-white rounded-xl border border-gray-100 p-3 text-left">
                <p className="text-sm font-bold text-gray-900">{label}</p>
                <p className="text-[11px] text-gray-400">{tv.wordsCount(listFor(key).length)}</p>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setView('all', 'all')}
            className="w-full min-h-11 py-2 mb-4 text-sm text-indigo-700 border border-indigo-100 rounded-xl">{tv.catAll}・{tv.catScenes}</button>
          {/* ③ 復習したいことば（§7第三表示） */}
          <p className="text-xs font-bold text-gray-500 mb-2">{tv.reviewHeading}</p>
          {reviewIds.length === 0 ? (
            <p className="text-sm text-gray-400 bg-white border border-gray-100 rounded-xl p-4">{tv.emptyReview}</p>
          ) : (
            <div className="space-y-2">
              {reviewIds.slice(0, 3).map((id) => <CompactCard key={id} t={t} repo={repo} item={itemById.get(id)!} onOpen={() => setView('detail', null, id)} />)}
            </div>
          )}
          {/* 語彙の成長（§33・断定表現なし） */}
          <div className="grid grid-cols-4 gap-1.5 mt-4">
            {[[tv.statsSeen, stats.seenCount], [tv.statsSelfKnown, stats.selfKnownCount], [tv.statsVerified, stats.verifiedCount], [tv.statsRetained, stats.retainedCandidateCount]].map(([label, n]) => (
              <div key={label as string} className="bg-white rounded-xl border border-gray-100 p-2 text-center">
                <p className="text-base font-bold text-gray-900">{n as number}</p>
                <p className="text-[9px] text-gray-500 leading-tight">{label as string}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">{tv.notSavedVocab}</p>
        </div>
      )}

      {view === 'daily' && <DailyFlowView t={t} itemById={itemById} items={items} ids={daily.itemIds.filter((id) => itemById.has(id))} reasons={daily.reasons} repo={repo} onChanged={bump} onDone={() => setView('top')} />}
      {view === 'category' && category && <VocabCategoryList t={t} repo={repo} list={listFor(category)} query="" showSearch={false} onQuery={() => {}} onOpen={(id) => setView('detail', category, id)} />}
      {view === 'all' && <VocabCategoryList t={t} repo={repo} list={listFor('all')} query={query} showSearch onQuery={setQuery} onOpen={(id) => setView('detail', 'all', id)} />}
      {view === 'detail' && itemId && itemById.get(itemId) && <VocabDetailView t={t} item={itemById.get(itemId)!} itemById={itemById} repo={repo} onChanged={bump} onOpenItem={(id) => setView('detail', category, id)} onGoConversation={onGoConversation} />}
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

const SelfAssessRow = ({ t, repo, id, onChanged }: { t: AiCourseDict; repo: VocabProgressRepository; id: string; onChanged: () => void }) => {
  const tv = t.vocab;
  const cur = repo.getEntry(id).selfAssessment;
  const set = (sa: 'self_known' | 'needs_review') => {
    repo.setSelfAssessment(id, sa);
    trackCourse('set_ai_course_vocabulary_self_assessment', { itemId: id, selfAssessment: sa });
    onChanged();
  };
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1.5">{tv.selfPrompt}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => set('self_known')} aria-pressed={cur === 'self_known'}
          className={`flex-1 min-h-11 py-2.5 text-sm font-bold rounded-xl border-2 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-indigo-400 ${cur === 'self_known' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600'}`}>
          {cur === 'self_known' && <Check className="w-4 h-4" aria-hidden />}{tv.selfKnownBtn}
        </button>
        <button type="button" onClick={() => set('needs_review')} aria-pressed={cur === 'needs_review'}
          className={`flex-1 min-h-11 py-2.5 text-sm font-bold rounded-xl border-2 flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-indigo-400 ${cur === 'needs_review' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600'}`}>
          {cur === 'needs_review' && <Check className="w-4 h-4" aria-hidden />}{tv.needsReviewBtn}
        </button>
      </div>
    </div>
  );
};

const CompactCard = ({ t, repo, item, onOpen }: { t: AiCourseDict; repo: VocabProgressRepository; item: FoundationItem; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className="w-full text-left bg-white rounded-xl border border-gray-100 p-3 flex gap-3 items-center min-h-11">
    <VocabImage item={item} asset={assetForItem(item.id)} labPreview className="w-16 shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-base font-bold text-gray-900">{item.displayForm}</span>
        <span className="text-xs text-gray-500">{item.readingKana}</span>
      </div>
      <p className="text-xs text-gray-600 truncate">{item.meaningZh}</p>
    </div>
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{t.vocab.states[repo.getEntry(item.id).selfAssessment]}</span>
  </button>
);

const VocabCategoryList = ({ t, repo, list, query, showSearch, onQuery, onOpen }: {
  t: AiCourseDict; repo: VocabProgressRepository; list: FoundationItem[];
  query: string; showSearch: boolean; onQuery: (q: string) => void; onOpen: (id: string) => void;
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
        {filtered.map((it) => <CompactCard key={it.id} t={t} repo={repo} item={it} onOpen={() => onOpen(it.id)} />)}
      </div>
      {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-8">{t.lab.emptyWords}</p>}
    </div>
  );
};

const VocabDetailView = ({ t, item, itemById, repo, onChanged, onOpenItem, onGoConversation }: {
  t: AiCourseDict; item: FoundationItem; itemById: Map<string, FoundationItem>;
  repo: VocabProgressRepository; onChanged: () => void; onOpenItem: (id: string) => void; onGoConversation: () => void;
}) => {
  const tv = t.vocab;
  useEffect(() => {
    repo.recordEncounter(item.id, { imageViewed: !!assetForItem(item.id) });
    trackCourse('view_ai_course_vocabulary_item', { itemId: item.id, partOfSpeech: item.partOfSpeech });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- item表示ごとに1回
  }, [item.id]);
  const antonym = item.antonymId ? itemById.get(item.antonymId) : null;
  const Diagram = item.id === 'fi-iku' || item.id === 'fi-noru' ? NiEDirectionDiagram
    : item.id === 'fi-benkyo' || item.id === 'fi-nihongo' ? WoObjectDiagram
    : item.id === 'fi-sumu' || item.id === 'fi-hataraku' ? TeimasuTimelineDiagram : null;
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <VocabImage item={item} asset={assetForItem(item.id)} labPreview size="detail" className="mb-3" />
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold text-gray-900">{item.displayForm}</span>
          <span className="text-sm text-gray-500">{item.readingKana}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{t.lab.pos[item.partOfSpeech]}</span>
          {item.verbGroup && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">{t.lab.verbGroups[item.verbGroup]}</span>}
        </div>
        <p className="text-base text-gray-800 mt-1">{item.meaningZh}</p>
        <div className="mt-3"><SelfAssessRow t={t} repo={repo} id={item.id} onChanged={onChanged} /></div>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-bold text-gray-500 mb-1">{tv.detailUsage}</p>
        <p className="text-sm text-gray-800">{item.exampleJa}</p>
        <p className="text-xs text-gray-500">{item.exampleZh}</p>
        {item.usageNoteZh && <p className="text-xs text-amber-700 mt-1.5">💡 {item.usageNoteZh}</p>}
        {item.senses && item.senses.length > 1 && (
          <div className="mt-2 border-t border-gray-50 pt-2">
            <p className="text-[11px] font-bold text-gray-400 mb-1">{tv.senses}</p>
            {item.senses.map((sn) => <p key={sn.id} className="text-xs text-gray-700">・{sn.meaningZh}{sn.noteJa ? `（${sn.noteJa}）` : ''}</p>)}
          </div>
        )}
        {antonym && (
          <p className="text-xs text-gray-600 mt-2">{tv.antonym}: <button type="button" className="text-indigo-700 font-bold underline min-h-6" onClick={() => onOpenItem(antonym.id)}>{antonym.displayForm}（{antonym.meaningZh}）</button></p>
        )}
      </div>
      {Diagram && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-500 mb-1">{tv.detailStructure}</p>
          <Diagram t={t} />
        </div>
      )}
      <button type="button" onClick={onGoConversation}
        className="w-full min-h-11 py-2.5 text-sm font-bold text-indigo-700 border border-indigo-200 rounded-xl flex items-center justify-center gap-1.5">
        <MessageCircle className="w-4 h-4" />{tv.detailConversation}
      </button>
      <p className="text-[11px] text-gray-400">{tv.notSavedVocab}</p>
    </div>
  );
};

const DailyFlowView = ({ t, items, itemById, ids, reasons, repo, onChanged, onDone }: {
  t: AiCourseDict; items: FoundationItem[]; itemById: Map<string, FoundationItem>;
  ids: string[]; reasons: Record<string, string>;
  repo: VocabProgressRepository; onChanged: () => void; onDone: () => void;
}) => {
  const tv = t.vocab; const zh = t.locale === 'zh';
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'card' | 'quiz' | 'assess'>('card');
  const [picked, setPicked] = useState<number | null>(null);
  const [judged, setJudged] = useState<boolean | null>(null);
  if (ids.length === 0) return <p className="text-sm text-gray-400 text-center py-8">{tv.emptyReview}</p>;
  if (idx >= ids.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
        <p className="text-base font-bold text-gray-900 mb-1">{tv.dailyDone}</p>
        <p className="text-sm text-gray-600 mb-4">{tv.dailyDoneBody}</p>
        <button type="button" onClick={() => { trackCourse('complete_ai_course_daily_words'); onDone(); }} className="w-full min-h-12 py-3 bg-indigo-600 text-white font-bold rounded-xl">{tv.backToVocabTop}</button>
        <p className="text-[11px] text-gray-400 mt-3">{tv.notSavedVocab}</p>
      </div>
    );
  }
  const item = itemById.get(ids[idx])!;
  // 画像が表示可能なら画像→ことば問題、無ければ意味問題（画像ロード不可でも回答可能・§44）
  const imgQ = buildImageToWordQuestion(item, assetForItem(item.id), items, idx + 11, true);
  const q = imgQ ?? meaningQuestionFor(t, items, item, idx + 11);
  const order = shuffledChoicesSeeded(q, idx + 3);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-500">{tv.reasons[reasons[item.id]] ?? ''}</span>
        <span className="text-xs font-mono text-gray-400">{tv.dailyStep(idx + 1, ids.length)}</span>
      </div>
      {phase === 'card' && (
        <div>
          <VocabImage item={item} asset={assetForItem(item.id)} labPreview size="detail" className="mb-3" />
          <p className="text-2xl font-bold text-gray-900">{item.displayForm}</p>
          <p className="text-sm text-gray-500">{item.readingKana}</p>
          <p className="text-base text-gray-800 mt-1">{item.meaningZh}</p>
          <p className="text-xs text-gray-500 mt-2">{item.exampleJa}／{item.exampleZh}</p>
          {item.usageNoteZh && <p className="text-xs text-amber-700 mt-1">💡 {item.usageNoteZh}</p>}
          <button type="button" onClick={() => { repo.recordEncounter(item.id, { imageViewed: true }); setPhase('quiz'); onChanged(); }}
            className="w-full min-h-12 py-3 mt-4 bg-indigo-600 text-white font-bold rounded-xl">{tv.detailCheck}</button>
        </div>
      )}
      {phase === 'quiz' && (
        <div>
          {q.type === 'image_to_word' && <VocabImage item={item} asset={assetForItem(item.id)} labPreview size="detail" className="mb-3" />}
          <p className="text-sm font-bold text-gray-900 mb-3">{zh ? q.promptZh : q.promptJa}</p>
          <div className="space-y-2">
            {order.map((orig) => (
              <button key={orig} type="button" disabled={judged !== null} onClick={() => setPicked(orig)} aria-pressed={picked === orig}
                className={`w-full min-h-12 px-4 py-3 text-left text-base rounded-xl border-2 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  judged !== null && orig === q.answerIndex ? 'border-emerald-400 bg-emerald-50'
                    : picked === orig ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                <span className="flex-1">{q.choices![orig]}</span>
                {picked === orig && judged === null && <Check className="w-4 h-4 text-indigo-600" aria-hidden />}
              </button>
            ))}
          </div>
          {judged === null ? (
            <button type="button" disabled={picked === null}
              onClick={() => { const ok = picked === q.answerIndex; setJudged(ok); repo.recordTest(item.id, 'meaning', ok); onChanged(); }}
              className="w-full min-h-12 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl disabled:opacity-40">{t.lab.check}</button>
          ) : (
            <div className="mt-3" aria-live="polite">
              <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-gray-700'}`}>{judged ? t.lab.correct : t.lab.notYet}</p>
              <p className="text-xs text-gray-600 mt-1">{zh ? q.explanationZh : q.explanationJa}</p>
              <button type="button" onClick={() => setPhase('assess')} className="w-full min-h-11 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-1.5">{t.lab.next}<ArrowRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}
      {phase === 'assess' && (
        <div>
          <p className="text-lg font-bold text-gray-900 mb-0.5">{item.displayForm} <span className="text-sm font-normal text-gray-500">{item.readingKana}</span></p>
          <p className="text-sm text-gray-700 mb-3">{item.meaningZh}</p>
          <SelfAssessRow t={t} repo={repo} id={item.id} onChanged={onChanged} />
          <button type="button" onClick={() => { setIdx(idx + 1); setPhase('card'); setPicked(null); setJudged(null); }}
            className="w-full min-h-11 py-3 mt-3 bg-indigo-600 text-white font-bold rounded-xl">{t.lab.next}</button>
        </div>
      )}
    </div>
  );
};

export default VocabularyHub;
