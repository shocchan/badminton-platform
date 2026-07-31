// 合格準備度（§16）。単純正答率ではなく技能別＋confidence＋遅延定着＋未出成績＋時間配分。
// 鉄則: 合格を保証しない／データが少ない項目は暫定・未判定と正直に出す（D-012）。
import type { AdvMasteryLedger, AdvSkillProfile, JlptLevel } from './advTypes';
import { MASTERY_RULES, questionTypeOf } from './advMastery';

export interface ReadinessRow {
  key: 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'timing';
  labelJa: string; labelZh: string;
  /** null = 未判定（表示側は「未判定」を出す。0%と混同させない） */
  pct: number | null;
  provisional: boolean;
  noteJa: string | null; noteZh: string | null;
}

export interface ReadinessReport {
  target: JlptLevel;
  rows: ReadinessRow[];
  /** 総合。判定可能な行が2未満なら null（総合も未判定） */
  overallPct: number | null;
  overallProvisional: boolean;
  topIssueJa: string | null; topIssueZh: string | null;
  summaryJa: string; summaryZh: string;
}

interface LedgerStats {
  /** 未出比率が高い試行（暗記でない実力）の平均点 */
  unseenPerfPct: number | null;
  /** 遅延確認（7日後以降のqualifying相当）の平均点 */
  delayedPct: number | null;
  /** timed試行の時間内完了率 */
  timedAttempts: number;
  timedScorePct: number | null;
  attempts: number;
}

const ledgerStats = (ledger: AdvMasteryLedger, targetPrefix: (id: string) => boolean): LedgerStats => {
  let unseenSum = 0; let unseenN = 0;
  let timedSum = 0; let timedN = 0;
  let attempts = 0;
  const firstAt = new Map<string, string>();
  let delayedSum = 0; let delayedN = 0;
  for (const [id, list] of Object.entries(ledger)) {
    if (!targetPrefix(id)) continue;
    for (const a of list ?? []) {
      attempts += 1;
      if (a.unseenRatio >= MASTERY_RULES.minUnseenRatio) { unseenSum += a.scorePct; unseenN += 1; }
      if (a.timed) { timedSum += a.scorePct; timedN += 1; }
      const f = firstAt.get(id);
      if (!f) firstAt.set(id, a.completedAt);
      else {
        const days = (new Date(a.completedAt).getTime() - new Date(f).getTime()) / 86400000;
        if (days >= MASTERY_RULES.delayDays) { delayedSum += a.scorePct; delayedN += 1; }
      }
    }
  }
  return {
    unseenPerfPct: unseenN > 0 ? Math.round(unseenSum / unseenN) : null,
    delayedPct: delayedN > 0 ? Math.round(delayedSum / delayedN) : null,
    timedAttempts: timedN,
    timedScorePct: timedN > 0 ? Math.round(timedSum / timedN) : null,
    attempts,
  };
};

/** skillスコアと台帳統計の合成（実測がある側を優先し、暗記成分を混ぜない） */
const combine = (skillPct: number | null, unseenPct: number | null, delayedPct: number | null): number | null => {
  const parts: { v: number; w: number }[] = [];
  if (skillPct !== null) parts.push({ v: skillPct, w: 0.4 });
  if (unseenPct !== null) parts.push({ v: unseenPct, w: 0.4 });
  if (delayedPct !== null) parts.push({ v: delayedPct, w: 0.2 });
  if (parts.length === 0) return null;
  const wsum = parts.reduce((n, p) => n + p.w, 0);
  return Math.round(parts.reduce((n, p) => n + p.v * (p.w / wsum), 0));
};

