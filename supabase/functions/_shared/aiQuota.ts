// OpenAI残高切れ（クレジット枯渇）の検知と、その扱いかた（2026-08-23 CEO指示）。
//
// なぜ要るか:
//   OpenAIのクレジットは Auto-reload OFF・残高 $0 で **全APIが即停止**する。
//   これまでは止まったことに誰も気づけず、生徒には素のエラーが出る作りだった。
//   「生徒には “AI会話はアップデート中” と丁寧に伝え、他の機能は普通に使える。
//    運営（CEO）にはメールで即座に届く」を、この1ファイルの判定で担保する。
//
// 設計の要点:
//   - 一時停止フラグは **自動で期限切れになる**（pausedUntil）。復旧の手作業を要らなくするため。
//     残高を足せば期限切れ後の最初の会話で普通に通り、足していなければまた止まるだけ。
//   - メールは dedupe + クールダウン。止まっている間じゅう鳴り続けさせない。
//   - PII禁止: メール本文に生徒の氏名・会話本文を入れない（どの機能が止まったかまで）。
//
// I/Oを含まない判定は純粋関数として export し、ローカルの vitest から固定する。

/** 一時停止の既定の長さ。これを過ぎたら生徒は普通に再挑戦できる（自動復旧） */
export const PAUSE_MINUTES = 30;
/** 同じ停止事象でメールを再送しない時間 */
export const MAIL_COOLDOWN_HOURS = 6;

/** OpenAIが返す「お金が尽きた」系のコード。ネットワーク不調と混ぜない */
const QUOTA_CODES = new Set([
  'insufficient_quota',
  'billing_hard_limit_reached',
  'billing_not_active',
  'account_deactivated',
  'quota_exceeded',
]);

/**
 * 残高切れかどうか。**429すべてを残高切れにしない**（通常のレート制限と区別する）のが肝。
 * kind は各Edge Functionが `error.code ?? error.type` で取り出した文字列。
 */
export const isQuotaError = (status: number, kind: string | null | undefined): boolean => {
  if (!kind) return false;
  if (!QUOTA_CODES.has(kind)) return false;
  // 402/429/403 のどれで返ってくるかはOpenAI側の都合で変わりうるのでコードを主、statusは従とする
  return status === 429 || status === 402 || status === 403 || status === 400;
};

/** ai_config('ai_availability') に入れる値 */
export interface AvailabilityValue {
  /** ISO文字列。この時刻までは「アップデート中」表示 */
  paused_until?: string | null;
  /** 'quota' のみ。将来ほかの理由が増えたときのために持つ */
  reason?: string | null;
  /** 最初に止まった時刻（復旧報告のため） */
  since?: string | null;
  /** 最後にCEOへメールを送った時刻（クールダウンの基準） */
  last_mail_at?: string | null;
}

/** いま「AI会話は停止中」として扱うべきか（フロントもサーバーもこの1関数で判断する） */
export const isPaused = (v: AvailabilityValue | null | undefined, nowISO: string): boolean => {
  if (!v?.paused_until) return false;
  const until = Date.parse(v.paused_until);
  if (Number.isNaN(until)) return false;
  return Date.parse(nowISO) < until;
};

/** メールを送ってよいか（初回は必ず送る。以降はクールダウン後だけ） */
export const shouldMail = (
  v: AvailabilityValue | null | undefined,
  nowISO: string,
  cooldownHours = MAIL_COOLDOWN_HOURS,
): boolean => {
  if (!v?.last_mail_at) return true;
  const last = Date.parse(v.last_mail_at);
  if (Number.isNaN(last)) return true;
  return Date.parse(nowISO) - last >= cooldownHours * 3_600_000;
};

/** 停止を記録した後の新しい設定値を作る（純粋関数） */
export const nextAvailability = (
  prev: AvailabilityValue | null | undefined,
  nowISO: string,
  opts: { mailed: boolean; pauseMinutes?: number },
): AvailabilityValue => ({
  paused_until: new Date(Date.parse(nowISO) + (opts.pauseMinutes ?? PAUSE_MINUTES) * 60_000).toISOString(),
  reason: 'quota',
  // 連続して止まっている間は「最初に止まった時刻」を保つ
  since: isPaused(prev, nowISO) && prev?.since ? prev.since : nowISO,
  last_mail_at: opts.mailed ? nowISO : (prev?.last_mail_at ?? null),
});

