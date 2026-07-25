// AI日本語学習デモの型定義
// MVP段階: 保存はlocalStorage（repository.ts）。将来SupabaseへそのままマップできるようDBを意識した形にしている。

/** ヒアリング6問の回答 */
export interface HearingAnswers {
  goal: 'daily' | 'exchange' | 'n3' | 'n2' | 'n1' | 'work';
  level: 'belowN4' | 'n4' | 'n3' | 'n2' | 'n1' | 'unknown';
  struggle: 'recall' | 'grammar' | 'vocab' | 'listening' | 'nervous' | 'explain';
  scene: 'daily' | 'badminton' | 'friends' | 'work' | 'interview' | 'presentation';
  correction: 'summary' | 'important' | 'immediate';
  zhSupport: 'whenStuck' | 'grammar' | 'often' | 'none';
}

/** 目標表現（レッスンで使わせたい文型） */
export interface TargetExpression {
  /** 表示用: 「〜ようになりました」 */
  label: string;
  /** ユーザー発話内での検出用パターン（正規表現） */
  detect: RegExp;
  /** 例文（ja） */
  example: string;
  /** 中国語での意味説明 */
  zhMeaning: string;
  /** 例文の中国語訳 */
  zhExample: string;
}

/** ルールベースで生成する個別学習プラン */
export interface LearningPlan {
  mainGoal: HearingAnswers['goal'];
  estimatedLevel: string; // 表示用（例: N3相当）
  priorityIssueKeys: string[]; // 辞書キー3件
  weeklySessions: number;
  sessionMinutes: number;
  allocation: { conversation: number; grammar: number; vocab: number; review: number };
  correction: HearingAnswers['correction'];
  zhSupport: HearingAnswers['zhSupport'];
  themeKey: string; // 今日のテーマ（辞書キー）
  target: TargetExpression;
}

/** チャットメッセージ */
export interface ChatMessage {
  role: 'tutor' | 'student';
  text: string;
  /** 中国語補足（あれば吹き出し内に併記） */
  zhNote?: string;
  kind?: 'normal' | 'hint' | 'correction' | 'praise' | 'phase';
}

/** レッスン内フェーズ（3分コース） */
export type LessonPhase = 'warmup' | 'teach' | 'talk' | 'wrapup';

/** レッスン中に学んだ・使った表現の記録 */
export interface ExpressionRecord {
  label: string;
  zhMeaning: string;
  /** self=自力使用 / hint=ヒントあり使用 / learned=理解のみ */
  usage: 'self' | 'hint' | 'learned';
}

/** 修正（言い直し）の記録 */
export interface CorrectionRecord {
  original: string;
  corrected: string;
  zhNote: string;
}

/** 1レッスンの結果（レポートの元データ） */
export interface SessionRecord {
  id: string;
  dateISO: string; // YYYY-MM-DD
  courseMinutes: number;
  elapsedSeconds: number;
  missionLabel: string;
  missionAchieved: boolean;
  expressions: ExpressionRecord[];
  corrections: CorrectionRecord[];
  earnedXp: number;
  xpBreakdown: { key: string; count: number; xp: number }[];
}

/** 累積進捗（将来students/progressテーブルへ） */
export interface ProgressState {
  totalXp: number;
  streakDays: number;
  lastLessonDateISO: string | null;
  totalLearned: number;
  totalSelfUsed: number;
  totalReviewSuccess: number;
}

/** 復習予定1件 */
export interface ReviewScheduleItem {
  dateISO: string;
  offsetDays: 1 | 3 | 7;
  expressions: string[];
}

/** 選択式の回答候補（チップ）。タップすると生徒の発話として送信される */
export interface QuickReply {
  text: string;
}

/**
 * チューターの1ターン分の出力。
 * テキストモード・音声モード共通の契約（音声モードでは messages を読み上げる）。
 */
export interface TutorTurn {
  messages: ChatMessage[];
  /** このターンで提示する回答候補。テキストモードはチップ表示、音声モードでは読み上げ or 画面表示 */
  quickReplies?: QuickReply[];
}

/**
 * レッスンセッションの状態（Realtime API 音声モード対応を見据えた共通モデル）。
 * テキスト/音声どちらのエンジンもこの状態を保持・更新する。
 * 音声モード専用の状態（マイク権限・WebRTC接続・無音検知タイマー等）はここに含めず、
 * 音声レイヤー側（将来の voiceSession.ts）で別途管理する。
 */
export interface LessonSessionState {
  // ── レッスンの設定（開始時に確定） ──
  themeKey: string;
  targetLabel: string;
  estimatedLevel: string;
  zhSupport: HearingAnswers['zhSupport'];
  correction: HearingAnswers['correction'];

  // ── 進行状態 ──
  phase: LessonPhase;
  /** 残り秒数はUI（タイマー）が管理し、フェーズ境界でエンジンに通知する */
  remainingSeconds: number | null;
  /** 現在の質問ID（テーマスクリプト内） */
  currentQuestionId: string | null;
  /** まとめへ入るべきか（残り30〜40秒 or 目標達成時にエンジンが立てる） */
  shouldWrapUp: boolean;

  // ── 学習の実績 ──
  targetUseCount: number;
  /** 初回の目標表現使用が自力かヒントありか（未使用は null） */
  targetUsage: 'self' | 'hint' | null;
  /** 現在の質問に対するヒント段階（0=未使用、1〜6=段階的サポート） */
  hintLevel: number;
  /** 沈黙回数（テキストモードでは常に0。音声モードで無音検知時に加算） */
  silenceCount: number;
  /** 中国語説明を行った回数 */
  zhExplainCount: number;
  /** テーマから外れた回数 */
  offTopicCount: number;
  /** まとめでの言い直しに成功したか */
  restatementDone: boolean;
}
