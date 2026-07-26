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
import { ActionButton } from '../ActionButton';
import { practiceForItem } from '../../../../lib/aiLesson/course/vocabConversationPractice';
import { levelMetaOf } from '../../../../lib/aiLesson/course/vocabularyLevelMeta';
import { VOCABULARY_PACKS, computePackProgress } from '../../../../lib/aiLesson/course/vocabularyPacks';
import { NiEDirectionDiagram, WoObjectDiagram, TeimasuTimelineDiagram } from './GrammarDiagrams';

export type VocabView = 'top' | 'category' | 'detail' | 'daily' | 'all' | 'practice';
export interface VocabHubState { view: VocabView; category: VocabCategory | null; itemId: string | null }
interface Props {
  t: AiCourseDict;
  onBack: () => void;
  /** 旧・汎用会話導線（§7の根本修正でスクリプト練習モードへ置換。互換のため任意受け取り） */
  onGoConversation?: () => void;
  initial?: Partial<VocabHubState>;
  onStateChange?: (s: VocabHubState) => void;
}

const dateKey = () => new Date().toISOString().slice(0, 10);

export const VocabularyHub = ({ t, onBack, initial, onStateChange }: Props) => {
  const tv = t.vocab;
  const items = useMemo(() => allVocabularyItems(), []);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const repo = useMemo(() => createVocabProgressRepository(window.sessionStorage), []);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((v) => v + 1), []);

  const validCats: VocabCategory[] = ['verbs', 'iAdj', 'naAdj', 'nouns', 'scenes', 'all'];
  const [view, setViewRaw] = useState<VocabView>(() => {
    const v = initial?.view;
    if (v === 'practice' && initial?.itemId && itemById.has(initial.itemId)) return 'practice';
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
                  <p className="text-xs text-gray-600 mt-0.5">{tv.packProgress(pp.seenCount, pp.totalCount)}・{tv.statRemaining} {pp.remainingCount}</p>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1.5" role="img" aria-label={tv.packProgress(pp.seenCount, pp.totalCount)}>
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pp.totalCount ? Math.round((pp.seenCount / pp.totalCount) * 100) : 0}%` }} />
                  </div>
                  {/* 状態を一つの達成率へ混ぜない（§45）: 内訳は展開式 */}
                  <details className="mt-2">
                    <summary className="text-[11px] font-bold text-gray-400 cursor-pointer min-h-6">{tv.progressDetail}</summary>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-700">
                      <p className="flex justify-between"><span>{tv.statStarted}</span><span>{pp.seenCount} / {pp.totalCount}</span></p>
                      <p className="flex justify-between"><span>{tv.statsSelfKnown}</span><span>{pp.selfKnownCount} / {pp.totalCount}</span></p>
                      <p className="flex justify-between"><span>{tv.statVerifiedLabel}</span><span>{pp.verifiedCount} / {pp.totalCount}</span></p>
                      <p className="flex justify-between"><span>{tv.statRetainedLabel}</span><span>{pp.retainedCandidateCount} / {pp.totalCount}</span></p>
                    </div>
                  </details>
                  <p className="text-[10px] text-gray-400 mt-1.5">{tv.mvpPackNote}</p>
                </div>
              );
            })()}
          </div>
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
          </div>
          {/* ② カテゴリー（優先4つ大＋すべて・§7） */}
          <p className="text-xs font-bold text-gray-500 mb-2">{tv.categoriesHeading}</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {catMeta.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setView('category', key)}
                className="card-interactive min-h-16 bg-white rounded-xl border border-gray-100 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                <p className="text-sm font-bold text-gray-900 flex items-center justify-between">{label}<ArrowRight className="w-3.5 h-3.5 text-gray-300" aria-hidden /></p>
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
          <p className="text-[11px] text-gray-400 mt-3">{tv.notSavedVocab}</p>
        </div>
      )}

      {view === 'daily' && <DailyFlowView t={t} itemById={itemById} items={items} ids={daily.itemIds.filter((id) => itemById.has(id))} reasons={daily.reasons} repo={repo} onChanged={bump} onDone={() => setView('top')} onRestart={() => setView('daily')} />}
      {view === 'category' && category && <VocabCategoryList t={t} repo={repo} list={listFor(category)} query="" showSearch={false} onQuery={() => {}} onOpen={(id) => setView('detail', category, id)} />}
      {view === 'all' && <VocabCategoryList t={t} repo={repo} list={listFor('all')} query={query} showSearch onQuery={setQuery} onOpen={(id) => setView('detail', 'all', id)} />}
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
          <VocabDetailView t={t} item={item} itemById={itemById} repo={repo} onChanged={bump}
            progressLabel={idx >= 0 ? tv.categoryProgress(catLabel, idx + 1, list.length) : null}
            nextItem={nextItem} backLabel={tv.backToList(catLabel)}
            onNext={() => { trackCourse('click_ai_course_vocabulary_next', { itemId: item.id }); if (nextItem) setView('detail', category, nextItem.id); else setView(ctxCat === 'all' ? 'all' : 'category', ctxCat === 'all' ? 'all' : ctxCat); }}
            onOpenItem={(id) => setView('detail', category, id)}
            onStartPractice={practiceForItem(item.id) ? () => { trackCourse('click_ai_course_vocabulary_conversation', { itemId: item.id }); setView('practice', category, item.id); } : undefined} />
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
        <ActionButton variant="choice" selected={cur === 'self_known'} showCheck className={`flex-1 min-h-11 py-2.5 text-sm justify-center ${cur === 'self_known' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : ''}`}
          onClick={() => set('self_known')}>{tv.selfKnownBtn}</ActionButton>
        <ActionButton variant="choice" selected={cur === 'needs_review'} showCheck className={`flex-1 min-h-11 py-2.5 text-sm justify-center ${cur === 'needs_review' ? 'border-amber-400 bg-amber-50 text-amber-800' : ''}`}
          onClick={() => set('needs_review')}>{tv.needsReviewBtn}</ActionButton>
      </div>
    </div>
  );
};

const CompactCard = ({ t, repo, item, onOpen }: { t: AiCourseDict; repo: VocabProgressRepository; item: FoundationItem; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} aria-label={item.displayForm}
    className="card-interactive w-full text-left bg-white rounded-xl border border-gray-100 p-3 flex gap-3 items-center min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
    <VocabImage item={item} asset={assetForItem(item.id)} labPreview className="w-16 shrink-0" />
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

const VocabDetailView = ({ t, item, itemById, repo, onChanged, progressLabel, nextItem, backLabel, onNext, onOpenItem, onStartPractice }: {
  t: AiCourseDict; item: FoundationItem; itemById: Map<string, FoundationItem>;
  repo: VocabProgressRepository; onChanged: () => void;
  progressLabel: string | null;
  nextItem: FoundationItem | null;
  backLabel: string;
  onNext: () => void;
  onOpenItem: (id: string) => void;
  onStartPractice?: () => void;
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
  const furigana = repo.getSettings().furigana;
  const showReading = furigana === 'always' || (furigana === 'first_time' && repo.getEntry(item.id).encounterCount <= 1) || furigana === 'hard_only';
  const Diagram = item.id === 'fi-iku' || item.id === 'fi-noru' ? NiEDirectionDiagram
    : item.id === 'fi-benkyo' || item.id === 'fi-nihongo' ? WoObjectDiagram
    : item.id === 'fi-sumu' || item.id === 'fi-hataraku' ? TeimasuTimelineDiagram : null;
  return (
    <div className="space-y-3 pb-28">
      {progressLabel && <p className="text-xs font-mono text-gray-400">{progressLabel}</p>}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <VocabImage item={item} asset={assetForItem(item.id)} labPreview size="detail" className="mb-3" />
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold text-gray-900">{item.displayForm}</span>
          {showReading && <span className="text-sm text-gray-500">{item.readingKana}</span>}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{t.lab.pos[item.partOfSpeech]}</span>
          {item.verbGroup && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">{t.lab.verbGroups[item.verbGroup]}</span>}
        </div>
        <p className="text-base text-gray-800 mt-1">{item.meaningZh}</p>
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
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-bold text-gray-500 mb-1">{tv.detailUsage}</p>
        <p className="text-sm text-gray-800">{item.exampleJa}</p>
        <p className="text-xs text-gray-500">{item.exampleZh}</p>
        {item.usageNoteZh && <p className="text-xs text-amber-700 mt-1.5">💡 {item.usageNoteZh}</p>}
        {antonym && (
          <p className="text-xs text-gray-600 mt-2">{tv.antonym}: <button type="button" className="text-indigo-700 font-bold underline min-h-6" onClick={() => onOpenItem(antonym.id)}>{antonym.displayForm}（{antonym.meaningZh}）</button></p>
        )}
      </div>
      {(item.senses && item.senses.length > 1) && (
        <details className="bg-white rounded-xl border border-gray-100 p-4">
          <summary className="text-xs font-bold text-gray-500 cursor-pointer min-h-6" aria-expanded="false">{tv.senses}</summary>
          <div className="mt-1">
            {item.senses.map((sn) => <p key={sn.id} className="text-xs text-gray-700">・{sn.meaningZh}{sn.noteJa ? `（${sn.noteJa}）` : ''}</p>)}
          </div>
        </details>
      )}
      {Diagram && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-500 mb-1">{tv.detailStructure}</p>
          <Diagram t={t} />
        </div>
      )}
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

const DailyFlowView = ({ t, items, itemById, ids, reasons, repo, onChanged, onDone, onRestart }: {
  t: AiCourseDict; items: FoundationItem[]; itemById: Map<string, FoundationItem>;
  ids: string[]; reasons: Record<string, string>;
  repo: VocabProgressRepository; onChanged: () => void; onDone: () => void; onRestart: () => void;
}) => {
  const tv = t.vocab; const zh = t.locale === 'zh';
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'card' | 'quiz' | 'assess'>('card');
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
  const imgQ = buildImageToWordQuestion(item, assetForItem(item.id), items, idx + 11, true);
  const q = imgQ ?? meaningQuestionFor(t, items, item, idx + 11);
  const order = shuffledChoicesSeeded(q, idx + 3);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-500">{tv.reasons[reasons[item.id]] ?? ''}</span>
        <span className="text-xs font-mono text-gray-400">{tv.dailyStep(idx + 1, ids.length)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3" role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={ids.length}>
        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round(((idx + 1) / ids.length) * 100)}%` }} />
      </div>
      {phase === 'card' && (
        <div>
          <VocabImage item={item} asset={assetForItem(item.id)} labPreview size="detail" className="mb-3" />
          <p className="text-2xl font-bold text-gray-900">{item.displayForm}</p>
          <p className="text-sm text-gray-500">{item.readingKana}</p>
          <p className="text-base text-gray-800 mt-1">{item.meaningZh}</p>
          <p className="text-xs text-gray-500 mt-2">{item.exampleJa}／{item.exampleZh}</p>
          {item.usageNoteZh && <p className="text-xs text-amber-700 mt-1">💡 {item.usageNoteZh}</p>}
          <ActionButton variant="primary" fullWidth className="mt-4"
            onClick={() => { repo.recordEncounter(item.id, { imageViewed: true }); setPhase('quiz'); onChanged(); }}>{tv.detailCheck}</ActionButton>
        </div>
      )}
      {phase === 'quiz' && (
        <div>
          {q.type === 'image_to_word' && <VocabImage item={item} asset={assetForItem(item.id)} labPreview size="detail" className="mb-3" />}
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
              onClick={() => { const ok = picked === q.answerIndex; setJudged(ok); repo.recordTest(item.id, 'meaning', ok); onChanged(); }}>{t.lab.check}</ActionButton>
          ) : (
            <div className="mt-3" aria-live="polite">
              <p className={`text-sm font-bold ${judged ? 'text-emerald-700' : 'text-gray-700'}`}>{judged ? t.lab.correct : t.lab.notYet}</p>
              <p className="text-xs text-gray-600 mt-1">{zh ? q.explanationZh : q.explanationJa}</p>
              <ActionButton variant="primary" fullWidth className="mt-3" onClick={() => setPhase('assess')}>{t.lab.next}<ArrowRight className="w-4 h-4" aria-hidden /></ActionButton>
            </div>
          )}
        </div>
      )}
      {phase === 'assess' && (
        <div>
          <p className="text-lg font-bold text-gray-900 mb-0.5">{item.displayForm} <span className="text-sm font-normal text-gray-500">{item.readingKana}</span></p>
          <p className="text-sm text-gray-700 mb-3">{item.meaningZh}</p>
          <SelfAssessRow t={t} repo={repo} id={item.id} onChanged={onChanged} />
          {(repo.getEntry(item.id).selfAssessment === 'self_known' || repo.getEntry(item.id).selfAssessment === 'needs_review') && (
            <ActionButton variant="primary" fullWidth className="mt-3" aria-live="polite"
              onClick={() => { setIdx(idx + 1); setPhase('card'); setPicked(null); setJudged(null); }}>
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
                    className="min-h-9 px-2.5 py-1 text-xs rounded-lg border border-indigo-100 text-indigo-700 bg-indigo-50/60">{e2}</button>
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

export default VocabularyHub;
