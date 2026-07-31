// Error codes と監視イベント（§16）。
//
// 方針: learnerには技術用語を出さず、内部では原因を追跡できるようにする。
// 各codeは「learnerへの文言」「安全な次の行動」「再試行可否」「重大度」「送ってよいpayload」を持つ。
//
// PII方針（厳守）: email・JWT・APIキー・会話全文・自由入力全文・教材全文は送信しない。
// 送ってよいのは route/feature/locale/appVersion/contentVersion/errorCode/deviceClass のみ。

export type ErrorCode =
  | 'AUTH_EXPIRED' | 'ENTITLEMENT_DENIED' | 'LOAD_FAILED' | 'SAVE_FAILED'
  | 'SYNC_PENDING' | 'SYNC_CONFLICT' | 'RLS_DENIED' | 'AI_UNAVAILABLE'
  | 'MIC_DENIED' | 'REALTIME_DISCONNECTED' | 'CONTENT_UNAVAILABLE' | 'IMAGE_FAILED'
  | 'STATE_CORRUPTED' | 'SCHEMA_NEWER' | 'RATE_LIMITED' | 'UNKNOWN';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorSpec {
  code: ErrorCode;
  /** learnerに見せる文言。技術用語・英語コードを含めない */
  userMessageJa: string;
  userMessageZh: string;
  /** 次にできる安全な行動（第一CTAは常に一つ） */
  safeActionJa: string;
  retryable: boolean;
  severity: Severity;
  /** 監視イベントとして送るか（infoは送らない） */
  report: boolean;
}

const spec = (
  code: ErrorCode, userMessageJa: string, userMessageZh: string, safeActionJa: string,
  retryable: boolean, severity: Severity, report = true,
): ErrorSpec => ({ code, userMessageJa, userMessageZh, safeActionJa, retryable, severity, report });

export const ERROR_SPECS: Record<ErrorCode, ErrorSpec> = {
  AUTH_EXPIRED: spec('AUTH_EXPIRED',
    'ログインの有効期限が切れました', '登录已过期', 'もう一度ログインする', false, 'warning'),
  ENTITLEMENT_DENIED: spec('ENTITLEMENT_DENIED',
    'このコースはまだご利用いただけません', '此课程尚未开放', 'ホームへもどる', false, 'warning'),
  LOAD_FAILED: spec('LOAD_FAILED',
    '内容を読み込めませんでした', '内容加载失败', 'もう一度読み込む', true, 'error'),
  SAVE_FAILED: spec('SAVE_FAILED',
    'まだ保存できていません', '尚未保存成功', 'もう一度保存する', true, 'error'),
  SYNC_PENDING: spec('SYNC_PENDING',
    '保存待ちの学習記録があります', '有学习记录正在等待保存', '接続が戻るまで待つ（学習は続けられます）', true, 'info', false),
  SYNC_CONFLICT: spec('SYNC_CONFLICT',
    '別の端末での学習と記録が重なりました', '与其他设备的学习记录重叠', 'この端末の内容で続ける／別端末の内容を読み込む', true, 'warning'),
  RLS_DENIED: spec('RLS_DENIED',
    'この内容を開く権限がありません', '没有权限打开此内容', 'ホームへもどる', false, 'critical'),
  AI_UNAVAILABLE: spec('AI_UNAVAILABLE',
    'いまはAI会話を始められません', '现在无法开始AI会话', 'テキストで学習を続ける', true, 'error'),
  MIC_DENIED: spec('MIC_DENIED',
    'マイクが使えない設定になっています', '麦克风未被允许使用', 'テキストで会話する', false, 'warning'),
  REALTIME_DISCONNECTED: spec('REALTIME_DISCONNECTED',
    '会話の接続が切れました', '会话连接已断开', 'もう一度つなぐ', true, 'error'),
  CONTENT_UNAVAILABLE: spec('CONTENT_UNAVAILABLE',
    'この教材はいま表示できません', '此教材当前无法显示', '別の学習へ進む', true, 'error'),
  IMAGE_FAILED: spec('IMAGE_FAILED',
    'イラストを表示できませんでした', '插图加载失败', 'そのまま学習を続ける（文字で学べます）', true, 'info', false),
  STATE_CORRUPTED: spec('STATE_CORRUPTED',
    '前回の続きが読み取れませんでした', '无法读取上次的进度', 'この単元を最初から始める', false, 'warning'),
  SCHEMA_NEWER: spec('SCHEMA_NEWER',
    '新しいバージョンの記録が見つかりました', '发现了更新版本的记录', 'アプリを再読み込みする', true, 'warning'),
  RATE_LIMITED: spec('RATE_LIMITED',
    '今日の会話の上限に達しました', '已达到今天的会话上限', '明日また続ける（復習は今日もできます）', false, 'info', false),
  UNKNOWN: spec('UNKNOWN',
    '問題が起きました', '发生了问题', 'もう一度試す', true, 'error'),
};

