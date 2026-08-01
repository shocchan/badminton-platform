#!/usr/bin/env node
// 先生別 realtime 音声の**実走** smoke（FINAL CLOSEOUT §6）。
//
// 「机上で通ったから COMPLETE」にしないための道具。実際に
//   Edge Function → ephemeral client secret → OpenAI Realtime API（WebSocket）
// までつなぎ、**サーバーが適用した voice** と **実際に返ってきた音声バイト** を確認する。
//
// 確認する4点:
//   1. teacherId 未指定（＝旧クライアント相当）→ marin（後方互換）
//   2. teacherId=shoko → marin ／ teacherId=yuto → cedar
//   3. 不正な teacherId → 既定へ倒れる（任意 voice の注入ができない）
//   4. 先生を変えると **別の session** が作られ、effective voice が変わる
//
// 前提: fixture セッション JSON（stage-verify-session.mjs --create の出力）
//
// 実行:
//   node scripts/ai-course/verify-teacher-voice.mjs --fixture <path.json>
//
// 出力: docs/ai-course/adventure-v2/generated/teacher-voice-smoke.json
// **secret（JWT・client secret・APIキー）は一切書き出さない。** 識別子はsha256の先頭12桁のみ。

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'docs/ai-course/adventure-v2/generated/teacher-voice-smoke.json');

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const API = envVal('VITE_SUPABASE_URL').replace(/\/$/, '');
const ANON = envVal('VITE_SUPABASE_ANON_KEY');

/** Edge Function の allowlist と同じ対応表（ズレは vitest が検出する） */
const TEACHER_VOICE = { shoko: 'marin', yuto: 'cedar' };

const digest = (s) => (s ? createHash('sha256').update(String(s)).digest('hex').slice(0, 12) : null);
const fixtureIdx = process.argv.indexOf('--fixture');
const fixturePath = fixtureIdx >= 0 ? process.argv[fixtureIdx + 1] : null;

const report = {
  generatedAt: new Date().toISOString(),
  mapping: TEACHER_VOICE,
  cases: [],
  verdict: 'BLOCKED',
  blockedReason: null,
  note: 'このファイルが verdict=PASS になるまで advTeacher.ts の voiceSwitchAvailable を true にしない。',
};

const finish = (code = 0) => {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log('verdict:', report.verdict);
  console.log('evidence:', OUT);
  process.exit(code);
};

if (!fixturePath || !existsSync(fixturePath)) {
  report.blockedReason = 'fixture が無い。node scripts/ai-course/stage-verify-session.mjs --create --out <path> を先に実行する。';
  console.log('BLOCKED:', report.blockedReason);
  finish(0);
}

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const JWT = fixture.session?.access_token;
if (!JWT) { report.blockedReason = 'fixture に access_token が無い'; finish(0); }

/** ai_start_session RPC でセッションを1件予約する（直接 insert は RLS で禁止） */
const reserveSession = async (label) => {
  const r = await fetch(`${API}/rest/v1/rpc/ai_start_session`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_mission_id: `voice-smoke-${label}`,
      p_lesson_kind: 'new',
      p_mode: 'voice',
      p_difficulty: 3,
      p_target_expression: '〜たことがあります',
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body?.ok) return { ok: false, code: body?.code ?? `http_${r.status}` };
  return { ok: true, sessionId: body.sessionId };
};

