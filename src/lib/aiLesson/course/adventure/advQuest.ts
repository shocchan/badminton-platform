// 今日の冒険の生成（§13）。第一CTAは常に一つ。
// 優先順位: ①期限切れ/当日復習 ②最大の弱点 ③試験日残 ④未習得の目標教材 ⑤会話転用 ⑥多様性 ⑦前日重複回避。
// 生成結果は必ず why / 所要 / 対象能力 / 対象表現 / 成功条件 / 次の一歩 を持つ。
import type {
  AdvGoalType, AdvQuestStep, AdvRoute, AdvRouteStage, AdvSkill, AdvTodayQuest, AdventureV2Profile, JlptLevel } from './advTypes';
import { seededShuffle } from './advDiagnosis';
import { currentStageOf } from './advRoute';
import { masteredStageIds, PASS_LABEL } from './advMastery';
import { isKanaGraduated, isKanaReadable, kanaRowsPerDay, todaysKanaRowIds, kanaRowById } from './advKana';

export interface QuestContentAvailability {
  /** stage内で未攻略のgrammarId（学習順） */
  nextGrammarIds: string[];
  /** stage内で未攻略のunitId */
  nextUnitIds: string[];
  /** 今日の対象にできる会話テーマ（targetUse表現つき） */
  conversationTargets: { refId: string; expression: string; themeJa: string; themeZh: string }[];
  /** grammarId → mastery束ID（N3はn3g-unit-*）。無指定時は項目IDのまま */
  grammarBundleByItem?: Map<string, string>;
  /**
   * 7日後の確認が解禁されたtarget（2026-08-15 進度改善）。
   * 攻略を確定させる一手なので、今日のバトル枠を最優先で確認バトルにする
   */
  confirmTargetIds?: string[];
  /**
   * 今日の語彙バトルのtarget（vocab-n5/n4/n3/n2。2026-08-15 語彙配線）。
   * 語彙バンク約2,200語をデイリーループへ接続する。未指定なら語彙バトルは出ない
   */
  vocabBattleTargetId?: string | null;
  /**
   * 今日の漢字バトルの対象（2026-08-18 漢字カリキュラム新設）。
   * 漢字を教える場が無く「語彙問題の読み方として出るだけ」だったのを、
   * 字ごとに積み上げる導線として独立させた。無ければ null（存在するふりをしない）
   */
  kanjiBattleTargetId?: string | null;
  /**
   * ボスstage（模擬ボス・N2の門）の出題対象（2026-08-18 P0）。
   *
   * 現在地がボスstageのとき、**今日の一手をボス戦にする**ために使う。
   * これが無いと、ボスstageは配下コンテンツを全部攻略済みにしているので
   * learn も battle も出ず、今日の冒険が会話ミッションだけになる
   * （＝ボスに挑む手段が画面のどこにも無く、ルートが永久に未完了になる）。
   * 束ID・単元IDだけを渡すこと（stageIdはプールのキーではないので0問バトルになる）
   */
  bossBattleTargetIds?: string[];
}

/**
 * 目標レベルで出題できる語彙バンド（vocabQuestions.ts の VOCAB_SCOPE と同じ範囲）。
 *
 * ここに無いバンドをtargetにすると、出題プール（vocabSubsetPool）が空Mapを返し
 * 「出題できる問題がありません」の行き止まりになる。**vocabQuestions.ts を直接importすると
 * 語彙バンク約3,349語がHomeのchunkへ入ってしまう**ので、値はここに置き、
 * VOCAB_SCOPE と一致していることは vocab/vocabSubset.test.ts で機械的に固定する。
 */
// 2026-08-18: N5/N4 目標を解禁。目標より上のバンドは出さない
// （N5を目指す人にN3語を出すと、覚える必要のない語で日が埋まる）
export const VOCAB_BANDS_IN_SCOPE: Record<JlptLevel, readonly string[]> = {
  N5: ['vocab-n5'],
  N4: ['vocab-n5', 'vocab-n4'],
  N3: ['vocab-n5', 'vocab-n4', 'vocab-n3'],
  N2: ['vocab-n5', 'vocab-n4', 'vocab-n3', 'vocab-n2'],
  N1: ['vocab-n5', 'vocab-n4', 'vocab-n3', 'vocab-n2'],
};

