// E2E共通ヘルパー。
//
// **remoteへ一切触れない**ための仕掛けがすべてここにある:
//   - blockRemote: *.supabase.co を含む外部ドメインへの全リクエストを遮断
//   - mintJwt: wrangler.dev.toml と同じ**local専用の偽secret**でHS256 JWTを作る
//     （Worker がこの鍵で検証するので、本物の Supabase 認証は不要になる）
//   - seedAuth: supabase-js が読むローカル保存へセッションを注入
import { createHmac } from 'node:crypto';
import type { Page } from '@playwright/test';

// wrangler.dev.toml の [vars] と同じ値（local 専用の偽物）
const JWT_SECRET = 'local-dev-only-jwt-secret-do-not-use-in-production';
const SUPABASE_REF = 'jdkwijdphlkrcoiggfqw';

export const E2E_USER_ID = 'e2e-user-a';

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const mintJwt = (sub = E2E_USER_ID): string => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub, aud: 'authenticated', role: 'authenticated',
    email: 'e2e@example.com',
    exp: Math.floor(Date.now() / 1000) + 6 * 3600,
  }));
  const sig = b64url(createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
};

/** 外部への通信を全部止める。E2Eがremoteへ触れない保証はここで機械的に作る */
export const blockRemote = async (page: Page): Promise<string[]> => {
  const blocked: string[] = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:8787') || url.startsWith('http://localhost:8787')) {
      return route.continue();
    }
    blocked.push(url);
    return route.abort();
  });
  return blocked;
};

/** ログイン済み状態をローカル保存へ注入する（supabase-js のセッション形式） */
export const seedAuth = async (page: Page): Promise<void> => {
  const token = mintJwt();
  await page.addInitScript(([key, session]) => {
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, session);
  }, [
    `sb-${SUPABASE_REF}-auth-token`,
    JSON.stringify({
      access_token: token,
      token_type: 'bearer',
      expires_in: 6 * 3600,
      expires_at: Math.floor(Date.now() / 1000) + 6 * 3600,
      refresh_token: 'e2e-refresh',
      user: {
        id: E2E_USER_ID, aud: 'authenticated', role: 'authenticated',
        email: 'e2e@example.com', app_metadata: {}, user_metadata: {},
        created_at: new Date().toISOString(),
      },
    }),
  ] as const);
};

/** learner（コースの学習者）をローカルキャッシュへ注入する。remote DBは読めないため */
export const seedLearner = async (page: Page): Promise<void> => {
  // **無ければ書く**。addInitScript は全navigationで走るため、
  // 毎回上書きするとアプリが保存した進捗（V2プロフィール等）がreloadで消えてしまう
  await page.addInitScript(([key, learner]) => {
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, learner);
  }, [
    'kawabado.aiCourse.v1.learner',
    JSON.stringify({
      id: 'e2e-learner-1', userId: E2E_USER_ID, startedAtISO: new Date().toISOString(),
      displayName: 'E2E学習者', preferredLanguage: 'ja', estimatedLevel: 'N3',
      difficultyLevel: 2, currentWeek: 1, isActive: true,
      hearing: {}, settings: {}, adminOverrides: {},
    }),
  ] as const);
  // 初回ガイド（はじめる前に）は既読にしておく（本E2Eの検証対象外の初回notice）
  await page.addInitScript(() => {
    window.localStorage.setItem('kawabado.aiCourse.v1.guideSeen', '1');
  });
};

export interface TrialSeed {
  activatedMinutesAgo?: number | null;  // null=未開始
  consumedSeconds?: number;
  purchasedHoursAgo?: number;
  expiredHoursAgo?: number | null;      // 指定時: activation期限をこの時間だけ過去にする
}

/** 60分パスの利用権をローカル保存へ注入する（購入フローを通さない状態別テスト用） */
export const seedTrial = async (page: Page, opts: TrialSeed = {}): Promise<void> => {
  const now = Date.now();
  const purchasedAtMs = now - (opts.purchasedHoursAgo ?? 1) * 3600_000;
  const activation = opts.activatedMinutesAgo == null ? null : {
    grantId: 'e2e-trial-1', learnerId: E2E_USER_ID,
    activatedAtMs: now - opts.activatedMinutesAgo * 60_000,
    expiresAtMs: opts.expiredHoursAgo != null
      ? now - opts.expiredHoursAgo * 3600_000
      : now - opts.activatedMinutesAgo * 60_000 + 24 * 3600_000,
  };
  await page.addInitScript(([grantsKey, grants, consumedKey, consumed]) => {
    if (!window.localStorage.getItem(grantsKey)) {
      window.localStorage.setItem(grantsKey, grants);
      window.localStorage.setItem(consumedKey, consumed);
    }
  }, [
    'ai_course_trial_grants_v1',
    JSON.stringify({
      grants: [{
        id: 'e2e-trial-1', learnerId: E2E_USER_ID, purchaseId: 'e2e-purchase-1',
        planId: 'ai-hour-pass', planVersion: 1,
        purchasedAtMs, startDeadlineMs: purchasedAtMs + 7 * 86_400_000,
        includedActiveSeconds: 3600, activation,
      }],
    }),
    'ai_course_active_seconds_v1',
    String(opts.consumedSeconds ?? 0),
  ] as const);
};

/** consoleエラーの収集（既知の無害パターンは除外して最後に0を確認する） */
export const collectConsoleErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 遮断した外部通信のネットワークエラーは想定内（remote不接触の副作用）
    if (text.includes('supabase.co') || text.includes('ERR_FAILED')
      || text.includes('Failed to load resource') || text.includes('net::')
      || text.includes('AuthRetryableFetchError') || text.includes('Failed to fetch')) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    const m = String(err.message ?? err);
    if (m.includes('Failed to fetch') || m.includes('AuthRetryableFetchError')) return;
    errors.push(m);
  });
  return errors;
};

/** 横スクロールが無いこと（mobile UX） */
export const assertNoHorizontalOverflow = async (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
