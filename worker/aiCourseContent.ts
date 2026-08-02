// 教材配信エンドポイント `/api/ai-course/content`（P0）。
//
// ここが**教材へ到達する唯一の経路**。client bundle にも public asset にも教材は無いので、
// この関数を通らずに教材へ届く道が無いことが安全性の根拠になる。
//
// 判断そのものは書かない。`contentDelivery.decideDelivery()` に委ねる。
// この層の仕事は「HTTPの入口で身元を確かめ、判断層へ正しい事実を渡し、
// 許可された分だけ R2 から読んで、渡してよい形に削って返す」こと。

import {
  decideDelivery,
  MAX_ITEMS_PER_REQUEST,
  type ContentKind,
  type ContentRequest,
  type DeliveryContext,
  type StageState,
} from '../src/lib/aiLesson/course/sales/contentDelivery';
import { toDeliverable, type InternalItem } from '../src/lib/aiLesson/course/sales/contentGuard';
import type { TrialGrant } from '../src/lib/aiLesson/course/sales/trialActivation';

export interface ContentEnv {
  /** 教材ページの非公開バケット。public access は有効にしない */
  AI_COURSE_CONTENT?: R2Bucket;
  /** セッショントークンの署名鍵 */
  AI_COURSE_CONTENT_TOKEN_SECRET?: string;
  /** Supabase の JWT 検証用 */
  SUPABASE_JWT_SECRET?: string;
  /** local 検証でだけ 'enabled'。**本番では絶対に設定しない** */
  AI_COURSE_DEV_TOKENS?: string;
}

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

// ── 署名（HMAC-SHA256）──────────────────────────────────

const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const hmac = async (payload: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
};

/** 定数時間比較。長さが違えば即不一致 */
const sigEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// ── セッショントークン ────────────────────────────────
//
// 「誰が・どのセッションで・どのステージに居て・どんな利用権を持つか」を
// **サーバーが署名して**渡す。学習者が書き換えても署名が合わない。
//
// 期限は token に焼き込まない。grant を載せて **毎回サーバー時刻で resolveTrial する**。
// そうしないと「有効なうちに取った token を期限後も使える」穴が残る。

export interface SessionClaims {
  userId: string;
  sessionId: string;
  stageId: string;
  stageState: StageState;
  kind: ContentKind;
  /**
   * 要求レベル。targetId が level を含んでいても**キーから外せない**。
   * 同じ `vocab-n3` でも N2 要求では誤答が N2 語彙から選ばれ、中身が変わるため。
   */
  level: 'n2' | 'n3';
  targetId: string;
  trial: TrialGrant | null;
  hasPeriodAccess: boolean;
  consumedActiveSeconds: number;
  issuedAtMs: number;
}

export const signSession = async (claims: SessionClaims, secret: string): Promise<string> => {
  const payload = JSON.stringify(claims);
  const body = b64url(new TextEncoder().encode(payload));
  return `${body}.${await hmac(payload, secret)}`;
};

export const verifySession = async (token: string, secret: string): Promise<SessionClaims | null> => {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let payload: string;
  try {
    payload = new TextDecoder().decode(fromB64url(body));
  } catch {
    return null;
  }
  if (!sigEquals(await hmac(payload, secret), sig)) return null;
  try {
    const c = JSON.parse(payload) as SessionClaims;
    return typeof c?.userId === 'string' && typeof c?.sessionId === 'string' ? c : null;
  } catch {
    return null;
  }
};

// ── 認証 ──────────────────────────────────────────────
//
// Supabase の access token は HS256。プロジェクトの JWT secret で検証する。

const verifyBearer = async (request: Request, secret: string): Promise<string | null> => {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  if (!sigEquals(await hmac(`${h}.${p}`, secret), s)) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p))) as { sub?: string; exp?: number };
    if (!claims?.sub) return null;
    // exp は秒。期限切れの token は受け付けない
    if (typeof claims.exp === 'number' && Date.now() / 1000 > claims.exp) return null;
    return claims.sub;
  } catch {
    return null;
  }
};

// ── 連打の抑制 ────────────────────────────────────────
//
// isolate 内のメモリ。**完全な保証ではない**（isolate が分かれると別勘定）。
// 本来は Durable Object へ移す。ここでは「自動化した高速列挙を目に見えて遅くする」
// までを担当し、正規の学習ペース（1問数秒〜数十秒）には当たらない値に置く。

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const hits = new Map<string, number[]>();

const rateLimited = (key: string, nowMs: number): boolean => {
  const prev = hits.get(key) ?? [];
  const recent = prev.filter((t) => nowMs - t >= 0 && nowMs - t < RATE_WINDOW_MS);
  recent.push(nowMs);
  hits.set(key, recent);
  return recent.length > RATE_MAX;
};

