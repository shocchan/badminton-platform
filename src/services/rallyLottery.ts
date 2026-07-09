// バド対決ゲームの抽選API呼び出し。
// 当落判定は必ずサーバー（Edge Function: rally-lottery）側で行う。
// クライアントは到達ラリー数と端末IDを送り、結果を受け取るだけ。

import { supabase } from './supabaseClient';
import { getDeviceUuid } from '../lib/deviceId';

/**
 * 抽選1回に必要なラリー数（表示用）。
 * 実際の判定はサーバーの lottery_config.rallies_per_draw が正。値を変えるときは両方更新する。
 */
export const RALLIES_PER_DRAW = 15;

export interface LotteryResult {
  /** 実際に抽選した回数（0 = 本日の抽選上限到達） */
  drawCount: number;
  isWinner: boolean;
  prizeType: 'ramen' | 'badminton' | null;
  dailyLimited: boolean;
}

// 同一ゲームの二重送信ガード（React StrictModeのeffect二重実行や連打対策）。
// 5秒以内の同ラリー数のリクエストは同じPromiseを返す。
let lastCall: { key: string; at: number; promise: Promise<LotteryResult> } | null = null;

export function drawRallyLottery(rallyCount: number): Promise<LotteryResult> {
  const key = String(rallyCount);
  if (lastCall && lastCall.key === key && Date.now() - lastCall.at < 5000) {
    return lastCall.promise;
  }
  const promise = (async () => {
    const { data, error } = await supabase.functions.invoke('rally-lottery', {
      body: { deviceUuid: getDeviceUuid(), rallyCount },
    });
    if (error) throw error;
    return data as LotteryResult;
  })();
  lastCall = { key, at: Date.now(), promise };
  return promise;
}
