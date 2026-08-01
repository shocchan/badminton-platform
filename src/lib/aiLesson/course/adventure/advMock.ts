// 総合ミニ模試と中ボス（COMPLETION §8・§9・§10）。
//
// 鉄則:
// - 条件を満たさないうちは「総合模試」と名乗らない（準備中／文法・語彙模試のみ と正直に出す）
// - 「本番同等」と表示しない（ミニ模試であることを明示）
// - section遷移・残り時間・未回答警告・skill別結果を持つ
import { EXAM_STRUCTURE, type ExamSection, type ExamSkill } from './advExamSkills';

/** 本試験の科目別時間（分）。表示と時間配分評価の正準値 */
export const EXAM_MINUTES: Record<'N2' | 'N3', { section: ExamSection; labelJa: string; labelZh: string; minutes: number }[]> = {
  N2: [
    { section: 'languageKnowledge', labelJa: '言語知識（文字・語彙・文法）・読解', labelZh: '语言知识（文字・词汇・语法）・阅读', minutes: 105 },
    { section: 'listening', labelJa: '聴解', labelZh: '听力', minutes: 50 },
  ],
  N3: [
    { section: 'languageKnowledge', labelJa: '言語知識（文字・語彙）', labelZh: '语言知识（文字・词汇）', minutes: 30 },
    { section: 'reading', labelJa: '言語知識（文法）・読解', labelZh: '语言知识（语法）・阅读', minutes: 70 },
    { section: 'listening', labelJa: '聴解', labelZh: '听力', minutes: 40 },
  ],
};

/** ミニ模試のsection定義（本番の縮小版。比率は本番の科目時間に合わせる） */
export interface MockSection {
  sectionId: string;
  labelJa: string;
  labelZh: string;
  skills: ExamSkill[];
  questionCount: number;
  /** このsectionの制限時間（秒） */
  timeLimitSec: number;
}

export interface MockSpec {
  level: 'N2' | 'N3';
  /** 総合模試として出せるか */
  ready: boolean;
  /** 出せない理由（learnerへ正直に見せる） */
  blockersJa: string[];
  blockersZh: string[];
  /** 表示名。条件未達なら「文法・語彙ミニ模試」等へ落ちる */
  titleJa: string;
  titleZh: string;
  sections: MockSection[];
  /** 本番同等ではないことの明示 */
  disclaimerJa: string;
  disclaimerZh: string;
}

export interface MockAvailability {
  vocabCount: number;
  grammarCount: number;
  readingCount: number;
  listeningCount: number;
}

/** 総合模試を名乗るための最低問題数 */
export const MOCK_REQUIREMENT = {
  vocab: 5, grammar: 5, reading: 4, listening: 4,
} as const;

/**
 * 利用可能な問題数から模試の仕様を決める。
 * 4技能が揃わなければ「総合」と呼ばず、含められる科目だけの模試にする。
 */
