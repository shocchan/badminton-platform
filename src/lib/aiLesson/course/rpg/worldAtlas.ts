// ミナモ列島 World Atlas（FOREST FIRST §7）。World Bible（original-world-bible.md）の
// 10エリアをコードへ配置する。名称はすべて仮称（human_review_candidate）。
//
// 原則:
// - 全エリアが実機能へ接続される（「準備中」「coming soon」を持つエリアは存在させない）
// - N3の12単元はエリア2〜7＋エリア1へ重複なく割り当てる（primary配置の一意性と同じ思想）
// - RPG層はread only。ここから学習状態を書き換えない
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';

export type AreaLandmark =
  | 'harbor' | 'hill' | 'road' | 'market' | 'forest'
  | 'office' | 'ruins' | 'tower' | 'port' | 'garden';

/** エリアが開く実機能（行き止まり禁止・全kindがAiCoursePageでルーティング済みであること） */
export type AreaDestination =
  | { kind: 'n3area' }                       // エリア画面（Unit一覧＋冒険）→ N3UnitPanel
  | { kind: 'n2grammar' }                    // N2文法攻略
  | { kind: 'conversation' }                 // AI会話（会話の広場）
  | { kind: 'review' };                      // オモイデ庭園（期限復習）

export interface WorldArea {
  areaId: string;
  order: number;
  /** 仮称（human_review_candidate）。変更時はWorld Bibleと同時更新 */
  nameJa: string;
  nameZh: string;
  /** 世界での役割（short story purpose） */
  storyPurposeJa: string;
  storyPurposeZh: string;
  /** 対応する学習内容 */
  learningThemeJa: string;
  learningThemeZh: string;
  /** その言葉が必要になる相手（World Bible: 人物は必然性のために存在する） */
  characterJa: string;
  characterZh: string;
  /** エリアの実用ミッション（§7） */
  practicalMissionJa: string;
  practicalMissionZh: string;
  /** 地図上の色とlandmark（エリアごとに違いを持たせる・§7） */
  visual: { base: string; accent: string; landmark: AreaLandmark };
  /** 地図上の配置（viewBox 0-100 の百分率座標） */
  pos: { x: number; y: number };
  destination: AreaDestination;
  /** このエリアで攻略するN3単元（n3area のみ・他は空配列） */
  unitIds: string[];
  /** エリア1のみ: Chapter 1 冒険の入口を持つ */
  hasAdventure?: boolean;
  nextAreaId: string | null;
}

