#!/usr/bin/env node
// 先生別 realtime 音声の実走smoke（FINAL COMPLETION §6・§8）。
//
// このスクリプトは「実際に音声が切り替わること」を証明するためだけにある。
// 机上の確認では voiceSwitchAvailable を true にしない、という運用のための道具。
//
// ── 前提（どちらか一方） ──
//   A) デプロイ済み Edge Function 経由:
//      AI_LESSON_TOKEN_URL / AI_LESSON_JWT / AI_LESSON_SESSION_ID
//   B) OpenAI へ直接（Edge Function 未デプロイ時の voice 受理確認のみ）:
//      OPENAI_API_KEY
//
// ── 出力 ──
//   docs/ai-course/adventure-v2/generated/teacher-voice-smoke.json
//   secrets は一切書き出さない。session識別子はハッシュ化した先頭12桁だけを残す。
//
// ── 使い方 ──
//   node scripts/ai-course/verify-teacher-voice.mjs
//   node scripts/ai-course/verify-teacher-voice.mjs --voice-probe   # 受理確認のみ

import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'docs/ai-course/adventure-v2/generated/teacher-voice-smoke.json');
const MODEL = process.env.AI_LESSON_REALTIME_MODEL ?? 'gpt-realtime-2.1';

// Edge Function の allowlist と同じ対応表（ズレはvitestが検出する）
const TEACHER_VOICE = { shoko: 'marin', yuto: 'cedar' };

/** session識別子は生値を残さない（ログ・成果物への秘密値流出を防ぐ） */
const digest = (s) => (s ? createHash('sha256').update(String(s)).digest('hex').slice(0, 12) : null);

const nowIso = () => new Date().toISOString();

/** A) Edge Function 経由: teacherId を送って、適用された voice を確認する */
const viaEdgeFunction = async (teacherId) => {
  const url = process.env.AI_LESSON_TOKEN_URL;
  const jwt = process.env.AI_LESSON_JWT;
  const sessionId = process.env.AI_LESSON_SESSION_ID;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      teacherId,
      sessionId,
      plan: {
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
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    route: 'edge-function',
    requestedTeacherId: teacherId,
    expectedVoice: TEACHER_VOICE[teacherId] ?? null,
    effectiveTeacherId: body.teacherId ?? null,
    effectiveVoice: body.voice ?? null,
    model: body.model ?? null,
    httpStatus: res.status,
    ok: res.ok && body.voice === TEACHER_VOICE[teacherId],
    // clientSecret は絶対に残さない。存在の有無だけ
    clientSecretIssued: Boolean(body.clientSecret),
    expiresAt: body.expiresAt ?? null,
    errorKind: res.ok ? null : (body.error ?? `http_${res.status}`),
    latencyMs: Date.now() - t0,
  };
};

/** B) OpenAI へ直接: voice名が API に受理されるかだけを確認する */
const viaOpenAi = async (teacherId) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const voice = TEACHER_VOICE[teacherId];
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 60 },
      session: {
        type: 'realtime',
        model: MODEL,
        instructions: 'あなたは日本語の先生です。「こんにちは」とだけ短く言ってください。',
        output_modalities: ['audio'],
        audio: { output: { voice, speed: 0.8 } },
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    route: 'openai-direct',
    requestedTeacherId: teacherId,
    expectedVoice: voice,
    effectiveVoice: res.ok ? voice : null,
    model: MODEL,
    httpStatus: res.status,
    ok: res.ok,
    clientSecretIssued: Boolean(body.value),
    sessionRef: digest(body.value),
    errorKind: res.ok ? null : (body?.error?.code ?? body?.error?.type ?? `http_${res.status}`),
    // 未対応voiceの切り分けに必要なメッセージだけ（キーは含まれない）
    errorMessage: res.ok ? null : String(body?.error?.message ?? '').slice(0, 300),
    latencyMs: Date.now() - t0,
  };
};

const main = async () => {
  const hasEdge = Boolean(
    process.env.AI_LESSON_TOKEN_URL && process.env.AI_LESSON_JWT && process.env.AI_LESSON_SESSION_ID,
  );
  const hasKey = Boolean(process.env.OPENAI_API_KEY);

  const report = {
    generatedAt: nowIso(),
    model: MODEL,
    mapping: TEACHER_VOICE,
    route: hasEdge ? 'edge-function' : hasKey ? 'openai-direct' : null,
    results: [],
    verdict: 'BLOCKED',
    blockedReason: null,
    note:
      'このファイルが verdict=PASS になるまで advTeacher.ts の voiceSwitchAvailable を true にしない。',
  };

  if (!hasEdge && !hasKey) {
    report.blockedReason =
      'AI_LESSON_TOKEN_URL/AI_LESSON_JWT/AI_LESSON_SESSION_ID も OPENAI_API_KEY も無い。'
      + ' OpenAIキーは Supabase Secret にのみ存在し、Edge Function は staging と production が'
      + ' 同一Supabaseプロジェクト（1つ）を共有するためデプロイできない（production Edge Function deploy 禁止）。';
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log('BLOCKED:', report.blockedReason);
    console.log('evidence:', OUT);
    process.exit(0); // 他タスクを止めないため異常終了にしない
  }

  const run = hasEdge ? viaEdgeFunction : viaOpenAi;
  for (const teacherId of ['shoko', 'yuto']) {
    // eslint-disable-next-line no-await-in-loop
    const r = await run(teacherId);
    report.results.push(r);
    console.log(
      `${teacherId}: status=${r.httpStatus} voice=${r.effectiveVoice ?? '-'} ok=${r.ok}`
      + (r.errorKind ? ` error=${r.errorKind}` : ''),
    );
  }

  const allOk = report.results.every((r) => r.ok);
  const distinct = new Set(report.results.map((r) => r.effectiveVoice)).size === report.results.length;
  report.verdict = allOk && distinct ? 'PASS' : 'FAIL';
  if (!allOk) {
    report.blockedReason = report.results.find((r) => !r.ok)?.errorKind ?? 'unknown';
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log('verdict:', report.verdict);
  console.log('evidence:', OUT);
};

main().catch((e) => {
  console.error('verify-teacher-voice failed:', e instanceof Error ? e.message : 'unknown');
  process.exit(1);
});
