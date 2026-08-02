// 問題バトル実行UI（§14・§15 ＋ ASSESSMENT INTEGRITY §4・§10〜§12）。
//
// P0以降の形:
// - 問題は**サーバーが編成して**返す（clientに教材bankは無い）
// - 問題payloadに正解・解説は入っていない。**採点はサーバー**が行い、
//   回答後にだけ正解・解説・他の選択肢が違う理由が返る
// - 提示順はサーバーが attempt ごとに確定（clientでは並べ替えない）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdvEnemyTier, AdvMasteryAttempt } from '../../../lib/aiLesson/course/adventure/advTypes';
import {
  startBattle, gradeAttempt, isRetryable,
  type ServerBattle, type ServerQuestion, type GradeResult, type ActivityDenial,
} from '../../../lib/aiLesson/course/adventure/activityClient';
import { useAdvRuntime } from './AdvRuntimeContext';
import { computeMastery, type MasteryStatus } from '../../../lib/aiLesson/course/adventure/advMastery';
import { nowTrainingLabel, EXAM_SKILL_LABELS, battleScopeName, type ExamSkill } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { denialText } from './advDenialText';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

const TIER_LABEL: Record<AdvEnemyTier, { ja: string; zh: string }> = {
  normal: { ja: '通常', zh: '普通' },
  strong: { ja: '強敵', zh: '强敌' },
  midboss: { ja: '中ボス', zh: '中Boss' },
  rankboss: { ja: 'ランクボス', zh: '等级Boss' },
};

export interface BattleProps {
  lang: L;
  tier: AdvEnemyTier;
  targetId: string;
  targetLabel: string;
  targetIds: string[];
  /** 既出の問題キー（偽名）。サーバーが未出優先の編成に使う */
  seenKeys: Set<string>;
  recentWrongKeys: Set<string>;
  priorAttempts: AdvMasteryAttempt[];
  dateKey: string;
  nowISO: string;
  level: 'N2' | 'N3';
  onFinish: (attempt: AdvMasteryAttempt, mastery: MasteryStatus) => void;
  onClose: () => void;
}

interface Verdict { key: string; skill: string; correct: boolean; answered: boolean }

