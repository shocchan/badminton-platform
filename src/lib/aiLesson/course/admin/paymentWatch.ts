/**
 * 決済の観測（2026-09-09 P0-1）。
 *
 * 【この module が答える問い】
 * 「決済が完了しないのは、**誰も払わなかった**からか、
 *   **払われたのに届いていない**からか」——2026-08-20〜09-07 の14件について、
 * 当時のデータではこれを区別できなかった。webhook の受信記録が存在せず、
 * checkout.session.expired も無視していたため、どちらの場合も行は pending のままだった。
 *
 * ここは判定だけを持つ純関数。画面（AdminPaymentWatchPanel）と分けてあるのは、
 * 「この状態のときこう言う」をテストで固定するため。
 *
 * 【言葉づかいの約束】
 * 分からないことを分かったように書かない。webhook が0件なら
 * 「届いていない」とは言えても「Stripeに登録されていない」とは言い切れない
 * （Stripeの設定は手元から読めない）ので、次に確かめることを出す。
 */

export type PurchaseStatus =
  | 'pending' | 'awaiting_payment' | 'paid' | 'provisioned' | 'expired' | 'failed' | 'refunded';

export interface PaymentSessionRow {
  /** checkout session の末尾8桁。完全なIDは持たない */
  sessionRef: string;
  createdAtISO: string;
  updatedAtISO: string;
  planId: string;
  amountJpy: number;
  locale: string;
  status: PurchaseStatus;
  livemode: boolean;
  isTest: boolean;
  paymentMethod: string | null;
  hasPaymentIntent: boolean;
  hasBuyerEmail: boolean;
  provisioned: boolean;
  loginClaimed: boolean;
  error: string;
  /** この session について受け取った webhook の件数。0 = 届いていない */
  webhookCount: number;
}

export interface PaymentEventRow {
  receivedAtISO: string;
  eventType: string;
  sessionRef: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  livemode: boolean | null;
  outcome: 'received' | 'handled' | 'ignored' | 'waiting' | 'error' | 'signature_failed';
  detail: string;
}

export interface PaymentWatch {
  sinceISO: string;
  sessions: PaymentSessionRow[];
  events: PaymentEventRow[];
  totals: {
    sessions: number;
    provisioned: number;
    webhookEvents: number;
    webhookEventsEver: number;
  };
}

export type VerdictLevel = 'ok' | 'watch' | 'blocked' | 'unknown';

export interface Verdict {
  level: VerdictLevel;
  /** 1行でいまの状態 */
  headline: string;
  /** なぜそう言えるか（根拠。数字を必ず含める） */
  because: string;
  /** 次に確かめること・やること */
  next: string;
}

/** 本番の実購入だけを見る（テスト行・テストモードは判断から外す） */
export const realSessions = (rows: PaymentSessionRow[]): PaymentSessionRow[] =>
  rows.filter((r) => r.livemode && !r.isTest);

/** 決済が終わったと言える状態か */
export const isSettled = (s: PurchaseStatus): boolean =>
  s === 'paid' || s === 'provisioned';

/** まだ結果が確定していない状態か（放置か入金待ち） */
export const isOpen = (s: PurchaseStatus): boolean =>
  s === 'pending' || s === 'awaiting_payment';

/**
 * いまの決済がどういう状態かを1つの判定にまとめる。
 *
 * 判定の順序に意味がある。上ほど「これが起きていたら他の話をしても無駄」。
 *  1. webhook を1件も受け取っていない → 受け口が繋がっていない可能性（最優先）
 *  2. 入金済みなのに発行できていない → お金を受け取って商品を渡せていない（最悪）
 *  3. セッションはあるが誰も払っていない → 決済画面での離脱（商品・手段・文言の問題）
 */
