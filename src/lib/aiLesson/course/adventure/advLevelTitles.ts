// レベル称号（2026-08-19 CEO「もっとゲーム感」）。
//
// 鉄則:
// - 称号＝levelOf(xp)の**別名表示**。**実力・攻略・準備度とは無関係**（advXp.ts の鉄則と同じ）。
//   「称号が高い＝合格できる」とは言わない・見せない
// - 「合格」「保証」を含む語は使用禁止（advCopyPromises / 合格保証表現の禁止）
// - 表示するときは必ず TITLE_DISCLAIMER を添える（XPの別名であることを隠さない）
export const LEVEL_TITLES: { minLevel: number; ja: string; zh: string }[] = [
  { minLevel: 1, ja: '見習いの旅人', zh: '见习旅人' },
  { minLevel: 3, ja: 'かけだし冒険者', zh: '初出茅庐的冒险者' },
  { minLevel: 5, ja: 'いっぱしの冒険者', zh: '独当一面的冒险者' },
  { minLevel: 8, ja: 'ベテラン冒険者', zh: '资深冒险者' },
  { minLevel: 12, ja: '歴戦の冒険者', zh: '身经百战的冒险者' },
  { minLevel: 16, ja: '伝説の冒険者', zh: '传说中的冒险者' },
];

/** levelに対応する称号（minLevel以下で最大のもの。Lv.1未満でも先頭へ倒す） */
export const titleOf = (level: number): { ja: string; zh: string } => {
  let hit = LEVEL_TITLES[0];
  for (const t of LEVEL_TITLES) if (level >= t.minLevel) hit = t;
  return { ja: hit.ja, zh: hit.zh };
};

/** 称号注記（オーバーレイと設定系で使い回す固定文言） */
export const TITLE_DISCLAIMER = {
  ja: '称号はXP（つづけた努力）の別名です。学力の判定ではありません',
  zh: '称号只是XP（坚持的努力）的别名，不代表学力判定',
} as const;
