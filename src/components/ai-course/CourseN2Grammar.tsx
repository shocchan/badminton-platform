// N2文法トラック（Phase N2-B2）。一覧は軽量インデックスのみを使い、詳細を開いた時だけ
// 本文（例文・中国語・問題）を dynamic import で読み込む（一覧では問題本文を読み込まない）。
// learner には approved のみ表示。合格率は表示しない。

import { useMemo, useState } from 'react';
import { ArrowLeft, Search, BookText, AlertTriangle, X, ChevronRight, RefreshCw } from 'lucide-react';
import { N2_GRAMMAR_INDEX } from '../../lib/aiLesson/course/n2GrammarIndex';
import type { N2GrammarIndexItem } from '../../lib/aiLesson/course/n2GrammarIndex';
import {
  learnerVisibleIndex, reviewCandidatesIndex, searchIndex, byUnit12Index, n2IndexStats, loadFullGrammar,
} from '../../lib/aiLesson/course/courseN2Grammar';
import type { N2GrammarItem } from '../../lib/aiLesson/course/courseN2Grammar';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props { t: AiCourseDict; onBack: () => void; }

const exprOf = (id: string) => N2_GRAMMAR_INDEX.find((g) => g.grammarId === id)?.displayExpression ?? id;

const Field = ({ label, value, empty, mono }: { label: string; value?: string; empty?: string; mono?: boolean }) => {
  if (!value && !empty) return null;
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className={`text-sm text-gray-800 leading-relaxed break-words ${mono ? 'font-mono text-[13px]' : ''}`}>
        {value || <span className="text-gray-400">{empty}</span>}
      </p>
    </div>
  );
};

const ListField = ({ label, items, icon }: { label: string; items?: string[]; icon?: string }) => {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <ul className="space-y-0.5">
        {items.map((it, i) => <li key={i} className="text-sm text-gray-800 leading-relaxed break-words">{icon ? `${icon} ` : '・'}{it}</li>)}
      </ul>
    </div>
  );
};

