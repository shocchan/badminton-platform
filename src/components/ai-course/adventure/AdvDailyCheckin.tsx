// おかえりカード＝**開いた日にいちばん最初に出る一枚**（2026-09-07 CEO案・第2版）。
//
// なぜ作るか:
//   「今日はやらない」と「今日はできない」のあいだに一段いる。ミッションを始める体力が
//   無い日でも、開いて今日のことばを1つ読んだら**それだけで少し学んだ**と言える状態にする。
//   同時に、空いた日数を静かに受け止めて戻ってきやすくする。
//
// 第2版で足したもの（CEO「さらにブラッシュアップ」）:
//   - ことばが**手元にたまる**（ことば集め）。スタンプが増えるだけでなく、持ち物が増える
//   - **読み上げ**。端末の音声合成なので原価ゼロ・中国本土でも動く（speak.ts）
//   - **「おぼえた」**。読むだけ→自分で扱う、へ変える
//   - おぼえたことばが**10日後に1回だけ**「覚えていますか？」で戻る（意味は隠して出す）
//   - 集めた数の節目（5・10・20・30・60）を、その日だけ祝う
//
// 守ること（advStreak/advReviewForecast から引き継ぐ原則）:
// - **責めない。** 「サボった」「切れた」「失った」は書かない。空いた日数は事実として出すが、
//   出す目的は今日の分量を小さくすること（久しぶりの人には「3分だけ」を出す）
// - **スタンプは「来た日」であって「勉強した日」ではない。** 文言でも分けて書く。
//   記録が始まる前の日は空欄（薄い枠）で、×にはしない（advVisit.VisitStamp.beforeRecords）
// - **「おぼえた」は自己申告**。テストで測った定着ではないので、そう見せない
// - 行き止まりにしない（原則15）: 「今日の冒険へ」と「今日はここまで」の両方を必ず出す
import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { primaryBtn, secondaryBtn, subtleBtn, pressFx } from './advUi';
import { PROVERB_TOTAL } from '../../../lib/aiLesson/course/adventure/advDailyGift';
import { visitGreeting, visitStamps, visitedInCard } from '../../../lib/aiLesson/course/adventure/advVisit';
import { canSpeakJa, speakJa } from '../../../lib/aiLesson/speak';
import type { Proverb } from '../../../lib/aiLesson/course/adventure/advProverbs';
import type { RestateItem } from '../../../lib/aiLesson/course/adventure/advRestateReview';
import type { AdvVisitState } from '../../../lib/aiLesson/course/adventure/advTypes';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

/**
 * 読み上げボタン。端末に日本語の声が無ければ出さない＝押しても鳴らないボタンを置かない。
 *
 * ⚠️ **描画関数の中で定義しないこと。** 中で定義すると再描画のたびに「別のコンポーネント」
 * として扱われ、押した直後に作り直される（フォーカスが飛ぶ・連打が効かない）。
 */
