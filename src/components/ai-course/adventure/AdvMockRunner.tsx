// ミニ模試 runtime（COMPLETION §9）。
// section intro → タイマー付き解答 → 未回答警告 → section提出 → section遷移 → 最終提出 → 技能別結果。
// reload しても同じ問題・同じ提示順・同じ残り時間で再開する（seed＋保存状態）。
//
// P0以降の形:
// - 問題は**サーバーが構成して**返す（正解なし・提示順はサーバー確定）
// - 採点は最後に**サーバーが一括で**行う。正誤・正解はそれまで client に存在しない
// - 再開は保存した attemptSeed で同じ構成をサーバーへ再要求する
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startMock, gradeMockSession, audioUrl, isRetryable,
  type ServerMock, type ServerQuestion, type ActivityDenial,
} from '../../../lib/aiLesson/course/adventure/activityClient';
import { useAdvRuntime } from './AdvRuntimeContext';
import { DeniedView } from './AdvBattleRunner';
import { MOCK_MODE_LABEL } from '../../../lib/aiLesson/course/adventure/advMockSession';
import type { AdvMockSessionState } from '../../../lib/aiLesson/course/adventure/advTypes';
import { EXAM_SKILL_LABELS, nowTrainingLabel, type ExamSkill } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);
const primaryBtn = 'w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:opacity-40';
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** サーバー採点の結果（gradeMockSession の result） */
export interface ServerMockResult {
  totalCorrect: number; totalQuestions: number; totalUnanswered: number;
  sections: {
    sectionId: string; labelJa: string; labelZh: string;
    correct: number; total: number; unanswered: number;
    elapsedSec: number; finishedInTime: boolean;
    bySkill: Record<string, { correct: number; total: number; unseen: number }>;
  }[];
  bySkill: Record<string, { correct: number; total: number; unseen: number }>;
  skills: string[]; allQuestionKeys: string[]; unseenRatio: number;
  mockId: string; level: 'N2' | 'N3'; mode: 'short' | 'fullTime';
}

export interface AdvMockRunnerProps {
  lang: L;
  level: 'N2' | 'N3';
  seenKeys: Set<string>;
  /** 保存済みセッション（reload復帰）。attemptSeed から同じ構成を再要求する */
  savedState: AdvMockSessionState | null;
  onPersist: (state: AdvMockSessionState | null) => void;
  onFinish: (result: ServerMockResult) => void;
  onClose: () => void;
}

type Phase = 'chooseMode' | 'restoring' | 'sectionIntro' | 'answering' | 'sectionResult' | 'grading' | 'finished';

