// 冒険マップのデータ組み立て（PRODUCT_CANON §5・原則11/12）。
//
// 原則:
// - **RPGは学習構造を分かりやすくする手段**。地図を豪華にして今日の行動を隠さない
// - **矛盾する「現在地」を2つ出さない**。ルートを切り替えても現在地は必ず1つ
// - 世界観の名前だけにしない。地域名の横に必ず「何の力を鍛えるか」を出す（原則12）
// - 旧コースの12週会話マップは、ここの**会話レイヤー**へ統合する（別の進捗モデルを併存させない）
// - **どの地域を選んでも次の行動が1つ決まる**（原則15・行き止まりを作らない）。
//   そのため各地域は `action` を必ず持ち、UI はそれをボタンにするだけでよい
import type { AdvRoute, AdventureV2Profile, JlptLevel, AdvMasteryLedger } from './advTypes';
import { PLACE_NAME as JOURNEY_PLACES } from '../courseJourney';
import { computeMastery, masteryProgressPct } from './advMastery';

/** 表示するルート。Hybridは総合（試験＋会話が合流する） */
export type MapRouteKind = 'combined' | 'exam' | 'conversation';

/** 地域の見た目。外部IP・既存ゲーム素材は使わず、すべて自作SVGで描く */
export type LandmarkKind =
  | 'camp' | 'bridge' | 'ruins' | 'gate' | 'tower' | 'library' | 'castle'
  | 'village' | 'road' | 'hill' | 'avenue' | 'town' | 'plaza' | 'mountain'
  | 'crossroad' | 'forest' | 'city';

/**
 * 地域の色調。**場所ごとに空と地面の色を変える**ための鍵。
 * 形だけを変えても小さく描くと「どこも同じ」に見えるため、時間帯・気候で差をつける。
 */
export type MapTone = 'dawn' | 'meadow' | 'forest' | 'water' | 'stone' | 'sunset' | 'sky' | 'night';

export type RegionState = 'done' | 'current' | 'next' | 'locked';

/**
 * 地域を選んだときに提示する「次の行動」。
 * UI側で分岐を増やさないよう、**行き先の種類はここで決める**。
 * `today` はいつでも成立する安全な既定（今日の冒険へ戻って次のstepを実行する）。
 */
export type RegionActionKind = 'today' | 'review' | 'conversation' | 'mock';

export interface RegionAction {
  kind: RegionActionKind;
  labelJa: string;
  labelZh: string;
  /** なぜこれをやるのか（ボタンの上に出す一言） */
  reasonJa: string;
  reasonZh: string;
}

