// 30秒ノックのスコアをサーバー（game_plays）に記録・照会する。
//
// 自己ベストと直近10回は **サーバーが正**。localStorage は控え（RPCが無い/落ちたとき用）。
// マイグレーション 20260825100000_game_knock_mode.sql を当てるまでは
// RPC が存在しないので全て失敗する。そのときは静かに localStorage だけで動く
// ＝ **本番の既定の挙動は何も変わらない**。
//
// ⚠️ 抽選（rally-lottery Edge Function）はこの経路を通らない。
//    ノックモードのプレイは draw_count=0 で入るので、抽選・クーポン発行には一切関与しない。

import { supabase } from './supabaseClient';
import { getDeviceUuid } from '../lib/deviceId';

export interface KnockPlayRow {
  score: number;
  maxCombo: number;
  playedAt: string;
}

export interface KnockScoreSnapshot {
  best: number;
  recent: KnockPlayRow[];
}

interface RawScores {
  best?: number | null;
  recent?: { score?: number | null; max_combo?: number | null; played_at?: string | null }[] | null;
}

/** 自己ベストと直近10回。RPCが無い・通信できないときは null（＝localStorageにフォールバック） */
export async function fetchKnockScores(): Promise<KnockScoreSnapshot | null> {
  try {
    const { data, error } = await supabase.rpc('game_device_scores', {
      p_device_uuid: getDeviceUuid(),
      p_mode: 'knock',
    });
    if (error || !data) return null;
    const raw = data as RawScores;
    return {
      best: Number(raw.best ?? 0) || 0,
      recent: (raw.recent ?? []).map((r) => ({
        score: Number(r.score ?? 0) || 0,
        maxCombo: Number(r.max_combo ?? 0) || 0,
        playedAt: String(r.played_at ?? ''),
      })),
    };
  } catch {
    return null;
  }
}

/** 1プレイを記録する。0本でも必ず送る（0ラリーが記録すらされていなかったのを直すため） */
export async function recordKnockPlay(score: number, maxCombo: number): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('game_record_knock_play', {
      p_device_uuid: getDeviceUuid(),
      p_score: Math.max(0, Math.floor(score)),
      p_max_combo: Math.max(0, Math.floor(maxCombo)),
    });
    return !error;
  } catch {
    return false;
  }
}
