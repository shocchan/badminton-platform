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
import { AdvRuby } from './AdvRuby';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface AdvReadingRunnerProps {
  lang: L;
  sets: ReadingSet[];
  /**
   * 本文にふりがな（ルビ）を付けるか（2026-08-19）。
   * 本物のJLPT N5/N4の問題用紙は漢字にふりがなが付くため、N5/N4目標の学習者はtrue。
   * N3以上はfalse（本番の紙にもふりがなは無い）。設問・選択肢には付けない
   * （選択肢は語彙の表記問題と選択肢プールを共有し得るため、一律ルビ無しが安全）。
   */
  showRuby?: boolean;
  /**
   * 記録だけを行う（画面は閉じない）。結果画面はこのrunnerが出し、
   * 画面を閉じるのは onClose（2026-08-18 監査P1: 「結果を見る」を押すと
   * 結果を見せずにホームへ飛ばされていた）。
   * partial=true は途中でやめた回＝**解いたぶんだけ**の記録。
   */
  onFinish: (result: {
    correct: number; total: number; keys: string[]; wrongKeys: string[]; elapsedSec: number; partial: boolean;
  }) => void;
  /** reason='no-questions' は「出題できる問題が1問も無かった」合図 */
  onClose: (reason?: 'no-questions') => void;
}

export function AdvReadingRunner({ lang, sets, showRuby, onFinish, onClose }: AdvReadingRunnerProps) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongKeys, setWrongKeys] = useState<string[]>([]);
  /** 実際に解き終えた問題のキー（途中でやめたときは、ここまでのぶんだけを記録する） */
  const [doneKeys, setDoneKeys] = useState<string[]>([]);
  const [result, setResult] = useState<{ correct: number; total: number; partial: boolean } | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [attemptSeed] = useState(() => Date.now());

  const set = sets[idx];
  const presented = useMemo(
    () => (set ? presentQuestion(readingToQuestion(set), attemptSeed) : null),
    [set, attemptSeed],
  );

  // 結果画面はセットの中身に依存しない（記録後に親が sets を組み直しても消えない）
  if (result) {
    const pct = result.total === 0 ? 0 : Math.round((result.correct / result.total) * 100);
    return (
      <div className={`mx-auto w-full max-w-xl px-4 py-8 text-center ${riseIn}`} aria-label={tx(lang, '読解の結果', '阅读结果')}>
        <p className="text-4xl" aria-hidden>{pct >= 80 ? '🎉' : '📖'}</p>
        <h2 className="mt-2 text-xl font-bold text-gray-900">{tx(lang, '読解の結果', '阅读结果')}</h2>
        <p className={`mt-1 text-3xl font-bold ${pct >= 80 ? 'text-emerald-600' : 'text-blue-700'}`}>{pct}%</p>
        <p className="mt-1 text-sm text-gray-700">
          {tx(lang, `正解 ${result.correct}/${result.total}問`, `答对 ${result.correct}/${result.total} 题`)}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          {result.partial
            ? tx(lang, `途中でやめたので、解いた${result.total}問だけを記録しました。続きはいつでもできます。`,
              `因为中途结束了，只记录了已做的${result.total}题。剩下的随时可以继续。`)
            : tx(lang, 'この結果は学習の記録に残ります。', '这次结果会留在学习记录里。')}
        </p>
        <button type="button"
          className={`${pressFx} action-primary-blue mt-6 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white`}
          onClick={() => onClose()}>
          {tx(lang, '冒険にもどる', '回到冒险')}
        </button>
      </div>
    );
  }

  if (!set || !presented) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
        <p className="mb-4 text-sm text-gray-700">
          {tx(lang, '出題できる読解問題がありません。', '暂时没有可出的阅读题。')}
        </p>
        <button type="button" className={`${pressFx} action-secondary min-h-[44px] rounded-xl border border-gray-300 bg-white px-6 py-2`} onClick={() => onClose('no-questions')}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  const finish = (correct: number, keys: string[], wrongs: string[], partial: boolean) => {
    setResult({ correct, total: keys.length, partial });
    // 中断した回を「読解を終えた」として計上しない（指標を実態より良く見せない）
    if (!partial) trackAdv('reading_completed', { locale: lang, skillType: 'reading' });
    onFinish({
      correct, total: keys.length, keys, wrongKeys: wrongs,
      elapsedSec: Math.round((Date.now() - startedAt) / 1000), partial,
    });
  };

  /** いま表示中の1問を締めた状態（正解数・解いたキー・誤答キー） */
  const commitCurrent = () => {
    const ok = picked === presented.correctChoiceId;
    return {
      correct: correctCount + (ok ? 1 : 0),
      keys: [...doneKeys, `read:${set.setId}`],
      wrongs: ok ? wrongKeys : [...wrongKeys, `read:${set.setId}`],
    };
  };

  const advance = () => {
    const c = commitCurrent();
    if (idx + 1 < sets.length) {
      setCorrectCount(c.correct);
      setWrongKeys(c.wrongs);
      setDoneKeys(c.keys);
      setIdx(idx + 1);
      setPicked(null);
      setAnswered(false);
      return;
    }
    finish(c.correct, c.keys, c.wrongs, false);
  };

  /**
   * 実行中の離脱口（2026-08-18 監査P1）。
   * 無いと、上部ナビで抜けた生徒の「3問中2問解いた」が1問も残らなかった。
   * 解き終えた問題が1問も無ければ記録するものが無いので、そのまま閉じる。
   */
  const quitNow = () => {
    const c = answered ? commitCurrent() : { correct: correctCount, keys: doneKeys, wrongs: wrongKeys };
    if (c.keys.length === 0) { onClose(); return; }
    finish(c.correct, c.keys, c.wrongs, true);
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
      {/* 本文。mobileでも読みやすい行長・行間にする。
          N5/N4目標にはルビ付き（本物の試験と同じ）。ルビが本文と食い違うときは AdvRuby が素の本文に落とす */}
      <div className="mb-4 max-h-[46vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4">
        <p lang="ja" className="whitespace-pre-wrap text-[15px] leading-8 text-gray-900">
          <AdvRuby text={set.passageJa} ruby={set.rubyJa} show={!!showRuby} />
        </p>
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
                <li key={c.choiceId} className="text-xs leading-relaxed text-gray-600">✕ {c.textJa} — {tx(lang, c.whyWrongJa ?? '', c.whyWrongZh ?? c.whyWrongJa ?? '')}</li>
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
      {/* 途中でやめる口（原則15）。文言は実際に起きることだけを言う */}
      <button type="button" className={`${pressFx} mt-2 w-full min-h-[40px] rounded-xl text-xs text-gray-500 underline active:bg-gray-100`}
        onClick={quitNow}>
        {doneKeys.length === 0 && !answered
          ? tx(lang, 'やめて冒険にもどる', '退出，回到冒险')
          : tx(lang, 'ここでやめる（解いたぶんは記録されます）', '先做到这里（已做的部分会记录下来）')}
      </button>
    </div>
  );
}

export default AdvReadingRunner;
