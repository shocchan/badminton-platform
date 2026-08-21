// 運用アラートの検知ロジック（Task 1・2026-08-21）。
//
// **I/Oを含まない純粋な関数だけ**をここに置く。
// Edge Function（Deno）とローカルのテスト（vitest）の両方から読めるようにするため。
// 監視の条件は「実データを見て人が判断する」ものなので、境界をテストで固定する価値が高い。
//
// PII禁止: detail に会話本文・氏名・メールを入れない。件数・エラーコード・機能名まで。

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface MonitorThresholds {
  provisionStuckMinutes: number;
  conversationErrorThreshold: number;
  cronStaleHours: number;
}

export const DEFAULT_THRESHOLDS: MonitorThresholds = {
  provisionStuckMinutes: 30,
  conversationErrorThreshold: 3,
  cronStaleHours: 30,
};

/** 検知の入力（すべて既存テーブル由来。監視のために新しい記録は増やさない） */
export interface MonitorInput {
  purchases: {
    id: string;
    status: string;
    livemode: boolean;
    userId: string | null;
    error: string | null;
    createdAtISO: string;
    provisionedAtISO: string | null;
  }[];
  /** 直近24時間ぶんの会話セッション */
  sessions: {
    completionStatus: string;
    errorCode: string | null;
    startedAtISO: string;
  }[];
  cronJobs: { jobname: string; lastStatus: string | null; lastStartISO: string | null }[];
  /** 直近24時間のイベント件数（0なら計測が死んでいる疑い） */
  recentEventCount: number;
  /** 直近24時間に学習セッションがあったか（イベント0の判定に必要） */
  hasRecentSessions: boolean;
  nowISO: string;
  thresholds?: MonitorThresholds;
}

export interface DetectedAlert {
  dedupeKey: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  subjectUserId: string | null;
}

const MIN = 60_000;
const HOUR = 3_600_000;

/**
 * 検知。**同じ事象は1件に畳んで返す**（呼び出し側が dedupeKey で upsert する）。
 * 少人数のベータ期なので、決済・発行まわりは1件でも critical で出す。
 * 会話エラーのような「起きうるもの」は閾値以上のときだけ、コード単位でまとめて出す。
 */