export const CourseN2Grammar = ({ t, onBack }: Props) => {
  const tg = t.n2grammar;
  const zh = t.locale === 'zh';
  const stats = useMemo(() => n2IndexStats(N2_GRAMMAR_INDEX), []);
  const approved = useMemo(() => learnerVisibleIndex(N2_GRAMMAR_INDEX), []);
  const candidates = useMemo(() => reviewCandidatesIndex(N2_GRAMMAR_INDEX), []);
  const [showPreview, setShowPreview] = useState(false);
  const [q, setQ] = useState('');
  const [unit, setUnit] = useState<number | 'all'>('all');
  // 詳細は dynamic import で読み込む（一覧＝インデックスのみ）
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<N2GrammarItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const openDetail = (grammarId: string) => {
    setOpenId(grammarId); setDetail(null); setDetailError(false); setDetailLoading(true);
    loadFullGrammar(grammarId)
      .then((full) => { setDetail(full); setDetailLoading(false); })
      .catch(() => { setDetailError(true); setDetailLoading(false); });
  };
  const closeDetail = () => { setOpenId(null); setDetail(null); setDetailError(false); };

  const base: N2GrammarIndexItem[] = showPreview ? candidates : approved;
  const list = useMemo(() => {
    let items = base;
    if (unit !== 'all') items = byUnit12Index(items, unit);
    return searchIndex(items, q);
  }, [base, unit, q]);

  return (
    <div className="max-w-md lg:max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-2">
        <button type="button" onClick={onBack} aria-label={tg.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{tg.navTitle}</h1>
          <p className="text-[11px] text-gray-400">{tg.subtitle}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{tg.total(stats.total)}</span>
        <span className="text-emerald-600">{tg.approvedCount(stats.approved)}</span>
        <span className="text-amber-600">{tg.reviewingCount(stats.reviewed + stats.draft)}</span>
        <span className="text-gray-400">{tg.notPassRate}</span>
      </div>

      {!showPreview && approved.length === 0 && (
        <div className="bg-blue-50 rounded-2xl p-5 text-center mb-3">
          <BookText className="w-6 h-6 text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-gray-700">{tg.learnerEmpty}</p>
          <button type="button" onClick={() => setShowPreview(true)}
            className="mt-3 text-xs text-blue-600 font-medium underline decoration-dotted">{tg.previewToggle}</button>
        </div>
      )}

      {showPreview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">{tg.previewBanner}</p>
        </div>
      )}

      {(showPreview || approved.length > 0) && (
        <>
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tg.search}
              className="w-full min-h-11 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
            <button type="button" onClick={() => setUnit('all')}
              className={`shrink-0 min-h-9 px-3 py-1.5 rounded-full text-xs font-medium ${unit === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{tg.allUnits}</button>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)}
                className={`shrink-0 min-h-9 px-3 py-1.5 rounded-full text-xs font-medium ${unit === u ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{tg.unitLabel}{u}</button>
            ))}
          </div>

          <div className="grid gap-1.5 lg:grid-cols-2">
            {list.map((g) => (
              <button key={g.grammarId} type="button" onClick={() => openDetail(g.grammarId)}
                className="w-full text-left bg-white border border-gray-100 rounded-xl p-3 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 flex items-center gap-2.5">
                <span className="text-[11px] font-mono text-gray-300 shrink-0 w-8">{g.no}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900 truncate">{g.displayExpression}</span>
                  <span className="block text-[11px] text-gray-400 truncate">{g.meaningShort}</span>
                </span>
                {(g.reviewStatus === 'reviewed' || g.reviewStatus === 'draft') && <span className="text-[10px] text-amber-600 shrink-0">{tg.statusReviewing}</span>}
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* 詳細（本文は dynamic import。読み込み中/失敗を表示） */}
      {openId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center p-0 lg:p-4" onClick={closeDetail}>
          <div className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-xl font-bold text-gray-900 break-words">{exprOf(openId)}</p>
                {detail && <p className="text-[11px] text-gray-400">{tg.sourceRow(detail.sourceRow)} ・ {detail.sourceUnit} ・ No.{detail.no}</p>}
              </div>
              <button type="button" onClick={closeDetail} aria-label={tg.close}
                className="min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {detailLoading && <p className="py-10 text-center text-sm text-gray-500">{t.common.loading}</p>}
            {detailError && (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-600 mb-3">{t.common.error}</p>
                <button type="button" onClick={() => openDetail(openId)}
                  className="min-h-11 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl inline-flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4" />{t.common.retry}
                </button>
              </div>
            )}

            {detail && (
              <div className="space-y-3">
                {detail.reviewStatus === 'draft' && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">{tg.draftContent}</p>
                )}
                {!detail.meaningZh && !detail.connection && detail.reviewStatus !== 'draft' && (
                  <p className="text-[11px] text-gray-400">{tg.noContentYet}</p>
                )}
                {detail.functionCategory && detail.functionCategory.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {detail.functionCategory.map((fc) => <span key={fc} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{fc}</span>)}
                  </div>
                )}
                <Field label={tg.meaning} value={detail.meaningJa} empty={tg.meaningEmpty} />
                <Field label={tg.meaningZh} value={detail.meaningZh} />
                <Field label={tg.connection} value={detail.connection} />
                <Field label={tg.nuance} value={zh ? detail.nuanceZh : detail.nuanceJa} />
                <ListField label={tg.situations} items={detail.situations} />

                {/* 多義語の用法分離（senses） */}
                {detail.senses && detail.senses.length > 0 && (
                  <div className="space-y-2">
                    {detail.senses.map((s) => (
                      <div key={s.senseId} className="bg-indigo-50/60 rounded-xl p-3">
                        <p className="text-sm font-bold text-indigo-800">{s.meaningJa}</p>
                        <p className="text-[12px] text-indigo-700">{s.meaningZh}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{tg.connection}: {s.connection}</p>
                        <ul className="mt-1 space-y-0.5">{s.examples.map((e, i) => <li key={i} className="text-sm text-gray-800">💬 {e}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-medium text-gray-500">{tg.example}（原本）</p>
                  <ul className="space-y-1">{detail.examples.map((e, i) => <li key={i} className="text-sm text-gray-900 leading-relaxed select-text">💬 {e}</li>)}</ul>
                </div>
                <ListField label={tg.convExamples} items={detail.conversationExamples} icon="💬" />
                <ListField label={tg.readingExamples} items={detail.readingExamples} icon="📖" />
                <ListField label={tg.listeningExamples} items={detail.listeningExamples} icon="🎧" />
                <Field label={tg.differences} value={zh ? detail.differencesZh : detail.differencesJa} />
                <ListField label={tg.mistakesLabel} items={detail.commonMistakes} icon="⚠️" />
                <Field label={tg.chineseNotes} value={detail.chineseSpeakerNotes} />
                <Field label={tg.template} value={detail.substitutionTemplate} mono />
                {detail.similarGrammarIds && detail.similarGrammarIds.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-gray-500">{tg.similar}</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.similarGrammarIds.map((sid) => (
                        <button key={sid} type="button" onClick={() => openDetail(sid)}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100">{exprOf(sid)}</button>
                      ))}
                    </div>
                  </div>
                )}
                {detail.quizzes && detail.quizzes.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-gray-500 mb-1">{tg.quizzes}（{detail.quizzes.length}）</p>
                    <div className="space-y-2">
                      {detail.quizzes.map((qz) => (
                        <div key={qz.questionId} className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-sm text-gray-900">{qz.prompt}</p>
                          <ol className="mt-1 space-y-0.5">
                            {qz.choices.map((c, ci) => (
                              <li key={ci} className={`text-xs ${ci === qz.correctAnswer ? 'text-emerald-700 font-bold' : 'text-gray-600'}`}>
                                {ci === qz.correctAnswer ? '✓ ' : '・'}{c}
                              </li>
                            ))}
                          </ol>
                          <p className="text-[11px] text-gray-500 mt-1">{tg.explanation}: {zh ? qz.explanationZh : qz.explanationJa}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail.reviewFlags.length > 0 && (
                  <div className="bg-amber-50 rounded-xl p-3">
                    <p className="text-[11px] font-medium text-amber-700 flex items-center gap-1 mb-1"><AlertTriangle className="w-3.5 h-3.5" />{tg.needsWork}</p>
                    <div className="flex flex-wrap gap-1">
                      {detail.reviewFlags.map((fl) => {
                        const label = (tg.flags as Record<string, string>)[fl] ?? fl;
                        return <span key={fl} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-amber-200 text-amber-700">{label}</span>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