/**
 * その学習対象を、いまの目標レベルで出題できるか。
 * 語彙以外のtargetIdは対象外＝そのまま true（判断しない）。
 *
 * 2026-08-18 監査P1: 目標をN2→N3へ変えると、台帳に残った `vocab-n2` が7日後に
 * 確認バトルの対象として選ばれ、N3スコープにはN2語が無いためプールが空になり、
 * その日の冒険が締めくくれなくなっていた。
 */
export const isVocabTargetInScope = (targetId: string, targetLevel: JlptLevel): boolean =>
  !targetId.startsWith('vocab-') || VOCAB_BANDS_IN_SCOPE[targetLevel].includes(targetId);

/**
 * 今日の語彙バトルのバンド（stage対応・日替わり）。
 * 基礎固め中はN5/N4を交互に、N3圏に入ったらN3語、N2文法期はN2/N3を交互に。
 * 会話stageでは出さない。
 * **目標レベルの範囲外のバンドは返さない**（プールが空＝押せないバトルになるため。
 * 目標をN2→N3へ変えた生徒にN2のstageが残っている場合に効く）
 */
export const vocabTargetForStage = (
  kind: AdvRouteStage['kind'], targetLevel: JlptLevel, dayNum: number,
): string | null => {
  if (kind === 'conversation_start' || kind === 'conversation_growth') return null;
  const band = (() => {
    if (kind === 'foundation_camp' || kind === 'n3_bridge') return dayNum % 2 === 0 ? 'vocab-n5' : 'vocab-n4';
    if (kind === 'n2_grammar') return dayNum % 2 === 0 ? 'vocab-n2' : 'vocab-n3';
    if (kind === 'mock_boss' && targetLevel === 'N2') return 'vocab-n2';
    return 'vocab-n3';
  })();
  if (isVocabTargetInScope(band, targetLevel)) return band;
  // 範囲外だったときの受け皿。従来は 'vocab-n3' 固定だったが、N5/N4 目標では
  // それ自体が範囲外になるため、目標に含まれる一番上のバンドへ落とす
  const inScope = VOCAB_BANDS_IN_SCOPE[targetLevel];
  return inScope[inScope.length - 1] ?? null;
};

export interface GenerateQuestInput {
  profile: AdventureV2Profile;
  route: AdvRoute;
  /**
   * 今日の復習として出せる**問題数**（2026-08-18 作り替え）。
   *
   * 以前は旧コースの会話ミッションの復習期限件数（ItemProgress）を渡していた。
   * ところが押した先は別データ（sessionStorageの語彙図鑑）で、V2の生徒では必ず0件になり、
   * しかもこの数が減らないので復習stepは永久に完了しなかった（監査P0・8件の根っこ）。
   * いまは「間違えた問題ノートの未克服のうち、実際に出題できる問題数」を渡す。
   * **表示する数と実際に出る数が同じ**になり、終われば必ず完了する。
   */
  reviewQuestionCount: number;
  weakGrammarIds: string[];
  dateKey: string;
  nowISO: string;
  availability: QuestContentAvailability;
  /** 試験日までの残日数（examDate未設定は null） */
  daysToExam: number | null;
  /** stage攻略の導出値（deriveMasteredStageIds）。未指定時は従来のledger[stageId]判定 */
  masteredStageIds?: Set<string>;
  /**
   * 学習コンテンツの供給元stage（pickContentStage。2026-08-15 進度改善）。
   * 現在stageが全て7日待ちのとき、先のstageを前倒しで学ぶために現在地と分離した。
   * 未指定時は従来どおり currentStageOf の結果を使う
   */
  contentStage?: AdvRouteStage;
  /**
   * 試験技能の状況（COMPLETION §12）。読解・聴解を毎日必ず入れるのではなく、
   * 弱点・試験日・直近履歴から配分するために使う。
   */
  examSkills?: {
    /** いま最も弱い試験科目（evidenceがある中で最低スコア。無ければnull） */
    weakestSkill: 'charactersVocabulary' | 'grammar' | 'reading' | 'listening' | 'timeManagement' | null;
    /** 各技能のevidence数（0なら「まだ触れていない」＝優先度が上がる） */
    readingEvidence: number;
    listeningEvidence: number;
    /** 出題可能な読解・聴解の対象ID（空なら出題しない＝存在するふりをしない） */
    readingTargetIds: string[];
    listeningTargetIds: string[];
  };
}

