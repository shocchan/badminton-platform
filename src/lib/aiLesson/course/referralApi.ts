// 紹介のDB読み書き（2026-09-09 P1-5）。判定と文面は referral.ts（純関数）。
import { supabase } from '../../../services/supabaseClient';
import { anonId } from './attribution';
import { readReferralFromSearch, rememberReferral, storedReferral } from './referral';

export interface MyReferral {
  code: string;
  /** リンクを開いてもらった数 */
  invited: number;
  /** そのうち有料購入まで進んだ数 */
  purchased: number;
  rewardedDays: number;
  rewardDaysPerPurchase: number;
  rewardDaysCap: number;
  inviteeDiscountPercent: number;
  /** Stripeのクーポンが設定済みか。false のときは割引を約束する文言を出さない */
  inviteeDiscountReady: boolean;
}

/** 自分の紹介コード（無ければサーバー側で作られる） */
export const fetchMyReferral = async (): Promise<MyReferral | null> => {
  const { data, error } = await supabase.rpc('ai_my_referral');
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null;
  const d = data as Record<string, unknown>;
  return {
    code: String(d.code ?? ''),
    invited: Number(d.invited ?? 0),
    purchased: Number(d.purchased ?? 0),
    rewardedDays: Number(d.rewardedDays ?? 0),
    rewardDaysPerPurchase: Number(d.rewardDaysPerPurchase ?? 30),
    rewardDaysCap: Number(d.rewardDaysCap ?? 90),
    inviteeDiscountPercent: Number(d.inviteeDiscountPercent ?? 50),
    inviteeDiscountReady: d.inviteeDiscountReady === true,
  };
};

/**
 * URLに紹介コードがあれば覚えて、サーバーへ1回だけ知らせる。
 * **アプリ起動時に1回だけ**呼ぶ（captureTouch と同じ場所）。
 * 失敗しても画面は何も変えない（紹介の記録は学習より優先しない）。
 */
export const captureReferral = (): void => {
  try {
    const fromUrl = readReferralFromSearch(window.location.search);
    if (fromUrl) rememberReferral(fromUrl);
    const code = fromUrl ?? storedReferral();
    if (!code) return;
    const anon = anonId();
    if (!anon) return;
    void supabase.rpc('ai_referral_touch', { p_code: code, p_anon_id: anon });
  } catch { /* 計測の失敗で画面を止めない */ }
};
