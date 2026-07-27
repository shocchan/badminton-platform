// ステップキー → イラストコンポーネントの対応表。
// LearningIllustrations.tsx はコンポーネントだけを export する必要があるため（Fast Refresh制約）、
// 定数はこのファイルに分離する。
import {
  GoalIllustration, CheckIllustration, PracticeIllustration, DoneIllustration,
} from './LearningIllustrations';

export const STEP_ILLUSTRATIONS = {
  goal: GoalIllustration,
  check: CheckIllustration,
  practice: PracticeIllustration,
  done: DoneIllustration,
} as const;
