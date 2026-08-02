#!/usr/bin/env node
// 教材配信・採点・音声を **実際の HTTP** で確かめる（v2）。
//
// v2 で確かめること（CEO判断 2026-08-02）:
//   - 問題payloadに正解・解説が入っていない（事前送信の廃止）
//   - 採点はserver-sideで、回答後にだけ正解・解説が返る
//   - 音声は短命トークン無しでは取得できない
//   - 正解位置が偏っていない（配信時シャッフルの実測）
//
//   npm run build:staging && npm run build:ai-course-content
//   npm run dev:worker            # 別ターミナル
//   node scripts/ai-course/seed-local-r2.mjs
//   node scripts/ai-course/verify-content-endpoint.mjs

import { createHmac } from 'node:crypto';

const BASE = process.env.WORKER_URL || 'http://127.0.0.1:8787';
// wrangler.dev.toml と同じ local 専用の偽の鍵
const TOKEN_SECRET = 'local-dev-only-token-secret-do-not-use-in-production';
const JWT_SECRET = 'local-dev-only-jwt-secret-do-not-use-in-production';

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmac = (payload, secret) => b64url(createHmac('sha256', secret).update(payload).digest());

const makeJwt = (sub, { expired = false } = {}) => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
  const payload = b64url(JSON.stringify({ sub, exp }));
  return `${header}.${payload}.${hmac(`${header}.${payload}`, JWT_SECRET)}`;
};

const HOUR = 3600_000;
const now = Date.now();

const activeTrial = {
  id: 'trial-1', learnerId: 'user-a', purchaseId: 'p1', planId: 'trial60', planVersion: 1,
  purchasedAtMs: now - HOUR, startDeadlineMs: now + 6 * 24 * HOUR,
  includedActiveSeconds: 3600,
  activation: { activatedAtMs: now - 10 * 60_000, expiresAtMs: now + 23 * HOUR },
};

const jwtA = makeJwt('user-a');
const jwtB = makeJwt('user-b');

const api = async (path, body, { auth, method = 'POST', raw = false } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  let json = null;
  try { json = await res.json(); } catch { /* 本文なし */ }
  return { status: res.status, json };
};

