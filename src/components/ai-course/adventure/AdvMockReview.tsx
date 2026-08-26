// 模試の間違い直し（あとから読み返す画面・2026-08-25）。
//
// なぜ要るのか（CEO実測）:
//   試験形式はその場で答えを出さない。画面共有の授業でも「終わったあとに解説を読む」
//   時間が学習の本体だった。ところが解説は終了直後の結果画面にしか無く、
//   閉じた瞬間に問題文ごと消えていた（錯題本は設計上、問題文を持たない）。
//
// この画面の約束:
// - **記録にあるものだけ出す。** 解説を持っていない回は「持っていない」と書く（作らない）
// - ここでは解き直しをしない（解き直しは錯題本・おかわりバトルの担当）
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { pressFx, primaryBtn } from './advUi';
import type { AdvMockLogEntry } from '../../../lib/aiLesson/course/adventure/advTypes';
import { MOCK_DETAIL_KEEP } from '../../../lib/aiLesson/course/adventure/advMockSession';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  mockLog: AdvMockLogEntry[];
  onBack: () => void;
}

const card = 'rounded-2xl border border-gray-200 bg-white p-4';

export const AdvMockReview = ({ lang, mockLog, onBack }: Props) => {
  // 新しい順。同じ回を2回押せるよう mockId ではなく index で持つ
  const entries = [...mockLog].reverse();
  const [openIdx, setOpenIdx] = useState<number | null>(entries.length === 1 ? 0 : null);
  const open = openIdx === null ? null : entries[openIdx] ?? null;

  /* ── 1回ぶんの間違い直し ── */
  if (open) {
    const wrong = open.wrong ?? [];
    const pct = open.totalQuestions > 0 ? Math.round((open.totalCorrect / open.totalQuestions) * 100) : 0;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <button type="button" onClick={() => (entries.length > 1 ? setOpenIdx(null) : onBack())}
          className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
          ← {entries.length > 1 ? tx(lang, '模試の一覧へ', '返回模拟考列表') : tx(lang, 'もどる', '返回')}
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {tx(lang, `${open.dateKey} の模試`, `${open.dateKey} 的模拟考`)}
        </h1>
        <p className="mt-0.5 text-sm text-gray-600">
          {tx(lang, `${open.level}・${open.mode === 'short' ? '短いバージョン' : '本番と同じ時間'}／${open.totalCorrect}／${open.totalQuestions}問正解（${pct}%）`,
            `${open.level}・${open.mode === 'short' ? '短时版' : '真实时长版'}／答对 ${open.totalCorrect}／${open.totalQuestions}题（${pct}%）`)}
        </p>

        {wrong.length === 0 ? (
          <div className={`${card} mt-4`}>
            <p className="text-sm leading-relaxed text-gray-700">
              {open.totalCorrect === open.totalQuestions
                ? tx(lang, 'この回は全問正解でした。間違い直しはありません。', '这次全部答对了，没有错题。')
                // 解説を残す前に受けた回・古くなって集計だけになった回
                : tx(lang,
                  `この回は解説を保存していません（解説つきで残るのは新しい${MOCK_DETAIL_KEEP}回ぶんです）。次に受けた回からは、ここで問題文と解説を読み返せます。`,
                  `这次没有保存解析（只保留最近${MOCK_DETAIL_KEEP}次的解析）。从下次开始，可以在这里重读题目和解析。`)}
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {wrong.map((w) => (
              <li key={w.key} className={card}>
                <p className="text-[11px] font-semibold text-gray-500">
                  {tx(lang, w.sectionLabelJa, w.sectionLabelZh)} {w.index}
                </p>
                <p lang="ja" className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-900">{w.stemJa}</p>
                {lang === 'zh' && w.stemZh && <p className="mt-0.5 text-xs text-gray-500">{w.stemZh}</p>}
                <p className="mt-2 text-sm text-red-600">
                  ✕ {w.pickedTextJa ?? tx(lang, '未回答', '未作答')}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-700">◯ {w.correctTextJa}</p>
                <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-700">
                  {tx(lang, w.whyJa, w.whyZh || w.whyJa)}
                </p>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className={`${primaryBtn} mt-4`} onClick={onBack}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  /* ── 受けた模試の一覧 ── */
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <button type="button" onClick={onBack}
        className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
        ← {tx(lang, 'もどる', '返回')}
      </button>
      <h1 className="text-xl font-bold text-gray-900">{tx(lang, '模試の間違い直し', '模拟考错题回顾')}</h1>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        {tx(lang, '受けた模試の、間違えた問題と解説を読み返せます。',
          '可以重读做过的模拟考中答错的题目和解析。')}
      </p>

      {entries.length === 0 ? (
        <div className={`${card} mt-4`}>
          <p className="text-sm text-gray-700">
            {tx(lang, 'まだ最後まで終えた模試がありません。', '还没有做完的模拟考。')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {tx(lang, '途中でやめた回は記録に入りません（最後まで提出すると記録されます）。',
              '中途退出的不会计入记录（做到最后提交才会记录）。')}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {entries.map((e, i) => {
            const wrongCount = e.wrong?.length ?? null;
            return (
              <li key={`${e.mockId}-${i}`}>
                <button type="button" onClick={() => setOpenIdx(i)}
                  className={`${pressFx} action-secondary flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">
                      {e.dateKey} {e.totalCorrect}／{e.totalQuestions}
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        {e.level}・{e.mode === 'short' ? tx(lang, '短い', '短时') : tx(lang, '本番と同じ時間', '真实时长')}
                      </span>
                    </span>
                    <span className="block text-xs text-gray-500">
                      {wrongCount === null
                        ? tx(lang, '解説は残っていません（古い回）', '没有保留解析（较早的记录）')
                        : wrongCount === 0
                          ? tx(lang, '全問正解', '全部答对')
                          : tx(lang, `間違い ${wrongCount}問・解説あり`, `错 ${wrongCount}题・有解析`)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AdvMockReview;
