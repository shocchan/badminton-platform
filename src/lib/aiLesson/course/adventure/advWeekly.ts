// 週のまとめ（PRODUCT_CANON §6「成長実感」）。
//
// 原則:
// - **数値を並べない。**「先週より何ができるようになったか」を1文で言えることを最優先にする
// - **未計測の能力を成長したように表示しない**（canon 原則13）。測っていない技能は出さない
// - 「今週やった量」ではなく「今週できるようになったこと」を主役にする（canon 原則8）
// - 出典はすべて mastery台帳・questLog・mockLog の実測。推定値を混ぜない
import type {
  AdventureV2Profile, AdvMasteryLedger, AdvMasteryAttempt, JlptLevel,
} from './advTypes';
import type { CourseSessionRecord } from '../types';
import { masteredTargetIds, masteredTargetIdsAsOf } from './advMastery';
import { EXAM_SKILL_LABELS, type ExamSkill } from './advExamSkills';

export interface WeeklySkillChange {
  skill: ExamSkill;
  labelJa: string;
  labelZh: string;
  /** 今週の正答率（%）。今週の記録が無ければ null */
  thisWeekPct: number | null;
  /** 先週の正答率（%）。先週の記録が無ければ null */
  lastWeekPct: number | null;
  /** 差分。どちらかが null なら null＝「変化は測れていない」 */
  deltaPct: number | null;
  /** 今週その技能で解いた問題数（母数が小さい変化を信用しないため） */
  thisWeekQuestions: number;
}

export interface WeeklySummary {
  /** 週の開始日（月曜） */
  weekStartKey: string;
  studyDays: number;
  /** 完了した冒険（全step完了の日数） */
  completedQuests: number;
  /**
   * 今週解いた問題数（実測）。mastery台帳の bySkill の合計。
   * 以前ここには「学習時間（分）」があったが、中身は `設定した1日の分数 × 学習日数` で
   * 行動と無関係な数字だった（1step押しただけの日も満額）。時間は計測していないので出さない
   * （2026-08-18 監査P2）。代わりに実際に測っている「解いた問題数」を出す
   */
  solvedQuestions: number;
  /** 今週あらたに「別日3回＋遅延確認」を満たした対象 */
  newlyMastered: string[];
  /** 技能別の変化。測れていないものは deltaPct=null で残す（隠さない・0にしない） */
  skillChanges: WeeklySkillChange[];
  /** 今週いちばん落ちている技能（来週の重点）。判定できなければ null */
  focusSkillNextWeek: ExamSkill | null;
  /** 今週完了したミニ模試の回数 */
  mockCount: number;
  /** 今週やり切ったAI会話の回数（別軸の実測。JLPT準備度には足さない） */
  conversationCount: number;
  /** 「先週より何ができるようになったか」の1文。measurable な変化が無ければ正直にそう書く */
  headlineJa: string;
  headlineZh: string;
  /** 数値ではなく行動で書いた来週の一歩 */
  nextWeekJa: string;
  nextWeekZh: string;
  /** 十分なデータが無く、変化を語れない状態か */
  insufficientData: boolean;
}

const dayKey = (d: Date) => d.toLocaleDateString('sv-SE');

/** その日を含む週の月曜 */
export const weekStartOf = (iso: string): string => {
  const d = new Date(iso);
  const dow = (d.getDay() + 6) % 7; // 月曜=0
  d.setDate(d.getDate() - dow);
  return dayKey(d);
};

const addDays = (key: string, n: number): string => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

const inRange = (key: string, from: string, toExclusive: string) => key >= from && key < toExclusive;

/** 期間内の attempt を技能別に集計する */
const skillStats = (ledger: AdvMasteryLedger, from: string, to: string) => {
  const acc: Partial<Record<ExamSkill, { correct: number; total: number }>> = {};
  for (const attempts of Object.values(ledger)) {
    for (const a of (attempts ?? []) as AdvMasteryAttempt[]) {
      if (!inRange(a.dateKey, from, to)) continue;
      for (const [skill, v] of Object.entries(a.bySkill ?? {})) {
        const k = skill as ExamSkill;
        const cur = acc[k] ?? { correct: 0, total: 0 };
        acc[k] = { correct: cur.correct + (v?.correct ?? 0), total: cur.total + (v?.total ?? 0) };
      }
    }
  }
  return acc;
};

/**
 * 変化を「言ってよい」最低母数。
 * 3問で50%→100%になっても実力が伸びたとは言えないので、母数が小さいうちは変化を出さない。
 */
const MIN_QUESTIONS_FOR_CHANGE = 10;

