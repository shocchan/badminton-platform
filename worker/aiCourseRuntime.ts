// 学習アクティビティのサーバー実行層（P0-A/B/C の心臓部）。
//
// 3つの約束をここで守る:
//   1. 教材は現在の活動に必要な分だけ返す（bank 全体は絶対に返さない）
//   2. **正解・解説は問題と一緒に返さない**。採点エンドポイントが回答後にだけ返す
//   3. 音声は短命トークンつきURLでだけ取得できる
//
// 出題編成（buildEncounter / startMockSession / selectDiagnosisQuestions）は
// client と同じ純関数を Worker 内で動かす。教材データは R2 から必要ページだけ読む。
// seed を固定すれば編成は決定的なので、採点時に同じ編成を再構成できる＝サーバーに状態が要らない。

import { buildEncounter } from '../src/lib/aiLesson/course/adventure/advBattle';
import { presentQuestion } from '../src/lib/aiLesson/course/adventure/advChoiceOrder';
import { buildMockSpec, type MockAvailability } from '../src/lib/aiLesson/course/adventure/advMock';
import { startMockSession, gradeMock, sectionTimeLimit } from '../src/lib/aiLesson/course/adventure/advMockSession';
import { selectDiagnosisQuestions, type DiagQuestion, type DiagnosisPools } from '../src/lib/aiLesson/course/adventure/advDiagnosis';
import type { AdvBattleQuestion } from '../src/lib/aiLesson/course/adventure/advVariants';
import { resolveTrial, type TrialGrant } from '../src/lib/aiLesson/course/sales/trialActivation';
import type { AdvEnemyTier } from '../src/lib/aiLesson/course/adventure/advTypes';
import { hasActivePeriodAccess } from './aiCoursePeriodAccess';

// ─────────────────────────────────────────────────────────
// 共有ユーティリティ（HMAC / base64url / JWT検証）
// ─────────────────────────────────────────────────────────

export interface RuntimeEnv {
  AI_COURSE_CONTENT?: R2Bucket;
  AI_COURSE_CONTENT_TOKEN_SECRET?: string;
  /** JWKS（公開鍵）で access token を検証するための Supabase プロジェクトURL */
  SUPABASE_URL?: string;
  /** HS256の共有secret。**local検証専用**（本番/stagingはJWKSを使う） */
  SUPABASE_JWT_SECRET?: string;
  /** 期間制の利用権を台帳で確かめるために使う。**browserへは渡さない** */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /**
   * セッション発行モード。
   * 'client-asserted' = 進捗・利用権をclient申告で署名する（**staging/local専用**）。
   * 未設定（本番既定）= 発行はDB接続が要るため 503。誤って本番で開かない
   */
  AI_COURSE_SESSION_MODE?: string;
  /** local R2 への一括投入口を開く。**wrangler.dev.toml 専用**。本番では設定しない */
  AI_COURSE_DEV_SEED?: string;
}

/**
 * POST /api/ai-course/dev-seed — local 検証用の R2 一括投入。
 * wrangler CLI の1件ずつの put は1,500ファイルで30分かかるため、HTTP経由で流し込む。
 * フラグが無い環境（=本番）では存在しないのと同じ 404。
 */
export const handleDevSeed = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  if (env.AI_COURSE_DEV_SEED !== 'enabled') {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  const bucket = env.AI_COURSE_CONTENT;
  if (!bucket) return new Response(JSON.stringify({ error: 'content_store_unavailable' }), { status: 503 });
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';
  if (!key || key.includes('..')) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 });
  await bucket.put(key, request.body);
  return new Response(JSON.stringify({ ok: true, key }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const hmacRaw = async (payload: string, secret: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
};

const hmac = async (payload: string, secret: string): Promise<string> => b64url(await hmacRaw(payload, secret));

const sigEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const signJson = async (payload: unknown, secret: string): Promise<string> => {
  const body = JSON.stringify(payload);
  return `${b64url(new TextEncoder().encode(body))}.${await hmac(body, secret)}`;
};

const verifyJson = async <T,>(token: string, secret: string): Promise<T | null> => {
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
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
};

// ── Supabase access token の検証 ────────────────────────
//
// Supabase は非対称鍵（ES256）へ移行し、**JWT secret を API から返さなくなった**。
// 公開鍵（JWKS）で検証する方式にしておくと、共有秘密を持ち回らずに済む＝漏れる物が減る。
// local 検証では HS256 の偽secretを使うので、両方に対応する。

interface JwkCache { keys: Record<string, CryptoKey>; fetchedAtMs: number }
let jwkCache: JwkCache | null = null;
const JWK_TTL_MS = 10 * 60_000;

const loadJwks = async (supabaseUrl: string): Promise<Record<string, CryptoKey>> => {
  if (jwkCache && Date.now() - jwkCache.fetchedAtMs < JWK_TTL_MS) return jwkCache.keys;
  const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) return {};
  const body = await res.json() as { keys?: (JsonWebKey & { kid?: string; alg?: string })[] };
  const keys: Record<string, CryptoKey> = {};
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid) continue;
    const algo = jwk.kty === 'EC'
      ? { name: 'ECDSA', namedCurve: (jwk as { crv?: string }).crv ?? 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    try {
      keys[jwk.kid] = await crypto.subtle.importKey('jwk', jwk, algo, false, ['verify']);
    } catch { /* 読めない鍵は無視（他の鍵で検証できる） */ }
  }
  jwkCache = { keys, fetchedAtMs: Date.now() };
  return keys;
};

/**
 * access token の検証。sub = userId。
 * ES256/RS256 は JWKS で、HS256 は共有secret（local検証用）で確かめる。
 */