// ── 本体 ──────────────────────────────────────────────

interface ShardPage {
  targetId: string;
  page: number;
  items: (InternalItem & { promptZh: string | null; passageJa: string | null; audioSetId: string | null })[];
}

const PAGE_SIZE = 20;

export const handleContentRequest = async (request: Request, env: ContentEnv): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const tokenSecret = env.AI_COURSE_CONTENT_TOKEN_SECRET;
  const jwtSecret = env.SUPABASE_JWT_SECRET;
  if (!tokenSecret || !jwtSecret) {
    // 鍵が無い環境で「とりあえず配る」ことは絶対にしない
    return json({ error: 'content_delivery_unconfigured' }, 503);
  }

  // 1. 認証。ここを通らなければ何も返さない
  const userId = await verifyBearer(request, jwtSecret);
  if (!userId) return json({ error: 'unauthenticated' }, 401);

  let body: { sessionToken?: string; stepIndex?: number; count?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  // 2. セッショントークンの署名を確かめる。改ざんはここで落ちる
  const claims = body.sessionToken ? await verifySession(body.sessionToken, tokenSecret) : null;
  if (!claims) return json({ error: 'invalid_session' }, 403);

  // 3. 他人の token を持ち込んでも通らない
  if (claims.userId !== userId) return json({ error: 'session_not_owned' }, 403);

  const nowMs = Date.now();
  if (rateLimited(`${userId}:${claims.sessionId}`, nowMs)) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '30' });
  }

  const req: ContentRequest = {
    userId,
    role: 'learner',
    kind: claims.kind,
    stageId: claims.stageId,
    stepIndex: Number(body.stepIndex ?? 0),
    count: Number(body.count ?? MAX_ITEMS_PER_REQUEST),
    sessionId: claims.sessionId,
  };

  const ctx: DeliveryContext = {
    trial: claims.trial,
    consumedActiveSeconds: claims.consumedActiveSeconds,
    hasPeriodAccess: claims.hasPeriodAccess,
    stageState: claims.stageState,
    sessionOwnerId: claims.userId,
    // **サーバー時刻**で判断する。client の時計は信用しない
    serverNowMs: nowMs,
  };

  // 4. 渡してよいかの判断は判断層に任せる
  const decision = decideDelivery(req, ctx);
  if (!decision.allowed) {
    // 401 は認証、それ以外の拒否は 403。理由コードだけ返し、内部事情は書かない
    return json({ error: decision.denial }, 403);
  }

  // 5. 必要なページだけ R2 から読む
  const bucket = env.AI_COURSE_CONTENT;
  if (!bucket) return json({ error: 'content_store_unavailable' }, 503);

  const page = Math.floor(req.stepIndex * MAX_ITEMS_PER_REQUEST / PAGE_SIZE);
  const key = `v1/${claims.kind}/${claims.level}/${claims.targetId}/${page}.json`;
  const obj = await bucket.get(key);
  if (!obj) return json({ error: 'step_out_of_range' }, 403);

  const shard = await obj.json<ShardPage>();
  const offset = (req.stepIndex * MAX_ITEMS_PER_REQUEST) % PAGE_SIZE;
  const slice = shard.items.slice(offset, offset + (decision.count ?? MAX_ITEMS_PER_REQUEST));
  if (slice.length === 0) return json({ error: 'step_out_of_range' }, 403);

  // 6. 渡してよい形へ削る。内部ID・出典・監査欄はここで落ちる
  const items = slice.map((it, i) => ({
    ...toDeliverable(it, claims.sessionId, req.stepIndex * MAX_ITEMS_PER_REQUEST + i),
    promptZh: it.promptZh,
    passageJa: it.passageJa,
  }));

  return json({
    stageId: req.stageId,
    stepIndex: req.stepIndex,
    items,
    // 次のstepは「あるかどうか」だけ。総数もページ数も教えない
    hasNextStep: offset + slice.length < shard.items.length || shard.items.length === PAGE_SIZE,
  }, 200);
};

/**
 * local 検証専用のトークン発行。
 * **`AI_COURSE_DEV_TOKENS=enabled` のときだけ動く。本番では設定しない。**
 * 本番では利用権を DB から引いてサーバーが発行する（migration 適用後に接続する）。
 */
export const handleDevTokenRequest = async (request: Request, env: ContentEnv): Promise<Response> => {
  if (env.AI_COURSE_DEV_TOKENS !== 'enabled') return json({ error: 'not_found' }, 404);
  const secret = env.AI_COURSE_CONTENT_TOKEN_SECRET;
  if (!secret) return json({ error: 'content_delivery_unconfigured' }, 503);
  const claims = await request.json() as SessionClaims;
  return json({ sessionToken: await signSession(claims, secret) }, 200);
};
