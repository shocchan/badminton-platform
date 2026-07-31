// 章レジストリ（2026-07-31 Chapter 2以降の実装で導入）。
//
// Chapter 1 の data contract（chapter1Data.ts）を全章共通の契約として一般化する。
// - 型はChapter 1のものをそのまま共有する（Quest構造・学習要件・霧・finale・再会）
// - questId / locationId / npcId / beatId は全章を通してグローバルに一意（テストで固定）
// - learningItemIds・grammar questionIds は実在教材IDのみ（chapterRegistry.test.ts が機械検証）
// - 各章は必ず対象Areaを持ち、World Map のエリアから到達できる
// - 章数の根拠: 正式10Area（worldAtlas）に1章ずつ＝**全10章**（2026-07-31 完成）。
//   1〜7章=学習エリア（N3単元を持つ）。8〜10章=常設施設（塔=N2文法／港=AI会話／庭園=復習）の
//   「その施設を使う意味」を物語にした導入章。施設本体の機能・route・名称は変更しない。
import {
  CHAPTER1_ID, CHAPTER1_LOCATIONS, CHAPTER1_NPCS, CHAPTER1_STORY_BEATS,
  CHAPTER1_QUESTS, CHAPTER1_FINALE_STEPS, REVIEW_REUNION,
  type Chapter1Location, type Chapter1Npc, type Chapter1StoryBeat,
  type Chapter1Quest, type FinaleStep,
} from './chapter1Data';
import { CHAPTERS_2_TO_4 } from './chapters2to4Data';
import { CHAPTERS_5_TO_7 } from './chapters5to7Data';
import { CHAPTERS_8_TO_10 } from './chapters8to10Data';

/** 章の再会Quest（復習期限があるときだけ出る手紙） */
export interface ChapterReviewReunion {
  questId: string;
  titleJa: string; titleZh: string;
  letterJa: string; letterZh: string;
  outcomeJa: string; outcomeZh: string;
  adventureXpReward: number;
}

export interface ChapterDef {
  chapterId: string;
  /** 第n章（Area orderと一致させる） */
  order: number;
  /** この章の舞台（worldAtlasの実在areaId） */
  areaId: string;
  titleJa: string; titleZh: string;
  /** 章固有の事件（この章だけの問題。テンプレ量産の防止をテストで固定） */
  incidentJa: string; incidentZh: string;
  /** opening scene（章を開いた最初の物語） */
  openingJa: string; openingZh: string;
  locations: Chapter1Location[];
  npcs: Chapter1Npc[];
  storyBeats: Chapter1StoryBeat[];
  quests: Chapter1Quest[];
  finaleSteps: FinaleStep[];
  reviewReunion: ChapterReviewReunion;
  /** 章開始時に見えている場所 */
  startLocationId: string;
  nextChapterId: string | null;
}

/** Chapter 1 を共通契約へ適合（データは chapter1Data.ts が正・IDは不変） */
const CHAPTER_1: ChapterDef = {
  chapterId: CHAPTER1_ID, order: 1, areaId: 'area01-minato',
  titleJa: '霧の港町', titleZh: '雾之港城',
  incidentJa: '深い霧で町の看板が読めず、人の声もくぐもって聞こえない',
  incidentZh: '浓雾让小镇的招牌无法辨认，人们的话也听不真切',
  openingJa: '深い霧に包まれた町に、あなたは着いた。まずは声の主に会いに行こう。',
  openingZh: '你来到了被浓雾笼罩的小镇。先去见见声音的主人吧。',
  locations: CHAPTER1_LOCATIONS, npcs: CHAPTER1_NPCS, storyBeats: CHAPTER1_STORY_BEATS,
  quests: CHAPTER1_QUESTS, finaleSteps: CHAPTER1_FINALE_STEPS,
  reviewReunion: REVIEW_REUNION,
  startLocationId: 'c1-town-gate',
  nextChapterId: 'ch2-hinode-no-asa',
};

export const CHAPTERS: ChapterDef[] = [
  CHAPTER_1, ...CHAPTERS_2_TO_4, ...CHAPTERS_5_TO_7, ...CHAPTERS_8_TO_10,
];

export const chapterById = (id: string): ChapterDef | undefined => CHAPTERS.find(c => c.chapterId === id);
export const chapterForArea = (areaId: string): ChapterDef | undefined => CHAPTERS.find(c => c.areaId === areaId);
/** questIdは全章で一意（テスト固定）→章横断でQuestを引ける */
export const questById = (questId: string): { chapter: ChapterDef; quest: Chapter1Quest } | undefined => {
  for (const c of CHAPTERS) {
    const q = c.quests.find(x => x.questId === questId);
    if (q) return { chapter: c, quest: q };
  }
  return undefined;
};
