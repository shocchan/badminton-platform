// 管理画面: 配った個人リンク（平文）と、誰が誰を招待したか（2026-09-13 CEO指示）。管理者だけ。
import { supabase } from '../../../../services/supabaseClient';
import { formatLearningCode } from '../learningCode';

export interface PlainLearningCode {
  userId: string;
  code: string;
  issuedAtISO: string;
  useCount: number;
  lastUsedAtISO: string | null;
}

/** 有効な個人リンクの平文（1人1件・最新）。平文が無い（2026-09-13 より前に発行）人は含まれない */
export const fetchPlainLearningCodes = async (): Promise<Map<string, PlainLearningCode>> => {
  const { data, error } = await supabase.rpc('ai_admin_learning_code_plain');
  const m = new Map<string, PlainLearningCode>();
  if (error || !data || (data as { ok?: boolean }).ok !== true) return m;
  for (const r of ((data as { rows?: Record<string, unknown>[] }).rows ?? [])) {
    const userId = String(r.userId ?? '');
    const code = String(r.code ?? '');
    if (!userId || !code) continue;
    m.set(userId, {
      userId, code, issuedAtISO: String(r.issuedAt ?? ''), useCount: Number(r.useCount ?? 0),
      lastUsedAtISO: typeof r.lastUsedAt === 'string' ? r.lastUsedAt : null,
    });
  }
  return m;
};

export const learnUrlOf = (code: string, lang: 'ja' | 'zh'): string =>
  `https://study.kawabado.com/${lang}/learn/${formatLearningCode(code)}`;

export interface ReferralTreeRow {
  referrerUserId: string;
  referrerName: string;
  code: string;
  rewardKind: 'choice' | 'week';
  inviteeUserId: string;
  inviteeName: string;
  inviteeEmail: string;
  wechatId: string | null;
  signedUpAtISO: string;
  startedAtISO: string | null;
  diagnosedAtISO: string | null;
  perk: string | null;
  rewardedAtISO: string | null;
  isTest: boolean;
}

export const fetchReferralTree = async (): Promise<ReferralTreeRow[]> => {
  const { data, error } = await supabase.rpc('ai_admin_referral_tree');
  if (error || !data || (data as { ok?: boolean }).ok !== true) return [];
  return (((data as { rows?: Record<string, unknown>[] }).rows) ?? []).map((r) => ({
    referrerUserId: String(r.referrerUserId ?? ''),
    referrerName: String(r.referrerName ?? ''),
    code: String(r.code ?? ''),
    rewardKind: r.rewardKind === 'week' ? 'week' : 'choice',
    inviteeUserId: String(r.inviteeUserId ?? ''),
    inviteeName: String(r.inviteeName ?? ''),
    inviteeEmail: String(r.inviteeEmail ?? ''),
    wechatId: typeof r.wechatId === 'string' ? r.wechatId : null,
    signedUpAtISO: String(r.signedUpAt ?? ''),
    startedAtISO: typeof r.startedAt === 'string' ? r.startedAt : null,
    diagnosedAtISO: typeof r.diagnosedAt === 'string' ? r.diagnosedAt : null,
    perk: typeof r.perk === 'string' ? r.perk : null,
    rewardedAtISO: typeof r.rewardedAt === 'string' ? r.rewardedAt : null,
    isTest: r.isTest === true,
  }));
};

/** 紹介先1件の状態（一覧・詳細で同じ言葉を使う） */
export const referralStageOf = (r: ReferralTreeRow): '登録' | '開始' | '診断済' | '延長済' | '上限' => {
  if (r.rewardedAtISO) return r.rewardKind === 'week' ? '延長済' : '延長済';
  if (r.perk === 'week' && !r.rewardedAtISO) return '上限';
  if (r.diagnosedAtISO) return '診断済';
  if (r.startedAtISO) return '開始';
  return '登録';
};
