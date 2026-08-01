// 冒険マップのデータ組み立て（PRODUCT_CANON §5・原則11/12）。
//
// 原則:
// - **RPGは学習構造を分かりやすくする手段**。地図を豪華にして今日の行動を隠さない
// - **矛盾する「現在地」を2つ出さない**。ルートを切り替えても現在地は必ず1つ
// - 世界観の名前だけにしない。地域名の横に必ず「何の力を鍛えるか」を出す（原則12）
// - 旧コースの12週会話マップは、ここの**会話レイヤー**へ統合する（別の進捗モデルを併存させない）
import type { AdvRoute, AdventureV2Profile, JlptLevel } from './advTypes';
import { PLACE_NAME as JOURNEY_PLACES } from '../courseJourney';

/** 表示するルート。Hybridは総合（試験＋会話が合流する） */
export type MapRouteKind = 'combined' | 'exam' | 'conversation';

/** 地域の見た目。外部IP・既存ゲーム素材は使わず、すべて自作SVGで描く */
export type LandmarkKind =
  | 'camp' | 'bridge' | 'ruins' | 'gate' | 'tower' | 'library' | 'castle'
  | 'village' | 'road' | 'hill' | 'avenue' | 'town' | 'plaza' | 'mountain'
  | 'crossroad' | 'forest' | 'city';

export type RegionState = 'done' | 'current' | 'next' | 'locked';

export interface MapRegion {
  id: string;
  layer: 'exam' | 'conversation';
  nameJa: string;
  nameZh: string;
  /** 何の力を鍛える地域か（世界観の名前だけにしない・原則12） */
  abilityJa: string;
  abilityZh: string;
  landmark: LandmarkKind;
  state: RegionState;
  /** 0-100。locked は null（未計測を0%と見せない・原則13） */
  masteryPct: number | null;
  doneJa: string; doneZh: string;
  nextJa: string; nextZh: string;
  estMinutes: number;
}

export interface AdventureMap {
  routeKind: MapRouteKind;
  regions: MapRegion[];
  /** 現在地。**常に1つだけ**（見つからなければ null） */
  currentRegionId: string | null;
  /** 次に向かう地域 */
  nextRegionId: string | null;
  destinationJa: string;
  destinationZh: string;
  /** 試験ルートと会話ルートが合流する地点のindex（combinedのときだけ） */
  mergeIndex: number | null;
  doneCount: number;
  totalCount: number;
}

const STAGE_LANDMARK: Record<string, LandmarkKind> = {
  foundation_camp: 'camp',
  n3_bridge: 'bridge',
  n3_practice: 'village',
  n3_grammar: 'ruins',
  n2_gate: 'gate',
  n2_grammar: 'tower',
  reading_listening: 'library',
  mock_boss: 'castle',
};

const STAGE_ABILITY: Record<string, { ja: string; zh: string }> = {
  foundation_camp: { ja: '基礎の語彙と文字', zh: '基础词汇与文字' },
  n3_bridge: { ja: 'N3の語彙・文法', zh: 'N3词汇与语法' },
  n3_practice: { ja: 'N3の実践', zh: 'N3实践' },
  n3_grammar: { ja: 'N3文法', zh: 'N3语法' },
  n2_gate: { ja: 'N3の総仕上げ', zh: 'N3总复习' },
  n2_grammar: { ja: 'N2語彙・文法', zh: 'N2词汇与语法' },
  reading_listening: { ja: '読解と聴解', zh: '阅读与听力' },
  mock_boss: { ja: '時間配分と総合力', zh: '时间分配与综合能力' },
};

/**
 * 会話レイヤーの地域（旧コースの12週マップをここへ統合）。
 * 地名の正準は `courseJourney.PLACE_NAME`（12件）。ここは**同じ数だけ**持つ。
 */
const CONVERSATION_LANDMARK: LandmarkKind[] = [
  'village', 'road', 'hill', 'avenue', 'town', 'plaza',
  'mountain', 'crossroad', 'forest', 'city', 'bridge', 'castle',
];
const CONVERSATION_ABILITY: { ja: string; zh: string }[] = [
  { ja: '自己紹介と今の生活', zh: '自我介绍与当前生活' },
  { ja: '過去の経験を話す', zh: '讲述过去的经历' },
  { ja: '変化と成長を話す', zh: '讲述变化与成长' },
  { ja: '習慣と継続を話す', zh: '讲述习惯与坚持' },
  { ja: '許可と依頼', zh: '许可与请求' },
  { ja: '困りごとの相談', zh: '咨询困扰' },
  { ja: '意見と理由', zh: '意见与理由' },
  { ja: '選択と比較', zh: '选择与比较' },
  { ja: '推測とぼかし表現', zh: '推测与委婉表达' },
  { ja: '仕事と暮らしの会話', zh: '工作与生活的会话' },
  { ja: '人とつながる会話', zh: '与人建立联系的会话' },
  { ja: '話題をまたぐ総合会話', zh: '跨话题的综合会话' },
];