/** セッション発行（client-asserted モード＝local専用） */
const issueSession = async (auth, overrides = {}) => {
  const r = await api('/api/ai-course/session/issue', {
    level: 'n3', trial: activeTrial, hasPeriodAccess: false,
    consumedActiveSeconds: 600, allowedTargetIds: '*', sessionId: `sess-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  }, { auth });
  return r.json?.sessionToken ?? null;
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log(`\n教材配信・採点・音声の実HTTP検証 v2（${BASE}）\n`);

const sessionA = await issueSession(jwtA);
if (!sessionA) {
  console.error('セッション発行に失敗しました。dev:worker と seed を確認してください。');
  process.exit(2);
}

// ═══ A. 認証・セッション ═══
{
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: sessionA });
  check('未認証は 401', r.status === 401, `status=${r.status}`);
}
{
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: sessionA }, { auth: makeJwt('user-a', { expired: true }) });
  check('期限切れJWTは 401', r.status === 401, `status=${r.status}`);
}
{
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: `${sessionA}x` }, { auth: jwtA });
  check('改ざんセッションは 403', r.status === 403 && r.json?.error === 'invalid_session', `status=${r.status} error=${r.json?.error}`);
}
{
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: sessionA }, { auth: jwtB });
  check('他人のセッションは 403', r.status === 403 && r.json?.error === 'session_not_owned', `error=${r.json?.error}`);
}

// ═══ B. 利用権（サーバー時刻で再判定） ═══
{
  const s = await issueSession(jwtA, { trial: null });
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: s }, { auth: jwtA });
  check('利用権なしは 403 no_entitlement', r.status === 403 && r.json?.error === 'no_entitlement', `error=${r.json?.error}`);
}
{
  const s = await issueSession(jwtA, { trial: { ...activeTrial, activation: null } });
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: s }, { auth: jwtA });
  check('未開始は 403 trial_not_started', r.status === 403 && r.json?.error === 'trial_not_started', `error=${r.json?.error}`);
}
{
  const s = await issueSession(jwtA, { trial: { ...activeTrial, activation: { activatedAtMs: now - 25 * HOUR, expiresAtMs: now - HOUR } } });
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: s }, { auth: jwtA });
  check('24時間経過は 403 trial_expired（tokenは有効なまま）', r.status === 403 && r.json?.error === 'trial_expired', `error=${r.json?.error}`);
}
{
  const s = await issueSession(jwtA, { consumedActiveSeconds: 3600 });
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: s }, { auth: jwtA });
  check('60分使い切りは 403 trial_consumed', r.status === 403 && r.json?.error === 'trial_consumed', `error=${r.json?.error}`);
}

// ═══ C. 鍵付きステージ ═══
{
  const s = await issueSession(jwtA, { allowedTargetIds: ['n3u-01-self'] });
  const r = await api('/api/ai-course/activity/start', {
    activity: 'battle', tier: 'normal', targetIds: ['n3u-05-adjpair'], sessionToken: s,
  }, { auth: jwtA });
  check('開放外targetのバトルは 403 stage_locked', r.status === 403 && r.json?.error === 'stage_locked', `error=${r.json?.error}`);
}
{
  const s = await issueSession(jwtA, { allowedTargetIds: ['n3u-01-self'] });
  const r = await api('/api/ai-course/grammar-doc', { grammarId: 'n3g-002', sessionToken: s }, { auth: jwtA });
  check('開放外の文法docも 403 stage_locked', r.status === 403 && r.json?.error === 'stage_locked', `error=${r.json?.error}`);
}

// ═══ D. 問題payloadに正解・解説が無い（P0-C 核心） ═══
const FORBIDDEN_FIELDS = [
  'isCorrect', 'correctChoiceId', 'answerIndex', 'whyWrong', 'whyWrongJa', 'whyWrongZh',
  'explanation', 'explanationJa', 'explanationZh', 'rationaleSpan', 'transcriptJa',
  'sourceItemId', 'variantId', 'choiceId', 'exampleJa',
];
const leakScan = (obj) => {
  const found = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (FORBIDDEN_FIELDS.includes(k)) found.add(k);
        walk(val);
      }
    }
  };
  walk(obj);
  return [...found];
};

let battleQuestions = null;
{
  const r = await api('/api/ai-course/activity/start', {
    activity: 'battle', tier: 'normal', targetIds: ['n3u-01-self'], sessionToken: sessionA,
    seenKeys: [], recentWrongKeys: [],
  }, { auth: jwtA });
  battleQuestions = r.json?.questions ?? [];
  const leaks = leakScan(r.json);
  check('バトル問題payloadに正解・解説フィールドなし', r.status === 200 && battleQuestions.length > 0 && leaks.length === 0,
    `status=${r.status} 問題=${battleQuestions.length} 漏れ=[${leaks.join(',')}]`);
}
let readingQuestions = null;
{
  const r = await api('/api/ai-course/activity/start', { activity: 'reading', sessionToken: sessionA }, { auth: jwtA });
  readingQuestions = r.json?.questions ?? [];
  const leaks = leakScan(r.json);
  const hasPassage = readingQuestions.every((q) => typeof q.passageJa === 'string' && q.passageJa.length > 0);
  check('読解payloadは本文あり・正解/根拠/解説なし', r.status === 200 && readingQuestions.length > 0 && leaks.length === 0 && hasPassage,
    `問題=${readingQuestions.length} 漏れ=[${leaks.join(',')}]`);
}
let listeningQuestions = null;
{
  const r = await api('/api/ai-course/activity/start', { activity: 'listening', sessionToken: sessionA }, { auth: jwtA });
  listeningQuestions = r.json?.questions ?? [];
  const leaks = leakScan(r.json);
  const hasAudioToken = listeningQuestions.every((q) => typeof q.audioToken === 'string');
  check('聴解payloadはtranscript・正解なし＋audioTokenあり', r.status === 200 && listeningQuestions.length > 0 && leaks.length === 0 && hasAudioToken,
    `問題=${listeningQuestions.length} 漏れ=[${leaks.join(',')}]`);
}
let mockData = null;
{
  const r = await api('/api/ai-course/activity/start', { activity: 'mock', mode: 'short', sessionToken: sessionA, attemptSeed: 424242 }, { auth: jwtA });
  mockData = r.json;
  const leaks = leakScan(r.json);
  const qCount = (r.json?.sections ?? []).reduce((n, s) => n + s.questions.length, 0);
  check('模試payloadに正解なし', r.status === 200 && qCount > 0 && leaks.length === 0,
    `sections=${r.json?.sections?.length} 問題=${qCount} 漏れ=[${leaks.join(',')}]`);
}
{
  const r = await api('/api/ai-course/activity/start', { activity: 'diagnosis', targetJlpt: 'N3', goalType: 'exam', sessionToken: sessionA }, { auth: jwtA });
  const leaks = leakScan(r.json);
  const qs = r.json?.questions ?? [];
  check('診断payloadに answerIndex なし', r.status === 200 && qs.length === 12 && leaks.length === 0,
    `問題=${qs.length} 漏れ=[${leaks.join(',')}]`);
}

// ═══ E. サーバー採点 ═══
{
  const q = battleQuestions[0];
  // 全選択肢を試して「正解はちょうど1つ」をサーバー採点で確認する
  const verdicts = [];
  for (const c of q.choices) {
    const r = await api('/api/ai-course/activity/grade', { sessionToken: sessionA, attemptToken: q.attemptToken, choiceKey: c.key }, { auth: jwtA });
    verdicts.push({ key: c.key, status: r.status, correct: r.json?.correct, correctKey: r.json?.correctKey, hasExplanation: Boolean(r.json?.explanationJa || r.json?.explanationZh) });
  }
  const correctCount = verdicts.filter((v) => v.correct === true).length;
  const allRevealSame = new Set(verdicts.map((v) => v.correctKey)).size === 1;
  check('採点は200で正解がちょうど1つ・解説つき', verdicts.every((v) => v.status === 200 && v.hasExplanation) && correctCount === 1 && allRevealSame,
    `correct=${correctCount}/${verdicts.length} correctKey=${verdicts[0]?.correctKey}`);
}
{
  const q = readingQuestions[0];
  const r = await api('/api/ai-course/activity/grade', { sessionToken: sessionA, attemptToken: q.attemptToken, choiceKey: 'a' }, { auth: jwtA });
  check('読解採点は根拠・解説・whyWrongを返す', r.status === 200 && typeof r.json?.rationaleSpan === 'string' && Array.isArray(r.json?.whyWrong),
    `rationale=${Boolean(r.json?.rationaleSpan)} whyWrong=${r.json?.whyWrong?.length}`);
}
{
  const q = listeningQuestions[0];
  const r = await api('/api/ai-course/activity/grade', { sessionToken: sessionA, attemptToken: q.attemptToken, choiceKey: 'b' }, { auth: jwtA });
  check('聴解採点は回答後にtranscriptを返す', r.status === 200 && typeof r.json?.transcriptJa === 'string' && r.json.transcriptJa.length > 0,
    `transcript=${r.json?.transcriptJa?.length}文字`);
}
{
  const q = battleQuestions[1] ?? battleQuestions[0];
  const r1 = await api('/api/ai-course/activity/grade', { sessionToken: sessionA, attemptToken: q.attemptToken, choiceKey: 'a' }, { auth: jwtA });
  const r2 = await api('/api/ai-course/activity/grade', { sessionToken: sessionA, attemptToken: q.attemptToken, choiceKey: 'a' }, { auth: jwtA });
  check('同一attemptの再送はべき等（同じ結果）', r1.status === 200 && r2.status === 200 && r1.json?.correct === r2.json?.correct && r1.json?.correctKey === r2.json?.correctKey);
}
{
  const q = battleQuestions[0];
  const sessionB = await issueSession(jwtB);
  const r = await api('/api/ai-course/activity/grade', { sessionToken: sessionB, attemptToken: q.attemptToken, choiceKey: 'a' }, { auth: jwtB });
  check('別userのattempt利用は 403', r.status === 403 && r.json?.error === 'attempt_not_owned', `error=${r.json?.error}`);
}
{
  const q = battleQuestions[0];
  const r = await api('/api/ai-course/activity/grade', { sessionToken: sessionA, attemptToken: `${q.attemptToken}x`, choiceKey: 'a' }, { auth: jwtA });
  check('改ざんattemptは 403', r.status === 403 && r.json?.error === 'invalid_attempt', `error=${r.json?.error}`);
}

// ═══ E2. 会話ミッション（P0: 会話教材のserver配信） ═══
{
  const s = await issueSession(jwtA, { allowedTargetIds: ['w01m1'] });
  const r = await api('/api/ai-course/activity/start', { activity: 'conversation', missionId: 'w01m1', sessionToken: s }, { auth: jwtA });
  const m = r.json?.mission;
  const hasBody = Boolean(m?.openingQuestion && m?.hintLevels?.length > 0 && m?.naturalExample);
  check('開放済み会話missionは本文つきで取得できる', r.status === 200 && hasBody,
    `status=${r.status} opening=${Boolean(m?.openingQuestion)} hints=${m?.hintLevels?.length}`);
}
{
  const s = await issueSession(jwtA, { allowedTargetIds: ['w01m1'] });
  const r = await api('/api/ai-course/activity/start', { activity: 'conversation', missionId: 'w05m3', sessionToken: s }, { auth: jwtA });
  check('開放外の会話missionは 403 stage_locked', r.status === 403 && r.json?.error === 'stage_locked', `error=${r.json?.error}`);
}
{
  const s = await issueSession(jwtA, { trial: null, allowedTargetIds: ['w01m1'] });
  const r = await api('/api/ai-course/activity/start', { activity: 'conversation', missionId: 'w01m1', sessionToken: s }, { auth: jwtA });
  check('利用権なしの会話は 403', r.status === 403 && r.json?.error === 'no_entitlement', `error=${r.json?.error}`);
}
{
  const s = await issueSession(jwtA, { consumedActiveSeconds: 3600, allowedTargetIds: ['w01m1'] });
  const r = await api('/api/ai-course/activity/start', { activity: 'conversation', missionId: 'w01m1', sessionToken: s }, { auth: jwtA });
  check('使い切り後の会話は 403', r.status === 403 && r.json?.error === 'trial_consumed', `error=${r.json?.error}`);
}

// ═══ F. 模試の一括採点 ═══
{
  const answers = {};
  for (const sec of mockData?.sections ?? []) {
    for (const q of sec.questions) answers[q.key] = 'a';
  }
  const r = await api('/api/ai-course/activity/mock-grade', {
    sessionToken: sessionA, attemptSeed: 424242, mode: 'short',
    startedAt: new Date().toISOString(), answers, seenKeys: [],
  }, { auth: jwtA });
  const revealCount = Object.keys(r.json?.reveal ?? {}).length;
  const res = r.json?.result;
  const keysArePseudonyms = (res?.allQuestionKeys ?? []).every((k) => /^[A-Za-z0-9_-]{16}$/.test(k));
  check('模試採点は結果＋事後開示を返す（実キーは偽名化）',
    r.status === 200 && typeof res?.totalCorrect === 'number' && res?.totalQuestions > 0 && revealCount > 0 && keysArePseudonyms,
    `correct=${res?.totalCorrect}/${res?.totalQuestions} reveal=${revealCount}問 偽名=${keysArePseudonyms}`);
}

// ═══ G. 音声（P0-B） ═══
{
  const r = await fetch(`${BASE}/audio/ai-course/n3l-task-01.m4a`);
  check('旧公開URLの音声は 404', r.status === 404, `status=${r.status}`);
}
{
  const r = await api('/api/ai-course/audio', undefined, { method: 'GET', raw: true });
  check('トークン無しの音声は 401', r.status === 401, `status=${r.status}`);
}
{
  const q = listeningQuestions[0];
  const r = await fetch(`${BASE}/api/ai-course/audio?t=${encodeURIComponent(q.audioToken)}`);
  const len = Number(r.headers.get('Content-Length') || 0);
  check('正規audioTokenで音声取得 200', r.status === 200 && len > 10000, `status=${r.status} bytes=${len}`);
}
{
  const q = listeningQuestions[0];
  const r = await fetch(`${BASE}/api/ai-course/audio?t=${encodeURIComponent(q.audioToken)}`, { headers: { Range: 'bytes=0-1023' } });
  check('Range要求は 206（seek対応）', r.status === 206 && r.headers.get('Content-Range')?.startsWith('bytes 0-1023/'),
    `status=${r.status} range=${r.headers.get('Content-Range')}`);
}
{
  const q = listeningQuestions[0];
  const r = await fetch(`${BASE}/api/ai-course/audio?t=${encodeURIComponent(q.audioToken)}x`);
  check('改ざんaudioTokenは 401', r.status === 401, `status=${r.status}`);
}

// ═══ H. 正解位置の分布（配信時シャッフルの実測・**選択肢数別**） ═══
//
// 以前 d:0 を「偏りなし」と誤報した反省: unit生成問題は3択で d が正解になり得ない。
// 3択と4択を分けて測り、4択で A〜D のどれかが0なら FAIL とする。
{
  const dist3 = { a: 0, b: 0, c: 0, d: 0 };
  const dist4 = { a: 0, b: 0, c: 0, d: 0 };
  let n3 = 0; let n4 = 0;
  const rounds = [
    // 3択の代表（N3 unit生成問題）
    { targets: ['n3u-01-self', 'n3u-02-daily', 'n3u-03-move'], seeds: 4 },
    // 4択の代表（文法draft変形）
    { targets: ['n3g-bakaridenaku', 'n3g-kotogaaru', 'n3g-mama'], seeds: 8 },
  ];
  for (const round of rounds) {
    for (let i = 0; i < round.seeds; i++) {
      const s = await issueSession(jwtA, { sessionId: `sess-dist-${round.targets[0]}-${i}` });
      const r = await api('/api/ai-course/activity/start', {
        activity: 'battle', tier: 'strong', targetIds: round.targets,
        sessionToken: s, attemptSeed: 1000 + i * 977,
      }, { auth: jwtA });
      for (const q of r.json?.questions ?? []) {
        const g = await api('/api/ai-course/activity/grade', { sessionToken: s, attemptToken: q.attemptToken, choiceKey: null }, { auth: jwtA });
        if (!g.json?.correctKey) continue;
        if (q.choices.length >= 4) { dist4[g.json.correctKey] += 1; n4 += 1; }
        else { dist3[g.json.correctKey] += 1; n3 += 1; }
      }
    }
  }
  const fmt = (d) => Object.entries(d).map(([k, v]) => `${k}:${v}`).join(' ');
  const max4 = Math.max(dist4.a, dist4.b, dist4.c, dist4.d);
  check('4択: A/B/C/D すべて正解位置に出現・偏りなし',
    n4 >= 40 && dist4.a > 0 && dist4.b > 0 && dist4.c > 0 && dist4.d > 0 && max4 / n4 < 0.5,
    `n=${n4} 分布=${fmt(dist4)}`);
  check('3択: A/B/C 出現・D は決して正解にならない',
    n3 >= 20 && dist3.a > 0 && dist3.b > 0 && dist3.c > 0 && dist3.d === 0,
    `n=${n3} 分布=${fmt(dist3)}`);
}

// ═══ I. 通常学習は止まらない・異常列挙は止まる ═══
{
  // 通常学習の1セッション相当（バトル開始12回）。fresh session = 実際の学習セッション単位
  const s = await issueSession(jwtA, { sessionId: 'sess-normal-pace' });
  let blocked = 0;
  for (let step = 0; step < 12; step++) {
    const r = await api('/api/ai-course/activity/start', {
      activity: 'battle', tier: 'normal', targetIds: ['n3u-01-self'], sessionToken: s, attemptSeed: 5000 + step,
    }, { auth: jwtA });
    if (r.status !== 200) blocked += 1;
    await new Promise((res) => setTimeout(res, 150));
  }
  check('60分相当の学習ペースで start が止まらない', blocked === 0, `拒否=${blocked}/12`);
}
{
  const s = await issueSession(jwtA, { sessionId: 'sess-scrape' });
  const codes = [];
  for (let i = 0; i < 40; i++) {
    const r = await api('/api/ai-course/activity/start', {
      activity: 'battle', tier: 'normal', targetIds: ['n3u-01-self'], sessionToken: s, attemptSeed: i,
    }, { auth: jwtA });
    codes.push(r.status);
  }
  const limited = codes.filter((c) => c === 429).length;
  check('高速列挙は 429 で制限', limited > 0, `429=${limited}/40`);
}

// ═══ J. 本番モードの発行拒否 ═══
{
  // client-asserted はlocal専用。フラグの無い本番でこの発行が 503 になることは
  // wrangler.dev.toml を外した構成でしか実測できないため、ここでは flag の存在を明示するに留める
  console.log('  ℹ️ session/issue は AI_COURSE_SESSION_MODE 未設定（本番既定）で 503 になる（code参照）');
}

const failed = results.filter((r) => !r.pass);
console.log(`\n  ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log(`  ❌ 失敗: ${failed.map((f) => f.name).join(' / ')}`);
  process.exit(1);
}
console.log('  すべて PASS\n');
