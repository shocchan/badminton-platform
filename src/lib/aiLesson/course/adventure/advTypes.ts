// Adventure V2 の型定義（§3〜§16の契約）。
// 原則: 目的地は本人が選ぶ／現在地は診断で測る／今日の一歩はAIが決める。
// JLPTレベル（知識）と会話力は別能力として厳密に分離する（§9・§34）。
import type { AdvTeacherId } from './advTeacher';

/** 冒険の目的（§4）。既存schemaに該当命名がないため新設（D-005） */
export type AdvGoalType = 'jlpt' | 'conversation' | 'hybrid';

/** JLPT目標レベル。architectureは5段、今回選択UIに出すのは N3/N2 のみ（§5・D-006） */
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
// 2026-08-18: N5/N4 を解禁（CEO指示）。実測の在庫は
// 文法148項目（N5=62 / N4=86・出題471問）・語彙1,989語（N5=468 / N4=1,521）・読解96セット。
// **聴解は N5/N4 の音源が0本**なので、聴解stepは出ない（listeningBank が空を返す）。
// N1は教材が無いので今後追加予定のまま。
export const ACTIVE_TARGET_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2'];
export const FUTURE_TARGET_LEVELS: JlptLevel[] = ['N1'];

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
  /** 初級文法（N5/N4）の束ID（n5g-unit-* / n4g-unit-*）。個別IDは実行時に展開 */
  basicUnits?: string[];
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
  /**
   * この回で間違えた問題キー（错题本の材料・2026-08-17追加）。
   * **配列が存在すること自体が「正誤を記録した試行」の印**。全問正解でも [] を入れること。
   * undefined は旧データ＝正誤不明で、错题本は「未確認」として扱う（正解したと推定しない）
   */
  wrongKeys?: string[];
  /**
   * この回は**プールが未出問題を規定割合そろえられなかった**（2026-08-18 P0）。
   * true のとき攻略判定の unseenRatio 条件を免除する。詳細は advBattle.Encounter.unseenCapped。
   * 旧データには無い（undefined＝従来どおり条件を課す）
   */
  unseenCapped?: boolean;
  /**
   * 途中でやめた試行（2026-08-18 監査P1「実行中の離脱口が無い」の対応で追加）。
   * 解いたぶんだけを記録するので、錯題本の材料としては通常どおり使うが、
   * **攻略の証拠には数えない**（isQualifyingAttempt が false を返す）。
   * 2問だけ正解して抜ければ80%達成、という抜け道を作らないため。
   */
  partial?: boolean;
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
  level: 'N5' | 'N4' | 'N3' | 'N2';
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
  level: 'N5' | 'N4' | 'N3' | 'N2';
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
  /**
   * 間違えた問題の解説（2026-08-25）。**あとから読み返すためだけ**に持つ。
   * 準備度・mastery には一切使わない（それらは wrongKeys 経由で台帳が持っている）。
   * 新しい数回ぶんだけ入り、古い回では undefined になる（appendMockLog）
   */
  wrong?: import('./advMockSession').MockWrongDetail[];
}

/** 人間レッスンbridge（§20・D-013）。カレンダー連携なし */
export interface AdvHumanLessonState {
  nextHumanLessonAt?: string | null;
  teacherFocusNotes?: string;
  /** 学習者が次のレッスンで相談したいこと */
  learnerTopics?: string[];
}

/** つづけた日（2026-08-19）。祝いのみ: 途切れても責めない・「失った」を出さない
 *（advReviewForecast の設計原則に従う）。過去分は偽造しない:
 * 初期値は直近履歴（questLog∪mastery。間引きで過小方向にしかズレない）から数え、以後は毎日実測で更新 */
export interface AdvStreakState {
  /** いま続いている日数（>=1） */
  current: number;
  /** これまでの最長（seed時は current と同値から開始） */
  best: number;
  /** 最後に活動を計上した日 YYYY-MM-DD（dateKeyOfと同じローカル日付キー） */
  lastActiveKey: string;
}

