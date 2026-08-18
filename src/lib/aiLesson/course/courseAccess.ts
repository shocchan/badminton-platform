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

/** 自分の受講権を読む（無ければ null。RLSで他人の行は見えない） */
export const fetchMyAccess = async (): Promise<CourseAccessRow | null> => {
  const { data, error } = await supabase
    .from('ai_course_access')
    .select('valid_from, valid_until, note')
    .maybeSingle();
  if (error || !data) return null;
  return {
    validFromISO: data.valid_from as string,
    validUntilISO: data.valid_until as string,
    note: (data.note as string) ?? null,
  };
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
