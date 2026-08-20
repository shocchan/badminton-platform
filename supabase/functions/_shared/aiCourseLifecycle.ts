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
 * 送信対象を選ぶ。**1人につき1回の実行で1通まで**（用件が重なっても畳みかけない）。
 * 優先順位: 体験未開始 ＞ 体験終了 ＞ 期限間近。
 */
export const selectLifecycleTargets = (
  rows: LifecycleAccessRow[],
  purchases: Record<string, LifecyclePurchaseRow>,
  nowMs: number,
): LifecycleTarget[] => {
  const out: LifecycleTarget[] = [];
  for (const r of rows) {
    const p = r.purchase_id ? purchases[r.purchase_id] : null;
    // 宛先が分からない／返金済みには送らない（購入行を消したQA残骸もここで落ちる）
    if (!p?.buyer_email || p.status === "refunded") continue;

    const base = {
      userId: r.user_id,
      purchaseId: r.purchase_id,
      email: p.buyer_email,
      locale: (p.locale === "zh" ? "zh" : "ja") as "ja" | "zh",
      planId: r.plan_id,
      validUntil: r.valid_until,
    };
    const validUntilMs = new Date(r.valid_until).getTime();
    const isTrial = r.trial_window_minutes !== null;
    const provisionedMs = p.provisioned_at ? new Date(p.provisioned_at).getTime() : null;

    // ① 買ったのに体験を始めていない（押すまで時間は減らないことを伝える）
    if (
      isTrial && !r.trial_started_at && provisionedMs !== null
      && nowMs - provisionedMs >= NOT_STARTED_AFTER_HOURS * HOUR
      && validUntilMs > nowMs
    ) {
      out.push({ ...base, kind: "trial_not_started" });
      continue;
    }

    // ② 体験の窓が終わった（次の選択肢を出す唯一の機会）
    if (isTrial && r.trial_started_at) {
      const endMs = new Date(r.trial_started_at).getTime() + (r.trial_window_minutes ?? 60) * 60_000;
      if (nowMs >= endMs) { out.push({ ...base, kind: "trial_ended" }); }
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