export const buildWeeklySummary = (
  prof: AdventureV2Profile,
  nowISO: string,
  sessions: CourseSessionRecord[] = [],
): WeeklySummary => {
  const thisWeekStart = weekStartOf(nowISO);
  const nextWeekStart = addDays(thisWeekStart, 7);
  const lastWeekStart = addDays(thisWeekStart, -7);

  const inThisWeek = (k: string) => inRange(k, thisWeekStart, nextWeekStart);
  const questThisWeek = prof.questLog.filter((q) => inThisWeek(q.dateKey));
  // 学習日は「締めくくりを押した日（questLog）」だけでなく、バトル等の実測attemptが
  // あった日も数える（2026-08-17 監査: 途中でやめた日が「学習0日」扱いになり、
  // 5step中2step進めた日の努力が週まとめから消えていた）
  const studyDayKeys = new Set(questThisWeek.map((q) => q.dateKey));
  for (const attempts of Object.values(prof.mastery)) {
    for (const a of attempts ?? []) {
      if (inThisWeek(a.dateKey)) studyDayKeys.add(a.dateKey);
    }
  }
  const studyDays = studyDayKeys.size;
  const completedQuests = questThisWeek.filter((q) => q.totalSteps > 0 && q.completedSteps >= q.totalSteps).length;

  const masteredNow = masteredTargetIds(prof.mastery, nowISO);
  // 週初め時点の集合は**時点評価**で出す。masteredTargetIds は全attemptを見るため、
  // 遅延確認が今週だった項目も「先週から定着済み」に見えてしまい、newlyMastered が常に空になる
  const beforeSet = masteredTargetIdsAsOf(prof.mastery, `${thisWeekStart}T00:00:00.000Z`);
  const newlyMastered = [...masteredNow].filter((t) => !beforeSet.has(t));

  const cur = skillStats(prof.mastery, thisWeekStart, nextWeekStart);
  const prev = skillStats(prof.mastery, lastWeekStart, thisWeekStart);

  const skills: ExamSkill[] = ['charactersVocabulary', 'grammar', 'reading', 'listening'];
  const skillChanges: WeeklySkillChange[] = skills.map((skill) => {
    const c = cur[skill];
    const p = prev[skill];
    const thisPct = c && c.total > 0 ? Math.round((c.correct / c.total) * 100) : null;
    const lastPct = p && p.total > 0 ? Math.round((p.correct / p.total) * 100) : null;
    // 母数が小さい週の変化は「測れていない」として null にする（誇張しない）
    const measurable = thisPct !== null && lastPct !== null
      && (c?.total ?? 0) >= MIN_QUESTIONS_FOR_CHANGE && (p?.total ?? 0) >= MIN_QUESTIONS_FOR_CHANGE;
    return {
      skill,
      labelJa: EXAM_SKILL_LABELS[skill].ja,
      labelZh: EXAM_SKILL_LABELS[skill].zh,
      thisWeekPct: thisPct,
      lastWeekPct: lastPct,
      deltaPct: measurable ? (thisPct as number) - (lastPct as number) : null,
      thisWeekQuestions: c?.total ?? 0,
    };
  });

  // 今週解いた問題数（実測）。skillChanges の母数の合計＝台帳の bySkill 実測値
  const solvedQuestions = skillChanges.reduce((n, s) => n + s.thisWeekQuestions, 0);

  // 来週の重点＝今週いちばん正答率が低い技能（十分に解いたものの中から）
  const candidates = skillChanges.filter((s) => s.thisWeekPct !== null && s.thisWeekQuestions >= MIN_QUESTIONS_FOR_CHANGE);
  const focus = candidates.length > 0
    ? candidates.reduce((a, b) => ((a.thisWeekPct as number) <= (b.thisWeekPct as number) ? a : b))
    : null;

  const mockCount = prof.mockLog.filter((m) => inThisWeek(m.dateKey)).length;
  const conversationCount = sessions.filter((s) =>
    s.completionStatus === 'completed' && inThisWeek(dayKey(new Date(s.startedAt)))).length;

  const improved = skillChanges.filter((s) => (s.deltaPct ?? 0) > 0);
  const insufficientData = studyDays === 0
    || (newlyMastered.length === 0 && improved.length === 0 && mockCount === 0 && conversationCount === 0);

  const headlineJa = (() => {
    if (studyDays === 0) return '今週はまだ学習の記録がありません。5分の冒険からで大丈夫です。';
    if (newlyMastered.length > 0) {
      return `今週は${newlyMastered.length}項目が「別の日に3回＋あとから確認」まで届きました。覚えただけでなく、時間をおいても使える状態です。`;
    }
    if (improved.length > 0) {
      const top = improved.reduce((a, b) => ((a.deltaPct as number) >= (b.deltaPct as number) ? a : b));
      return `今週は${top.labelJa}が先週より${top.deltaPct}ポイント上がりました。`;
    }
    if (mockCount > 0) return `今週はミニ模試を${mockCount}回やりました。時間配分の記録が増えています。`;
    if (conversationCount > 0) return `今週はAI会話を${conversationCount}回やり切りました。話した記録が積み上がっています。`;
    return `今週は${studyDays}日続きました。変化として言えるものが出るまで、もう少し記録を集めます。`;
  })();

  const headlineZh = (() => {
    if (studyDays === 0) return '本周还没有学习记录。从5分钟的冒险开始就可以。';
    if (newlyMastered.length > 0) {
      return `本周有${newlyMastered.length}个项目达到了「隔天做对3次＋之后再确认」。不只是记住，而是过一段时间还能用。`;
    }
    if (improved.length > 0) {
      const top = improved.reduce((a, b) => ((a.deltaPct as number) >= (b.deltaPct as number) ? a : b));
      return `本周「${top.labelZh}」比上周提高了${top.deltaPct}个百分点。`;
    }
    if (mockCount > 0) return `本周做了${mockCount}次迷你模拟考，时间分配的记录在增加。`;
    if (conversationCount > 0) return `本周完成了${conversationCount}次AI会话，开口说的记录在不断积累。`;
    return `本周坚持了${studyDays}天。在能说出变化之前，再积累一些记录。`;
  })();

  const nextWeekJa = focus
    ? `来週は${focus.labelJa}を多めに出します。今日の冒険をそのまま続けてください。`
    : '来週も今日の冒険を続けてください。記録がたまると、重点を自動で切り替えます。';
  const nextWeekZh = focus
    ? `下周会多出「${focus.labelZh}」的题。照常继续每天的冒险就好。`
    : '下周也请继续每天的冒险。记录积累后会自动调整重点。';

  return {
    weekStartKey: thisWeekStart,
    studyDays,
    completedQuests,
    solvedQuestions,
    newlyMastered,
    skillChanges,
    focusSkillNextWeek: focus?.skill ?? null,
    mockCount,
    conversationCount,
    headlineJa,
    headlineZh,
    nextWeekJa,
    nextWeekZh,
    insufficientData,
  };
};

