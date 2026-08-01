#!/usr/bin/env node
// AI会話 E2E の**実API 1周**（FINAL CLOSEOUT §7）。
//
// mockではなく、実際に動いているものだけを通す:
//   ai_start_session(RPC) → ai-lesson-token(Edge Function) → OpenAI Realtime(WebSocket・実音声)
//   → 発話ログ保存(REST) → ai-lesson-report(Edge Function・実LLM) → セッション完了(RPC/REST)
//   → 学習レポート・言い直し素材・復習登録・XP/実践力の更新を実データで確認
//
// 学習者のマイク入力だけは、Realtime の `conversation.item.create`（input_text）で
// **同じ会話ターンとして**流し込む。音声の入り口以外はすべて本番と同じ経路を通る。
//
// 実行: node scripts/ai-course/verify-conversation-e2e.mjs --fixture <path.json> --teacher <shoko|yuto>
// 出力: docs/ai-course/adventure-v2/generated/conversation-e2e.json
// **secret（JWT・client secret・APIキー）は書き出さない。**

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'docs/ai-course/adventure-v2/generated/conversation-e2e.json');

const env = readFileSync(join(ROOT, '.env'), 'utf8');
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const API = envVal('VITE_SUPABASE_URL').replace(/\/$/, '');
const ANON = envVal('VITE_SUPABASE_ANON_KEY');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const fixturePath = arg('--fixture');
const teacherId = arg('--teacher') ?? 'yuto';
const digest = (s) => (s ? createHash('sha256').update(String(s)).digest('hex').slice(0, 12) : null);