function SpeakBtn(
  { show, text, label, tone }: { show: boolean; text: string; label: string; tone: string },
) {
  if (!show) return null;
  return (
    <button
      type="button" aria-label={label} title={label}
      className={`${pressFx} inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-white ${tone}`}
      onClick={() => speakJa(text)}
    >
      <Volume2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

interface Props {
  lang: L;
  visit: AdvVisitState;
  /** ローカル日付キー YYYY-MM-DD（AdvShell の dateKeyOf と同じもの） */
  todayKey: string;
  /** 今日のことば（選び方は advDailyGift.todayProverbFor が決める） */
  proverb: Proverb;
  /** すでに手元にあることばの数と、「おぼえた」と自分で決めた数 */
  collected: number;
  learned: number;
  /** 今日の受け取りで達した節目（5/10/20/30/60）。無ければ null */
  milestone?: number | null;
  /** このことばを「おぼえた」と自分で決めているか */
  isLearned: boolean;
  onToggleLearned: (learned: boolean) => void;
  /** ことば集めを開く */
  onOpenDex?: () => void;
  /**
   * 前に「おぼえた」と言ったことば。意味を隠して出し、思い出せるかを試す。
   * 出すのは1回だけ（advProverbDex.dueProverbRecall）
   */
  recall?: Proverb | null;
  onRecallAnswered?: (id: string) => void;
  /**
   * 会話で直された言い方のうち、今日もう一度出すもの（advRestateReview.dueRestates）。
   * 空なら節ごと出さない＝まだ会話をしていない人に空欄を見せない
   */
  restates?: RestateItem[];
  /** 「言えた」「まだ」の自己申告（機械が確かめたものではない） */
  onRestate?: (key: string, said: boolean) => void;
  /** 「今日の冒険へ」 */
  onStart: () => void;
  /** 「今日はここまで」＝カードを閉じてホームへ */
  onClose: () => void;
}

export function AdvDailyCheckin({
  lang, visit, todayKey, proverb: p, collected, learned, milestone = null,
  isLearned, onToggleLearned, onOpenDex, recall = null, onRecallAnswered,
  restates = [], onRestate, onStart, onClose,
}: Props) {
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const [recallOpen, setRecallOpen] = useState(false);
  const speakable = canSpeakJa();
  const answer = (key: string, said: boolean) => {
    setAnswered((a) => ({ ...a, [key]: said }));
    onRestate?.(key, said);
  };

  const greeting = visitGreeting(visit, todayKey);
  const stamps = visitStamps(visit, todayKey);
  const came = visitedInCard(stamps);

  const headline = greeting.kind === 'first'
    ? tx(lang, 'ようこそ', '欢迎回来')
    : greeting.kind === 'consecutive'
      ? tx(lang, 'おかえりなさい', '欢迎回来')
      : tx(lang, `おかえりなさい。${greeting.days}日ぶりですね`, `欢迎回来。已经${greeting.days}天没见了`);

  // 久しぶりの人ほど今日の分量を小さく出す（責めるのではなく、始めやすくするため）
  const suggestion = greeting.kind === 'long'
    ? tx(lang, '今日は3分だけにしましょう。それで十分です。', '今天只做3分钟就好，这样就够了。')
    : greeting.kind === 'short'
      ? tx(lang, '今日は短くて大丈夫です。まず1つだけ。', '今天短一点也没关系。先做一个。')
      : tx(lang, '今日のことばを1つ持っていってください。', '带走今天的一句话吧。');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4"
      role="dialog" aria-modal="true" aria-label={headline}
    >
      <div className="my-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">{headline}</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{suggestion}</p>

        {/* 来た日のスタンプ台紙。「勉強した日」とは別物だと分かる見出しにする */}
        <section className="mt-4" aria-label={tx(lang, '来た日のスタンプ', '来过的日子')}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-bold text-gray-500">
              {tx(lang, '来た日（この2週間）', '来过的日子（最近两周）')}
            </h3>
            <span className="text-xs tabular-nums text-gray-500">
              {tx(lang, `${came}日`, `${came}天`)}
            </span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {stamps.map((s) => (
              <li
                key={s.dateKey}
                title={s.dateKey}
                aria-label={`${s.dateKey}${s.visited ? tx(lang, ' 来た', ' 来过') : ''}`}
                className={[
                  'grid h-7 w-7 place-items-center rounded-full text-[0.7rem] font-bold',
                  s.visited
                    ? 'bg-emerald-500 text-white'
                    // 記録が始まる前の日は「来なかった日」ではない＝いちばん薄く、印を置かない
                    : s.beforeRecords
                      ? 'border border-dashed border-gray-200 text-gray-300'
                      : 'border border-gray-200 text-gray-400',
                  s.today ? 'ring-2 ring-emerald-300 ring-offset-1' : '',
                ].join(' ')}
              >
                {s.visited ? '✓' : Number(s.dateKey.slice(8))}
              </li>
            ))}
          </ul>
        </section>

        {/* 今日のことば。読むだけで学びになる一枚 */}
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold text-amber-800">
              {tx(lang, '今日のことば', '今天的一句话')}
            </h3>
            <button type="button" onClick={onOpenDex} disabled={!onOpenDex}
              className={`${pressFx} rounded-full bg-white px-2.5 py-0.5 text-[0.7rem] font-bold tabular-nums text-amber-800 disabled:opacity-60`}>
              {tx(lang, `集めた ${collected} / ${PROVERB_TOTAL}`, `已收集 ${collected} / ${PROVERB_TOTAL}`)}
            </button>
          </div>

          <div className="mt-2 flex items-start gap-2">
            <p className="text-xl font-bold leading-snug text-gray-900">{p.ja}</p>
            <SpeakBtn show={speakable} text={p.ja} label={tx(lang, '読み上げる', '朗读')} tone="border-amber-300 text-amber-800" />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{p.yomi}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">
            {tx(lang, p.meaningJa, p.meaningZh)}
          </p>
          {lang === 'zh' && p.zhSame && (
            <p className="mt-1 text-xs text-amber-800">中文里也有：{p.zhSame}</p>
          )}
          <div className="mt-3 flex items-start gap-2 border-t border-amber-200 pt-2">
            <div className="min-w-0">
              <p className="text-sm leading-relaxed text-gray-900">{p.exampleJa}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{p.exampleZh}</p>
            </div>
            <SpeakBtn show={speakable} text={p.exampleJa} label={tx(lang, '例文を読み上げる', '朗读例句')} tone="border-amber-300 text-amber-800" />
          </div>

          {/* 読むだけ → 自分で扱う、へ。押すとしばらくして1回だけ「覚えていますか？」で戻る */}
          <button
            type="button" aria-pressed={isLearned}
            onClick={() => onToggleLearned(!isLearned)}
            className={`${pressFx} mt-3 min-h-[40px] w-full rounded-xl border px-3 py-2 text-sm font-bold ${
              isLearned
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                : 'border-amber-300 bg-white text-amber-900'}`}
          >
            {isLearned
              ? tx(lang, '✓ おぼえた（あとでもう一度出ます）', '✓ 已记住（过些天会再出现一次）')
              : tx(lang, 'おぼえた', '记住了')}
          </button>
          {milestone !== null && (
            <p className="adv-celebrate-pop mt-2 rounded-lg bg-white px-3 py-2 text-center text-xs font-bold text-amber-900">
              {tx(lang, `🎉 ことばを${milestone}個 集めました`, `🎉 已经集齐${milestone}句了`)}
            </p>
          )}
        </section>

        {/*
          前に「おぼえた」と言ったことばを、意味を隠して1回だけ出す（2026-09-07 第2版）。
          この教室が売っている「忘れるころにもう一度」を、ことばにも効かせるための一段
        */}
        {recall && (
          <section className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
            <h3 className="text-xs font-bold text-violet-900">
              {tx(lang, 'この前おぼえたことば、意味を言えますか？', '之前记住的那句，还说得出意思吗？')}
            </h3>
            <div className="mt-2 flex items-start gap-2">
              <p className="text-lg font-bold leading-snug text-gray-900">{recall.ja}</p>
              <SpeakBtn show={speakable} text={recall.ja} label={tx(lang, '読み上げる', '朗读')} tone="border-violet-300 text-violet-700" />
            </div>
            {recallOpen ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-gray-800">
                  {tx(lang, recall.meaningJa, recall.meaningZh)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{recall.exampleJa}</p>
              </>
            ) : (
              <button type="button"
                className={`${secondaryBtn} mt-2 min-h-[40px] py-2 text-sm`}
                onClick={() => { setRecallOpen(true); onRecallAnswered?.(recall.id); }}>
                {tx(lang, '答えを見る', '看答案')}
              </button>
            )}
          </section>
        )}

        {/*
          会話で直された言い方の再登場（2026-09-07）。
          「1・3・7日後にもう一度」を、選択問題だけでなく**自分が話して直された言い方**にも効かせる。
          ここのチェックは自己申告なので、そう分かる書き方にする（原則13）
        */}
        {restates.length > 0 && (
          <section className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <h3 className="text-xs font-bold text-blue-900">
              {tx(lang, 'この前、直した言い方', '之前被改过的说法')}
            </h3>
            <p className="mt-0.5 text-[0.7rem] text-blue-800">
              {tx(lang, '声に出して言ってみてください。', '请出声说一遍看看。')}
            </p>
            <ul className="mt-2 flex flex-col gap-3">
              {restates.map((r) => (
                <li key={r.key} className="rounded-lg bg-white p-3">
                  <p className="text-[0.7rem] text-gray-500">
                    {tx(lang, `${r.daysSince}日前`, `${r.daysSince}天前`)}
                  </p>
                  <div className="mt-1 flex items-start gap-2">
                    <p className="text-base font-bold leading-snug text-gray-900">{r.improved}</p>
                    <SpeakBtn show={speakable} text={r.improved} label={tx(lang, '読み上げる', '朗读')} tone="border-blue-300 text-blue-700" />
                  </div>
                  {r.noteZh && lang === 'zh' && (
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">{r.noteZh}</p>
                  )}
                  {answered[r.key] === undefined ? (
                    <div className="mt-2 flex gap-2">
                      <button type="button"
                        className={`${secondaryBtn} min-h-[40px] py-2 text-sm`}
                        onClick={() => answer(r.key, true)}>
                        {tx(lang, '言えた', '说出来了')}
                      </button>
                      <button type="button"
                        className={`${subtleBtn} min-h-[40px] py-2`}
                        onClick={() => answer(r.key, false)}>
                        {tx(lang, 'まだ', '还不行')}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">
                      {answered[r.key]
                        ? tx(lang, '記録しました。また出てきます。', '已记录。之后还会再出现。')
                        : tx(lang, '記録しました。近いうちにもう一度出します。', '已记录。过几天会再出现一次。')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-blue-800">
              {tx(lang, '※ このチェックは自分でつけた記録です（機械が聞き取って判定したものではありません）。',
                '※ 这里的记录由你自己勾选（不是机器听音判定的结果）。')}
            </p>
          </section>
        )}

        <button type="button" className={`${primaryBtn} mt-4`} onClick={onStart}>
          {tx(lang, '今日の冒険へ', '去今天的冒险')}
        </button>
        {/* 開いただけの日も肯定する。ここを消すと「やらないなら来るな」になる */}
        <button type="button" className={`${secondaryBtn} mt-2`} onClick={onClose}>
          {tx(lang, '今日はここまでにする', '今天就到这里')}
        </button>
        <p className="mt-2 text-center text-[0.7rem] leading-relaxed text-gray-400">
          {learned > 0
            ? tx(lang, `ことばを1つ読んだ日も、来た日です。おぼえたことば ${learned}。`,
              `只读了一句话的日子，也算来过。已记住 ${learned} 句。`)
            : tx(lang, 'ことばを1つ読んだ日も、来た日です。', '只读了一句话的日子，也算来过。')}
        </p>
      </div>
    </div>
  );
}
