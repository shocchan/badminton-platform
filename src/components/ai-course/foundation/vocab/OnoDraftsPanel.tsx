// Phase 3P-3: オノマトペ完成draftの内部確認画面（labPreview限定・lazy chunk）。
// 人間レビューの前段。approvedへは進めない（表示のみ・§13の到達可能性を満たす）。
import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import { ONOMATOPOEIA_DRAFTS } from '../../../../lib/aiLesson/course/onomatopoeiaDrafts';
import type { OnomatopoeiaDraft } from '../../../../lib/aiLesson/course/onomatopoeiaDrafts';

const CATEGORY_JA: Record<OnomatopoeiaDraft['category'], string> = {
  giongo: '擬音語', gitaigo: '擬態語', gijougo: '擬情語',
};

export default function OnoDraftsPanel({ t, onBack }: { t: AiCourseDict; onBack: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div>
      <button type="button" onClick={onBack}
        className="min-h-11 mb-3 inline-flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="w-4 h-4" aria-hidden />{t.roadmap.back}
      </button>
      <h2 className="text-base font-bold text-gray-900 mb-1">{t.vocab.onoDraftsTitle}</h2>
      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
        {t.vocab.onoDraftsNotice(ONOMATOPOEIA_DRAFTS.length)}
      </p>
      <ul className="space-y-2">
        {ONOMATOPOEIA_DRAFTS.map((o) => {
          const open = openId === o.id;
          return (
            <li key={o.id} className="border border-gray-100 rounded-xl">
              <button type="button" onClick={() => setOpenId(open ? null : o.id)}
                className="w-full min-h-11 px-3 py-2 flex items-center justify-between text-left"
                aria-expanded={open}>
                <span className="text-sm font-bold text-gray-900">{o.surface}
                  <span className="ml-2 text-[11px] font-normal text-gray-400">{CATEGORY_JA[o.category]}・draft</span>
                </span>
                {open ? <ChevronUp className="w-4 h-4 text-gray-300" aria-hidden />
                      : <ChevronDown className="w-4 h-4 text-gray-300" aria-hidden />}
              </button>
              {open && (
                <div className="px-3 pb-3 text-xs text-gray-600 space-y-2">
                  <p><span className="font-bold">{o.meaningJa}</span><br />{o.meaningZh}</p>
                  <p className="text-gray-500">{o.nuanceZh}</p>
                  {o.examples.map((ex) => (
                    <p key={ex.ja} className="border-l-2 border-indigo-100 pl-2">{ex.ja}<br />
                      <span className="text-gray-400">{ex.zh}</span></p>
                  ))}
                  <p className="text-amber-800 bg-amber-50 rounded px-2 py-1">⚠ {o.commonMistakeZh}</p>
                  <p className="text-gray-500">Q1: {o.recognition.promptZh}（{o.recognition.options.join(' / ')}）</p>
                  <p className="text-gray-500">Q2: {o.production.promptJa}</p>
                  <p className="text-gray-500">会話: {o.conversation.starterJa}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
