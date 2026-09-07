// おかえりカード＝**開いた日にいちばん最初に出る一枚**（2026-09-07 CEO案）。
//
// なぜ作るか:
//   「今日はやらない」と「今日はできない」のあいだに一段いる。ミッションを始める体力が
//   無い日でも、開いて今日のことばを1つ読んだら**それだけで少し学んだ**と言える状態にする。
//   同時に、空いた日数を静かに受け止めて戻ってきやすくする。
//
// 守ること（advStreak/advReviewForecast から引き継ぐ原則）:
// - **責めない。** 「サボった」「切れた」「失った」は書かない。空いた日数は事実として出すが、
//   出す目的は今日の分量を小さくすること（久しぶりの人には「3分だけ」を出す）
// - **スタンプは「来た日」であって「勉強した日」ではない。** 文言でも分けて書く。
//   記録が始まる前の日は空欄（薄い枠）で、×にはしない（advVisit.VisitStamp.beforeRecords）
// - 行き止まりにしない（原則15）: 「今日の冒険へ」と「今日はここまで」の両方を必ず出す
import { primaryBtn, secondaryBtn } from './advUi';
import { todayProverb, proverbOrdinal, PROVERB_TOTAL } from '../../../lib/aiLesson/course/adventure/advDailyGift';
import { visitGreeting, visitStamps, visitedInCard } from '../../../lib/aiLesson/course/adventure/advVisit';
import type { AdvVisitState } from '../../../lib/aiLesson/course/adventure/advTypes';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  visit: AdvVisitState;
  /** ローカル日付キー YYYY-MM-DD（AdvShell の dateKeyOf と同じもの） */
  todayKey: string;
  /** 今日のことばを人ごとにずらすための種（learner id など） */
  seed?: string;
  /** 「今日の冒険へ」 */
  onStart: () => void;
  /** 「今日はここまで」＝カードを閉じてホームへ */
  onClose: () => void;
}

export function AdvDailyCheckin({ lang, visit, todayKey, seed = '', onStart, onClose }: Props) {
  const greeting = visitGreeting(visit, todayKey);
  const stamps = visitStamps(visit, todayKey);
  const came = visitedInCard(stamps);
  const p = todayProverb(todayKey, seed);
  const ordinal = proverbOrdinal(todayKey, seed);

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
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
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
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-bold text-amber-800">
              {tx(lang, '今日のことば', '今天的一句话')}
            </h3>
            <span className="text-[0.7rem] tabular-nums text-amber-700">{ordinal} / {PROVERB_TOTAL}</span>
          </div>
          <p className="mt-2 text-xl font-bold leading-snug text-gray-900">{p.ja}</p>
          <p className="mt-0.5 text-xs text-gray-500">{p.yomi}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">
            {tx(lang, p.meaningJa, p.meaningZh)}
          </p>
          {lang === 'zh' && p.zhSame && (
            <p className="mt-1 text-xs text-amber-800">中文里也有：{p.zhSame}</p>
          )}
          <div className="mt-3 border-t border-amber-200 pt-2">
            <p className="text-sm leading-relaxed text-gray-900">{p.exampleJa}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{p.exampleZh}</p>
          </div>
        </section>

        <button type="button" className={`${primaryBtn} mt-4`} onClick={onStart}>
          {tx(lang, '今日の冒険へ', '去今天的冒险')}
        </button>
        {/* 開いただけの日も肯定する。ここを消すと「やらないなら来るな」になる */}
        <button type="button" className={`${secondaryBtn} mt-2`} onClick={onClose}>
          {tx(lang, '今日はここまでにする', '今天就到这里')}
        </button>
        <p className="mt-2 text-center text-[0.7rem] leading-relaxed text-gray-400">
          {tx(lang, 'ことばを1つ読んだ日も、来た日です。',
            '只读了一句话的日子，也算来过。')}
        </p>
      </div>
    </div>
  );
}
