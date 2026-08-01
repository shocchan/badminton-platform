// 人間レッスンbridge（§20・D-013）。AIが量を回し、しょっちゃんは難所攻略と方向修正に集中する。
// カレンダー連携は作らない。profile内の安全な構造＋サマリー生成の純関数のみ。
import type { AdvMasteryLedger, AdvSkillProfile, AdventureV2Profile } from './advTypes';
import { SKILL_LABELS } from './advSkillProfile';
import { computeMastery } from './advMastery';
import { collectSkillEvidence } from './advReadiness';
import { EXAM_SKILL_LABELS, EXAM_SKILLS, type ExamSkill } from './advExamSkills';

export interface LessonPrepSummary {
  generatedAt: string;
  /** 今週の学習日数（questLogから） */
  weekStudyDays: number;
  goalLabelJa: string;
  /** 苦手skill（confidence!=noneのうち低スコア順・最大3） */
  weakSkillsJa: string[];
  weakSkillsZh: string[];
  /** 遅延確認待ち・失敗が続く対象（次回扱う候補・最大3） */
  focusCandidates: { targetId: string; reasonJa: string; reasonZh: string }[];
  /** 学習者が相談したいこと（本人入力） */
  learnerTopics: string[];
  /** 学習者向け表示「次の先生レッスンで扱うこと」（最大3件） */
  learnerViewJa: string[];
  learnerViewZh: string[];
  /** 先生向け: 試験科目別の状況（COMPLETION §15） */
  teacherSkillRows: {
    skill: ExamSkill;
    labelJa: string;
    evidenceCount: number;
    unseenCount: number;
    delayedCount: number;
    timedCount: number;
    recentAccuracy: number | null;
  }[];
  /** 先生向け: 目標試験・試験日 */
  targetLevel: string | null;
  examDateISO: string | null;
}

const weekDays = (questLog: AdventureV2Profile['questLog'], nowISO: string): number => {
  const now = new Date(nowISO).getTime();
  const weekAgo = now - 7 * 86400000;
  return new Set(
    questLog.filter((e) => {
      const t = new Date(`${e.dateKey}T00:00:00Z`).getTime();
      return t >= weekAgo && t <= now && e.completedSteps > 0;
    }).map((e) => e.dateKey),
  ).size;
};

const weakSkills = (skills: AdvSkillProfile): { ja: string[]; zh: string[] } => {
  const rows = (Object.keys(SKILL_LABELS) as (keyof typeof SKILL_LABELS)[])
    .filter((k) => skills[k].confidence !== 'none')
    .sort((a, b) => skills[a].currentScore - skills[b].currentScore)
    .slice(0, 3);
  return { ja: rows.map((k) => SKILL_LABELS[k].ja), zh: rows.map((k) => SKILL_LABELS[k].zh) };
};

const focusCandidates = (ledger: AdvMasteryLedger, nowISO: string): LessonPrepSummary['focusCandidates'] => {
  const out: LessonPrepSummary['focusCandidates'] = [];
  for (const [targetId, attempts] of Object.entries(ledger)) {
    if (out.length >= 3) break;
    const st = computeMastery(attempts, nowISO);
    const recent = (attempts ?? []).slice(-3);
    const failing = recent.length >= 2 && recent.every((a) => a.scorePct < 80);
    if (failing) {
      out.push({ targetId, reasonJa: '80%に届かない状態が続いています', reasonZh: '连续未达到80%' });
    } else if (st.state === 'cleared_pending_delay' && st.delayCheckOpensAt && nowISO >= st.delayCheckOpensAt) {
      out.push({ targetId, reasonJa: '7日後の確認バトルが期限到来', reasonZh: '7天后的复查战已到期' });
    }
  }
  return out;
};

/** 次回人間レッスン用の自動サマリー（§20）。会話本文は含めない */
export const buildLessonPrepSummary = (
  profile: AdventureV2Profile, nowISO: string,
): LessonPrepSummary => {
  const weak = weakSkills(profile.skills);
  const focus = focusCandidates(profile.mastery, nowISO);
  const goalLabelJa = profile.goalType === 'conversation' ? '会話力向上'
    : profile.goalType === 'hybrid' ? `${profile.targetJlpt ?? ''}合格＋会話` : `${profile.targetJlpt ?? ''}合格`;
  // 本人が相談したいことを最優先にする（3件に絞っても必ず残るように）
  const topics = profile.humanLesson.learnerTopics ?? [];
  const learnerViewJa = [
    ...topics,
    ...focus.map((f) => `${f.targetId} の攻略（${f.reasonJa}）`),
    ...weak.ja.slice(0, 2).map((s) => `${s}の底上げ`),
  ];
  const learnerViewZh = [
    ...topics,
    ...focus.map((f) => `攻克 ${f.targetId}（${f.reasonZh}）`),
    ...weak.zh.slice(0, 2).map((s) => `提升${s}`),
  ];
  // 先生向けの試験科目別状況（会話全文は載せない・要約のみ）
  const ev = collectSkillEvidence(profile.mastery);
  const teacherSkillRows = EXAM_SKILLS.map((skill) => {
    const e = ev[skill];
    return {
      skill,
      labelJa: EXAM_SKILL_LABELS[skill].ja,
      evidenceCount: e.evidenceCount,
      unseenCount: e.unseenQuestionCount,
      delayedCount: e.delayedEvidenceCount,
      timedCount: e.timedEvidenceCount,
      recentAccuracy: e.evidenceCount > 0 ? Math.round((e.correct / e.evidenceCount) * 100) : null,
    };
  });

  return {
    generatedAt: nowISO,
    weekStudyDays: weekDays(profile.questLog, nowISO),
    goalLabelJa,
    weakSkillsJa: weak.ja, weakSkillsZh: weak.zh,
    focusCandidates: focus,
    learnerTopics: profile.humanLesson.learnerTopics ?? [],
    // 学習者側は最大3件（§15）
    learnerViewJa: learnerViewJa.slice(0, 3),
    learnerViewZh: learnerViewZh.slice(0, 3),
    teacherSkillRows,
    targetLevel: profile.targetJlpt,
    examDateISO: profile.examDateISO,
  };
};
