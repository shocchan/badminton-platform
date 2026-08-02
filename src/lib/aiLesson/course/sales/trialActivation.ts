// 60分AIパスの「開始」と24時間の管理（§4 §5）。**純関数**。
//
// なぜ購入と開始を分けるか:
//   購入した瞬間に24時間が減り始めると、「買ったけど今夜は時間が無い」人が
//   何もしないまま失う。それは商品として不誠実なので、開始操作を挟む。
//   ただし無期限に寝かせられても在庫管理ができないので、開始にも期限を置く（既定7日）。
//
// 時計はサーバーを正準にする。client の Date.now() は利用者が変えられるので、
//   ここに渡す nowMs は**必ずサーバー由来の時刻**であること。
//   （呼び出し側の取り違えを防ぐため、引数名を serverNowMs にしている）

import type { SalesPlanConfig } from './planConfig';

/**
 * 体験パスの状態。
 * - `unstarted`   … 購入済み。まだ開始していない（時間は1秒も減っていない）
 * - `active`      … 開始済み。24時間以内かつ残り時間あり
 * - `consumed`    … 累計時間を使い切った
 * - `expired`     … 開始から24時間が過ぎた（残り時間があっても使えない）
 * - `start_lapsed`… 開始しないまま開始期限が過ぎた
 */
export type TrialState = 'unstarted' | 'active' | 'consumed' | 'expired' | 'start_lapsed';

/** 開始の記録。**発行後は書き換えない**（開始し直しはできない） */
export interface TrialActivation {
  grantId: string;
  learnerId: string;
  activatedAtMs: number;
  /** activatedAtMs + validityHours。丸n時間であって「その日の終わり」ではない */
  expiresAtMs: number;
}

/** 時間制の利用枠1つ。購入で1行できる */
export interface TrialGrant {
  id: string;
  learnerId: string;
  purchaseId: string;
  planId: string;
  planVersion: number;
  purchasedAtMs: number;
  /** 開始期限。ここを過ぎると開始できない */
  startDeadlineMs: number;
  includedActiveSeconds: number;
  /** 未開始なら null */
  activation: TrialActivation | null;
}

/** 状態の解決に必要な入力をまとめる（引数の取り違えを型で防ぐ） */
export interface TrialResolution {
  state: TrialState;
  /** 残りの累計アクティブ秒数。使い切り・期限切れなら 0 */
  remainingActiveSeconds: number;
  /** 開始済みなら、24時間の期限まであと何ミリ秒か。未開始なら null */
  msUntilExpiry: number | null;
  /** 未開始なら、開始期限まであと何ミリ秒か。開始済みなら null */
  msUntilStartDeadline: number | null;
  /** 新しい教材を取得してよいか。**locked/expired の判定はここを唯一の根拠にする** */
  canConsumeContent: boolean;
}

/** 購入から grant を作る。開始はしない */
export const createTrialGrant = (input: {
  id: string;
  learnerId: string;
  purchaseId: string;
  plan: SalesPlanConfig;
  purchasedAtMs: number;
}): TrialGrant => {
  const { plan } = input;
  if (plan.includedActiveSeconds === null || plan.startDeadlineDays === null) {
    throw new Error(`${plan.planId} は時間制プランではない（開始モデルを持たない）`);
  }
  return {
    id: input.id,
    learnerId: input.learnerId,
    purchaseId: input.purchaseId,
    planId: plan.planId,
    planVersion: plan.version,
    purchasedAtMs: input.purchasedAtMs,
    startDeadlineMs: input.purchasedAtMs + plan.startDeadlineDays * 86_400_000,
    includedActiveSeconds: plan.includedActiveSeconds,
    activation: null,
  };
};

export type ActivationError = 'already_activated' | 'start_deadline_passed' | 'not_a_trial_plan';

export interface ActivationResult {
  ok: boolean;
  error?: ActivationError;
  grant?: TrialGrant;
}

/**
 * 体験を開始する。**同じ grant に対して2回目は成功しない**（べき等ではなく拒否）。
 * 2回目を成功にすると、24時間を押し直せてしまう。
 */
export const activateTrial = (
  grant: TrialGrant,
  plan: SalesPlanConfig,
  serverNowMs: number,
): ActivationResult => {
  if (plan.validityHoursAfterActivation === null) return { ok: false, error: 'not_a_trial_plan' };
  if (grant.activation) return { ok: false, error: 'already_activated' };
  if (serverNowMs > grant.startDeadlineMs) return { ok: false, error: 'start_deadline_passed' };

  return {
    ok: true,
    grant: {
      ...grant,
      activation: {
        grantId: grant.id,
        learnerId: grant.learnerId,
        activatedAtMs: serverNowMs,
        expiresAtMs: serverNowMs + plan.validityHoursAfterActivation * 3_600_000,
      },
    },
  };
};