export const verifyBearer = async (
  request: Request,
  opts: { hmacSecret?: string; supabaseUrl?: string },
): Promise<string | null> => {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const [h, p, s] = auth.slice(7).split('.');
  if (!h || !p || !s) return null;

  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
  } catch {
    return null;
  }

  let signatureOk = false;
  if (header.alg === 'HS256') {
    if (!opts.hmacSecret) return null;
    signatureOk = sigEquals(await hmac(`${h}.${p}`, opts.hmacSecret), s);
  } else if (header.kid && opts.supabaseUrl) {
    const key = (await loadJwks(opts.supabaseUrl))[header.kid];
    if (!key) return null;
    const algo = key.algorithm.name === 'ECDSA'
      ? { name: 'ECDSA', hash: 'SHA-256' }
      : { name: 'RSASSA-PKCS1-v1_5' };
    signatureOk = await crypto.subtle.verify(
      algo, key, fromB64url(s), new TextEncoder().encode(`${h}.${p}`),
    ).catch(() => false);
  }
  if (!signatureOk) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p))) as { sub?: string; exp?: number };
    if (!claims?.sub) return null;
    if (typeof claims.exp === 'number' && Date.now() / 1000 > claims.exp) return null;
    return claims.sub;
  } catch {
    return null;
  }
};

/**
 * 問題キーの偽名化。
 * 実キー（`u-know:unit01:q3` 等）はバンク構造を晒すので client へ出さない。
 * 偽名は鍵つきHMACなので、学習者が集めても元のキー・総数・命名規則を再構成できない。
 * 同じ鍵なら安定しているため、client 側の既出管理・mastery台帳はそのまま機能する。
 */
const pseudo = async (key: string, secret: string): Promise<string> =>
  b64url((await hmacRaw(`qk:${key}`, secret)).slice(0, 12));

// ─────────────────────────────────────────────────────────
// セッション（利用権つき署名トークン）
// ─────────────────────────────────────────────────────────

export interface RuntimeClaims {
  userId: string;
  sessionId: string;
  level: 'n2' | 'n3';
  trial: TrialGrant | null;
  hasPeriodAccess: boolean;
  /** 発行時点の消費済みアクティブ秒。サーバー正準化はDB接続後（それまでの限界は docs 参照） */
  consumedActiveSeconds: number;
  /** 開放済みのバトル/文法doc対象。'*' は全開放（開発検証用） */
  allowedTargetIds: string[] | '*';
  issuedAtMs: number;
}

/** セッショントークンの受理上限。24h利用枠 + 余裕。これを過ぎたら再発行してもらう */
const SESSION_MAX_AGE_MS = 26 * 3600_000;

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

type Denial =
  | 'unauthenticated' | 'invalid_session' | 'session_not_owned' | 'session_stale'
  | 'no_entitlement' | 'trial_not_started' | 'trial_expired' | 'trial_consumed'
  | 'stage_locked' | 'rate_limited' | 'bad_request' | 'not_found';

/**
 * 利用権の判定。**サーバー時刻**で毎回 resolveTrial する。
 * 有効なうちに取ったトークンを期限後に使う経路をここで塞ぐ。
 */
const gateEntitlement = (claims: RuntimeClaims, nowMs: number): Denial | null => {
  if (claims.hasPeriodAccess) return null;
  if (!claims.trial) return 'no_entitlement';
  const r = resolveTrial(claims.trial, claims.consumedActiveSeconds, nowMs);
  switch (r.state) {
    case 'unstarted': return 'trial_not_started';
    case 'start_lapsed':
    case 'expired': return 'trial_expired';
    case 'consumed': return 'trial_consumed';
    case 'active': return null;
  }
};

/** 要求 target がセッションの開放集合に入っているか。1つでも外なら鍵付き扱い */
const gateTargets = (claims: RuntimeClaims, targetIds: string[]): Denial | null => {
  if (claims.allowedTargetIds === '*') return null;
  const allowed = new Set(claims.allowedTargetIds);
  return targetIds.every((t) => allowed.has(t)) ? null : 'stage_locked';
};

// 短時間の異常な連打を抑える（isolate内メモリ。完全な保証はDurable Object移行後）
const RATE_WINDOW_MS = 60_000;
const RATE_MAX: Record<'start' | 'grade', number> = { start: 20, grade: 60 };
const hits = new Map<string, number[]>();
const rateLimited = (bucket: 'start' | 'grade', key: string, nowMs: number): boolean => {
  const k = `${bucket}:${key}`;
  const recent = (hits.get(k) ?? []).filter((t) => nowMs - t >= 0 && nowMs - t < RATE_WINDOW_MS);
  recent.push(nowMs);
  hits.set(k, recent);
  return recent.length > RATE_MAX[bucket];
};

// ─────────────────────────────────────────────────────────
// R2 からの教材読み出し
// ─────────────────────────────────────────────────────────

interface PoolIndexEntry { kind: string; scope: string; targetId: string; items: number; pages: number }
let poolIndexCache: { pageSize: number; targets: PoolIndexEntry[] } | null = null;

const readJson = async <T,>(bucket: R2Bucket, key: string): Promise<T | null> => {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return await obj.json<T>();
};

const poolIndex = async (bucket: R2Bucket) => {
  if (!poolIndexCache) {
    poolIndexCache = await readJson(bucket, 'v2/meta/pool-index.json');
  }
  return poolIndexCache;
};

interface PoolPage { targetId: string; page: number; questions: AdvBattleQuestion[] }

/** target のページを読む。vocab のような巨大 target は seed で数ページだけ標本化する */
const loadTargetQuestions = async (
  bucket: R2Bucket, entry: PoolIndexEntry, seed: number, maxPages: number,
): Promise<AdvBattleQuestion[]> => {
  const pageNos: number[] = [];
  if (entry.pages <= maxPages) {
    for (let p = 0; p < entry.pages; p++) pageNos.push(p);
  } else {
    // 決定的な標本化: 同じ seed なら同じページ集合（採点時に再構成できる）
    let s = (seed >>> 0) || 1;
    const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
    const picked = new Set<number>();
    while (picked.size < maxPages) picked.add(Math.floor(next() * entry.pages));
    pageNos.push(...[...picked].sort((a, b) => a - b));
  }
  const pages = await Promise.all(pageNos.map((p) =>
    readJson<PoolPage>(bucket, `v2/pool/${entry.kind}/${entry.scope}/${entry.targetId}/${p}.json`)));
  return pages.flatMap((pg) => pg?.questions ?? []);
};

// ─────────────────────────────────────────────────────────
// 学習者へ渡す形（正解・解説を含まない）
// ─────────────────────────────────────────────────────────

/** 選択肢は位置文字だけ。内部choiceId・isCorrect・whyWrongは渡さない */
interface SanitizedChoice { key: string; textJa: string; textZh?: string }

