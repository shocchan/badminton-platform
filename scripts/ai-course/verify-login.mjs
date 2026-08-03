#!/usr/bin/env node
// 生徒ログイン（ログインID＋6文字パスワード）を **実HTTP** で確かめる。
//
//   AI_COURSE_LOGIN_CREDS=/path/to/creds.txt \
//   WORKER_URL=https://ai-course-staging.pages.dev \
//   node scripts/ai-course/verify-login.mjs
//
// 確かめること（PAID STUDENT PILOT §1〜§6）:
//   - 正しいID＋パスワードでログインでき、セッションが返る
//   - 大小・全角・ハイフン混じりでも同じIDとして通る
//   - 間違いは理由を出し分けない（IDの存在を推測させない）
//   - 5回失敗でlock（永久ではない）
//   - 再設定・ID問い合わせは登録の有無で応答が変わらない
//   - 応答にメールアドレスが混ざらない

import { readFileSync } from 'node:fs';

const BASE = process.env.WORKER_URL || 'https://ai-course-staging.pages.dev';
const credsPath = process.env.AI_COURSE_LOGIN_CREDS;
if (!credsPath) {
  console.error('AI_COURSE_LOGIN_CREDS に認証情報ファイルのパスを指定してください');
  process.exit(2);
}
const creds = readFileSync(credsPath, 'utf8');
const loginId = creds.match(/ログインID\s*:\s*(\S+)/)?.[1];
const password = creds.match(/パスワード\s*:\s*(\S+)/)?.[1];
if (!loginId || !password) {
  console.error('認証情報ファイルからIDとパスワードを読めません');
  process.exit(2);
}

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 本文なし */ }
  return { status: res.status, json, raw: JSON.stringify(json ?? {}) };
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log(`\n生徒ログインの実HTTP検証（${BASE}）\n`);

// ── 正常系 ──
let accessToken = null;
{
  const r = await post('/api/ai-course/auth/login', { loginId, password, lang: 'ja' });
  accessToken = r.json?.accessToken ?? null;
  check('正しいID＋パスワードでログインできる',
    r.status === 200 && Boolean(accessToken) && Boolean(r.json?.refreshToken),
    `status=${r.status}`);
  check('応答にメールアドレスが含まれない', !/@/.test(r.raw), r.raw.includes('@') ? '⚠️ @を含む' : '');
}
{
  // 大小・全角・ハイフン無しの揺れを吸収するか（§2の正規化）
  const messy = loginId.toLowerCase().replace('-', '');
  const r = await post('/api/ai-course/auth/login', { loginId: messy, password: password.toLowerCase(), lang: 'ja' });
  check('小文字・ハイフン無しでも同じIDとして通る', r.status === 200, `入力="${messy}" status=${r.status}`);
}
{
  const wide = loginId.replace(/[A-Z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace('-', '－');
  const r = await post('/api/ai-course/auth/login', { loginId: wide, password, lang: 'ja' });
  check('全角入力（日本語IME）でも通る', r.status === 200, `status=${r.status}`);
}

// ── 失敗の出し分けが無いこと（§3） ──
const messages = new Set();
{
  const r = await post('/api/ai-course/auth/login', { loginId, password: 'X9Y8Z7', lang: 'ja' });
  messages.add(r.json?.message ?? '');
  check('パスワード違いは 401', r.status === 401, `status=${r.status}`);
}
{
  const r = await post('/api/ai-course/auth/login', { loginId: 'ZZ-9999', password: 'X9Y8Z7', lang: 'ja' });
  messages.add(r.json?.message ?? '');
  check('存在しないIDも 401', r.status === 401, `status=${r.status}`);
}
check('パスワード違いと未登録IDで**同じ文言**（存在を推測させない）',
  messages.size === 1, `文言の種類=${messages.size}`);
{
  const r = await post('/api/ai-course/auth/login', { loginId, password: '123456', lang: 'ja' });
  check('数字だけのパスワードは 401（形式違反も同じ応答）', r.status === 401, `status=${r.status}`);
}

// ── lock（§6） ──
{
  const victim = 'YY-8888';
  let locked = false;
  let lockedAt = 0;
  for (let i = 1; i <= 8; i++) {
    const r = await post('/api/ai-course/auth/login', { loginId: victim, password: 'A1B2C3', lang: 'ja' });
    if (r.status === 429) { locked = true; lockedAt = i; break; }
  }
  check('連続失敗でlockする（永久ではない）', locked, locked ? `${lockedAt}回目でlock` : 'lockしなかった');
}
{
  // lock されていても、正規の学習者は別IDなので影響を受けない
  const r = await post('/api/ai-course/auth/login', { loginId, password, lang: 'ja' });
  check('他IDのlockに巻き込まれない', r.status === 200, `status=${r.status}`);
}

// ── 再設定・ID問い合わせ（§4・§5） ──
{
  const a = await post('/api/ai-course/auth/reset-request', { email: 'nobody-here@example.com', lang: 'ja' });
  const b = await post('/api/ai-course/auth/reset-request', { email: 'verify-login@ai-course-staging.test', lang: 'ja' });
  check('再設定は登録の有無で応答が変わらない',
    a.status === 200 && b.status === 200 && a.json?.message === b.json?.message,
    `未登録=${a.status} 登録済=${b.status} 同一文言=${a.json?.message === b.json?.message}`);
}
{
  const a = await post('/api/ai-course/auth/recover-id', { email: 'nobody-here@example.com', lang: 'ja' });
  const b = await post('/api/ai-course/auth/recover-id', { email: 'verify-login@ai-course-staging.test', lang: 'ja' });
  check('ID問い合わせも応答が変わらない',
    a.status === 200 && b.status === 200 && a.json?.message === b.json?.message);
  check('ID問い合わせの応答にログインIDが載らない（メール経由のみ）',
    !a.raw.includes(loginId) && !b.raw.includes(loginId));
}

// ── ログイン後のトークンで教材が取れる（認証層と教材層のつながり） ──
if (accessToken) {
  const issue = await fetch(`${BASE}/api/ai-course/session/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      level: 'n3', hasPeriodAccess: true, consumedActiveSeconds: 0, allowedTargetIds: '*',
    }),
  });
  const sessionToken = (await issue.json().catch(() => ({}))).sessionToken;
  const r = await fetch(`${BASE}/api/ai-course/activity/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ activity: 'reading', sessionToken }),
  });
  const body = await r.json().catch(() => ({}));
  check('ログインしたトークンで教材が取得できる',
    r.status === 200 && (body.questions ?? []).length > 0,
    `status=${r.status} 問題数=${(body.questions ?? []).length}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n  ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log(`  ❌ 失敗: ${failed.map((f) => f.name).join(' / ')}`);
  process.exit(1);
}
console.log('  すべて PASS\n');
