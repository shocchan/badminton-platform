// 購入後フォローメールの「誰に何を送るか」と「本文」。
//
// Edge Function（Deno）とローカルのテスト（vitest）の両方から読めるように、
// **I/Oを含まない純粋な関数だけ**をここに置く。
// 本番DBへ検証用の行を入れずにロジックを固定できる（受講権テーブルは auth.users への
// 外部キーがあり、合成データを置けないという事情もある）。
import { FUNCTION_PLAN_CATALOG } from "./aiCoursePlans.ts";

export type LifecycleKind = "trial_not_started" | "trial_ended" | "expiring_soon";

export interface LifecycleAccessRow {
  user_id: string;
  plan_id: string;
  valid_until: string;
  trial_started_at: string | null;
  trial_window_minutes: number | null;
  purchase_id: string | null;
}

export interface LifecyclePurchaseRow {
  id: string;
  buyer_email: string | null;
  locale: string | null;
  provisioned_at: string | null;
  status: string | null;
}

export interface LifecycleTarget {
  kind: LifecycleKind;
  userId: string;
  purchaseId: string | null;
  email: string;
  locale: "ja" | "zh";
  planId: string;
  validUntil: string;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** 購入から何時間たてば「まだ始めていませんね」と声をかけるか */
export const NOT_STARTED_AFTER_HOURS = 24;
/** 期限の何日前に知らせるか */
export const EXPIRING_WITHIN_DAYS = 3;
/**
 * きっかけの出来事から何日たったら**もう送らない**か。
 *
 * なぜ要るか（2026-08-24）: 送信が長期間止まっていたことに気づかず放置され、
 * 直したとたんに「1か月前に終わった体験のお礼」が一斉に飛ぶ、という事故が起きうる。
 * 遅れて届く案内は役に立たないばかりか、こちらの運用の穴を相手に見せることになる。
 */
export const MAX_EVENT_AGE_DAYS = 14;

/**
 * 受講権の行から、宛先になる購入台帳を引き当てる。
 *
 * なぜ二段構えか（2026-08-24に判明した実障害）:
 *   ai_course_access は `on_conflict=user_id` で**1人1行**を上書きするため、
 *   purchase_id は「最後に発行した購入」を指す。その購入行があとから消されると
 *   （QAの後片付けなど。FK制約は無いので消せてしまう）参照だけが宙に浮く。
 *   本番では実際にこれが起き、唯一の購入者が丸ごと選外になっていた。
 *
 * そこで purchase_id で引けなかったときだけ、**同じ user_id の購入台帳**へ落とす。
 * 引き当てた購入のIDを冪等キーに使うので、宙に浮いた参照があとで直っても
 * 同じ鍵になる＝二重送信にならない。
 */
export const resolvePurchase = (
  row: LifecycleAccessRow,
  purchases: Record<string, LifecyclePurchaseRow>,
  purchasesByUser: Record<string, LifecyclePurchaseRow> = {},
): LifecyclePurchaseRow | null => {
  const direct = row.purchase_id ? purchases[row.purchase_id] : undefined;
  if (direct) return direct;
  return purchasesByUser[row.user_id] ?? null;
};

/**
 * 宛先を引き当てられなかった受講権（＝黙って選外になっている行）。
 * 件数をアラートに出すためだけに使う。ここで返すのは user_id だけ。
 */
export const findOrphanAccess = (
  rows: LifecycleAccessRow[],
  purchases: Record<string, LifecyclePurchaseRow>,
  purchasesByUser: Record<string, LifecyclePurchaseRow> = {},
): string[] =>
  rows
    .filter((r) => !resolvePurchase(r, purchases, purchasesByUser)?.buyer_email)
    .map((r) => r.user_id);

/**
 * 送信対象を選ぶ。**1人につき1回の実行で1通まで**（用件が重なっても畳みかけない）。
 * 優先順位: 体験未開始 ＞ 体験終了 ＞ 期限間近。
 */
export const selectLifecycleTargets = (
  rows: LifecycleAccessRow[],
  purchases: Record<string, LifecyclePurchaseRow>,
  nowMs: number,
  purchasesByUser: Record<string, LifecyclePurchaseRow> = {},
): LifecycleTarget[] => {
  const out: LifecycleTarget[] = [];
  const fresh = (triggerMs: number) =>
    nowMs >= triggerMs && nowMs - triggerMs <= MAX_EVENT_AGE_DAYS * DAY;

  for (const r of rows) {
    const p = resolvePurchase(r, purchases, purchasesByUser);
    // 宛先が分からない／返金済みには送らない
    if (!p?.buyer_email || p.status === "refunded") continue;

    const base = {
      userId: r.user_id,
      // 冪等キーの土台は**引き当てた購入**のID（宙に浮いた参照ではなく実在する行）
      purchaseId: p.id,
      email: p.buyer_email,
      locale: (p.locale === "zh" ? "zh" : "ja") as "ja" | "zh",
      planId: r.plan_id,
      validUntil: r.valid_until,
    };
    const validUntilMs = new Date(r.valid_until).getTime();
    const isTrial = r.trial_window_minutes !== null;
    const provisionedMs = p.provisioned_at ? new Date(p.provisioned_at).getTime() : null;

    // ① 買ったのに体験を始めていない（押すまで時間は減らないことを伝える）
    if (isTrial && !r.trial_started_at && provisionedMs !== null && validUntilMs > nowMs) {
      if (fresh(provisionedMs + NOT_STARTED_AFTER_HOURS * HOUR)) {
        out.push({ ...base, kind: "trial_not_started" });
      }
      continue;
    }

    // ② 体験の窓が終わった（次の選択肢を出す唯一の機会）
    if (isTrial && r.trial_started_at) {
      const endMs = new Date(r.trial_started_at).getTime() + (r.trial_window_minutes ?? 60) * 60_000;
      if (fresh(endMs)) { out.push({ ...base, kind: "trial_ended" }); }
      continue; // 開始済みの体験パスは「期限間近」を送らない（②と重複するため）
    }

    // ③ 期限が近い（買い切りプランの継続案内）
    if (validUntilMs > nowMs && validUntilMs - nowMs <= EXPIRING_WITHIN_DAYS * DAY) {
      out.push({ ...base, kind: "expiring_soon" });
    }
  }
  return out;
};

/** 冪等キー。同じ人・同じ用件は一度だけ */
export const lifecycleDedupeKey = (t: LifecycleTarget): string =>
  `${t.kind}:${t.purchaseId ?? t.userId}`;

const jstDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric",
  });

