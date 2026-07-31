// 問題バトル実行UI（§14・§15）。敵編成はadvBattle、攻略判定はadvMastery（純関数）に委譲。
// 解説は回答後にのみ表示（事前表示はleakage）。制限時間切れは残問を未回答=誤答として採点。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdvEnemyTier, AdvMasteryAttempt } from '../../../lib/aiLesson/course/adventure/advTypes';
import type { AdvBattleQuestion } from '../../../lib/aiLesson/course/adventure/advVariants';
import { buildEncounter, gradeEncounter, type EncounterAnswer } from '../../../lib/aiLesson/course/adventure/advBattle';
import { computeMastery, type MasteryStatus } from '../../../lib/aiLesson/course/adventure/advMastery';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

const TIER_LABEL: Record<AdvEnemyTier, { ja: string; zh: string }> = {
  normal: { ja: '通常敵', zh: '普通敌人' },
  strong: { ja: '強敵', zh: '强敌' },
  midboss: { ja: '中ボス', zh: '中Boss' },
  rankboss: { ja: 'ランクボス（模擬）', zh: '等级Boss（模拟）' },
};

export interface BattleProps {
  lang: L;
  tier: AdvEnemyTier;
  /** バトルの攻略対象（mastery台帳のtargetId） */
  targetId: string;
  targetLabel: string;
  targetIds: string[];
  pool: Map<string, AdvBattleQuestion[]>;
  seenKeys: Set<string>;
  recentWrongKeys: Set<string>;
  priorAttempts: AdvMasteryAttempt[];
  dateKey: string;
  nowISO: string;
  onFinish: (attempt: AdvMasteryAttempt, mastery: MasteryStatus) => void;
  onClose: () => void;
}

export function AdvBattleRunner(props: BattleProps) {
  const { lang } = props;
  // 編成はmount時に1回だけ確定して凍結する。
  // onFinish→profile保存→親再レンダーで seenKeys が新objectになっても、
  // 進行中/結果表示中の編成・採点が再構築されない（staging実測で0%表示になった不具合の恒久対策）。
  const [enc] = useState(() => buildEncounter({
    tier: props.tier, targetIds: props.targetIds, pool: props.pool,
    seenKeys: props.seenKeys, recentWrongKeys: props.recentWrongKeys,
    seed: [...props.dateKey].reduce((h, c) => h * 31 + c.charCodeAt(0), props.tier.length),
  }));
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<EncounterAnswer[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  // finished時に経過秒を確定して保存（render中にDate.now()を呼ばない・react-hooks/purity）
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

  // 制限時間（中ボス以上）。切れたら残りを未回答で確定
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
        <button type="button" className="min-h-[44px] rounded-xl border border-gray-300 px-6 py-2" onClick={props.onClose}>
          {tx(lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <BattleResult {...props} enc={enc} answers={answers} elapsedSec={elapsedSec ?? 0} />
    );
  }

  const q = enc.questions[idx];
  const answered = picked !== null;
  const submit = (choiceIndex: number | null) => {
    if (answered && choiceIndex !== null) return;
    setPicked(choiceIndex);
    if (choiceIndex === null) advance(null);
  };
  const advance = (choiceIndex: number | null) => {
    const nextAnswers = [...answers, { key: q.key, choiceIndex }];
    setAnswers(nextAnswers);
    setPicked(null);
    if (idx + 1 < enc.questions.length) setIdx(idx + 1);
    else finishNow();
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={tx(lang, '問題バトル', '问题战斗')}>
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>{tx(lang, TIER_LABEL[props.tier].ja, TIER_LABEL[props.tier].zh)}・{props.targetLabel}</span>
        <span>
          {idx + 1}/{enc.questions.length}
          {remainingSec !== null && (
            <span className={`ml-2 font-bold ${remainingSec <= 30 ? 'text-red-600' : 'text-gray-700'}`} aria-live="polite">
              ⏱ {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
            </span>
          )}
        </span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded bg-gray-200">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((idx / enc.questions.length) * 100)}%` }} />
      </div>
      {q.promptJa && <p className="mb-1 text-base font-semibold leading-relaxed text-gray-900">{q.promptJa}</p>}
      <p className="mb-4 text-sm text-gray-700">{q.promptZh}</p>
      <div className="space-y-2">
        {q.choices.map((c, i) => {
          const isCorrect = answered && i === q.answerIndex;
          const isWrongPick = answered && picked === i && i !== q.answerIndex;
          return (
            <button key={c} type="button" disabled={answered}
              className={`w-full min-h-[44px] rounded-xl border px-4 py-3 text-left transition-colors ${
                isCorrect ? 'border-emerald-600 bg-emerald-50'
                : isWrongPick ? 'border-red-500 bg-red-50'
                : 'border-gray-200 bg-white hover:border-blue-400 disabled:hover:border-gray-200'}`}
              onClick={() => submit(i)}>
              {c}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-900">
            {picked === q.answerIndex ? tx(lang, '正解！', '答对了！') : tx(lang, 'ざんねん…', '差一点…')}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">{q.explanationZh}</p>
          <button type="button" className="mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 font-bold text-white"
            onClick={() => advance(picked)}>
            {idx + 1 < enc.questions.length ? tx(lang, 'つぎの問題', '下一题') : tx(lang, '結果を見る', '看结果')}
          </button>
        </div>
      )}
      {!answered && (
        <button type="button" className="mt-4 w-full min-h-[44px] text-sm text-gray-500 underline" onClick={() => submit(null)}>
          {tx(lang, 'わからない（スキップ＝誤答扱い）', '不知道（跳过＝按答错计）')}
        </button>
      )}
    </div>
  );
}

function BattleResult(props: BattleProps & { enc: ReturnType<typeof buildEncounter>; answers: EncounterAnswer[]; elapsedSec: number }) {
  const { lang } = props;
  const result = useMemo(
    () => gradeEncounter(props.enc, props.answers, props.dateKey, props.nowISO, props.elapsedSec),
    [props.enc, props.answers, props.dateKey, props.nowISO, props.elapsedSec],
  );
  const mastery = useMemo(
    () => {
      // プールに複数問題タイプがあるときだけタイプ多様性条件を課す（§15⑥）
      const types = new Set(props.targetIds.flatMap((t) => (props.pool.get(t) ?? []).map((x) => x.type)));
      return computeMastery([...props.priorAttempts, result.attempt], props.nowISO, types.size >= 2);
    },
    [props.priorAttempts, result.attempt, props.nowISO, props.targetIds, props.pool],
  );
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
      <p className="text-4xl">{win ? '🎉' : '⚔️'}</p>
      <h2 className="mt-2 text-xl font-bold text-gray-900">
        {win ? tx(lang, '勝利！', '胜利！') : tx(lang, 'あと少し！', '还差一点！')}
      </h2>
      <p className="mt-1 text-3xl font-bold text-blue-700">{result.scorePct}%</p>
      <p className="mt-1 text-xs text-gray-500">
        {tx(lang, `未出問題 ${Math.round(result.unseenRatio * 100)}%を含む`, `含 ${Math.round(result.unseenRatio * 100)}% 未见过的题`)}
        {props.enc.timed && result.withinTime === false && tx(lang, '・時間切れ', '・超时')}
      </p>
      <div className="mx-auto mt-4 max-w-sm rounded-xl border border-gray-200 bg-white p-4 text-left">
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
