// ことば図鑑＝集めた「今日のことば」が並ぶ棚（2026-09-07 第2版）。
//
// なぜ要るか:
//   毎日1つ受け取るだけでは、手元に何も残らない。**集まっていくものが見える**ことが、
//   明日also開く理由になる。単語図鑑（AdvVocabDex）と同じ考え方。
//
// 守ること:
//   - まだ受け取っていないことばは、**中身を見せない**（先に全部読めたら集める意味が消える）。
//     ただし「あと何個あるか」は隠さない＝ゴールは見える
//   - 「おぼえた」は自己申告。ここでも「テストで確認した」とは書かない（原則13）
//   - 行き止まりにしない（原則15）: 必ず「もどる」がある
import { useState } from 'react';
import { ArrowLeft, Volume2 } from 'lucide-react';
import { pressFx, subtleBtn } from './advUi';
import { PROVERBS } from '../../../lib/aiLesson/course/adventure/advProverbs';
import { collectedProverbs, proverbStats } from '../../../lib/aiLesson/course/adventure/advProverbDex';
import { canSpeakJa, speakJa, stopSpeaking } from '../../../lib/aiLesson/speak';
import type { AdvProverbEntry } from '../../../lib/aiLesson/course/adventure/advTypes';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  dex: AdvProverbEntry[];
  onToggleLearned: (id: string, learned: boolean) => void;
  onBack: () => void;
}

export function AdvProverbDex({ lang, dex, onToggleLearned, onBack }: Props) {
  const [onlyLearned, setOnlyLearned] = useState(false);
  const stats = proverbStats(dex, PROVERBS.length);
  const items = collectedProverbs(dex).filter((x) => !onlyLearned || x.entry.learned);
  const speakable = canSpeakJa();
  const back = () => { stopSpeaking(); onBack(); };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <button type="button" onClick={back}
        className={`${pressFx} mb-4 inline-flex items-center gap-1.5 text-sm text-gray-600`}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {tx(lang, 'もどる', '返回')}
      </button>

      <h1 className="text-xl font-bold text-gray-900">{tx(lang, 'ことば図鑑', '词句图鉴')}</h1>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        {tx(lang, '毎日ひとつ受け取ったことばが、ここにたまります。',
          '每天领到的一句话，都会收在这里。')}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
        <div className="bg-white px-3 py-3 text-center">
          <p className="text-[0.7rem] text-gray-500">{tx(lang, '集めた', '已收集')}</p>
          <p className="text-xl font-bold tabular-nums text-gray-900">{stats.collected}</p>
        </div>
        <div className="bg-white px-3 py-3 text-center">
          <p className="text-[0.7rem] text-gray-500">{tx(lang, 'おぼえた', '已记住')}</p>
          <p className="text-xl font-bold tabular-nums text-emerald-700">{stats.learned}</p>
        </div>
        <div className="bg-white px-3 py-3 text-center">
          <p className="text-[0.7rem] text-gray-500">{tx(lang, '全部で', '总共')}</p>
          <p className="text-xl font-bold tabular-nums text-gray-400">{stats.total}</p>
        </div>
      </div>
      {/* 自己申告であることを、数字のすぐ下に置く（離すと「測った数」に見える） */}
      <p className="mt-1.5 text-[0.7rem] leading-relaxed text-gray-400">
        {tx(lang, '※「おぼえた」は自分でつけた印です。テストで確かめた数ではありません。',
          '※「已记住」是你自己勾选的标记，不是测验确认过的数量。')}
      </p>

      {stats.collected > 0 && (
        <button type="button" aria-pressed={onlyLearned}
          onClick={() => setOnlyLearned((v) => !v)}
          className={`${pressFx} mt-4 rounded-full border px-3 py-1.5 text-xs font-bold ${
            onlyLearned
              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
              : 'border-gray-300 bg-white text-gray-600'}`}>
          {tx(lang, 'おぼえたものだけ', '只看已记住的')}
        </button>
      )}

      {stats.collected === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm leading-relaxed text-gray-500">
          {tx(lang, 'まだ1つもありません。明日ひらくと、最初のことばが届きます。',
            '现在还一句都没有。明天打开时，第一句话就会到。')}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map(({ entry, proverb }) => (
            <li key={entry.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[0.7rem] tabular-nums text-gray-400">{entry.day}</p>
                <button type="button" aria-pressed={entry.learned}
                  onClick={() => onToggleLearned(entry.id, !entry.learned)}
                  className={`${pressFx} rounded-full border px-2.5 py-0.5 text-[0.7rem] font-bold ${
                    entry.learned
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-gray-300 bg-white text-gray-500'}`}>
                  {entry.learned ? tx(lang, '✓ おぼえた', '✓ 已记住') : tx(lang, 'おぼえた', '记住了')}
                </button>
              </div>
              <div className="mt-1 flex items-start gap-2">
                <p className="text-lg font-bold leading-snug text-gray-900">{proverb.ja}</p>
                {speakable && (
                  <button type="button" aria-label={tx(lang, '読み上げる', '朗读')}
                    className={`${pressFx} inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gray-300 bg-white text-gray-600`}
                    onClick={() => speakJa(proverb.ja)}>
                    <Volume2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{proverb.yomi}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-800">
                {tx(lang, proverb.meaningJa, proverb.meaningZh)}
              </p>
              {lang === 'zh' && proverb.zhSame && (
                <p className="mt-1 text-xs text-gray-500">中文里也有：{proverb.zhSame}</p>
              )}
              <p className="mt-2 border-t border-gray-100 pt-2 text-sm leading-relaxed text-gray-700">
                {proverb.exampleJa}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* まだ受け取っていないぶん。中身は見せないが、あと何個かは隠さない */}
      {stats.collected < stats.total && (
        <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-center text-xs leading-relaxed text-gray-500">
          {tx(lang, `のこり ${stats.total - stats.collected} 個。ひらいた日に1つずつ届きます。`,
            `还剩 ${stats.total - stats.collected} 句。每打开一天，就会到一句。`)}
        </p>
      )}

      <button type="button" onClick={back} className={`${subtleBtn} mt-5`}>
        {tx(lang, 'もどる', '返回')}
      </button>
    </div>
  );
}
