/**
 * 有料教材assetの「通行証」をもらう（2026-08-24）。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 * 本番実測で、教材データが認証なしで取得できていた:
 *   GET https://kawabado.com/assets/ai-course-vocab-content-*.js
 *     → HTTP 200 / 2,080,346 bytes（読解・聴解と合わせて約3.2MB）
 * ¥600 / ¥2,980 / ¥100,000 で売っている商品の中身が、URLを叩くだけで全量取れる状態。
 *
 * 本番は Cloudflare Pages Advanced mode で全リクエストが Worker を通るため、
 * 教材チャンクのパスだけを署名付きCookieで塞げる（scripts/generate-worker.mjs）。
 * この関数は、そのCookieを学習アプリ側から取りに行く。
 *
 * ── 設計の約束 ─────────────────────────────────────────────
 * **失敗しても学習を止めない。** 門は既定でOFF（Worker側の環境変数が 'on' かつ
 * 署名鍵が設定されているときだけ閉じる）なので、この呼び出しが失敗しても
 * 教材は今までどおり配られる。学習を止めるほうが害が大きい。
 * ただし失敗は残す（門をONにする前に気づけるように）。
 */
import { getAccessToken } from './courseAuth';

/** 通行証の取得結果。'disabled' は Worker 側で門が無効という正常応答 */
export type CoursePassResult = 'granted' | 'disabled' | 'unauthorized' | 'unavailable' | 'error';

const PASS_ENDPOINT = '/_course/pass';

/** 期限より少し前に取り直す（学習中に切れて403になるのを避ける） */
const RENEW_MARGIN_MS = 10 * 60 * 1000;

/** 同じ画面で何度も叩かないための覚え書き。タブを閉じれば消えてよい */
let cachedExpiry = 0;
let inFlight: Promise<CoursePassResult> | null = null;

/** テスト用。モジュール状態を初期化する */
export function resetCoursePassCacheForTest(): void {
  cachedExpiry = 0;
  inFlight = null;
}

/**
 * 通行証を確保する。すでに有効なら何もしない。
 * 同時に複数から呼ばれても実際のリクエストは1本にまとめる。
 */
export function ensureCoursePass(now: number = Date.now()): Promise<CoursePassResult> {
  if (cachedExpiry - RENEW_MARGIN_MS > now) return Promise.resolve('granted');
  if (inFlight) return inFlight;
  inFlight = requestPass()
    .finally(() => { inFlight = null; });
  return inFlight;
}

async function requestPass(): Promise<CoursePassResult> {
  let token: string | null;
  try {
    token = await getAccessToken();
  } catch {
    return 'error';
  }
  // 未ログインなら門を通る必要がない（教材はログイン後にしか要求されない）
  if (!token) return 'unauthorized';

  let res: Response;
  try {
    res = await fetch(PASS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      // Cookie を受け取るため。同一オリジンなので既定でも付くが明示する
      credentials: 'same-origin',
    });
  } catch {
    // 圏外・遮断など。門がOFFなら教材はそのまま配られるので学習は続く
    return 'unavailable';
  }

  if (res.status === 401) return 'unauthorized';
  if (res.status >= 500) return 'unavailable';
  if (!res.ok) return 'error';

  let body: { ok?: boolean; exp?: number; gate?: string } | null;
  try {
    body = await res.json();
  } catch {
    return 'error';
  }
  if (body?.gate === 'disabled') {
    // Worker に署名鍵が無い＝門は閉じていない。取り直す必要もない
    cachedExpiry = 0;
    return 'disabled';
  }
  if (typeof body?.exp === 'number' && Number.isFinite(body.exp)) {
    cachedExpiry = body.exp;
    return 'granted';
  }
  return 'error';
}

/**
 * 教材の読み込みで403が返ったときのリカバリ。
 * 通行証を捨てて取り直す（期限切れが原因なら次は通る）。
 */
export async function renewCoursePass(): Promise<CoursePassResult> {
  cachedExpiry = 0;
  inFlight = null;
  return requestPass();
}
