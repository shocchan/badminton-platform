// 問題バトル実行UI（§14・§15 ＋ ASSESSMENT INTEGRITY §4・§10〜§12）。
// - 提示順は attempt開始時に確定（render中に乱数を使わない・reloadでも不変）
// - 採点は choiceId。表示位置では判定しない
// - 解説は「正解／文法の意味／正しい理由／中国語補助／他が違う理由／出典／例文」を必ず出す
import { pressFx, riseIn, popIn } from './advUi';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdvEnemyTier, AdvMasteryAttempt } from '../../../lib/aiLesson/course/adventure/advTypes';
import type { AdvBattleQuestion } from '../../../lib/aiLesson/course/adventure/advVariants';
import { buildEncounter, gradeEncounter, encounterName, type EncounterAnswer } from '../../../lib/aiLesson/course/adventure/advBattle';
import { computeMastery, type MasteryStatus } from '../../../lib/aiLesson/course/adventure/advMastery';
import { nowTrainingLabel, EXAM_SKILL_LABELS } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';

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
  pool: Map<string, AdvBattleQuestion[]>;
  seenKeys: Set<string>;
  recentWrongKeys: Set<string>;
  priorAttempts: AdvMasteryAttempt[];
  dateKey: string;
  nowISO: string;
  level: 'N2' | 'N3';
  onFinish: (attempt: AdvMasteryAttempt, mastery: MasteryStatus) => void;
  onClose: () => void;
}

