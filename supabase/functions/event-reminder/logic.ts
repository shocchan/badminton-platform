// 開催前日リマインドの「誰に送るか」と「本文」。
//
// なぜ要るか（2026-08-24 実測）:
//   大会エントリー22件のうち15件が cancelled（68%）。開催日を起点にした自動送信は
//   **1本も無かった**（event_date を使うのは支払期限との突合だけ）。
//   前日に「いつ・どこで・何を持って・やめるならここから」を一度渡すのは、
//   直前離脱を減らすうえで最も安い打ち手であり、行けない人にとっても親切。
//
// Edge Function（Deno）とローカルのテスト（vitest）の両方から読めるように、
// **I/Oを含まない純粋な関数だけ**をここに置く。
import { maskEmail } from "../_shared/aiCourseLifecycle.ts";

export const REMINDER_SITE = "https://kawabado.com";
/** 何日前に送るか。1 = 前日 */
export const REMIND_DAYS_BEFORE = 1;

export type EventKind = "tournament" | "activity";

export interface ReminderEvent {
  kind: EventKind;
  /** 大会は数値ID、通常活動は uuid。どちらも文字列で扱う */
  id: string;
  title: string;
  /** JSTの開催日 'YYYY-MM-DD' */
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  address: string | null;
  /** 大会のみ。持ち物の判定に使う（HTMLのまま渡してよい・本文には出さない） */
  description?: string | null;
  /** 通常活動のみ。参加費 */
  priceJpy?: number | null;
  /** 開催中止・非公開を弾くための状態。大会 'active' / 通常活動 'open' が生きている */
  status: string | null;
}

export interface ReminderEntry {
  kind: EventKind;
  /** 申込のID（大会は数値、通常活動は uuid） */
  entryId: string;
  eventId: string;
  name: string | null;
  /** 通常活動は列自体がまだ無い場合がある。null / undefined を必ず許す */
  email?: string | null;
  status: string | null;
  isCancelled?: boolean | null;
  /** 大会のみ。メールのキャンセル導線に使う一件一意のトークン */
  cancelToken?: string | null;
  quantity?: number | null;
}

export interface ReminderTarget {
  event: ReminderEvent;
  entry: ReminderEntry;
  email: string;
  dedupeKey: string;
}

/** ある時刻のJSTの日付 'YYYY-MM-DD' */
export const jstDate = (ms: number): string =>
  new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

/** リマインド対象の開催日（既定は「明日」） */
export const reminderTargetDate = (nowMs: number, daysBefore = REMIND_DAYS_BEFORE): string =>
  jstDate(nowMs + daysBefore * 86_400_000);

/** 冪等キー。同じ人・同じ開催回で一度だけ */
export const eventReminderDedupeKey = (kind: EventKind, entryId: string): string =>
  `event_reminder:${kind}:${entryId}`;

const LIVE_STATUS: Record<EventKind, string> = { tournament: "active", activity: "open" };

/** 見るからにメールでないものを弾く（打ち間違いまでは判定しない） */
const looksLikeEmail = (v: unknown): v is string =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * 送信対象を選ぶ。
 *
 * 送らない相手をはっきりさせる:
 *   ・キャンセル済み／補欠（まだ参加が確定していない人に持ち物の話をしない）
 *   ・中止・非公開になった開催回
 *   ・メールアドレスを持っていない人（通常活動は列がまだ無い場合がある）
 */
export const selectEventReminderTargets = (input: {
  events: ReminderEvent[];
  entries: ReminderEntry[];
  nowMs: number;
  daysBefore?: number;
}): ReminderTarget[] => {
  const wanted = reminderTargetDate(input.nowMs, input.daysBefore ?? REMIND_DAYS_BEFORE);
  const byId = new Map<string, ReminderEvent>();
  for (const e of input.events) {
    if (e.date !== wanted) continue;
    if (e.status !== LIVE_STATUS[e.kind]) continue;
    byId.set(`${e.kind}:${e.id}`, e);
  }

  const out: ReminderTarget[] = [];
  const seen = new Set<string>();
  for (const entry of input.entries) {
    const event = byId.get(`${entry.kind}:${entry.eventId}`);
    if (!event) continue;
    if (entry.status !== "confirmed") continue;
    if (entry.isCancelled) continue;
    if (!looksLikeEmail(entry.email)) continue;

    const dedupeKey = eventReminderDedupeKey(entry.kind, entry.entryId);
    if (seen.has(dedupeKey)) continue; // 同じ申込が二重に読まれても1通
    seen.add(dedupeKey);
    out.push({ event, entry, email: entry.email.trim(), dedupeKey });
  }
  return out;
};