export function AdvMockRunner(props: AdvMockRunnerProps) {
  const { lang } = props;
  const runtime = useAdvRuntime();
  const [mock, setMock] = useState<ServerMock | null>(null);
  const [denied, setDenied] = useState<ActivityDenial | null>(null);
  const [state, setState] = useState<AdvMockSessionState | null>(props.savedState);
  const [phase, setPhase] = useState<Phase>(() => (props.savedState ? 'restoring' : 'chooseMode'));
  const [qIdx, setQIdx] = useState(0);
  const [warnUnanswered, setWarnUnanswered] = useState<number[] | null>(null);
  const [result, setResult] = useState<ServerMockResult | null>(null);
  const persistRef = useRef(props.onPersist);
  const stateRef = useRef<AdvMockSessionState | null>(props.savedState);
  useEffect(() => { persistRef.current = props.onPersist; }, [props.onPersist]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // reload復帰: 保存済み attemptSeed で同じ構成をサーバーへ再要求する
  useEffect(() => {
    if (phase !== 'restoring' || !props.savedState) return;
    let alive = true;
    void startMock(runtime.auth, { mode: props.savedState.mode, attemptSeed: props.savedState.attemptSeed }).then((r) => {
      if (!alive) return;
      if (!r.ok) { setDenied(r.denial); return; }
      setMock(r.data);
      setPhase('sectionIntro');
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const section = mock && state ? mock.sections[state.sectionIndex] : null;

  // タイマー: 1秒ごとに残り秒を減らし、0で自動的にセクション終了へ移す
  useEffect(() => {
    if (phase !== 'answering') return;
    const t = setInterval(() => {
      const cur = stateRef.current;
      if (!cur) return;
      const idx = cur.sectionIndex;
      const rem = cur.remainingSecBySection[idx] ?? 0;
      if (rem <= 0) return;
      const nextRem = rem - 1;
      const next: AdvMockSessionState = {
        ...cur,
        remainingSecBySection: cur.remainingSecBySection.map((v, i) => (i === idx ? nextRem : v)),
      };
      stateRef.current = next;
      setState(next);
      if (nextRem % 10 === 0) persistRef.current(next);
      if (nextRem === 0) {
        persistRef.current(next);
        setPhase('sectionResult');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const begin = useCallback((mode: 'short' | 'fullTime') => {
    const seed = Date.now();
    void startMock(runtime.auth, { mode, attemptSeed: seed }).then((r) => {
      if (!r.ok) { setDenied(r.denial); return; }
      const created: AdvMockSessionState = {
        mockId: r.data.mockId, level: r.data.level, mode, attemptSeed: seed,
        startedAt: new Date().toISOString(),
        sectionIndex: 0,
        remainingSecBySection: r.data.sections.map((s) => s.timeLimitSec),
        answers: {},
        completedSections: [],
        finishedAt: null,
      };
      setMock(r.data);
      stateRef.current = created;
      setState(created);
      props.onPersist(created);
      trackAdv('mock_started', { locale: lang, targetLevel: r.data.level });
      setPhase('sectionIntro');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, runtime.auth]);

  const answer = (questionKey: string, choiceKey: string) => {
    const cur = stateRef.current;
    if (!cur) return;
    const next = { ...cur, answers: { ...cur.answers, [questionKey]: choiceKey } };
    stateRef.current = next;
    setState(next);
    persistRef.current(next);
  };

  const unansweredOf = (sec: { questions: ServerQuestion[] }, st: AdvMockSessionState): number[] =>
    sec.questions.map((q, i) => ((st.answers[q.key] ?? null) === null ? i + 1 : -1)).filter((v) => v > 0);

  const submitSection = (force: boolean) => {
    if (!mock || !state || !section) return;
    const missing = unansweredOf(section, state);
    if (!force && missing.length > 0) { setWarnUnanswered(missing); return; }
    setWarnUnanswered(null);
    trackAdv('mock_section_completed', { locale: lang, targetLevel: mock.level });
    setPhase('sectionResult');
  };

  const nextSection = useCallback(() => {
    if (!mock || !state) return;
    const isLast = state.sectionIndex >= mock.sections.length - 1;
    if (isLast) {
      setPhase('grading');
      // null（未回答）はサーバーへ送らない（Record<string,string>へ落とす）
      const answered: Record<string, string> = {};
      for (const [k, v] of Object.entries(state.answers)) if (v !== null) answered[k] = v;
      void gradeMockSession(runtime.auth, {
        attemptSeed: state.attemptSeed, mode: state.mode, startedAt: state.startedAt,
        answers: answered, seenKeys: [...props.seenKeys].slice(0, 800),
        remainingSecBySection: state.remainingSecBySection,
      }).then((r) => {
        if (!r.ok) { setDenied(r.denial); return; }
        const graded = r.data.result as ServerMockResult;
        setResult(graded);
        props.onPersist(null); // セッション終了＝保存状態を破棄
        trackAdv('mock_completed', { locale: lang, targetLevel: mock.level });
        props.onFinish(graded);
        setPhase('finished');
      });
      return;
    }
    const next: AdvMockSessionState = {
      ...state,
      sectionIndex: state.sectionIndex + 1,
      completedSections: [...state.completedSections, mock.sections[state.sectionIndex].sectionId],
    };
    stateRef.current = next;
    setState(next);
    props.onPersist(next);
    setQIdx(0);
    setPhase('sectionIntro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock, state, lang, props, runtime.auth]);

  if (denied) {
    return <DeniedView lang={lang} denial={denied} onClose={props.onClose}
      onRetry={isRetryable(denied) ? () => window.location.reload() : undefined} />;
  }

  // ── モード選択 ──
  if (phase === 'chooseMode') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 className="text-lg font-bold text-gray-900">
          {tx(lang, `${props.level}ミニ模試`, `${props.level}迷你模拟考`)}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {tx(lang,
            '本番と同じ科目構成のミニ版です。問題数は本番より少なく、結果は準備度の参考として使います。',
            '与真实考试科目构成相同的迷你版。题量少于真实考试，结果用作准备度的参考。')}
        </p>
        <div className="mt-4 space-y-2">
          {(['short', 'fullTime'] as const).map((mode) => (
            <button key={mode} type="button"
              className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-left"
              onClick={() => begin(mode)}>
              <span className="block font-semibold text-gray-900">{tx(lang, MOCK_MODE_LABEL[mode].ja, MOCK_MODE_LABEL[mode].zh)}</span>
              <span className="block text-xs text-gray-600">{tx(lang, MOCK_MODE_LABEL[mode].note.ja, MOCK_MODE_LABEL[mode].note.zh)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="mt-4 w-full min-h-[44px] text-sm text-gray-500 underline" onClick={props.onClose}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  if (phase === 'restoring' || phase === 'grading' || !mock || !state || !section) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <p className="text-sm text-gray-500">
          {phase === 'grading' ? tx(lang, '採点しています…', '正在评分…') : tx(lang, '模試を用意しています…', '正在准备模拟考…')}
        </p>
      </div>
    );
  }

  const remaining = state.remainingSecBySection[state.sectionIndex] ?? 0;
  const answeredCount = section.questions.filter((q) => (state.answers[q.key] ?? null) !== null).length;

  // ── section intro ──
  if (phase === 'sectionIntro') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <p className="text-xs text-gray-500">
          {tx(lang, `${state.sectionIndex + 1}／${mock.sections.length} セクション`, `第${state.sectionIndex + 1}／${mock.sections.length} 部分`)}
          ・{tx(lang, MOCK_MODE_LABEL[state.mode].ja, MOCK_MODE_LABEL[state.mode].zh)}
        </p>
        <h2 className="mt-1 text-xl font-bold text-gray-900">{tx(lang, section.labelJa, section.labelZh)}</h2>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            {tx(lang, `問題数 ${section.questions.length}問`, `题量 ${section.questions.length}题`)}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {tx(lang, `制限時間 ${mmss(remaining)}`, `限时 ${mmss(remaining)}`)}
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
    const missing = unansweredOf(section, state);
    const isLast = state.sectionIndex >= mock.sections.length - 1;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 className="text-lg font-bold text-gray-900">
          {tx(lang, `${section.labelJa} 終了`, `${section.labelZh} 结束`)}
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
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 className="text-xl font-bold text-gray-900">
          {tx(lang, `${result.level}ミニ模試`, `${result.level}迷你模拟考`)}
        </h2>
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
                {tx(lang, EXAM_SKILL_LABELS[skill as ExamSkill]?.ja ?? skill,
                  EXAM_SKILL_LABELS[skill as ExamSkill]?.zh ?? skill)}
              </span>
              <span className="font-semibold text-gray-900">{row.correct}／{row.total}</span>
            </div>
          ))}
          <p className="mt-2 text-xs text-gray-500">
            {tx(lang, 'この結果は準備度へ反映されます。合格を保証するものではありません。',
              '此结果会反映到准备度。这不构成合格保证。')}
          </p>
        </div>

        <button type="button" className={`${primaryBtn} mt-4`} onClick={props.onClose}>
          {tx(lang, '冒険にもどる', '回到冒险')}
        </button>
      </div>
    );
  }

  // ── 解答中 ──
  const q = section.questions[qIdx] as ServerQuestion & { audioToken?: string };
  const picked = state.answers[q.key] ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      {/* ヘッダー: セクション・残り時間・進捗 */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">{tx(lang, section.labelJa, section.labelZh)}</span>
          <span className={`font-bold ${remaining <= 60 ? 'text-red-600' : 'text-gray-800'}`} aria-live="polite">
            ⏱ {mmss(remaining)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={tx(lang, '問題の移動', '题目导航')}>
          {section.questions.map((sq, i) => {
            const done = (state.answers[sq.key] ?? null) !== null;
            return (
              <button key={sq.key} type="button"
                aria-current={i === qIdx}
                aria-label={tx(lang, `問題${i + 1}${done ? '（回答済み）' : '（未回答）'}`, `第${i + 1}题${done ? '（已答）' : '（未答）'}`)}
                className={`h-8 w-8 rounded text-xs font-bold ${
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
        {nowTrainingLabel(q.skill as ExamSkill, lang)}
      </p>

      {/* 読解は本文（targetJapanese に載っている）、聴解は音声トークン */}
      {q.skill === 'reading' && q.targetJapanese && (
        <div className="mb-3 max-h-[40vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4">
          <p lang="ja" className="whitespace-pre-wrap text-[15px] leading-8 text-gray-900">{q.targetJapanese}</p>
        </div>
      )}
      {q.skill === 'listening' && q.audioToken && (
        <MockAudio key={q.key} lang={lang} src={audioUrl(q.audioToken)} playLimit={2} />
      )}

      {q.targetJapanese && q.skill !== 'reading' && q.skill !== 'listening' && q.targetJapanese !== q.questionJa && (
        <p className="mb-1 rounded-lg bg-gray-50 px-3 py-2 text-base font-semibold leading-relaxed text-gray-900">{q.targetJapanese}</p>
      )}
      {q.questionJa && <p className="mb-1 text-base font-semibold text-gray-900">{q.questionJa}</p>}
      {lang === 'zh' && <p className="mb-3 text-sm text-gray-600">{q.questionZh}</p>}

      <div className="space-y-2">
        {q.choices.map((c) => (
          <button key={c.key} type="button"
            aria-pressed={picked === c.key}
            className={`w-full min-h-[44px] rounded-xl border px-4 py-3 text-left text-sm ${
              picked === c.key ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-400'}`}
            onClick={() => answer(q.key, c.key)}>
            {c.textJa}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" className="min-h-[44px] flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm disabled:opacity-40"
          disabled={qIdx === 0} onClick={() => setQIdx(qIdx - 1)}>
          {tx(lang, '前へ', '上一题')}
        </button>
        {qIdx + 1 < section.questions.length ? (
          <button type="button" className="min-h-[44px] flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
            onClick={() => setQIdx(qIdx + 1)}>
            {tx(lang, '次へ', '下一题')}
          </button>
        ) : (
          <button type="button" className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
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
            <button type="button" className="min-h-[44px] flex-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm"
              onClick={() => { setQIdx(warnUnanswered[0] - 1); setWarnUnanswered(null); }}>
              {tx(lang, '戻って回答する', '返回作答')}
            </button>
            <button type="button" className="min-h-[44px] flex-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white"
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
        className={`w-full min-h-[44px] rounded-xl px-4 py-2 font-bold text-white ${canPlay ? 'bg-blue-600' : 'bg-gray-300'}`}
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
