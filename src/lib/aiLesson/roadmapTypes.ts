// 目標達成ロードマップの型定義
// 方針:
// - カリキュラム（GoalRoadmap）と生徒の進捗（RoadmapProgressState）を完全に分離する
// - カリキュラムは現在 roadmapData.ts の仮データだが、将来 JSON / Supabase / 管理画面から
//   差し替えられるよう、UIコンポーネントは GoalRoadmap を受け取るだけにする
// - 正式なN2出題範囲の網羅は別フェーズ（totalItems は仮の総数で、定義済み項目より多くてよい）

/** ロードマップを持てる目標（ヒアリングのgoal + 将来追加分） */
export type RoadmapGoalKey =
  | 'daily'        // 日常会話力UP
  | 'exchange'     // 日本人との自然な交流
  | 'n3'
  | 'n2'
  | 'n1'
  | 'work'         // 仕事
  | 'interview'    // 面接・大学院
  | 'badminton'    // バドミントン交流
  | 'presentation'; // 人前で話す

/** 学習領域 */
export type DomainKey =
  | 'vocab'        // 語彙
  | 'kanji'        // 漢字
  | 'grammar'      // 文法
  | 'reading'      // 読解
  | 'listening'    // 聴解
  | 'conversation' // 会話運用
  | 'mockExam'     // 模擬問題・試験対策
  | 'review';      // 復習・定着

/** 項目の学習状態（12-7）。順序は定着度の低い→高い */
export type MasteryState =
  | 'untouched'     // 未学習
  | 'introduced'    // 初回学習済み
  | 'understood'    // 意味を理解
  | 'usedWithHint'  // ヒントありで使用
  | 'usedSelf'      // 自力使用
  | 'reviewedDay1'  // 翌日復習成功
  | 'reviewedDay3'  // 3日後復習成功
  | 'retainedDay7'  // 7日後定着
  | 'retainedDay30'; // 30日後定着

/** 学習項目（表現・語彙・文法など） */
export interface RoadmapItem {
  id: string;          // 例: 'conv.permission.temoiidesuka'
  label: string;       // 表示名（例: 「〜てもいいですか」）
  zhMeaning?: string;  // 中国語の意味
  domain: DomainKey;
  categoryId: string;  // 上位カテゴリー（例: 許可・依頼）
  required: boolean;   // 必須 / 任意（管理者調整想定）
  difficulty: 1 | 2 | 3;
  priority: number;    // 小さいほど先に学ぶ
  /** レッスンの目標表現と紐付けるための検出パターン（正規表現ソース） */
  detect?: string;
}

/** 上位カテゴリー（例: 許可・依頼） */
export interface RoadmapCategory {
  id: string;
  domain: DomainKey;
  labelJa: string;
  labelZh: string;
}

/** 領域定義。totalItems は仮の総項目数（定義済み items より多くてよい。差分は未定義の残り） */
export interface RoadmapDomain {
  key: DomainKey;
  totalItems: number;
}

/** 目標ごとのロードマップ（カリキュラム本体。生徒の進捗は含まない） */
export interface GoalRoadmap {
  goal: RoadmapGoalKey;
  version: string;
  labelJa: string;
  labelZh: string;
  targetLevelLabel: string;      // 例: 'N2'
  /** JLPT試験トラックを持つか（falseなら試験進捗を表示・計算しない） */
  hasExamTrack: boolean;
  /** ロードマップ完走に必要な推定ミッション総数（管理者調整可能な仮値） */
  estimatedTotalMissions: number;
  domains: RoadmapDomain[];
  categories: RoadmapCategory[];
  items: RoadmapItem[];
}

// ── 生徒の進捗 ──

export interface RoadmapItemProgress {
  itemId: string;
  state: MasteryState;
  firstLearnedISO: string;
  lastUpdatedISO: string;
}

export interface RoadmapProgressState {
  goal: RoadmapGoalKey;
  itemStates: Record<string, RoadmapItemProgress>;
  /** 試験予定日（未設定なら null。管理者/生徒が将来設定） */
  examDateISO: string | null;
  /** 週間目標回数の上書き（null なら plan.weeklySessions を使う） */
  weeklyTargetSessions: number | null;
  /** 生徒ごとの残りミッション補正（管理者調整想定。+/-回数） */
  remainingMissionsOffset: number;
}

// ── 計算結果 ──

export interface DomainProgress {
  key: DomainKey;
  totalItems: number;
  introducedCount: number;   // 学習済み（初回学習以上）
  understoodCount: number;   // 理解済み以上
  selfUsedCount: number;     // 自力使用以上
  reviewPendingCount: number; // 復習待ち（学習済みだが翌日復習前）
  retainedCount: number;     // 定着済み（7日後定着以上）
  /** 定着度で重み付けした進捗率 0〜1（未定義の残り項目は0扱い） */
  progressRatio: number;
  /** 苦手度 0〜1（学習済みのうち自力使用に届いていない割合） */
  weaknessRatio: number;
  /** 次に優先する項目（定義済み項目から） */
  nextItemIds: string[];
}

/** 試験進捗と会話進捗を分離して持つ（12-8） */
export interface GoalProgress {
  overallRatio: number;
  /** JLPT試験進捗（試験系領域のみ。試験系領域がない目標では null） */
  examRatio: number | null;
  /** 会話運用進捗 */
  conversationRatio: number;
  /** 定着進捗（学習済み項目のうち復習成功以上の割合） */
  retentionRatio: number;
  domains: DomainProgress[];
}

export interface MissionEstimate {
  min: number;
  max: number;
}

export interface CompletionEstimate {
  minWeeks: number;
  maxWeeks: number;
  minMonths: number;
  maxMonths: number;
}
