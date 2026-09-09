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

// ──────────────────────────────────────────────────────────────────────────
// 学習が途切れた人への1通（2026-09-07 CEO案）
//
// なぜ購入導線と分けるか:
//   上の3通はすべて**購入台帳**が起点で、宛先も購入行から引いている。いまの実在の生徒は
//   全員が手動付与（ai_course_access.source='manual'）＝購入行が無いので、上の仕組みでは
//   永久に対象にならない。実測（2026-09-07）で最長連続学習日数は3日、最後のAI会話は8/23。
//   **途切れた人に届くものが何も無い**ことが、いちばん大きな穴だった。
//
// 送り方の原則（advVisit/advStreak と同じ）:
//   - 責めない。「サボった」「途切れた」は書かない。空いた日数は事実として出すだけ
//   - 1回の途切れにつき1通（冪等キーに最終学習日を含める）。毎日は送らない
//   - 60日を超えた人には送らない。掘り起こしメールは押し付けになるうえ、
//     こちらが2か月放置していた事実を相手に見せることになる
//   - 金額・プランの案内を混ぜない。これは営業ではなく学習の声かけ
// ──────────────────────────────────────────────────────────────────────────

/** 何日あいたら声をかけるか（7日待つと戻ってこない・2026-08-17 の判断と揃える） */
export const STALL_AFTER_DAYS = 3;
/** これ以上あいた人には送らない */
export const STALL_MAX_DAYS = 60;

export interface LifecycleLearnerRow {
  user_id: string;
  email: string | null;
  /** 学習画面の表示言語（LearnerSettings.uiLanguage）。不明は ja */
  locale: string | null;
  /** 最終学習日 YYYY-MM-DD（questLog∪mastery の実測。無ければ null＝一度も学習していない） */
  last_active_day: string | null;
  is_test: boolean | null;
  is_active: boolean | null;
}

export interface StalledTarget {
  kind: "learning_stalled";
  userId: string;
  email: string;
  locale: "ja" | "zh";
  lastActiveDay: string;
  daysAway: number;
}

const dayKeyDiff = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/**
 * IDログインの生徒に割り当てている**内部ドメイン**（courseAuth.studentIdToEmail）。
 * 実在のメールボックスではないので、ここへ送ると必ず不達になる。
 * 送ったことにして送信ログを汚すより、**最初から対象外にする**（2026-09-07）。
 * この人たちへの連絡は先生の微信が唯一届く経路で、それはメールでは代われない。
 */
export const INTERNAL_LOGIN_DOMAIN = "@id.badminton-platform.pages.dev";
export const isDeliverableEmail = (email: string): boolean =>
  email.includes("@") && !email.toLowerCase().endsWith(INTERNAL_LOGIN_DOMAIN);

/**
 * 誰に声をかけるか。todayKey は JST の YYYY-MM-DD（学習側の dateKeyOf と同じ基準）。
 *
 * 一度も学習していない人（last_active_day が null）はここでは対象にしない。
 * その人に要るのは「久しぶり」ではなく初回の案内で、文面が別物になるため。
 */
export const stalledDecision = (
  rows: LifecycleLearnerRow[], todayKey: string,
): StalledTarget[] => {
  const out: StalledTarget[] = [];
  for (const r of rows) {
    if (r.is_test === true || r.is_active === false) continue;
    if (!r.email || !r.last_active_day) continue;
    if (!isDeliverableEmail(r.email)) continue;
    const away = dayKeyDiff(r.last_active_day, todayKey);
    if (!Number.isFinite(away) || away < STALL_AFTER_DAYS || away > STALL_MAX_DAYS) continue;
    out.push({
      kind: "learning_stalled",
      userId: r.user_id,
      email: r.email,
      locale: r.locale === "zh" ? "zh" : "ja",
      lastActiveDay: r.last_active_day,
      daysAway: away,
    });
  }
  return out;
};

/** 冪等キー。**最終学習日を含める**＝1回の途切れにつき1通、再開してまた空けば別の1通 */
export const stalledDedupeKey = (t: StalledTarget): string =>
  `learning_stalled:${t.userId}:${t.lastActiveDay}`;

/**
 * 本文。売り込みを混ぜない・分量を小さく約束する・記録が消えていないことを伝える。
 * この3つが「戻ってこられない理由」を消すために要る。
 */
