// 模試の誤答1問ぶんの表示（結果画面と、あとから読み返す画面で共用・2026-08-29）。
//
// なぜ共用するか: 表示が2箇所に分かれていたため、片方だけ直って
// 「終了直後は読めるのに、あとから開くと材料が足りない」状態になっていた。
//
// 何を出すか（CEO指摘 2026-08-29）:
//   解説だけでは復習にならない。**そのとき何を問われ、何が並んでいたか**が要る。
//   → 読解の本文・聴解の原稿・選択肢の全文（出題時の並び順）を出す。
import type { MockWrongDetail } from '../../../lib/aiLesson/course/adventure/advMockSession';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export const AdvMockWrongCard = ({ lang, w, label }: { lang: L; w: MockWrongDetail; label: string }) => {
  // 古い保存や復元前の記録には choicesJa が無い
  const choices = w.choicesJa ?? [];
  return (
  <>
    <p className="text-[11px] font-semibold text-gray-500">{label}</p>

    {/* 読解の本文・聴解の原稿（これが無いと何を間違えたのか分からない） */}
    {w.passageJa && (
      <div className="mt-1.5 max-h-[40vh] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p lang="ja" className="whitespace-pre-wrap text-[15px] leading-8 text-gray-900">{w.passageJa}</p>
      </div>
    )}
    {(w.situationJa || w.transcriptJa) && (
      <div className="mt-1.5 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-[11px] font-semibold text-gray-400">{tx(lang, '音声の内容', '录音内容')}</p>
        {w.situationJa && <p lang="ja" className="mt-0.5 text-xs text-gray-500">{w.situationJa}</p>}
        {w.transcriptJa && (
          <p lang="ja" className="mt-1 whitespace-pre-wrap text-sm leading-7 text-gray-900">{w.transcriptJa}</p>
        )}
      </div>
    )}

    {w.stemJa && (
      <p lang="ja" className="mt-1.5 whitespace-pre-wrap text-sm font-semibold text-gray-900">{w.stemJa}</p>
    )}
    {/* 設問の中国語は、zh画面のときと**日本語の設問が無いとき**に出す
        （rec問題は questionJa が構造的に null で、設問が中国語側にしかない） */}
    {w.stemZh && (lang === 'zh' || !w.stemJa) && (
      <p className={w.stemJa ? 'mt-0.5 text-xs text-gray-500' : 'mt-1.5 text-sm font-semibold text-gray-700'}>
        {w.stemZh}
      </p>
    )}

    {/* 出題時に並んでいた選択肢。何と何で迷ったのかを見返せるようにする */}
    {choices.length > 0 ? (
      <>
        <ul className="mt-2 space-y-1">
          {choices.map((c, ci) => {
            const isCorrect = c === w.correctTextJa;
            const isPicked = w.pickedTextJa !== null && c === w.pickedTextJa;
            return (
              <li key={`${w.key}-c${ci}`} lang="ja"
                className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                  isCorrect ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-800'
                    : isPicked ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-600'}`}>
                <span className="mr-1" aria-hidden>{isCorrect ? '◯' : isPicked ? '✕' : '　'}</span>{c}
                {isCorrect && <span className="sr-only">{tx(lang, '（正解）', '（正确答案）')}</span>}
                {isPicked && !isCorrect && <span className="sr-only">{tx(lang, '（あなたの答え）', '（你的选择）')}</span>}
              </li>
            );
          })}
        </ul>
        {w.pickedTextJa === null && (
          <p className="mt-1 text-sm text-red-600">{tx(lang, '✕ 未回答', '✕ 未作答')}</p>
        )}
      </>
    ) : (
      // 選択肢を残していない古い回は、これまでどおり2行で示す
      <>
        <p className="mt-2 text-sm text-red-600">✕ {w.pickedTextJa ?? tx(lang, '未回答', '未作答')}</p>
        <p className="mt-0.5 text-sm font-semibold text-emerald-700">◯ {w.correctTextJa}</p>
      </>
    )}

    <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-700">
      {tx(lang, w.whyJa, w.whyZh || w.whyJa)}
    </p>
  </>
  );
};

export default AdvMockWrongCard;