export const buildMockSpec = (level: 'N2' | 'N3', avail: MockAvailability): MockSpec => {
  const blockersJa: string[] = [];
  const blockersZh: string[] = [];
  if (avail.vocabCount < MOCK_REQUIREMENT.vocab) {
    blockersJa.push(`文字・語彙の問題が不足しています（${avail.vocabCount}/${MOCK_REQUIREMENT.vocab}）`);
    blockersZh.push(`文字・词汇题不足（${avail.vocabCount}/${MOCK_REQUIREMENT.vocab}）`);
  }
  if (avail.grammarCount < MOCK_REQUIREMENT.grammar) {
    blockersJa.push(`文法の問題が不足しています（${avail.grammarCount}/${MOCK_REQUIREMENT.grammar}）`);
    blockersZh.push(`语法题不足（${avail.grammarCount}/${MOCK_REQUIREMENT.grammar}）`);
  }
  if (avail.readingCount < MOCK_REQUIREMENT.reading) {
    blockersJa.push(`読解の問題が不足しています（${avail.readingCount}/${MOCK_REQUIREMENT.reading}）`);
    blockersZh.push(`阅读题不足（${avail.readingCount}/${MOCK_REQUIREMENT.reading}）`);
  }
  if (avail.listeningCount < MOCK_REQUIREMENT.listening) {
    blockersJa.push(`聴解の音声が不足しています（${avail.listeningCount}/${MOCK_REQUIREMENT.listening}）`);
    blockersZh.push(`听力音频不足（${avail.listeningCount}/${MOCK_REQUIREMENT.listening}）`);
  }
  const ready = blockersJa.length === 0;

  const sections: MockSection[] = [];
  if (avail.vocabCount >= MOCK_REQUIREMENT.vocab || avail.grammarCount >= MOCK_REQUIREMENT.grammar) {
    sections.push({
      sectionId: 'languageKnowledge',
      labelJa: '言語知識（文字・語彙・文法）', labelZh: '语言知识（文字・词汇・语法）',
      skills: ['charactersVocabulary', 'grammar'],
      questionCount: Math.min(10, avail.vocabCount + avail.grammarCount),
      timeLimitSec: 10 * 45,
    });
  }
  if (avail.readingCount >= MOCK_REQUIREMENT.reading) {
    sections.push({
      sectionId: 'reading',
      labelJa: '読解', labelZh: '阅读',
      skills: ['reading'],
      questionCount: Math.min(5, avail.readingCount),
      timeLimitSec: 5 * 100,
    });
  }
  if (avail.listeningCount >= MOCK_REQUIREMENT.listening) {
    sections.push({
      sectionId: 'listening',
      labelJa: '聴解', labelZh: '听力',
      skills: ['listening'],
      questionCount: Math.min(5, avail.listeningCount),
      timeLimitSec: 5 * 70,
    });
  }

  const titleJa = ready ? `${level}総合ミニ模試`
    : sections.length === 0 ? `${level}模試（準備中）`
    : sections.length === 1 ? `${level}文法・語彙ミニ模試`
    : `${level}ミニ模試（一部科目）`;
  const titleZh = ready ? `${level}综合迷你模拟考`
    : sections.length === 0 ? `${level}模拟考（准备中）`
    : sections.length === 1 ? `${level}语法・词汇迷你模拟考`
    : `${level}迷你模拟考（部分科目）`;

  return {
    level, ready, blockersJa, blockersZh, titleJa, titleZh, sections,
    disclaimerJa: '本番の試験と同じ問題数・時間ではありません。時間配分と科目バランスを試すためのミニ版です。',
    disclaimerZh: '题量和时间与真实考试不同。这是用来练习时间分配和科目平衡的迷你版。',
  };
};

/** 本試験の科目構成（表示用） */
export const examStructureOf = (level: 'N2' | 'N3') => EXAM_STRUCTURE[level];

// ── 中ボス（§9） ──

export interface MidbossSpec {
  bossId: string;
  level: 'N2' | 'N3';
  titleJa: string;
  titleZh: string;
  skills: ExamSkill[];
  questionCount: number;
  timeLimitSec: number;
  /** 挑戦できる条件（未達なら理由を出す） */
  unlockedJa: string;
  unlockedZh: string;
}

export interface MidbossReadiness {
  /** 対象単元の定着率（0-1） */
  unitMastery: number;
  /** 未出問題での正答率（0-1・nullは未測定） */
  unseenAccuracy: number | null;
  /** 遅延定着を達成した対象数 */
  delayedMasteredCount: number;
  /** 出題可能な問題数 */
  availableQuestions: number;
}

export const MIDBOSS_REQUIREMENT = {
  minUnitMastery: 0.5,
  minUnseenAccuracy: 0.6,
  minDelayedMastered: 1,
  minQuestions: 15,
} as const;

/** 中ボスに挑戦できるか（1回の高得点では開かない） */
export const midbossUnlocked = (r: MidbossReadiness): { ok: boolean; reasonJa: string; reasonZh: string } => {
  if (r.availableQuestions < MIDBOSS_REQUIREMENT.minQuestions) {
    return {
      ok: false,
      reasonJa: `出題できる問題が足りません（${r.availableQuestions}/${MIDBOSS_REQUIREMENT.minQuestions}）`,
      reasonZh: `可出的题不足（${r.availableQuestions}/${MIDBOSS_REQUIREMENT.minQuestions}）`,
    };
  }
  if (r.unitMastery < MIDBOSS_REQUIREMENT.minUnitMastery) {
    return {
      ok: false,
      reasonJa: `単元の定着がまだ足りません（${Math.round(r.unitMastery * 100)}%／${MIDBOSS_REQUIREMENT.minUnitMastery * 100}%必要）`,
      reasonZh: `单元巩固还不够（${Math.round(r.unitMastery * 100)}%／需要${MIDBOSS_REQUIREMENT.minUnitMastery * 100}%）`,
    };
  }
  if (r.unseenAccuracy === null) {
    return { ok: false, reasonJa: '未出問題での成績がまだありません', reasonZh: '还没有未见过的题的成绩' };
  }
  if (r.unseenAccuracy < MIDBOSS_REQUIREMENT.minUnseenAccuracy) {
    return {
      ok: false,
      reasonJa: `初めて見る問題の正答率が足りません（${Math.round(r.unseenAccuracy * 100)}%／${MIDBOSS_REQUIREMENT.minUnseenAccuracy * 100}%必要）`,
      reasonZh: `首次见到的题正确率不足（${Math.round(r.unseenAccuracy * 100)}%／需要${MIDBOSS_REQUIREMENT.minUnseenAccuracy * 100}%）`,
    };
  }
  return { ok: true, reasonJa: '挑戦できます', reasonZh: '可以挑战' };
};