export const daysUntil = (iso: string, nowMs: number): number =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - nowMs) / DAY));

export const LIFECYCLE_STUDENT_SITE = "https://study.kawabado.com";
export const LIFECYCLE_SALES_SITE = "https://kawabado.com";

/**
 * 本文。**価格・プラン名はカタログからしか取らない**（メールにも金額を直書きしない）。
 * 返金・解約の条件は書かない（法務の確認が終わっていないため断定しない）。
 */
export const buildLifecycleMail = (
  t: LifecycleTarget,
  nowMs: number,
): { subject: string; text: string } => {
  const ja = t.locale === "ja";
  const plan = FUNCTION_PLAN_CATALOG.find((p) => p.id === t.planId);
  const planName = plan ? (ja ? plan.nameJa : plan.nameZh) : t.planId;
  const month = FUNCTION_PLAN_CATALOG.find((p) => p.id === "ai-month");
  const monthName = month ? (ja ? month.nameJa : month.nameZh) : "";
  const monthPrice = month ? (ja ? month.priceLabelJa : month.priceLabelZh) : "";
  const loginUrl = `${LIFECYCLE_STUDENT_SITE}/${t.locale}/ai-course/login`;
  const priceUrl = `${LIFECYCLE_SALES_SITE}/${t.locale}/ai-course#price`;
  const until = jstDate(t.validUntil);
  const left = daysUntil(t.validUntil, nowMs);
  const win = plan?.realtimeWindowMinutes ?? 60;

  if (t.kind === "trial_not_started") {
    return ja
      ? {
        subject: "【日本語の相棒】まだ体験が始まっていません",
        text: `${planName}をご購入いただきありがとうございます。

まだ「体験を始める」を押していないようです。押すまで時間は減りませんので、
まとまった時間がとれるときに始めてください。

・開始ボタンを押すと、そこから${win}分間つかえます（途中で閉じてもカウントは止まりません）
・開始できるのは ${until} までです

ログイン：${loginUrl}

うまくログインできない場合は、このメールに返信してください。

kawabado 安田翔`,
      }
      : {
        subject: "【你的日语搭档】体验还没有开始",
        text: `感谢你购买${planName}。

看起来你还没有按下「开始体验」。在按下之前，时间不会减少，
可以等有整块时间的时候再开始。

・按下开始按钮后，可从那一刻起使用${win}分钟（中途关闭页面计时也不会停止）
・可开始的期限是 ${until}

登录：${loginUrl}

如果无法登录，请直接回复这封邮件。

kawabado 安田翔`,
      };
  }

  if (t.kind === "trial_ended") {
    return ja
      ? {
        subject: "【日本語の相棒】体験おつかれさまでした",
        text: `${win}分の体験、おつかれさまでした。

学習の記録（話した内容・保存した表現・進んだ地域）はそのまま残っています。
同じIDで続きから再開できます。

続けるなら：
・${monthName}（${monthPrice}）… 先生なしで30日間、全地域を自分のペースで
・6か月伴走コース … 学習の設計と方向修正まで人がつきます（まず無料相談から）

プランを見る：${priceUrl}

「自分にはどれが合うか分からない」ときは、このメールに返信してください。
むりに勧めることはしません。

kawabado 安田翔`,
      }
      : {
        subject: "【你的日语搭档】体验辛苦了",
        text: `${win}分钟的体验，辛苦了。

你的学习记录（说过的内容、保存的表达、走过的区域）都还留着。
用同一个ID可以从上次的地方继续。

如果想继续：
・${monthName}（${monthPrice}）… 不含真人课程，30天内全部区域按自己的节奏学
・6个月陪跑课程 … 由真人负责学习规划与方向调整（可先免费咨询）

查看方案：${priceUrl}

如果不确定哪个适合自己，直接回复这封邮件就好。
我们不会强行推销。

kawabado 安田翔`,
      };
  }

  return ja
    ? {
      subject: `【日本語の相棒】利用期限まであと${left}日です`,
      text: `${planName}の利用期限は ${until}（あと${left}日）です。

期限を過ぎると学習画面は開けなくなりますが、学習の記録は消えません。
あとで再開したくなったら、同じIDで続きから始められます。

いま使う：${loginUrl}
続きのプランを見る：${priceUrl}

kawabado 安田翔`,
    }
    : {
      subject: `【你的日语搭档】距离到期还有${left}天`,
      text: `${planName}的使用期限是 ${until}（还有${left}天）。

过期后将无法打开学习页面，但学习记录不会消失。
以后想继续时，用同一个ID就能从上次的地方开始。

现在使用：${loginUrl}
查看后续方案：${priceUrl}

kawabado 安田翔`,
    };
};