/** キャンセル導線。**旧ドメインを使わない**（process-cancel に残っている不具合を持ち込まない） */
export const cancelUrlFor = (t: ReminderTarget): string | null => {
  if (t.entry.kind === "tournament") {
    return t.entry.cancelToken ? `${REMINDER_SITE}/cancel?token=${t.entry.cancelToken}` : null;
  }
  return `${REMINDER_SITE}/ja/activity/${t.event.id}`;
};

const hhmm = (v: string | null) => (v ? v.slice(0, 5) : "");
const timeRange = (e: ReminderEvent) =>
  e.startTime && e.endTime ? `${hhmm(e.startTime)}〜${hhmm(e.endTime)}` : hhmm(e.startTime);

const jaDate = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const w = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日（${w}）`;
};

/** 大会の案内文が「シャトル持参」を求めているときだけ、その一行を足す */
const needsOwnShuttle = (e: ReminderEvent) =>
  !!e.description && e.description.includes("シャトル") && e.description.includes("持参");

/**
 * 本文。**押し売りをしない**（次回の宣伝・追加購入の誘導を入れない）。
 * 伝えるのは 日時 / 会場 / 持ち物 / やめるときの導線 の4つだけ。
 */
export const buildEventReminderMail = (t: ReminderTarget): { subject: string; text: string } => {
  const e = t.event;
  const when = `${jaDate(e.date)}${timeRange(e) ? ` ${timeRange(e)}` : ""}`;
  const place = [e.location, e.address].filter(Boolean).join("\n住所：");
  const cancel = cancelUrlFor(t);
  const name = t.entry.name ? `${t.entry.name} 様` : "";

  if (e.kind === "tournament") {
    const bring = ["ラケット", "室内用シューズ", "飲みもの"];
    if (needsOwnShuttle(e)) bring.push("シャトル（第2種検定球。会場でも1球500円で購入できます）");
    return {
      subject: `【明日】${e.title}`,
      text: `${name}

明日の開催のご案内です。

【日時】${when}
【会場】${place || "未定"}
【持ち物】${bring.join(" / ")}

当日は受付でお名前をお伝えください。
${cancel ? `\n都合が悪くなった場合はこちらから：\n${cancel}\n（早めにお知らせいただけると、キャンセル待ちの方にお回しできます）\n` : ""}
ご不明な点はこのメールに返信してください。

川口・蕨バド交流杯`.replace(/\n{3,}/g, "\n\n").trim(),
    };
  }

  const fee = e.priceJpy ? `\n【参加費】${e.priceJpy.toLocaleString()}円（当日払い）` : "";
  return {
    subject: `【明日 / 明天】${e.title}`,
    text: `${name}

明日の活動のご案内です。

【日時】${when}
【会場】${place || "未定"}
【持ち物】ラケット / 室内用シューズ / 飲みもの${fee}

都合が悪くなった場合は、こちらのページからキャンセルできます：
${cancel}
※お申し込み時にお伝えした4桁のキャンセルコードが必要です。
${'　'}分からない場合は主催者までご連絡ください。

──────────

明天的活动通知。

【时间】${when}
【场地】${place || "未定"}
【携带物品】球拍 / 室内运动鞋 / 饮用水${e.priceJpy ? `\n【参加费】${e.priceJpy.toLocaleString()}日元（当天支付）` : ""}

如果来不了，可以在这个页面取消：
${cancel}
※需要报名时的4位取消码。忘记的话请联系主办方。

川口・蕨バド`.replace(/\n{3,}/g, "\n\n").trim(),
  };
};

/** ドライランの1行。誰に・どの開催回が・いつ送られるはずかを、名簿にはならない形で出す */
export const describeTarget = (t: ReminderTarget) => ({
  kind: t.entry.kind,
  eventId: t.event.id,
  eventTitle: t.event.title,
  eventDate: t.event.date,
  to: maskEmail(t.email),
  dedupeKey: t.dedupeKey,
});
