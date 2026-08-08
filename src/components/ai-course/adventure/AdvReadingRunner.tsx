// 読解runner（COMPLETION §6・§16）。
// 本文を読みながら解く。mobileで本文と設問が行き来しやすいことを優先。
import { pressFx, riseIn, popIn } from './advUi';
import { useMemo, useState } from 'react';
import type { ReadingSet } from '../../../lib/aiLesson/course/adventure/reading/readingBank';
import { READING_TYPE_LABELS } from '../../../lib/aiLesson/course/adventure/reading/readingBank';
import { presentQuestion } from '../../../lib/aiLesson/course/adventure/advChoiceOrder';
import { readingToQuestion } from '../../../lib/aiLesson/course/adventure/reading/readingBank';
import { nowTrainingLabel } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { JaTermText } from './JaTermText';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface AdvReadingRunnerProps {
  lang: L;
  sets: ReadingSet[];
  onFinish: (result: { correct: number; total: number; keys: string[]; wrongKeys: string[]; elapsedSec: number }) => void;
  onClose: () => void;
}

export function AdvReadingRunner({ lang, sets, onFinish, onClose }: AdvReadingRunnerProps) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongKeys, setWrongKeys] = useState<string[]>([]);
  const [startedAt] = useState(() => Date.now());
  const [attemptSeed] = useState(() => Date.now());

  const set = sets[idx];
  const presented = useMemo(
    () => (set ? presentQuestion(readingToQuestion(set), attemptSeed) : null),
    [set, attemptSeed],
  );

  if (!set || !presented) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
        <p className="mb-4 text-sm text-gray-700">
          {tx(lang, '出題できる読解問題がありません。', '暂时没有可出的阅读题。')}
        </p>
        <button type="button" className={`${pressFx} action-secondary min-h-[44px] rounded-xl border border-gray-300 bg-white px-6 py-2`} onClick={onClose}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  const advance = () => {
    const ok = picked === presented.correctChoiceId;
    const nextCorrect = correctCount + (ok ? 1 : 0);
    const nextWrong = ok ? wrongKeys : [...wrongKeys, `read:${set.setId}`];
    if (idx + 1 < sets.length) {
      setCorrectCount(nextCorrect);
      setWrongKeys(nextWrong);
      setIdx(idx + 1);
      setPicked(null);
      setAnswered(false);
      return;
    }
    trackAdv('reading_completed', { locale: lang, skillType: 'reading' });
    onFinish({
      correct: nextCorrect, total: sets.length,
      keys: sets.map((s) => `read:${s.setId}`), wrongKeys: nextWrong,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6" aria-label={tx(lang, '読解', '阅读')}>
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>{tx(lang, READING_TYPE_LABELS[set.readingType].ja, READING_TYPE_LABELS[set.readingType].zh)}</span>
        <span>{idx + 1}/{sets.length}・{tx(lang, `目安${set.estimatedSeconds}秒`, `参考${set.estimatedSeconds}秒`)}</span>
      </div>
      <p className="mb-3 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {tx(lang, '今鍛えている試験力', '正在锻炼的考试能力')}：{nowTrainingLabel('reading', lang)}
      </p>

      {lang === 'zh' && (
        <p className="mb-2 text-xs text-gray-500">{set.contextZh}</p>
      )}
      {/* 本文。mobileでも読みやすい行長・行間にする */}
      <div className="mb-4 max-h-[46vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4">
        <p lang="ja" className="whitespace-pre-wrap text-[15px] leading-8 text-gray-900">{set.passageJa}</p>
      </div>

      <p className="mb-1 text-base font-semibold text-gray-900">{set.questionJa}</p>
      {lang === 'zh' && <p className="mb-3 text-sm text-gray-600">{set.questionZh}</p>}

      <div className="space-y-2">
        {presented.choices.map((c) => {
          const isCorrect = answered && c.choiceId === presented.correctChoiceId;
          const isWrongPick = answered && picked === c.choiceId && !isCorrect;
          return (
            <button key={c.choiceId} type="button" disabled={answered}
              aria-pressed={picked === c.choiceId}
              className={`${pressFx} action-choice w-full min-h-[44px] rounded-xl border px-4 py-3 text-left text-sm leading-relaxed transition-colors ${
                isCorrect ? `border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500 ${popIn}`
                : isWrongPick ? 'border-red-500 bg-red-50'
                : answered ? 'border-gray-200 bg-white opacity-60'
                : 'border-gray-200 bg-white hover:border-blue-400'}`}
              onClick={() => { if (!answered) { setPicked(c.choiceId); setAnswered(true); } }}>
              {c.textJa}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={`mt-4 rounded-xl border p-3 ${riseIn} ${
          picked === presented.correctChoiceId ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <span aria-hidden className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${
              picked === presented.correctChoiceId ? 'bg-emerald-600' : 'bg-amber-500'}`}>
              {picked === presented.correctChoiceId ? '✓' : '!'}
            </span>
            {picked === presented.correctChoiceId ? tx(lang, '正解！', '答对了！') : tx(lang, 'ざんねん…', '差一点…')}
          </p>
          <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-sm leading-relaxed text-gray-900">
            {tx(lang, '本文の根拠', '原文依据')}：<span lang="ja">{set.rationaleSpan}</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">
            {lang === 'zh'
              ? <JaTermText text={set.explanationZh} lang="zh" />
              : set.explanationJa}
          </p>
          <div className="mt-2">
            <p className="text-xs font-semibold text-gray-600">{tx(lang, 'ほかの選択肢が違う理由', '其他选项为什么不对')}</p>
            <ul className="mt-1 space-y-0.5">
              {presented.choices.filter((c) => c.choiceId !== presented.correctChoiceId).map((c) => (
                <li key={c.choiceId} className="text-xs leading-relaxed text-gray-600">✕ {c.textJa} — {c.whyWrongJa}</li>
              ))}
            </ul>
          </div>
          <button type="button" className={`${pressFx} action-primary-blue mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 font-bold text-white`} onClick={advance}>
            {idx + 1 < sets.length ? tx(lang, 'つぎの問題', '下一题') : tx(lang, '結果を見る', '看结果')}
          </button>
        </div>
      )}
      {!answered && (
        <button type="button" className={`${pressFx} mt-4 w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline active:bg-gray-100`}
          onClick={() => { setPicked(null); setAnswered(true); }}>
          {tx(lang, 'わからない（スキップ＝誤答扱い）', '不知道（跳过＝按答错计）')}
        </button>
      )}
    </div>
  );
}

export default AdvReadingRunner;