export const computeReadiness = (
  target: JlptLevel, skills: AdvSkillProfile, ledger: AdvMasteryLedger,
): ReadinessReport => {
  const grammarStats = ledgerStats(ledger, (id) => id.startsWith('n2g-') || id.startsWith('n3g-') || id.startsWith('stg-'));
  const vocabStats = ledgerStats(ledger, (id) => id.startsWith('n3u-') || id.startsWith('fi-') || id.startsWith('n3-'));

  const vocabPct = skills.vocabulary.confidence === 'none' ? null : skills.vocabulary.currentScore;
  const grammarPct = skills.grammar.confidence === 'none' ? null : skills.grammar.currentScore;

  // 読解: reading_shortバトル由来（key接頭辞 read:）の統計。無ければ未判定
  const readingStats = ledgerStats(ledger, (id) => id.startsWith('read:'));
  const hasReading = readingStats.attempts > 0;

  const rows: ReadinessRow[] = [
    {
      key: 'vocabulary', labelJa: '語彙', labelZh: '词汇',
      pct: combine(vocabPct, vocabStats.unseenPerfPct, vocabStats.delayedPct),
      provisional: skills.vocabulary.confidence === 'low' || skills.vocabulary.confidence === 'none',
      noteJa: null, noteZh: null,
    },
    {
      key: 'grammar', labelJa: '文法', labelZh: '语法',
      pct: combine(grammarPct, grammarStats.unseenPerfPct, grammarStats.delayedPct),
      provisional: skills.grammar.confidence === 'low' || skills.grammar.confidence === 'none',
      noteJa: grammarStats.delayedPct === null ? '7日後の定着データはこれから' : null,
      noteZh: grammarStats.delayedPct === null ? '7天后的巩固数据尚在积累' : null,
    },
    {
      key: 'reading', labelJa: '読解', labelZh: '阅读',
      pct: hasReading ? combine(null, readingStats.unseenPerfPct ?? readingStats.timedScorePct, readingStats.delayedPct) : null,
      provisional: true,
      noteJa: hasReading ? 'データが少ないため暫定' : '未判定（読解バトルのデータがまだありません）',
      noteZh: hasReading ? '数据较少・暂定' : '尚未判定（还没有阅读战斗数据）',
    },
    {
      key: 'listening', labelJa: '聴解', labelZh: '听力',
      // D-009: 音声聴解は測っていない。会話理解で代替もUI上は聴解と表示しない方針＝ここでは常に未判定
      pct: null,
      provisional: true,
      noteJa: '未判定（音声での聴解はまだ測定していません）',
      noteZh: '尚未判定（还没有测定音频听力）',
    },
    {
      key: 'timing', labelJa: '時間配分', labelZh: '时间分配',
      pct: grammarStats.timedAttempts > 0 ? grammarStats.timedScorePct : null,
      provisional: grammarStats.timedAttempts < 3,
      noteJa: grammarStats.timedAttempts === 0 ? '未判定（中ボス・模擬ボスで測ります）' : null,
      noteZh: grammarStats.timedAttempts === 0 ? '尚未判定（通过中Boss・模拟Boss测定）' : null,
    },
  ];

  const measured = rows.filter((r) => r.pct !== null) as (ReadinessRow & { pct: number })[];
  const overallPct = measured.length >= 2
    ? Math.round(measured.reduce((n, r) => n + r.pct, 0) / measured.length)
    : null;
  const overallProvisional = measured.length < 4 || measured.some((r) => r.provisional);

  const weakest = measured.slice().sort((a, b) => a.pct - b.pct)[0] ?? null;
  const unmeasured = rows.filter((r) => r.pct === null);
  const topIssueJa = weakest ? `現在の課題：${weakest.labelJa}` : null;
  const topIssueZh = weakest ? `当前课题：${weakest.labelZh}` : null;

  const summaryJa = (overallPct === null
    ? 'まだデータが少ないため、準備度は判定できません。バトルと復習を重ねると表示されます。'
    : `現在の学習データでは、${target}攻略準備度は${overallPct}%です（${overallProvisional ? '暫定' : '実測'}）。` +
      (unmeasured.length > 0 ? `${unmeasured.map((r) => r.labelJa).join('・')}は未判定です。` : ''))
    + 'この表示は合格を保証するものではありません。';
  const summaryZh = (overallPct === null
    ? '数据还不足，暂时无法判定准备度。多打战斗和复习后会显示。'
    : `按当前学习数据，${target}攻略准备度为${overallPct}%（${overallProvisional ? '暂定' : '实测'}）。` +
      (unmeasured.length > 0 ? `${unmeasured.map((r) => r.labelZh).join('・')}尚未判定。` : ''))
    + '此显示不构成合格保证。';

  return { target, rows, overallPct, overallProvisional, topIssueJa, topIssueZh, summaryJa, summaryZh };
};

/** 「同じ問題の暗記」を除いた実力の目安があるか（表示分岐用） */
export const hasUnseenEvidence = (ledger: AdvMasteryLedger): boolean => {
  for (const list of Object.values(ledger)) {
    for (const a of list ?? []) {
      if (a.unseenRatio >= MASTERY_RULES.minUnseenRatio && a.questionKeys.some((k) => questionTypeOf(k) !== 'rec')) return true;
    }
  }
  return false;
};