export interface MapRegion {
  id: string;
  layer: 'exam' | 'conversation';
  /** 冒険の章。連続する地域をまとめて「いま何編を進めているか」を出す */
  chapterJa: string;
  chapterZh: string;
  nameJa: string;
  nameZh: string;
  /** 何の力を鍛える地域か（世界観の名前だけにしない・原則12） */
  abilityJa: string;
  abilityZh: string;
  /** その地域で何が起きるかの短い説明（1文） */
  blurbJa: string;
  blurbZh: string;
  landmark: LandmarkKind;
  tone: MapTone;
  state: RegionState;
  /** 0-100。locked は null（未計測を0%と見せない・原則13） */
  masteryPct: number | null;
  doneJa: string; doneZh: string;
  nextJa: string; nextZh: string;
  /** 未解放の地域だけ。ここへ入るための条件（空文字なら出さない） */
  unlockJa: string; unlockZh: string;
  /** **必ず1つ**。行き止まりを作らない（原則15） */
  action: RegionAction;
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

/** 試験レイヤーの色調。基礎→朝、N3→昼、N2→夕、模試→夜。進むほど空が変わる */
const STAGE_TONE: Record<string, MapTone> = {
  foundation_camp: 'dawn',
  n3_bridge: 'water',
  n3_practice: 'meadow',
  n3_grammar: 'stone',
  n2_gate: 'sunset',
  n2_grammar: 'sky',
  reading_listening: 'forest',
  mock_boss: 'night',
};

/** 試験レイヤーの章。地域を1つずつ見るのではなく「いま何編か」を掴ませる */
const STAGE_CHAPTER: Record<string, { ja: string; zh: string }> = {
  foundation_camp: { ja: '第1章　土台をつくる', zh: '第1章　打好基础' },
  n3_bridge: { ja: '第2章　N3を渡る', zh: '第2章　跨越N3' },
  n3_practice: { ja: '第2章　N3を渡る', zh: '第2章　跨越N3' },
  n3_grammar: { ja: '第2章　N3を渡る', zh: '第2章　跨越N3' },
  n2_gate: { ja: '第3章　N2へ挑む', zh: '第3章　挑战N2' },
  n2_grammar: { ja: '第3章　N2へ挑む', zh: '第3章　挑战N2' },
  reading_listening: { ja: '第3章　N2へ挑む', zh: '第3章　挑战N2' },
  mock_boss: { ja: '最終章　本番へ', zh: '最终章　迎接考试' },
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
/** 隣り合う地域が同じ色調にならないように並べる */
const CONVERSATION_TONE: MapTone[] = [
  'dawn', 'sunset', 'meadow', 'forest', 'stone', 'water',
  'sky', 'meadow', 'forest', 'stone', 'water', 'night',
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
/** その地域で「実際に何ができるようになるか」。能力名だけだと場面が想像できない */
const CONVERSATION_BLURB: { ja: string; zh: string }[] = [
  { ja: '名前・仕事・住まいを、詰まらずに一続きで話せるようにする', zh: '让你能连贯地说出名字、工作和居住情况' },
  { ja: '「前はこうだった」を過去形で語れるようにする', zh: '让你能用过去式讲述"以前是这样的"' },
  { ja: '「〜ようになった」で自分の変化を伝えられるようにする', zh: '让你能用"变得会…"表达自己的变化' },
  { ja: '続けていること・やめたことを説明できるようにする', zh: '让你能说明一直坚持的事和放弃的事' },
  { ja: '相手に負担をかけずに頼む言い方を身につける', zh: '掌握不给对方压力的请求说法' },
  { ja: '困っていることを整理して相談できるようにする', zh: '让你能条理清楚地说出困扰并求助' },
  { ja: '意見に理由を付けて言い切れるようにする', zh: '让你能给出理由并明确表达意见' },
  { ja: '2つを比べて、選んだ理由を言えるようにする', zh: '让你能比较两者并说出选择的理由' },
  { ja: '断定を避けたいときの言い方を使い分ける', zh: '学会在不想断言时的委婉说法' },
  { ja: '職場と生活の場面で必要なやりとりをこなす', zh: '应对职场与生活场景中必要的交流' },
  { ja: '相手の話を受けて会話を続けられるようにする', zh: '让你能承接对方的话并把会话延续下去' },
  { ja: '話題が変わっても崩れない会話力にする', zh: '让你的会话在话题变化时也不会崩溃' },
];
/** 会話編の章。4地域ずつ区切る */
const conversationChapter = (i: number): { ja: string; zh: string } => {
  if (i < 4) return { ja: '会話編1　話しはじめる', zh: '会话篇1　开口说话' };
  if (i < 8) return { ja: '会話編2　伝える・頼む', zh: '会话篇2　表达与请求' };
  return { ja: '会話編3　考えを語る', zh: '会话篇3　讲述想法' };
};

/** 攻略済みの地域に出す共通の行動（維持は復習でやる） */
const REVIEW_ACTION: RegionAction = {
  kind: 'review',
  labelJa: '復習で維持する', labelZh: '用复习来保持',
  reasonJa: '一度攻略した内容は、忘れる前に短く復習すると残ります',
  reasonZh: '攻略过的内容在遗忘前短暂复习就能留下来',
};

const todayAction = (reasonJa: string, reasonZh: string, labelJa = '今日の冒険を始める', labelZh = '开始今天的冒险'): RegionAction => ({
  kind: 'today', labelJa, labelZh, reasonJa, reasonZh,
});

/** 試験レイヤーの地域を作る */
const examRegions = (
  route: AdvRoute,
  mastered: Set<string>,
  dailyMinutes: number,
  ledger: AdvMasteryLedger,
  nowISO: string,
): MapRegion[] => route.stages.map((s) => {
  const done = mastered.has(s.stageId);
  // 攻略条件そのものではなく「**いま何回足りないか**」を出す（advMasteryの正直な文言を使う）
  const st = computeMastery(ledger[s.stageId], nowISO);
  return {
    id: s.stageId,
    layer: 'exam' as const,
    chapterJa: STAGE_CHAPTER[s.kind]?.ja ?? '攻略ルート',
    chapterZh: STAGE_CHAPTER[s.kind]?.zh ?? '攻略路线',
    nameJa: s.titleJa,
    nameZh: s.titleZh,
    abilityJa: STAGE_ABILITY[s.kind]?.ja ?? s.purposeJa,
    abilityZh: STAGE_ABILITY[s.kind]?.zh ?? s.purposeZh,
    blurbJa: s.purposeJa,
    blurbZh: s.purposeZh,
    landmark: STAGE_LANDMARK[s.kind] ?? 'village',
    tone: STAGE_TONE[s.kind] ?? 'meadow',
    state: (done ? 'done' : 'locked') as RegionState,
    masteryPct: done ? 100 : null,
    doneJa: done ? 'この地域は攻略済みです' : 'まだ攻略していません',
    doneZh: done ? '这个地区已经攻略完成' : '还没有攻略',
    nextJa: done ? '攻略済み。ときどき復習で維持する' : st.nextJa,
    nextZh: done ? '已攻克。偶尔复习保持' : st.nextZh,
    unlockJa: '', unlockZh: '',
    action: done ? REVIEW_ACTION : (s.kind === 'mock_boss'
      ? { kind: 'mock' as const, labelJa: 'ミニ模試を受ける', labelZh: '参加迷你模拟考',
          reasonJa: '本番と同じ形式で、時間配分ごと試す場所です',
          reasonZh: '这里用与正式考试相同的形式，连时间分配一起练' }
      : todayAction(s.clearConditionJa, s.clearConditionZh)),
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
  const ch = conversationChapter(i);
  return {
    id: `conv-w${week}`,
    layer: 'conversation' as const,
    chapterJa: ch.ja, chapterZh: ch.zh,
    nameJa: name.ja,
    nameZh: name.zh,
    abilityJa: CONVERSATION_ABILITY[i]?.ja ?? '会話',
    abilityZh: CONVERSATION_ABILITY[i]?.zh ?? '会话',
    blurbJa: CONVERSATION_BLURB[i]?.ja ?? '会話ミッションで実際に使う',
    blurbZh: CONVERSATION_BLURB[i]?.zh ?? '在会话任务中实际使用',
    landmark: CONVERSATION_LANDMARK[i] ?? 'village',
    tone: CONVERSATION_TONE[i] ?? 'meadow',
    state: (done ? 'done' : 'locked') as RegionState,
    masteryPct: null,
    doneJa: done ? 'この地域の会話は一度通りました' : 'まだ会話していません',
    doneZh: done ? '这个地区的会话已经走过一次' : '还没有进行会话',
    nextJa: done ? 'もう一度話して、言い方を安定させる' : '会話ミッションで実際に使う',
    nextZh: done ? '再说一次，让说法更稳定' : '在会话任务中实际使用',
    unlockJa: '', unlockZh: '',
    action: {
      kind: 'conversation' as const,
      labelJa: 'AI会話を始める', labelZh: '开始AI会话',
      reasonJa: '会話は解くのではなく、実際に口に出すと定着します',
      reasonZh: '会话不是做题，实际说出口才能掌握',
    },
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
  nowISO: string = new Date().toISOString(),
): AdventureMap => {
  const daily = prof.dailyMinutes ?? 15;
  const ledger = prof.mastery ?? {};
  const exam = route ? examRegions(route, mastered, daily, ledger, nowISO) : [];
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
  const currentName = firstOpen >= 0
    ? { ja: regions[firstOpen].nameJa, zh: regions[firstOpen].nameZh }
    : null;

  const withState = regions.map((r, i) => {
    if (i === firstOpen) {
      // 試験レイヤーは mastery台帳で測っているので実測値を出す（0%も実測）。
      // **会話レイヤーは測っていないので null のまま**にする（0%と見せない・原則13）
      return {
        ...r,
        state: 'current' as RegionState,
        masteryPct: r.layer === 'exam' ? masteryProgressPct(ledger[r.id], nowISO) : null,
      };
    }
    if (i === firstOpen + 1) {
      return {
        ...r,
        state: 'next' as RegionState,
        unlockJa: currentName ? `${currentName.ja}を攻略すると開きます` : '',
        unlockZh: currentName ? `攻略${currentName.zh}后开启` : '',
        // 次の目的地はまだ入れない。**押せる行動は「今日の冒険」に寄せる**（行き止まりにしない）
        action: todayAction(
          `いま向かっているのは${currentName?.ja ?? '現在地'}です。今日のぶんを進めると近づきます`,
          `你正前往${currentName?.zh ?? '当前位置'}。完成今天的份量就会更近一步`,
          '今日の冒険を進める', '继续今天的冒险',
        ),
      };
    }
    if (i > firstOpen) {
      return {
        ...r,
        unlockJa: currentName ? `先に${currentName.ja}を攻略します` : '',
        unlockZh: currentName ? `需要先攻略${currentName.zh}` : '',
        action: todayAction(
          'ここはまだ霧の中です。今日のぶんを積み重ねると道がつながります',
          '这里还在迷雾中。积累今天的份量，道路就会连上',
          '今日の冒険を進める', '继续今天的冒险',
        ),
      };
    }
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

/** ルートの違いを一言で（タブ名だけだと何が違うか分からない） */
export const ROUTE_KIND_HINT: Record<MapRouteKind, { ja: string; zh: string }> = {
  combined: { ja: '試験の攻略と会話の練習をひとつながりで見る', zh: '把考试攻略与会话练习连成一条线来看' },
  exam: { ja: '選択式でJLPTの得点力を上げる道', zh: '用选择题提升JLPT得分能力的路线' },
  conversation: { ja: '実際に話して使えるようにする道', zh: '实际开口、把学到的用出来的路线' },
};

/** レイヤーの表示名。総合ルートで「いまどちらの道か」を出すのに使う */
export const LAYER_LABEL: Record<MapRegion['layer'], { ja: string; zh: string }> = {
  exam: { ja: '試験ルート', zh: '考试路线' },
  conversation: { ja: '会話ルート', zh: '会话路线' },
};

/** 目標レベル表示（未設定を決めつけない） */
export const mapLevelLabel = (level: JlptLevel | null): string => level ?? '—';
