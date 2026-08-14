// 合格準備度（UX CLARITY §5・ASSESSMENT INTEGRITY §9）。
//
// 鉄則:
// - **文法だけの結果から「総合準備度」を出さない。**
// - データ不足は 0% ではなく「未判定」。
// - AI会話の成績を JLPT本試験の準備度へ直接加算しない（別軸で表示）。
// - 各skillに evidenceCount / unseen / delayed / timed / confidence / lastAssessedAt を保持・表示。
import type { AdvConfidence, AdvMasteryLedger, AdvSkillProfile, JlptLevel } from './advTypes';
import { MASTERY_RULES } from './advMastery';
import {
  EXAM_SKILLS, EXAM_SKILL_LABELS, EXAM_STRUCTURE, OVERALL_READINESS_REQUIREMENT,
  PRACTICAL_SKILL_LABELS, SECTION_OF_SKILL, type ExamSkill,
} from './advExamSkills';

export interface SkillEvidence {
  evidenceCount: number;
  unseenQuestionCount: number;
  delayedEvidenceCount: number;
  timedEvidenceCount: number;
  correct: number;
  /** 未出問題での正答率（暗記を除いた実力の目安）。証拠が無ければ null */
  unseenPct: number | null;
  /** 遅延（7日以降）での正答率 */
  delayedPct: number | null;
  /** 制限時間つきでの正答率 */
  timedPct: number | null;
  lastAssessedAt: string | null;
}

export interface ReadinessRow {
  key: ExamSkill;
  labelJa: string; labelZh: string;
  /** 試験当日のどのセクションで問われるか。時間配分は特定セクションに属さないため null */
  sectionJa: string | null; sectionZh: string | null;
  /** null = 未判定（0%と混同させない） */
  pct: number | null;
  confidence: AdvConfidence;
  provisional: boolean;
  evidence: SkillEvidence;
  noteJa: string | null; noteZh: string | null;
}

export interface PracticalRow {
  key: string;
  labelJa: string; labelZh: string;
  pct: number | null;
  noteJa: string; noteZh: string;
}

export interface ReadinessReport {
  target: JlptLevel;
  /** 本試験の構造（表示の裏づけ） */
  examParts: { labelJa: string; labelZh: string; minutes: number; skills: ExamSkill[] }[];
  rows: ReadinessRow[];
  /** 総合。要件を満たさない限り必ず null（§9） */
  overallPct: number | null;
  /** 総合を出せない理由（機械判定の結果） */
  overallBlockersJa: string[];
  overallBlockersZh: string[];
  /** §10の各条件の充足状況（1つでもfalseなら overallPct は null） */
  overallGate: OverallGate;
  /** 完了したミニ模試の回数 */
  mockCount: number;
  /** JLPTへ加算しない別軸（§5） */
  practical: PracticalRow[];
  topIssueJa: string | null; topIssueZh: string | null;
  summaryJa: string; summaryZh: string;
}

const emptyEvidence = (): SkillEvidence => ({
  evidenceCount: 0, unseenQuestionCount: 0, delayedEvidenceCount: 0, timedEvidenceCount: 0,
  correct: 0, unseenPct: null, delayedPct: null, timedPct: null, lastAssessedAt: null,
});

const confidenceOf = (e: SkillEvidence): AdvConfidence => {
  if (e.evidenceCount === 0) return 'none';
  if (e.evidenceCount < OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill) return 'low';
  if (e.unseenQuestionCount < OVERALL_READINESS_REQUIREMENT.minUnseenPerSkill) return 'medium';
  return 'high';
};

/**
 * 台帳から skill 別の証拠を集計する。
 * 旧attempt（bySkill無し）は skill 不明として集計に入れない（推測しない）。
 */