/** 機能名（メールに出す。生徒の情報は入れない） */
export type QuotaSource = 'voice' | 'chat' | 'translate' | 'report';

const SOURCE_LABEL: Record<QuotaSource, string> = {
  voice: '音声レッスン',
  chat: 'テキスト会話',
  translate: '中国語訳',
  report: 'レッスンレポート',
};

/** CEOへの通知メール本文（純粋関数） */
export const buildQuotaMail = (source: QuotaSource, nowISO: string): { subject: string; text: string } => {
  const jst = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(nowISO));
  return {
    subject: '【要対応】AI会話が停止しました（OpenAIの残高切れ）',
    text: [
      `${jst} に ${SOURCE_LABEL[source]} が OpenAI から「残高不足」で拒否されました。`,
      '',
      'いまの状態:',
      `  ・生徒の画面には「AI会話はアップデート中です」と表示されています（エラーは出していません）`,
      '  ・復習ノート・マイ表現・ロードマップ・学習履歴など、AIを使わない機能はそのまま使えます',
      `  ・${PAUSE_MINUTES}分ごとに自動で再挑戦します。残高を足せば、そのタイミングで自然に戻ります`,
      '',
      'やること（残高を足すかどうかは、しょっちゃんの判断です）:',
      '  1. https://platform.openai.com/settings/organization/billing/overview を開く',
      '  2. 「Buy credits」でクレジットを追加する',
      '  3. 管理画面の「運用」タブに、追加した金額をチャージ記録として残す（残高表示がずれないように）',
      '',
      `※ このメールは同じ事象につき${MAIL_COOLDOWN_HOURS}時間に1通までです。`,
    ].join('\n'),
  };
};

/** 残高が少ないときの予告メール本文（日次監視から使う） */
export const buildLowBalanceMail = (remainingUsd: number, thresholdUsd: number): { subject: string; text: string } => ({
  subject: `【予告】AIクレジットの残りが $${remainingUsd.toFixed(2)} です`,
  text: [
    `管理画面の記録では、AIクレジットの残りが $${remainingUsd.toFixed(2)}（しきい値 $${thresholdUsd.toFixed(2)}）です。`,
    '',
    '尽きると AI会話だけが止まり、生徒の画面は「アップデート中」表示に切り替わります。',
    '止まる前に足しておくかどうかは、しょっちゃんの判断です。',
    '',
    '  ・残高を足す: https://platform.openai.com/settings/organization/billing/overview',
    '  ・足したら管理画面の「運用」タブにチャージ記録を残す（残高表示の基準になります）',
    '',
    '※ この金額は「チャージ記録の合計 − 推定使用額」です。OpenAI側の実残高が正です。',
  ].join('\n'),
});

/** 残高が少ないと言い出すしきい値（USD）。ai_config('monitoring').low_balance_usd で変更可 */
export const DEFAULT_LOW_BALANCE_USD = 3;

/**
 * 「尽きる前に気づく」ための予告。**尽きてから出る ai_quota_exhausted とは別物**。
 * 残高はチャージ記録の合計 − 推定使用額（管理画面と同じ計算）。
 * チャージ記録が1件も無いときは残高を知りようがないので黙る（0扱いで毎日鳴らさない）。
 */
export const lowBalanceAlert = (
  topupTotalUsd: number,
  spentAllTimeUsd: number,
  thresholdUsd = DEFAULT_LOW_BALANCE_USD,
): { dedupeKey: string; kind: string; severity: 'critical' | 'warning'; title: string; detail: string; subjectUserId: null } | null => {
  if (topupTotalUsd <= 0) return null;
  const remaining = topupTotalUsd - spentAllTimeUsd;
  if (remaining > thresholdUsd) return null;
  return {
    dedupeKey: 'ai_credit_low',
    kind: 'ai_credit_low',
    severity: remaining <= 0 ? 'critical' : 'warning',
    title: 'AIクレジットの残りが少なくなっています',
    detail: `残り $${remaining.toFixed(2)}（チャージ合計 $${topupTotalUsd.toFixed(2)} − 推定使用 $${spentAllTimeUsd.toFixed(2)}）。`
      + '尽きるとAI会話だけが止まり、生徒の画面は「アップデート中」になります。',
    subjectUserId: null,
  };
};

