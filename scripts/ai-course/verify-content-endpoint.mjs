#!/usr/bin/env node
// 教材配信エンドポイントを **実際の HTTP** で確かめる（§6）。
//
// 単体テストは「判断層が正しく判断する」ことしか示さない。
// 「認証を通さずに教材が取れないこと」は、実際にリクエストを投げないと確かめられない。
//
//   npm run build:staging
//   npm run build:ai-course-content
//   node scripts/ai-course/seed-local-r2.mjs
//   npm run dev:worker            # 別ターミナル
//   node scripts/ai-course/verify-content-endpoint.mjs

import { createHmac } from 'node:crypto';

const BASE = process.env.WORKER_URL || 'http://127.0.0.1:8787';
// wrangler.dev.toml と同じ local 専用の偽の鍵
const TOKEN_SECRET = 'local-dev-only-token-secret-do-not-use-in-production';
const JWT_SECRET = 'local-dev-only-jwt-secret-do-not-use-in-production';

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmac = (payload, secret) => b64url(createHmac('sha256', secret).update(payload).digest());

/** Supabase 相当の access token（HS256） */
const makeJwt = (sub, { expired = false } = {}) => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
  const payload = b64url(JSON.stringify({ sub, exp }));
  return `${header}.${payload}.${hmac(`${header}.${payload}`, JWT_SECRET)}`;
};

const makeSession = (claims, secret = TOKEN_SECRET) => {
  const payload = JSON.stringify(claims);
  return `${b64url(payload)}.${hmac(payload, secret)}`;
};

const HOUR = 3600_000;
const now = Date.now();

/** 開始済み・有効な60分パス */
const activeTrial = {
  id: 'trial-1', learnerId: 'user-a', purchaseId: 'p1', planId: 'trial60', planVersion: 1,
  purchasedAtMs: now - HOUR, startDeadlineMs: now + 6 * 24 * HOUR,
  includedActiveSeconds: 3600,
  activation: { activatedAtMs: now - 10 * 60_000, expiresAtMs: now + 23 * HOUR },
};

const baseClaims = {
  userId: 'user-a', sessionId: 'sess-1', stageId: 'area01-minato', stageState: 'current',
  kind: 'reading', level: 'n3', targetId: 'read-n3-shortPassage',
  trial: activeTrial, hasPeriodAccess: false, consumedActiveSeconds: 600, issuedAtMs: now,
};

const post = async (body, { auth, headers = {} } = {}) => {
  const res = await fetch(`${BASE}/api/ai-course/content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 本文なし */ }
  return { status: res.status, json };
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const jwtA = makeJwt('user-a');
const jwtB = makeJwt('user-b');

console.log(`\n教材配信エンドポイントの実HTTP検証（${BASE}）\n`);

// ── 認証 ──
{
  const r = await post({ sessionToken: makeSession(baseClaims), stepIndex: 0 });
  check('未認証は 401', r.status === 401, `status=${r.status} body=${JSON.stringify(r.json)}`);
}
{
  const r = await post({ sessionToken: makeSession(baseClaims), stepIndex: 0 }, { auth: makeJwt('user-a', { expired: true }) });
  check('期限切れJWTは 401', r.status === 401, `status=${r.status}`);
}
{
  const bad = makeJwt('user-a').slice(0, -3) + 'xxx';
  const r = await post({ sessionToken: makeSession(baseClaims), stepIndex: 0 }, { auth: bad });
  check('署名改ざんJWTは 401', r.status === 401, `status=${r.status}`);
}

// ── セッショントークン ──
{
  const r = await post({ sessionToken: makeSession(baseClaims, 'wrong-secret'), stepIndex: 0 }, { auth: jwtA });
  check('改ざんセッションtokenは 403', r.status === 403 && r.json?.error === 'invalid_session', `status=${r.status} error=${r.json?.error}`);
}
{
  // user-a の token を user-b が持ち込む
  const r = await post({ sessionToken: makeSession(baseClaims), stepIndex: 0 }, { auth: jwtB });
  check('他人のセッションtokenは 403', r.status === 403 && r.json?.error === 'session_not_owned', `status=${r.status} error=${r.json?.error}`);
}

// ── 利用権 ──
{
  const claims = { ...baseClaims, trial: null, hasPeriodAccess: false };
  const r = await post({ sessionToken: makeSession(claims), stepIndex: 0 }, { auth: jwtA });
  check('利用権なしは 403 no_entitlement', r.status === 403 && r.json?.error === 'no_entitlement', `status=${r.status} error=${r.json?.error}`);
}
{
  const claims = { ...baseClaims, trial: { ...activeTrial, activation: null } };
  const r = await post({ sessionToken: makeSession(claims), stepIndex: 0 }, { auth: jwtA });
  check('未開始は 403 trial_not_started', r.status === 403 && r.json?.error === 'trial_not_started', `status=${r.status} error=${r.json?.error}`);
}
{
  // 開始から24時間以上。**token は有効なまま**。サーバー時刻で期限を再計算できているか
  const expired = {
    ...activeTrial,
    activation: { activatedAtMs: now - 25 * HOUR, expiresAtMs: now - HOUR },
  };
  const r = await post({ sessionToken: makeSession({ ...baseClaims, trial: expired }), stepIndex: 0 }, { auth: jwtA });
  check('期限切れは 403 trial_expired', r.status === 403 && r.json?.error === 'trial_expired', `status=${r.status} error=${r.json?.error}`);
}
{
  const claims = { ...baseClaims, consumedActiveSeconds: 3600 };
  const r = await post({ sessionToken: makeSession(claims), stepIndex: 0 }, { auth: jwtA });
  check('使い切りは 403 trial_consumed', r.status === 403 && r.json?.error === 'trial_consumed', `status=${r.status} error=${r.json?.error}`);
}

// ── ステージ・範囲 ──
{
  const claims = { ...baseClaims, stageState: 'locked' };
  const r = await post({ sessionToken: makeSession(claims), stepIndex: 0 }, { auth: jwtA });
  check('鍵付きステージは 403 stage_locked', r.status === 403 && r.json?.error === 'stage_locked', `status=${r.status} error=${r.json?.error}`);
}
{
  const r = await post({ sessionToken: makeSession(baseClaims), stepIndex: 999 }, { auth: jwtA });
  check('範囲外stepは 403 step_out_of_range', r.status === 403 && r.json?.error === 'step_out_of_range', `status=${r.status} error=${r.json?.error}`);
}

// ── 管理者QAの経路を学習者が使えない ──
{
  const r = await fetch(`${BASE}/api/ai-course/dev-session-token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(baseClaims),
  });
  // local では有効。**本番では 404 になる**ことを別途 env で担保する
  check('dev token 発行口は local でのみ開く（local=200）', r.status === 200, `status=${r.status}`);
}

