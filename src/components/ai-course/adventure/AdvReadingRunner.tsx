// 読解runner（COMPLETION §6・§16）。
// 本文を読みながら解く。mobileで本文と設問が行き来しやすいことを優先。
//
// P0以降: 問題はサーバーが選んで返す（正解・根拠・解説なし）。
// 採点はサーバー。根拠スパン・解説・他選択肢が違う理由は回答後にだけ返る。
import { useEffect, useState } from 'react';
import {
  startReading, gradeAttempt, isRetryable,
  type ServerSetQuestion, type GradeResult, type ActivityDenial,
} from '../../../lib/aiLesson/course/adventure/activityClient';
import { useAdvRuntime } from './AdvRuntimeContext';
import { DeniedView } from './AdvBattleRunner';
import { nowTrainingLabel } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { JaTermText } from './JaTermText';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface AdvReadingRunnerProps {
  lang: L;
  /** 既出キー（偽名）。未出優先の選定に使う */
  seenKeys: Set<string>;
  onFinish: (result: { correct: number; total: number; keys: string[]; wrongKeys: string[]; elapsedSec: number }) => void;
  onClose: () => void;
}

export function AdvReadingRunner({ lang, seenKeys, onFinish, onClose }: AdvReadingRunnerProps) {
  const runtime = useAdvRuntime();
  const [sets, setSets] = useState<ServerSetQuestion[] | null>(null);
  const [denied, setDenied] = useState<ActivityDenial | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [reveal, setReveal] = useState<GradeResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongKeys, setWrongKeys] = useState<string[]>([]);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void startReading(runtime.auth, { seenKeys: [...seenKeys].slice(0, 800), count: 3 }).then((r) => {
      if (!alive) return;
      if (!r.ok) { setDenied(r.denial); return; }
      setSets(r.data.questions);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (denied) {
    return <DeniedView lang={lang} denial={denied} onClose={onClose}
      onRetry={isRetryable(denied) ? () => window.location.reload() : undefined} />;
  }
  if (!sets) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <p className="text-sm text-gray-500">{tx(lang, '読解問題を用意しています…', '正在准备阅读题…')}</p>
      </div>
    );
  }

  const set = sets[idx];
  if (!set) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
        <p className="mb-4 text-sm text-gray-700">
          {tx(lang, '出題できる読解問題がありません。', '暂时没有可出的阅读题。')}
        </p>
        <button type="button" className="min-h-[44px] rounded-xl border border-gray-300 px-6 py-2" onClick={onClose}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }
  const answered = reveal !== null;

  const submit = async (choiceKey: string | null) => {
    if (grading || answered) return;
    setGrading(true);
    setPicked(choiceKey);
    const r = await gradeAttempt(runtime.auth, { attemptToken: set.attemptToken, choiceKey });
    setGrading(false);
    if (!r.ok) { setDenied(r.denial); return; }
    setReveal(r.data);
  };

  const advance = () => {
    const ok = reveal?.correct === true;
    const nextCorrect = correctCount + (ok ? 1 : 0);
    const nextWrong = ok ? wrongKeys : [...wrongKeys, set.key];
    setReveal(null);
    setPicked(null);
    if (idx + 1 < sets.length) {
      setCorrectCount(nextCorrect);
      setWrongKeys(nextWrong);
      setIdx(idx + 1);
      return;
    }
    trackAdv('reading_completed', { locale: lang, skillType: 'reading' });
    onFinish({
      correct: nextCorrect, total: sets.length,
      keys: sets.map((s) => s.key), wrongKeys: nextWrong,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6" aria-label={tx(lang, '読解', '阅读')}>
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>{tx(lang, '読解', '阅读')}</span>
        <span>
          {idx + 1}/{sets.length}
          {set.estimatedSeconds !== undefined && `・${tx(lang, `目安${set.estimatedSeconds}秒`, `参考${set.estimatedSeconds}秒`)}`}
        </span>
      </div>
      <p className="mb-3 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {tx(lang, '今鍛えている試験力', '正在锻炼的考试能力')}：{nowTrainingLabel('reading', lang)}
      </p>

      {lang === 'zh' && set.contextZh && (
        <p className="mb-2 text-xs text-gray-500">{set.contextZh}</p>
      )}
      {/* 本文。mobileでも読みやすい行長・行間にする */}
      <div className="mb-4 max-h-[46vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4">
        <p lang="ja" className="whitespace-pre-wrap text-[15px] leading-8 text-gray-900">{set.passageJa}</p>
      </div>

      <p className="mb-1 text-base font-semibold text-gray-900">{set.questionJa}</p>
      {lang === 'zh' && <p className="mb-3 text-sm text-gray-600">{set.questionZh}</p>}

      <div className="space-y-2">
        {set.choices.map((c) => {
          const isCorrect = answered && c.key === reveal?.correctKey;
          const isWrongPick = answered && picked === c.key && !isCorrect;
          return (
            <button key={c.key} type="button" disabled={answered || grading}
              aria-pressed={picked === c.key}
              className={`w-full min-h-[44px] rounded-xl border px-4 py-3 text-left text-sm leading-relaxed transition-colors ${
                isCorrect ? 'border-emerald-600 bg-emerald-50'
                : isWrongPick ? 'border-red-500 bg-red-50'
                : 'border-gray-200 bg-white hover:border-blue-400 disabled:hover:border-gray-200'}`}
              onClick={() => void submit(c.key)}>
              {c.textJa}
            </button>
          );
        })}
      </div>

      {grading && (
        <p className="mt-3 text-center text-xs text-gray-400" role="status">{tx(lang, '採点中…', '判分中…')}</p>
      )}

      {answered && reveal && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-bold text-gray-900">
            {reveal.correct ? tx(lang, '正解！', '答对了！') : tx(lang, 'ざんねん…', '差一点…')}
          </p>
          {reveal.rationaleSpan && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-sm leading-relaxed text-gray-900">
              {tx(lang, '本文の根拠', '原文依据')}：<span lang="ja">{reveal.rationaleSpan}</span>
            </p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-gray-800">
            {lang === 'zh'
              ? <JaTermText text={reveal.explanationZh ?? ''} lang="zh" />
              : reveal.explanationJa}
          </p>
          {(reveal.whyWrong ?? []).length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-gray-600">{tx(lang, 'ほかの選択肢が違う理由', '其他选项为什么不对')}</p>
              <ul className="mt-1 space-y-0.5">
                {(reveal.whyWrong ?? []).map((w) => (
                  <li key={w.key} className="text-xs leading-relaxed text-gray-600">✕ {w.textJa} — {w.whyWrongJa}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 font-bold text-white" onClick={advance}>
            {idx + 1 < sets.length ? tx(lang, 'つぎの問題', '下一题') : tx(lang, '結果を見る', '看结果')}
          </button>
        </div>
      )}
      {!answered && !grading && (
        <button type="button" className="mt-4 w-full min-h-[44px] text-sm text-gray-500 underline"
          onClick={() => void submit(null)}>
          {tx(lang, 'わからない（スキップ＝誤答扱い）', '不知道（跳过＝按答错计）')}
        </button>
      )}
    </div>
  );
}

export default AdvReadingRunner;
