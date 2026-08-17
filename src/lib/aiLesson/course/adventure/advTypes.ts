// Adventure V2 の型定義（§3〜§16の契約）。
// 原則: 目的地は本人が選ぶ／現在地は診断で測る／今日の一歩はAIが決める。
// JLPTレベル（知識）と会話力は別能力として厳密に分離する（§9・§34）。
import type { AdvTeacherId } from './advTeacher';

/** 冒険の目的（§4）。既存schemaに該当命名がないため新設（D-005） */
export type AdvGoalType = 'jlpt' | 'conversation' | 'hybrid';

/** JLPT目標レベル。architectureは5段、今回選択UIに出すのは N3/N2 のみ（§5・D-006） */
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export const ACTIVE_TARGET_LEVELS: JlptLevel[] = ['N3', 'N2'];
export const FUTURE_TARGET_LEVELS: JlptLevel[] = ['N5', 'N4', 'N1'];

/** 内部能力軸（§9）。試験と会話を混ぜない */
export type AdvSkill =
  | 'vocabulary' | 'grammar' | 'reading' | 'listening'
  | 'conversation' | 'practical' | 'consistency';
export const ADV_SKILLS: AdvSkill[] = [
  'vocabulary', 'grammar', 'reading', 'listening', 'conversation', 'practical', 'consistency',
];

/** 証拠の量に応じた信頼度。noneは「未判定」を意味し、推測で高精度表示しない（§10） */
export type AdvConfidence = 'none' | 'low' | 'medium' | 'high';

export interface AdvSkillScore {
  /** 0-100。confidence='none' のとき表示禁止（未判定と出す） */
  currentScore: number;
  confidence: AdvConfidence;
  evidenceCount: number;
  lastAssessedAt: string | null;
  /** この能力の当面の目安レベル帯（表示用。断定しない） */
  band: AdvBand;
}

/**
 * レベル帯。「あなたはN3です」と断定せず「開始地点はN3エリア」の表現に使う（§6）。
 * needs_assessment = 既存データから正確に判断できない（§23）
 */
export type AdvBand =
  | 'needs_assessment' | 'pre_n5' | 'n5' | 'n4' | 'n4_late'
  | 'n3_early' | 'n3' | 'n3_late' | 'n2_early' | 'n2' | 'n2_plus';

export type AdvSkillProfile = Record<AdvSkill, AdvSkillScore>;

/** 診断結果（§10）。不能項目は unknown/needs_assessment のまま保持する */
export interface AdvDiagnosisResult {
  completedAt: string;
  /** 知識ランク（語彙・文法の帯） */
  knowledgeBand: AdvBand;
  /** 会話の開始地点の帯（知識と分離・§6） */
  conversationBand: AdvBand;
  vocabularyGapIds: string[];
  grammarGapIds: string[];
  listeningConfidence: AdvConfidence;
  /** 中国語補助の必要量（既存 zhSupport と同じ語彙） */
  supportNeed: 'none' | 'whenStuck' | 'grammar' | 'often';
  recommendedStartAreaId: string;
  routeExplanationJa: string;
  routeExplanationZh: string;
  /** 診断で実際に解いた問題キー（未出判定・再診断の重複回避に使う） */
  askedQuestionKeys: string[];
  /** 会話診断を実施したか（skipした場合 conversation は needs_assessment のまま） */
  conversationSampled: boolean;
  /** 先生が現在地を調整した日時（2026-08-17）。AIの実測値と先生の判断を混同させない */
  adjustedByTeacherAt?: string;
  /** 先生調整の前にAIが測っていた帯（記録として残す） */
  bandBeforeTeacherAdjust?: AdvBand;
}

/** 攻略ルートの stage 種別（§5・§11） */
export type AdvStageKind =
  | 'foundation_camp'   // 基礎キャンプ（foundation語彙・基礎単元）
  | 'n3_bridge'         // N3語彙・文法の橋
  | 'n3_practice'       // N3実践ミッション（単元）
  | 'n3_grammar'        // N3文法攻略（カタチの遺跡）
  | 'n2_gate'           // N2の門（N3総仕上げ・中ボス）
  | 'n2_grammar'        // N2語彙・文法（ソラノ塔）
  | 'reading_listening' // 読解・会話理解
  | 'mock_boss'         // 模擬ボス（ランクボス）
  | 'conversation_start'// 会話開始地点（カタリ港ほか）
  | 'conversation_growth'; // 会話力の成長ステージ

