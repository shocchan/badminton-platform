// ラリーゲームの自己ベストを**アカウント単位**で取る（2026-09-09）。
//
// これまでマイページは localStorage（kawabado_rally_best）を読んでいた。
// あれは端末に1つしかない値なので、同じブラウザで別のアカウントに入れ替えても
// 同じ数字が出る＝**他人の記録が自分の記録として表示されていた**（実機で全員19）。
//
// サーバー（game_plays.user_id）が正。RPCが無い・通信できないときは null を返し、
// 呼び出し側は「まだ記録がありません」を出す。**localStorageで埋めない**
// ＝埋めると今回のバグに戻る。

import { supabase } from './supabaseClient';

/**
 * ログイン中の本人の自己ベスト。
 * - 記録なし … 0
 * - **未ログイン** … null（端末の値を消さないため。RPCは未ログインでも0を返すので、
 *   ここで区別しないとゲストの自己ベストが0で塗り潰される）
 * - RPCが無い／通信できない … null（数字を作らない）
 */
export async function fetchMyRallyBest(): Promise<number | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.rpc('game_my_best', { p_mode: 'rally' });
    if (error) return null;
    const n = Number(data);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  } catch {
    return null;
  }
}
