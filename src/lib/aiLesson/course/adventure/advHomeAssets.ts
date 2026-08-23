// ホーム（今日の冒険）の画像素材マニフェスト（2026-08-22・第2フェーズ）。
//
// 冒険マップと同じ考え方:
//   - 絵は ChatGPT が作り、Claude が切り出し・最適化して `public/ai-course/home/` に置く
//   - **ここはパスと寸法だけ**。文字・進捗・ボタンは今までどおり HTML 側が持つ
//   - 画像が無い/404 のときは、その部分だけ**今までの見た目**に落ちる（画面は壊さない）
//
// 手順は docs/ai-course/design/HOME_BRIEF.md。
import type { AdvQuestStep } from './advTypes';

export interface HomeImageAsset {
  /** 1x（CSS幅の等倍） */
  webp1x: string;
  /** 2x（Retina） */
  webp2x: string;
  /** 2x の実寸。<img width/height> と縦横比の固定に使う（CLS を出さない） */
  width: number;
  height: number;
}

/**
 * 今日の街のヒーロー帯。**3:1**。地図の8街と同じ場所・同じ画風。
 * 左45%・下30%は文字を重ねるので、絵の主役は右半分に置いてある（ブリーフ§4）。
 */
export const HOME_HERO_ASPECT = '3 / 1' as const;

/** 地図の areaId → ヒーロー帯のid（地図タイルのidと同じ語を使う） */
export const HERO_ID_BY_AREA: Record<string, string> = {
  'area01-minato': 'minato',
  'area02-hinode': 'hinode',
  'area03-toorimichi': 'toorimichi',
  'area04-ichiba': 'ichiba',
  'area05-yukari': 'yukari',
  'area06-hataraki': 'hataraki',
  'area07-katachi': 'katachi',
  'area08-sorano': 'sorano',
  // 会話の港・記憶の庭は専用の絵をまだ作っていない。港の絵で受ける（同じ湾の景色）
  'area09-katari': 'minato',
  'area10-omoide': 'yukari',
};

/** 用意できているヒーロー帯（増えたらここへ足す。無いものは出さない＝存在するふりをしない） */
const hero = (id: string): HomeImageAsset => ({
  webp1x: `/ai-course/home/hero-${id}@1x.webp`,
  webp2x: `/ai-course/home/hero-${id}@2x.webp`,
  width: 1152, height: 384,
});

export const HOME_HEROES: Record<string, HomeImageAsset> = {
  minato: hero('minato'),
  hinode: hero('hinode'),
  toorimichi: hero('toorimichi'),
  ichiba: hero('ichiba'),
  yukari: hero('yukari'),
  hataraki: hero('hataraki'),
  katachi: hero('katachi'),
  sorano: hero('sorano'),
};

/** 現在地の areaId からヒーロー帯を引く。無ければ null（帯を出さない） */
export const heroForArea = (areaId: string | null | undefined): HomeImageAsset | null => {
  if (!areaId) return null;
  const id = HERO_ID_BY_AREA[areaId];
  return id ? (HOME_HEROES[id] ?? null) : null;
};

/**
 * step の絵記号。丸数字の代わりに「何をする時間か」を絵で見せる。
 * 数字（何番目か）と完了の✓は今までどおり HTML 側が出す＝絵が無くても意味は伝わる。
 */
export const STEP_ICON_BY_KIND: Partial<Record<AdvQuestStep['kind'], string>> = {
  vocab_new: 'words',
  grammar_new: 'grammar',
  battle: 'battle',
  weak_reinforce: 'battle',
  review_due: 'review',
  conversation_mission: 'talk',
  restate: 'talk',
  reading_short: 'reading',
  listening_practice: 'listening',
  kana_dojo: 'kana',
};

/**
 * 用意できている step の絵記号（増えたらここへ足す）。
 * 96px(@2x)/48px(@1x) の透過WebP。画面では28pxで出す。
 * **無いものは登録しない**（存在しない画像を出して404の穴を作らない）。
 * 2026-08-23: 8種すべて完成。7つ＋2つを1枚ずつにまとめて生成し、画風を揃えた
 * （1枚ずつ作ると描き方がぶれて、並べたときに1つだけ浮く）。
 */
const stepIcon = (id: string): HomeImageAsset => ({
  webp1x: `/ai-course/step/step-${id}@1x.webp`,
  webp2x: `/ai-course/step/step-${id}@2x.webp`,
  width: 48, height: 48,
});

export const STEP_ICONS: Record<string, HomeImageAsset> = {
  words: stepIcon('words'),
  grammar: stepIcon('grammar'),
  battle: stepIcon('battle'),
  review: stepIcon('review'),
  talk: stepIcon('talk'),
  reading: stepIcon('reading'),
  listening: stepIcon('listening'),
  kana: stepIcon('kana'),
};

/**
 * 今日のゴールの印（2026-08-23）。「今日のゴール」は bg-gray-50 の平らな箱で、
 * 画面のなかで一番地味なのに、書いてあるのはその日の目的そのものだった。
 * step の絵記号と同じ生成でまとめて作った宝箱を、その印として使う。
 */
export const GOAL_ICON: HomeImageAsset = {
  webp1x: '/ai-course/step/goal-chest@1x.webp',
  webp2x: '/ai-course/step/goal-chest@2x.webp',
  width: 48, height: 48,
};

export const stepIconFor = (kind: AdvQuestStep['kind']): HomeImageAsset | null => {
  const id = STEP_ICON_BY_KIND[kind];
  return id ? (STEP_ICONS[id] ?? null) : null;
};