export function AdvBattleRunner(props: BattleProps) {
  const { lang } = props;
  // 編成と提示順は mount時に1回だけ確定して凍結する（rerender・保存後の再描画でも不変）。
  // attemptSeed に現在時刻を混ぜることで「新しい挑戦では並びが変わる」を満たす。
  const [enc] = useState(() => buildEncounter({
    tier: props.tier, targetIds: props.targetIds, pool: props.pool,
    seenKeys: props.seenKeys, recentWrongKeys: props.recentWrongKeys,
    seed: [...props.dateKey].reduce((h, c) => h * 31 + c.charCodeAt(0), props.tier.length),
    attemptSeed: Date.now(),
  }));
  const [seenAtStart] = useState(() => new Set(props.seenKeys));
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<EncounterAnswer[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(enc.timeLimitSec);
  const startedAt = useRef<number | null>(null);
  const finished = elapsedSec !== null;

  useEffect(() => {
    startedAt.current = Date.now();
    trackAdv('battle_started', { locale: lang });
  }, [lang]);

  const finishNow = useCallback(() => {
    setElapsedSec((prev) => prev ?? Math.round((Date.now() - (startedAt.current ?? Date.now())) / 1000));
  }, []);

  useEffect(() => {
    if (!enc.timed || finished) return;
    const t = setInterval(() => {
      setRemainingSec((s) => {
        if (s === null) return s;
        if (s <= 1) { clearInterval(t); finishNow(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [enc.timed, finished, finishNow]);

  if (enc.questions.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
        <p className="mb-4 text-sm text-gray-700">
          {tx(lang, 'この対象にはまだ出題できる問題がありません。', '这个对象暂时没有可出的题。')}
        </p>
        <button type="button" className={`${pressFx} action-secondary min-h-[44px] rounded-xl border border-gray-300 bg-white px-6 py-2`} onClick={props.onClose}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  if (finished) {
    return <BattleResult {...props} enc={enc} answers={answers} elapsedSec={elapsedSec ?? 0} seenAtStart={seenAtStart} />;
  }

  const q = enc.questions[idx];
  const presented = enc.presented[idx];
  const answered = picked !== null;
  const correctId = presented.correctChoiceId;

  const advance = (choiceId: string | null) => {
    setAnswers([...answers, { key: q.key, choiceId }]);
    setPicked(null);
    if (idx + 1 < enc.questions.length) setIdx(idx + 1);
    else finishNow();
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={tx(lang, '問題バトル', '问题战斗')}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          {tx(lang, TIER_LABEL[props.tier].ja, TIER_LABEL[props.tier].zh)}・{encounterName(enc, props.level, lang)}
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
        {tx(lang, '今鍛えている試験力', '正在锻炼的考试能力')}：{nowTrainingLabel(q.skill, lang)}
      </p>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded bg-gray-200">
        <div className="h-full bg-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.round(((idx + (answered ? 1 : 0)) / enc.questions.length) * 100)}%` }} />
      </div>

      {q.targetJapanese && q.targetJapanese !== q.questionJa && (
        <p className="mb-1 rounded-lg bg-gray-50 px-3 py-2 text-base font-semibold leading-relaxed text-gray-900">{q.targetJapanese}</p>
      )}
      {q.questionJa && <p className="mb-1 text-base font-semibold leading-relaxed text-gray-900">{q.questionJa}</p>}
      <p className="mb-4 text-sm text-gray-700">{q.questionZh}</p>

      <div className="space-y-2" role="group" aria-label={tx(lang, '選択肢', '选项')}>
        {presented.choices.map((c) => {
          const isCorrect = answered && c.choiceId === correctId;
          const isWrongPick = answered && picked === c.choiceId && c.choiceId !== correctId;
          return (
            <button key={c.choiceId} type="button" disabled={answered}
              aria-pressed={picked === c.choiceId}
              className={`${pressFx} action-choice w-full min-h-[44px] rounded-xl border px-4 py-3 text-left transition-colors ${
                isCorrect ? `border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500 ${popIn}`
                : isWrongPick ? 'border-red-500 bg-red-50'
                : answered ? 'border-gray-200 bg-white opacity-60'
                : 'border-gray-200 bg-white hover:border-blue-400'}`}
              onClick={() => { if (!answered) setPicked(c.choiceId); }}>
              <span className="block">{c.textJa}</span>
              {c.textZh && <span className="mt-0.5 block text-xs text-gray-500">{c.textZh}</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={`mt-4 rounded-xl border p-3 ${riseIn} ${
          picked === correctId ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <span aria-hidden className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${
              picked === correctId ? 'bg-emerald-600' : 'bg-amber-500'}`}>
              {picked === correctId ? '✓' : '!'}
            </span>
            {picked === correctId ? tx(lang, '正解！', '答对了！') : tx(lang, 'ざんねん…', '差一点…')}
          </p>
          {/* §4: 正解・意味・正しい理由・中国語補助・他が違う理由・出典・例文 */}
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {tx(lang, '正解', '正确答案')}：{presented.choices.find((c) => c.choiceId === correctId)?.textJa}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">
            {tx(lang, q.explanation.whyCorrectJa, q.explanation.whyCorrectZh)}
          </p>
          {lang === 'zh' && (
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{q.explanation.meaningZh}</p>
          )}
          {lang === 'ja' && q.explanation.meaningZh && (
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{q.explanation.meaningZh}</p>
          )}
          {q.explanation.exampleJa && (
            <p className="mt-2 rounded bg-white px-2 py-1 text-sm text-gray-900">
              {tx(lang, '例文', '例句')}：{q.explanation.exampleJa}
              {lang === 'zh' && q.explanation.exampleZh && <span className="block text-xs text-gray-500">{q.explanation.exampleZh}</span>}
            </p>
          )}
          {presented.choices.some((c) => c.choiceId !== correctId && (c.whyWrongJa || c.whyWrongZh)) && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-gray-600">{tx(lang, 'ほかの選択肢が違う理由', '其他选项为什么不对')}</p>
              <ul className="mt-1 space-y-0.5">
                {presented.choices.filter((c) => c.choiceId !== correctId).map((c) => (
                  <li key={c.choiceId} className="text-xs leading-relaxed text-gray-600">
                    ✕ {c.textJa} — {tx(lang, c.whyWrongJa ?? '', c.whyWrongZh ?? c.whyWrongJa ?? '')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-400">
            {tx(lang, '出典', '出处')}：{q.explanation.sourceLabel}（{q.explanation.sourceItemId}）・
            {tx(lang, EXAM_SKILL_LABELS[q.skill].ja, EXAM_SKILL_LABELS[q.skill].zh)}
          </p>
          <button type="button" className={`${pressFx} action-primary-blue mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 font-bold text-white`}
            onClick={() => advance(picked)}>
            {idx + 1 < enc.questions.length ? tx(lang, 'つぎの問題', '下一题') : tx(lang, '結果を見る', '看结果')}
          </button>
        </div>
      )}
      {!answered && (
        <button type="button" className={`${pressFx} mt-4 w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline active:bg-gray-100`} onClick={() => advance(null)}>
          {tx(lang, 'わからない（スキップ＝誤答扱い）', '不知道（跳过＝按答错计）')}
        </button>
      )}
    </div>
  );
}

function BattleResult(props: BattleProps & {
  enc: ReturnType<typeof buildEncounter>; answers: EncounterAnswer[]; elapsedSec: number; seenAtStart: Set<string>;
}) {
  const { lang } = props;
  const result = useMemo(
    () => gradeEncounter(props.enc, props.answers, props.dateKey, props.nowISO, props.elapsedSec, props.seenAtStart),
    [props.enc, props.answers, props.dateKey, props.nowISO, props.elapsedSec, props.seenAtStart],
  );
  const mastery = useMemo(() => {
    const types = new Set(props.targetIds.flatMap((t) => (props.pool.get(t) ?? []).map((x) => x.type)));
    return computeMastery([...props.priorAttempts, result.attempt], props.nowISO, types.size >= 2);
  }, [props.priorAttempts, result.attempt, props.nowISO, props.targetIds, props.pool]);

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
    <div className={`mx-auto w-full max-w-xl px-4 py-6 text-center ${riseIn}`} aria-label={tx(lang, 'バトル結果', '战斗结果')}>
      <p className={`text-4xl ${win ? 'motion-safe:animate-bounce' : ''}`} aria-hidden>{win ? '🎉' : '⚔️'}</p>
      <h2 className="mt-2 text-xl font-bold text-gray-900">
        {win ? tx(lang, '勝利！', '胜利！') : tx(lang, 'あと少し！', '还差一点！')}
      </h2>
      <p className={`mt-1 text-3xl font-bold ${win ? 'text-emerald-600' : 'text-blue-700'}`}>{result.scorePct}%</p>
      <p className="mt-1 text-xs text-gray-500">
        {encounterName(props.enc, props.level, lang)}・
        {tx(lang, `未出問題 ${Math.round(result.unseenRatio * 100)}%を含む`, `含 ${Math.round(result.unseenRatio * 100)}% 未见过的题`)}
        {props.enc.timed && result.withinTime === false && tx(lang, '・時間切れ', '・超时')}
      </p>

      <div className="mx-auto mt-4 max-w-sm rounded-xl border border-gray-200 bg-white p-4 text-left">
        <p className="text-sm font-semibold text-gray-900">{tx(lang, '鍛えた試験科目', '锻炼的考试科目')}</p>
        <ul className="mt-1 space-y-0.5">
          {Object.entries(result.bySkill).map(([skill, row]) => (
            <li key={skill} className="text-sm text-gray-700">
              {tx(lang, EXAM_SKILL_LABELS[skill as keyof typeof EXAM_SKILL_LABELS]?.ja ?? skill,
                EXAM_SKILL_LABELS[skill as keyof typeof EXAM_SKILL_LABELS]?.zh ?? skill)}
              ：{row.correct}/{row.total}
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-3 max-w-sm rounded-xl border border-gray-200 bg-white p-4 text-left">
        <p className="text-sm font-semibold text-gray-900">{tx(lang, '攻略状況', '攻略进度')}</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-gray-700">
          <span>{tx(lang, `80%達成日：${mastery.qualifyingDays.length}/3`, `达成80%的天数：${mastery.qualifyingDays.length}/3`)}</span>
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-3 w-3 rounded-full ${i < mastery.qualifyingDays.length ? 'bg-emerald-500' : 'bg-gray-200'}`} />
            ))}
          </span>
        </p>
        <p className="mt-1 text-sm text-gray-700">{tx(lang, mastery.nextJa, mastery.nextZh)}</p>
      </div>
      {result.wrongKeys.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {tx(lang, `まちがえた${result.wrongKeys.length}問は復習と明日の冒険に入ります`, `答错的${result.wrongKeys.length}题会进入复习和明天的冒险`)}
        </p>
      )}
      <button type="button" className={`${pressFx} action-primary-blue mt-6 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white`} onClick={props.onClose}>
        {tx(lang, '冒険にもどる', '回到冒险')}
      </button>
    </div>
  );
}

export default AdvBattleRunner;