/**
 * 今この grant がどの状態か。
 * 消費秒数は learner 単位の実績を渡す（grant ごとに持たない理由は entitlement.ts 参照）。
 */
export const resolveTrial = (
  grant: TrialGrant,
  consumedActiveSeconds: number,
  serverNowMs: number,
): TrialResolution => {
  const remaining = Math.max(grant.includedActiveSeconds - Math.max(consumedActiveSeconds, 0), 0);

  if (!grant.activation) {
    const lapsed = serverNowMs > grant.startDeadlineMs;
    return {
      state: lapsed ? 'start_lapsed' : 'unstarted',
      // 未開始なら1秒も減っていない。ここで remaining を返すと
      // 「開始前に残り時間が減って見える」事故になる
      remainingActiveSeconds: lapsed ? 0 : grant.includedActiveSeconds,
      msUntilExpiry: null,
      msUntilStartDeadline: lapsed ? 0 : grant.startDeadlineMs - serverNowMs,
      canConsumeContent: false,
    };
  }

  // 期限切れは使い切りより優先する。
  // 「残り0で期限も切れた」を consumed と呼ぶと、追加購入すれば続けられると誤解させる
  if (serverNowMs >= grant.activation.expiresAtMs) {
    return {
      state: 'expired',
      remainingActiveSeconds: 0,
      msUntilExpiry: 0,
      msUntilStartDeadline: null,
      canConsumeContent: false,
    };
  }

  if (remaining <= 0) {
    return {
      state: 'consumed',
      remainingActiveSeconds: 0,
      msUntilExpiry: grant.activation.expiresAtMs - serverNowMs,
      msUntilStartDeadline: null,
      canConsumeContent: false,
    };
  }

  return {
    state: 'active',
    remainingActiveSeconds: remaining,
    msUntilExpiry: grant.activation.expiresAtMs - serverNowMs,
    msUntilStartDeadline: null,
    canConsumeContent: true,
  };
};

/**
 * 複数の grant（再購入ぶん）から、いま使うべき1つを選ぶ。
 *
 * 選び方: active があればそれ。無ければ unstarted のうち**開始期限が最も近いもの**。
 * 期限の近いものから使わないと、寝かせている枠が黙って失効する。
 */
export const pickCurrentTrialGrant = (
  grants: TrialGrant[],
  consumedActiveSeconds: number,
  serverNowMs: number,
): { grant: TrialGrant; resolution: TrialResolution } | null => {
  if (grants.length === 0) return null;

  // 消費は learner 単位なので、古い grant から順に割り当てて各 grant の消費量を出す
  const ordered = [...grants].sort((a, b) => a.purchasedAtMs - b.purchasedAtMs);
  let left = Math.max(consumedActiveSeconds, 0);
  const resolved = ordered.map((g) => {
    const used = Math.min(left, g.includedActiveSeconds);
    left -= used;
    return { grant: g, resolution: resolveTrial(g, used, serverNowMs) };
  });

  const active = resolved.find((r) => r.resolution.state === 'active');
  if (active) return active;

  const unstarted = resolved
    .filter((r) => r.resolution.state === 'unstarted')
    .sort((a, b) => a.grant.startDeadlineMs - b.grant.startDeadlineMs);
  if (unstarted.length > 0) return unstarted[0];

  // すべて終わっている場合は、直近のものを返す（画面で「終了しました」を出すため）
  return resolved[resolved.length - 1];
};

/** 開始前の確認画面に出す値（§4）。画面はここから読むだけにする */
export interface TrialStartPreview {
  purchasedAtMs: number;
  startDeadlineMs: number;
  validityHours: number;
  includedActiveSeconds: number;
  autoRenew: boolean;
  canActivate: boolean;
}

export const trialStartPreview = (
  grant: TrialGrant,
  plan: SalesPlanConfig,
  serverNowMs: number,
): TrialStartPreview => ({
  purchasedAtMs: grant.purchasedAtMs,
  startDeadlineMs: grant.startDeadlineMs,
  validityHours: plan.validityHoursAfterActivation ?? 0,
  includedActiveSeconds: grant.includedActiveSeconds,
  autoRenew: plan.autoRenew,
  canActivate: !grant.activation && serverNowMs <= grant.startDeadlineMs,
});
