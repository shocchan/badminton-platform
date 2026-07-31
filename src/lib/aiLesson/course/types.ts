// Andyさん向け12週コース（完成版）の型定義
// カリキュラム（Mission）と生徒の状態（Learner / ItemProgress）を分離。
// カリキュラムは courseData.ts の静的データだが、将来 Supabase の
// ai_curriculum_items へ移行できるようフィールドをDBカラム相当で揃えている。

/** 定着状態（DB: ai_item_progress.mastery_state と同一の文字列） */
export type CourseMasteryState =
  | 'initial'             // 初回学習済み
  | 'understood'          // 意味を理解
  | 'used_with_hint'      // ヒントありで使用
  | 'used_independently'  // 自力使用
  | 'reviewed_day1'       // 翌日復習成功
  | 'reviewed_day3'       // 3日後復習成功
  | 'retained_day7'       // 7日後定着
  | 'retained_day30';     // 30日後定着

export type ReviewStage = 'none' | 'day1' | 'day3' | 'day7' | 'day30' | 'extra';

/**
 * レッスンの種類。
 * weekly_practice（週間総合実践）は通常の新規ミッションとは別種別で、
 * プロンプト・完了条件・レポート内容を分ける（週の複数表現を会話の中で使わせる）。
 */
export type LessonKind =
  | 'new'
  | 'review_day1'
  | 'review_day3'
  | 'review_day7'
  | 'review_day30'
  | 'extra'
  | 'weekly_practice';

export type MissionCategory =
  | 'selfIntro' | 'experience' | 'change' | 'habit' | 'permission' | 'trouble'
  | 'opinion' | 'comparison' | 'guess' | 'workLife' | 'badminton' | 'integrated';

/** 1ミッション（週5×12週=60）。内容はUIへハードコードせず courseData.ts で管理 */
export interface Mission {
  id: string;                    // 例: 'w03m1'
  week: number;                  // 1..12
  order: number;                 // 1..5（5は週間総合実践）
  titleJa: string;
  titleZh: string;
  category: MissionCategory;
  difficulty: 1 | 2 | 3 | 4 | 5;
  targetExpression: string;      // 例: 「〜ようになりました」
  targetExpressionReading: string;
  /** 目標表現の検出用正規表現ソース（発話判定に必須） */
  detect: string;
  meaningJa: string;
  meaningZh: string;
  usageNotesJa: string;
  usageNotesZh: string;
  naturalExample: string;        // 実際の日本人が使う自然な言い方
  simpleExample: string;         // 学習者向けの簡単な例
  /** 中国語母語話者が間違えやすいポイント */
  commonMistakes: string[];
  openingQuestion: string;
  followUpQuestions: string[];
  /** 段階的サポート6段階（言い換え→語句→選択肢→前半→完成文→復唱） */
  hintLevels: string[];
  chineseSupport: 'minimal' | 'normal' | 'rich';
  correctionPriority: 'meaning' | 'target' | 'both';
  completionCriteria: string;    // 翔子先生への完了条件の説明
  reviewPrompts: { day1: string; day3: string; day7: string };
  alternateScenes: string[];     // 別場面での再使用（3日後復習にも使う）
  requiredPreviousItems: string[];
  estimatedMinutes: number;
  isPublished: boolean;
  curriculumVersion: string;
}

/** 週の定義（ロードマップ表示用） */
export interface CourseWeek {
  week: number;
  themeJa: string;
  themeZh: string;
}

// ── 生徒の状態（DB行に対応） ──

export interface LearnerSettings {
  zhSupport: 'whenStuck' | 'grammar' | 'often' | 'none';
  correction: 'summary' | 'important' | 'immediate';
  weeklyTarget: number;
  sessionMinutes: number;
  examDateISO: string | null;
  /**
   * 音声レッスンの字幕補助（表示側）。zhSupport（音声側）とは別軸。
   * 未設定なら courseSubtitles.deriveDefaultSubtitleMode で導出する。
   */
  subtitleMode?: 'ja' | 'ja_zh' | 'whenStuck';
  /**
   * 画面の表示言語（UI）。subtitleMode（字幕）・zhSupport（音声補助）とは別の意味。
   * 最後に選んだ言語を learner 単位で保持し、複数端末で同期する。
   */
  uiLanguage?: 'ja' | 'zh';
  /** 承認済みアバターの private Storage オブジェクトパス（signed URLは保存しない・§PW-V1） */
  avatarObjectPath?: string;
  /** プレビュー待ち候補のオブジェクトパス（管理者が登録・本人が承認/作り直しを選ぶ） */
  pendingAvatarObjectPath?: string;
  /** アバター確認状態 */
  avatarReviewStatus?: 'none' | 'pending' | 'approved' | 'revision_requested';
  avatarUpdatedAt?: string;
  /** サインアップ時の招待コード（Edge Function側でSecretと照合） */
  inviteCode?: string;
  /**
   * 「もう一度復習したい」と本人が選んだ表現（missionId）。復習記録ページで使う。
   * 既存 settings(jsonb) への追加フィールド＝新規テーブル不要・非破壊。
   */
  practiceAgainIds?: string[];
  /**
   * Adventure V2 プロファイル（learner単位feature flag込み・D-003/D-004）。
   * 未定義 = V2未使用（従来Home）。型は adventure/advTypes.ts の AdventureV2Profile。
   * jsonbへの追加フィールド＝migration不要・既存learner非破壊。
   */
  adventureV2?: unknown;
}

