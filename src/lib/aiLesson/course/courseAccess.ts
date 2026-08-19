// 受講権（利用期間）の読み取りと判定（2026-08-18 CEO指示）。
//
// 「購入済み・学習できると認めた人だけ、ログインしたら日本語学習もできる」の実体。
// 事実は public.ai_course_access（user_idごとに valid_from / valid_until）が持ち、
// ここは読み取りと判定だけを行う。書き込みは管理画面（ai_is_admin のRLS）のみ。
import { supabase } from '../../../services/supabaseClient';

export interface CourseAccessRow {
  validFromISO: string;
  validUntilISO: string;
  note: string | null;
  /** 紐づく商品（planCatalog の PlanId）。手動発行の従来契約は null。
   * optional なのは、管理画面など期間判定だけに使う呼び出し側が
   * この2列を持たない行形でも accessStateOf を使えるようにするため */
  planId?: string | null;
  /** AI会話の累計上限秒（旧モデルの名残・現行商品では未使用）。null＝上限なし */
  aiSecondsLimit?: number | null;
  /** リアルタイム体験の分数（AI体験パス=60）。null＝リアルタイム制ではない */
  trialWindowMinutes?: number | null;
  /** 体験の開始時刻。null＝未開始（開始画面を出す）。開始で valid_until が開始+分数になる */
  trialStartedAtISO?: string | null;
}

export type CourseAccessState =
  | { kind: 'active'; row: CourseAccessRow }
  | { kind: 'not_started'; row: CourseAccessRow }   // valid_from がまだ来ていない
  | { kind: 'expired'; row: CourseAccessRow }
  | { kind: 'none' }                                 // 行が無い＝開通していない
  | { kind: 'admin' };                               // 管理者は常に通す

/** 判定の純関数（テスト対象）。時刻は呼び出し側が渡す */
export const accessStateOf = (
  row: CourseAccessRow | null, nowISO: string, isAdmin: boolean,
): CourseAccessState => {
  if (isAdmin) return { kind: 'admin' };
  if (!row) return { kind: 'none' };
  const now = Date.parse(nowISO);
  if (now < Date.parse(row.validFromISO)) return { kind: 'not_started', row };
  if (now > Date.parse(row.validUntilISO)) return { kind: 'expired', row };
  return { kind: 'active', row };
};

/** 自分の受講権を読む（無ければ null。RLSで他人の行は見えない）。
 * plan_id / ai_seconds_limit 列は 20260818130000 で追加済み（購入プランの表示に使う） */
export const fetchMyAccess = async (): Promise<CourseAccessRow | null> => {
  const { data, error } = await supabase
    .from('ai_course_access')
    .select('valid_from, valid_until, note, plan_id, ai_seconds_limit, trial_window_minutes, trial_started_at')
    .maybeSingle();
  if (error || !data) return null;
  return {
    validFromISO: data.valid_from as string,
    validUntilISO: data.valid_until as string,
    note: (data.note as string) ?? null,
    planId: (data.plan_id as string) ?? null,
    aiSecondsLimit: (data.ai_seconds_limit as number) ?? null,
    trialWindowMinutes: (data.trial_window_minutes as number) ?? null,
    trialStartedAtISO: (data.trial_started_at as string) ?? null,
  };
};

/**
 * リアルタイム体験（AI体験パス）を開始する。開始した瞬間から実時間でカウントし、
 * サーバーが valid_until を開始+分数へ書き換える（冪等。連打・リロードで縮まない）。
 */
export const startTrial = async (): Promise<
  | { ok: true; validUntilISO: string }
  | { ok: false; code: 'no_access' | 'not_trial_plan' | 'activation_expired' | 'not_started_yet' | 'network' }
> => {
  const { data, error } = await supabase.rpc('ai_start_trial');
  if (error || !data) return { ok: false, code: 'network' };
  const r = data as { ok: boolean; code?: string; validUntil?: string };
  if (r.ok && r.validUntil) return { ok: true, validUntilISO: r.validUntil };
  const code = (['no_access', 'not_trial_plan', 'activation_expired', 'not_started_yet'] as const)
    .find((c) => c === r.code) ?? 'network';
  return { ok: false, code };
};

/** サイト管理者か（バド側と同じ is_admin RPC。学習の受講権とは別軸） */
export const fetchIsSiteAdmin = async (): Promise<boolean> => {
  const { data } = await supabase.rpc('is_admin');
  return data === true;
};


/** 現在の受講状態（fetch＋判定）。ゲートはこれだけを見る */
export const fetchAccessState = async (nowISO = new Date().toISOString()): Promise<CourseAccessState> => {
  const [row, admin] = await Promise.all([fetchMyAccess(), fetchIsSiteAdmin()]);
  return accessStateOf(row, nowISO, admin);
};

/** 期限の見せ方（JSTの日付）。期限そのものはUTCで保存されている */
export const formatUntilJst = (iso: string, lang: 'ja' | 'zh'): string => {
  const d = new Date(iso);
  const y = d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' });
  return lang === 'zh' ? y.replace('/', '年').replace('/', '月') + '日' : y;
};
