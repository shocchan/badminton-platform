// AI会話の回数（2026-09-11 CEO指示「実質的な会話が成立していない回は回数を消費しない」）の、
// DB の外側の約束を固定する。DB の中の振る舞いは voiceSessionConsumption.sql.test.ts が本物の Postgres で確かめる。
//
// 1. Edge Function ai-lesson-token は、OpenAI へトークンを取りに行く**前に**台帳へ記録する。書けなければ出さない
// 2. OpenAI から受け取れず、ブラウザへ何も渡さなかったときだけ記録を戻す
// 3. 台帳の関数が本番DBに無い（migration を戻した）ときだけ従来どおり出す（404 + PGRST202 に限る）
// 4. クライアントは材料を送るだけ。中断で戻ったら枠を取り直して、戻った回数を画面に出す
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const TOKEN = read('supabase/functions/ai-lesson-token/index.ts');
const PAGE = read('src/pages/ai-lesson/AiCoursePage.tsx');

describe('ai-lesson-token: トークン発行の記録', () => {
  const serveBody = TOKEN.slice(TOKEN.indexOf('serve(async (req)'));

  it('台帳への記録（claim）は OpenAI の client_secrets より前にある', () => {
    const claimAt = serveBody.indexOf('await claimVoiceToken(sessionId, courseUserId, body.reportsEvidence === true)');
    const openaiAt = serveBody.indexOf('await fetch(OPENAI_CLIENT_SECRETS_URL');
    expect(claimAt).toBeGreaterThan(0);
    expect(openaiAt).toBeGreaterThan(claimAt);
  });

  it('材料を送る版の画面か（reportsEvidence）を、そのまま台帳へ渡す（true のときだけ true）', () => {
    expect(TOKEN).toMatch(/body: JSON\.stringify\(\{ p_session_id: sessionId, p_user_id: userId, p_reports_evidence: reportsEvidence \}\)/);
    expect(serveBody).toMatch(/body\.reportsEvidence === true/);
  });

  it('記録できなければトークンを出さない（フェイルクローズ）', () => {
    expect(serveBody).toMatch(/if \(!claim\.ok\) return json\(claim\.status, \{ error: claim\.code \}\);/);
    // 通信の失敗・500 などは 503 で止める
    expect(TOKEN).toMatch(/return \{ ok: false, status: 503, code: "claim_failed" \};/);
  });

  it('関数が無いときだけ従来どおり出す（404 かつ PGRST202 に限る）', () => {
    expect(TOKEN).toMatch(/if \(res\.status === 404 && pgCode === "PGRST202"\) \{[\s\S]{0,160}return \{ ok: true, recorded: false \};/);
    // それ以外の「関数はあるが失敗した」を通す分岐が無い
    expect((TOKEN.match(/recorded: false/g) ?? []).length).toBe(1);
  });

  it('OpenAI の失敗・secret 無し・例外のときは記録を戻す。トークンを返す直前からは戻さない', () => {
    const failBranch = serveBody.slice(serveBody.indexOf('if (!openaiRes.ok)'), serveBody.indexOf('const secret = '));
    expect(failBranch).toMatch(/await releaseVoiceToken\(claimed\.sessionId, claimed\.userId\)/);
    const noSecret = serveBody.slice(serveBody.indexOf('if (!secret.value)'), serveBody.indexOf('const meterEnv'));
    expect(noSecret).toMatch(/await releaseVoiceToken\(claimed\.sessionId, claimed\.userId\)/);
    expect(noSecret).toMatch(/\/\/ ここから先はトークンをブラウザへ返す。記録は戻さない\s*\n\s*claimed = null;/);
    const catchBranch = serveBody.slice(serveBody.lastIndexOf('} catch (e) {'));
    expect(catchBranch).toMatch(/if \(claimed\) await releaseVoiceToken/);
  });

  it('DB の関数名を文字どおりに書く（本番DBに関数があるかを deploy 前の門で確かめられるように）', () => {
    expect(TOKEN).toContain('/rest/v1/rpc/ai_service_claim_voice_token');
    expect(TOKEN).toContain('/rest/v1/rpc/ai_service_release_voice_token');
  });

  it('本人のユーザーIDは JWT から確かめた値だけを使う（リクエストの本文から受け取らない）', () => {
    expect(TOKEN).toMatch(/return \{ ok: true, userId \};/);
    expect(TOKEN).not.toMatch(/body\.userId|plan\.userId/);
  });
});

describe('クライアント', () => {
  const rpc = vi.fn();
  beforeEach(() => { rpc.mockReset(); });

  it('リポジトリは ai_voice_report_evidence へ送り、サーバーの established だけを返す。失敗は null', async () => {
    vi.resetModules();
    vi.doMock('../../../../services/supabaseClient', () => ({ supabase: { rpc } }));
    const { courseRepository } = await import('../courseRepository');
    const ev = { connectedMs: 12_000, userTurns: 2, aiRepliesAfterUser: 2, tutorTurns: 3, userSpeechStarts: 2 };

    rpc.mockResolvedValueOnce({ data: { ok: true, established: true, outcome: 'consumed' }, error: null });
    expect(await courseRepository.reportVoiceEvidence('s-1', ev)).toEqual({ established: true });
    expect(rpc).toHaveBeenCalledWith('ai_voice_report_evidence', { p_session_id: 's-1', p_evidence: ev });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await courseRepository.reportVoiceEvidence('s-1', ev)).toBeNull();

    rpc.mockRejectedValueOnce(new Error('offline'));
    expect(await courseRepository.reportVoiceEvidence('s-1', ev)).toBeNull();
    vi.doUnmock('../../../../services/supabaseClient');
  });

  it('接続前のエラーから戻ったら、閉じたあとで会話枠を取り直す（戻った回数を画面に出す）', () => {
    const abort = PAGE.slice(PAGE.indexOf('const abortExit = () => {'), PAGE.indexOf('const abortExit = () => {') + 900);
    expect(abort).toMatch(/endReason: 'error-exit-before-start',[\s\S]*?\.then\(\(\) => fetchConversationBudget\(\)\)[\s\S]*?setConvBudget\(b\)/);
  });
});