// ── 正常系 ──
let sample = null;
{
  const r = await post({ sessionToken: makeSession(baseClaims), stepIndex: 0, count: 5 }, { auth: jwtA });
  const items = r.json?.items ?? [];
  sample = items[0] ?? null;
  check('現在stepは 200 で 5件以内', r.status === 200 && items.length > 0 && items.length <= 5,
    `status=${r.status} items=${items.length}`);
}
{
  const r = await post({ sessionToken: makeSession(baseClaims), stepIndex: 0, count: 999 }, { auth: jwtA });
  check('count を大きくしても 5件を超えない', (r.json?.items ?? []).length <= 5, `items=${(r.json?.items ?? []).length}`);
}
if (sample) {
  const fields = Object.keys(sample);
  const forbidden = ['id', 'bankIndex', 'sourceFile', 'internalNotes', 'sourceItemId', 'sourceLabel', 'variantId', 'reviewState'];
  const leaked = forbidden.filter((f) => f in sample);
  check('内部ID・出典・監査欄を返さない', leaked.length === 0, `fields=[${fields.join(', ')}]${leaked.length ? ` leaked=[${leaked}]` : ''}`);

  const choiceIdOk = /^c\d+$/.test(String(sample.correctChoiceId));
  check('correctChoiceId が位置ID（内部語IDでない）', choiceIdOk, `correctChoiceId=${sample.correctChoiceId}`);

  const choicesAreStrings = Array.isArray(sample.choices) && sample.choices.every((c) => typeof c === 'string');
  check('選択肢が文字列（オブジェクトの内部IDが出ない）', choicesAreStrings, `choices=${JSON.stringify(sample.choices)?.slice(0, 80)}`);
}

// ── 正常な60分学習が止まらないこと ──
{
  const claims = { ...baseClaims, kind: 'vocab', level: 'n3', targetId: 'vocab-n5', sessionId: 'sess-study' };
  const token = makeSession(claims);
  let ok = 0; let blocked = 0; let firstBlock = null;
  // 60分で40step（1問あたり18秒相当）。実際の学習より速いペース
  for (let step = 0; step < 40; step++) {
    const r = await post({ sessionToken: token, stepIndex: step, count: 5 }, { auth: jwtA });
    if (r.status === 200) ok += 1;
    else { blocked += 1; firstBlock ??= `step=${step} status=${r.status} error=${r.json?.error}`; }
  }
  check('60分ぶんの連続学習が止まらない', blocked === 0, `成功=${ok} 拒否=${blocked}${firstBlock ? ` 最初の拒否: ${firstBlock}` : ''}`);
}

// ── 異常な高速列挙が止まること ──
{
  const claims = { ...baseClaims, kind: 'vocab', level: 'n3', targetId: 'vocab-n5', sessionId: 'sess-scrape' };
  const token = makeSession(claims);
  const codes = [];
  for (let i = 0; i < 60; i++) {
    const r = await post({ sessionToken: token, stepIndex: i % 40, count: 5 }, { auth: jwtA });
    codes.push(r.status);
  }
  const limited = codes.filter((c) => c === 429).length;
  check('高速列挙は 429 で制限される', limited > 0, `429=${limited}/60`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n  ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log(`  ❌ 失敗: ${failed.map((f) => f.name).join(' / ')}`);
  process.exit(1);
}
console.log('  すべて PASS\n');