interface SanitizedQuestion {
  attemptToken: string;
  /** 偽名化された問題キー（既出管理・mastery台帳用） */
  key: string;
  type: string;
  skill: string;
  level: string;
  targetJapanese: string | null;
  questionJa: string | null;
  questionZh: string;
  choices: SanitizedChoice[];
  timed: boolean;
}

interface AttemptRef {
  /** shard参照: pool/<kind>/<scope>/<targetId> の中の実キー */
  kind: string; scope: string; targetId: string; qKey: string;
  /** 表示順: presented順の choiceId 列（採点で位置文字→choiceIdへ戻す） */
  ord: string[];
}

interface AttemptTokenPayload {
  u: string; s: string; ref: AttemptRef; pk: string; iat: number;
}

const CHOICE_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

/**
 * 1問を「渡してよい形」に落とし、採点用トークンを添える。
 * 正解位置の偏りは presentQuestion の決定的シャッフル + 望ましい位置指定で回避する。
 */
const sanitize = async (
  q: AdvBattleQuestion, ref: Omit<AttemptRef, 'ord' | 'qKey'>, claims: RuntimeClaims,
  attemptSeed: number, posIndex: number, secret: string,
): Promise<SanitizedQuestion> => {
  const presented = presentQuestion(q, attemptSeed, posIndex % Math.min(q.choices.length, 4));
  const pk = await pseudo(q.key, secret);
  const payload: AttemptTokenPayload = {
    u: claims.userId, s: claims.sessionId,
    ref: { ...ref, qKey: q.key, ord: presented.presentedChoiceOrder },
    pk, iat: Date.now(),
  };
  return {
    attemptToken: await signJson(payload, secret),
    key: pk,
    type: q.type, skill: q.skill, level: q.level,
    targetJapanese: q.targetJapanese,
    questionJa: q.questionJa, questionZh: q.questionZh,
    choices: presented.choices.map((c, i) => ({
      key: CHOICE_LETTERS[i], textJa: c.textJa, ...(c.textZh ? { textZh: c.textZh } : {}),
    })),
    timed: q.timed,
  };
};

// ─────────────────────────────────────────────────────────
// エンドポイント本体
// ─────────────────────────────────────────────────────────

interface AuthedContext { claims: RuntimeClaims; userId: string; nowMs: number }

const authenticate = async (
  request: Request, env: RuntimeEnv, body: { sessionToken?: string },
): Promise<AuthedContext | Response> => {
  const secret = env.AI_COURSE_CONTENT_TOKEN_SECRET;
  // 検証手段は「JWKS（本番・staging）」か「共有secret（local検証）」のどちらかがあればよい
  const supabaseUrl = env.SUPABASE_URL;
  const hmacSecret = env.SUPABASE_JWT_SECRET;
  if (!secret || (!supabaseUrl && !hmacSecret)) return json({ error: 'runtime_unconfigured' }, 503);
  const userId = await verifyBearer(request, { hmacSecret, supabaseUrl });
  if (!userId) return json({ error: 'unauthenticated' }, 401);
  const claims = body.sessionToken
    ? await verifyJson<RuntimeClaims>(body.sessionToken, secret)
    : null;
  if (!claims) return json({ error: 'invalid_session' }, 403);
  if (claims.userId !== userId) return json({ error: 'session_not_owned' }, 403);
  const nowMs = Date.now();
  if (nowMs - claims.issuedAtMs > SESSION_MAX_AGE_MS) return json({ error: 'session_stale' }, 403);
  return { claims, userId, nowMs };
};