export const WORLD_AREAS: WorldArea[] = [
  {
    areaId: 'area01-minato', order: 1, nameJa: 'ミナト（霧の港町）', nameZh: 'ミナト（雾之港城）',
    storyPurposeJa: '上陸地点。名前を伝えられないと宿に入れない',
    storyPurposeZh: '登陆地点。说不出名字就住不进旅店',
    learningThemeJa: '自己紹介・あいさつ・基礎のことば',
    learningThemeZh: '自我介绍・问候・基础词汇',
    characterJa: '宿の主人 ハナさん',
    characterZh: '旅店主人 哈娜',
    practicalMissionJa: '初対面の人に自己紹介する',
    practicalMissionZh: '向初次见面的人做自我介绍',
    visual: { base: '#8fb4c9', accent: '#33658a', landmark: 'harbor' },
    pos: { x: 16, y: 72 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-01-self'], hasAdventure: true,
    nextAreaId: 'area02-hinode',
  },
  {
    areaId: 'area02-hinode', order: 2, nameJa: 'ヒノデ台（暮らしの丘）', nameZh: 'ヒノデ台（生活之丘）',
    storyPurposeJa: '住まいと日常。生活が回り始める',
    storyPurposeZh: '住处与日常。生活开始运转',
    learningThemeJa: '生活のことば・毎日の動作・ものの様子',
    learningThemeZh: '生活词汇・日常动作・事物的样子',
    characterJa: '大家さん',
    characterZh: '房东',
    practicalMissionJa: '一日の流れを説明する',
    practicalMissionZh: '说明一天的安排',
    visual: { base: '#a8c98f', accent: '#4f772d', landmark: 'hill' },
    pos: { x: 34, y: 58 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-02-daily', 'n3u-05-adjpair'],
    nextAreaId: 'area03-toorimichi',
  },
  {
    areaId: 'area03-toorimichi', order: 3, nameJa: 'オウライ街道（交通の道）', nameZh: 'オウライ街道（交通街道）',
    storyPurposeJa: '移動。乗り換えを間違えると先に進めない',
    storyPurposeZh: '移动。换乘出错就无法前进',
    learningThemeJa: '交通・場所・移動のことば',
    learningThemeZh: '交通・场所・移动词汇',
    characterJa: '駅員さん',
    characterZh: '车站工作人员',
    practicalMissionJa: '行き方を尋ねる・説明する',
    practicalMissionZh: '问路・说明怎么走',
    visual: { base: '#c9c08f', accent: '#8a7a33', landmark: 'road' },
    pos: { x: 54, y: 68 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-03-move'],
    nextAreaId: 'area04-ichiba',
  },
  {
    areaId: 'area04-ichiba', order: 4, nameJa: 'イチバ通り（買い物市場）', nameZh: 'イチバ通り（购物市场）',
    storyPurposeJa: '値段と数。欲しいものを言えないと買えない',
    storyPurposeZh: '价格与数量。说不出想要的东西就买不到',
    learningThemeJa: '数量・値段・依頼のことば',
    learningThemeZh: '数量・价格・请求词汇',
    characterJa: '八百屋の店主',
    characterZh: '蔬果店老板',
    practicalMissionJa: '店で買い物をする',
    practicalMissionZh: '在店里购物',
    visual: { base: '#c9a08f', accent: '#a24936', landmark: 'market' },
    pos: { x: 72, y: 56 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-04-things'],
    nextAreaId: 'area05-yukari',
  },
  {
    areaId: 'area05-yukari', order: 5, nameJa: 'ユカリの森（つながりの森）', nameZh: 'ユカリの森（羁绊之森）',
    storyPurposeJa: '人と親しくなる。誘い方・断り方を知る',
    storyPurposeZh: '与人亲近。学会邀请与拒绝',
    learningThemeJa: '気持ち・人間関係のことば',
    learningThemeZh: '心情・人际关系词汇',
    characterJa: '隣人のゲンさん',
    characterZh: '邻居 阿源',
    practicalMissionJa: '感想を伝える・家族と友人について話す',
    practicalMissionZh: '表达感想・谈家人和朋友',
    visual: { base: '#7da87d', accent: '#2d6a4f', landmark: 'forest' },
    pos: { x: 30, y: 34 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-06-feeling', 'n3u-07-people'],
    nextAreaId: 'area06-hataraki',
  },
  {
    areaId: 'area06-hataraki', order: 6, nameJa: 'ハタラキ街（仕事の街）', nameZh: 'ハタラキ街（工作之街）',
    storyPurposeJa: '働く。報告・相談ができると信頼される',
    storyPurposeZh: '工作。会报告与商量才能获得信任',
    learningThemeJa: '考えの伝達・手続きと段取り',
    learningThemeZh: '表达想法・手续与安排',
    characterJa: '職場の先輩',
    characterZh: '职场前辈',
    practicalMissionJa: '意見と理由を述べる・予定を調整する',
    practicalMissionZh: '陈述意见和理由・调整日程',
    visual: { base: '#9aa2b5', accent: '#3d405b', landmark: 'office' },
    pos: { x: 56, y: 40 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-09-think', 'n3u-10-arrange'],
    nextAreaId: 'area07-katachi',
  },
  {
    areaId: 'area07-katachi', order: 7, nameJa: 'カタチの遺跡（文法の遺跡）', nameZh: 'カタチの遺跡（语法遗迹）',
    storyPurposeJa: '言葉の骨組みが石に刻まれている',
    storyPurposeZh: '语言的骨架刻在石头上',
    learningThemeJa: '変化と継続・状況の説明・つなぎ言葉',
    learningThemeZh: '变化与持续・状况说明・连接词',
    characterJa: '遺跡の案内人',
    characterZh: '遗迹向导',
    practicalMissionJa: '困った状況を説明して助けを求める',
    practicalMissionZh: '说明困境并请求帮助',
    visual: { base: '#b5a99a', accent: '#6b5b45', landmark: 'ruins' },
    pos: { x: 78, y: 30 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-08-change', 'n3u-11-situation', 'n3u-12-adverb'],
    nextAreaId: 'area08-sorano',
  },
  {
    areaId: 'area08-sorano', order: 8, nameJa: 'ソラノ塔（ことばの塔）', nameZh: 'ソラノ塔（N2语法之塔）',
    storyPurposeJa: '高く登るほど抽象・書き言葉になる',
    storyPurposeZh: '越往上越抽象、越书面',
    learningThemeJa: 'N2文法（178の文型）',
    learningThemeZh: 'N2语法（178个句型）',
    characterJa: '塔の司書',
    characterZh: '塔中的司书',
    practicalMissionJa: '改まった場面で一段上の表現を使う',
    practicalMissionZh: '在郑重场合使用更高一级的表达',
    visual: { base: '#a89ac9', accent: '#5f4b8b', landmark: 'tower' },
    pos: { x: 48, y: 14 },
    destination: { kind: 'n2grammar' }, unitIds: [],
    nextAreaId: 'area09-katari',
  },
  {
    areaId: 'area09-katari', order: 9, nameJa: 'カタリ港（会話の港）', nameZh: 'カタリ港（会话之港）',
    storyPurposeJa: '外から来た人と話す。声に出して確かめる',
    storyPurposeZh: '与外来的人交谈。开口确认',
    learningThemeJa: 'AI会話（音声・テキスト）',
    learningThemeZh: 'AI会话（语音・文字）',
    characterJa: '翔子先生',
    characterZh: '翔子老师',
    practicalMissionJa: '今日の目標表現を会話で使う',
    practicalMissionZh: '在会话中使用今天的目标表达',
    visual: { base: '#8fc9c0', accent: '#2a9d8f', landmark: 'port' },
    pos: { x: 14, y: 18 },
    destination: { kind: 'conversation' }, unitIds: [],
    nextAreaId: 'area10-omoide',
  },
  {
    areaId: 'area10-omoide', order: 10, nameJa: 'オモイデ庭園（記憶の庭）', nameZh: 'オモイデ庭園（记忆之庭）',
    storyPurposeJa: '昔通った場所が姿を変えて再訪できる',
    storyPurposeZh: '曾经走过的地方换了模样，可以重访',
    learningThemeJa: '期限が来た復習（翌日/3日/7日）',
    learningThemeZh: '到期复习（次日/3天/7天）',
    characterJa: '庭園の手入れ人',
    characterZh: '庭园的园丁',
    practicalMissionJa: '再会したことばを思い出して使う',
    practicalMissionZh: '回想并使用再会的词汇',
    visual: { base: '#c98fb4', accent: '#9d4e8a', landmark: 'garden' },
    pos: { x: 80, y: 76 },
    destination: { kind: 'review' }, unitIds: [],
    nextAreaId: null,
  },
];

export const areaById = (id: string): WorldArea | undefined => WORLD_AREAS.find(a => a.areaId === id);

/** N3単元→所属エリア。全12単元がちょうど1エリアに属する（テストで固定） */
export const areaForUnit = (unitId: string): WorldArea | undefined =>
  WORLD_AREAS.find(a => a.unitIds.includes(unitId));

/** エリアのN3単元spec（order順） */
export const unitSpecsForArea = (area: WorldArea) =>
  area.unitIds
    .map(id => N3_UNIT_SPECS.find(s => s.unitId === id))
    .filter((s): s is typeof N3_UNIT_SPECS[number] => !!s)
    .sort((a, b) => a.order - b.order);
