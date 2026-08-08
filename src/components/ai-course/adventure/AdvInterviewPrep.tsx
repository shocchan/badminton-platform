// 帰化面接の表現特訓。
//
// **模擬面接はこの画面ではやらない**（CEOの授業で行う・2026-08-07決定）。
// ここでやるのは「面接で聞かれそうなことを、自分の言葉の日本語で言える」ようにする特訓:
//   質問を読む → まず自分で考える → 何を見られているかを知る → ポイント →
//   自分の答えを書く → 声に出して言う（回数を記録）
//
// 設計の約束:
// - **回答例は最初は畳んでおく**。先に自分で考えさせる（丸暗記は面接で崩れるため）
// - 「自分の答え」を書くまで練習チェックは押せない
// - 進捗は書いた数・声に出した回数だけ（できた/できないをAIが判定しない・原則13）
import { useState } from 'react';
import { ChevronRight, Mic, Eye, EyeOff, Check, NotebookPen } from 'lucide-react';
import type { AdventureV2Profile } from '../../../lib/aiLesson/course/adventure/advTypes';
import {
  noteFor, worksheetFor, withMyAnswer, withSpokenPractice, withNotApplicable, withWorksheet,
  categoryProgress, interviewOverview, type InterviewPrepState,
} from '../../../lib/aiLesson/course/adventure/interview/advInterview';
import {
  INTERVIEW_CATEGORY_LABEL, WORKSHEET_PROMPTS,
  questionsByCategory, type InterviewCategory, type InterviewQuestion,
} from '../../../lib/aiLesson/course/adventure/interview/kikaInterviewBank';
import { TeacherAvatar } from '../TeacherAvatar';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  profile: AdventureV2Profile;
  onSave: (next: AdventureV2Profile) => void;
  onBack: () => void;
}

const card = 'rounded-2xl border border-gray-200 bg-white p-4';
const field = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400';

type View =
  | { kind: 'home' }
  | { kind: 'worksheet' }
  | { kind: 'category'; category: InterviewCategory }
  | { kind: 'question'; category: InterviewCategory; questionId: string };

