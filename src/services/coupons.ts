// 無料券（クーポン）関連のAPI。
// 受け取り確定（guest→user引き継ぎ）は claim-coupons Edge Function、
// 自分のクーポン一覧はRLS（user_id = auth.uid()）で保護されたSELECT。

import { supabase } from './supabaseClient';
import { getDeviceUuid } from '../lib/deviceId';

export type CouponType = 'ramen' | 'badminton';
export type CouponStatus = 'unclaimed' | 'claimed' | 'reserved' | 'used';

export interface Coupon {
  id: string;
  type: CouponType;
  status: CouponStatus;
  issued_at: string;
  claimed_at: string | null;
  used_at: string | null;
}

export interface ClaimResult {
  claimedCount: number;
  coupons: { id: string; type: CouponType }[];
}

/** この端末のゲスト当選クーポン・プレイ履歴をログイン中のアカウントへ引き継ぐ */
export async function claimGuestCoupons(): Promise<ClaimResult> {
  const { data, error } = await supabase.functions.invoke('claim-coupons', {
    body: { deviceUuid: getDeviceUuid() },
  });
  if (error) throw error;
  return data as ClaimResult;
}

/** ログイン中ユーザーの保有クーポン一覧 */
export async function fetchMyCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('id, type, status, issued_at, claimed_at, used_at')
    .order('issued_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Coupon[];
}

/** クーポン提示用の短いコード（IDの先頭8桁） */
export function couponCode(coupon: Pick<Coupon, 'id'>): string {
  return coupon.id.slice(0, 8).toUpperCase();
}