export interface AdvRouteStage {
  stageId: string;
  kind: AdvStageKind;
  /** worldAtlas の areaId（Map表示の経由地・§21） */
  areaId: string;
  titleJa: string; titleZh: string;
  purposeJa: string; purposeZh: string;
  /** stage が攻略対象とする実コンテンツID（unitId / grammarId / n2 unit番号 / contextの束） */
  targets: AdvStageTargets;
  /** 攻略条件の表示文（§21） */
  clearConditionJa: string; clearConditionZh: string;
}

export interface AdvStageTargets {
  n3UnitIds?: string[];
  n3GrammarIds?: string[];
  /** N2は12単元束で持つ（1〜12）。個別IDは実行時に展開 */
  n2Units?: number[];
  vocabularyIds?: string[];
  conversationThemeIds?: string[];
}

export interface AdvRoute {
  generatedAt: string;
  /** 最終目的地（本人が選んだ目標。AIが勝手に変えない・§5） */
  destinationJlpt: JlptLevel | null;
  destinationAreaId: string;
  destinationLabelJa: string; destinationLabelZh: string;
  stages: AdvRouteStage[];
  /** 「なぜこのルートか」（基礎補強を恥にしない文・§5） */
  explanationJa: string; explanationZh: string;
}

/** バトルの敵種別（§14） */
export type AdvEnemyTier = 'normal' | 'strong' | 'midboss' | 'rankboss';

/** 80%攻略台帳（§15）。1回の高得点で攻略にしない */
export interface AdvMasteryAttempt {
  /** JST日付キー YYYY-MM-DD（別日判定） */
  dateKey: string;
  scorePct: number;
  /** この回で初出だった問題の割合（問題ID暗記の除外・§15） */
  unseenRatio: number;
  questionKeys: string[];
  tier: AdvEnemyTier;
  timed: boolean;
  completedAt: string;
  /** この試行が鍛えた試験科目（ASSESSMENT INTEGRITY §10）。旧データには無い */
  skills?: string[];
  /** 試験科目別の正誤・未出数（準備度をskill別に出すための証拠・§9） */
  bySkill?: Record<string, { correct: number; total: number; unseen: number }>;
}

/** targetId（unitId / grammarId / stage束ID）→ 試行履歴 */
export type AdvMasteryLedger = Record<string, AdvMasteryAttempt[]>;

export type AdvMasteryState =
  | 'not_started' | 'in_progress'
  | 'cleared_pending_delay'   // 別日3回80%達成・7日後の遅延確認待ち
  | 'mastered';               // 遅延確認も80%以上

/** 今日の冒険（§13）。生成結果は必ず why / 所要 / 成功条件 / 次 を持つ */
export interface AdvQuestStep {
  kind: 'review_due' | 'weak_reinforce' | 'grammar_new' | 'vocab_new'
      | 'battle' | 'reading_short' | 'listening_practice' | 'conversation_mission' | 'restate'
      | 'kana_dojo';
  refIds: string[];
  titleJa: string; titleZh: string;
  estMinutes: number;
  /** battle の場合の敵種別 */
  tier?: AdvEnemyTier;
}

export interface AdvTodayQuest {
  questId: string;
  dateKey: string;
  goalType: AdvGoalType;
  /** 主対象ID（完了時に lastQuest.primaryTargets へ保存＝翌日の重複回避） */
  primaryTargets: string[];
  steps: AdvQuestStep[];
  whyJa: string; whyZh: string;
  estimatedMinutes: number;
  targetSkills: AdvSkill[];
  targetExpressions: string[];
  successConditionJa: string; successConditionZh: string;
  nextStepJa: string; nextStepZh: string;
}

/** 旅の相棒（§8・D-010）。正式キャラ: ナツ（猫）／ハル（鳥）／アキ（犬）（CEO決定 2026-08-14）。
 * 教材分岐はしない＝声掛け・労いのみ。旧ID（nami/fukuro/kaji）は advProfile 側で移行する */