export const AdvInterviewPrep = ({ lang, profile, onSave, onBack }: Props) => {
  const [view, setView] = useState<View>({ kind: 'home' });
  const state = profile.interviewPrep;
  const save = (next: InterviewPrepState) => onSave({ ...profile, interviewPrep: next });

  /* ── 質問1問の特訓 ── */
  if (view.kind === 'question') {
    const qs = questionsByCategory(view.category);
    const idx = qs.findIndex((q) => q.id === view.questionId);
    const q = qs[idx] as InterviewQuestion | undefined;
    if (!q) { setView({ kind: 'category', category: view.category }); return null; }
    const note = noteFor(state, q.id);
    const next = qs[idx + 1] ?? null;
    return (
      <QuestionDrill
        key={q.id} lang={lang} q={q} note={note}
        position={`${idx + 1} / ${qs.length}`}
        onSaveAnswer={(text) => save(withMyAnswer(state, q.id, text))}
        // 答えの保存と練習記録を**1回の更新**で行う。
        // 別々にsaveすると同じ描画の古いstate同士で後勝ちになり、片方が消える（テストが検出した実バグ）
        onSpoken={(text) => save(
          withSpokenPractice(withMyAnswer(state, q.id, text), q.id, new Date().toISOString()),
        )}
        onNotApplicable={(v) => save(withNotApplicable(state, q.id, v))}
        onNext={next
          ? () => setView({ kind: 'question', category: view.category, questionId: next.id })
          : () => setView({ kind: 'category', category: view.category })}
        nextLabel={next
          ? tx(lang, '次の質問へ', '下一题')
          : tx(lang, 'このテーマを終える', '结束这一主题')}
        onBack={() => setView({ kind: 'category', category: view.category })}
      />
    );
  }

  /* ── カテゴリ内の質問一覧 ── */
  if (view.kind === 'category') {
    const qs = questionsByCategory(view.category);
    const label = INTERVIEW_CATEGORY_LABEL[view.category];
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <button type="button" onClick={() => setView({ kind: 'home' })}
          className="mb-1 min-h-[44px] text-sm text-gray-500">
          ← {tx(lang, '特訓の広場へ戻る', '回到特训广场')}
        </button>
        <h1 className="text-xl font-bold text-gray-900">{tx(lang, label.ja, label.zh)}</h1>
        <ul className="mt-4 space-y-2">
          {qs.map((q) => {
            const n = noteFor(state, q.id);
            return (
              <li key={q.id}>
                <button type="button"
                  onClick={() => setView({ kind: 'question', category: view.category, questionId: q.id })}
                  className={`flex w-full min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2 text-left ${
                    n.notApplicable ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug text-gray-900">{q.questionJa}</span>
                    {lang === 'zh' && <span className="block text-xs text-gray-500">{q.questionHintZh}</span>}
                  </span>
                  <span className="shrink-0 text-right text-[11px] leading-tight text-gray-500">
                    {n.notApplicable
                      ? tx(lang, '対象外', '不适用')
                      : n.spokenCount > 0
                        ? tx(lang, `声に出した ${n.spokenCount}回`, `开口练习 ${n.spokenCount}次`)
                        : n.myAnswer.trim()
                          ? tx(lang, '答えを書いた', '已写答案')
                          : tx(lang, 'これから', '待练习')}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  /* ── 自分ノート ── */
  if (view.kind === 'worksheet') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <button type="button" onClick={() => setView({ kind: 'home' })}
          className="mb-1 min-h-[44px] text-sm text-gray-500">
          ← {tx(lang, '特訓の広場へ戻る', '回到特训广场')}
        </button>
        <h1 className="text-xl font-bold text-gray-900">{tx(lang, '自分ノート', '自我笔记')}</h1>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          {tx(lang,
            '「なぜ帰化したいのか」を自分の言葉にする準備です。まず本音を書き、それを面接で伝えられる日本語に直します。嘘を作る作業ではありません。同じ気持ちの、伝わる言い方を探す作業です。',
            '这是把「为什么想入籍」变成自己的话的准备。先写真心话，再把它改写成面试中能传达的日语。这不是编造谎言，而是为同样的心情找到能传达的说法。')}
        </p>
        <div className="mt-4 space-y-4">
          {WORKSHEET_PROMPTS.map((p, i) => {
            const w = worksheetFor(state, p.id);
            // 前の項目とセクションが変わる行にだけ見出しを出す
            const sectionHeader = i === 0 || WORKSHEET_PROMPTS[i - 1].sectionJa !== p.sectionJa;
            return (
              <div key={p.id}>
                {sectionHeader && (
                  <p className="mb-1.5 rounded-lg bg-gray-900/85 px-3 py-1 text-[11px] font-bold text-white">
                    {tx(lang, p.sectionJa, p.sectionZh)}
                  </p>
                )}
                <div className={card}>
                  <p className="text-sm font-semibold text-gray-900">{tx(lang, p.promptJa, p.promptZh)}</p>
                  {/*
                    保存はフォーカスが外れたときだけ。onChangeで保存すると
                    中国語IMEの1打鍵ごとに全プロファイルがSupabaseへ飛ぶ（監査P1）
                  */}
                  <DraftField
                    label={tx(lang, '本音の答え（整理用。そのままは話さない）', '真心话（用于整理，不直接照说）')}
                    initial={w.honne}
                    onSave={(text) => save(withWorksheet(state, p.id, { honne: text }))} />
                  <DraftField
                    label={tx(lang, '面接で伝える言い方（日本語で）', '面试时的说法（用日语）')}
                    initial={w.omote}
                    onSave={(text) => save(withWorksheet(state, p.id, { omote: text }))} />
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => setView({ kind: 'home' })}
          className="mt-4 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white">
          {tx(lang, '書けたぶんを保存して戻る', '保存已写的内容并返回')}
        </button>
      </div>
    );
  }

  /* ── 広場（ホーム） ── */
  const ov = interviewOverview(state);
  const cats = categoryProgress(state);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <button type="button" onClick={onBack} className="mb-1 min-h-[44px] text-sm text-gray-500">
        ← {tx(lang, '今日の冒険へ戻る', '回到今天的冒险')}
      </button>
      <h1 className="text-xl font-bold text-gray-900">{tx(lang, '帰化面接の表現特訓', '入籍面试表达特训')}</h1>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">
        {tx(lang,
          '面接で聞かれそうなことを、自分の言葉の日本語で言えるようにする場所です。模擬面接そのものは先生の授業で行います。',
          '在这里练习用自己的话说出面试可能被问到的内容。模拟面试将在老师的课上进行。')}
      </p>

      <div className={`${card} mt-3 flex items-start gap-2 bg-blue-50/50`}>
        <TeacherAvatar size={32} lang={lang} labeled={false} className="shrink-0" />
        <p className="text-xs leading-relaxed text-gray-700">
          {tx(lang,
            '回答例はそのまま暗記しないでください。面接官はあなたの申請書類を見ながら聞くので、借り物の答えは食い違いで崩れます。回答例は「長さと形」の参考にして、中身は必ず自分の事実で作りましょう。',
            '请不要照背范例。面试官会对照你的申请材料提问，借来的答案会因不一致而露馅。范例只作为「长度和结构」的参考，内容一定要用自己的事实。')}
        </p>
      </div>

      {/* 進捗（実測だけ）。%やスコアにしない */}
      <div className={`${card} mt-3`}>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-gray-500">{tx(lang, '自分の答えを書いた', '已写出自己的答案')}</dt>
            <dd className="font-bold text-gray-900">{ov.answered} / {ov.totalQuestions}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">{tx(lang, '声に出して練習した', '开口练习过')}</dt>
            <dd className="font-bold text-gray-900">{ov.spoken} / {ov.totalQuestions}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">{tx(lang, '自分ノート', '自我笔记')}</dt>
            <dd className="font-bold text-gray-900">{ov.worksheetDone} / {ov.worksheetTotal}</dd></div>
        </dl>
      </div>

      {/* 自分ノート（動機の土台。最初にやる） */}
      <button type="button" onClick={() => setView({ kind: 'worksheet' })}
        className="mt-3 flex w-full min-h-[56px] items-center gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 px-4 py-3 text-left">
        <NotebookPen className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-gray-900">{tx(lang, 'まず：自分ノート', '第一步：自我笔记')}</span>
          <span className="block text-xs text-gray-600">
            {tx(lang, '「なぜ帰化したいか」を自分の言葉にする（面接の中心）', '把「为什么想入籍」变成自己的话（面试核心）')}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      </button>

      {/* テーマ別特訓 */}
      <p className="mt-4 mb-1.5 text-xs font-bold text-gray-500">{tx(lang, 'テーマ別の特訓', '按主题特训')}</p>
      <ul className="space-y-2">
        {cats.map((c) => {
          const label = INTERVIEW_CATEGORY_LABEL[c.category];
          return (
            <li key={c.category}>
              <button type="button" onClick={() => setView({ kind: 'category', category: c.category })}
                className="flex w-full min-h-[56px] items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{tx(lang, label.ja, label.zh)}</span>
                  <span className="block text-xs text-gray-600">
                    {tx(lang, `答えを書いた ${c.answered}/${c.total}・声に出した ${c.spoken}/${c.total}`,
                      `已写 ${c.answered}/${c.total}・开口 ${c.spoken}/${c.total}`)}
                  </span>
                </span>
                {c.total > 0 && c.spoken === c.total && (
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** 下書き→フォーカスが外れたら保存のtextarea（打鍵ごとの保存を避ける） */
const DraftField = ({ label, initial, onSave }: {
  label: string; initial: string; onSave: (text: string) => void;
}) => {
  const [draft, setDraft] = useState(initial);
  return (
    <label className="mt-2 block text-xs font-semibold text-gray-500">
      {label}
      <textarea className={`${field} mt-1 min-h-16`} value={draft} maxLength={2000}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== initial) onSave(draft); }} />
    </label>
  );
};

/* ── 1問の特訓画面 ── */
const QuestionDrill = ({
  lang, q, note, position, onSaveAnswer, onSpoken, onNotApplicable, onNext, nextLabel, onBack,
}: {
  lang: L;
  q: InterviewQuestion;
  note: ReturnType<typeof noteFor>;
  position: string;
  onSaveAnswer: (text: string) => void;
  /** 答えの本文つきで記録する（保存と記録を親側で1回の更新にまとめるため） */
  onSpoken: (text: string) => void;
  onNotApplicable: (v: boolean) => void;
  onNext: () => void;
  nextLabel: string;
  onBack: () => void;
}) => {
  const [showModel, setShowModel] = useState(false);
  const [draft, setDraft] = useState(note.myAnswer);
  const canPractice = draft.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <div className="flex items-baseline justify-between gap-2">
        <button type="button" onClick={onBack} className="min-h-[44px] text-sm text-gray-500">
          ← {tx(lang, 'テーマへ戻る', '回到主题')}
        </button>
        <p className="text-xs text-gray-400">{position}</p>
      </div>

      {/* 質問（面接官のことば） */}
      <div className={`${card} border-blue-200`}>
        <p className="text-[11px] font-semibold text-gray-500">{tx(lang, '面接官', '面试官')}</p>
        <p className="mt-0.5 text-base font-bold leading-relaxed text-gray-900">{q.questionJa}</p>
        {lang === 'zh' && <p className="mt-1 text-xs text-gray-500">{q.questionHintZh}</p>}
      </div>

      {q.conditional && (
        <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={note.notApplicable}
            onChange={(e) => onNotApplicable(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          {tx(lang, 'この質問は私には当てはまらない（進捗から外す）', '这个问题不适用于我（从进度中排除）')}
        </label>
      )}

      {!note.notApplicable && (
        <>
          {/* 何を見られているか＝深掘りに耐える鍵 */}
          <div className={`${card} mt-3`}>
            <p className="text-xs font-bold text-indigo-800">{tx(lang, 'この質問で確認されていること', '这个问题在确认什么')}</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-700">{tx(lang, q.intentJa, q.intentZh)}</p>
            <p className="mt-2 text-xs font-bold text-indigo-800">{tx(lang, '答え方のポイント', '回答要点')}</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-700">{tx(lang, q.pointJa, q.pointZh)}</p>
          </div>

          {/* 回答例は畳んでおく（まず自分で考える） */}
          <button type="button" onClick={() => setShowModel((v) => !v)}
            className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700"
            aria-expanded={showModel}>
            {showModel ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            {showModel ? tx(lang, '回答例を閉じる', '收起范例') : tx(lang, '回答例を見る（まず自分で考えてから）', '查看范例（先自己想一想）')}
          </button>
          {showModel && (
            <div className={`${card} mt-2 bg-gray-50`}>
              <p className="text-sm leading-relaxed text-gray-700">{q.modelAnswerJa}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
                {tx(lang, '※ 長さと形の参考です。中身は必ず自分の事実に置き換えてください。',
                  '※ 仅作为长度和结构的参考。内容务必换成你自己的事实。')}
              </p>
            </div>
          )}

          {/* 自分の答え */}
          <label className="mt-3 block">
            <span className="text-xs font-bold text-gray-700">{tx(lang, '自分の答え（自分の事実で書く）', '自己的答案（用自己的事实写）')}</span>
            <textarea className={`${field} mt-1 min-h-24`} value={draft} maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { if (draft !== note.myAnswer) onSaveAnswer(draft); }} />
          </label>

          {/* 声に出す練習。書くまで押せない */}
          <button type="button" disabled={!canPractice}
            onClick={() => onSpoken(draft)}
            className="mt-3 flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:opacity-40">
            <Mic className="h-4 w-4" aria-hidden />
            {tx(lang, '声に出して言えた（記録する）', '开口说出来了（记录）')}
            {note.spokenCount > 0 && <span className="text-sm font-normal">×{note.spokenCount}</span>}
          </button>
          {!canPractice && (
            <p className="mt-1 text-center text-[11px] text-gray-500">
              {tx(lang, '先に自分の答えを書くと押せるようになります', '先写下自己的答案才能记录')}
            </p>
          )}
        </>
      )}

      <button type="button" onClick={onNext}
        className="mt-3 w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">
        {nextLabel}
      </button>
    </div>
  );
};
