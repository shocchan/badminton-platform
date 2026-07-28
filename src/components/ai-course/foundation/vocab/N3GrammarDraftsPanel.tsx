// Phase 3P-4: N3文法完成draftの内部確認画面（labPreview限定・lazy chunk）。
// 人間レビューの前段。approvedへは進めない（表示のみ）。
import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import { N3_GRAMMAR_DRAFTS } from '../../../../lib/aiLesson/course/n3GrammarDrafts';

const REGISTER_JA: Record<string, string> = { spoken: '会話', written: '書き言葉', both: '会話・書き言葉' };

export default function N3GrammarDraftsPanel({ t, onBack }: { t: AiCourseDict; onBack: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div>
      <button type="button" onClick={onBack}
        className="min-h-11 mb-3 inline-flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="w-4 h-4" aria-hidden />{t.roadmap.back}
      </button>
      <h2 className="text-base font-bold text-gray-900 mb-1">{t.vocab.n3GrammarDraftsTitle}</h2>
      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
        {t.vocab.n3GrammarDraftsNotice(N3_GRAMMAR_DRAFTS.length)}
      </p>
      <ul className="space-y-2">
        {N3_GRAMMAR_DRAFTS.map((d) => {
          const open = openId === d.grammarId;
          return (
            <li key={d.grammarId} className="border border-gray-100 rounded-xl">
              <button type="button" onClick={() => setOpenId(open ? null : d.grammarId)}
                className="w-full min-h-11 px-3 py-2 flex items-center justify-between text-left"
                aria-expanded={open}>
                <span className="text-sm font-bold text-gray-900">{d.pattern}
                  <span className="ml-2 text-[11px] font-normal text-gray-400">
                    {REGISTER_JA[d.register]}・draft</span>
                </span>
                {open ? <ChevronUp className="w-4 h-4 text-gray-300" aria-hidden />
                      : <ChevronDown className="w-4 h-4 text-gray-300" aria-hidden />}
              </button>
              {open && (
                <div className="px-3 pb-3 text-xs text-gray-600 space-y-2">
                  <p><span className="font-bold">{d.meaningJa}</span><br />{d.explanationZh}</p>
                  <p className="text-gray-500">接続: {d.formation}</p>
                  <p className="text-gray-500">{d.usageScene}</p>
                  {d.examplesJa.map((e, i) => (
                    <p key={e} className="border-l-2 border-indigo-100 pl-2">{e}<br />
                      <span className="text-gray-400">{d.examplesZh[i]}</span></p>
                  ))}
                  <p className="text-amber-800 bg-amber-50 rounded px-2 py-1">⚠ {d.commonMistakesZh}</p>
                  <p className="text-gray-500">対比: {d.contrast}</p>
                  <p className="text-gray-500">Q1: {d.recognition.promptZh}</p>
                  <p className="text-gray-500">Q2: {d.production.promptJa}</p>
                  <p className="text-gray-500">会話: {d.practice.starterJa}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