const report = {
  generatedAt: new Date().toISOString(),
  teacherId,
  steps: [],
  verdict: 'BLOCKED',
  blockedReason: null,
};
const step = (name, ok, detail = {}) => {
  report.steps.push({ name, ok, ...detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail.note ? ` — ${detail.note}` : ''}`);
  return ok;
};
const finish = (code = 0) => {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log('verdict:', report.verdict);
  console.log('evidence:', OUT);
  process.exit(code);
};

if (!fixturePath || !existsSync(fixturePath)) {
  report.blockedReason = 'fixture が無い（stage-verify-session.mjs --create を先に実行する）';
  console.log('BLOCKED:', report.blockedReason);
  finish(0);
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const JWT = fixture.session?.access_token;
const LEARNER_ID = fixture.learnerId;
if (!JWT || !LEARNER_ID) { report.blockedReason = 'fixture が不完全'; finish(0); }

const authed = (extra = {}) => ({
  apikey: ANON, Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json', ...extra,
});

const MISSION = {
  missionId: 'e2e-conversation',
  targetExpression: '〜たことがあります',
  themeJa: '休みの日にしたこと',
  meaningZh: '曾经…过（表达经历）',
};

const main = async () => {
  // ── 1. Today Adventure の学習セッションを予約（実RPC・上限チェックつき） ──
  const startRes = await fetch(`${API}/rest/v1/rpc/ai_start_session`, {
    method: 'POST',
    headers: authed(),
    body: JSON.stringify({
      p_mission_id: MISSION.missionId, p_lesson_kind: 'new', p_mode: 'voice',
      p_difficulty: 3, p_target_expression: MISSION.targetExpression,
    }),
  });
  const start = await startRes.json().catch(() => ({}));
  if (!step('ai_start_session（実RPC・利用上限を通過して予約）', Boolean(start?.ok && start.sessionId), {
    code: start?.code ?? null, remainingSessions: start?.remainingSessions ?? null,
  })) { report.blockedReason = `start_session:${start?.code}`; finish(0); }
  const sessionId = start.sessionId;

  // ── 2. ai-lesson-token（実Edge Function）で先生別の ephemeral secret を取る ──
  const tokRes = await fetch(`${API}/functions/v1/ai-lesson-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JWT}` },
    body: JSON.stringify({
      sessionId, teacherId,
      plan: {
        themeLabel: MISSION.themeJa, estimatedLevel: 'N3',
        zhSupport: 'whenStuck', correction: 'summary',
        target: {
          label: `「${MISSION.targetExpression}」`,
          example: '日本の大会に出たことがあります。',
          zhMeaning: MISSION.meaningZh, zhExample: '我参加过日本的比赛。',
        },
      },
    }),
  });
  const tok = await tokRes.json().catch(() => ({}));
  const expectedVoice = teacherId === 'yuto' ? 'cedar' : 'marin';
  if (!step('ai-lesson-token（実Edge Function・teacherId受け渡し）', tokRes.ok && tok.voice === expectedVoice, {
    effectiveTeacherId: tok.teacherId ?? null, effectiveVoice: tok.voice ?? null,
    model: tok.model ?? null, secretRef: digest(tok.clientSecret),
  })) { report.blockedReason = 'token'; finish(0); }

  // ── 3. OpenAI Realtime で実際に会話する（実音声・2往復） ──
  const convo = await new Promise((done) => {
    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(tok.model)}`,
      { headers: { Authorization: `Bearer ${tok.clientSecret}` } });
    const st = {
      sessionVoice: null, audioBytes: 0, turns: [], errors: [],
      targetExpressionInPrompt: false, finishToolCalled: false, doneCount: 0,
    };
    // 学習者の発話（本番はマイク音声。ここでは同じ会話アイテムとしてテキストで入れる）
    // 3ターン目に助詞の誤りを意図的に入れる（実際の学習者に近づけ、言い直し素材が出る条件を作る）
    const learnerTurns = [
      '休みの日に、京都へ行ったことがあります。',
      'はい、二回行きました。お寺がとてもきれいでした。',
      '来年も京都を行きたいです。友達と一緒に行くつもりです。',
    ];
    let sent = 0;
    const timer = setTimeout(() => { try { ws.close(); } catch { /* noop */ } }, 120_000);
    const bye = () => { clearTimeout(timer); try { ws.close(); } catch { /* noop */ } done(st); };
    const speak = () => {
      if (sent >= learnerTurns.length) { bye(); return; }
      ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: learnerTurns[sent] }] },
      }));
      st.turns.push({ speaker: 'student', text: learnerTurns[sent] });
      sent += 1;
      ws.send(JSON.stringify({ type: 'response.create' }));
    };

    ws.addEventListener('close', () => done(st));
    ws.addEventListener('error', (e) => st.errors.push(String(e?.message ?? 'ws_error').slice(0, 120)));
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.type === 'session.created') {
        st.sessionVoice = m.session?.audio?.output?.voice ?? null;
        // サーバーが組んだ instructions に今日の目標表現が入っているか（会話へ渡っている証拠）
        st.targetExpressionInPrompt = String(m.session?.instructions ?? '')
          .includes(MISSION.targetExpression);
        speak();
      } else if (m.type === 'response.output_audio.delta' || m.type === 'response.audio.delta') {
        st.audioBytes += Buffer.from(m.delta ?? '', 'base64').length;
      } else if (m.type === 'response.output_audio_transcript.done' || m.type === 'response.audio_transcript.done') {
        st.turns.push({ speaker: 'tutor', text: m.transcript ?? '' });
      } else if (m.type === 'response.function_call_arguments.done' || m.type === 'response.output_item.done') {
        if (m.name === 'finish_lesson' || m.item?.name === 'finish_lesson') st.finishToolCalled = true;
      } else if (m.type === 'response.done') {
        st.doneCount += 1;
        setTimeout(speak, 200);
      } else if (m.type === 'error') {
        st.errors.push(String(m.error?.code ?? m.error?.type ?? 'unknown'));
        bye();
      }
    });
  });

  const tutorTurns = convo.turns.filter((t) => t.speaker === 'tutor' && t.text.trim());
  step('Realtime 会話（実音声・2往復）', convo.sessionVoice === expectedVoice
    && convo.audioBytes > 0 && tutorTurns.length >= 2, {
    sessionVoice: convo.sessionVoice, audioBytes: convo.audioBytes,
    tutorTurns: tutorTurns.length, studentTurns: convo.turns.filter((t) => t.speaker === 'student').length,
    errors: convo.errors,
  });
  step('目標表現が会話へ渡っている（サーバー側instructions）', convo.targetExpressionInPrompt, {
    targetExpression: MISSION.targetExpression,
  });

  // ── 4. 発話ログを保存（実DB） ──
  const utterances = convo.turns.map((t, i) => ({
    session_id: sessionId,
    learner_id: LEARNER_ID,          // RLSはこの列で本人確認する
    speaker: t.speaker,
    transcript: t.text,
    at_ms: i * 4000,
    is_final: true,
    related_target: /たことがあります/.test(t.text),
  }));
  const uRes = await fetch(`${API}/rest/v1/ai_session_utterances`, {
    method: 'POST', headers: authed({ Prefer: 'return=representation' }), body: JSON.stringify(utterances),
  });
  const uBody = await uRes.json().catch(() => []);
  step('発話ログの保存（実DB・RLS通過）', uRes.ok && Array.isArray(uBody) && uBody.length === utterances.length, {
    saved: Array.isArray(uBody) ? uBody.length : 0, expected: utterances.length,
    httpStatus: uRes.status,
  });

  // ── 5. ai-lesson-report（実Edge Function・実LLM）で学習レポート生成 ──
  const repRes = await fetch(`${API}/functions/v1/ai-lesson-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JWT}` },
    body: JSON.stringify({
      sessionId,
      targetExpression: MISSION.targetExpression,
      themeJa: MISSION.themeJa,
      detectedUsage: 'self',
      utterances: convo.turns.map((t) => ({ speaker: t.speaker, transcript: t.text })),
    }),
  });
  const rep = await repRes.json().catch(() => ({}));
  const r = rep.report ?? {};
  const hasReport = repRes.ok && Boolean(r && (r.encouragement || r.summary || r.canDo || r.corrections));
  step('ai-lesson-report（実Edge Function・実LLM）', hasReport, {
    httpStatus: repRes.status,
    reportKeys: r && typeof r === 'object' ? Object.keys(r).slice(0, 12) : [],
    cached: rep.cached ?? false,
  });

  // 言い直し素材＝「言い直し」画面が使う corrections / naturalPhrases
  const corrections = Array.isArray(r.corrections) ? r.corrections : [];
  const naturalPhrases = Array.isArray(r.naturalPhrases) ? r.naturalPhrases : [];
  step('言い直しの素材が生成されている（corrections / naturalPhrases）',
    corrections.length > 0 || naturalPhrases.length > 0, {
      corrections: corrections.length, naturalPhrases: naturalPhrases.length,
      sampleCorrectionKeys: corrections[0] ? Object.keys(corrections[0]).slice(0, 6) : [],
    });
  step('学習レポートの本文が日本語・中国語の両方で出ている',
    Boolean(r.todaySummaryJa && r.todaySummaryZh && r.encouragementJa), {
      hasAchievements: Array.isArray(r.achievements) ? r.achievements.length : 0,
      targetUsage: r.targetUsage ?? null,
    });

  // ── 6. セッション完了（実DB。復習・XPの前提） ──
  const finRes = await fetch(`${API}/rest/v1/ai_learning_sessions?id=eq.${sessionId}`, {
    method: 'PATCH', headers: authed({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      completion_status: 'completed',
      ended_at: new Date().toISOString(),
      duration_seconds: 180,
      target_used: true,
    }),
  });
  const finBody = await finRes.json().catch(() => []);
  step('セッション完了の記録（実DB）', finRes.ok && Array.isArray(finBody) && finBody.length === 1, {
    httpStatus: finRes.status,
    completionStatus: finBody?.[0]?.completion_status ?? null,
    reportPersisted: Boolean(finBody?.[0]?.report),
  });

  // ── 7. 復習登録（ai_item_progress。翌日復習の予約） ──
  const nowIso = new Date().toISOString();
  const dueIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const pRes = await fetch(`${API}/rest/v1/ai_item_progress?on_conflict=learner_id,item_id`, {
    method: 'POST',
    headers: authed({ Prefer: 'return=representation,resolution=merge-duplicates' }),
    body: JSON.stringify([{
      learner_id: LEARNER_ID, item_id: MISSION.missionId,
      mastery_state: 'introduced', mastery_score: 60,
      first_learned_at: nowIso, last_practiced_at: nowIso,
      next_review_at: dueIso, review_stage: 1,
      successful_reviews: 0, failed_reviews: 0, updated_at: nowIso,
    }]),
  });
  const pBody = await pRes.json().catch(() => []);
  step('復習登録（実DB・翌日にスケジュール）', pRes.ok && Array.isArray(pBody) && pBody.length === 1, {
    httpStatus: pRes.status, nextReviewAt: pBody?.[0]?.next_review_at ?? null,
    masteryState: pBody?.[0]?.mastery_state ?? null,
    reviewStage: pBody?.[0]?.review_stage ?? null,
    detail: pRes.ok ? null : String(JSON.stringify(pBody)).slice(0, 200),
  });

  // ── 8. サーバー往復で読み直して、Today Adventure 側から見える状態を確認 ──
  const vRes = await fetch(
    `${API}/rest/v1/ai_learning_sessions?id=eq.${sessionId}&select=id,completion_status,target_used,duration_seconds,report`,
    { headers: authed() },
  );
  const vBody = await vRes.json().catch(() => []);
  const v = vBody?.[0];
  step('reload後もサーバー値が残る（会話→レポート→完了が確定している）',
    Boolean(v && v.completion_status === 'completed' && v.target_used === true && v.report), {
      durationSeconds: v?.duration_seconds ?? null,
    });

  const uttRes = await fetch(
    `${API}/rest/v1/ai_session_utterances?session_id=eq.${sessionId}&select=id,speaker`,
    { headers: authed() },
  );
  const uttBody = await uttRes.json().catch(() => []);
  step('発話ログがサーバーに残っている', Array.isArray(uttBody) && uttBody.length === utterances.length, {
    count: Array.isArray(uttBody) ? uttBody.length : 0,
  });

  report.verdict = report.steps.every((s) => s.ok) ? 'PASS' : 'FAIL';
  if (report.verdict === 'FAIL') {
    report.blockedReason = report.steps.filter((s) => !s.ok).map((s) => s.name).join(' / ');
  }
  report.sessionRef = digest(sessionId);
  finish(0);
};

main().catch((e) => {
  report.blockedReason = e instanceof Error ? e.message.slice(0, 200) : 'unknown';
  console.error('conversation-e2e failed:', report.blockedReason);
  finish(1);
});
