// 購入プランによる冒険マップの地域ゲート（純関数・2026-08-19 CEO決定）。
//
// AI体験パス（600円）＝「AI会話60分＋**最初の3地域まで**攻略し放題」。
// 4地域目からは locked にし、解放条件として上位プランを案内する。
//
// 方針:
// - buildAdventureMap の**結果に後掛けする**（マップは毎描画で実データから再構築される。
//   保存済みルートには一切触れない＝アップグレード後は自動で全地域が戻る）
// - ゲートするのは**試験レイヤーだけ**。会話レイヤーはAI会話60分の
//   サーバー側上限（ai_seconds_limit）が既に守っている
// - 攻略済み（done）の地域は奪わない（上限変更や特例があっても学習記録の見た目を壊さない）
// - 現在地・次の目的地がゲート圏に入ったら null に倒す（「入れない現在地」を作らない）
import type { AdventureMap, MapRegion } from './advMapModel';

/** 上位プランへの案内（unlock欄に出す。誇張しない・事実だけ） */
const UNLOCK_JA = 'AI体験パスで攻略できるのはここまで。1か月プラン・6か月コースで全地域が開きます（料金プランはホーム上部から）';
const UNLOCK_ZH = 'AI体验通行证可攻略的范围到此为止。1个月方案・6个月课程可解锁全部区域(价格方案见主页上方)';

/**
 * プランの地域上限をマップへ適用する。
 * @param limit 攻略できる試験レイヤー地域数（planCatalog.contentRegionLimit）。null＝ゲートなし
 */
export const gateAdventureMapForPlan = (map: AdventureMap, limit: number | null): AdventureMap => {
  if (limit === null || limit <= 0) return map;

  let examIndex = 0;
  const gatedIds = new Set<string>();
  const regions: MapRegion[] = map.regions.map((r) => {
    if (r.layer !== 'exam') return r;
    const idx = examIndex;
    examIndex += 1;
    if (idx < limit || r.state === 'done') return r;
    gatedIds.add(r.id);
    return {
      ...r,
      state: 'locked',
      masteryPct: null,
      unlockJa: UNLOCK_JA,
      unlockZh: UNLOCK_ZH,
      // 行き止まりにしない: ボタンは今日の冒険へ戻るだけ（既存のlocked地域と同じ流儀）
      action: {
        kind: 'today',
        labelJa: '今日の冒険へもどる',
        labelZh: '回到今天的冒险',
        reasonJa: `このプランで攻略できるのは最初の${limit}地域まで。今日のぶんはその範囲で進められます`,
        reasonZh: `本方案可攻略最初的${limit}个区域。今天的份量可以在该范围内推进`,
      },
    };
  });

  return {
    ...map,
    regions,
    currentRegionId: map.currentRegionId && gatedIds.has(map.currentRegionId) ? null : map.currentRegionId,
    nextRegionId: map.nextRegionId && gatedIds.has(map.nextRegionId) ? null : map.nextRegionId,
    doneCount: regions.filter((r) => r.state === 'done').length,
  };
};