/** 試験レイヤーの地域を作る */
const examRegions = (
  route: AdvRoute,
  mastered: Set<string>,
  dailyMinutes: number,
): MapRegion[] => route.stages.map((s) => {
  const done = mastered.has(s.stageId);
  return {
    id: s.stageId,
    layer: 'exam' as const,
    nameJa: s.titleJa,
    nameZh: s.titleZh,
    abilityJa: STAGE_ABILITY[s.kind]?.ja ?? s.purposeJa,
    abilityZh: STAGE_ABILITY[s.kind]?.zh ?? s.purposeZh,
    landmark: STAGE_LANDMARK[s.kind] ?? 'village',
    state: (done ? 'done' : 'locked') as RegionState,
    masteryPct: done ? 100 : null,
    doneJa: done ? 'この地域は攻略済みです' : 'まだ攻略していません',
    doneZh: done ? '这个地区已经攻略完成' : '还没有攻略',
    nextJa: s.clearConditionJa,
    nextZh: s.clearConditionZh,
    estMinutes: dailyMinutes,
  };
});

/**
 * 会話レイヤーの地域を作る。
 *
 * **会話は地域ごとの定着率を測っていない。**
 * それらしい数字を出すと「測っている」と誤解させるので、masteryPct は null（未判定）にする（原則13）。
 * 通過したかどうかだけを done で表す。
 */
const conversationRegions = (
  currentWeek: number,
  dailyMinutes: number,
): MapRegion[] => Object.entries(JOURNEY_PLACES).map(([weekStr, name], i) => {
  const week = Number(weekStr);
  const done = week < currentWeek;
  return {
    id: `conv-w${week}`,
    layer: 'conversation' as const,
    nameJa: name.ja,
    nameZh: name.zh,
    abilityJa: CONVERSATION_ABILITY[i]?.ja ?? '会話',
    abilityZh: CONVERSATION_ABILITY[i]?.zh ?? '会话',
    landmark: CONVERSATION_LANDMARK[i] ?? 'village',
    state: (done ? 'done' : 'locked') as RegionState,
    masteryPct: null,
    doneJa: done ? 'この地域の会話は一度通りました' : 'まだ会話していません',
    doneZh: done ? '这个地区的会话已经走过一次' : '还没有进行会话',
    nextJa: '会話ミッションで実際に使う',
    nextZh: '在会话任务中实际使用',
    estMinutes: Math.min(dailyMinutes, 10),
  };
});

/**
 * 冒険マップを組み立てる。
 * **現在地は必ず1つ。** 未攻略の先頭を current にし、その次を next にする。
 */
export const buildAdventureMap = (
  prof: AdventureV2Profile,
  route: AdvRoute | null,
  mastered: Set<string>,
  currentWeek: number,
  routeKind: MapRouteKind,
): AdventureMap => {
  const daily = prof.dailyMinutes ?? 15;
  const exam = route ? examRegions(route, mastered, daily) : [];
  const conv = conversationRegions(currentWeek, daily);

  let regions: MapRegion[];
  let mergeIndex: number | null = null;
  if (routeKind === 'exam') regions = exam;
  else if (routeKind === 'conversation') regions = conv;
  else {
    // 総合: 目的に応じて主レイヤーを先に置き、もう一方を合流させる
    const examFirst = prof.goalType !== 'conversation';
    regions = examFirst ? [...exam, ...conv] : [...conv, ...exam];
    mergeIndex = examFirst ? exam.length : conv.length;
    if (mergeIndex === 0 || mergeIndex === regions.length) mergeIndex = null;
  }

  // 現在地＝未攻略の先頭。1つだけに確定させる
  const firstOpen = regions.findIndex((r) => r.state !== 'done');
  const withState = regions.map((r, i) => {
    if (i === firstOpen) {
      // 試験レイヤーは mastery台帳で測っているので 0% は実測値。
      // **会話レイヤーは測っていないので null のまま**にする（0%と見せない・原則13）
      return {
        ...r,
        state: 'current' as RegionState,
        masteryPct: r.layer === 'exam' ? (r.masteryPct ?? 0) : null,
      };
    }
    if (i === firstOpen + 1) return { ...r, state: 'next' as RegionState };
    return r;
  });

  return {
    routeKind,
    regions: withState,
    currentRegionId: firstOpen >= 0 ? withState[firstOpen].id : null,
    nextRegionId: firstOpen >= 0 && withState[firstOpen + 1] ? withState[firstOpen + 1].id : null,
    destinationJa: route?.destinationLabelJa ?? '会話力の向上',
    destinationZh: route?.destinationLabelZh ?? '提升会话能力',
    mergeIndex,
    doneCount: withState.filter((r) => r.state === 'done').length,
    totalCount: withState.length,
  };
};

/** ルート切り替えの選択肢。目的によって出す組み合わせを変える */
export const availableRouteKinds = (goalType: AdventureV2Profile['goalType']): MapRouteKind[] => {
  if (goalType === 'conversation') return ['conversation'];
  if (goalType === 'jlpt') return ['exam'];
  return ['combined', 'exam', 'conversation'];
};

export const ROUTE_KIND_LABEL: Record<MapRouteKind, { ja: string; zh: string }> = {
  combined: { ja: '総合ルート', zh: '综合路线' },
  exam: { ja: '試験ルート', zh: '考试路线' },
  conversation: { ja: '会話ルート', zh: '会话路线' },
};

/** 目標レベル表示（未設定を決めつけない） */
export const mapLevelLabel = (level: JlptLevel | null): string => level ?? '—';
