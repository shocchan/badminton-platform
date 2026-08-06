import type { Tournament } from '../types';

// ── 申込締切のルール ──────────────────────────────────────────
// 【全大会共通】開催日の14日前 23:59:59（日本時間）で申し込みを締め切る。
//   このルールは緩めない。下の override が無い大会は必ずこれが適用される。
//
// 【個別override】tournaments.late_entry_until（timestamptz / 既定 NULL）に
//   日時が入っている大会だけ、その日時まで「追加受付」として例外的に受け付ける。
//   ・NULL の大会は一切影響を受けない（＝共通ルールのまま）
//   ・共通ルールより手前の日時を入れても、締切が早まるだけで緩和にはならない
//   ・追加受付中はオンラインのクレジットカード決済のみを許可する
//
// 判定は必ずサーバー側（RLS/RPC・Edge Function）でも行う。ここはあくまで表示用。
// 同じ判定式を SQL 側 public.tournament_entry_deadline() が持つ。
// ─────────────────────────────────────────────────────────────

export const DEFAULT_LEAD_DAYS = 14;

/** 'YYYY-MM-DD' を日本時間の指定時刻として解釈する（閲覧者のTZに左右されない） */
const jst = (dateStr: string, time = '00:00:00') =>
  new Date(`${dateStr.slice(0, 10)}T${time}+09:00`);

/** 共通ルールの締切（開催14日前 23:59:59 JST） */
export const standardEntryDeadline = (eventDate: string): Date => {
  const d = jst(eventDate);
  d.setUTCDate(d.getUTCDate() - DEFAULT_LEAD_DAYS);
  // 同じ日の 23:59:59 JST に合わせる
  const ymd = new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return jst(ymd, '23:59:59');
};

/** その大会に実際に適用される締切。override があればそちらを使う */
export const effectiveEntryDeadline = (t: Pick<Tournament, 'event_date' | 'late_entry_until'>): Date =>
  t.late_entry_until ? new Date(t.late_entry_until) : standardEntryDeadline(t.event_date);

/** 追加受付（override）が設定され、かつ今まさにその期間中か */
export const isLateEntryWindow = (
  t: Pick<Tournament, 'event_date' | 'late_entry_until'>,
  now: Date = new Date(),
): boolean => {
  if (!t.late_entry_until) return false;
  const until = new Date(t.late_entry_until);
  if (now > until) return false;
  // 共通ルールの締切をまだ過ぎていないなら通常受付。override は延長にだけ意味を持つ
  return now > standardEntryDeadline(t.event_date);
};

/** 申し込みを締め切っているか */
export const isEntryClosed = (
  t: Pick<Tournament, 'event_date' | 'late_entry_until'>,
  now: Date = new Date(),
): boolean => now > effectiveEntryDeadline(t);

/**
 * 追加受付中はオンラインのクレジットカード決済のみ。
 * 通常受付では従来どおり全ての支払い方法を出す。
 */
export const isCreditOnly = (
  t: Pick<Tournament, 'event_date' | 'late_entry_until'>,
  now: Date = new Date(),
): boolean => isLateEntryWindow(t, now);

/**
 * 「8月10日（月）23:59」/「8月10日（周一）23:59」形式。必ず日本時間で表示する。
 * ロケールの区切り文字に依存しないよう、数値部分だけ取り出して自前で組み立てる。
 */
export const formatDeadline = (d: Date, lang: 'ja' | 'zh'): string => {
  const parts = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(x => x.type === t)?.value ?? '';
  // zh-CN の weekday short は「周一」、ja-JP は「月」
  return `${get('month')}月${get('day')}日（${get('weekday')}）${get('hour')}:${get('minute')}`;
};