export interface AdminOverrides {
  nextMissionId?: string | null;
  priorityItemIds?: string[];
  note?: string;
  /** この生徒だけ月次上限を変える（VIP対応など）。未指定なら ai_config の既定値 */
  monthlyMaxSessions?: number;
  monthlyMaxSeconds?: number;
}

export interface Learner {
  id: string;
  userId: string;
  /** コース開始日（ISO）。30日後復習をコース期間内に収めるかの判定に使う */
  startedAtISO: string | null;
  displayName: string;
  preferredLanguage: 'ja' | 'zh';
  estimatedLevel: string;
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  currentWeek: number;
  isActive: boolean;
  hearing: Record<string, unknown>;
  settings: LearnerSettings;
  adminOverrides: AdminOverrides;
}

export interface ItemProgress {
  itemId: string;
  masteryState: CourseMasteryState;
  masteryScore: number;
  firstLearnedAt: string;   // ISO
  lastPracticedAt: string;  // ISO
  nextReviewAt: string | null; // YYYY-MM-DD
  reviewStage: ReviewStage;
  successfulReviews: number;
  failedReviews: number;
}

/** セッションごとの発話メトリクス（成長計算の材料。DB: ai_learning_sessions.speech_metrics） */
export interface SpeechMetrics {
  studentTurns: number;
  totalStudentChars: number;
  longestAnswerChars: number;
  roundtrips: number;
  gaveReason: boolean;
  askedBack: boolean;
}

export interface CourseSessionRecord {
  id: string;
  missionId: string;
  mode: 'voice' | 'text';
  lessonKind: LessonKind;
  difficulty: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  completionStatus: 'in_progress' | 'completed' | 'interrupted' | 'error';
  endReason: string | null;
  targetExpression: string;
  targetUsed: boolean;
  targetUsedIndependently: boolean;
  hintsUsed: number;
  chineseSupportUsed: boolean;
  errorCode: string | null;
  estimatedCostUsd: number;
  report: LessonReport | null;
  /** 成長計算の材料（完了時に算出して保存。古いセッションは undefined） */
  speechMetrics?: SpeechMetrics;
}

export interface CourseUtterance {
  speaker: 'student' | 'tutor' | 'system';
  transcript: string;
  atMs: number;
  isFinal: boolean;
  relatedTarget: boolean;
}

/** ai-lesson-report が返す構造化レポート */
export interface LessonReport {
  todaySummaryJa: string;
  todaySummaryZh: string;
  achievements: string[];
  corrections: { original: string; improved: string; noteZh: string }[];
  naturalPhrases: string[];
  targetUsage: 'self' | 'hint' | 'none';
  encouragementJa: string;
  /** 中国語補助（UX-004）。旧sessionには無いためoptional。欠損時はja表示のみにfallback */
  achievementsZh?: string[];
  encouragementZh?: string;
}

/** 今日のレッスンプラン（復習1＋新規1を基本に3〜4分へ収める） */
export interface LessonPlanStep {
  mission: Mission;
  kind: LessonKind;
  /** 7日後・30日後復習・週間総合実践では目標表現名を先に見せない */
  hideTarget: boolean;
  /**
   * 週間総合実践で扱う表現（2〜4個、苦手優先）。
   * 名前は最初に全部見せず、会話の中で自然に使わせる。
   */
  weeklyTargets?: Mission[];
}

export interface LessonPlan {
  /** ウォームアップ復習（あれば。1項目のみ） */
  review: LessonPlanStep | null;
  /** メイン（新規 or 期日復習） */
  main: LessonPlanStep;
  reasonKey: string; // 選定理由（overdue_review/due_review/weak_item/next_new/admin_override/weekly）
}

export interface FeedbackInput {
  difficultyRating: 'too_easy' | 'just_right' | 'too_hard';
  speedRating?: 'too_fast' | 'ok' | 'too_slow';
  zhSupportRating?: 'want_more' | 'ok' | 'want_less';
  remembered?: boolean;
  comment?: string;
}