/** セッションを閉じる（使い回し防止・次の予約を通すため） */
const closeSession = async (sessionId) => {
  await fetch(`${API}/rest/v1/ai_learning_sessions?id=eq.${sessionId}`, {
    method: 'PATCH',
    headers: {
      apikey: ANON, Authorization: `Bearer ${JWT}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ completion_status: 'interrupted', ended_at: new Date().toISOString() }),
  }).catch(() => {});
};

const PLAN = {
  themeLabel: '音声確認',
  estimatedLevel: 'N3',
  zhSupport: 'whenStuck',
  correction: 'summary',
  target: {
    label: '「〜たことがあります」',
    example: '日本の大会に出たことがあります。',
    zhMeaning: '曾经…过',
    zhExample: '我参加过日本的比赛。',
  },
};

/** Edge Function から ephemeral client secret を取る */
const mintSecret = async ({ sessionId, teacherId, sendTeacherId }) => {
  const body = { sessionId, plan: PLAN };
  if (sendTeacherId) body.teacherId = teacherId;
  const t0 = Date.now();
  const r = await fetch(`${API}/functions/v1/ai-lesson-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JWT}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return {
    httpStatus: r.status,
    ok: r.ok,
    effectiveTeacherId: j.teacherId ?? null,
    reportedVoice: j.voice ?? null,
    model: j.model ?? null,
    clientSecret: j.clientSecret ?? null,   // レポートには出さない
    secretRef: digest(j.clientSecret),
    error: r.ok ? null : (j.error ?? `http_${r.status}`),
    latencyMs: Date.now() - t0,
  };
};

/**
 * ephemeral secret で OpenAI Realtime へ WebSocket 接続し、
 * **実際に適用された voice** と **日本語音声のバイト** を確認する。
 */
const realtimeRoundTrip = (clientSecret, model) => new Promise((done) => {
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${clientSecret}` } });
  const out = {
    connected: false, sessionVoice: null, audioBytes: 0,
    transcript: '', errors: [], responseDone: false,
  };
  const timer = setTimeout(() => { try { ws.close(); } catch { /* noop */ } }, 45_000);
  const bye = () => { clearTimeout(timer); try { ws.close(); } catch { /* noop */ } done(out); };

  ws.addEventListener('open', () => { out.connected = true; });
  ws.addEventListener('error', (e) => {
    out.errors.push(String(e?.message ?? 'ws_error').slice(0, 120));
  });
  ws.addEventListener('close', () => done(out));
  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
    switch (m.type) {
      case 'session.created':
      case 'session.updated':
        // ここが「サーバーが実際に使う音声」の一次情報
        out.sessionVoice = m.session?.audio?.output?.voice ?? m.session?.voice ?? out.sessionVoice;
        if (m.type === 'session.created') {
          ws.send(JSON.stringify({
            type: 'response.create',
            response: {
              instructions: '「こんにちは。今日もよろしくお願いします。」とだけ、ゆっくり日本語で言ってください。',
            },
          }));
        }
        break;
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        out.audioBytes += Buffer.from(m.delta ?? '', 'base64').length;
        break;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        out.transcript = m.transcript ?? '';
        break;
      case 'response.done':
        out.responseDone = true;
        bye();
        break;
      case 'error':
        out.errors.push(String(m.error?.code ?? m.error?.type ?? 'unknown'));
        if (String(m.error?.message ?? '').match(/voice/i)) {
          out.errors.push(`voice_rejected: ${String(m.error.message).slice(0, 140)}`);
        }
        bye();
        break;
      default:
        break;
    }
  });
});

const HAS_JA = (s) => /[ぁ-んァ-ヶ一-龥]/.test(s);

const runCase = async ({ label, teacherId, sendTeacherId, expectVoice, withAudio }) => {
  const res = await reserveSession(label);
  if (!res.ok) return { label, ok: false, error: `reserve_failed:${res.code}` };
  const mint = await mintSecret({ sessionId: res.sessionId, teacherId, sendTeacherId });
  const row = {
    label,
    requestedTeacherId: sendTeacherId ? teacherId : '(送っていない＝旧クライアント相当)',
    expectedVoice: expectVoice,
    effectiveTeacherId: mint.effectiveTeacherId,
    reportedVoice: mint.reportedVoice,
    model: mint.model,
    httpStatus: mint.httpStatus,
    secretRef: mint.secretRef,
    latencyMs: mint.latencyMs,
    error: mint.error,
  };
  if (!mint.ok || !mint.clientSecret) {
    await closeSession(res.sessionId);
    return { ...row, ok: false };
  }
  if (withAudio) {
    const rt = await realtimeRoundTrip(mint.clientSecret, mint.model);
    row.realtime = {
      connected: rt.connected,
      sessionVoice: rt.sessionVoice,
      audioBytes: rt.audioBytes,
      transcriptHasJapanese: HAS_JA(rt.transcript),
      transcriptLength: rt.transcript.length,
      responseDone: rt.responseDone,
      errors: rt.errors,
    };
    row.ok = mint.reportedVoice === expectVoice
      && rt.sessionVoice === expectVoice
      && rt.audioBytes > 0
      && HAS_JA(rt.transcript);
  } else {
    row.ok = mint.reportedVoice === expectVoice;
  }
  await closeSession(res.sessionId);
  return row;
};

const main = async () => {
  if (typeof WebSocket === 'undefined') {
    report.blockedReason = 'この Node に WebSocket が無い（Node 22+ が必要）';
    finish(0);
  }

  const cases = [
    // 旧クライアント互換: teacherId を送らない → 従来どおり marin
    { label: 'legacy-no-teacherId', teacherId: null, sendTeacherId: false, expectVoice: 'marin', withAudio: true },
    { label: 'shoko', teacherId: 'shoko', sendTeacherId: true, expectVoice: 'marin', withAudio: true },
    { label: 'yuto', teacherId: 'yuto', sendTeacherId: true, expectVoice: 'cedar', withAudio: true },
    // 任意 voice の注入ができないこと（不正値は既定へ）
    { label: 'invalid-teacherId', teacherId: '../../etc/passwd', sendTeacherId: true, expectVoice: 'marin', withAudio: false },
    { label: 'voice-string-as-teacherId', teacherId: 'alloy', sendTeacherId: true, expectVoice: 'marin', withAudio: false },
  ];

  for (const c of cases) {
    const row = await runCase(c);
    report.cases.push(row);
    console.log(
      `${row.label}: voice=${row.reportedVoice ?? '-'} `
      + `session=${row.realtime?.sessionVoice ?? '-'} audio=${row.realtime?.audioBytes ?? '-'}B ok=${row.ok}`
      + (row.error ? ` error=${row.error}` : ''),
    );
  }

  const byLabel = Object.fromEntries(report.cases.map((c) => [c.label, c]));
  const shoko = byLabel.shoko;
  const yuto = byLabel.yuto;

  report.checks = {
    legacyClientStillMarin: byLabel['legacy-no-teacherId']?.ok === true,
    shokoIsMarin: shoko?.ok === true,
    yutoIsCedar: yuto?.ok === true,
    // 先生を変えると別 session が作られている（client secret が別物）
    newSessionOnTeacherChange: Boolean(shoko?.secretRef && yuto?.secretRef && shoko.secretRef !== yuto.secretRef),
    effectiveVoiceDiffers: Boolean(
      shoko?.realtime?.sessionVoice && yuto?.realtime?.sessionVoice
      && shoko.realtime.sessionVoice !== yuto.realtime.sessionVoice,
    ),
    arbitraryVoiceRejected: byLabel['invalid-teacherId']?.ok === true
      && byLabel['voice-string-as-teacherId']?.ok === true,
    japaneseAudioProduced: Boolean(shoko?.realtime?.audioBytes > 0 && yuto?.realtime?.audioBytes > 0),
  };

  report.verdict = Object.values(report.checks).every(Boolean) ? 'PASS' : 'FAIL';
  if (report.verdict === 'FAIL') {
    report.blockedReason = Object.entries(report.checks)
      .filter(([, v]) => !v).map(([k]) => k).join(', ');
  }
  console.log('checks:', JSON.stringify(report.checks));
  finish(0);
};

main().catch((e) => {
  report.blockedReason = e instanceof Error ? e.message.slice(0, 200) : 'unknown';
  console.error('verify-teacher-voice failed:', report.blockedReason);
  finish(1);
});
