// かな道場（2026-08-15）。超初心者がひらがな・カタカナを読める状態にする前提レッスン。
// - チェックモード（refIds=['check']）: 10問で「もう読める」人を足止めせず卒業させる
// - 行モード: 教えるカード（表）→ 1文字ずつクイズ。間違えた文字は行の最後にもう一度
// - かなは前提スキルなので mastery台帳には入れない（原則13）
import { useState } from 'react';
import { pressFx, primaryBtn, riseIn, popIn } from './advUi';
import {
  buildKanaCheck, buildRowQuiz, kanaRowById, KANA_CHECK_PASS, type KanaQuestion,
} from '../../../lib/aiLesson/course/adventure/advKana';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  /** ['check'] ならチェックモード、それ以外は行ID（h-1等）の列 */
  rowIds: string[];
  onFinishCheck: (passed: boolean) => void;
  onRowsDone: (rowIds: string[]) => void;
  onBack: () => void;
}

/** 1問ずつ進むクイズ（間違えた問題は末尾へ再キュー） */
function Quiz({ lang, questions, onDone }: {
  lang: L; questions: KanaQuestion[]; onDone: (firstTryCorrect: number) => void;
}) {
  const [queue, setQueue] = useState(() => questions.map((q, i) => ({ q, first: i })));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [retried, setRetried] = useState<Set<number>>(new Set());

  const cur = queue[idx];
  if (!cur) return null;
  const answered = picked !== null;
  const correct = answered && picked === cur.q.answerIndex;

  const next = () => {
    const isFirstTry = !retried.has(cur.first);
    let newQueue = queue;
    if (correct && isFirstTry) setFirstTryCorrect((n) => n + 1);
    if (!correct) {
      // 間違えた文字は末尾でもう一度（覚えるまで終わらない・責めない）
      newQueue = [...queue, cur];
      setRetried(new Set([...retried, cur.first]));
      setQueue(newQueue);
    }
    setPicked(null);
    if (idx + 1 < newQueue.length) setIdx(idx + 1);
    else onDone(firstTryCorrect + (correct && isFirstTry ? 1 : 0));
  };

  return (
    <div className={riseIn}>
      <p className="text-center text-xs text-gray-500">{idx + 1} / {queue.length}</p>
      <p className="my-6 text-center text-7xl font-bold text-gray-900">{cur.q.kana}</p>
      <p className="mb-3 text-center text-sm text-gray-600">
        {tx(lang, 'この文字の読み方は？', '这个假名怎么读？')}
      </p>
      <div className="grid grid-cols-2 gap-2" role="group">
        {cur.q.choices.map((c, i) => {
          const isAnswer = answered && i === cur.q.answerIndex;
          const isWrongPick = answered && picked === i && i !== cur.q.answerIndex;
          return (
            <button key={c} type="button" disabled={answered}
              className={`${pressFx} action-choice min-h-[52px] rounded-xl border px-4 py-3 text-lg font-semibold ${
                isAnswer ? `border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500 ${popIn}`
                : isWrongPick ? 'border-red-500 bg-red-50'
                : answered ? 'border-gray-200 bg-white opacity-60'
                : 'border-gray-200 bg-white hover:border-blue-400'}`}
              onClick={() => setPicked(i)}>
              {c}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-4 text-center">
          <p className={`text-sm font-bold ${correct ? 'text-emerald-700' : 'text-amber-700'}`}>
            {correct
              ? tx(lang, '正解！', '答对了！')
              : tx(lang, `「${cur.q.kana}」は「${cur.q.choices[cur.q.answerIndex]}」。あとでもう一度出ます`,
                `「${cur.q.kana}」读「${cur.q.choices[cur.q.answerIndex]}」。稍后会再出一次`)}
          </p>
          <button type="button" className={`${primaryBtn} mt-3`} onClick={next}>
            {tx(lang, 'つぎへ', '下一题')}
          </button>
        </div>
      )}
    </div>
  );
}

export function AdvKanaDojo({ lang, rowIds, onFinishCheck, onRowsDone, onBack }: Props) {
  const isCheck = rowIds[0] === 'check';
  const [seed] = useState(() => Date.now() >>> 0);
  const [stage, setStage] = useState<'intro' | 'quiz' | 'teach'>('intro');
  const [rowIdx, setRowIdx] = useState(0);
  const [checkResult, setCheckResult] = useState<number | null>(null);

  const rows = isCheck ? [] : rowIds.map(kanaRowById).filter((r): r is NonNullable<typeof r> => r !== null);
  const row = rows[rowIdx] ?? null;

  const back = (
    <button type="button" className={`${pressFx} mt-4 w-full min-h-[44px] text-sm text-gray-500 underline`} onClick={onBack}>
      {tx(lang, 'ホームへ戻る', '返回主页')}
    </button>
  );

  // ── チェックモード ──
  if (isCheck) {
    if (checkResult !== null) {
      const passed = checkResult >= KANA_CHECK_PASS;
      return (
        <div className={`mx-auto w-full max-w-md px-4 py-8 text-center ${riseIn}`}>
          <p className="text-4xl" aria-hidden>{passed ? '🎉' : '🌱'}</p>
          <h2 className="mt-2 text-lg font-bold text-gray-900">
            {passed
              ? tx(lang, 'かなは読めています！', '假名已经会读了！')
              : tx(lang, 'いっしょに覚えていきましょう', '我们一起来记吧')}
          </h2>
          {/*
            「明日から」と書いていたが、実装は「わかった」を押した時点で profile.kana が更新され、
            その場で今日の冒険が作り直される（合格＝本編、不合格＝かな道場の行）。
            言葉を実装に合わせる（2026-08-18 監査P2）
          */}
          <p className="mt-2 text-sm text-gray-600">
            {passed
              ? tx(lang, `${checkResult}/10問正解。かな道場はスキップします。このまま今日の冒険を始められます。`,
                `答对${checkResult}/10题。跳过假名道场。现在就可以开始今天的冒险。`)
              : tx(lang, `${checkResult}/10問正解。今日から1日2行ずつ、ひらがな・カタカナを覚えていきます（約10日）。`,
                `答对${checkResult}/10题。从今天开始每天学2行，把平假名和片假名记住（约10天）。`)}
          </p>
          <button type="button" className={`${primaryBtn} mt-6`} onClick={() => onFinishCheck(passed)}>
            {tx(lang, 'わかった', '知道了')}
          </button>
        </div>
      );
    }
    if (stage === 'intro') {
      return (
        <div className="mx-auto w-full max-w-md px-4 py-8">
          <h2 className="text-lg font-bold text-gray-900">{tx(lang, 'かなチェック', '假名检查')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            {tx(lang,
              'ひらがな・カタカナが読めるかを10問で確認します。9問以上正解なら、かな道場はスキップです。わからない文字があっても大丈夫（そこから一緒に覚えます）。',
              '通过10道题确认你是否会读平假名和片假名。答对9题以上就跳过假名道场。有不认识的字也没关系（我们会从那里开始一起记）。')}
          </p>
          <button type="button" className={`${primaryBtn} mt-6`} onClick={() => setStage('quiz')}>
            {tx(lang, 'はじめる', '开始')}
          </button>
          {back}
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8">
        <Quiz lang={lang} questions={buildKanaCheck(seed)} onDone={(n) => setCheckResult(n)} />
      </div>
    );
  }

  // ── 行モード ──
  if (!row) {
    return (
      <div className={`mx-auto w-full max-w-md px-4 py-8 text-center ${riseIn}`}>
        <p className="text-4xl" aria-hidden>🎉</p>
        <h2 className="mt-2 text-lg font-bold text-gray-900">{tx(lang, '今日のかな道場、おわり！', '今天的假名道场结束！')}</h2>
        <p className="mt-2 text-sm text-gray-600">
          {tx(lang, '覚えた行はこの先のことば学習で何度も出会います。この調子！', '学过的行在之后的词汇学习中还会反复见到。就这个节奏！')}
        </p>
        <button type="button" className={`${primaryBtn} mt-6`} onClick={() => onRowsDone(rowIds)}>
          {tx(lang, 'ホームへ', '回到主页')}
        </button>
      </div>
    );
  }
  if (stage !== 'quiz') {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8">
        <p className="text-xs font-semibold text-gray-500">
          {tx(lang, `かな道場 ${rowIdx + 1}/${rows.length}`, `假名道场 ${rowIdx + 1}/${rows.length}`)}
        </p>
        <h2 className="mt-1 text-lg font-bold text-gray-900">{tx(lang, row.labelJa, row.labelZh)}</h2>
        <p className="mt-1 text-sm text-gray-600">
          {tx(lang, '声に出しながら、読み方をおぼえましょう。', '一边出声读，一边记住读法。')}
        </p>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {row.chars.map((c) => (
            <div key={c.kana} className="rounded-xl border border-gray-200 bg-white p-2 text-center">
              <p className="text-3xl font-bold text-gray-900">{c.kana}</p>
              <p className="mt-1 text-xs font-semibold text-blue-700">{c.romaji}</p>
            </div>
          ))}
        </div>
        <button type="button" className={`${primaryBtn} mt-6`} onClick={() => setStage('quiz')}>
          {tx(lang, 'おぼえた（クイズへ）', '记住了（开始测验）')}
        </button>
        {back}
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <p className="mb-2 text-xs font-semibold text-gray-500">{tx(lang, row.labelJa, row.labelZh)}</p>
      <Quiz key={row.rowId} lang={lang} questions={buildRowQuiz(row, seed + rowIdx * 977)}
        onDone={() => { setRowIdx(rowIdx + 1); setStage('teach'); }} />
    </div>
  );
}