export const collectSkillEvidence = (ledger: AdvMasteryLedger): Record<ExamSkill, SkillEvidence> => {
  const out = {} as Record<ExamSkill, SkillEvidence>;
  for (const s of EXAM_SKILLS) out[s] = emptyEvidence();
  const firstAt = new Map<string, string>();
  const delayedAcc: Record<string, { c: number; t: number }> = {};
  const timedAcc: Record<string, { c: number; t: number }> = {};
  const unseenAcc: Record<string, { c: number; t: number }> = {};

  for (const [targetId, attempts] of Object.entries(ledger)) {
    for (const a of attempts ?? []) {
      if (!a.bySkill) continue;
      const f = firstAt.get(targetId);
      if (!f) firstAt.set(targetId, a.completedAt);
      const daysSinceFirst = f
        ? (new Date(a.completedAt).getTime() - new Date(f).getTime()) / 86400000
        : 0;
      const isDelayed = daysSinceFirst >= MASTERY_RULES.delayDays;
      for (const [skill, row] of Object.entries(a.bySkill)) {
        if (!EXAM_SKILLS.includes(skill as ExamSkill)) continue;
        const e = out[skill as ExamSkill];
        e.evidenceCount += row.total;
        e.correct += row.correct;
        e.unseenQuestionCount += row.unseen;
        if (!e.lastAssessedAt || a.completedAt > e.lastAssessedAt) e.lastAssessedAt = a.completedAt;
        if (row.unseen > 0) {
          const u = unseenAcc[skill] ?? { c: 0, t: 0 };
          // 未出分の正答は全体正答率で近似する（問題単位の未出フラグは attempt に持たないため）
          u.c += Math.round((row.correct / Math.max(1, row.total)) * row.unseen);
          u.t += row.unseen;
          unseenAcc[skill] = u;
        }
        if (isDelayed) {
          e.delayedEvidenceCount += row.total;
          const d = delayedAcc[skill] ?? { c: 0, t: 0 };
          d.c += row.correct; d.t += row.total; delayedAcc[skill] = d;
        }
        if (a.timed) {
          e.timedEvidenceCount += row.total;
          const tt = timedAcc[skill] ?? { c: 0, t: 0 };
          tt.c += row.correct; tt.t += row.total; timedAcc[skill] = tt;
          // 時間配分は「制限時間つきでどれだけ解けたか」なので、科目を問わず集約する
          const tm = out.timeManagement;
          tm.evidenceCount += row.total;
          tm.correct += row.correct;
          tm.timedEvidenceCount += row.total;
          tm.unseenQuestionCount += row.unseen;
          if (!tm.lastAssessedAt || a.completedAt > tm.lastAssessedAt) tm.lastAssessedAt = a.completedAt;
          const tmAcc = timedAcc.timeManagement ?? { c: 0, t: 0 };
          tmAcc.c += row.correct; tmAcc.t += row.total; timedAcc.timeManagement = tmAcc;
        }
      }
    }
  }
  for (const s of EXAM_SKILLS) {
    const e = out[s];
    const u = unseenAcc[s]; const d = delayedAcc[s]; const tt = timedAcc[s];
    e.unseenPct = u && u.t > 0 ? Math.round((u.c / u.t) * 100) : null;
    e.delayedPct = d && d.t > 0 ? Math.round((d.c / d.t) * 100) : null;
    e.timedPct = tt && tt.t > 0 ? Math.round((tt.c / tt.t) * 100) : null;
  }
  return out;
};

/** 表示スコア: 未出・遅延を重視し、暗記成分（既出のみの高得点）に寄りかからない */
const scoreOf = (e: SkillEvidence): number | null => {
  if (e.evidenceCount === 0) return null;
  const overall = Math.round((e.correct / Math.max(1, e.evidenceCount)) * 100);
  const parts: { v: number; w: number }[] = [{ v: overall, w: 0.4 }];
  if (e.unseenPct !== null) parts.push({ v: e.unseenPct, w: 0.4 });
  if (e.delayedPct !== null) parts.push({ v: e.delayedPct, w: 0.2 });
  const wsum = parts.reduce((n, p) => n + p.w, 0);
  return Math.round(parts.reduce((n, p) => n + p.v * (p.w / wsum), 0));
};

/**
 * 総合準備度を出すための条件（COMPLETION §10）。
 * 一つでも欠ければ overallPct は null（未判定）。文法攻略率を総合へ流用しない。
 */
export interface OverallGate {
  languageKnowledgeEvidence: boolean;
  readingEvidence: boolean;
  listeningEvidence: boolean;
  timedEvidence: boolean;
  unseenEvidence: boolean;
  delayedEvidence: boolean;
  mockCount: boolean;
}