export type AdvCompanionId = 'natsu' | 'haru' | 'aki';
export interface AdvCompanionDef {
  id: AdvCompanionId;
  nameJa: string; nameZh: string;
  roleJa: string; roleZh: string;
  /** クエスト構成用に予約（現在は未使用・声掛け・労いのみ相棒で変わる） */
  emphasis: { conversation: number; knowledge: number; practical: number };
  /** Homeの毎日の声掛け */
  greetJa: string; greetZh: string;
  /** 今日の冒険を締めくくったときの労い */
  doneJa: string; doneZh: string;
  /** バトル勝利（80%以上）のとき */
  cheerWinJa: string; cheerWinZh: string;
  /** 問題を間違えたときの励まし（責めない・解説へ誘う） */
  cheerWrongJa: string; cheerWrongZh: string;
  /** 3問以上連続正解のとき */
  streakJa: string; streakZh: string;
  /** 復習が残っているときのHome声掛け（greetの代わりに出す） */
  reviewNudgeJa: string; reviewNudgeZh: string;
  /** 今週のまとめへの相棒コメント */
  weeklyJa: string; weeklyZh: string;
}

/**
 * 進行中のミニ模試の直列化状態（COMPLETION §9）。
 * reload・端末復帰で同じ問題・同じ提示順・同じ残り時間から再開するために保存する。
 * 型はプリミティブのみ（jsonbへそのまま入る）。
 */
export interface AdvMockSessionState {
  mockId: string;
  level: 'N2' | 'N3';
  /** 短時間版か本番時間版か（§9: 「本番同等」と偽らないため明示的に分ける） */
  mode: 'short' | 'fullTime';
  attemptSeed: number;
  startedAt: string;
  sectionIndex: number;
  /** sectionごとの残り秒。タイマーは保存値から再開する */
  remainingSecBySection: number[];
  /** questionKey → choiceId（未回答はキー無し） */
  answers: Record<string, string | null>;
  completedSections: string[];
  finishedAt: string | null;
}

/** 完了したミニ模試1回分の記録（§10: 総合準備度は模試3回以上を要求する） */
export interface AdvMockLogEntry {
  mockId: string;
  dateKey: string;
  level: 'N2' | 'N3';
  mode: 'short' | 'fullTime';
  totalCorrect: number;
  totalQuestions: number;
  totalUnanswered: number;
  /** 制限時間内に終えたsection数／全section数 */
  sectionsFinishedInTime: number;
  sectionCount: number;
  /** この回で扱った試験科目 */
  skills: string[];
  completedAt: string;
}

/** 人間レッスンbridge（§20・D-013）。カレンダー連携なし */
export interface AdvHumanLessonState {
  nextHumanLessonAt?: string | null;
  teacherFocusNotes?: string;
  /** 学習者が次のレッスンで相談したいこと */
  learnerTopics?: string[];
}

/** learner設定(jsonb)内に保存するV2プロファイル全体（D-003・migration不要） */
/** かな道場の進行状態（2026-08-15。超初心者の前提スキル・mastery台帳には入れない） */
export interface AdvKanaState {
  /** null＝卒業チェック未実施 / true＝道場で学習中 / false＝卒業（読める） */
  needed: boolean | null;
  /** 修了した行（h-1〜h-10, k-1〜k-10） */
  doneRowIds: string[];
  checkedAt: string | null;
}