// ───────────────────────────────────────────────────────────────────────────
// 配信ログの状態機械（ライフサイクルメール／開催前日リマインドで共用）
//
// なぜ書き直したか（2026-08-24）:
//   旧設計は「送信に成功した証拠」だけを残し、**失敗したらログ行を消していた**。
//   消す理由（一時的な失敗で永久に送られなくなるのを避ける）は正しいが、
//   代償として「cronが動いていない」と「送ろうとして失敗した」が**区別できなかった**。
//   実際、本番のログは0行のまま誰も異常に気づけなかった。
//
//   そこで行は消さず、status を持たせて遷移させる:
//     scheduled ──送信成功──▶ sent
//         │
//         └──送信失敗──▶ failed（error_reason・attempts・next_retry_at を残す）
//                          └──再試行の時刻が来たら──▶ scheduled（回数上限まで）
//
//   冪等性は今までどおり dedupe_key の一意制約が守る。行を消さないので、
//   「1件につき1通」はむしろ強くなった（消した隙に二重送信する余地が無い）。
// ───────────────────────────────────────────────────────────────────────────

export type MailStatus = "scheduled" | "sent" | "failed";

export interface MailLogRow {
  dedupe_key: string;
  status: MailStatus;
  attempts: number;
  next_retry_at: string | null;
}

/** 何回まで送り直すか。これを使い切ったら人が見るべき事象としてアラートへ回す */
export const MAX_SEND_ATTEMPTS = 5;

/**
 * n回目の失敗のあと、次に試すまでの待ち時間。
 * cronは1日1回なので「分」の刻みは実質切り上げられるが、
 * 手動で連打したときに相手のメール基盤へ押し返さないための下限として持つ。
 */
export const retryDelayMs = (attempts: number): number => {
  const minutes = [10, 60, 360, 1440][Math.min(Math.max(attempts, 1), 4) - 1];
  return minutes * 60_000;
};

export type ClaimDecision =
  | { action: "send"; attempt: number }
  | { action: "skip"; reason: "already_sent" | "waiting_retry" | "in_flight" | "gave_up" };

/**
 * 既にログ行がある相手をどう扱うか。**送ってよいのは "send" を返したときだけ**。
 *
 * `scheduled` のまま残っている行は触らない（in_flight）。
 * 前回の実行が送信直後に落ちた可能性があり、勝手に送り直すと二重送信になる。
 * 放置され続けたら別途アラートで人に見せる（黙って消えるよりはるかによい）。
 */
