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
  /** 対応する学習内容 */
  learningThemeJa: string;
  /** その言葉が必要になる相手（World Bible: 人物は必然性のために存在する） */
  characterJa: string;
  /** エリアの実用ミッション（§7） */
  practicalMissionJa: string;
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
    areaId: 'area01-minato', order: 1, nameJa: 'ミナト（はじまりの港町）', nameZh: '米纳托（起始的港町）',
    storyPurposeJa: '上陸地点。名前を伝えられないと宿に入れない',
    learningThemeJa: '自己紹介・あいさつ・基礎のことば',
    characterJa: '宿の主人 ハナさん',
    practicalMissionJa: '初対面の人に自己紹介する',
    visual: { base: '#8fb4c9', accent: '#33658a', landmark: 'harbor' },
    pos: { x: 16, y: 72 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-01-self'], hasAdventure: true,
    nextAreaId: 'area02-hinode',
  },
  {
    areaId: 'area02-hinode', order: 2, nameJa: 'ヒノデ台（暮らしの丘）', nameZh: '日出台（生活之丘）',
    storyPurposeJa: '住まいと日常。生活が回り始める',
    learningThemeJa: '生活のことば・毎日の動作・ものの様子',
    characterJa: '大家さん',
    practicalMissionJa: '一日の流れを説明する',
    visual: { base: '#a8c98f', accent: '#4f772d', landmark: 'hill' },
    pos: { x: 34, y: 58 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-02-daily', 'n3u-05-adjpair'],
    nextAreaId: 'area03-toorimichi',
  },
  {
    areaId: 'area03-toorimichi', order: 3, nameJa: 'トオリミチ（交通の街道）', nameZh: '通道（交通街道）',
    storyPurposeJa: '移動。乗り換えを間違えると先に進めない',
    learningThemeJa: '交通・場所・移動のことば',
    characterJa: '駅員さん',
    practicalMissionJa: '行き方を尋ねる・説明する',
    visual: { base: '#c9c08f', accent: '#8a7a33', landmark: 'road' },
    pos: { x: 54, y: 68 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-03-move'],
    nextAreaId: 'area04-ichiba',
  },
  {
    areaId: 'area04-ichiba', order: 4, nameJa: 'イチバ通り（買い物市場）', nameZh: '市场通（购物市场）',
    storyPurposeJa: '値段と数。欲しいものを言えないと買えない',
    learningThemeJa: '数量・値段・依頼のことば',
    characterJa: '八百屋の店主',
    practicalMissionJa: '店で買い物をする',
    visual: { base: '#c9a08f', accent: '#a24936', landmark: 'market' },
    pos: { x: 72, y: 56 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-04-things'],
    nextAreaId: 'area05-yukari',
  },
  {
    areaId: 'area05-yukari', order: 5, nameJa: 'ユカリの森（つながりの森）', nameZh: '缘之森（羁绊之森）',
    storyPurposeJa: '人と親しくなる。誘い方・断り方を知る',
    learningThemeJa: '気持ち・人間関係のことば',
    characterJa: '隣人のゲンさん',
    practicalMissionJa: '感想を伝える・家族と友人について話す',
    visual: { base: '#7da87d', accent: '#2d6a4f', landmark: 'forest' },
    pos: { x: 30, y: 34 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-06-feeling', 'n3u-07-people'],
    nextAreaId: 'area06-hataraki',
  },
  {
    areaId: 'area06-hataraki', order: 6, nameJa: 'ハタラキ区（仕事の都市）', nameZh: '劳动区（工作之城）',
    storyPurposeJa: '働く。報告・相談ができると信頼される',
    learningThemeJa: '考えの伝達・手続きと段取り',
    characterJa: '職場の先輩',
    practicalMissionJa: '意見と理由を述べる・予定を調整する',
    visual: { base: '#9aa2b5', accent: '#3d405b', landmark: 'office' },
    pos: { x: 56, y: 40 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-09-think', 'n3u-10-arrange'],
    nextAreaId: 'area07-katachi',
  },
  {
    areaId: 'area07-katachi', order: 7, nameJa: 'カタチの遺跡（文法の遺跡）', nameZh: '形之遗迹（语法遗迹）',
    storyPurposeJa: '言葉の骨組みが石に刻まれている',
    learningThemeJa: '変化と継続・状況の説明・つなぎ言葉',
    characterJa: '遺跡の案内人',
    practicalMissionJa: '困った状況を説明して助けを求める',
    visual: { base: '#b5a99a', accent: '#6b5b45', landmark: 'ruins' },
    pos: { x: 78, y: 30 },
    destination: { kind: 'n3area' }, unitIds: ['n3u-08-change', 'n3u-11-situation', 'n3u-12-adverb'],
    nextAreaId: 'area08-sorano',
  },
  {
    areaId: 'area08-sorano', order: 8, nameJa: 'ソラノ塔（ことばの塔）', nameZh: '天空塔（言语之塔）',
    storyPurposeJa: '高く登るほど抽象・書き言葉になる',
    learningThemeJa: 'N2文法（180の文型）',
    characterJa: '塔の司書',
    practicalMissionJa: '改まった場面で一段上の表現を使う',
    visual: { base: '#a89ac9', accent: '#5f4b8b', landmark: 'tower' },
    pos: { x: 48, y: 14 },
    destination: { kind: 'n2grammar' }, unitIds: [],
    nextAreaId: 'area09-katari',
  },
  {
    areaId: 'area09-katari', order: 9, nameJa: 'カタリ港（会話の港）', nameZh: '语之港（会话之港）',
    storyPurposeJa: '外から来た人と話す。声に出して確かめる',
    learningThemeJa: 'AI会話（音声・テキスト）',
    characterJa: '翔子先生',
    practicalMissionJa: '今日の目標表現を会話で使う',
    visual: { base: '#8fc9c0', accent: '#2a9d8f', landmark: 'port' },
    pos: { x: 14, y: 18 },
    destination: { kind: 'conversation' }, unitIds: [],
    nextAreaId: 'area10-omoide',
  },
  {
    areaId: 'area10-omoide', order: 10, nameJa: 'オモイデ庭園（記憶の庭）', nameZh: '回忆庭园（记忆之庭）',
    storyPurposeJa: '昔通った場所が姿を変えて再訪できる',
    learningThemeJa: '期限が来た復習（翌日/3日/7日）',
    characterJa: '庭園の手入れ人',
    practicalMissionJa: '再会したことばを思い出して使う',
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