/** learner設定(jsonb)内に保存するV2プロファイル全体（D-003・migration不要） */
/** かな道場の進行状態（2026-08-15。超初心者の前提スキル・mastery台帳には入れない） */
export interface AdvKanaState {
  /** null＝卒業チェック未実施 / true＝道場で学習中 / false＝卒業（読める） */
  needed: boolean | null;
  /**
   * 修了した行。2026-08-18 の拡張で全43行になった（226項目）:
   * ひらがな h-1〜h-10 / hd-1〜hd-5（濁音）/ hy-1〜hy-5（拗音）、
   * カタカナ k-1〜k-10 / kd-1〜kd-5 / ky-1〜ky-5、
   * w-sokuon（促音）/ w-chouon-k / w-chouon-h（長音）。
   */
  doneRowIds: string[];
  checkedAt: string | null;
}

export interface AdventureV2Profile {
  schemaVersion: 1;
  /** learner単位feature flag（§2・D-004） */
  enabled: boolean;
  goalType: AdvGoalType | null;
  targetJlpt: JlptLevel | null;
  /**
   * 本人が申告した現在のレベル（2026-08-23・会話目標のみ）。
   *
   * 診断12問は語彙にN2の問題を持たないため、**N1合格者とN3後半の人を区別できない**
   * （帯が n3_late で頭打ちになる）。会話カリキュラムのどこから始めるかは
   * 推定するより本人に聞いたほうが正確なので、会話目標では1問だけ聞く。
   * 「わからない」を選んだ人は null のまま診断へ回る。
   * 先生は管理画面から現在地を調整できるので、申告がずれても直せる。
   */
  declaredJlpt: 'N1' | 'N2' | 'N3' | null;
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
   * つづけた日（祝い専用・2026-08-19）。null＝未記録（初回の活動時に履歴からseedする）。
   * 攻略・mastery・準備度には一切影響しない。途切れても「失った」とは表示しない
   */
  streak: AdvStreakState | null;
  /**
   * 帰化面接の表現特訓。enabledAt が null なら未発行＝画面に出さない。
   * 模擬面接はアプリでやらない（CEOの授業で行う）。アプリは表現の特訓と記録だけ
   */
  interviewPrep: import('./interview/advInterview').InterviewPrepState;
  /**
   * 個人復習パック（自分の書いた文章から復習する・2026-08-24）。
   * 先生が learner ごとに発行する＝この配列はその人専用。空なら画面に出さない。
   * **冒険（route/mastery/skills/xp/streak）には一切影響しない**（advPersonalPack.ts 冒頭）
   */
  personalPacks: import('./personal/advPersonalPack').PersonalPack[];
  /** 個人復習パックの本人の記録（答えた回数・連続正解・次の復習日） */
  personalPack: import('./personal/advPersonalPack').PersonalPackState;
  /**
   * 先生からの一言（週1・2026-08-17）。管理画面から追記し、生徒のホームに出す。
   * 発行キー（先生が書いたものを生徒側の保存で消さない）なので
   * ai_save_learner_settings の保護対象に入れてある
   */
  teacherNotes: import('./advTeacherNote').AdvTeacherNote[];
  humanLesson: AdvHumanLessonState;
  /**
   * つまずき救済の一時スキップ（2026-08-22 配線）。
   * 同じ束で別日5回不合格の人が「3日だけ置いて先へ進む」を選んだ記録。
   * returnDateKey を過ぎたものは activeStuckSkips が自動で落とすので、解除処理は要らない。
   * **永久スキップは型として作れない**＝合格水準は下がらない
   */
  stuckSkips: import('./advStuckRescue').StuckSkipState[];
  createdAt: string;
  updatedAt: string;
}

/** 表示用ラベル（レベル断定を避ける・§6/§16の文言はここに集約） */
/**
 * AI会話をこの人に出すか（CEO決定 2026-08-22）。
 *
 * **N5・N4を目標にした人には出さない。** 会話は先生が人の授業でやる。
 * 理由: 語彙・文法・読解・聴解は初級まで作り込んであるが、AI会話の中身は
 * その水準に届いていない。届いていないものを毎日の冒険に混ぜると、
 * 生徒の時間を薄いところに使わせることになる（原則13: 無いものを有るふりをしない）。
 *
 * 会話そのものを目的に選んだ人（goalType='conversation'）は目標レベルを持たないので対象外。
 * この判定は ルート生成（会話stageを入れない）・今日の冒険（会話stepを出さない）・
 * オンボーディングの案内文 の3か所で使う。増やすときは必ずここを通すこと。
 */
export const aiConversationAvailable = (
  goalType: AdvGoalType, targetJlpt: JlptLevel | null,
): boolean => goalType === 'conversation' || (targetJlpt !== 'N5' && targetJlpt !== 'N4');

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
