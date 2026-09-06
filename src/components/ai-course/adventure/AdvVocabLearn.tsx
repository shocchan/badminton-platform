// 新しいことばを覚える（2026-09-06）。Duolingo型の短い学習ループ。
//
// UIで守ること:
// - **1画面に1つのことだけ置く。** 迷う要素を出さない
// - 進み具合をいつも上に出す（あと何問かが分かる＝終わりが見える）
// - 答えたらその場で結果と理由を出す。まちがえた問題は同じセッションでもう一度出す
// - 押せるものは指で押せる大きさ（min-h-[52px]）。片手で最後まで進める
import { useMemo, useState } from 'react';
import { Check, X, ArrowRight, Sparkles } from 'lucide-react';
import { pressFx, primaryBtn, secondaryBtn } from './advUi';
import {
  startLearnRuntime, advanceTeach, answerLearn, learnedWordIds,
  type LearnRuntime, type LearnSession,
} from '../../../lib/aiLesson/course/adventure/vocab/vocabLearn';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface AdvVocabLearnProps {
  lang: L;
  session: LearnSession;
  /** 未出会いの語が尽きて復習を混ぜたか */
  mixedReview: boolean;
  remainingUnseen: number;
  /** 学習を終えたときに1回だけ呼ぶ（台帳へ記録する） */
  onFinish: (rt: LearnRuntime) => void;
  onBack: () => void;
  /** もう5語つづける */
  onMore: () => void;
}