export const computeReadiness = (
  target: JlptLevel, skills: AdvSkillProfile, ledger: AdvMasteryLedger,
  /** 完了したミニ模試の履歴（§10: 3回以上で初めて総合を出す） */
  mockLog: { completedAt: string }[] = [],
): ReadinessReport => {
  const level: 'N2' | 'N3' = target === 'N3' ? 'N3' : 'N2';
  const evidence = collectSkillEvidence(ledger);

  const rows: ReadinessRow[] = EXAM_SKILLS.map((key) => {
    const e = evidence[key];
    const conf = confidenceOf(e);
    // 時間配分は timed 実績のみで測る（無ければ未判定）
    const pct = key === 'timeManagement'
      ? (e.timedEvidenceCount > 0 ? e.timedPct : null)
      : scoreOf(e);
    const sec = SECTION_OF_SKILL[key];
    const noteJa = pct === null
      ? (key === 'listening' ? '未判定（音声での聴解はまだ測定していません）'
        : key === 'reading' ? '未判定（読解問題のデータがまだありません）'
        : key === 'timeManagement' ? '未判定（制限時間つきのボスで測ります）'
        : '未判定（この科目の問題をまだ解いていません）')
      : conf === 'low' ? `暫定（出題${e.evidenceCount}問・未出${e.unseenQuestionCount}問）`
      : e.delayedPct === null ? '7日後の定着データはこれから' : null;
    const noteZh = pct === null
      ? (key === 'listening' ? '尚未判定（还没有测定音频听力）'
        : key === 'reading' ? '尚未判定（还没有阅读题数据）'
        : key === 'timeManagement' ? '尚未判定（通过限时Boss测定）'
        : '尚未判定（还没有做过这个科目的题）')
      : conf === 'low' ? `暂定（已出${e.evidenceCount}题・未见过${e.unseenQuestionCount}题）`
      : e.delayedPct === null ? '7天后的巩固数据尚在积累' : null;
    return {
      key,
      labelJa: EXAM_SKILL_LABELS[key].ja, labelZh: EXAM_SKILL_LABELS[key].zh,
      // 時間配分は「どのセクションか」ではなく全体に効く指標なのでセクション名を出さない
      sectionJa: key === 'timeManagement' ? null
        : sec === 'languageKnowledge' ? '言語知識' : sec === 'reading' ? '読解' : '聴解',
      sectionZh: key === 'timeManagement' ? null
        : sec === 'languageKnowledge' ? '语言知识' : sec === 'reading' ? '阅读' : '听力',
      pct,
      confidence: conf,
      provisional: conf === 'low' || conf === 'none',
      evidence: e,
      noteJa, noteZh,
    };
  });

  // ── 総合の可否を機械判定（§9・COMPLETION §11） ──
  // 条件: 全技能に最低evidence／読解・聴解が未判定でない／timed evidenceあり／unseen evidenceあり
  const blockersJa: string[] = [];
  const blockersZh: string[] = [];
  const timing = evidence.timeManagement;
  if (timing.timedEvidenceCount === 0) {
    blockersJa.push('制限時間つきの記録がありません（中ボス・ミニ模試で測ります）');
    blockersZh.push('还没有限时记录（通过中Boss・迷你模拟考测定）');
  }
  for (const key of OVERALL_READINESS_REQUIREMENT.requiredSkills) {
    const e = evidence[key];
    const label = EXAM_SKILL_LABELS[key];
    if (e.evidenceCount < OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill) {
      blockersJa.push(`${label.ja}のデータが不足しています（${e.evidenceCount}/${OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill}問）`);
      blockersZh.push(`${label.zh}的数据不足（${e.evidenceCount}/${OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill}题）`);
    } else if (e.unseenQuestionCount < OVERALL_READINESS_REQUIREMENT.minUnseenPerSkill) {
      blockersJa.push(`${label.ja}の未出問題が不足しています（${e.unseenQuestionCount}/${OVERALL_READINESS_REQUIREMENT.minUnseenPerSkill}問）`);
      blockersZh.push(`${label.zh}的未见过的题不足（${e.unseenQuestionCount}/${OVERALL_READINESS_REQUIREMENT.minUnseenPerSkill}题）`);
    }
  }
  // 遅延（7日以降）の測り直しが無いうちは総合を出さない（§10）
  const delayedTotal = OVERALL_READINESS_REQUIREMENT.requiredSkills
    .reduce((n, k) => n + evidence[k].delayedEvidenceCount, 0);
  if (delayedTotal < OVERALL_READINESS_REQUIREMENT.minDelayedEvidence) {
    blockersJa.push(`7日後の測り直しが不足しています（${delayedTotal}/${OVERALL_READINESS_REQUIREMENT.minDelayedEvidence}問）`);
    blockersZh.push(`7天后的复测不足（${delayedTotal}/${OVERALL_READINESS_REQUIREMENT.minDelayedEvidence}题）`);
  }
  // 時間つきミニ模試の完了回数（§10）
  const mockCount = mockLog.length;
  if (mockCount < OVERALL_READINESS_REQUIREMENT.minMockCount) {
    blockersJa.push(`時間つきミニ模試の回数が不足しています（${mockCount}/${OVERALL_READINESS_REQUIREMENT.minMockCount}回）`);
    blockersZh.push(`限时迷你模拟考的次数不足（${mockCount}/${OVERALL_READINESS_REQUIREMENT.minMockCount}次）`);
  }

  const measuredRequired = OVERALL_READINESS_REQUIREMENT.requiredSkills
    .map((k) => rows.find((r) => r.key === k))
    .filter((r): r is ReadinessRow => !!r && r.pct !== null);
  const overallPct = blockersJa.length === 0 && measuredRequired.length === OVERALL_READINESS_REQUIREMENT.requiredSkills.length
    ? Math.round(measuredRequired.reduce((n, r) => n + (r.pct ?? 0), 0) / measuredRequired.length)
    : null;

  const gate: OverallGate = {
    languageKnowledgeEvidence:
      evidence.charactersVocabulary.evidenceCount >= OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill
      && evidence.grammar.evidenceCount >= OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill,
    readingEvidence: evidence.reading.evidenceCount >= OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill,
    listeningEvidence: evidence.listening.evidenceCount >= OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill,
    timedEvidence: timing.timedEvidenceCount > 0,
    unseenEvidence: OVERALL_READINESS_REQUIREMENT.requiredSkills
      .every((k) => evidence[k].unseenQuestionCount >= OVERALL_READINESS_REQUIREMENT.minUnseenPerSkill),
    delayedEvidence: delayedTotal >= OVERALL_READINESS_REQUIREMENT.minDelayedEvidence,
    mockCount: mockCount >= OVERALL_READINESS_REQUIREMENT.minMockCount,
  };

  // ── 別軸（JLPTへ加算しない）──
  const conv = skills.conversation;
  const practical: PracticalRow[] = [
    {
      key: 'conversation',
      labelJa: PRACTICAL_SKILL_LABELS.conversation.ja, labelZh: PRACTICAL_SKILL_LABELS.conversation.zh,
      pct: conv.confidence === 'none' ? null : conv.currentScore,
      noteJa: '冒険の準備（診断）で測った会話の開始地点です。その後のAI会話ではまだ更新されません。JLPTの点数には足しません。',
      noteZh: '这是「冒险准备」（诊断）时测得的会话起点，之后的AI会话暂时不会更新它，也不计入JLPT分数。',
    },
    {
      key: 'practicalUsage',
      labelJa: PRACTICAL_SKILL_LABELS.practicalUsage.ja, labelZh: PRACTICAL_SKILL_LABELS.practicalUsage.zh,
      pct: skills.practical.confidence === 'none' ? null : skills.practical.currentScore,
      noteJa: '学んだ表現を会話で実際に使えたかの記録です。',
      noteZh: '记录学过的表达是否真的用在了会话里。',
    },
  ];

  const measured = rows.filter((r) => r.pct !== null) as (ReadinessRow & { pct: number })[];
  const weakest = measured.slice().sort((a, b) => a.pct - b.pct)[0] ?? null;
  const undet = rows.filter((r) => r.pct === null);

  const summaryJa = overallPct === null
    ? `総合準備度はまだ判定できません。${blockersJa.length > 0 ? blockersJa[0] + '。' : ''}いま出せるのは科目ごとの状況だけです。この表示は合格を保証するものではありません。`
    : `現在の学習データでは、${target}の総合準備度は${overallPct}%です。${undet.length > 0 ? `${undet.map((r) => r.labelJa).join('・')}は未判定です。` : ''}この表示は合格を保証するものではありません。`;
  const summaryZh = overallPct === null
    ? `综合准备度还无法判定。${blockersZh.length > 0 ? blockersZh[0] + '。' : ''}目前只能显示各科目的情况。此显示不构成合格保证。`
    : `按当前学习数据，${target}的综合准备度为${overallPct}%。${undet.length > 0 ? `${undet.map((r) => r.labelZh).join('・')}尚未判定。` : ''}此显示不构成合格保证。`;

  return {
    target,
    examParts: EXAM_STRUCTURE[level],
    rows,
    overallPct,
    overallBlockersJa: blockersJa,
    overallBlockersZh: blockersZh,
    overallGate: gate,
    mockCount,
    practical,
    topIssueJa: weakest ? `いちばん弱いのは${weakest.labelJa}です` : null,
    topIssueZh: weakest ? `目前最弱的是${weakest.labelZh}` : null,
    summaryJa, summaryZh,
  };
};

/** 「同じ問題の暗記」を除いた実力の目安があるか（表示分岐用） */
export const hasUnseenEvidence = (ledger: AdvMasteryLedger): boolean => {
  for (const list of Object.values(ledger)) {
    for (const a of list ?? []) {
      if (a.unseenRatio >= MASTERY_RULES.minUnseenRatio) return true;
    }
  }
  return false;
};