export const buildStalledMail = (t: StalledTarget): { subject: string; text: string } => {
  const loginUrl = `${LIFECYCLE_STUDENT_SITE}/${t.locale}/ai-course/login`;
  return t.locale === "ja"
    ? {
      subject: `【日本語の相棒】${t.daysAway}日ぶりに、3分だけ`,
      text: `お久しぶりです。前回の学習から${t.daysAway}日たちました。

記録はぜんぶ残っています。進んだ地域も、保存した表現も、そのままです。
今日は全部やらなくて大丈夫です。まず1つだけ、3分ほどで終わります。

ひらくと、今日のことばが1つ出ます。それを読むだけの日があってもかまいません。

つづきから：${loginUrl}

やめたいときや、ペースを変えたいときも、このメールに返信してください。

kawabado 安田翔`,
    }
    : {
      subject: `【你的日语搭档】${t.daysAway}天没见了，今天只做3分钟`,
      text: `好久不见。距离上次学习已经过了${t.daysAway}天。

记录都还在。走过的区域、保存下来的表达，都原样留着。
今天不用全部做完。先做一个就好，大概3分钟。

打开之后会出现「今天的一句话」。只读那一句就结束的日子，也完全可以。

从上次的地方继续：${loginUrl}

如果想暂停，或者想调整节奏，也请直接回复这封邮件。

kawabado 安田翔`,
    };
};

/**
 * 学習者設定（jsonb）から**最後に学習した日**を読む（2026-09-09・P0-2）。
 *
 * 正は `src/lib/aiLesson/course/adventure/advLearningDay.ts`（画面のストリーク・
 * 管理画面の学習日数と同じ判定）。ここはサーバー側でその**結果だけ**を読む。
 * 判定そのものを書き直さないこと——2つの定義が並ぶと必ず片方が古くなる。
 *
 * 読む順:
 *   ① learningDays（P0-1 以降の正準。かな道場だけの日・AI会話だけの日も入っている）
 *   ② 無ければ questLog ∪ mastery ∪ todaySteps の最終日
 *      （P0-1 より前に最後に開いた人のための後方互換）
 * どれも無ければ null＝一度も学習していない（この人には「久しぶり」ではなく初回案内が要る）。
 *
 * **todaySteps を必ず入れること**（2026-09-09 stagingの実測で判明）。
 * かな道場だけ・AI会話だけの生徒は questLog も mastery も空なので、
 * ここを落とすとサーバーだけが「一度も学習していない」と判定し、
 * アプリ側（advLearningDay）の「8/24に学習した」と食い違う。
 * 定義が2つに割れるのは、この作業でいちばん避けたかったこと。
 */
export const lastLearningDayOf = (settings: unknown): string | null => {
  const adv = (settings as Record<string, any> | null)?.adventureV2;
  if (!adv || typeof adv !== "object") return null;
  const isDay = (v: unknown): v is string =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  let last: string | null = null;
  const note = (v: unknown) => { if (isDay(v) && (!last || v > last)) last = v; };

  if (Array.isArray(adv.learningDays)) for (const e of adv.learningDays) note(e?.d);
  if (last !== null) return last;

  // 後方互換: learningDays がまだ書かれていない人（P0-1 のあと一度も開いていない）
  if (Array.isArray(adv.questLog)) for (const q of adv.questLog) note(q?.dateKey);
  if (adv.mastery && typeof adv.mastery === "object") {
    for (const attempts of Object.values(adv.mastery as Record<string, unknown>)) {
      if (!Array.isArray(attempts)) continue;
      for (const a of attempts) note((a as Record<string, unknown> | null)?.dateKey);
    }
  }
  // stepを1つでも終えた日（かな道場・AI会話・新しいことば…）。
  // advLearningDay.deriveLearningDays と同じ条件にそろえる
  const ts = adv.todaySteps;
  if (ts && typeof ts === "object") {
    const n = (Array.isArray(ts.doneKeys) ? ts.doneKeys.length : 0)
      + (Array.isArray(ts.done) ? ts.done.length : 0);
    if (n > 0) note(ts.dateKey);
  }
  return last;
};

/** JSTの今日（YYYY-MM-DD）。学習側の dateKey と同じ基準に合わせる */
export const jstDayKey = (nowMs: number): string =>
  new Date(nowMs).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