export const buildMidboss = (level: 'N2' | 'N3', kind: 'grammar' | 'languageKnowledge', questionCount: number): MidbossSpec => {
  const skills: ExamSkill[] = kind === 'grammar' ? ['grammar'] : ['charactersVocabulary', 'grammar', 'reading'];
  const count = Math.min(20, Math.max(15, questionCount));
  return {
    bossId: `midboss-${level.toLowerCase()}-${kind}`,
    level,
    titleJa: kind === 'grammar' ? `${level}文法 中ボス` : `${level}言語知識 中ボス`,
    titleZh: kind === 'grammar' ? `${level}语法 中Boss` : `${level}语言知识 中Boss`,
    skills,
    questionCount: count,
    timeLimitSec: count * 40,
    unlockedJa: '単元の定着・未出問題の成績が条件を満たすと挑戦できます',
    unlockedZh: '单元巩固和未见过的题的成绩达标后可以挑战',
  };
};

// ── 時間配分の評価（§8） ──

export interface TimingSample {
  /** 1問あたりの回答秒数 */
  secondsPerQuestion: number;
  /** 制限時間内に終わったか */
  finishedInTime: boolean;
  /** 未回答数 */
  unansweredCount: number;
  /** 正答率（0-1） */
  accuracy: number;
  section: ExamSection;
}

export interface TimingEvaluation {
  /** 0-100。速いだけでは高評価にしない */
  score: number | null;
  /** 判定できない場合の理由 */
  noteJa: string | null;
  noteZh: string | null;
  samples: number;
  avgSecondsPerQuestion: number | null;
  unfinishedRate: number | null;
}

/**
 * 時間配分の評価（§8）。
 * 速さだけでなく「時間内に終わったか」「未回答が無いか」「時間内での正答率」を合成する。
 * 速く解いて正答率が低い場合は高評価にしない。
 */
export const evaluateTiming = (samples: TimingSample[]): TimingEvaluation => {
  if (samples.length === 0) {
    return {
      score: null, samples: 0, avgSecondsPerQuestion: null, unfinishedRate: null,
      noteJa: '未判定（制限時間つきのボス・模試で測ります）',
      noteZh: '尚未判定（通过限时Boss・模拟考测定）',
    };
  }
  const finished = samples.filter((s) => s.finishedInTime).length / samples.length;
  const unanswered = samples.reduce((n, s) => n + s.unansweredCount, 0);
  const totalQ = samples.length;
  const avgSec = samples.reduce((n, s) => n + s.secondsPerQuestion, 0) / samples.length;
  const accuracy = samples.reduce((n, s) => n + s.accuracy, 0) / samples.length;
  // 時間内完走率 50% ＋ 時間内の正答率 40% ＋ 未回答の少なさ 10%
  const unansweredPenalty = Math.max(0, 1 - unanswered / Math.max(1, totalQ * 2));
  const score = Math.round((finished * 0.5 + accuracy * 0.4 + unansweredPenalty * 0.1) * 100);
  return {
    score,
    samples: samples.length,
    avgSecondsPerQuestion: Math.round(avgSec * 10) / 10,
    unfinishedRate: Math.round((1 - finished) * 100) / 100,
    noteJa: samples.length < 3 ? `暫定（${samples.length}回の記録）` : null,
    noteZh: samples.length < 3 ? `暂定（${samples.length}次记录）` : null,
  };
};
