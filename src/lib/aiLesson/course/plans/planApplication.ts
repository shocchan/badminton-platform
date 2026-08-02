// 申込記録と同意記録（最小構成）。
//
// スコープ（CEO決定 2026-08-02）:
// - 契約・決済の複雑な状態管理は**持たない**。申込を受けたら人が確認して個別に案内する
// - 電子契約provider・契約書面生成・返金額の自動計算は**やらない**
// - production Stripe checkout は**有効化しない**
//
// それでも必ず残すもの:
// - **その人が何を見て申し込んだか**（`displayedPriceLabel` と `planVersion`）。
//   あとから価格を変えても、申込時点の表示を再現できる
// - **どの版の規約に同意したか**（`termsVersion`）。規約本文を直しても遡って壊れない
//
// 争いになったとき、こちらの手元に残る証拠はこれだけ。だから型で欠落を防ぐ。
import { planById, type PlanConfig, type PlanId } from './planCatalog';
import { TERMS_VERSION } from '../legal/termsVersion';

export type Locale = 'ja' | 'zh';

/**
 * 申込の状態。**決済や契約の状態ではない**（それは今回持たない）。
 * 人が確認して進める運用のための最小限。
 */
export type ApplicationStatus =
  | 'submitted'   // 申込を受け付けた
  | 'contacted'   // こちらから連絡した
  | 'accepted'    // 受け入れた
  | 'declined'    // お断りした
  | 'cancelled';  // 申込者が取り下げた

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'submitted', 'contacted', 'accepted', 'declined', 'cancelled',
];

export interface PlanApplication {
  applicationId: string;
  selectedPlanId: PlanId;
  /** 申込者が**実際に画面で見た**価格の文字列。カタログを直しても書き換えない */
  displayedPriceLabel: string;
  /** 申込時点のプラン内容の版。カタログのどの版を見たか特定できる */
  planVersion: number;
  applicationAt: string;
  locale: Locale;
  applicationStatus: ApplicationStatus;
  /** 連絡先。人が確認して個別に案内するため必須 */
  name: string;
  email: string;
  /** 任意の連絡事項 */
  note: string;
}

export interface TermsConsent {
  /** ログイン前の申込は applicationId、ログイン後は learnerId で紐づく */
  subjectId: string;
  subjectKind: 'application' | 'learner';
  termsVersion: string;
  consentedAt: string;
  locale: Locale;
}

/** 申込1件と、それに対応する同意1件 */
export interface ApplicationSubmission {
  application: PlanApplication;
  consent: TermsConsent;
}

/**
 * 申込IDを作る。crypto.randomUUID が無い環境（古いSafari）でも動くようにする。
 * 予測されて困る値ではないが、衝突しないことは要る。
 */
export const newApplicationId = (): string => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // fallback: 時刻＋乱数。UUID形式にはしない（本物のUUIDと見分けがつくように）
  return `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export interface BuildInput {
  plan: PlanConfig;
  locale: Locale;
  name: string;
  email: string;
  note?: string;
  nowISO: string;
  /** テスト用に固定できるようにする */
  applicationId?: string;
}

/**
 * 申込と同意を組み立てる。
 *
 * **価格ラベルとプラン版はここでカタログから写し取る。** 呼び出し側に渡させると、
 * 画面に出ていた値と食い違ったものが記録されうる（＝証拠として使えなくなる）。
 */
export const buildApplication = (input: BuildInput): ApplicationSubmission => {
  const { plan, locale, nowISO } = input;
  const applicationId = input.applicationId ?? newApplicationId();
  return {
    application: {
      applicationId,
      selectedPlanId: plan.id,
      displayedPriceLabel: locale === 'zh' ? plan.priceLabelZh : plan.priceLabelJa,
      planVersion: plan.version,
      applicationAt: nowISO,
      locale,
      applicationStatus: 'submitted',
      name: input.name.trim(),
      email: input.email.trim(),
      note: (input.note ?? '').trim(),
    },
    consent: {
      subjectId: applicationId,
      subjectKind: 'application',
      termsVersion: TERMS_VERSION,
      consentedAt: nowISO,
      locale,
    },
  };
};

export type ValidationError =
  | 'plan_not_found' | 'plan_not_accepting' | 'name_required'
  | 'email_invalid' | 'consent_required';

/**
 * 申込内容の検証。**画面のバリデーションとは別に、ここでも必ず通す。**
 * 画面だけで弾くと、draftのプランIDを直接投げられたときに受けてしまう。
 */
export const validateApplication = (input: {
  planId: string; name: string; email: string; consentChecked: boolean;
}): ValidationError[] => {
  const errors: ValidationError[] = [];
  const plan = planById(input.planId);
  if (!plan) errors.push('plan_not_found');
  // published 以外は受けない。draft を直接叩かれても通さない
  else if (plan.status !== 'published') errors.push('plan_not_accepting');
  if (input.name.trim().length === 0) errors.push('name_required');
  // 完全なRFC準拠は狙わない。打ち間違いを弾ければよい
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.push('email_invalid');
  if (!input.consentChecked) errors.push('consent_required');
  return errors;
};

export const VALIDATION_MESSAGE: Record<ValidationError, { ja: string; zh: string }> = {
  plan_not_found: { ja: 'プランが見つかりません', zh: '找不到该方案' },
  plan_not_accepting: { ja: 'このプランはいま申込を受け付けていません', zh: '该方案目前不接受报名' },
  name_required: { ja: 'お名前を入力してください', zh: '请填写姓名' },
  email_invalid: { ja: 'メールアドレスを正しく入力してください', zh: '请正确填写邮箱地址' },
  consent_required: { ja: '規約への同意が必要です', zh: '需要同意条款' },
};
