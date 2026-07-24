// N2文法トラック（Phase N2-B1）。原本180項目を取り込み。learnerには approved のみ表示。
// 現状 approved=0 のため学習者には「準備中」を表示し、レビュー中の15候補は
// 明確な「未承認」バナー付きプレビューでのみ閲覧可能。合格率は表示しない。

import { useMemo, useState } from 'react';
import { ArrowLeft, Search, BookText, AlertTriangle, X, ChevronRight } from 'lucide-react';
import { N2_GRAMMAR_ITEMS } from '../../lib/aiLesson/course/n2GrammarData';
import { learnerVisible, reviewCandidates, searchGrammar, byUnit12, n2GrammarStats } from '../../lib/aiLesson/course/courseN2Grammar';
import type { N2GrammarItem } from '../../lib/aiLesson/course/courseN2Grammar';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props { t: AiCourseDict; onBack: () => void; }

export const CourseN2Grammar = ({ t, onBack }: Props) => {
  const tg = t.n2grammar;
  const stats = useMemo(() => n2GrammarStats(N2_GRAMMAR_ITEMS), []);
  const approved = useMemo(() => learnerVisible(N2_GRAMMAR_ITEMS), []);
  const candidates = useMemo(() => reviewCandidates(N2_GRAMMAR_ITEMS), []);
  const [showPreview, setShowPreview] = useState(false);
  const [q, setQ] = useState('');
  const [unit, setUnit] = useState<number | 'all'>('all');
  const [detail, setDetail] = useState<N2GrammarItem | null>(null);

  // 学習者に見せるのは approved のみ。プレビュー時のみ reviewed 候補を対象にする
  const base = showPreview ? candidates : approved;
  const list = useMemo(() => {
    let items = base;
    if (unit !== 'all') items = byUnit12(items, unit);
    return searchGrammar(items, q);
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

      {/* 状況サマリ（合格率ではない） */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{tg.total(stats.total)}</span>
        <span className="text-emerald-600">{tg.approvedCount(stats.approved)}</span>
        <span className="text-amber-600">{tg.reviewingCount(stats.reviewed)}</span>
        <span className="text-gray-400">{tg.notPassRate}</span>
      </div>

      {/* 学習者向け: approved のみ。0 のときは準備中 */}
      {!showPreview && approved.length === 0 && (
        <div className="bg-blue-50 rounded-2xl p-5 text-center mb-3">
          <BookText className="w-6 h-6 text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-gray-700">{tg.learnerEmpty}</p>
          <button type="button" onClick={() => setShowPreview(true)}
            className="mt-3 text-xs text-blue-600 font-medium underline decoration-dotted">{tg.previewToggle}</button>
        </div>
      )}

      {/* レビュー中プレビュー: 未承認バナー */}
      {showPreview && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">{tg.previewBanner}</p>
        </div>
      )}

      {(showPreview || approved.length > 0) && (
        <>
          {/* 検索＋ユニット */}
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
              <button key={g.grammarId} type="button" onClick={() => setDetail(g)}
                className="w-full text-left bg-white border border-gray-100 rounded-xl p-3 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 flex items-center gap-2.5">
                <span className="text-[11px] font-mono text-gray-300 shrink-0 w-8">{g.no}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900 truncate">{g.displayExpression}</span>
                  <span className="block text-[11px] text-gray-400 truncate">{g.meaningJa || (g.examples[0] ?? '')}</span>
                </span>
                {g.reviewStatus === 'reviewed' && <span className="text-[10px] text-amber-600 shrink-0">{tg.statusReviewing}</span>}
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* 詳細（原本情報＋要作成の明示） */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center p-0 lg:p-4" onClick={() => setDetail(null)}>
          <div className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-xl font-bold text-gray-900 break-words">{detail.displayExpression}</p>
                <p className="text-[11px] text-gray-400">{tg.sourceRow(detail.sourceRow)} ・ {detail.sourceUnit} ・ No.{detail.no}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label={tg.close}
                className="min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-medium text-gray-500">{tg.meaning}</p>
                <p className="text-sm text-gray-800">{detail.meaningJa || <span className="text-gray-400">{tg.meaningEmpty}</span>}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500">{tg.example}</p>
                <ul className="space-y-1">{detail.examples.map((e, i) => <li key={i} className="text-sm text-gray-900 leading-relaxed select-text">💬 {e}</li>)}</ul>
              </div>
              {detail.reviewFlags.length > 0 && (
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-[11px] font-medium text-amber-700 flex items-center gap-1 mb-1"><AlertTriangle className="w-3.5 h-3.5" />{tg.needsWork}</p>
                  <div className="flex flex-wrap gap-1">
                    {detail.reviewFlags.map((fl) => {
                      const label = (tg.flags as Record<string, string>)[fl];
                      return label ? <span key={fl} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-amber-200 text-amber-700">{label}</span> : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