/** 目標レベル表示（未設定を N2 と決めつけない） */
export const weeklyLevelLabel = (level: JlptLevel | null): string => level ?? '—';

// ── 1日ぶんのまとめ（完了画面・PRODUCT_CANON §6） ──

export interface DailySkillResult {
  skill: ExamSkill;
  labelJa: string;
  labelZh: string;
  correct: number;
  total: number;
  pct: number;
}

export interface DailySummary {
  /** 今日その技能で解いた結果。解いていない技能は入らない（0%と表示しないため） */
  skillResults: DailySkillResult[];
  /** 今日あらたに定着まで届いた対象の数 */
  newlyMasteredToday: number;
  /** 今日の記録が1件も無い（＝伸びを語れない） */
  noRecord: boolean;
}

/**
 * 今日の学習結果を技能別に出す。
 * **解いていない技能は返さない。** 0%として並べると「できなかった」と誤読されるため（canon 原則13）。
 */
export const buildDailySummary = (
  prof: AdventureV2Profile,
  dateKey: string,
  nowISO: string,
): DailySummary => {
  const stats = skillStats(prof.mastery, dateKey, addDays(dateKey, 1));
  const skillResults: DailySkillResult[] = (Object.entries(stats) as [ExamSkill, { correct: number; total: number }][])
    .filter(([, v]) => v.total > 0)
    .map(([skill, v]) => ({
      skill,
      labelJa: EXAM_SKILL_LABELS[skill].ja,
      labelZh: EXAM_SKILL_LABELS[skill].zh,
      correct: v.correct,
      total: v.total,
      pct: Math.round((v.correct / v.total) * 100),
    }))
    .sort((a, b) => b.total - a.total);

  const masteredNow = masteredTargetIds(prof.mastery, nowISO);
  const beforeSet = masteredTargetIds(prof.mastery, `${dateKey}T00:00:00.000Z`);

  return {
    skillResults,
    newlyMasteredToday: [...masteredNow].filter((t) => !beforeSet.has(t)).length,
    noRecord: skillResults.length === 0,
  };
};
