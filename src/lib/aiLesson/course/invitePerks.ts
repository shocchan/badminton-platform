/*
 * 紹介した生徒への特典（2026-09-12 CEO決定）。
 *
 * 生徒専用の招待コードから申し込んだ人が「7日間を始める」を押すと、紹介した生徒に
 * 特典を1つ選ぶ権利ができる（DB: ai_invite_perks・20260912120000）。
 * ここは読み書きと、3つの特典の文言。画面は components/ai-course/InvitePerkScreen.tsx。
 *
 * - 1か月追加（month）はサーバーがその場で受講期限を +30日にする
 * - オリジナルMV（mv）・文法完全版（grammar）は「選んだ」記録だけ。渡すのは先生（管理画面）
 *   文法完全版はスライドのURLをその場で出す（すぐ受け取れる）
 */
import { supabase } from '../../../services/supabaseClient';

export type InvitePerkId = 'mv' | 'month' | 'grammar';

export interface InvitePerk {
  id: string;
  inviteeName: string | null;
  createdAt: string;
  perk: InvitePerkId | null;
  chosenAt: string | null;
  fulfilledAt: string | null;
}

/** 日本語会話用の文法完全版（Googleスライド）。CEO提供 2026-09-12 */
export const GRAMMAR_DECK_URL =
  'https://docs.google.com/presentation/d/1ZEfZZBGT3z63t7hWtCYgBOy41vMX8GA1ea4w5p0gACw/edit';

export const PERK_OPTIONS: { id: InvitePerkId; ja: { title: string; body: string }; zh: { title: string; body: string } }[] = [
  {
    id: 'mv',
    ja: { title: 'オリジナルMV', body: 'あなたのために1本つくります。できあがったら先生からWeChatでお渡しします。' },
    zh: { title: '原创MV', body: '为你专门制作一支。做好后老师会通过微信发给你。' },
  },
  {
    id: 'month',
    ja: { title: 'システム利用 1か月追加', body: 'いまの受講期限が30日のびます。選んだ瞬間に反映されます。' },
    zh: { title: '系统使用期延长1个月', body: '你现在的使用期限延长30天。选择后立即生效。' },
  },
  {
    id: 'grammar',
    ja: { title: '日本語会話用の文法完全版', body: '会話で使う文法をまとめたスライド。選ぶとすぐ開けます。' },
    zh: { title: '日语会话语法完全版', body: '会话常用语法的整套幻灯片。选择后马上就能打开。' },
  },
];

export const perkTitle = (id: InvitePerkId, lang: 'ja' | 'zh'): string =>
  PERK_OPTIONS.find((p) => p.id === id)?.[lang].title ?? id;

/** 自分の権利（未選択・選択済みの両方） */
export const fetchMyInvitePerks = async (): Promise<InvitePerk[]> => {
  const { data, error } = await supabase.rpc('ai_my_invite_perks');
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((d) => ({
    id: String(d.id),
    inviteeName: typeof d.inviteeName === 'string' && d.inviteeName ? d.inviteeName : null,
    createdAt: String(d.createdAt ?? ''),
    perk: (['mv', 'month', 'grammar'] as const).find((p) => p === d.perk) ?? null,
    chosenAt: typeof d.chosenAt === 'string' ? d.chosenAt : null,
    fulfilledAt: typeof d.fulfilledAt === 'string' ? d.fulfilledAt : null,
  }));
};

/** まだ選んでいない権利だけ（「紹介おめでとう」画面を出す判定） */
export const pendingInvitePerks = (rows: InvitePerk[]): InvitePerk[] => rows.filter((r) => r.perk === null);

export const chooseInvitePerk = async (id: string, perk: InvitePerkId): Promise<
  | { ok: true; validUntilISO: string | null }
  | { ok: false; code: 'no_access' | 'not_found' | 'invalid_perk' | 'network' }
> => {
  const { data, error } = await supabase.rpc('ai_choose_invite_perk', { p_id: id, p_perk: perk });
  if (error || !data) return { ok: false, code: 'network' };
  const r = data as { ok: boolean; code?: string; validUntil?: string };
  if (r.ok) return { ok: true, validUntilISO: typeof r.validUntil === 'string' ? r.validUntil : null };
  const code = (['no_access', 'not_found', 'invalid_perk'] as const).find((c) => c === r.code) ?? 'network';
  return { ok: false, code };
};