// ────────────────────────────────────────────────────────────
// I/O（Edge Functionからのみ使う）
// ────────────────────────────────────────────────────────────

export interface QuotaEnv {
  supabaseUrl: string;
  serviceKey: string;
  resendKey: string;
  alertEmail: string;
  mailFrom: string;
}

/** 環境変数からI/O設定を組み立てる。足りなければ null（呼び出し側は黙って諦める） */
export const quotaEnvFrom = (get: (k: string) => string | undefined): QuotaEnv | null => {
  const supabaseUrl = get('SUPABASE_URL') ?? '';
  const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return null;
  return {
    supabaseUrl,
    serviceKey,
    resendKey: get('RESEND_API_KEY') ?? '',
    alertEmail: get('AI_COURSE_ALERT_EMAIL') ?? 'info@kawabado.com',
    mailFrom: '日本語の相棒 <noreply@kawabado.com>',
  };
};

/**
 * 残高切れを記録し、必要ならCEOへ即メールする。
 *
 * **失敗しても呼び出し元の応答を壊さない**（生徒への応答が最優先）。
 * 呼び出し側は await せず fire-and-forget でよいが、Edge Functionの寿命の都合で
 * await しても数百ms程度。
 */
export const reportQuotaOutage = async (env: QuotaEnv, source: QuotaSource): Promise<void> => {
  const nowISO = new Date().toISOString();
  const db = {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // 現在の設定を読む（無ければ初回）
    const cur = await fetch(
      `${env.supabaseUrl}/rest/v1/ai_config?key=eq.ai_availability&select=value`,
      { headers: db },
    );
    const rows = cur.ok ? ((await cur.json()) as { value?: AvailabilityValue }[]) : [];
    const prev = rows[0]?.value ?? null;

    const mail = shouldMail(prev, nowISO) && !!env.resendKey;
    let mailed = false;

    if (mail) {
      const m = buildQuotaMail(source, nowISO);
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.mailFrom, to: [env.alertEmail], subject: m.subject, text: m.text }),
      });
      mailed = r.ok;
      if (!r.ok) console.error('quota alert mail failed', r.status);
    }

    const next = nextAvailability(prev, nowISO, { mailed });
    // upsert（ai_config.key は主キー）
    await fetch(`${env.supabaseUrl}/rest/v1/ai_config`, {
      method: 'POST',
      headers: { ...db, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'ai_availability', value: next }),
    });

    // 朝の点検ボード／管理画面にも出す（既存のアラート台帳へ）
    const existing = await fetch(
      `${env.supabaseUrl}/rest/v1/ai_course_alerts?dedupe_key=eq.ai_quota_exhausted&select=id,occurrences`,
      { headers: db },
    );
    const found = existing.ok ? ((await existing.json()) as { id: string; occurrences: number }[]) : [];
    const detail = `${SOURCE_LABEL[source]} が残高不足で拒否されました。生徒には「アップデート中」表示。${PAUSE_MINUTES}分後に自動で再挑戦します。`;
    if (found.length > 0) {
      await fetch(`${env.supabaseUrl}/rest/v1/ai_course_alerts?id=eq.${found[0].id}`, {
        method: 'PATCH',
        headers: { ...db, Prefer: 'return=minimal' },
        body: JSON.stringify({
          occurrences: Number(found[0].occurrences ?? 1) + 1,
          last_seen_at: nowISO, detail,
          resolved: false, resolved_at: null, resolved_by: null,
        }),
      });
    } else {
      await fetch(`${env.supabaseUrl}/rest/v1/ai_course_alerts`, {
        method: 'POST',
        headers: { ...db, Prefer: 'return=minimal' },
        body: JSON.stringify({
          dedupe_key: 'ai_quota_exhausted', kind: 'ai_quota_exhausted', severity: 'critical',
          title: 'AI会話が停止しています（OpenAIの残高切れ）',
          detail, subject_user_id: null, first_seen_at: nowISO, last_seen_at: nowISO,
        }),
      });
    }
  } catch (e) {
    // 記録に失敗しても生徒への応答は返す
    console.error('reportQuotaOutage failed', e instanceof Error ? e.message : 'unknown');
  }
};
