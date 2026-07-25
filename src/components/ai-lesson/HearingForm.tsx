// 初回ヒアリング（6問・1問ずつのカード形式）
// スマホ優先: 選択肢は縦積みの大きなボタン（44px以上）

import { useState } from 'react';
import { ChevronLeft, Sparkles } from 'lucide-react';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { HearingAnswers } from '../../lib/aiLesson/types';

interface Props {
  t: AiLessonDict['hearing'];
  onComplete: (answers: HearingAnswers) => void;
}

// 質問キーと選択肢キーの定義（辞書と対応）
const QUESTIONS = [
  { field: 'goal', dictKey: 'q1', options: ['daily', 'exchange', 'n3', 'n2', 'n1', 'work'] },
  { field: 'level', dictKey: 'q2', options: ['belowN4', 'n4', 'n3', 'n2', 'n1', 'unknown'] },
  { field: 'struggle', dictKey: 'q3', options: ['recall', 'grammar', 'vocab', 'listening', 'nervous', 'explain'] },
  { field: 'scene', dictKey: 'q4', options: ['daily', 'badminton', 'friends', 'work', 'interview', 'presentation'] },
  { field: 'correction', dictKey: 'q5', options: ['summary', 'important', 'immediate'] },
  { field: 'zhSupport', dictKey: 'q6', options: ['whenStuck', 'grammar', 'often', 'none'] },
] as const;

export const HearingForm = ({ t, onComplete }: Props) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<HearingAnswers>>({});

  const q = QUESTIONS[step];
  const qDict = t[q.dictKey] as { title: string; options: Record<string, string> };
  const selected = answers[q.field];
  const isLast = step === QUESTIONS.length - 1;

  const select = (value: string) => {
    const next = { ...answers, [q.field]: value };
    setAnswers(next);
    if (!isLast) {
      // ワンタップで次の質問へ（スマホで最速）
      setTimeout(() => setStep((s) => s + 1), 150);
    } else if (
      next.goal && next.level && next.struggle && next.scene && next.correction && next.zhSupport
    ) {
      onComplete(next as HearingAnswers);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          {t.title}
        </h1>
        <p className="text-sm text-gray-500 mt-2">{t.subtitle}</p>
      </div>

      {/* 進捗バー */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium text-gray-500">{t.progress(step + 1, QUESTIONS.length)}</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-4">{qDict.title}</h2>
        <div className="space-y-2">
          {q.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => select(opt)}
              className={`w-full min-h-11 px-4 py-3 rounded-xl border text-left text-sm font-medium transition-colors ${
                selected === opt
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 active:bg-blue-50'
              }`}
            >
              {qDict.options[opt]}
            </button>
          ))}
        </div>
      </div>

      {step > 0 && (
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          className="mt-4 min-h-11 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          {t.back}
        </button>
      )}
    </div>
  );
};