/** POST /api/ai-course/session/issue */
export const handleSessionIssue = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  const secret = env.AI_COURSE_CONTENT_TOKEN_SECRET;
  const supabaseUrl = env.SUPABASE_URL;
  const hmacSecret = env.SUPABASE_JWT_SECRET;
  if (!secret || (!supabaseUrl && !hmacSecret)) return json({ error: 'runtime_unconfigured' }, 503);
  const userId = await verifyBearer(request, { hmacSecret, supabaseUrl });
  if (!userId) return json({ error: 'unauthenticated' }, 401);

  // 本番既定は拒否。利用権・進捗をDBから引けるようになるまで、client申告での発行は
  // staging/local に限定する（フラグを本番へ設定しない運用は docs/secure-runtime 参照）
  if (env.AI_COURSE_SESSION_MODE !== 'client-asserted') {
    return json({ error: 'session_issue_requires_database' }, 503);
  }

  let body: Partial<RuntimeClaims> & { allowedN2Units?: number[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  // N2は「12単元の束」でstageが持つため、単元→文法IDの展開はサーバー側で行う
  // （clientは n2 の文法ID一覧を持っていない）
  let expandedN2: string[] = [];
  if (Array.isArray(body.allowedN2Units) && body.allowedN2Units.length > 0 && env.AI_COURSE_CONTENT) {
    const meta = await readJson<{ n2ByUnit: Record<string, string[]> }>(env.AI_COURSE_CONTENT, 'v2/meta/grammar-structure.json');
    if (meta) expandedN2 = body.allowedN2Units.slice(0, 12).flatMap((u) => meta.n2ByUnit[String(u)] ?? []);
  }
  const claims: RuntimeClaims = {
    userId, // 申告値ではなく認証済みIDで上書きする
    sessionId: typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : crypto.randomUUID(),
    level: body.level === 'n2' ? 'n2' : 'n3',
    trial: body.trial ?? null,
    // **client の申告は使わない。** 期間制の利用権は台帳を引き直して決める
    // （申告を信じると、払っていない人でも「払った」と言えば教材が取れる）
    hasPeriodAccess: await hasActivePeriodAccess(env, userId),
    consumedActiveSeconds: Math.max(0, Number(body.consumedActiveSeconds) || 0),
    allowedTargetIds: body.allowedTargetIds === '*' ? '*'
      : Array.isArray(body.allowedTargetIds)
        ? [...body.allowedTargetIds.slice(0, 300).map(String), ...expandedN2].slice(0, 500)
        : expandedN2,
    issuedAtMs: Date.now(),
  };
  return json({ sessionToken: await signJson(claims, secret) }, 200);
};

interface StartBody {
  sessionToken?: string;
  activity?: 'battle' | 'reading' | 'listening' | 'mock' | 'diagnosis' | 'conversation';
  /** conversation: 開始するミッション */
  missionId?: string;
  // battle
  tier?: AdvEnemyTier; targetIds?: string[];
  seenKeys?: string[]; recentWrongKeys?: string[];
  // reading/listening
  count?: number;
  // mock
  mode?: 'short' | 'fullTime';
  // mock採点・復元用（既存セッションの再構成）
  attemptSeed?: number;
  // diagnosis
  targetJlpt?: 'N2' | 'N3' | null; goalType?: string;
}

/** 標本化の上限（1回の編成で読むページ数を抑える） */
const MAX_PAGES_PER_TARGET = 3;
const MAX_TARGETS_PER_BATTLE = 15;
const MOCK_GRAMMAR_TARGET_SAMPLE = 12;

/** mock 用に level のプールを決定的に標本化して組み立てる（順序安定＝採点時に同一） */
const buildMockPools = async (
  bucket: R2Bucket, level: 'n2' | 'n3', seed: number,
): Promise<Map<string, AdvBattleQuestion[]>> => {
  const idx = await poolIndex(bucket);
  if (!idx) return new Map();
  const bySorted = [...idx.targets].sort((a, b) => `${a.kind}/${a.scope}/${a.targetId}`.localeCompare(`${b.kind}/${b.scope}/${b.targetId}`));
  const grammarTargets = bySorted.filter((t) => t.kind === 'grammar');
  // 文法 target は数百あるので seed で一部を選ぶ（決定的）
  let s = (seed >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
  const pickedGrammar: PoolIndexEntry[] = [];
  const gPool = [...grammarTargets];
  while (pickedGrammar.length < Math.min(MOCK_GRAMMAR_TARGET_SAMPLE, gPool.length)) {
    pickedGrammar.push(gPool.splice(Math.floor(next() * gPool.length), 1)[0]);
  }
  const others = bySorted.filter((t) => t.kind !== 'grammar' && t.scope === level);
  const chosen = [...pickedGrammar, ...others]
    .sort((a, b) => `${a.kind}/${a.scope}/${a.targetId}`.localeCompare(`${b.kind}/${b.scope}/${b.targetId}`));
  const pools = new Map<string, AdvBattleQuestion[]>();
  for (const entry of chosen) {
    pools.set(entry.targetId, await loadTargetQuestions(bucket, entry, seed, MAX_PAGES_PER_TARGET));
  }
  return pools;
};

/** POST /api/ai-course/activity/start */
export const handleActivityStart = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: StartBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const auth = await authenticate(request, env, body);
  if (auth instanceof Response) return auth;
  const { claims, nowMs } = auth;
  const secret = env.AI_COURSE_CONTENT_TOKEN_SECRET!;
  const bucket = env.AI_COURSE_CONTENT;
  if (!bucket) return json({ error: 'content_store_unavailable' }, 503);

  if (rateLimited('start', `${claims.userId}:${claims.sessionId}`, nowMs)) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '30' });
  }
  const entitlementDenial = gateEntitlement(claims, nowMs);
  if (entitlementDenial) return json({ error: entitlementDenial }, 403);

  const idx = await poolIndex(bucket);
  if (!idx) return json({ error: 'content_store_unavailable' }, 503);
  const attemptSeed = Number.isFinite(body.attemptSeed) ? Number(body.attemptSeed) : Date.now();

  // ── バトル ──
  if (body.activity === 'battle') {
    const targetIds = (body.targetIds ?? []).slice(0, MAX_TARGETS_PER_BATTLE).map(String);
    if (targetIds.length === 0) return json({ error: 'bad_request' }, 400);
    const lockDenial = gateTargets(claims, targetIds);
    if (lockDenial) return json({ error: lockDenial }, 403);

    const entries = idx.targets.filter((t) => targetIds.includes(t.targetId)
      && (t.scope === 'all' || t.scope === claims.level));
    const pool = new Map<string, AdvBattleQuestion[]>();
    for (const e of entries.sort((a, b) => a.targetId.localeCompare(b.targetId))) {
      pool.set(e.targetId, [...(pool.get(e.targetId) ?? []), ...await loadTargetQuestions(bucket, e, attemptSeed, MAX_PAGES_PER_TARGET)]);
    }

    // 偽名 → 実キーの対応をこの候補集合の中でだけ作る（bank全体の索引は作らない）
    const seenP = new Set((body.seenKeys ?? []).slice(0, 800).map(String));
    const wrongP = new Set((body.recentWrongKeys ?? []).slice(0, 300).map(String));
    const seenReal = new Set<string>();
    const wrongReal = new Set<string>();
    for (const qs of pool.values()) {
      for (const q of qs) {
        const p = await pseudo(q.key, secret);
        if (seenP.has(p)) seenReal.add(q.key);
        if (wrongP.has(p)) wrongReal.add(q.key);
      }
    }

    const enc = buildEncounter({
      tier: body.tier ?? 'normal', targetIds, pool,
      seenKeys: seenReal, recentWrongKeys: wrongReal,
      seed: attemptSeed, attemptSeed,
    });
    const questions: SanitizedQuestion[] = [];
    for (let i = 0; i < enc.questions.length; i++) {
      const q = enc.questions[i];
      const entry = entries.find((e) => (pool.get(e.targetId) ?? []).some((x) => x.key === q.key));
      questions.push(await sanitize(q, { kind: entry?.kind ?? 'grammar', scope: entry?.scope ?? 'all', targetId: entry?.targetId ?? targetIds[0] }, claims, attemptSeed + i, i, secret));
    }
    return json({
      activity: 'battle', tier: enc.tier, timed: enc.timed, timeLimitSec: enc.timeLimitSec,
      unseenRatio: enc.unseenRatio, skills: enc.skills, attemptSeed, questions,
    }, 200);
  }

  // ── 読解・聴解（set 単位。situation 等の表示フィールドを保つ） ──
  if (body.activity === 'reading' || body.activity === 'listening') {
    const file = `v2/sets/${body.activity}/${claims.level}.json`;
    const data = await readJson<{ sets: Record<string, unknown>[] }>(bucket, file);
    if (!data) return json({ error: 'content_store_unavailable' }, 503);
    const seenP = new Set((body.seenKeys ?? []).slice(0, 800).map(String));
    const prefix = body.activity === 'reading' ? 'read' : 'listen';
    // 未出優先で count 件（既定3件）を決定的に選ぶ
    const scored: { set: Record<string, unknown>; pk: string; unseen: boolean }[] = [];
    for (const set of data.sets) {
      const pk = await pseudo(`${prefix}:${String(set.setId)}`, secret);
      scored.push({ set, pk, unseen: !seenP.has(pk) });
    }
    let s = (attemptSeed >>> 0) || 1;
    const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
    const shuffled = [...scored].sort(() => next() - 0.5).sort((a, b) => Number(b.unseen) - Number(a.unseen));
    const picked = shuffled.slice(0, Math.min(Math.max(Number(body.count) || 3, 1), 5));

    const items = [];
    for (let i = 0; i < picked.length; i++) {
      const raw = picked[i].set as {
        setId: string; choices: { choiceId: string; textJa: string; isCorrect: boolean }[];
        questionJa: string; questionZh: string; passageJa?: string;
        situationJa?: string; situationZh?: string; contextZh?: string;
        readingType?: string; listeningType?: string; estimatedSeconds?: number;
        durationSeconds?: number; playLimit?: number;
      };
      // set の選択肢を決定的にシャッフルして位置文字を振る
      const q: AdvBattleQuestion = {
        key: `${prefix}:${raw.setId}`, type: raw.readingType ?? raw.listeningType ?? body.activity,
        level: claims.level, skill: body.activity, examSection: body.activity,
        targetJapanese: null, questionJa: raw.questionJa, questionZh: raw.questionZh,
        choices: raw.choices.map((c) => ({ choiceId: c.choiceId, textJa: c.textJa, isCorrect: c.isCorrect })),
        explanation: { meaningJa: '', meaningZh: '', whyCorrectJa: '', whyCorrectZh: '', exampleJa: null, exampleZh: null, sourceItemId: raw.setId, sourceLabel: '' },
        sourceItemId: raw.setId, difficulty: 1, timed: false, variantId: raw.setId,
        reviewState: 'authored', status: 'validated_beta',
      } as AdvBattleQuestion;
      const sq = await sanitize(q, { kind: `${body.activity}-set`, scope: claims.level, targetId: raw.setId }, claims, attemptSeed + i, i, secret);
      const item: Record<string, unknown> = {
        ...sq,
        setId: undefined,
        passageJa: body.activity === 'reading' ? raw.passageJa : undefined,
        situationJa: raw.situationJa, situationZh: raw.situationZh, contextZh: raw.contextZh,
        typeId: raw.readingType ?? raw.listeningType,
        estimatedSeconds: raw.estimatedSeconds,
      };
      if (body.activity === 'listening') {
        item.durationSeconds = raw.durationSeconds;
        item.playLimit = raw.playLimit;
        item.audioToken = await signJson({ u: claims.userId, setId: raw.setId, exp: nowMs + 2 * 3600_000 }, secret);
      }
      items.push(item);
    }
    return json({ activity: body.activity, attemptSeed, questions: items }, 200);
  }

  // ── ミニ模試（構成→sanitize。採点は mock-grade で同じ seed から再構成） ──
  if (body.activity === 'mock') {
    const pools = await buildMockPools(bucket, claims.level, attemptSeed);
    const counts = { vocabCount: 0, grammarCount: 0, readingCount: 0, listeningCount: 0 };
    for (const qs of pools.values()) {
      for (const q of qs) {
        if (q.skill === 'charactersVocabulary') counts.vocabCount += 1;
        else if (q.skill === 'grammar') counts.grammarCount += 1;
        else if (q.skill === 'reading') counts.readingCount += 1;
        else if (q.skill === 'listening') counts.listeningCount += 1;
      }
    }
    const level = claims.level === 'n2' ? 'N2' : 'N3';
    const spec = buildMockSpec(level, counts as MockAvailability);
    const rt = startMockSession(spec, pools, body.mode ?? 'short', attemptSeed, new Date(nowMs).toISOString());
    if (!rt) return json({ error: 'not_enough_content' }, 409);
    const sections = [];
    for (let si = 0; si < rt.sections.length; si++) {
      const sec = rt.sections[si];
      const questions = [];
      for (let qi = 0; qi < sec.questions.length; qi++) {
        const q = sec.questions[qi];
        // **提示順は startMockSession が確定させたものを使う。**
        // ここで別のシャッフルを作ると mock-grade の位置文字と食い違い採点が狂う
        const presented = sec.presented[qi];
        const pk = await pseudo(q.key, secret);
        const payload: AttemptTokenPayload = {
          u: claims.userId, s: claims.sessionId,
          ref: { kind: 'mock', scope: claims.level, targetId: `${attemptSeed}`, qKey: q.key, ord: presented.presentedChoiceOrder },
          pk, iat: nowMs,
        };
        // 聴解問題は音声トークンを添える（音声は公開URLに存在しないため）
        const audioToken = q.skill === 'listening' && q.sourceItemId
          ? await signJson({ u: claims.userId, setId: q.sourceItemId, exp: nowMs + 3 * 3600_000 }, secret)
          : undefined;
        questions.push({
          attemptToken: await signJson(payload, secret),
          key: pk, type: q.type, skill: q.skill, level: q.level,
          targetJapanese: q.targetJapanese,
          questionJa: q.questionJa, questionZh: q.questionZh,
          choices: presented.choices.map((c, i) => ({
            key: CHOICE_LETTERS[i], textJa: c.textJa, ...(c.textZh ? { textZh: c.textZh } : {}),
          })),
          timed: true,
          ...(audioToken ? { audioToken } : {}),
        } as SanitizedQuestion & { audioToken?: string });
      }
      sections.push({
        sectionId: sec.section.sectionId, labelJa: sec.section.labelJa, labelZh: sec.section.labelZh,
        skills: sec.section.skills,
        timeLimitSec: sectionTimeLimit(sec.section, level, body.mode ?? 'short'),
        questions,
      });
    }
    return json({ activity: 'mock', attemptSeed, mode: body.mode ?? 'short', level, sections, mockId: rt.state.mockId }, 200);
  }

  // ── 会話ミッション（レッスン開始時に**現在の1ミッションだけ**本文を返す） ──
  if (body.activity === 'conversation') {
    const missionId = String(body.missionId ?? '');
    if (!/^[a-z0-9]+$/i.test(missionId)) return json({ error: 'bad_request' }, 400);
    // 開放判定は他教材と同じ: セッション発行時に確定した開放集合に入っていること。
    // ミッションIDは週進行から計算されて発行時に署名される（列挙は開放済み週まで）
    const lockDenial = gateTargets(claims, [missionId]);
    if (lockDenial) return json({ error: lockDenial }, 403);
    const mission = await readJson(bucket, `v2/conversation/${missionId}.json`);
    if (!mission) return json({ error: 'not_found' }, 404);
    return json({ activity: 'conversation', mission }, 200);
  }

  // ── 診断（onboarding。12問を seed 選定） ──
  if (body.activity === 'diagnosis') {
    const pools = await readJson<DiagnosisPools>(bucket, 'v2/diagnosis/pools.json');
    if (!pools) return json({ error: 'content_store_unavailable' }, 503);
    const qs = selectDiagnosisQuestions(
      pools, body.targetJlpt ?? null,
      (body.goalType ?? 'exam') as never, attemptSeed,
    );
    const questions = [];
    for (let i = 0; i < qs.length; i++) {
      const dq = qs[i];
      // DiagQuestion は choices が string[]・answerIndex 方式。位置文字へ写像して隠す
      let s = ((attemptSeed + i) >>> 0) || 1;
      const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
      const order = dq.choices.map((_, ci) => ci).sort(() => next() - 0.5);
      const payload: AttemptTokenPayload = {
        u: claims.userId, s: claims.sessionId,
        ref: { kind: 'diagnosis', scope: 'all', targetId: 'diagnosis', qKey: dq.key, ord: order.map(String) },
        pk: await pseudo(dq.key, secret), iat: nowMs,
      };
      questions.push({
        attemptToken: await signJson(payload, secret),
        key: payload.pk, level: dq.level, skill: dq.skill,
        // refId は文法ID等の**構造ID**。route生成（弱点の経由地化）に必要で、教材本文ではない
        refId: dq.refId,
        promptJa: dq.promptJa, promptZh: dq.promptZh,
        choices: order.map((ci, i2) => ({ key: CHOICE_LETTERS[i2], text: dq.choices[ci] })),
      });
    }
    return json({ activity: 'diagnosis', attemptSeed, questions }, 200);
  }

  return json({ error: 'bad_request' }, 400);
};

