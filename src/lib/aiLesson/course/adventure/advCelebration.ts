// その場で祝うセレモニー（2026-08-19 CEO「もっとゲーム感」）。
//
// 祝いアイテムの組み立ては純関数。**実際に起きた遷移だけを祝う**（原則13）:
// - conquest / chapter は「新しくdoneになった瞬間」しか生成されない
//   （prev=null＝初期化直後は必ず空＝起動時に過去の攻略を祝い直さない）。
//   永続化なしで「1回だけ」が成立する（リロード後に再演しない＝偽演出防止）
// - 会話レイヤーの地域は週送りでdoneになるだけで攻略計測をしていないため、祝い対象にしない
// - levelup / streak は AdvShell 側が実測値（xp・streak）から積む
import type { AdventureMap, LandmarkKind, MapTone } from './advMapModel';

export type AdvCelebration =
  | { kind: 'conquest'; regionId: string; nameJa: string; nameZh: string;
      abilityJa: string; abilityZh: string; landmark: LandmarkKind; tone: MapTone }
  | { kind: 'chapter'; chapterJa: string; chapterZh: string;
      regions: { nameJa: string; nameZh: string; landmark: LandmarkKind }[] }
  | { kind: 'levelup'; level: number; titleJa: string; titleZh: string }
  | { kind: 'streak'; days: number };

/** 新しくdoneになったstageId。prev===null（初期化直後）は**必ず空配列**＝起動時に祝わない */
export const diffNewlyDone = (prev: Set<string> | null, next: Set<string>): string[] => {
  if (prev === null) return [];
  return [...next].filter((id) => !prev.has(id));
};

/**
 * 攻略アイテムを組み立てる。newStageIdsの各地域について conquest を1つ、
 * その地域の章（chapterJaで同定）が**全員doneになっていれば** chapter を1つ（同一章は重複させない）。
 * mapに見つからないid（会話レイヤー等）は黙って捨てる
 */
export const conquestCelebrations = (map: AdventureMap, newStageIds: string[]): AdvCelebration[] => {
  const out: AdvCelebration[] = [];
  const celebratedChapters = new Set<string>();
  for (const id of newStageIds) {
    const region = map.regions.find((r) => r.id === id);
    if (!region) continue;
    out.push({
      kind: 'conquest',
      regionId: region.id,
      nameJa: region.nameJa, nameZh: region.nameZh,
      abilityJa: region.abilityJa, abilityZh: region.abilityZh,
      landmark: region.landmark, tone: region.tone,
    });
    if (celebratedChapters.has(region.chapterJa)) continue;
    const chapterRegions = map.regions.filter((r) => r.chapterJa === region.chapterJa);
    if (chapterRegions.length > 0 && chapterRegions.every((r) => r.state === 'done')) {
      celebratedChapters.add(region.chapterJa);
      out.push({
        kind: 'chapter',
        chapterJa: region.chapterJa, chapterZh: region.chapterZh,
        regions: chapterRegions.map((r) => ({ nameJa: r.nameJa, nameZh: r.nameZh, landmark: r.landmark })),
      });
    }
  }
  return out;
};