export const diagnose = (w: PaymentWatch): Verdict => {
  const rows = realSessions(w.sessions);
  const settled = rows.filter((r) => isSettled(r.status));
  const provisioned = rows.filter((r) => r.status === 'provisioned');
  const paidNotProvisioned = rows.filter((r) => r.status === 'paid');
  const open = rows.filter((r) => isOpen(r.status));
  const expired = rows.filter((r) => r.status === 'expired');

  if (rows.length === 0) {
    return {
      level: 'unknown',
      headline: 'この期間に本番の決済はまだありません',
      because: `本番（livemode・テスト除外）のセッションが0件です。受信した webhook は通算 ${w.totals.webhookEventsEver} 件。`,
      next: 'まず ¥600 の体験パスを1回買って、この画面に行が並ぶことを確かめてください。',
    };
  }

  if (w.totals.webhookEventsEver === 0) {
    return {
      level: 'blocked',
      headline: 'Stripe からの通知を1件も受け取っていません',
      because: `本番のセッションが ${rows.length} 件ある一方で、webhook の受信記録は通算0件です。`,
      next: 'Stripe ダッシュボードの Webhooks で、エンドポイントが ai-course-stripe-webhook を向いていて、'
        + 'checkout.session.completed / async_payment_succeeded / async_payment_failed / expired が有効か確認してください。',
    };
  }

  if (paidNotProvisioned.length > 0) {
    return {
      level: 'blocked',
      headline: '入金済みなのにアカウントを発行できていない人がいます',
      because: `status='paid' のまま止まっている行が ${paidNotProvisioned.length} 件あります（発行済みは ${provisioned.length} 件）。`,
      next: '該当行の error 列を見て、発行のどこで落ちたかを特定してください。お金を受け取って商品を渡せていない状態です。',
    };
  }

  if (settled.length === 0) {
    const withWebhook = rows.filter((r) => r.webhookCount > 0).length;
    return {
      level: 'blocked',
      headline: '決済画面まで来た人が、まだ1人も支払いを完了していません',
      because: `本番セッション ${rows.length} 件のうち完了は0件（未確定 ${open.length} 件・期限切れ ${expired.length} 件）。`
        + `そのうち webhook を受け取った session は ${withWebhook} 件です。`,
      next: withWebhook === 0
        ? 'この期間の session について通知が1件も来ていません。Stripe 側のイベント設定と、実際に1回買ってみた結果を突き合わせてください。'
        : '通知は届いているので、支払い画面での離脱です。実際に1回買って、どの手段でどこまで進めるかを確かめてください。',
    };
  }

  if (open.length > settled.length * 2) {
    return {
      level: 'watch',
      headline: '決済画面まで来て完了しない人のほうが多い状態です',
      because: `完了 ${settled.length} 件に対して、未確定が ${open.length} 件あります。`,
      next: '支払い手段の内訳（card / alipay / wechat_pay）を見て、特定の手段で落ちていないか確かめてください。',
    };
  }

  return {
    level: 'ok',
    headline: '決済から発行までつながっています',
    because: `本番セッション ${rows.length} 件のうち ${provisioned.length} 件が発行済み、未確定 ${open.length} 件。`,
    next: '引き続きこの画面で、入金済みのまま止まる行が出ないかを見てください。',
  };
};

/** 支払い手段ごとの件数（実測のみ。null は「まだ決まっていない」として数える） */
export const byPaymentMethod = (rows: PaymentSessionRow[]): { method: string; total: number; settled: number }[] => {
  const map = new Map<string, { total: number; settled: number }>();
  for (const r of realSessions(rows)) {
    const key = r.paymentMethod ?? '(未確定)';
    const cur = map.get(key) ?? { total: 0, settled: 0 };
    cur.total += 1;
    if (isSettled(r.status)) cur.settled += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.total - a.total);
};

/**
 * 1つの session の時系列（checkout作成 → webhook各行）。
 * CEOの実決済テスト中に「いまどこまで来たか」を見るために使う。
 */
export const timelineFor = (w: PaymentWatch, sessionRef: string): PaymentEventRow[] =>
  w.events
    .filter((e) => e.sessionRef === sessionRef)
    .slice()
    .sort((a, b) => a.receivedAtISO.localeCompare(b.receivedAtISO));