export interface AdventureV2Profile {
  schemaVersion: 1;
  /** learner単位feature flag（§2・D-004） */
  enabled: boolean;
  goalType: AdvGoalType | null;
  targetJlpt: JlptLevel | null;
  examDateISO: string | null;
  weeklyDays: number | null;
  dailyMinutes: 5 | 15 | 30 | null;
  companionId: AdvCompanionId | null;
  /**
   * 案内の先生（Teacher Selection）。null は未選択。
   * 未選択learnerは既定（翔子先生）で表示され、保存値は書き換えない
   * ＝既存learnerのデフォルトを勝手に変更しない。
   */
  teacherId: AdvTeacherId | null;
  diagnosis: AdvDiagnosisResult | null;
  skills: AdvSkillProfile;
  route: AdvRoute | null;
  mastery: AdvMasteryLedger;
  /** 前日クエストの重複回避（§13） */
  lastQuest: { dateKey: string; primaryTargets: string[]; stepKinds: string[] } | null;
  /** 今日のステップ完了チェック（reload/端末間で復元・§25。攻略の正準はmastery台帳） */
  /** done=旧形式（添字・後方互換読み取り専用）/ doneKeys=安定キー（stepKeyOf）。新規保存はdoneKeysのみ */
  todaySteps: { dateKey: string; done: number[]; doneKeys?: string[] } | null;
  /** クエスト完了の連続性（consistency能力の証拠） */
  questLog: { dateKey: string; completedSteps: number; totalSteps: number }[];
  /**
   * 経験値の累計（2026-08-16）。努力の通貨＝上限なし・やった分だけ増える。
   * 攻略・mastery・準備度には一切影響しない（advXp.ts参照）
   */
  xp: number;
  /** 進行中のミニ模試（reload復帰用）。終了・破棄でnull */
  mockSession: AdvMockSessionState | null;
  /** 完了したミニ模試の履歴（§10の mock count >= 3 判定に使う） */
  mockLog: AdvMockLogEntry[];
  /**
   * 答案用紙（マークシート）。**問題文はアプリに置かない**（advAnswerSheet.ts 冒頭参照）。
   * 先生がWeChatで問題画像を個別に送り、learnerは答案だけをここへ記入する。
   * 用紙は先生が learner ごとに発行する（＝この配列はその人専用）。
   * 型は循環importを避けるため advAnswerSheet.ts 側で定義し、ここでは unknown 経由で持たない
   */
  /**
   * かな道場の状態（2026-08-15）。診断で超初心者（needs_assessment / pre_n5）と
   * 分かった人だけ初期化される。null＝対象外（かな学習は出ない）。
   * needed: null＝チェック未実施 / true＝道場が必要 / false＝卒業（チェック合格）
   */
  kana: AdvKanaState | null;
  answerSheets: import('./advAnswerSheet').AnswerSheetPaper[];
  /** 進行中の答案（reload復帰用）。提出・破棄で null */
  answerSheetSession: import('./advAnswerSheet').AnswerSheetSession | null;
  /** 提出済み答案の履歴（先生との振り返りに使う） */
  answerSheetLog: import('./advAnswerSheet').AnswerSheetResult[];
  /**
   * 帰化面接の表現特訓。enabledAt が null なら未発行＝画面に出さない。
   * 模擬面接はアプリでやらない（CEOの授業で行う）。アプリは表現の特訓と記録だけ
   */
  interviewPrep: import('./interview/advInterview').InterviewPrepState;
  humanLesson: AdvHumanLessonState;
  createdAt: string;
  updatedAt: string;
}

/** 表示用ラベル（レベル断定を避ける・§6/§16の文言はここに集約） */
export const BAND_LABELS: Record<AdvBand, { ja: string; zh: string }> = {
  needs_assessment: { ja: '未判定', zh: '尚未判定' },
  pre_n5: { ja: '基礎の入口', zh: '基础入门' },
  n5: { ja: 'N5帯', zh: 'N5段' },
  n4: { ja: 'N4帯', zh: 'N4段' },
  n4_late: { ja: 'N4後半', zh: 'N4后段' },
  n3_early: { ja: 'N3基礎の手前', zh: 'N3基础之前' },
  n3: { ja: 'N3帯', zh: 'N3段' },
  n3_late: { ja: 'N3後半', zh: 'N3后段' },
  n2_early: { ja: 'N2の入口', zh: 'N2入口' },
  n2: { ja: 'N2帯', zh: 'N2段' },
  n2_plus: { ja: 'N2以上', zh: 'N2以上' },
};

export const GOAL_LABELS: Record<AdvGoalType, { ja: string; zh: string }> = {
  jlpt: { ja: 'JLPTに合格したい', zh: '我想通过JLPT考试' },
  conversation: { ja: '日本語をもっと話せるようになりたい', zh: '我想提高日语会话能力' },
  hybrid: { ja: 'JLPTも会話も伸ばしたい', zh: '我想同时提高JLPT成绩和会话能力' },
};
