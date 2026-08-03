// ログイン試行の抑制（PAID STUDENT PILOT §6）。
//
// 6文字パスワードは総当たりに弱いので、抑制は必須。ただし
// **正規の学習者が復旧できなくなる設計にはしない**（永久lockを作らない）。
//
// 純関数。試行履歴は呼び出し側（DB）が持ち、ここは判定だけを担う。
// server-sideでのみ使う（clientの判定は迂回できるため意味を持たない）。

export interface LoginAttempt {
  /** epoch ms */
  atMs: number;
  ok: boolean;
}

export interface ThrottlePolicy {
  /** 連続失敗がこの回数でlock */
  lockAfterFailures: number;
  /** lockの長さ（ミリ秒）。自動で解ける */
  lockDurationMs: number;
  /** 失敗回数を数える窓 */
  windowMs: number;
  /** 段階的待機の基準（失敗n回目で n*baseDelayMs 待たせる） */
  baseDelayMs: number;
  /** 待たせる上限（体感で長すぎるとサポート問い合わせになる） */
  maxDelayMs: number;
}

/**
 * 既定値。
 * 5回で15分lock（§6）。lockは自動解除で、メールからのパスワード再設定は常に使える。
 */
export const DEFAULT_LOGIN_THROTTLE: ThrottlePolicy = {
  lockAfterFailures: 5,
  lockDurationMs: 15 * 60_000,
  windowMs: 30 * 60_000,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
};

export type ThrottleState =
  | { kind: 'allow'; delayMs: number }
  | { kind: 'locked'; unlocksAtMs: number; remainingMs: number };

/**
 * いま試行してよいか。
 *
 * 直近の**成功**より後の失敗だけを数える（§6「成功時に失敗回数reset」）。
 * 成功をまたいで数えると、久しぶりに使う学習者がすぐlockされる。
 */
export const evaluateThrottle = (
  attempts: LoginAttempt[],
  nowMs: number,
  policy: ThrottlePolicy = DEFAULT_LOGIN_THROTTLE,
): ThrottleState => {
  const inWindow = attempts
    .filter((a) => nowMs - a.atMs >= 0 && nowMs - a.atMs < policy.windowMs)
    .sort((a, b) => a.atMs - b.atMs);

  const lastSuccessAt = inWindow.filter((a) => a.ok).reduce((m, a) => Math.max(m, a.atMs), 0);
  const failures = inWindow.filter((a) => !a.ok && a.atMs > lastSuccessAt);

  if (failures.length >= policy.lockAfterFailures) {
    const lockStartedAt = failures[policy.lockAfterFailures - 1].atMs;
    const unlocksAtMs = lockStartedAt + policy.lockDurationMs;
    if (nowMs < unlocksAtMs) {
      return { kind: 'locked', unlocksAtMs, remainingMs: unlocksAtMs - nowMs };
    }
    // lock時間を過ぎたら自動解除（永久lockにしない・§6）
    return { kind: 'allow', delayMs: 0 };
  }

  // 段階的待機。1回目は待たせない（打ち間違いは誰でもする）
  const delayMs = Math.min(failures.length * policy.baseDelayMs, policy.maxDelayMs);
  return { kind: 'allow', delayMs };
};

/** lock中に学習者へ出す文言。IDの存在は示唆しない */
export const lockMessage = (remainingMs: number, lang: 'ja' | 'zh'): string => {
  const min = Math.max(1, Math.ceil(remainingMs / 60_000));
  return lang === 'zh'
    ? `为了保护账号，暂时无法登录。请约${min}分钟后再试。忘记密码可以从「忘记密码」重新设置。`
    : `安全のため、一時的にログインを停止しています。約${min}分後にもう一度お試しください。パスワードが分からないときは「パスワードを忘れた方」から再設定できます。`;
};

/**
 * 失敗時の共通文言（§3）。
 * **IDが存在するかどうかを推測させない。** ID未登録もパスワード違いも同じ文言。
 */
export const loginFailedMessage = (lang: 'ja' | 'zh'): string =>
  lang === 'zh' ? '登录ID或密码不正确。' : 'ログインIDまたはパスワードが正しくありません。';

/**
 * パスワード再設定・ID問い合わせの共通文言（§4・§5）。
 * **登録の有無にかかわらず同じ文章**を出し、第三者が登録済みメールを特定できないようにする。
 */
export const resetRequestedMessage = (lang: 'ja' | 'zh'): string =>
  lang === 'zh'
    ? '已确认登记状况，如果符合条件，我们已发送重设邮件。'
    : '登録状況を確認し、該当する場合は再設定メールを送信しました。';

// ─────────────────────────────────────────────────────────
// ログ出力の伏字（§6: password・token・emailのredaction）
// ─────────────────────────────────────────────────────────

/**
 * ログへ出す前に機密を伏せる。
 * 「デバッグのつもりで丸ごと出す」を防ぐため、**ログに渡す値は必ずここを通す**。
 */
export const redactForLog = (value: unknown): string => {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return s
    // メールはドメインだけ残す（障害調査でドメイン別の傾向は見たいため）
    .replace(/[\w.+-]+@([\w-]+\.[\w.-]+)/g, '***@$1')
    // JWT / 長いトークン
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '***jwt***')
    .replace(/\b(sbp|sb|pk|sk)_[A-Za-z0-9_-]{8,}\b/g, '***token***')
    // 6文字英数字パスワードそのもの（passwordというキー名の直後）
    .replace(/("?password"?\s*[:=]\s*)"?[A-Za-z0-9]{4,}"?/gi, '$1"***"');
};