const est = (kind: AdvQuestStep['kind']): number =>
  kind === 'review_due' ? 3
  : kind === 'weak_reinforce' ? 4
  : kind === 'grammar_new' ? 5
  : kind === 'vocab_new' ? 4
  : kind === 'battle' ? 6
  : kind === 'reading_short' ? 5
  : kind === 'listening_practice' ? 5
  : kind === 'conversation_mission' ? 4
  : 2; // restate

const step = (
  kind: AdvQuestStep['kind'], refIds: string[], titleJa: string, titleZh: string,
  tier?: AdvQuestStep['tier'],
): AdvQuestStep => ({ kind, refIds, titleJa, titleZh, estMinutes: est(kind), tier });

/**
 * step完了記録の安定キー。
 * 完了は添字（何番目）でなくこのキーで保存する（2026-08-17 監査P0:
 * questは日中の状態変化（復習期限・確認バトル発生等）で並びが変わるため、
 * 添字保存だと未実施stepが勝手に完了扱いになる／完了が消えることがあった）
 */
export const stepKeyOf = (s: Pick<AdvQuestStep, 'kind' | 'refIds'>): string =>
  `${s.kind}:${(s.refIds ?? []).join('+')}`;

/** stageに応じた新規学習ステップ（±会話転用） */
const stageSteps = (
  stage: AdvRouteStage, avail: QuestContentAvailability, seed: number, dateKey: string,
): { learn: AdvQuestStep | null; battle: AdvQuestStep | null; conv: AdvQuestStep | null; expressions: string[] } => {
  // 文法束の学習は「いま攻略中の束」の中を日替わりで巡回する（2026-08-15 進度改善）。
  // 旧実装は常に先頭を選んでいたため、前日回避と合わさって先頭2項目のping-pongになり、
  // 束の3項目目以降が一度もlearnに出ないままバトルで80%を要求されていた
  const bundleOf = (x: string): string => avail.grammarBundleByItem?.get(x) ?? x;
  const activeBundle = avail.nextGrammarIds.length > 0 ? bundleOf(avail.nextGrammarIds[0]) : null;
  const bundleItems = activeBundle === null ? []
    : avail.nextGrammarIds.filter((x) => bundleOf(x) === activeBundle);
  const dayNum = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  const g = bundleItems.length > 0 ? bundleItems[dayNum % bundleItems.length] : avail.nextGrammarIds[0];
  const u = avail.nextUnitIds[0];
  const convPick = seededShuffle(avail.conversationTargets, seed)[0] ?? null;
  const isConvStage = stage.kind === 'conversation_start' || stage.kind === 'conversation_growth';

  if (isConvStage) {
    return {
      learn: convPick ? step('vocab_new', [convPick.refId], `表現の準備：${convPick.expression}`, `准备表达：${convPick.expression}`) : null,
      battle: null,
      conv: convPick
        ? step('conversation_mission', [convPick.refId], `AI会話：${convPick.themeJa}`, `AI会话：${convPick.themeZh}`)
        : step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务'),
      expressions: convPick ? [convPick.expression] : [],
    };
  }
  const learn = g
    ? step('grammar_new', [g], '新しい文法を学ぶ', '学习新语法')
    : u ? step('vocab_new', [u], '単元のことばを学ぶ', '学习单元词汇') : null;
  /**
   * バトルの対象は**出題プールを持つ学習対象**だけにする（2026-08-18 P0）。
   *
   * 以前は学習対象が尽きた日に `stage.stageId`（例 `stg-foundation`）へ落としていたが、
   * stageIdはプールのキーではないので **0問のバトル**になり、押すと
   * 「この対象にはまだ出題できる問題がありません」で終わる＝押しても何も起きない。
   * 実測: 4目標すべてで、確認待ちが重なる最後の1週間に4〜5日発生していた。
   * 対象が無い日はバトルを出さない（無いものを出せるふりをしない・原則13/15）。
   */
  const battleRef = g ? (avail.grammarBundleByItem?.get(g) ?? g) : u;
  return {
    learn,
    battle: battleRef ? step('battle', [battleRef], '問題バトル', '问题战斗', 'normal') : null,
    // 起動する会話は既存runtimeの今週ミッション（今日の文法をテーマにする接続は未実装）。
    // 「今日の文法を会話で使う」と掲げると実体と食い違うため、誇張しない題名にする（原則13）。
    // targetExpressions は言い直しstepが実際に使うので expressions はそのまま残す
    conv: convPick
      ? step('conversation_mission', [convPick.refId, ...(g ? [g] : [])], 'AI会話ミッション', 'AI会话任务')
      : null,
    expressions: convPick ? [convPick.expression] : [],
  };
};