export const detectAlerts = (input: MonitorInput): DetectedAlert[] => {
  const th = input.thresholds ?? DEFAULT_THRESHOLDS;
  const nowMs = Date.parse(input.nowISO);
  const out: DetectedAlert[] = [];

  // ── ① 自動発行に失敗した購入（入金済みなのに学習を始められない人） ──
  for (const p of input.purchases) {
    if (!p.livemode || p.status !== 'failed') continue;
    out.push({
      dedupeKey: `provision_failed:${p.id}`,
      kind: 'provision_failed',
      severity: 'critical',
      title: '自動発行に失敗した購入があります',
      // error は自前のコード文字列（メール・氏名は入らない）。長さは念のため切る
      detail: `購入ID ${p.id} / 理由: ${(p.error ?? '不明').slice(0, 120)}`,
      subjectUserId: p.userId,
    });
  }

  // ── ② 決済済みなのに発行されないまま滞留している購入 ──
  for (const p of input.purchases) {
    if (!p.livemode || p.status !== 'paid' || p.provisionedAtISO !== null) continue;
    const ageMin = (nowMs - Date.parse(p.createdAtISO)) / MIN;
    if (ageMin < th.provisionStuckMinutes) continue;
    out.push({
      dedupeKey: `provision_stuck:${p.id}`,
      kind: 'provision_stuck',
      severity: 'critical',
      title: '決済済みだが受講権が発行されていません',
      detail: `購入ID ${p.id} / 決済から ${Math.floor(ageMin)} 分経過（閾値 ${th.provisionStuckMinutes} 分）`,
      subjectUserId: p.userId,
    });
  }

  // ── ③ 会話のエラー（コード単位で集約。閾値未満は騒がない） ──
  const byCode = new Map<string, number>();
  for (const s of input.sessions) {
    if (Date.parse(s.startedAtISO) < nowMs - 24 * HOUR) continue;
    const code = (s.errorCode ?? '').trim();
    if (!code) continue;
    byCode.set(code, (byCode.get(code) ?? 0) + 1);
  }
  for (const [code, n] of byCode) {
    if (n < th.conversationErrorThreshold) continue;
    out.push({
      dedupeKey: `conversation_error:${code}`,
      kind: 'conversation_error',
      severity: 'warning',
      title: 'AI会話が同じ理由で連続して失敗しています',
      detail: `エラーコード ${code} が直近24時間で ${n} 件（閾値 ${th.conversationErrorThreshold} 件）`,
      subjectUserId: null,
    });
  }

  // ── ④ cron が止まっている / 失敗した ──
  for (const j of input.cronJobs) {
    if (j.lastStatus === 'failed') {
      out.push({
        dedupeKey: `cron_failed:${j.jobname}`,
        kind: 'cron_failed',
        severity: 'warning',
        title: '定期ジョブが失敗しました',
        detail: `${j.jobname} の最後の実行が failed`,
        subjectUserId: null,
      });
      continue;
    }
    const lastMs = j.lastStartISO ? Date.parse(j.lastStartISO) : NaN;
    // 一度も走っていない場合は「まだ判断できない」として騒がない（登録直後の誤検知を避ける）
    if (Number.isNaN(lastMs)) continue;
    const ageH = (nowMs - lastMs) / HOUR;
    if (ageH <= th.cronStaleHours) continue;
    out.push({
      dedupeKey: `cron_stale:${j.jobname}`,
      kind: 'cron_stale',
      severity: 'warning',
      title: '定期ジョブが動いていません',
      detail: `${j.jobname} が最後に走ってから ${Math.floor(ageH)} 時間（閾値 ${th.cronStaleHours} 時間）`,
      subjectUserId: null,
    });
  }

  // ── ⑤ 学習は起きているのに計測イベントが1件も入っていない（RPC・配線の死） ──
  if (input.hasRecentSessions && input.recentEventCount === 0) {
    out.push({
      dedupeKey: 'events_missing:daily',
      kind: 'events_missing',
      severity: 'warning',
      title: '学習はあるのに計測イベントが記録されていません',
      detail: '直近24時間に会話セッションはあるが ai_course_events が0件（RPCまたは配線の異常）',
      subjectUserId: null,
    });
  }

  return out;
};

/** 日次メールに出す並び順（重いものから） */
const RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
export const sortAlerts = (alerts: DetectedAlert[]): DetectedAlert[] =>
  [...alerts].sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.dedupeKey.localeCompare(b.dedupeKey));

/**
 * 日次サマリーを送るべきか。
 * **critical が1件でもあれば送る**（ベータ期は見逃しのほうが高くつく）。
 * warning だけのときは、前回送信からクールダウンを過ぎている場合のみ。
 */
export const shouldSendDigest = (input: {
  alerts: DetectedAlert[];
  lastDigestISO: string | null;
  nowISO: string;
  cooldownHours: number;
}): boolean => {
  if (input.alerts.length === 0) return false;
  if (input.alerts.some((a) => a.severity === 'critical')) return true;
  if (!input.lastDigestISO) return true;
  const since = (Date.parse(input.nowISO) - Date.parse(input.lastDigestISO)) / HOUR;
  return since >= input.cooldownHours;
};

/** メール本文（PIIを含めない） */
export const buildDigestMail = (alerts: DetectedAlert[]): { subject: string; text: string } => {
  const sorted = sortAlerts(alerts);
  const crit = sorted.filter((a) => a.severity === 'critical').length;
  const warn = sorted.filter((a) => a.severity === 'warning').length;
  const mark: Record<AlertSeverity, string> = { critical: '🔴', warning: '🟠', info: 'ℹ️' };
  return {
    subject: `${crit > 0 ? '🔴' : '🟠'}【AIコース監視】未解決 ${sorted.length}件（重大 ${crit} / 注意 ${warn}）`,
    text: [
      'AIコースの自動監視で、対応が必要かもしれない項目を検知しました。',
      '',
      ...sorted.map((a) => `${mark[a.severity]} ${a.title}\n   ${a.detail}`),
      '',
      '管理画面（運用タブ）で内容を確認し、対応が終わったら「解決済み」にしてください。',
      'https://kawabado.com/ja/ai-course/admin',
      '',
      '※ このメールに会話内容・氏名・メールアドレスは含まれません。',
    ].join('\n'),
  };
};