// ─────────────────────────────────────────────────────────
// 採点（正解・解説はここで初めて返る）
// ─────────────────────────────────────────────────────────

interface GradeBody { sessionToken?: string; attemptToken?: string; choiceKey?: string | null }

/** POST /api/ai-course/activity/grade */
export const handleActivityGrade = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: GradeBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const auth = await authenticate(request, env, body);
  if (auth instanceof Response) return auth;
  const { claims, nowMs } = auth;
  const secret = env.AI_COURSE_CONTENT_TOKEN_SECRET!;
  const bucket = env.AI_COURSE_CONTENT;
  if (!bucket) return json({ error: 'content_store_unavailable' }, 503);

  if (rateLimited('grade', `${claims.userId}:${claims.sessionId}`, nowMs)) {
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '20' });
  }

  const attempt = body.attemptToken ? await verifyJson<AttemptTokenPayload>(body.attemptToken, secret) : null;
  if (!attempt) return json({ error: 'invalid_attempt' }, 403);
  // 他人の attempt token は拒否。session が変わっても user が同じなら許す（reload 復帰）
  if (attempt.u !== claims.userId) return json({ error: 'attempt_not_owned' }, 403);
  // 発行から一定時間で失効（利用枠終了後に温存したtokenで引き続ける経路を狭める）
  if (nowMs - attempt.iat > 3 * 3600_000) return json({ error: 'attempt_expired' }, 403);

  // ── 診断の採点 ──
  if (attempt.ref.kind === 'diagnosis') {
    const pools = await readJson<DiagnosisPools>(bucket, 'v2/diagnosis/pools.json');
    const all: DiagQuestion[] = pools
      ? [...pools.foundationVocab, ...pools.n3Vocab, ...pools.n3Grammar, ...pools.n2Grammar]
      : [];
    const dq = all.find((x) => x.key === attempt.ref.qKey);
    if (!dq) return json({ error: 'not_found' }, 404);
    const letterIdx = CHOICE_LETTERS.indexOf(String(body.choiceKey ?? ''));
    const chosenOriginal = letterIdx >= 0 ? Number(attempt.ref.ord[letterIdx]) : -1;
    const correctLetter = CHOICE_LETTERS[attempt.ref.ord.indexOf(String(dq.answerIndex))];
    return json({
      correct: chosenOriginal === dq.answerIndex,
      correctKey: correctLetter,
      explanationZh: dq.explanationZh,
    }, 200);
  }

  // ── 通常問題の採点: shard から実問題を引き直す ──
  let q: AdvBattleQuestion | null = null;
  if (attempt.ref.kind === 'reading-set' || attempt.ref.kind === 'listening-set') {
    const activity = attempt.ref.kind === 'reading-set' ? 'reading' : 'listening';
    const data = await readJson<{ sets: Record<string, unknown>[] }>(bucket, `v2/sets/${activity}/${attempt.ref.scope}.json`);
    const raw = data?.sets.find((x) => String(x.setId) === attempt.ref.targetId) as {
      setId: string; choices: { choiceId: string; textJa: string; isCorrect: boolean; whyWrongJa?: string; whyWrongZh?: string }[];
      explanationJa: string; explanationZh: string; rationaleSpan?: string; transcriptJa?: string;
    } | undefined;
    if (!raw) return json({ error: 'not_found' }, 404);
    const correctChoice = raw.choices.find((c) => c.isCorrect);
    const letterIdx = CHOICE_LETTERS.indexOf(String(body.choiceKey ?? ''));
    const chosenId = letterIdx >= 0 ? attempt.ref.ord[letterIdx] : null;
    const correctLetter = CHOICE_LETTERS[attempt.ref.ord.indexOf(correctChoice?.choiceId ?? '')];
    return json({
      correct: chosenId !== null && chosenId === correctChoice?.choiceId,
      correctKey: correctLetter,
      explanationJa: raw.explanationJa, explanationZh: raw.explanationZh,
      rationaleSpan: raw.rationaleSpan ?? null,
      transcriptJa: activity === 'listening' ? raw.transcriptJa ?? null : null,
      whyWrong: raw.choices
        .filter((c) => !c.isCorrect)
        .map((c) => ({
          key: CHOICE_LETTERS[attempt.ref.ord.indexOf(c.choiceId)],
          textJa: c.textJa, whyWrongJa: c.whyWrongJa ?? '', whyWrongZh: c.whyWrongZh ?? '',
        })),
    }, 200);
  }

  const idx = await poolIndex(bucket);
  const entry = idx?.targets.find((t) => t.kind === attempt.ref.kind && t.scope === attempt.ref.scope && t.targetId === attempt.ref.targetId);
  if (attempt.ref.kind === 'mock') {
    // mock の attempt は targetId に seed を入れてある。プールを同じ seed で再構成して探す
    const seed = Number(attempt.ref.targetId);
    const pools = await buildMockPools(bucket, claims.level, seed);
    for (const qs of pools.values()) {
      const hit = qs.find((x) => x.key === attempt.ref.qKey);
      if (hit) { q = hit; break; }
    }
  } else if (entry) {
    const qs = await loadTargetQuestions(bucket, entry, 0, entry.pages);
    q = qs.find((x) => x.key === attempt.ref.qKey) ?? null;
  }
  if (!q) return json({ error: 'not_found' }, 404);

  const correctChoice = q.choices.find((c) => c.isCorrect);
  const letterIdx = CHOICE_LETTERS.indexOf(String(body.choiceKey ?? ''));
  const chosenId = letterIdx >= 0 ? attempt.ref.ord[letterIdx] : null;
  const correctLetter = CHOICE_LETTERS[attempt.ref.ord.indexOf(correctChoice?.choiceId ?? '')];

  return json({
    correct: chosenId !== null && chosenId === correctChoice?.choiceId,
    correctKey: correctLetter,
    explanationJa: q.explanation.whyCorrectJa,
    explanationZh: q.explanation.whyCorrectZh,
    meaningZh: q.explanation.meaningZh,
    exampleJa: q.explanation.exampleJa, exampleZh: q.explanation.exampleZh,
    sourceLabel: q.explanation.sourceLabel,
    whyWrong: q.choices
      .filter((c) => !c.isCorrect)
      .map((c) => ({
        key: CHOICE_LETTERS[attempt.ref.ord.indexOf(c.choiceId)],
        textJa: c.textJa,
        whyWrongJa: c.whyWrongJa ?? '', whyWrongZh: c.whyWrongZh ?? '',
      })),
  }, 200);
};