export const claimDecision = (existing: MailLogRow | null, nowMs: number): ClaimDecision => {
  if (!existing) return { action: "send", attempt: 1 };
  if (existing.status === "sent") return { action: "skip", reason: "already_sent" };
  if (existing.status === "scheduled") return { action: "skip", reason: "in_flight" };
  if (existing.attempts >= MAX_SEND_ATTEMPTS) return { action: "skip", reason: "gave_up" };
  const due = existing.next_retry_at ? new Date(existing.next_retry_at).getTime() : 0;
  if (nowMs < due) return { action: "skip", reason: "waiting_retry" };
  return { action: "send", attempt: existing.attempts + 1 };
};

/**
 * 失敗理由を**個人情報を含まない短いコード**へ畳む。
 * 相手のメールアドレスや本文が混ざった外部APIの応答をそのまま保存しない。
 */
export const sendErrorCode = (httpStatus: number | null, kind?: string): string => {
  if (httpStatus === null) return kind ? `network_error:${kind}` : "network_error";
  if (httpStatus === 401 || httpStatus === 403) return `auth_${httpStatus}`;
  if (httpStatus === 422) return "rejected_422";
  if (httpStatus === 429) return "rate_limited_429";
  if (httpStatus >= 500) return `provider_${httpStatus}`;
  return `http_${httpStatus}`;
};

/** ドライランの出力用。誰宛かは分かるが、そのまま名簿にはならない程度に伏せる */
export const maskEmail = (email: string): string => {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const head = email.slice(0, at);
  const shown = head.slice(0, Math.min(2, head.length));
  return `${shown}${"*".repeat(Math.max(1, head.length - shown.length))}@${email.slice(at + 1)}`;
};

export interface MailHealthInput {
  /** 失敗のまま残っている件数（再試行の余地があるもの） */
  failed: number;
  /** 再試行を使い切った件数（人が手を打たないと永久に届かない） */
  gaveUp: number;
  /** scheduled のまま滞留している件数（送信直後に落ちた疑い） */
  stuck: number;
  /** 宛先を引き当てられない受講権の件数（黙って選外になっている） */
  orphanAccess: number;
  /** 該当が1人だけのときだけ、生徒詳細へ飛べるように渡す */
  orphanUserId?: string | null;
  /** cron に登録されていない想定ジョブ名 */
  missingJobs: string[];
}

/** ai_course_alerts へ upsert できる形（ai-course-monitor の DetectedAlert と同じ並び） */
export interface MailHealthAlert {
  dedupeKey: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  subjectUserId: string | null;
}

/**
 * 配信まわりの異常をアラート化する。
 * detail は**件数とジョブ名だけ**（宛先・本文・エラー本文を入れない）。
 */
export const buildMailHealthAlerts = (input: MailHealthInput): MailHealthAlert[] => {
  const out: MailHealthAlert[] = [];

  if (input.missingJobs.length > 0) {
    out.push({
      dedupeKey: "mail_cron_missing:open",
      kind: "mail_cron_missing",
      severity: "critical",
      title: "自動メールの定期実行が登録されていません",
      detail: `cron に見当たらないジョブ: ${input.missingJobs.join(", ")}（migration の適用漏れの可能性）`,
      subjectUserId: null,
    });
  }
  if (input.gaveUp > 0) {
    out.push({
      dedupeKey: "mail_send_gave_up:open",
      kind: "mail_send_gave_up",
      severity: "critical",
      title: "自動メールが再試行の上限まで失敗しました",
      detail: `${input.gaveUp}件が${MAX_SEND_ATTEMPTS}回失敗して止まっています（手を打たない限り届きません）`,
      subjectUserId: null,
    });
  }
  if (input.failed > 0) {
    out.push({
      dedupeKey: "mail_send_failed:open",
      kind: "mail_send_failed",
      severity: "warning",
      title: "自動メールの送信に失敗しています",
      detail: `${input.failed}件が失敗のまま再試行待ちです`,
      subjectUserId: null,
    });
  }
  if (input.stuck > 0) {
    out.push({
      dedupeKey: "mail_send_stuck:open",
      kind: "mail_send_stuck",
      severity: "warning",
      title: "送信中のまま止まっている自動メールがあります",
      detail: `${input.stuck}件が送信中の記録のまま残っています（届いたかどうかを人が確かめる必要があります）`,
      subjectUserId: null,
    });
  }
  if (input.orphanAccess > 0) {
    out.push({
      dedupeKey: "mail_orphan_access:open",
      kind: "mail_orphan_access",
      severity: "warning",
      title: "宛先を引き当てられない受講権があります",
      detail: `${input.orphanAccess}件の受講権が購入台帳とつながらず、フォローメールの対象外になっています`,
      subjectUserId: input.orphanAccess === 1 ? (input.orphanUserId ?? null) : null,
    });
  }
  return out;
};
