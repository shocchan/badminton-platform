// 会話の旅マップ（§18-B/§19）。12週を「場所」として並べ、現在地と到達済みを示す。
// 大人向け：派手なゲームにせず、落ち着いた「旅の地図」として扱う。

import { COURSE_MISSIONS, COURSE_WEEKS } from './courseData';

/** 上級パートの最初の週。ここを境に旅マップを分ける */
const ADVANCED_FIRST_WEEK = 13;
import { isRetained, atLeast } from './courseEngine';
import type { ItemProgress } from './types';

export type JourneyState = 'done' | 'current' | 'upcoming' | 'locked';

export interface JourneyPlace {
  week: number;
  nameJa: string;   // 場所の名前（村・道・街・山…）
  nameZh: string;
  themeJa: string;
  themeZh: string;
  state: JourneyState;
  /** その週で到達した定着表現の数（葉・星の数などに使える） */
  retained: number;
  learned: number;
  total: number;
}

// 週テーマ → 旅の場所名（大人向けの落ち着いた比喩）
// 冒険マップ（advMapModel）の会話レイヤーからも参照するので export する。
// 旧コースの12週マップとV2の冒険マップで**別々の地名を持たない**ようにするため、正準はここ1か所。
export const PLACE_NAME: Record<number, { ja: string; zh: string }> = {
  1: { ja: '自己紹介の村', zh: '自我介绍之村' },
  2: { ja: '思い出の道', zh: '回忆之路' },
  3: { ja: '変化の丘', zh: '变化之丘' },
  4: { ja: '習慣の並木道', zh: '习惯林荫道' },
  5: { ja: 'お願いの街', zh: '请求之街' },
  6: { ja: '相談の広場', zh: '咨询广场' },
  7: { ja: '意見を伝える山', zh: '表达意见之山' },
  8: { ja: '選択の分かれ道', zh: '选择的岔路' },
  9: { ja: '推測の霧の森', zh: '推测之雾林' },
  10: { ja: '仕事と暮らしの町', zh: '工作与生活之町' },
  11: { ja: '交流の港', zh: '交流之港' },
  12: { ja: '総合会話の頂', zh: '综合会话之巅' },
};

/**
 * 旅マップの場所一覧。
 * - current: 現在の週
 * - done: その週の項目を1つでも学習し、現在地より前
 * - locked: 前週に学習実績がない（Week1は常に開放）
 */
export const buildJourney = (progresses: ItemProgress[], currentWeek: number): JourneyPlace[] => {
  const stateOf = (id: string) => progresses.find((p) => p.itemId === id)?.masteryState;
  const places: JourneyPlace[] = [];
  let prevLearnedAny = true;
  /**
   * 旅マップは**その人が実際に歩く区間だけ**を出す（2026-08-23）。
   * 上級パート（第13〜18週）を足したとき、基礎から始めた生徒の旅マップまで
   * 12駅→18駅に伸びてしまった。歩かない道を見せると「終わりが遠い」だけになる。
   * 上級から入った人（currentWeek 13以上）には上級6駅の地図を出す。
   */
  const advancedTrack = currentWeek >= ADVANCED_FIRST_WEEK;
  const weeks = COURSE_WEEKS.filter((w) => (advancedTrack ? w.week >= ADVANCED_FIRST_WEEK : w.week < ADVANCED_FIRST_WEEK));
  for (const w of weeks) {
    const missions = COURSE_MISSIONS.filter((m) => m.week === w.week);
    let learned = 0, retained = 0;
    for (const m of missions) {
      const s = stateOf(m.id);
      if (!s) continue;
      if (atLeast(s, 'initial')) learned += 1;
      if (isRetained(s)) retained += 1;
    }
    let state: JourneyState;
    if (w.week === currentWeek) state = 'current';
    else if (w.week < currentWeek) state = learned > 0 ? 'done' : (prevLearnedAny ? 'upcoming' : 'locked');
    else state = prevLearnedAny || learned > 0 ? 'upcoming' : 'locked';
    if (w.week === 1) state = w.week === currentWeek ? 'current' : (learned > 0 ? 'done' : 'upcoming');

    places.push({
      week: w.week,
      nameJa: PLACE_NAME[w.week]?.ja ?? `Week ${w.week}`,
      nameZh: PLACE_NAME[w.week]?.zh ?? `第${w.week}周`,
      themeJa: w.themeJa, themeZh: w.themeZh,
      state, retained, learned, total: missions.length,
    });
    prevLearnedAny = learned > 0;
  }
  return places;
};

/** 現在地の場所（無ければ Week1） */
export const currentPlace = (journey: JourneyPlace[], currentWeek: number): JourneyPlace =>
  journey.find((p) => p.week === currentWeek) ?? journey[0];

/** 次の目的地（現在地の次の週） */
export const nextPlace = (journey: JourneyPlace[], currentWeek: number): JourneyPlace | null =>
  journey.find((p) => p.week === currentWeek + 1) ?? null;

/** 到達済みチェックポイント数（学習を始めた週の数） */
export const reachedCheckpoints = (journey: JourneyPlace[]): number =>
  journey.filter((p) => p.state === 'done' || p.state === 'current').length;