/**
 * 今日の冒険を生成する（決定的: dateKey+profileでseed固定）。
 * dailyMinutes 5/15/30 で構成が変わる（§13の時間別テンプレに準拠しつつ固定メニュー化を避ける）。
 */
export const generateTodayQuest = (input: GenerateQuestInput): AdvTodayQuest => {
  const { profile, route, reviewQuestionCount, weakGrammarIds, dateKey, availability, daysToExam } = input;
  const minutes = profile.dailyMinutes ?? 15;
  const goalType: AdvGoalType = profile.goalType ?? 'jlpt';
  const seed = [...`${dateKey}:${profile.targetJlpt ?? goalType}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

  const done = input.masteredStageIds
    ?? masteredStageIds(profile.mastery, route.stages.map((s) => s.stageId), input.nowISO);
  const stage = input.contentStage
    ?? currentStageOf(route, done) ?? route.stages[route.stages.length - 1];

  // かな道場（2026-08-15）: 超初心者はまず、かなを読める状態にする。
  // **清音が読めるまで**は今日の冒険をかな道場1本に絞る
  // （読めない状態で単元・バトルを出しても3択総当たりになるだけ・原則13）。
  // 2026-08-18: 従来は全43行が終わるまで絞っていたため、ことばも文法も22日間出なかった。
  // 濁音・拗音・促音・長音は本編と並走させる（下の kanaSideStep）
  if (!isKanaReadable(profile.kana)) {
    const check = profile.kana?.needed === null;
    /** N3以上をめざす人（この人たちにとって「かなチェック」は目標と噛み合って見えない） */
    const upperTarget = profile.targetJlpt === 'N3' || profile.targetJlpt === 'N2' || profile.targetJlpt === 'N1';
    const rowIds = check ? ['check'] : todaysKanaRowIds(profile.kana, kanaRowsPerDay(profile.dailyMinutes ?? 15));
    const rowLabelJa = rowIds.map((id) => kanaRowById(id)?.labelJa ?? '').filter(Boolean).join('・');
    const rowLabelZh = rowIds.map((id) => kanaRowById(id)?.labelZh ?? '').filter(Boolean).join('・');
    const kanaStep: AdvQuestStep = {
      kind: 'kana_dojo', refIds: rowIds,
      titleJa: check ? 'かなチェック（もう読めるか確認）' : `かな道場（${rowLabelJa}）`,
      titleZh: check ? '假名检查（确认是否已经会读）' : `假名道场（${rowLabelZh}）`,
      estMinutes: check ? 3 : 8,
    };
    return {
      questId: `quest-${dateKey}`,
      dateKey, goalType,
      primaryTargets: rowIds,
      steps: [kanaStep],
      // 目標がN3以上の人にも、まだレベルを測っていなければ最初にかなチェックが出る（意図した設計）。
      // ただし「N2をめざす人にひらがな？」は誤作動に見えるので、理由をはっきり言う（2026-08-22 CEO実機指摘）
      whyJa: check
        ? (upperTarget
          ? `まだレベルを測っていないので、最初に読みの土台だけ確認します。読めればすぐ終わって、次から${profile.targetJlpt}の内容に入ります。`
          : 'まず、ひらがな・カタカナが読めるかを確認します。読めればこのステップはすぐ終わります。')
        : 'まず、ひらがな・カタカナを読める状態にします。ここが全部の土台です。',
      whyZh: check
        ? (upperTarget
          ? `还没有测过你的水平，所以先只确认阅读的地基。会读的话马上就结束，下一步就进入${profile.targetJlpt}的内容。`
          : '先确认你是否已经会读平假名和片假名。会读的话这一步马上就结束。')
        : '先把平假名和片假名练到会读。这是所有学习的地基。',
      estimatedMinutes: kanaStep.estMinutes,
      targetSkills: ['vocabulary'],
      targetExpressions: [],
      successConditionJa: check ? 'かなチェックを終える' : '今日の行を読めるようにする',
      successConditionZh: check ? '完成假名检查' : '把今天的行练到会读',
      nextStepJa: check ? '結果に合わせて、明日からの道を決めます' : '明日は次の行へ進みます',
      nextStepZh: check ? '根据结果决定明天开始的路线' : '明天继续下一行',
    };
  }
  const parts = stageSteps(stage, availability, seed, dateKey);

  /**
   * ボス戦（2026-08-18 P0）。学習コンテンツの供給元（contentStage）ではなく
   * **現在地**で判断する。N2の門のように、現在地がボスでも学習は先のstageから供給されるため。
   * 所要は編成そのまま（rankboss 20問×40秒／midboss 12問×35秒）を分で書く。誇張も過小申告もしない
   */
  const currentStage = currentStageOf(route, done) ?? stage;
  const bossTargets = availability.bossBattleTargetIds ?? [];
  const bossStep: AdvQuestStep | null =
    (currentStage.kind === 'mock_boss' || currentStage.kind === 'n2_gate') && bossTargets.length > 0
      ? {
        kind: 'battle',
        refIds: bossTargets,
        titleJa: `${currentStage.titleJa}に挑む（時間つき）`,
        titleZh: `挑战${currentStage.titleZh}（限时）`,
        estMinutes: currentStage.kind === 'mock_boss' ? 14 : 7,
        tier: currentStage.kind === 'mock_boss' ? 'rankboss' : 'midboss',
      }
      : null;
  /**
   * 読解stageが現在地か（2026-08-18 P0）。
   * このstageの攻略条件は読解の実績そのもの（stageMasteryTargetIds）なので、
   * 「未着手か・最弱か・試験が近いか」の配分ルールに関係なく毎日出す。
   * 出さないと読解の実績が積み上がらず、ルートがそこで永久に止まる
   */
  const readingIsTheStage = currentStage.kind === 'reading_listening';

  // 7日後の確認が解禁されたtargetがあれば、今日のバトルは確認バトルにする（攻略を確定させる一手が最優先）
  const isConvStageKind = stage.kind === 'conversation_start' || stage.kind === 'conversation_growth';
  const confirmTarget = (availability.confirmTargetIds ?? [])[0];
  if (confirmTarget && !isConvStageKind) {
    parts.battle = step('battle', [confirmTarget],
      '確認バトル（時間をおいた定着チェック）', '复查战（隔段时间的巩固检查）', 'normal');
  }

  // 語彙バトル（2026-08-15 語彙配線）。未出優先の出題で語彙バンクを日々歩く。
  // 15分: 3日に1回、文法バトルの代わりに（時間予算内・確認バトルが優先）
  // 30分: 毎日追加（確認バトルの日は積みすぎないので休み）
  const dayNum = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
  const vocabStep = !isConvStageKind && availability.vocabBattleTargetId
    ? step('battle', [availability.vocabBattleTargetId], '語彙バトル', '词汇战斗', 'normal')
    : null;
  /**
   * 漢字バトル（2026-08-18）。語彙バトルと**別の日**に出す（同じ日に両方積むと時間が溢れる）。
   * 5分設定では出さない（1日1バトルの枠は文法・語彙で埋まる）。
   */
  const kanjiStep = !isConvStageKind && availability.kanjiBattleTargetId && profile.dailyMinutes !== 5
    ? step('battle', [availability.kanjiBattleTargetId], '漢字バトル', '汉字战斗', 'normal')
    : null;
  // hybrid: 基礎キャンプ等のstageは文法draftを持たず conversationTargets が空になり、
  // ルート提示文「会話ミッションを毎日の冒険に組み込みます」が守れない（原則16）。
  // 会話stageと同じエリアfallbackで会話ミッションを必ず入れる
  if (goalType === 'hybrid' && !parts.conv) {
    parts.conv = step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务');
  }

  // 前日と同じ主対象の回避（§13⑦）は stageSteps の束内日替わり巡回が担う
  // （旧実装の「先頭以外へ差し替え」は先頭2項目のping-pongを生み、束の3項目目以降が
  //  一度もlearnに出ないバグの原因だった・2026-08-15 進度改善）

  const steps: AdvQuestStep[] = [];
  const push = (s: AdvQuestStep | null | undefined) => { if (s) steps.push(s); };

  /**
   * 清音は読めるが、濁音・拗音・促音・長音がまだ残っている人へ（2026-08-18）。
   * 本編と**並走**させて1日1行ずつ足す。ここを本編の前に置くのは、
   * 「が」「きょ」「っ」が読めないまま語彙・文法へ行くと、
   * 問題文そのものが読めずに総当たりになるため（原則13）。
   */
  if (!isKanaGraduated(profile.kana)) {
    const rowIds = todaysKanaRowIds(profile.kana, 1);
    const row = rowIds[0] ? kanaRowById(rowIds[0]) : null;
    if (row) {
      push({
        kind: 'kana_dojo', refIds: rowIds,
        titleJa: `かなの続き（${row.labelJa}）`,
        titleZh: `假名的后续（${row.labelZh}）`,
        estMinutes: 4,
      });
    }
  }

  // ── 試験技能（読解・聴解）の配分（COMPLETION §12） ──
  // 毎日必ず入れるのではなく「未着手 > 最弱 > 試験が近い」の順で必要なときだけ入れる。
  // 出題対象が無い場合は絶対に入れない（存在するふりをしない）。
  const ex = input.examSkills;
  const examCandidates = (): AdvQuestStep[] => {
    if (!ex || goalType === 'conversation') return [];
    // 基礎固め中（基礎キャンプ・N3橋）は**目標より上のレベルの**読解・聴解を出さない。
    // 診断で基礎不足と測った直後にN3長文を毎日出すのは「現在地はAIが測る」（canon§1）への裏切りになる。
    //
    // ただし **N5/N4を目標にした人の読解は基礎帯そのもの**（2026-08-18）。
    // ここで一律に外していたため、N5/N4ルートは stage が基礎キャンプ／N4文法しか無く、
    // 読解stepが**一度も出ない**（実測: 完走まで N5=52日・N4=103日、読解0回）。
    // 今日追加したN5/N4読解96セットが丸ごと死蔵されていた
    const basicTarget = profile.targetJlpt === 'N5' || profile.targetJlpt === 'N4';
    if (!basicTarget && (stage.kind === 'foundation_camp' || stage.kind === 'n3_bridge')) return [];
    const out: AdvQuestStep[] = [];
    const readingAvailable = ex.readingTargetIds.length > 0;
    const listeningAvailable = ex.listeningTargetIds.length > 0;
    const readingNeeded = readingAvailable
      && (readingIsTheStage || ex.readingEvidence === 0 || ex.weakestSkill === 'reading' || (daysToExam !== null && daysToExam < 60));
    const listeningNeeded = listeningAvailable
      && (ex.listeningEvidence === 0 || ex.weakestSkill === 'listening' || (daysToExam !== null && daysToExam < 60));
    // 未着手のほうを先に。両方未着手なら日替わりで交互にして偏らせない。
    //
    // 2026-08-18 修正: ここは以前 `日付 % 2 === 0`（＝偶数日に読解）だったが、
    // 15分設定の試験技能ゲートは `examDay = 日付 % 2 === 1`（＝奇数日）だった。
    // 2つの条件が排他なので、**読解と聴解の両方が必要な人には読解が永久に出ない**。
    // 実測（N2目標・15分・両方未着手）: 28日中 読解0日 / 聴解14日。
    // 隔日でしか試験技能が出ない15分設定でも交互になるよう、2日ぶんを1周期にする。
    // 30分設定（examDayゲート無し）でも 28日中14日ずつで均衡することを実測で確認済み。
    const alternate = Math.floor(dayNum / 2) % 2 === 0;
    const readingStep = step('reading_short', ex.readingTargetIds.slice(0, 1), '短文読解', '短文阅读');
    const listeningStep = step('listening_practice', ex.listeningTargetIds.slice(0, 1), '聴解トレーニング', '听力训练');
    // 読解stageが現在地の日は必ず読解を出す（そこが攻略条件そのものなので交互配分に譲らない）
    if (readingIsTheStage && readingNeeded) out.push(readingStep);
    else if (readingNeeded && listeningNeeded) out.push(alternate ? readingStep : listeningStep);
    else if (readingNeeded) out.push(readingStep);
    else if (listeningNeeded) out.push(listeningStep);
    return out;
  };
  const examStep = examCandidates()[0] ?? null;
  const examSkillStep = (): AdvQuestStep | null => examStep;
  // 試験技能のevidenceが全く無い、または最弱が読解・聴解なら文法より優先する
  const shouldPrioritizeExamSkill = (): boolean => {
    if (!ex) return false;
    if (ex.readingEvidence === 0 || ex.listeningEvidence === 0) return true;
    return ex.weakestSkill === 'reading' || ex.weakestSkill === 'listening';
  };

  // ① 復習は常に先頭（間違えた問題が残っている日だけ）。
  // 「件」ではなく**問**で書く。押すとこの数の問題がそのままバトルで出る
  if (reviewQuestionCount > 0) {
    push(step('review_due', [], `復習 ${reviewQuestionCount}問`, `复习 ${reviewQuestionCount}题`));
  }

  // 言い直しは素材がある日だけ入れる（基礎キャンプ等、文法誤答も会話表現も無い日は空stepになるため）
  const restateAvailable = weakGrammarIds.length > 0 || parts.expressions.length > 0;

  /**
   * ボス戦と、読解stageの読解stepは**どの学習時間設定でも必ず入れる**（2026-08-18 P0）。
   * ここが時間別テンプレの分岐に埋もれると「5分設定の人はボスに挑む手段が無い」等、
   * 設定によってルートを完走できない人ができる。所要は上でtierどおりに申告している。
   */
  const mustPushReading = readingIsTheStage && examStep?.kind === 'reading_short';
  if (minutes === 5) {
    // 5分: 復習＋弱点1つ or 新規のどちらか＋ミニ会話（会話goalのみ）。
    // バトルが一度も出ないと攻略（mastery）が永久に進まないため、奇数日はバトルを入れる
    const battleDay = Number(dateKey.slice(-2)) % 2 === 1;
    if (bossStep || mustPushReading) {
      push(bossStep ?? examStep);
      // 解禁済みの確認バトルは落とさない（落とすと、そのtargetの攻略が確定しないまま
      // 「今日の確認バトル」に出続ける。ボス待ちの間に予報だけが溜まる）
      if (confirmTarget && parts.battle) push(parts.battle);
    } else if (battleDay && parts.battle) push(parts.battle);
    else if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 1), '弱点を1つつぶす', '攻克1个弱点'));
    else push(parts.learn);
    if (goalType !== 'jlpt') push(parts.conv);
  } else if (minutes === 15) {
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 2), '弱点補強', '弱点补强'));
    push(parts.learn);
    if (bossStep) push(bossStep);
    if (mustPushReading) push(examStep);
    // 15分では文法と試験技能のどちらかを入れる（両方入れると時間超過する）。
    // ただし語彙・文法のevidenceはバトルからしか入らないため、試験技能を常に優先すると
    // 「バトルが出ない→語彙/文法が未測定→読解/聴解が常に最弱→バトル永久排除」の循環が確定する。
    // 試験技能は奇数日に限定し、バトルを少なくとも隔日で必ず回す。
    const examDay = Number(dateKey.slice(-2)) % 2 === 1;
    if (mustPushReading || bossStep) {
      // 上で入れたぶんで今日の枠は埋まっている。ただし解禁済みの確認バトルだけは落とさない
      if (confirmTarget && parts.battle) push(parts.battle);
    } else if (examDay && examSkillStep() && shouldPrioritizeExamSkill()) push(examSkillStep());
    // 3日に1回は語彙バトル（確認バトルの日と、文法バトルが無い日はそちらを優先/代替）
    else if (vocabStep && !confirmTarget && (dayNum % 3 === 2 || !parts.battle)) push(vocabStep);
    // 3日に1回は漢字バトル（2026-08-18）。語彙とは別の日に置いて時間を溢れさせない
    else if (kanjiStep && !confirmTarget && dayNum % 3 === 1) push(kanjiStep);
    else push(parts.battle);
    if (goalType !== 'jlpt' || parts.expressions.length > 0) push(parts.conv);
    if (restateAvailable) push(step('restate', [], '言い直し', '改口练习'));
  } else {
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 3), '弱点補強', '弱点补强'));
    push(parts.learn);
    if (bossStep) push(bossStep);
    push(parts.battle);
    if (vocabStep && !confirmTarget) push(vocabStep);
    // 30分枠でも漢字は隔日にする（毎日だと文法・語彙・読解・会話と合わせて時間が溢れる）
    if (kanjiStep && !confirmTarget && dayNum % 2 === 0) push(kanjiStep);
    push(examSkillStep());
    push(parts.conv);
    if (restateAvailable) push(step('restate', [], '言い直し', '改口练习'));
  }

  // 空クエスト防止: 最低1ステップ（コンテンツ枯渇時は復習/会話へ）
  if (steps.length === 0) push(step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务'));

  const estimatedMinutes = steps.reduce((n, s) => n + s.estMinutes, 0);
  // 成功条件は実際に計測できることだけを言う（会話中の「表現使用」は判定していない・原則13）
  const hasConv = steps.some((s) => s.kind === 'conversation_mission');
  const targetSkills: AdvSkill[] = stage.kind === 'conversation_start' || stage.kind === 'conversation_growth'
    ? ['conversation', 'vocabulary']
    : goalType === 'hybrid' ? ['grammar', 'conversation'] : ['grammar', 'vocabulary'];

  const why = buildWhy(goalType, stage, reviewQuestionCount, weakGrammarIds.length, daysToExam);

  return {
    questId: `quest-${dateKey}`,
    dateKey,
    goalType,
    primaryTargets: [...new Set(steps.flatMap((s) => s.refIds))].slice(0, 4),
    steps,
    whyJa: why.ja, whyZh: why.zh,
    estimatedMinutes,
    targetSkills,
    targetExpressions: parts.expressions,
    // 今日のゴールは**実装している完了条件**をそのまま書く（2026-08-18 監査P2）。
    // stepの✓はバトルを最後まで解いた時点で付く（点数は問わない）。
    // 80%は「攻略が1日ぶん進む」条件（別日3回＋遅延確認で攻略・advMastery）なので、
    // 達成の条件ではなく“伸びる条件”として添える。旧文言は0%でも✓が付く実装と食い違っていた
    successConditionJa: (parts.battle ?? bossStep)
      ? (hasConv
        ? `バトルを最後まで解き、AI会話を1回終える（${PASS_LABEL.ja}なら攻略が1日ぶん進みます）`
        : `バトルを最後まで解く（${PASS_LABEL.ja}なら攻略が1日ぶん進みます）`)
      : (hasConv ? 'AI会話を1回終える' : '今日のstepをすべて終える'),
    successConditionZh: (parts.battle ?? bossStep)
      ? (hasConv
        ? `把战斗做到最后，并完成一次AI会话（拿到${PASS_LABEL.zh}，攻略就前进一天）`
        : `把战斗做到最后（拿到${PASS_LABEL.zh}，攻略就前进一天）`)
      : (hasConv ? '完成一次AI会话' : '完成今天的所有步骤'),
    nextStepJa: '明日は今日の復習から始まります',
    nextStepZh: '明天从复习今天的内容开始',
  };
};

const buildWhy = (
  goal: AdvGoalType, stage: AdvRouteStage, due: number, weak: number, daysToExam: number | null,
): { ja: string; zh: string } => {
  const bits: string[] = [];
  const bitsZh: string[] = [];
  if (due > 0) { bits.push('間違えた問題をつぶすのが最優先'); bitsZh.push('优先攻克做错的题'); }
  if (weak > 0) { bits.push('直近の誤答を先につぶす'); bitsZh.push('先攻克最近的错题'); }
  bits.push(`現在地「${stage.titleJa}」を進める`);
  bitsZh.push(`推进当前位置「${stage.titleZh}」`);
  if (goal !== 'conversation' && daysToExam !== null) {
    bits.push(`試験まで${daysToExam}日`); bitsZh.push(`距离考试${daysToExam}天`);
  }
  return { ja: bits.join('。') + '。', zh: bitsZh.join('。') + '。' };
};