// ─────────────────────────────────────────────────────────
// 文法学習ドキュメント・stage展開・音声
// ─────────────────────────────────────────────────────────

/** POST /api/ai-course/grammar-doc */
export const handleGrammarDoc = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  let body: { sessionToken?: string; grammarId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const auth = await authenticate(request, env, body);
  if (auth instanceof Response) return auth;
  const { claims, nowMs } = auth;
  const bucket = env.AI_COURSE_CONTENT;
  if (!bucket) return json({ error: 'content_store_unavailable' }, 503);
  const entitlementDenial = gateEntitlement(claims, nowMs);
  if (entitlementDenial) return json({ error: entitlementDenial }, 403);
  const grammarId = String(body.grammarId ?? '');
  if (!/^[a-z0-9-]+$/i.test(grammarId)) return json({ error: 'bad_request' }, 400);
  const lockDenial = gateTargets(claims, [grammarId]);
  if (lockDenial) return json({ error: lockDenial }, 403);
  const doc = await readJson(bucket, `v2/grammar-doc/${grammarId}.json`);
  if (!doc) return json({ error: 'not_found' }, 404);
  return json({ doc }, 200);
};

/** POST /api/ai-course/stage-content — stage の骨格（ID・会話テーマ）だけ返す。本文なし */
export const handleStageContent = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  let body: {
    sessionToken?: string;
    targets?: { n3UnitIds?: string[]; n3GrammarIds?: string[]; n2Units?: number[] };
    stageKind?: string;
    masteredIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const auth = await authenticate(request, env, body);
  if (auth instanceof Response) return auth;
  const { claims, nowMs } = auth;
  const bucket = env.AI_COURSE_CONTENT;
  if (!bucket) return json({ error: 'content_store_unavailable' }, 503);
  const entitlementDenial = gateEntitlement(claims, nowMs);
  if (entitlementDenial) return json({ error: entitlementDenial }, 403);

  const meta = await readJson<{
    n3Ids: string[]; n2Ids: string[]; n2ByUnit: Record<string, string[]>;
    missions: Record<string, { targetUse: string; themeJa: string; starterZh?: string }>;
  }>(bucket, 'v2/meta/grammar-structure.json');
  if (!meta) return json({ error: 'content_store_unavailable' }, 503);

  const mastered = new Set((body.masteredIds ?? []).slice(0, 1000).map(String));
  const grammarIds: string[] = [];
  const t = body.targets ?? {};
  if (t.n3GrammarIds && t.n3GrammarIds.length > 0) grammarIds.push(...t.n3GrammarIds.map(String));
  else if (body.stageKind === 'n3_grammar') grammarIds.push(...meta.n3Ids);
  if (t.n2Units) for (const u of t.n2Units) grammarIds.push(...(meta.n2ByUnit[String(u)] ?? []));

  const unitIds = (t.n3UnitIds ?? []).map(String);
  const nextGrammarIds = grammarIds.filter((g) => !mastered.has(g));
  const nextUnitIds = unitIds.filter((u) => !mastered.has(u));
  const conversationTargets = nextGrammarIds.slice(0, 8)
    .filter((g) => meta.missions[g])
    .map((g) => ({
      refId: g,
      expression: meta.missions[g].targetUse,
      themeJa: meta.missions[g].themeJa,
      themeZh: meta.missions[g].starterZh || meta.missions[g].themeJa,
    }));
  // 読解・聴解の出題対象ID（quest生成の配分に使う。IDのみ・本文なし）
  const idx2 = await poolIndex(bucket);
  const readingTargetIds = (idx2?.targets ?? [])
    .filter((x) => x.kind === 'reading' && x.scope === claims.level).map((x) => x.targetId);
  const listeningTargetIds = (idx2?.targets ?? [])
    .filter((x) => x.kind === 'listening' && x.scope === claims.level).map((x) => x.targetId);

  return json({
    battleTargetIds: [...nextUnitIds, ...nextGrammarIds],
    nextGrammarIds, nextUnitIds, conversationTargets,
    readingTargetIds, listeningTargetIds,
  }, 200);
};

