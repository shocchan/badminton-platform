// ミニ模試 runtime（COMPLETION §9）。
// section intro → タイマー付き解答 → 未回答警告 → section提出 → section遷移 → 最終提出 → 技能別結果。
// reload しても同じ問題・同じ提示順・同じ残り時間で再開する（seed＋保存状態）。
// 「本番同等」とは表示しない。短時間版／本番時間版を明示的に分ける。
import { pressFx, primaryBtn } from './advUi';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MockSpec } from '../../../lib/aiLesson/course/adventure/advMock';
import type { AdvBattleQuestion } from '../../../lib/aiLesson/course/adventure/advVariants';
import {
  startMockSession, restoreMockSession, gradeMock, unansweredIndexes,
  sectionTimeLimit, MOCK_MODE_LABEL,
  type MockRuntime, type MockSessionState, type MockResult,
} from '../../../lib/aiLesson/course/adventure/advMockSession';
import { EXAM_SKILL_LABELS, nowTrainingLabel } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import type { AdvMockLogEntry } from '../../../lib/aiLesson/course/adventure/advTypes';
import { listeningSetById } from '../../../lib/aiLesson/course/adventure/listening/listeningBank';
import { readingSetById } from '../../../lib/aiLesson/course/adventure/reading/readingBank';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export interface AdvMockRunnerProps {
  lang: L;
  spec: MockSpec;
  pools: Map<string, AdvBattleQuestion[]>;
  /**
   * この試行のseed。**呼び出し側が決めて渡す**（2026-08-17）。
   * 語彙の出題プールは attemptSeed から作るので、begin() の中で seed を作ると
   * 「プールを作った seed」と「問題を選ぶ seed」が食い違い、
   * 保存した答案が復元できなくなる（advMockSession.ts:213）。
   * 復帰時は savedState.attemptSeed をそのまま渡すこと。
   */
  attemptSeed: number;
  seenKeys: Set<string>;
  /** 保存済みセッション（reload復帰） */
  savedState: MockSessionState | null;
  onPersist: (state: MockSessionState | null) => void;
  /**
   * 模試の完了。**保存はこの中で1回だけ行うこと**。
   * mockSession（中断状態）の破棄もこの保存に含める＝ここで onPersist(null) は呼ばない
   * （同じtickに保存を2回投げると、到着順が入れ替わったとき結果が消える・2026-08-18 監査P1）
   */
  onFinish: (result: MockResult) => void;
  onClose: () => void;
  /** これまでの模試ログ（成績推移の表示用・2026-08-17 監査: 保存済みなのに見えなかった） */
  history?: AdvMockLogEntry[];
  /** 前に受けた回の間違い直しを開く（2026-08-25）。渡さなければ入口を出さない */
  onOpenReview?: () => void;
  /** 開始前に添える文脈の一言（基礎固め中の低得点は正常、等）。無ければ出さない */
  contextNoteJa?: string | null;
  contextNoteZh?: string | null;
}

type Phase = 'chooseMode' | 'sectionIntro' | 'answering' | 'sectionResult' | 'finished';

