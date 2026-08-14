# p3-n3-conv:P3-01 (P0)

## Evidence
advRoute.ts:193-204 で hybrid は stg-conv-start を stages[1] に splice。currentStageOf（advRoute.ts:209-210）は最初の未攻略stageを返し、攻略判定は ledger[stageId] の mastered（advMastery.ts:129-133）。stageId への台帳書込経路は ①normalバトルの battleRef フォールバック（advQuest.ts:84 `g ?? u ?? stage.stageId`、AdvShell.tsx:1015）＝JLPT系stageの攻略手段 ②midboss/rankboss時の加点（AdvShell.tsx:360-361、ただし midboss/rankboss を設定する setBattle は全コード中に存在しない）のみ。会話stageのquestは battle: null（advQuest.ts:71-79）で ledger['stg-conv-start'] への書込経路がゼロ。よって最初のJLPT stage攻略後、現在地が stg-conv-start に永久固定され新規文法・バトル・模擬ボスへ進めない。冒険マップも examRegions（advMapModel.ts:237-281）が会話stageに達成不能な「ランダム問題で80%以上…」（computeMastery advMastery.ts:83/95）と「今日の冒険には、この地域を攻略するための問題が入っています」を表示し、firstOpen（advMapModel.ts:359）も同stageで停止する。監査の行番号の軽微なズレ（setBattleは173/601/1010/1015行）と「stageId書込はmidboss時のみ」という記述は不正確（normalバトルのstageIdフォールバックあり）だが、結論は変わらず実在。

## FixSpec
【修正1: 会話stageを並走レーン化】
対象: src/lib/aiLesson/course/adventure/advRoute.ts 208-215行
旧:
/** 現在地stage（最初の未攻略stage）。masteredStageIds は mastery台帳から算出して渡す */
export const currentStageOf = (route: AdvRoute, masteredStageIds: Set<string>): AdvRouteStage | null =>
  route.stages.find((s) => !masteredStageIds.has(s.stageId)) ?? null;

/** 攻略率（stage単純比。詳細な攻略率はmastery側で技能別に出す） */
export const routeProgressPct = (route: AdvRoute, masteredStageIds: Set<string>): number =>
  route.stages.length === 0 ? 0
    : Math.round((route.stages.filter((s) => masteredStageIds.has(s.stageId)).length / route.stages.length) * 100);
新:
/** 会話stage（出題プールを持たず80%攻略条件を満たせない並走レーン）か */
export const isConversationStage = (s: AdvRouteStage): boolean =>
  s.kind === 'conversation_start' || s.kind === 'conversation_growth';

/**
 * 現在地stage（最初の未攻略stage）。masteredStageIds は mastery台帳から算出して渡す。
 * 会話stageは出題プールが無く「別日3回80%＋7日後確認」を満たせないため、
 * 未攻略のJLPT系stageが残っている間は現在地としてブロックしない
 * （hybridが stg-conv-start で恒久停止する不具合の修正）。
 * 会話のみのルートは全stageが会話系なのでフォールバックで従来どおり先頭が現在地になる。
 */
export const currentStageOf = (route: AdvRoute, masteredStageIds: Set<string>): AdvRouteStage | null => {
  const unmastered = route.stages.filter((s) => !masteredStageIds.has(s.stageId));
  return unmastered.find((s) => !isConversationStage(s)) ?? unmastered[0] ?? null;
};

/** 攻略率（stage単純比。会話stageは攻略判定が無いので母数から除く。詳細はmastery側で技能別に出す） */
export const routeProgressPct = (route: AdvRoute, masteredStageIds: Set<string>): number => {
  const gated = route.stages.filter((s) => !isConversationStage(s));
  const base = gated.length > 0 ? gated : route.stages;
  return base.length === 0 ? 0
    : Math.round((base.filter((s) => masteredStageIds.has(s.stageId)).length / base.length) * 100);
};

【修正2: マップの虚偽条件表示を除去】
対象: src/lib/aiLesson/course/adventure/advMapModel.ts 237行（examRegions）
旧:
): MapRegion[] => route.stages.map((s) => {
新:
): MapRegion[] => route.stages
  // 会話stageは試験レイヤーに出さない（出題プールが無く80%攻略条件を満たせない・
  // 会話は conversationRegions レイヤーが担う。原則13/15）
  .filter((s) => s.kind !== 'conversation_start' && s.kind !== 'conversation_growth')
  .map((s) => {
※import追加は不要（kind文字列比較のため）。goalType=conversation は routeKind='conversation' のみ（advMapModel.ts:425）で examRegions を使わないため影響なし。

【修正3: 回帰テスト追加】
対象: src/lib/aiLesson/course/adventure/advPersona.test.ts の describe('Persona D（Hybrid: N2合格＋仕事の会話）') 内、最後のitの後に追加:

  it('**stage攻略後も会話stageで恒久停止しない**（並走レーン・原則15）', () => {
    const first = prof.route!.stages[0];
    const cur = currentStageOf(prof.route!, new Set([first.stageId]))!;
    expect(cur).toBeTruthy();
    expect(['conversation_start', 'conversation_growth']).not.toContain(cur.kind);
  });

※既存テストへの影響: advCore.test.ts:164-170・advPersona.test.ts の currentStageOf 検証は jlpt ルートまたは mastered=空集合のみで、挙動不変。advMapModel.test.ts も地域の存在数を固定していないため通る。