/** GET /api/ai-course/audio?t=<token> — 認証済み短命トークンでだけ音声を返す（Range対応） */
export const handleAudio = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  const secret = env.AI_COURSE_CONTENT_TOKEN_SECRET;
  const bucket = env.AI_COURSE_CONTENT;
  if (!secret || !bucket) return json({ error: 'runtime_unconfigured' }, 503);
  const url = new URL(request.url);
  const token = url.searchParams.get('t') ?? '';
  const payload = token ? await verifyJson<{ u: string; setId: string; exp: number }>(token, secret) : null;
  if (!payload) return json({ error: 'unauthenticated' }, 401);
  if (Date.now() > payload.exp) return json({ error: 'audio_token_expired' }, 403);
  if (!/^[a-z0-9-]+$/i.test(payload.setId)) return json({ error: 'bad_request' }, 400);

  const key = `v2/audio/${payload.setId}.m4a`;
  const range = request.headers.get('Range');
  const m = range?.match(/bytes=(\d+)-(\d*)/);
  if (m) {
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : undefined;
    const obj = await bucket.get(key, { range: { offset: start, length: end !== undefined ? end - start + 1 : undefined } });
    if (!obj) return json({ error: 'not_found' }, 404);
    const total = obj.size;
    const endByte = end !== undefined ? Math.min(end, total - 1) : total - 1;
    return new Response(obj.body, {
      status: 206,
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Range': `bytes ${start}-${endByte}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(endByte - start + 1),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }
  const obj = await bucket.get(key);
  if (!obj) return json({ error: 'not_found' }, 404);
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, max-age=3600',
    },
  });
};

