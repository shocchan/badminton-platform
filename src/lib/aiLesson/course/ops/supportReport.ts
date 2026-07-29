// 問い合わせ・不具合報告の contract（§17）。
//
// 送信先（メール・フォーム・外部サービス）は未確定なので、ここでは
// 「何を集めるか」「何を絶対に集めないか」だけを確定させ、送信はadapterに委ねる。
// 送信先の正式値はCEO判断待ち（decision packet参照）。
import { FORBIDDEN_EVENT_KEYS, type DeviceClass, type ErrorCode } from './errorCodes';

export type SupportCategory =
  | 'content_wrong'      // 内容が間違っている
  | 'answer_wrong'       // 問題の答えがおかしい
  | 'not_saved'          // 保存されない
  | 'audio_unavailable'  // 音声が使えない
  | 'layout_broken'      // 画面が崩れる
  | 'other';

export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, { ja: string; zh: string }> = {
  content_wrong: { ja: '内容が間違っている', zh: '内容有误' },
  answer_wrong: { ja: '問題の答えがおかしい', zh: '题目答案有问题' },
  not_saved: { ja: '保存されない', zh: '无法保存' },
  audio_unavailable: { ja: '音声が使えない', zh: '语音无法使用' },
  layout_broken: { ja: '画面が崩れる', zh: '页面显示异常' },
  other: { ja: 'その他', zh: '其他' },
};

/** 自動添付してよい情報だけを持つ型（§17の許可リスト） */
export interface SupportContext {
  route: string;
  feature: string;
  locale: 'ja' | 'zh';
  appVersion: string;
  contentVersion: string;
  deviceClass: DeviceClass;
  lastErrorCode?: ErrorCode;
  /** 対象の教材ID（本文ではなくIDのみ）。どの問題かを特定するために必要 */
  subjectId?: string;
}

export interface SupportReport {
  category: SupportCategory;
  /** learnerが書いた説明。送信可否はCEO判断待ちのため、既定では送らない */
  freeTextJa: string;
  context: SupportContext;
  createdAtMs: number;
}

export type SupportSendResult =
  | { ok: true; deliveredTo: 'adapter' }
  | { ok: false; code: 'SUPPORT_DESTINATION_UNSET' | 'SUPPORT_SEND_FAILED' };

export interface SupportAdapter {
  /** 送信先が未確定の間は null を返す実装を使う */
  send(payload: SupportPayload): Promise<SupportSendResult>;
}

/** 実際に外へ出す形。freeTextは既定で含めない（CEO判断で含める設定に変えられる） */
export interface SupportPayload {
  category: SupportCategory;
  context: SupportContext;
  createdAtMs: number;
  freeTextIncluded: false;
}

export const buildSupportPayload = (report: SupportReport): SupportPayload => ({
  category: report.category,
  context: report.context,
  createdAtMs: report.createdAtMs,
  freeTextIncluded: false,
});

/** payloadに禁止情報が混ざっていないかの検査（テストとruntimeの両方で使う） */
export const validateSupportPayload = (payload: SupportPayload): { ok: true } | { ok: false; leaked: string[] } => {
  const leaked: string[] = [];
  const walk = (obj: unknown, path: string) => {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (FORBIDDEN_EVENT_KEYS.includes(k)) leaked.push(`${path}.${k}`);
        walk(v, `${path}.${k}`);
      }
      return;
    }
    if (typeof obj === 'string') {
      if (/eyJ[A-Za-z0-9_-]{4,}\./.test(obj)) leaked.push(`${path}(jwt-like)`);
      if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(obj)) leaked.push(`${path}(email-like)`);
      if (obj.length > 300) leaked.push(`${path}(too-long)`);
    }
  };
  walk(payload, 'payload');
  return leaked.length ? { ok: false, leaked } : { ok: true };
};

/** 送信先未確定の既定adapter。learnerには「受け付けました」と偽らない */
export const createUnsetSupportAdapter = (): SupportAdapter & { queued: SupportPayload[] } => {
  const queued: SupportPayload[] = [];
  return {
    queued,
    async send(payload) {
      queued.push(payload);
      return { ok: false, code: 'SUPPORT_DESTINATION_UNSET' };
    },
  };
};