export function AdvBattleRunner(props: BattleProps) {
  const { lang } = props;
  const runtime = useAdvRuntime();
  const [enc, setEnc] = useState<ServerBattle | null>(null);
  const [denied, setDenied] = useState<ActivityDenial | null>(null);
  const [idx, setIdx] = useState(0);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [reveal, setReveal] = useState<GradeResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const finished = elapsedSec !== null;

  // 編成はサーバーに1回だけ頼む
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await startBattle(runtime.auth, {
        tier: props.tier, targetIds: props.targetIds,
        seenKeys: [...props.seenKeys].slice(0, 800),
        recentWrongKeys: [...props.recentWrongKeys].slice(0, 300),
      });
      if (!alive) return;
      if (!r.ok) { setDenied(r.denial); return; }
      setEnc(r.data);
      setRemainingSec(r.data.timeLimitSec);
      startedAt.current = Date.now();
      trackAdv('battle_started', { locale: lang });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishNow = useCallback(() => {
    setElapsedSec((prev) => prev ?? Math.round((Date.now() - (startedAt.current ?? Date.now())) / 1000));
  }, []);

  useEffect(() => {
    if (!enc?.timed || finished) return;
    const t = setInterval(() => {
      setRemainingSec((s) => {
        if (s === null) return s;
        if (s <= 1) { clearInterval(t); finishNow(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [enc?.timed, finished, finishNow]);

  if (denied) {
    return (
      <DeniedView lang={lang} denial={denied} onClose={props.onClose}
        onRetry={isRetryable(denied) ? () => window.location.reload() : undefined} />
    );
  }
  if (!enc) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <p className="text-sm text-gray-500">{tx(lang, '問題を用意しています…', '正在准备题目…')}</p>
      </div>
    );
  }

  if (enc.questions.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
        <p className="mb-4 text-sm text-gray-700">
          {tx(lang, 'この対象にはまだ出題できる問題がありません。', '这个对象暂时没有可出的题。')}
        </p>
        <button type="button" className="min-h-[44px] rounded-xl border border-gray-300 px-6 py-2" onClick={props.onClose}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  if (finished) {
    return <BattleResult {...props} enc={enc} verdicts={verdicts} elapsedSec={elapsedSec ?? 0} />;
  }

  const q: ServerQuestion = enc.questions[idx];
  const answered = reveal !== null;

  /** 回答（またはスキップ=null）をサーバーへ送り、正解・解説を受け取る */
  const submit = async (choiceKey: string | null) => {
    if (grading || answered) return;
    setGrading(true);
    setPicked(choiceKey);
    const r = await gradeAttempt(runtime.auth, { attemptToken: q.attemptToken, choiceKey });
    setGrading(false);
    if (!r.ok) {
      // 採点が通らないときは誤答扱いにせず、そのまま案内へ（学習者の不利にしない）
      setDenied(r.denial);
      return;
    }
    setReveal(r.data);
    setVerdicts([...verdicts, { key: q.key, skill: q.skill, correct: r.data.correct, answered: choiceKey !== null }]);
  };

  const advance = () => {
    setPicked(null);
    setReveal(null);
    if (idx + 1 < enc.questions.length) setIdx(idx + 1);
    else finishNow();
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={tx(lang, '問題バトル', '问题战斗')}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          {tx(lang, TIER_LABEL[props.tier].ja, TIER_LABEL[props.tier].zh)}・{battleScopeName(enc.skills, props.level, lang)}
        </span>
        <span>
          {idx + 1}/{enc.questions.length}
          {remainingSec !== null && (
            <span className={`ml-2 font-bold ${remainingSec <= 30 ? 'text-red-600' : 'text-gray-700'}`} aria-live="polite">
              ⏱ {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
            </span>
          )}
        </span>
      </div>
      {/* §10: いま鍛えている試験科目を常に表示 */}
      <p className="mb-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {tx(lang, '今鍛えている試験力', '正在锻炼的考试能力')}：{nowTrainingLabel(q.skill as ExamSkill, lang)}
      </p>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded bg-gray-200">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((idx / enc.questions.length) * 100)}%` }} />
      </div>

      {q.targetJapanese && q.targetJapanese !== q.questionJa && (
        <p className="mb-1 rounded-lg bg-gray-50 px-3 py-2 text-base font-semibold leading-relaxed text-gray-900">{q.targetJapanese}</p>
      )}
      {q.questionJa && <p className="mb-1 text-base font-semibold leading-relaxed text-gray-900">{q.questionJa}</p>}
      <p className="mb-4 text-sm text-gray-700">{q.questionZh}</p>

      <div className="space-y-2" role="group" aria-label={tx(lang, '選択肢', '选项')}>
        {q.choices.map((c) => {
          const isCorrect = answered && c.key === reveal?.correctKey;
          const isWrongPick = answered && picked === c.key && !isCorrect;
          return (
            <button key={c.key} type="button" disabled={answered || grading}
              aria-pressed={picked === c.key}
              className={`w-full min-h-[44px] rounded-xl border px-4 py-3 text-left transition-colors ${
                isCorrect ? 'border-emerald-600 bg-emerald-50'
                : isWrongPick ? 'border-red-500 bg-red-50'
                : 'border-gray-200 bg-white hover:border-blue-400 disabled:hover:border-gray-200'}`}
              onClick={() => void submit(c.key)}>
              <span className="block">{c.textJa}</span>
              {c.textZh && <span className="mt-0.5 block text-xs text-gray-500">{c.textZh}</span>}
            </button>
          );
        })}
      </div>

      {grading && (
        <p className="mt-3 text-center text-xs text-gray-400" role="status">{tx(lang, '採点中…', '判分中…')}</p>
      )}

      {answered && reveal && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-bold text-gray-900">
            {reveal.correct ? tx(lang, '正解！', '答对了！') : tx(lang, 'ざんねん…', '差一点…')}
          </p>
          {/* §4: 正解・意味・正しい理由・中国語補助・他が違う理由・出典・例文 */}
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {tx(lang, '正解', '正确答案')}：{q.choices.find((c) => c.key === reveal.correctKey)?.textJa}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">
            {tx(lang, reveal.explanationJa ?? '', reveal.explanationZh ?? reveal.explanationJa ?? '')}
          </p>
          {reveal.meaningZh && (
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{reveal.meaningZh}</p>
          )}
          {reveal.exampleJa && (
            <p className="mt-2 rounded bg-white px-2 py-1 text-sm text-gray-900">
              {tx(lang, '例文', '例句')}：{reveal.exampleJa}
              {lang === 'zh' && reveal.exampleZh && <span className="block text-xs text-gray-500">{reveal.exampleZh}</span>}
            </p>
          )}
          {(reveal.whyWrong ?? []).length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-gray-600">{tx(lang, 'ほかの選択肢が違う理由', '其他选项为什么不对')}</p>
              <ul className="mt-1 space-y-0.5">
                {(reveal.whyWrong ?? []).map((w) => (
                  <li key={w.key} className="text-xs leading-relaxed text-gray-600">
                    ✕ {w.textJa} — {tx(lang, w.whyWrongJa, w.whyWrongZh || w.whyWrongJa)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reveal.sourceLabel && (
            <p className="mt-2 text-xs text-gray-400">
              {tx(lang, '出典', '出处')}：{reveal.sourceLabel}・
              {tx(lang, EXAM_SKILL_LABELS[q.skill as ExamSkill]?.ja ?? q.skill, EXAM_SKILL_LABELS[q.skill as ExamSkill]?.zh ?? q.skill)}
            </p>
          )}
          <button type="button" className="mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 font-bold text-white"
            onClick={advance}>
            {idx + 1 < enc.questions.length ? tx(lang, 'つぎの問題', '下一题') : tx(lang, '結果を見る', '看结果')}
          </button>
        </div>
      )}
      {!answered && !grading && (
        <button type="button" className="mt-4 w-full min-h-[44px] text-sm text-gray-500 underline" onClick={() => void submit(null)}>
          {tx(lang, 'わからない（スキップ＝誤答扱い）', '不知道（跳过＝按答错计）')}
        </button>
      )}
    </div>
  );
}

/** 利用権・通信の拒否を学習者向けの文言で表示する共通ビュー */
export function DeniedView({ lang, denial, onClose, onRetry }: {
  lang: L; denial: ActivityDenial; onClose: () => void; onRetry?: () => void;
}) {
  const t = denialText(denial, lang);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
      <p className="mb-2 text-sm font-semibold text-gray-900">{t.title}</p>
      <p className="mb-4 text-sm text-gray-600">{t.body}</p>
      {onRetry && (
        <button type="button" className="mb-2 w-full min-h-[48px] rounded-xl bg-blue-600 px-6 py-2 font-bold text-white" onClick={onRetry}>
          {tx(lang, 'もう一度試す', '重试')}
        </button>
      )}
      <button type="button" className="min-h-[44px] w-full rounded-xl border border-gray-300 px-6 py-2" onClick={onClose}>
        {tx(lang, 'もどる', '返回')}
      </button>
    </div>
  );
}

function BattleResult(props: BattleProps & {
  enc: ServerBattle; verdicts: Verdict[]; elapsedSec: number;
}) {
  const { lang, enc, verdicts } = props;
  // 集計はサーバー採点の結果（verdict）だけから行う。client は正解を知らない
  const result = useMemo(() => {
    const correctKeys = verdicts.filter((v) => v.correct).map((v) => v.key);
    const wrongKeys = verdicts.filter((v) => !v.correct).map((v) => v.key);
    const bySkill: Record<string, { correct: number; total: number; unseen: number }> = {};
    for (const q of enc.questions) {
      const v = verdicts.find((x) => x.key === q.key);
      const row = bySkill[q.skill] ?? { correct: 0, total: 0, unseen: 0 };
      row.total += 1;
      if (v?.correct) row.correct += 1;
      if (!props.seenKeys.has(q.key)) row.unseen += 1;
      bySkill[q.skill] = row;
    }
    const total = enc.questions.length;
    const scorePct = total === 0 ? 0 : Math.round((correctKeys.length / total) * 100);
    const withinTime = enc.timed && enc.timeLimitSec !== null ? props.elapsedSec <= enc.timeLimitSec : null;
    const attempt: AdvMasteryAttempt = {
      dateKey: props.dateKey, scorePct, unseenRatio: enc.unseenRatio,
      questionKeys: enc.questions.map((q) => q.key),
      tier: enc.tier, timed: enc.timed, completedAt: props.nowISO,
      skills: enc.skills, bySkill,
    };
    return { scorePct, wrongKeys, withinTime, attempt, bySkill };
  }, [enc, verdicts, props.dateKey, props.nowISO, props.elapsedSec, props.seenKeys]);

  const mastery = useMemo(() => {
    const types = new Set(enc.questions.map((x) => x.type));
    return computeMastery([...props.priorAttempts, result.attempt], props.nowISO, types.size >= 2);
  }, [props.priorAttempts, result.attempt, props.nowISO, enc.questions]);

  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    trackAdv('battle_completed', { locale: lang });
    props.onFinish(result.attempt, mastery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const win = result.scorePct >= 80;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 text-center" aria-label={tx(lang, 'バトル結果', '战斗结果')}>
      <p className="text-4xl" aria-hidden>{win ? '🎉' : '⚔️'}</p>
      <h2 className="mt-2 text-xl font-bold text-gray-900">
        {win ? tx(lang, '勝利！', '胜利！') : tx(lang, 'あと少し！', '还差一点！')}
      </h2>
      <p className="mt-1 text-3xl font-bold text-blue-700">{result.scorePct}%</p>
      <p className="mt-1 text-xs text-gray-500">
        {battleScopeName(enc.skills, props.level, lang)}・
        {tx(lang, `未出問題 ${Math.round(enc.unseenRatio * 100)}%を含む`, `含 ${Math.round(enc.unseenRatio * 100)}% 未见过的题`)}
        {enc.timed && result.withinTime === false && tx(lang, '・時間切れ', '・超时')}
      </p>

      <div className="mx-auto mt-4 max-w-sm rounded-xl border border-gray-200 bg-white p-4 text-left">
        <p className="text-sm font-semibold text-gray-900">{tx(lang, '鍛えた試験科目', '锻炼的考试科目')}</p>
        <ul className="mt-1 space-y-0.5">
          {Object.entries(result.bySkill).map(([skill, row]) => (
            <li key={skill} className="text-sm text-gray-700">
              {tx(lang, EXAM_SKILL_LABELS[skill as ExamSkill]?.ja ?? skill,
                EXAM_SKILL_LABELS[skill as ExamSkill]?.zh ?? skill)}
              ：{row.correct}/{row.total}
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-3 max-w-sm rounded-xl border border-gray-200 bg-white p-4 text-left">
        <p className="text-sm font-semibold text-gray-900">{tx(lang, '攻略状況', '攻略进度')}</p>
        <p className="mt-1 text-sm text-gray-700">
          {tx(lang, `80%達成日：${mastery.qualifyingDays.length}/3`, `达成80%的天数：${mastery.qualifyingDays.length}/3`)}
        </p>
        <p className="mt-1 text-sm text-gray-700">{tx(lang, mastery.nextJa, mastery.nextZh)}</p>
      </div>
      {result.wrongKeys.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {tx(lang, `まちがえた${result.wrongKeys.length}問は復習と明日の冒険に入ります`, `答错的${result.wrongKeys.length}题会进入复习和明天的冒险`)}
        </p>
      )}
      <button type="button" className="mt-6 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white" onClick={props.onClose}>
        {tx(lang, '冒険にもどる', '回到冒险')}
      </button>
    </div>
  );
}

export default AdvBattleRunner;
