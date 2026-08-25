// 個人復習パック（自分の書いた文章から復習する）。
//
// 画面の流れ:
//   パック一覧 → パックの広場（今日の復習・本文を読む・記録）→ 出題 → まとめ
//
// 設計の約束（advPersonalPack.ts 冒頭の方針をそのまま画面に落とす）:
// - 冒険の進み方には一切影響しない。ここで書き込むのは profile.personalPack だけ
// - 本文にふりがなを出さない（読みの問題の答えが透けるため・AdvRuby.tsx の禁止事項と同じ）
// - 「できた」と言い切らない。連続正解の実測だけを出す
import { useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronRight, PenLine, X } from 'lucide-react';
import { choiceIdle, choiceOn, pressFx, primaryBtn, riseIn, secondaryBtn, subtleBtn } from './advUi';
import type { AdventureV2Profile } from '../../../lib/aiLesson/course/adventure/advTypes';
import {
  availablePersonalPacks, dueItems, personalPackById, presentPersonalItem, recordFor,
  summarizePack, withAnswer, CLOZE_BLANK,
  type PersonalItem, type PersonalPack, type PersonalPackState,
} from '../../../lib/aiLesson/course/adventure/personal/advPersonalPack';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  profile: AdventureV2Profile;
  onSave: (next: AdventureV2Profile) => void;
  onBack: () => void;
}

const card = 'rounded-2xl border border-gray-200 bg-white p-4';

/** これまでに答えた延べ回数（選択肢の並びの種にする。乱数を使わないため） */
const answeredTotal = (state: PersonalPackState): number =>
  Object.values(state.records).reduce((n, r) => n + r.attempts, 0);

const KIND_LABEL: Record<PersonalItem['kind'], { ja: string; zh: string }> = {
  reading: { ja: '漢字の読み', zh: '汉字读法' },
  meaning: { ja: '表現の意味', zh: '表达的意思' },
  cloze: { ja: '文に入れる', zh: '填入句子' },
};

/** 1回の出題セット（順番と選択肢の並びを固定するため、開始時に作って持ち回す） */
interface Session {
  packId: string;
  items: PersonalItem[];
  index: number;
  seed: number;
  /** 答えた結果（itemId → 正解したか）。まとめの表示に使う */
  results: Record<string, boolean>;
}

