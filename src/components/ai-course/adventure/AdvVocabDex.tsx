// 単語図鑑（2026-09-06 CEO要望「ポケモン図鑑のように、出会った単語が図鑑に載る」）。
//
// この画面の約束:
// - **出会った語だけが開く。** 未発見の語は表記を伏せる（集める動機になる）。
//   ただし「何語中いくつ」は最初から見せる。全体の大きさを隠さない
// - 段階は台帳にある事実だけで決める（vocabDex.ts）。推測で「習得」にしない
// - 数えている範囲を画面に書く。古い記録は正誤不明として数えないことも明記する
import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { pressFx, primaryBtn } from './advUi';
import { DEX_STATE_LABELS, type DexState } from '../../../lib/aiLesson/course/adventure/vocab/vocabDex';
import type { DexCard, DexView } from '../../../lib/aiLesson/course/adventure/vocab/vocabDexData';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

type Filter = 'all' | 'discovered' | 'mastered' | 'wrong';

const STATE_STYLE: Record<DexState, string> = {
  unseen: 'border-gray-200 bg-gray-50 text-gray-400',
  met: 'border-sky-200 bg-sky-50 text-sky-900',
  familiar: 'border-amber-200 bg-amber-50 text-amber-900',
  mastered: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

const ASPECT_LABELS: Record<string, { ja: string; zh: string }> = {
  reading: { ja: '読み', zh: '读音' },
  orthography: { ja: '表記', zh: '写法' },
  meaning: { ja: '意味', zh: '词义' },
  usage: { ja: '用法', zh: '用法' },
  context: { ja: '文脈', zh: '语境' },
  confusable: { ja: '紛らわしい語', zh: '易混词' },
};

export const AdvVocabDex = ({ lang, view, onBack }: { lang: L; view: DexView; onBack: () => void }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<DexCard | null>(null);

  const cards = useMemo(() => {
    const needle = q.trim();
    return view.cards.filter((c) => {
      if (filter === 'discovered' && c.state === 'unseen') return false;
      if (filter === 'mastered' && c.state !== 'mastered') return false;
      if (filter === 'wrong' && c.wrongCount === 0) return false;
      if (!needle) return true;
      // 未発見の語は検索でも中身を見せない（図鑑の意味がなくなるため）
      if (c.state === 'unseen') return false;
      return c.surface.includes(needle) || c.reading.includes(needle) || c.glossZh.includes(needle);
    });
  }, [view.cards, filter, q]);

  /* ── 1語の詳細 ── */
  if (open) {
    const st = DEX_STATE_LABELS[open.state];
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <button type="button" onClick={() => setOpen(null)}
          className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
          ← {tx(lang, '図鑑にもどる', '返回图鉴')}
        </button>
        <div className={`rounded-2xl border p-4 ${STATE_STYLE[open.state]}`}>
          <div className="flex items-center justify-between">
            <p lang="ja" className="text-2xl font-bold">{open.surface}</p>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">
              {open.level}・{tx(lang, st.ja, st.zh)}
            </span>
          </div>
          <p lang="ja" className="mt-0.5 text-sm opacity-80">{open.reading}</p>
          <p className="mt-2 text-base font-semibold">{open.glossZh}</p>
        </div>

        <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
          <p lang="ja" className="whitespace-pre-wrap text-sm leading-7 text-gray-900">{open.exampleJa}</p>
          <p className="mt-1 text-xs text-gray-500">{open.exampleZh}</p>
          {(lang === 'zh' ? open.explanationZh : open.explanationJa) && (
            <p className="mt-3 rounded-lg bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-700">
              {lang === 'zh' ? open.explanationZh : open.explanationJa}
            </p>
          )}
          {open.collocationsJa.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-gray-500">{tx(lang, 'よく一緒に使う形', '常见搭配')}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {open.collocationsJa.map((c) => (
                  <span key={c} lang="ja" className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700">{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] font-semibold text-gray-500">{tx(lang, 'あなたの記録', '你的记录')}</p>
          <p className="mt-1 text-sm text-gray-800">
            {tx(lang,
              `出会った ${open.metCount}回／正解 ${open.correctCount}回／まちがえ ${open.wrongCount}回`,
              `遇见 ${open.metCount}次／答对 ${open.correctCount}次／答错 ${open.wrongCount}次`)}
          </p>
          {open.lastMetDateKey && (
            <p className="mt-0.5 text-xs text-gray-500">
              {tx(lang, `最後に出会った日: ${open.lastMetDateKey}`, `最后遇见: ${open.lastMetDateKey}`)}
            </p>
          )}
          {open.aspects.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {open.aspects.map((a) => (
                <span key={a} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                  {tx(lang, ASPECT_LABELS[a]?.ja ?? a, ASPECT_LABELS[a]?.zh ?? a)}
                </span>
              ))}
            </div>
          )}
        </div>

        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setOpen(null)}>
          {tx(lang, '図鑑にもどる', '返回图鉴')}
        </button>
      </div>
    );
  }

  /* ── 図鑑トップ ── */
  const p = view.progress;
  const pct = p.total > 0 ? Math.round((p.discovered / p.total) * 100) : 0;
  const filters: { key: Filter; ja: string; zh: string }[] = [
    { key: 'all', ja: 'すべて', zh: '全部' },
    { key: 'discovered', ja: '出会った', zh: '已遇见' },
    { key: 'mastered', ja: '習得', zh: '已掌握' },
    { key: 'wrong', ja: 'まちがえた', zh: '答错过' },
  ];

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <button type="button" onClick={onBack}
        className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
        ← {tx(lang, 'もどる', '返回')}
      </button>
      <h1 className="text-xl font-bold text-gray-900">{tx(lang, '単語図鑑', '单词图鉴')}</h1>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        {tx(lang, 'バトルや模試で出会った単語が、ここに集まります。',
          '在战斗和模拟考中遇见的单词会收集到这里。')}
      </p>

      <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-end justify-between">
          <p className="text-sm font-semibold text-gray-800">
            {tx(lang, '集めた単語', '已收集')}
          </p>
          <p className="text-2xl font-bold text-blue-700">
            {p.discovered}<span className="ml-1 text-sm font-normal text-gray-500">/ {p.total}</span>
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden>
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-gray-600">
          {tx(lang,
            `出会った ${p.met}／手ごたえあり ${p.familiar}／習得 ${p.mastered}`,
            `已遇见 ${p.met}／有把握 ${p.familiar}／已掌握 ${p.mastered}`)}
        </p>
        {view.byLevel.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {view.byLevel.map((r) => (
              <span key={r.level} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                {r.level} {r.discovered}/{r.total}
              </span>
            ))}
          </div>
        )}
        {/* 数え方を画面に書く（原則13: 数字を作らない） */}
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
          {tx(lang,
            '「習得」は別の日に3回以上正解し、そのあと間違えていない語です。正誤を記録していない古い記録は、出会いだけ数えています。',
            '「已掌握」指在不同日期答对3次以上、且之后没有答错的词。没有记录对错的旧记录只计入「遇见」。')}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3">
        <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={tx(lang, '出会った単語をさがす', '搜索已遇见的单词')}
          className="min-h-[44px] w-full bg-transparent text-sm outline-none" />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`${pressFx} min-h-[36px] rounded-full border px-3 text-xs font-semibold ${
              filter === f.key ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-600'}`}>
            {tx(lang, f.ja, f.zh)}
          </button>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            {q.trim()
              ? tx(lang, '見つかりませんでした。まだ出会っていない単語は検索できません。',
                '没有找到。还没遇见的单词无法搜索。')
              : tx(lang, 'まだ条件に合う単語がありません。', '还没有符合条件的单词。')}
          </p>
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {cards.slice(0, 300).map((c) => (
            <li key={c.id}>
              {c.state === 'unseen' ? (
                // 未発見はシルエット。文字数だけ見せる（何画の語かは分かる＝集める動機）
                <div className={`flex min-h-[64px] flex-col justify-center rounded-xl border px-2 py-2 text-center ${STATE_STYLE.unseen}`}>
                  <span aria-hidden className="text-lg font-bold tracking-widest">
                    {'？'.repeat(Math.min([...c.surface].length, 6))}
                  </span>
                  <span className="mt-0.5 text-[10px]">{c.level}・{tx(lang, '未発見', '未发现')}</span>
                </div>
              ) : (
                <button type="button" onClick={() => setOpen(c)}
                  className={`${pressFx} flex min-h-[64px] w-full flex-col justify-center rounded-xl border px-2 py-2 text-center ${STATE_STYLE[c.state]}`}>
                  <span lang="ja" className="text-base font-bold leading-tight">{c.surface}</span>
                  <span lang="ja" className="mt-0.5 text-[10px] opacity-80">{c.reading}</span>
                  <span className="mt-0.5 text-[10px]">
                    {c.level}・{tx(lang, DEX_STATE_LABELS[c.state].ja, DEX_STATE_LABELS[c.state].zh)}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {cards.length > 300 && (
        <p className="mt-2 text-center text-xs text-gray-500">
          {tx(lang, `ほか ${cards.length - 300}語（しぼり込むと見られます）`,
            `还有 ${cards.length - 300} 个词（可通过筛选查看）`)}
        </p>
      )}

      <button type="button" className={`${primaryBtn} mt-4`} onClick={onBack}>
        {tx(lang, 'もどる', '返回')}
        <ChevronRight className="ml-1 inline h-4 w-4" aria-hidden />
      </button>
    </div>
  );
};

export default AdvVocabDex;
