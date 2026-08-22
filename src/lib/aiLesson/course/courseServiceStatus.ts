// AI会話が使える状態かどうか（2026-08-23 CEO指示）。
//
// なぜ要るか:
//   OpenAIのクレジットが尽きると会話系のAPIだけが止まる。
//   そのとき生徒に見せたいのは赤いエラーではなく「AI会話はアップデート中です」の一文で、
//   復習ノート・マイ表現・ロードマップ・履歴といったAIを使わない機能は普通に触れてほしい。
//
// 判断の出どころは1つ（RPC `ai_service_status`）に固める。
// 画面ごとに ai_config を読みに行くと値がずれるため、ここを唯一の入口にする。

import { supabase } from '../../../services/supabaseClient';

export interface ServiceStatus {
  /** true のあいだ、AI会話の入口は「アップデート中」に差し替える */
  chatPaused: boolean;
}

const OK: ServiceStatus = { chatPaused: false };

/** 画面遷移のたびに問い合わせないための短いキャッシュ */
const TTL_MS = 60_000;
let cache: { at: number; value: ServiceStatus } | null = null;

/**
 * 状態を取る。**失敗したら「使える」を返す**（フェイルオープン）。
 * 状態取得の不調で、本当は動くAI会話まで塞いでしまうほうが損失が大きいため。
 * 実際に止まっていれば会話開始時の 503 で必ず捕まえられる（二重の網）。
 */
export const getServiceStatus = async (force = false): Promise<ServiceStatus> => {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const { data, error } = await supabase.rpc('ai_service_status');
    if (error || !data) return OK;
    const value: ServiceStatus = { chatPaused: (data as { chatPaused?: boolean }).chatPaused === true };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return OK;
  }
};

/**
 * 会話APIが 503 `ai_unavailable` を返したときに呼ぶ。
 * 次に状態を聞かれたら即「停止中」を返せるよう、キャッシュを書き換える。
 */
export const markChatPaused = (): void => {
  cache = { at: Date.now(), value: { chatPaused: true } };
};

/** 手動でキャッシュを捨てる（復旧したか確かめ直したいとき） */
export const clearServiceStatusCache = (): void => { cache = null; };