export const errorSpec = (code: ErrorCode): ErrorSpec => ERROR_SPECS[code] ?? ERROR_SPECS.UNKNOWN;

// ── 監視イベント ──

export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/** 送信してよいフィールドだけを持つ型。ここに無いものは送らない */
export interface MonitoringEvent {
  eventName: string;
  code?: ErrorCode;
  severity?: Severity;
  route: string;
  feature: string;
  locale: 'ja' | 'zh';
  appVersion: string;
  contentVersion: string;
  deviceClass: DeviceClass;
  occurredAtMs: number;
}

/** 送信してはいけないキー（混入を機械的に防ぐ） */
export const FORBIDDEN_EVENT_KEYS = [
  'email', 'mail', 'jwt', 'token', 'accessToken', 'apiKey', 'authorization',
  'transcript', 'conversation', 'message', 'freeText', 'input', 'answerText',
  'learnerName', 'name', 'content', 'materialText', 'password',
];

/**
 * 送信前サニタイズ。許可リスト方式で、未知のキーは落とす。
 * 「消し忘れ」ではなく「そもそも入らない」構造にする。
 */
export const sanitizeEvent = (raw: Record<string, unknown>): MonitoringEvent | null => {
  const allowed: (keyof MonitoringEvent)[] = ['eventName', 'code', 'severity', 'route', 'feature',
    'locale', 'appVersion', 'contentVersion', 'deviceClass', 'occurredAtMs'];
  const out = {} as Record<string, unknown>;
  for (const k of allowed) if (raw[k] !== undefined) out[k] = raw[k];
  if (typeof out.eventName !== 'string' || typeof out.route !== 'string') return null;
  // 値の中にトークンらしき長い文字列が紛れていないか（route等への混入防止）
  for (const v of Object.values(out)) {
    if (typeof v === 'string' && (v.length > 200 || /eyJ[A-Za-z0-9_-]{4,}\./.test(v))) return null;
  }
  return out as unknown as MonitoringEvent;
};

/** 監視の送信先。外部サービス導入前でも、実装とテストが成立するようにadapterで抽象化する */
export interface MonitoringAdapter {
  send(event: MonitoringEvent): void;
}

/** 送信先未確定の間の既定実装。件数だけ保持し、外部へは出さない */
export const createInMemoryMonitoring = (): MonitoringAdapter & { events: MonitoringEvent[] } => {
  const events: MonitoringEvent[] = [];
  return { events, send(e) { events.push(e); } };
};

export interface MonitoringContext {
  route: string; feature: string; locale: 'ja' | 'zh';
  appVersion: string; contentVersion: string; deviceClass: DeviceClass;
}

/** エラー報告。infoかつreport=falseのcodeは送らない（ノイズと個人情報の削減） */
export const reportError = (
  adapter: MonitoringAdapter, code: ErrorCode, ctx: MonitoringContext, nowMs: number,
): MonitoringEvent | null => {
  const s = errorSpec(code);
  if (!s.report) return null;
  const ev = sanitizeEvent({ eventName: 'error', code, severity: s.severity, ...ctx, occurredAtMs: nowMs });
  if (ev) adapter.send(ev);
  return ev;
};

/** 学習イベント（Quest/Unitの開始・完了など）。学習内容そのものは送らない */
export const reportEvent = (
  adapter: MonitoringAdapter, eventName: string, ctx: MonitoringContext, nowMs: number,
): MonitoringEvent | null => {
  const ev = sanitizeEvent({ eventName, ...ctx, occurredAtMs: nowMs });
  if (ev) adapter.send(ev);
  return ev;
};
