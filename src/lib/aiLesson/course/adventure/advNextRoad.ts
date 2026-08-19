// 「次の道」判定（2026-08-19 CEO要望「N5全クリしたらN4,N3と道が増えていく」）。
//
// 原則13（実データだけで描く）: 判定に使うのは deriveMasteredStageIds が台帳から
// 導出した攻略済みstage集合のみ。「合格」とは言わない（言えるのはstage攻略の実測だけ）。
// pools未ロード時のフォールバック（targetID集合）では stageId が含まれず every が
// false になる＝カードは出ない側に安全に倒れる（偽陽性なし）。
import type { AdventureV2Profile, AdvRoute, JlptLevel } from './advTypes';
import { isConversationStage } from './advRoute';

/** 次の目標レベル。N2の先（N1）は未対応なので正直に null */
export const nextTargetOf = (t: JlptLevel | null): JlptLevel | null =>
  t === 'N5' ? 'N4' : t === 'N4' ? 'N3' : t === 'N3' ? 'N2' : null;

export interface NextRoad {
  /** 制覇した（＝現目標の試験系stageを全攻略した）レベル */
  clearedLevel: JlptLevel;
  /** 次の目標。null＝ソラノ塔まで到達済み（N1未対応） */
  nextLevel: JlptLevel | null;
}

/**
 * 現目標の試験系stage（mock_boss含む）を全攻略していれば「次の道」を返す。
 * 会話stageは攻略条件（別日3回80%＋7日後確認）を満たせない並走レーンなので母数に入れない。
 * 会話のみの目標・目標未設定・ルート無しは対象外。
 */
export const nextRoadOf = (
  profile: AdventureV2Profile, route: AdvRoute | null, stageDone: Set<string>,
): NextRoad | null => {
  if (!route || profile.goalType === 'conversation' || !profile.targetJlpt) return null;
  const gated = route.stages.filter((s) => !isConversationStage(s));
  if (gated.length === 0 || !gated.every((s) => stageDone.has(s.stageId))) return null;
  return { clearedLevel: profile.targetJlpt, nextLevel: nextTargetOf(profile.targetJlpt) };
};