export const AdvPersonalPackRunner = ({ lang, profile, onSave, onBack }: Props) => {
  const packs = availablePersonalPacks(profile);
  const [openPackId, setOpenPackId] = useState<string | null>(packs.length === 1 ? (packs[0]?.packId ?? null) : null);
  const [reading, setReading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const nowISO = new Date().toISOString();
  const state = profile.personalPack;
  const pack = openPackId ? personalPackById(profile, openPackId) : null;

  const startSession = (target: PersonalPack, items: PersonalItem[]) => {
    if (items.length === 0) return;
    setPicked(null);
    setSession({
      packId: target.packId,
      items,
      index: 0,
      // 選択肢の並びは「その回」で固定する（押すたびに動くと押し間違いが起きる）が、
      // **回ごとには変える**＝並びの位置を覚えて答えられないようにする。
      // 種は「これまでに答えた回数」から作る＝乱数を使わないので描画は純粋なまま
      seed: answeredTotal(state) * 7 + items.length,
      results: {},
    });
  };

  /* ── 出題中 ── */
  const drilling = session !== null && pack !== null && session.packId === pack.packId
    && session.index < session.items.length;
  if (session && pack && drilling) {
    // drilling が index 範囲を保証している（まとめは index === items.length で表す）
    const item = session.items[session.index] as PersonalItem;
    const presented = presentPersonalItem(item, session.seed + session.index);
    const answered = picked !== null;
    const isCorrect = picked === item.answer;
    const isLast = session.index >= session.items.length - 1;

    const onPick = (choice: string) => {
      if (answered) return;
      setPicked(choice);
      onSave({
        ...profile,
        personalPack: withAnswer(state, pack.packId, item.id, choice === item.answer, new Date().toISOString()),
      });
    };

    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => { setSession(null); setPicked(null); }}
            className={`${pressFx} min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
            ← {tx(lang, 'やめる', '退出')}
          </button>
          <span className="text-xs font-semibold text-gray-500">
            {session.index + 1} / {session.items.length}
          </span>
        </div>

        <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
          {tx(lang, KIND_LABEL[item.kind].ja, KIND_LABEL[item.kind].zh)}
        </span>

        <div className={`${card} mt-2`}>
          {/* 本人の文章。ふりがなは出さない（読みの答えが透けるため） */}
          <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-900">{item.promptJa}</p>
          <p className="mt-3 text-sm font-bold text-gray-700">
            {item.kind === 'reading'
              ? tx(lang, `「${item.target}」の読み方は？`, `「${item.target}」怎么读？`)
              : item.kind === 'meaning'
                // 選択肢は中国語の意味。日本語の表現を選ばせると本文から写せてしまう（2026-08-24）
                ? tx(lang, `「${item.target}」の意味は？`, `「${item.target}」是什么意思？`)
                : tx(lang, `${CLOZE_BLANK} に入るのは？`, `${CLOZE_BLANK} 里应该填什么？`)}
          </p>
        </div>

        <div className="mt-3 space-y-2">
          {presented.choices.map((choice) => {
            const chosen = picked === choice;
            const revealCorrect = answered && choice === item.answer;
            return (
              <button key={choice} type="button" disabled={answered}
                aria-pressed={chosen}
                onClick={() => onPick(choice)}
                className={`${revealCorrect ? `${choiceOn} border-emerald-500 bg-emerald-50` : chosen ? `${choiceOn} border-rose-400 bg-rose-50` : choiceIdle} ${answered && !chosen && !revealCorrect ? 'opacity-50' : ''}`}>
                <span className="flex items-center gap-2">
                  {revealCorrect && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
                  {chosen && !revealCorrect && <X className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />}
                  <span className="text-base text-gray-900">{choice}</span>
                </span>
              </button>
            );
          })}
        </div>

        {answered && (
          <div className={`${card} ${riseIn} mt-3`}>
            <p className={`text-sm font-bold ${isCorrect ? 'text-emerald-700' : 'text-gray-900'}`}>
              {isCorrect
                ? tx(lang, '正解！', '正确！')
                : tx(lang, `正解は「${item.answer}」`, `正确答案是「${item.answer}」`)}
            </p>
            {item.meaningZh && item.kind !== 'meaning' && (
              <p className="mt-1 text-sm text-gray-600">{item.meaningZh}</p>
            )}
            {(lang === 'zh' ? item.noteZh ?? item.noteJa : item.noteJa) && (
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                {lang === 'zh' ? item.noteZh ?? item.noteJa : item.noteJa}
              </p>
            )}
            <button type="button" className={`${primaryBtn} mt-3`}
              onClick={() => {
                const results = { ...session.results, [item.id]: isCorrect };
                setPicked(null);
                if (isLast) {
                  setSession({ ...session, results, index: session.items.length });
                } else {
                  setSession({ ...session, results, index: session.index + 1 });
                }
              }}>
              {isLast ? tx(lang, 'まとめを見る', '查看小结') : tx(lang, '次へ', '下一题')}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── まとめ（index が最後を越えた状態） ── */
  if (session && pack && session.packId === pack.packId && session.index >= session.items.length) {
    const total = session.items.length;
    const correct = Object.values(session.results).filter(Boolean).length;
    const missed = session.items.filter((i) => session.results[i.id] === false);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900">{tx(lang, 'おつかれさま', '辛苦了')}</h1>
        <div className={`${card} mt-3`}>
          <p className="text-sm text-gray-700">
            {tx(lang, `${total}問のうち ${correct}問 正解でした。`, `${total}题中答对了 ${correct}题。`)}
          </p>
          {missed.length > 0 && (
            <>
              <p className="mt-3 text-xs font-bold text-gray-500">
                {tx(lang, 'もう一度出てくるもの', '会再出现的题')}
              </p>
              <ul className="mt-1 space-y-1">
                {missed.map((i) => (
                  <li key={i.id} className="text-sm text-gray-800">
                    {i.target}
                    <span className="text-gray-500">（{i.answer}）</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            {tx(lang,
              'この復習は、あなたの文章だけの練習です。冒険の地図や準備度は動きません。',
              '这个复习只针对你自己的作文。它不会改变冒险地图和备考进度。')}
          </p>
        </div>
        <button type="button" className={`${primaryBtn} mt-3`} onClick={() => { setSession(null); setPicked(null); }}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  /* ── 本文を読む ── */
  if (pack && reading) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <button type="button" onClick={() => setReading(false)}
          className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
          ← {tx(lang, 'もどる', '返回')}
        </button>
        <h1 className="text-xl font-bold text-gray-900">{lang === 'zh' ? pack.titleZh : pack.titleJa}</h1>
        {pack.passages.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            {tx(lang, 'この復習には本文が登録されていません。', '这个复习包没有登记原文。')}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {pack.passages.map((p) => (
              <div key={p.id} className={card}>
                <p className="text-sm font-bold text-gray-900">
                  {lang === 'zh' ? p.titleZh ?? p.titleJa : p.titleJa}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-base leading-loose text-gray-800">{p.textJa}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── パックの広場 ── */
  if (pack) {
    const summary = summarizePack(pack, state, nowISO);
    const today = dueItems(pack, state, nowISO);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <button type="button"
          onClick={() => (packs.length > 1 ? setOpenPackId(null) : onBack())}
          className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
          ← {packs.length > 1 ? tx(lang, '復習の一覧へ', '返回复习列表') : tx(lang, 'もどる', '返回')}
        </button>
        <h1 className="text-xl font-bold text-gray-900">{lang === 'zh' ? pack.titleZh : pack.titleJa}</h1>
        {(lang === 'zh' ? pack.sourceLabelZh ?? pack.sourceLabelJa : pack.sourceLabelJa) && (
          <p className="mt-0.5 text-xs text-gray-500">
            {lang === 'zh' ? pack.sourceLabelZh ?? pack.sourceLabelJa : pack.sourceLabelJa}
          </p>
        )}

        <div className={`${card} mt-3`}>
          <p className="text-sm text-gray-700">
            {today.length > 0
              ? tx(lang, `今日の復習は ${today.length}問です。`, `今天的复习有 ${today.length}题。`)
              : tx(lang, '今日出す問題はありません。またあとで出てきます。', '今天没有要复习的题。之后会再出现。')}
          </p>
          <button type="button" className={`${primaryBtn} mt-3`} disabled={today.length === 0}
            onClick={() => startSession(pack, today)}>
            {tx(lang, '今日の復習をする', '开始今天的复习')}
          </button>
          <button type="button" className={`${secondaryBtn} mt-2`}
            onClick={() => startSession(pack, pack.items)}>
            <span className="flex items-center justify-center gap-2">
              <PenLine className="h-4 w-4" aria-hidden />
              {tx(lang, `ぜんぶ通して練習する（${pack.items.length}問）`, `全部练习一遍（${pack.items.length}题）`)}
            </span>
          </button>
          <button type="button" className={`${subtleBtn} mt-2`} onClick={() => setReading(true)}>
            <span className="flex items-center justify-center gap-2">
              <BookOpen className="h-4 w-4" aria-hidden />
              {tx(lang, '自分の文章を読み返す', '重读自己的作文')}
            </span>
          </button>
        </div>

        <div className={`${card} mt-3`}>
          <p className="text-xs font-bold text-gray-500">{tx(lang, 'いまの記録', '当前记录')}</p>
          <p className="mt-1 text-sm text-gray-800">
            {tx(lang,
              `${summary.total}問のうち、答えたことがあるのは ${summary.started}問／2回続けて正解できたのは ${summary.steady}問`,
              `共 ${summary.total}题，答过的有 ${summary.started}题／连续答对2次的有 ${summary.steady}题`)}
          </p>
          <ul className="mt-3 space-y-1">
            {pack.items.map((i) => {
              const rec = recordFor(state, pack.packId, i.id);
              return (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-gray-800">{i.target}</span>
                  <span className="shrink-0 text-[11px] text-gray-500">
                    {rec.attempts === 0
                      ? tx(lang, 'これから', '待练习')
                      : tx(lang, `${rec.correct}/${rec.attempts}正解・連続${rec.streak}`,
                        `${rec.correct}/${rec.attempts}正确・连续${rec.streak}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-gray-400">
          {tx(lang,
            'ここはあなたの文章だけの復習です。冒険の地図・攻略・準備度には影響しません。',
            '这里只复习你自己的作文，不会影响冒险地图、通关进度和备考评估。')}
        </p>
      </div>
    );
  }

  /* ── パック一覧 ── */
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <button type="button" onClick={onBack}
        className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
        <span className="flex items-center gap-1"><ArrowLeft className="h-4 w-4" aria-hidden />{tx(lang, 'もどる', '返回')}</span>
      </button>
      <h1 className="text-xl font-bold text-gray-900">
        {tx(lang, '自分の文章で復習', '用自己的作文复习')}
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        {tx(lang,
          '授業で書いた文章に出てきた表現と漢字の読みを、そのままの文で復習します。',
          '用你在课上写的原句，复习其中出现的表达和汉字读法。')}
      </p>
      <ul className="mt-4 space-y-2">
        {packs.map((p) => {
          const s = summarizePack(p, state, nowISO);
          return (
            <li key={p.packId}>
              <button type="button" onClick={() => setOpenPackId(p.packId)}
                className={`${pressFx} action-secondary flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug text-gray-900">
                    {lang === 'zh' ? p.titleZh : p.titleJa}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {tx(lang, `${s.total}問／今日 ${s.dueNow}問`, `${s.total}题／今天 ${s.dueNow}题`)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default AdvPersonalPackRunner;