export const AdvVocabLearn = ({
  lang, session, mixedReview, remainingUnseen, onFinish, onBack, onMore,
}: AdvVocabLearnProps) => {
  const [rt, setRt] = useState<LearnRuntime>(() => startLearnRuntime(session));
  const [picked, setPicked] = useState<{ choiceId: string; correct: boolean } | null>(null);
  const [reported, setReported] = useState(false);

  const qByKey = useMemo(
    () => new Map(session.questions.map((q) => [q.key, q])), [session.questions],
  );
  const wordById = useMemo(
    () => new Map(session.words.map((w) => [w.id, w])), [session.words],
  );

  const totalSteps = session.words.length + session.questions.length;
  const doneSteps = Math.min(rt.teachIndex, session.words.length) + rt.correct.length;
  const pct = totalSteps === 0 ? 0 : Math.round((doneSteps / totalSteps) * 100);

  /* ── ① 出会う ── */
  if (rt.phase === 'teach') {
    const w = session.words[rt.teachIndex];
    if (!w) return null;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <Header lang={lang} pct={pct} step={tx(lang, `新しいことば ${rt.teachIndex + 1}/${session.words.length}`, `新单词 ${rt.teachIndex + 1}/${session.words.length}`)} onBack={onBack} />

        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 text-center">
          <p lang="ja" className="text-3xl font-bold text-gray-900">{w.surface}</p>
          <p lang="ja" className="mt-1 text-sm text-gray-600">{w.reading}</p>
          <p className="mt-3 text-lg font-semibold text-blue-900">{w.glossZh}</p>
          <span className="mt-2 inline-block rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-700">{w.level}</span>
        </div>

        <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] font-semibold text-gray-500">{tx(lang, '例文', '例句')}</p>
          <p lang="ja" className="mt-1 text-base leading-8 text-gray-900">{w.exampleJa}</p>
          <p className="mt-1 text-xs text-gray-500">{w.exampleZh}</p>
          {(lang === 'zh' ? w.explanationZh : w.explanationJa) && (
            <p className="mt-3 rounded-lg bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-700">
              {lang === 'zh' ? w.explanationZh : w.explanationJa}
            </p>
          )}
          {w.collocationsJa.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {w.collocationsJa.map((c) => (
                <span key={c} lang="ja" className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700">{c}</span>
              ))}
            </div>
          )}
        </div>

        <button type="button" className={`${primaryBtn} mt-4`}
          onClick={() => setRt((r) => advanceTeach(r, session.words.length))}>
          {rt.teachIndex + 1 >= session.words.length
            ? tx(lang, 'たしかめる', '来确认一下')
            : tx(lang, '次のことば', '下一个词')}
          <ArrowRight className="ml-1 inline h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  /* ── ② たしかめる ── */
  if (rt.phase === 'quiz') {
    const q = qByKey.get(rt.queue[0]);
    if (!q) return null;
    const w = wordById.get(q.wordId);
    const again = rt.firstWrong.includes(q.key);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <Header lang={lang} pct={pct}
          step={tx(lang, `のこり ${rt.queue.length}問`, `还剩 ${rt.queue.length}题`)} onBack={onBack} />

        {again && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {tx(lang, 'さっきまちがえた問題です。もう一度。', '这是刚才答错的题，再来一次。')}
          </p>
        )}

        <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
          {q.targetJapanese && (
            <p lang="ja" className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-lg font-bold text-gray-900">{q.targetJapanese}</p>
          )}
          {q.promptJa && <p lang="ja" className="text-base font-semibold text-gray-900">{q.promptJa}</p>}
          {(lang === 'zh' || !q.promptJa) && <p className="mt-0.5 text-sm text-gray-600">{q.promptZh}</p>}
        </div>

        <div className="mt-3 space-y-2">
          {q.choices.map((c) => {
            const isPicked = picked?.choiceId === c.choiceId;
            const show = picked !== null;
            const cls = !show
              ? 'border-gray-200 bg-white hover:border-blue-400'
              : c.isCorrect
                ? 'border-emerald-400 bg-emerald-50'
                : isPicked ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white opacity-60';
            return (
              <button key={c.choiceId} type="button" disabled={show}
                onClick={() => setPicked({ choiceId: c.choiceId, correct: c.isCorrect })}
                className={`${pressFx} flex min-h-[52px] w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm ${cls}`}>
                <span lang="ja">{c.textJa}</span>
                {show && c.isCorrect && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
                {show && isPicked && !c.isCorrect && <X className="h-4 w-4 shrink-0 text-red-600" aria-hidden />}
              </button>
            );
          })}
        </div>

        {picked && (
          <div className={`mt-3 rounded-2xl border p-4 ${picked.correct ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <p className={`text-sm font-bold ${picked.correct ? 'text-emerald-800' : 'text-red-800'}`}>
              {picked.correct ? tx(lang, '正解！', '答对了！') : tx(lang, 'もう一度おぼえよう', '再记一次')}
            </p>
            {w && (
              <p className="mt-1 text-sm text-gray-800">
                <span lang="ja" className="font-semibold">{w.surface}</span>
                <span lang="ja" className="ml-1 text-xs text-gray-500">{w.reading}</span>
                <span className="ml-2">{w.glossZh}</span>
              </p>
            )}
            {w && <p lang="ja" className="mt-1 text-xs leading-6 text-gray-700">{w.exampleJa}</p>}
            <button type="button" className={`${primaryBtn} mt-3`}
              onClick={() => {
                setRt((r) => answerLearn(r, q.key, picked.correct));
                setPicked(null);
              }}>
              {tx(lang, 'つづける', '继续')}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── ③ まとめ ── */
  const learned = learnedWordIds(session, rt);
  if (!reported) {
    setReported(true);
    onFinish(rt);
  }
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-emerald-600" aria-hidden />
        <p className="mt-2 text-lg font-bold text-emerald-900">
          {tx(lang, `${session.words.length}語ぶん終わりました`, `完成了 ${session.words.length} 个词`)}
        </p>
        <p className="mt-1 text-sm text-emerald-800">
          {tx(lang, `そのうち ${learned.length}語は一度も間違えませんでした`,
            `其中 ${learned.length} 个词一次也没错`)}
        </p>
      </div>

      <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-[11px] font-semibold text-gray-500">{tx(lang, '今回のことば', '这次的单词')}</p>
        <ul className="mt-2 space-y-1.5">
          {session.words.map((w) => {
            const ok = learned.includes(w.id);
            return (
              <li key={w.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <span>
                  <span lang="ja" className="font-semibold">{w.surface}</span>
                  <span lang="ja" className="ml-1 text-xs text-gray-500">{w.reading}</span>
                  <span className="ml-2 text-xs text-gray-700">{w.glossZh}</span>
                </span>
                <span className="text-[11px] font-semibold">
                  {ok ? tx(lang, '覚えた', '记住了') : tx(lang, 'もう一度', '再练一次')}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
          {tx(lang,
            'ここで出会ったことばは単語図鑑に載ります。図鑑の「習得」になるのは、別の日にも正解できたときです。',
            '这里遇见的单词会收进单词图鉴。要变成图鉴里的「已掌握」，需要在别的日子也答对。')}
        </p>
        {mixedReview && (
          <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
            {tx(lang,
              'まだ出会っていないことばが足りなかったので、前にまちがえたことばを混ぜました。',
              '还没遇见的新词不够，所以混入了之前答错的词。')}
          </p>
        )}
      </div>

      <button type="button" className={`${primaryBtn} mt-4`} onClick={onMore}>
        {tx(lang, 'もう5語おぼえる', '再记5个词')}
      </button>
      <button type="button" className={`${secondaryBtn} mt-2`} onClick={onBack}>
        {tx(lang, 'ホームにもどる', '返回主页')}
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-500">
        {tx(lang, `このコースで残っている新しいことば: ${remainingUnseen}語`,
          `本课程中还没遇见的单词：${remainingUnseen} 个`)}
      </p>
    </div>
  );
};

const Header = ({ lang, pct, step, onBack }: { lang: L; pct: number; step: string; onBack: () => void }) => (
  <div>
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack}
        className={`${pressFx} min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
        ← {tx(lang, 'やめる', '退出')}
      </button>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
    <p className="mt-1 text-xs font-semibold text-gray-500">{step}</p>
  </div>
);

export default AdvVocabLearn;