export function AdvMockRunner(props: AdvMockRunnerProps) {
  const { lang, spec } = props;
  const [rt, setRt] = useState<MockRuntime | null>(() => (
    props.savedState ? restoreMockSession(spec, props.pools, props.savedState) : null
  ));
  const [phase, setPhase] = useState<Phase>(() => (props.savedState ? 'sectionIntro' : 'chooseMode'));
  const [qIdx, setQIdx] = useState(0);
  const [warnUnanswered, setWarnUnanswered] = useState<number[] | null>(null);
  const [result, setResult] = useState<MockResult | null>(null);
  const [seenAtStart] = useState(() => new Set(props.seenKeys));
  // 保存stateがあるのに復元できなかった（問題プールの変更等）。黙って新規画面に
  // 戻すと「途中のはずでは？」と混乱するので、事情を一言出して保存stateは捨てる
  const [restoreFailed] = useState(() => !!props.savedState && !rt);
  const persistRef = useRef(props.onPersist);
  const rtRef = useRef<MockRuntime | null>(null);
  useEffect(() => { if (restoreFailed) persistRef.current(null); }, [restoreFailed]);
  useEffect(() => { persistRef.current = props.onPersist; }, [props.onPersist]);
  useEffect(() => { rtRef.current = rt; }, [rt]);

  const section = rt ? rt.sections[rt.state.sectionIndex] : null;

  // タイマー: 1秒ごとに残り秒を減らし、0で自動的にセクション終了へ移す。
  // 状態の読み書きはrefを通す（setStateの更新関数の中で他のsetStateを呼ばない）。
  useEffect(() => {
    if (phase !== 'answering') return;
    const t = setInterval(() => {
      const cur = rtRef.current;
      if (!cur) return;
      const idx = cur.state.sectionIndex;
      const rem = cur.state.remainingSecBySection[idx] ?? 0;
      if (rem <= 0) return;
      const nextRem = rem - 1;
      const nextState: MockSessionState = {
        ...cur.state,
        remainingSecBySection: cur.state.remainingSecBySection.map((v, i) => (i === idx ? nextRem : v)),
      };
      const next = { ...cur, state: nextState };
      rtRef.current = next;
      setRt(next);
      // 10秒ごとに保存（毎秒書き込まない）
      if (nextRem % 10 === 0) persistRef.current(nextState);
      if (nextRem === 0) {
        persistRef.current(nextState);
        setPhase('sectionResult');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const begin = useCallback((mode: 'short' | 'fullTime') => {
    const created = startMockSession(spec, props.pools, mode, props.attemptSeed, new Date().toISOString());
    if (!created) return;
    rtRef.current = created;
    setRt(created);
    props.onPersist(created.state);
    trackAdv('mock_started', { locale: lang, targetLevel: spec.level });
    setPhase('sectionIntro');
  }, [spec, lang, props]);

  const answer = (questionKey: string, choiceId: string) => {
    const cur = rtRef.current ?? rt;
    if (!cur) return;
    const next = { ...cur, state: { ...cur.state, answers: { ...cur.state.answers, [questionKey]: choiceId } } };
    rtRef.current = next;
    setRt(next);
    persistRef.current(next.state);
  };

  const submitSection = (force: boolean) => {
    if (!rt) return;
    const missing = unansweredIndexes(rt, rt.state.sectionIndex);
    if (!force && missing.length > 0) { setWarnUnanswered(missing); return; }
    setWarnUnanswered(null);
    trackAdv('mock_section_completed', { locale: lang, targetLevel: spec.level });
    setPhase('sectionResult');
  };

  const nextSection = useCallback(() => {
    if (!rt) return;
    const isLast = rt.state.sectionIndex >= rt.sections.length - 1;
    if (isLast) {
      const graded = gradeMock(rt, seenAtStart);
      const done = { ...rt, state: { ...rt.state, finishedAt: new Date().toISOString() } };
      rtRef.current = done;
      setRt(done);
      setResult(graded);
      trackAdv('mock_completed', { locale: lang, targetLevel: spec.level });
      // **保存は onFinish の1回だけ**（2026-08-18 監査P1）。
      // 以前はここで onPersist(null)（＝mockSessionを消すだけの保存）を撃ってから
      // onFinish（＝mastery・mockLog・XPを含む保存）を撃っていた。
      // どちらも同じ描画時点のプロファイルから全体を組み立てて await せずに投げるため、
      // 先に投げた「結果を含まない方」が後に着くと、20分かけた模試の記録が丸ごと消えた。
      // 中断状態の破棄（mockSession: null）は onFinish の保存に含めること（呼び出し側の約束）。
      props.onFinish(graded);
      setPhase('finished');
      return;
    }
    const next = {
      ...rt,
      state: {
        ...rt.state,
        sectionIndex: rt.state.sectionIndex + 1,
        completedSections: [...rt.state.completedSections, rt.sections[rt.state.sectionIndex].section.sectionId],
      },
    };
    rtRef.current = next;
    setRt(next);
    props.onPersist(next.state);
    setQIdx(0);
    setPhase('sectionIntro');
  }, [rt, seenAtStart, lang, spec.level, props]);

  // ── 模試が組めない（技能が足りない）──
  if (spec.sections.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8">
        <h2 className="text-lg font-bold text-gray-900">{tx(lang, spec.titleJa, spec.titleZh)}</h2>
        <ul className="mt-3 space-y-1">
          {(lang === 'zh' ? spec.blockersZh : spec.blockersJa).map((b) => (
            <li key={b} className="text-sm text-gray-700">・{b}</li>
          ))}
        </ul>
        <button type="button" className={`${primaryBtn} mt-6`} onClick={props.onClose}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  // ── モード選択 ──
  if (phase === 'chooseMode' || !rt || !section) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 className="text-lg font-bold text-gray-900">{tx(lang, spec.titleJa, spec.titleZh)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{tx(lang, spec.disclaimerJa, spec.disclaimerZh)}</p>
        {/* 基礎固め中の受験など、結果の受け止め方を先に伝える（低得点で心を折らない・2026-08-17） */}
        {(props.contextNoteJa || props.contextNoteZh) && (
          <p className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
            {tx(lang, props.contextNoteJa ?? '', props.contextNoteZh ?? props.contextNoteJa ?? '')}
          </p>
        )}
        {restoreFailed && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3" role="status">
            <p className="text-xs leading-relaxed text-amber-900">
              {tx(lang,
                '途中だった模試は、問題の入れ替えがあったため再開できませんでした。お手数ですが最初からやり直してください。',
                '之前进行到一半的模拟考试因题目有更新而无法继续。抱歉，请从头再来一次。')}
            </p>
          </div>
        )}
        {!spec.ready && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">{tx(lang, '含まれない科目があります', '有未包含的科目')}</p>
            <ul className="mt-1 space-y-0.5">
              {(lang === 'zh' ? spec.blockersZh : spec.blockersJa).map((b) => (
                <li key={b} className="text-xs text-amber-900">・{b}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 space-y-2">
          {(['short', 'fullTime'] as const).map((mode) => (
            <button key={mode} type="button"
              className={`${pressFx} action-choice w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-left`}
              onClick={() => begin(mode)}>
              <span className="block font-semibold text-gray-900">{tx(lang, MOCK_MODE_LABEL[mode].ja, MOCK_MODE_LABEL[mode].zh)}</span>
              <span className="block text-xs text-gray-600">{tx(lang, MOCK_MODE_LABEL[mode].note.ja, MOCK_MODE_LABEL[mode].note.zh)}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-700">{tx(lang, '構成', '构成')}</p>
          <ul className="mt-1 space-y-0.5">
            {spec.sections.map((s) => (
              <li key={s.sectionId} className="text-xs text-gray-600">
                ・{tx(lang, s.labelJa, s.labelZh)} — {s.questionCount}{tx(lang, '問', '题')}
              </li>
            ))}
          </ul>
        </div>
        {/* 前に受けた回の間違い直し（2026-08-25）。試験形式はその場で答え合わせをしないので、
            「あとで解説を読む」入口をここにも置く（受けた回があるときだけ） */}
        {props.onOpenReview && (props.history ?? []).length > 0 && (
          <button type="button"
            className={`${pressFx} action-secondary mt-4 w-full min-h-[48px] rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700`}
            onClick={props.onOpenReview}>
            {tx(lang, '前の模試の間違い直しを見る', '查看之前模拟考的错题解析')}
          </button>
        )}
        <button type="button" className={`${pressFx} mt-4 w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline active:bg-gray-100`} onClick={props.onClose}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  const remaining = rt.state.remainingSecBySection[rt.state.sectionIndex] ?? 0;
  const answeredCount = section.questions.filter((q) => (rt.state.answers[q.key] ?? null) !== null).length;

  // ── section intro ──
  if (phase === 'sectionIntro') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <p className="text-xs text-gray-500">
          {tx(lang, `${rt.state.sectionIndex + 1}／${rt.sections.length} セクション`, `第${rt.state.sectionIndex + 1}／${rt.sections.length} 部分`)}
          ・{tx(lang, MOCK_MODE_LABEL[rt.state.mode].ja, MOCK_MODE_LABEL[rt.state.mode].zh)}
        </p>
        <h2 className="mt-1 text-xl font-bold text-gray-900">{tx(lang, section.section.labelJa, section.section.labelZh)}</h2>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            {tx(lang, `問題数 ${section.questions.length}問`, `题量 ${section.questions.length}题`)}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {tx(lang, `制限時間 ${mmss(sectionTimeLimit(section.section, rt.state.level, rt.state.mode))}`,
              `限时 ${mmss(sectionTimeLimit(section.section, rt.state.level, rt.state.mode))}`)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {tx(lang, '時間内に終わらなかった分は未回答として採点されます。', '未在时间内完成的部分按未作答计分。')}
          </p>
        </div>
        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => { setQIdx(0); setPhase('answering'); }}>
          {tx(lang, 'このセクションを始める', '开始这一部分')}
        </button>
      </div>
    );
  }

  // ── section result ──
  if (phase === 'sectionResult') {
    const missing = unansweredIndexes(rt, rt.state.sectionIndex);
    const isLast = rt.state.sectionIndex >= rt.sections.length - 1;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 className="text-lg font-bold text-gray-900">
          {tx(lang, `${section.section.labelJa} 終了`, `${section.section.labelZh} 结束`)}
        </h2>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            {tx(lang, `回答 ${answeredCount}／${section.questions.length}問`, `已答 ${answeredCount}／${section.questions.length}题`)}
          </p>
          {missing.length > 0 && (
            <p className="mt-1 text-sm text-amber-800">
              {tx(lang, `未回答 ${missing.length}問`, `未作答 ${missing.length}题`)}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {tx(lang, '正誤は最後にまとめて表示します。', '对错将在最后统一显示。')}
          </p>
        </div>
        <button type="button" className={`${primaryBtn} mt-4`} onClick={nextSection}>
          {isLast ? tx(lang, '採点する', '评分') : tx(lang, '次のセクションへ', '进入下一部分')}
        </button>
      </div>
    );
  }

  // ── 最終結果 ──
  if (phase === 'finished' && result) {
    // 間違い直し（2026-08-17 監査: section終了時に「正誤は最後にまとめて表示します」と
    // 約束しながら、最終画面に集計しか無かった）。誤答＋未回答を問題単位で振り返る
    // 表示と保存で同じ材料を使う（保存だけ内容がずれる事故を防ぐ・2026-08-25）
    const wrongItems = result.wrong.map((w) => ({
      key: w.key,
      label: `${tx(lang, w.sectionLabelJa, w.sectionLabelZh)} ${w.index}`,
      stem: w.stemJa,
      stemZh: w.stemZh,
      pickedText: w.pickedTextJa,
      correctText: w.correctTextJa,
      whyJa: w.whyJa,
      whyZh: w.whyZh,
    }));
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 className="text-xl font-bold text-gray-900">{tx(lang, spec.titleJa, spec.titleZh)}</h2>
        <p className="mt-1 text-xs text-gray-500">{tx(lang, MOCK_MODE_LABEL[result.mode].note.ja, MOCK_MODE_LABEL[result.mode].note.zh)}</p>
        <p className="mt-3 text-3xl font-bold text-blue-700">
          {result.totalCorrect}／{result.totalQuestions}
        </p>
        <p className="text-xs text-gray-500">
          {tx(lang, `未回答 ${result.totalUnanswered}問・未出問題 ${Math.round(result.unseenRatio * 100)}%`,
            `未作答 ${result.totalUnanswered}题・未见过的题 ${Math.round(result.unseenRatio * 100)}%`)}
        </p>

        <div className="mt-4 space-y-2">
          {result.sections.map((s) => (
            <div key={s.sectionId} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">{tx(lang, s.labelJa, s.labelZh)}</p>
                <p className="text-sm font-bold text-blue-800">{s.correct}／{s.total}</p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                <div className="h-full rounded-full bg-blue-600"
                  style={{ width: `${s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0}%` }} />
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {tx(lang, `所要 ${mmss(s.elapsedSec)}`, `用时 ${mmss(s.elapsedSec)}`)}
                ・{s.finishedInTime ? tx(lang, '時間内', '时间内') : tx(lang, '時間切れ', '超时')}
                {s.unanswered > 0 && `・${tx(lang, `未回答${s.unanswered}`, `未答${s.unanswered}`)}`}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-900">{tx(lang, '試験科目別', '各考试科目')}</p>
          {Object.entries(result.bySkill).map(([skill, row]) => (
            <div key={skill} className="mt-1 flex items-center justify-between text-sm">
              <span className="text-gray-700">
                {tx(lang, EXAM_SKILL_LABELS[skill as keyof typeof EXAM_SKILL_LABELS]?.ja ?? skill,
                  EXAM_SKILL_LABELS[skill as keyof typeof EXAM_SKILL_LABELS]?.zh ?? skill)}
              </span>
              <span className="font-semibold text-gray-900">{row.correct}／{row.total}</span>
            </div>
          ))}
          <p className="mt-2 text-xs text-gray-500">
            {tx(lang, 'この結果は準備度へ反映されます。合格を保証するものではありません。',
              '此结果会反映到准备度。这不构成合格保证。')}
          </p>
        </div>

        {/* 間違い直し（約束どおり問題単位の正誤をここで見せる）。全問正解なら出さない */}
        {wrongItems.length > 0 && (
          <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60">
            <summary className={`${pressFx} min-h-[48px] cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-bold text-amber-900`}>
              {tx(lang, `間違い直しを見る（${wrongItems.length}問）▾`, `查看错题（${wrongItems.length}题）▾`)}
            </summary>
            <ul className="space-y-3 px-4 pb-4">
              {wrongItems.map((w) => (
                <li key={w.key} className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-[11px] font-semibold text-gray-500">{w.label}</p>
                  <p lang="ja" className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-900">{w.stem}</p>
                  {lang === 'zh' && w.stemZh && <p className="mt-0.5 text-xs text-gray-500">{w.stemZh}</p>}
                  <p className="mt-2 text-sm">
                    <span className="text-red-600">✕ {w.pickedText ?? tx(lang, '未回答', '未作答')}</span>
                  </p>
                  <p className="mt-0.5 text-sm">
                    <span className="font-semibold text-emerald-700">◯ {w.correctText}</span>
                  </p>
                  <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-700">
                    {tx(lang, w.whyJa, w.whyZh || w.whyJa)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* 成績の推移（2026-08-17 監査: mockLogに保存済みなのにどこにも見えなかった）。
            実測の記録のみ・最新5回。回数が1回だけなら比較できないので出さない */}
        {(props.history ?? []).length >= 2 && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-sm font-semibold text-gray-900">{tx(lang, '模試の記録（最近5回）', '模拟考记录（最近5次）')}</p>
            <ul className="mt-1 space-y-1">
              {(props.history ?? []).slice(-5).reverse().map((h) => {
                const pct = h.totalQuestions > 0 ? Math.round((h.totalCorrect / h.totalQuestions) * 100) : 0;
                return (
                  <li key={h.mockId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{h.dateKey}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                        <span className="block h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-12 text-right font-semibold text-gray-900">{pct}%</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <button type="button" className={`${primaryBtn} mt-4`} onClick={props.onClose}>
          {tx(lang, '冒険にもどる', '回到冒险')}
        </button>
      </div>
    );
  }

  // ── 解答中 ──
  const q = section.questions[qIdx];
  const presented = section.presented.find((p) => p.key === q.key)!;
  const picked = rt.state.answers[q.key] ?? null;
  const listening = q.skill === 'listening' ? listeningSetById(q.sourceItemId) : undefined;
  const reading = q.skill === 'reading' ? readingSetById(q.sourceItemId) : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      {/* ヘッダー: セクション・残り時間・進捗 */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">{tx(lang, section.section.labelJa, section.section.labelZh)}</span>
          <span className={`font-bold transition-colors ${remaining <= 60 ? 'animate-pulse text-red-600' : 'text-gray-800'}`} aria-live="polite">
            ⏱ {mmss(remaining)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={tx(lang, '問題の移動', '题目导航')}>
          {section.questions.map((sq, i) => {
            const done = (rt.state.answers[sq.key] ?? null) !== null;
            return (
              <button key={sq.key} type="button"
                aria-current={i === qIdx}
                aria-label={tx(lang, `問題${i + 1}${done ? '（回答済み）' : '（未回答）'}`, `第${i + 1}题${done ? '（已答）' : '（未答）'}`)}
                className={`${pressFx} h-8 w-8 rounded text-xs font-bold ${
                  i === qIdx ? 'bg-blue-600 text-white'
                    : done ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}
                onClick={() => setQIdx(i)}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {nowTrainingLabel(q.skill, lang)}
      </p>

      {/* 読解は本文、聴解は音声 */}
      {reading && (
        <div className="mb-3 max-h-[40vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4">
          <p lang="ja" className="whitespace-pre-wrap text-[15px] leading-8 text-gray-900">{reading.passageJa}</p>
        </div>
      )}
      {listening && <MockAudio key={listening.setId} lang={lang} src={listening.audioAsset} playLimit={listening.playLimit} />}

      {q.targetJapanese && !reading && (
        <p className="mb-1 rounded-lg bg-gray-50 px-3 py-2 text-base font-semibold leading-relaxed text-gray-900">{q.targetJapanese}</p>
      )}
      {q.questionJa && <p className="mb-1 text-base font-semibold text-gray-900">{q.questionJa}</p>}
      {/* 中国語の設問は、zh画面のときと**日本語の設問が無いとき**に出す（2026-08-17 staging実測）。
          rec問題は questionJa が構造的に常に null で、設問は promptZh 側にしかない。
          ja画面でこれを出さないと「見出し＋選択肢4つ」だけが並び、
          何を問われているのか分からないまま選ばせることになる（バトル画面は常に出している）。
          見出しまで隠れる問題（答えを割るケース）では、これが唯一の設問文になる */}
      {(lang === 'zh' || !q.questionJa) && (
        <p className="mb-3 text-sm text-gray-600">{q.questionZh}</p>
      )}

      <div className="space-y-2">
        {presented.choices.map((c) => (
          <button key={c.choiceId} type="button"
            aria-pressed={picked === c.choiceId}
            className={`${pressFx} action-choice w-full min-h-[44px] rounded-xl border px-4 py-3 text-left text-sm ${
              picked === c.choiceId ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-gray-200 bg-white hover:border-blue-400'}`}
            onClick={() => answer(q.key, c.choiceId)}>
            {c.textJa}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" className={`${pressFx} action-secondary min-h-[44px] flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-40 disabled:shadow-none`}
          disabled={qIdx === 0} onClick={() => setQIdx(qIdx - 1)}>
          {tx(lang, '前へ', '上一题')}
        </button>
        {qIdx + 1 < section.questions.length ? (
          <button type="button" className={`${pressFx} action-primary-blue min-h-[44px] flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white`}
            onClick={() => setQIdx(qIdx + 1)}>
            {tx(lang, '次へ', '下一题')}
          </button>
        ) : (
          <button type="button" className={`${pressFx} action-emerald min-h-[44px] flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white`}
            onClick={() => submitSection(false)}>
            {tx(lang, 'このセクションを終える', '结束这一部分')}
          </button>
        )}
      </div>

      {warnUnanswered && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3" role="alert">
          <p className="text-sm font-semibold text-amber-900">
            {tx(lang, `未回答が${warnUnanswered.length}問あります（問${warnUnanswered.join('・')}）`,
              `还有${warnUnanswered.length}题未作答（第${warnUnanswered.join('・')}题）`)}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={`${pressFx} action-amber min-h-[44px] flex-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm`}
              onClick={() => { setQIdx(warnUnanswered[0] - 1); setWarnUnanswered(null); }}>
              {tx(lang, '戻って回答する', '返回作答')}
            </button>
            <button type="button" className={`${pressFx} action-amber min-h-[44px] flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white`}
              onClick={() => submitSection(true)}>
              {tx(lang, 'このまま終える', '就这样结束')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 模試内の音声（解答中はtranscriptを出さない） */
function MockAudio({ lang, src, playLimit }: { lang: L; src: string; playLimit: 1 | 2 }) {
  const [plays, setPlays] = useState(0);
  const [state, setState] = useState<'idle' | 'playing' | 'error'>('idle');
  const ref = useRef<HTMLAudioElement | null>(null);
  const canPlay = plays < playLimit && state !== 'playing';
  return (
    <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3 text-center">
      <audio ref={ref} src={src} preload="auto"
        onPlaying={() => setState('playing')} onEnded={() => setState('idle')} onError={() => setState('error')} />
      <button type="button" disabled={!canPlay}
        className={`${pressFx} w-full min-h-[44px] rounded-xl px-4 py-2 font-bold text-white transition-colors duration-200 ${canPlay ? 'action-primary-blue bg-blue-600' : 'bg-gray-300'}`}
        onClick={() => {
          const el = ref.current; if (!el) return;
          el.currentTime = 0;
          void el.play().then(() => { setPlays((n) => n + 1); setState('playing'); }).catch(() => setState('error'));
        }}>
        {state === 'playing' ? tx(lang, '再生中…', '播放中…') : tx(lang, '▶ 音声を再生する', '▶ 播放音频')}
      </button>
      <p className="mt-1 text-xs text-gray-500">
        {tx(lang, `あと${Math.max(0, playLimit - plays)}回`, `还剩${Math.max(0, playLimit - plays)}次`)}
      </p>
      {state === 'error' && <p className="mt-1 text-xs text-red-600">{tx(lang, '音声を再生できませんでした。', '音频无法播放。')}</p>}
    </div>
  );
}

export default AdvMockRunner;
