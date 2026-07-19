// 初回診断 → 生徒の初期値を決める（純関数）。Andy用の初期値もここで調整できる。

import type { LearnerSettings } from './types';

export interface DiagnosisAnswers {
  goal: 'daily' | 'exchange' | 'n3' | 'n2' | 'n1' | 'work';
  level: 'belowN4' | 'n4' | 'n3' | 'n2' | 'n1' | 'unknown';
  residence: 'lt1y' | '1to3y' | '3to5y' | 'gt5y';
  scene: 'daily' | 'work' | 'badminton' | 'interview' | 'friends';
  struggle: 'recall' | 'grammar' | 'vocab' | 'listening' | 'nervous' | 'explain';
  zhSupport: LearnerSettings['zhSupport'];
  correction: LearnerSettings['correction'];
  weeklyTarget: number;         // 週の希望回数
  jlptGoal: 'none' | 'n3' | 'n2' | 'n1';
  examDateISO: string | null;
  badminton: boolean;
}

export interface InitialLearner {
  estimatedLevel: string;
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  currentWeek: number;
  settings: LearnerSettings;
  priorityCategory: string;
  weakHypothesis: string;
}

const LEVEL_LABEL: Record<DiagnosisAnswers['level'], string> = {
  belowN4: 'N5〜N4', n4: 'N4', n3: 'N3', n2: 'N2', n1: 'N1', unknown: 'N3前後（仮）',
};

/** レベル → 初期難易度（1〜5） */
const levelToDifficulty = (level: DiagnosisAnswers['level']): 1 | 2 | 3 | 4 | 5 => {
  switch (level) {
    case 'belowN4': return 1;
    case 'n4': return 2;
    case 'n3': return 3;
    case 'n2': return 4;
    case 'n1': return 5;
    case 'unknown': return 2;
  }
};

export const deriveInitialLearner = (a: DiagnosisAnswers): InitialLearner => {
  const priorityCategory =
    a.scene === 'work' ? 'workLife'
      : a.scene === 'badminton' ? 'badminton'
        : a.scene === 'interview' ? 'opinion' : 'selfIntro';
  const weakHypothesis =
    a.struggle === 'recall' ? '言葉がすぐ出てこない（瞬発力）'
      : a.struggle === 'grammar' ? '文法の精度'
        : a.struggle === 'vocab' ? '語彙の不足'
          : a.struggle === 'listening' ? '聞き取り'
            : a.struggle === 'nervous' ? '緊張して話せない' : '長く説明する力';
  return {
    estimatedLevel: LEVEL_LABEL[a.level],
    difficultyLevel: levelToDifficulty(a.level),
    // 完成版は基礎から積み上げる設計のため、開始は必ずWeek1（順番に定着させる）
    currentWeek: 1,
    settings: {
      zhSupport: a.zhSupport,
      correction: a.correction,
      weeklyTarget: a.weeklyTarget,
      sessionMinutes: 3,
      examDateISO: a.examDateISO,
    },
    priorityCategory,
    weakHypothesis,
  };
};

/** Andy用のおすすめ初期値（管理者が初回に流用できる） */
export const ANDY_DEFAULTS: DiagnosisAnswers = {
  goal: 'n2', level: 'n3', residence: '1to3y', scene: 'badminton', struggle: 'recall',
  zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, jlptGoal: 'n2',
  examDateISO: null, badminton: true,
};