// ─────────────────────────────────────────────────────────
// mock 一括採点（section 送信後に正解を開示する）
// ─────────────────────────────────────────────────────────

interface MockGradeBody {
  sessionToken?: string;
  attemptSeed?: number;
  mode?: 'short' | 'fullTime';
  startedAt?: string;
  /** 偽名キー → 位置文字 */
  answers?: Record<string, string>;
  seenKeys?: string[];
  remainingSecBySection?: number[];
}

/** POST /api/ai-course/activity/mock-grade */
export const handleMockGrade = async (request: Request, env: RuntimeEnv): Promise<Response> => {
  let body: MockGradeBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const auth = await authenticate(request, env, body);
  if (auth instanceof Response) return auth;
  const { claims } = auth;
  const secret = env.AI_COURSE_CONTENT_TOKEN_SECRET!;
  const bucket = env.AI_COURSE_CONTENT;
  if (!bucket) return json({ error: 'content_store_unavailable' }, 503);

  const seed = Number(body.attemptSeed);
  if (!Number.isFinite(seed)) return json({ error: 'bad_request' }, 400);
  const pools = await buildMockPools(bucket, claims.level, seed);
  const counts = { vocabCount: 0, grammarCount: 0, readingCount: 0, listeningCount: 0 };
  for (const qs of pools.values()) {
    for (const q of qs) {
      if (q.skill === 'charactersVocabulary') counts.vocabCount += 1;
      else if (q.skill === 'grammar') counts.grammarCount += 1;
      else if (q.skill === 'reading') counts.readingCount += 1;
      else if (q.skill === 'listening') counts.listeningCount += 1;
    }
  }
  const level = claims.level === 'n2' ? 'N2' : 'N3';
  const spec = buildMockSpec(level, counts as MockAvailability);
  const rt = startMockSession(spec, pools, body.mode ?? 'short', seed, body.startedAt ?? new Date().toISOString());
  if (!rt) return json({ error: 'not_found' }, 404);

  // 偽名 → choiceId の答案へ写像し直す
  const answers: Record<string, string> = {};
  const reveal: Record<string, { correctKey: string; correct: boolean; explanationJa: string; explanationZh: string }> = {};
  const provided = body.answers ?? {};
  for (const sec of rt.sections) {
    for (let qi = 0; qi < sec.questions.length; qi++) {
      const q = sec.questions[qi];
      const pk = await pseudo(q.key, secret);
      const presented = sec.presented[qi];
      const letter = provided[pk];
      const letterIdx = CHOICE_LETTERS.indexOf(String(letter ?? ''));
      const chosenId = letterIdx >= 0 ? presented.presentedChoiceOrder[letterIdx] : null;
      if (chosenId) answers[q.key] = chosenId;
      const correctId = q.choices.find((c) => c.isCorrect)?.choiceId ?? '';
      reveal[pk] = {
        correctKey: CHOICE_LETTERS[presented.presentedChoiceOrder.indexOf(correctId)],
        correct: chosenId === correctId,
        explanationJa: q.explanation.whyCorrectJa,
        explanationZh: q.explanation.whyCorrectZh,
      };
    }
  }
  const state = {
    ...rt.state,
    answers,
    remainingSecBySection: body.remainingSecBySection ?? rt.state.remainingSecBySection,
    finishedAt: new Date().toISOString(),
  };
  const seenReal = new Set<string>();
  const seenP = new Set((body.seenKeys ?? []).slice(0, 800));
  for (const sec of rt.sections) {
    for (const q of sec.questions) {
      if (seenP.has(await pseudo(q.key, secret))) seenReal.add(q.key);
    }
  }
  const result = gradeMock({ ...rt, state }, seenReal);
  // result 内の実キー（allQuestionKeys）はバンク構造を晒すため偽名へ置換して返す
  return json({
    result: {
      ...result,
      allQuestionKeys: await Promise.all(result.allQuestionKeys.map((k) => pseudo(k, secret))),
    },
    reveal,
  }, 200);
};
