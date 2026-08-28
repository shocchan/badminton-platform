// 「原価の数字が、実利用から説明できる状態か」を固定するテスト（2026-08-24 WAVE 4-4）。
//
// 守りたいのは金額の正しさそのものではない（実請求と突き合わせるまで正しさは分からない）。
// 守りたいのは **「分からないことを、分かっているふりで書かない」** 状態:
//   - 推定（estimated）と実測（reported）が同じ列に混ざらない
//   - 単価がどのモデルのものか、記録に残る
//   - 直書きの魔法の数字がない（全部トークン数×単価から出る）
//   - 既存の安全弁（加算専用・1回$1クランプ）が壊れていない
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  TEXT_USD_PER_SESSION, ASSUMED_TEXT_MODEL, TEXT_SESSION_TOKENS,
  textSessionTokenCounts, textUsdPerSession, textUsdPerSessionCeiling,
  AUDIT_REPORTED_TEXT_USD_PER_SESSION,
  planEconomics, maxAffordableTextUsdPerSession, breakEvenTextUsdPerSession,
  VOICE_USD_PER_MINUTE,
} from './planAiBudget';
import { PLAN_CATALOG } from './planCatalog';
import { costUsdForTokens } from '../aiModelPricing';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const MIGRATION = 'supabase/migrations/20260824150000_ai_usage_events.sql';
const ROLLBACK = 'supabase/migrations/20260824150000_ai_usage_events.rollback.sql';
const OLD_RPC = 'supabase/migrations/20260817000000_ai_usage_record_rpc.sql';
const FN_CHAT = 'supabase/functions/ai-lesson-chat/index.ts';
const FN_REPORT = 'supabase/functions/ai-lesson-report/index.ts';
const FN_TRANSLATE = 'supabase/functions/ai-lesson-translate/index.ts';
const FN_TOKEN = 'supabase/functions/ai-lesson-token/index.ts';

/* ───────────────────────────────────────────────
   1. テキスト単価は「導出」であって「直書き」ではない
   ─────────────────────────────────────────────── */

describe('テキスト会話の原価が検算できる形になっている', () => {
  it('単価表 × トークン見積り から出ている（魔法の数字が残っていない）', () => {
    expect(TEXT_USD_PER_SESSION)
      .toBeCloseTo(costUsdForTokens(ASSUMED_TEXT_MODEL, textSessionTokenCounts()), 12);
  });

  it('トークン見積りは Edge Function のガード定数と揃っている', () => {
    const chat = read(FN_CHAT);
    // 出力上限・履歴件数・入力長は、この見積りの前提そのもの。ソース側が動いたら落とす
    expect(chat).toContain(`MAX_OUTPUT_TOKENS = ${TEXT_SESSION_TOKENS.outputTokensPerTurn}`);
    expect(chat).toContain('MAX_HISTORY_MSGS = 16');
    expect(chat).toContain(`MAX_MSG_CHARS = ${TEXT_SESSION_TOKENS.historyTokensPerMessage}`);
    expect(chat).toContain(`MAX_INPUT_CHARS = ${TEXT_SESSION_TOKENS.studentInputTokens}`);
    expect(read(FN_REPORT)).toContain(`max_tokens: ${TEXT_SESSION_TOKENS.reportOutputTokens}`);
  });

  it('旧 $0.004 は低すぎた（新しい見積りは約2.5倍）', () => {
    expect(TEXT_USD_PER_SESSION).toBeGreaterThan(0.004);
    expect(TEXT_USD_PER_SESSION / 0.004).toBeGreaterThan(2);
    expect(TEXT_USD_PER_SESSION / 0.004).toBeLessThan(3);
  });
});

/* ───────────────────────────────────────────────
   2. 監査の $0.069 は何だったのか
   ─────────────────────────────────────────────── */

describe('監査の「テキスト1回 $0.069」を事実として整理する', () => {
  it('gpt-4o-mini の**絶対上限**を超えている＝gpt-4o-mini のトークン実測ではありえない', () => {
    // 絶対上限 = 毎ターン履歴が満杯（16件×300字）＋レポート最大、という物理的な最大
    const ceiling = textUsdPerSessionCeiling(ASSUMED_TEXT_MODEL);
    expect(ceiling).toBeCloseTo(0.013125, 6);
    expect(AUDIT_REPORTED_TEXT_USD_PER_SESSION).toBeGreaterThan(ceiling);
    // 5倍以上ある。「見積りが少し甘かった」では説明がつかない差
    expect(AUDIT_REPORTED_TEXT_USD_PER_SESSION / ceiling).toBeGreaterThan(5);
  });

  it('gpt-4o なら説明がつく範囲に入る（env 差し替えが疑わしい）', () => {
    // gpt-4o は gpt-4o-mini の 16.667 倍。8ターンで $0.165、上限で $0.219
    expect(textUsdPerSession('gpt-4o')).toBeGreaterThan(AUDIT_REPORTED_TEXT_USD_PER_SESSION);
    expect(textUsdPerSessionCeiling('gpt-4o')).toBeGreaterThan(AUDIT_REPORTED_TEXT_USD_PER_SESSION);
    // 監査は「6ターン」なので、8ターン基準の値より小さく出るのは整合する
    expect(textUsdPerSession('gpt-4o') * (6 / 8)).toBeGreaterThan(AUDIT_REPORTED_TEXT_USD_PER_SESSION);
  });

  it('**どちらなのかは当時の記録から確定できない**（モデル名を残していなかった）', () => {
    // このテストは「分からない」を消さないためにある。
    // ai_usage_events.model / source を入れた今後は、この問いはデータで答えられる。
    const sql = read(MIGRATION);
    expect(sql).toMatch(/model text not null/);
    expect(sql).toMatch(/source text not null default 'estimated'/);
  });
});

/* ───────────────────────────────────────────────
   3. 月額 ¥2,980 が「使われるほど赤字」にならないか
   ─────────────────────────────────────────────── */

describe('1か月プラン（¥2,980）の採算', () => {
  const month = () => planEconomics('ai-month');

  it('新しい原価モデルでも、上限まで使われて赤字にはならない（原価率 < 1）', () => {
    expect(month().profitable).toBe(true);
    expect(month().costRatio!).toBeLessThan(1);
  });

  it('宣言した原価率 45% の中に収まっている（0.417）', () => {
    // 2026-08-28 まではここが 0.4836 で、上限45%を超えたまま公開されていた
    //（＝上限まで使われる月ほど利益が減る）。
    // CEO決定で音声を 10回 → 8回 に下げて収めた。テキスト8回/日は据え置き。
    // 音声1回(4分)は¥100、テキスト1回は¥1.8。高いのは音声だけなので削る場所はここしかない。
    const ratio = month().costRatio!;
    expect(ratio).toBeLessThanOrEqual(0.45);
    expect(ratio).toBeCloseTo(0.4165, 3);
  });

  it('テキスト単価がいくらまでなら 45% に収まるか（$0.0121）', () => {
    // 音声を8回に下げたぶん、テキストに使える余地が広がった（$0.0076 → $0.0121）
    expect(maxAffordableTextUsdPerSession('ai-month')!).toBeCloseTo(0.01212, 4);
    // 現行の見積り $0.0099 はこの中に収まっている（8/28以前は超えていた）
    expect(TEXT_USD_PER_SESSION).toBeLessThan(maxAffordableTextUsdPerSession('ai-month')!);
  });

  it('テキスト単価が $0.0488 を超えると赤字に入る', () => {
    // 音声8回化で $0.04436 → $0.04884 に上がった（＝耐えられる幅が広がった）
    expect(breakEvenTextUsdPerSession('ai-month')!).toBeCloseTo(0.04884, 4);
  });

  it('もし監査の $0.069 が本当なら、1か月プランは上限で赤字（原価率 1.37）', () => {
    const e = planEconomics('ai-month', { textUsdPerSession: AUDIT_REPORTED_TEXT_USD_PER_SESSION });
    expect(e.profitable).toBe(false);
    expect(e.costRatio!).toBeGreaterThan(1);
  });

  it('$0.069 だったら、1か月と体験パスは赤字に入る（6か月だけが耐える）', () => {
    // 体験パスは 2026-08-26 に7日間化してテキストぶんが伸びたため、
    // 監査の $0.069 では赤字側に回る（60分だった頃は耐えていた）。
    // **テキストの実単価は実請求と突き合わせていない**（ai_usage_events が本番未適用）。
    // $0.0099 と $0.069 のどちらが本当かで、体験パスと1か月の成否が変わる。
    for (const id of ['ai-month', 'ai-trial-pass'] as const) {
      const e = planEconomics(id, { textUsdPerSession: AUDIT_REPORTED_TEXT_USD_PER_SESSION });
      expect(e.profitable, id).toBe(false);
    }
    const long = planEconomics('coach-6m', { textUsdPerSession: AUDIT_REPORTED_TEXT_USD_PER_SESSION });
    expect(long.profitable).toBe(true);
  });
});

describe('公開プランごとに「テキストいくらまで耐えられるか」が出せる', () => {
  it.each(PLAN_CATALOG.filter((p) => p.status === 'published').map((p) => [p.nameJa, p.id] as const))(
    '%s', (_name, id) => {
      const affordable = maxAffordableTextUsdPerSession(id);
      const breakEven = breakEvenTextUsdPerSession(id);
      expect(affordable).not.toBeNull();
      expect(breakEven).not.toBeNull();
      // 赤字境界のほうが必ず緩い（原価率1.0 は maxAiCostRatio より大きいので）
      expect(breakEven!).toBeGreaterThan(affordable!);
    });
});

/* ───────────────────────────────────────────────
   4. 実際に走るモデルが黙って高いほうへ動かないように
   ─────────────────────────────────────────────── */

describe('Edge Function の既定モデルが、原価モデルの前提と一致している', () => {
  it('テキスト会話・レポート・翻訳の既定は gpt-4o-mini', () => {
    // env で差し替えられるので、これは「コードの既定値」を固定するだけ。
    // 実際に何が走ったかは ai_usage_events.model を見る（そのために記録している）。
    expect(read(FN_CHAT)).toContain(`?? "${ASSUMED_TEXT_MODEL}"`);
    expect(read(FN_REPORT)).toContain(`?? "${ASSUMED_TEXT_MODEL}"`);
    expect(read(FN_TRANSLATE)).toContain(`?? "${ASSUMED_TEXT_MODEL}"`);
  });

  it('音声の既定は gpt-realtime-2.1（VOICE_USD_PER_MINUTE の前提）', () => {
    expect(read(FN_TOKEN)).toContain('?? "gpt-realtime-2.1"');
    expect(VOICE_USD_PER_MINUTE).toBeCloseTo(0.1344, 6);
  });
});

/* ───────────────────────────────────────────────
   5. 記録の基盤（推定/実測の区別・既存の安全弁）
   ─────────────────────────────────────────────── */

describe('推定と実測を区別して記録する', () => {
  const sql = read(MIGRATION);

  it('source 列が estimated / reported / billed の3値に限定されている', () => {
    expect(sql).toMatch(/check \(source in \('estimated', 'reported', 'billed'\)\)/);
  });

  it('kind でどの機能の原価かが分かる（音声だけの数字にならない）', () => {
    expect(sql).toMatch(/check \(kind in \('voice', 'text', 'report', 'translate', 'transcribe'\)\)/);
  });

  it('トークン数を種類別に持つ（キャッシュ・音声を別単価で数えられる）', () => {
    for (const col of [
      'input_tokens', 'cached_input_tokens', 'output_tokens',
      'audio_input_tokens', 'audio_output_tokens', 'realtime_seconds',
    ]) expect(sql, col).toContain(`${col} `);
  });

  it('音声は分数と「その分数がどう測られたか」を残す', () => {
    expect(sql).toContain('duration_source');
    expect(sql).toContain('client_wallclock');
    expect(sql).toContain('session_duration');
  });

  it('記録RPCは金額を引数で受け取らない（単価はDBが持つ）', () => {
    const rpc = sql.slice(sql.indexOf('create or replace function public.ai_record_usage_event'));
    const signature = rpc.slice(0, rpc.indexOf(') returns jsonb'));
    expect(signature).not.toMatch(/p_cost/);
    expect(signature).toMatch(/p_input_tokens/);
    expect(signature).toMatch(/p_model text/);
  });

  it('ログインユーザーは他人の learner_id を指定できない', () => {
    expect(sql).toMatch(/if v_uid is not null then[\s\S]*?where user_id = v_uid/);
  });

  it('音声セッションは1行に寄せる（再接続で行が増えない）', () => {
    expect(sql).toMatch(/create unique index if not exists ai_usage_events_voice_uniq/);
  });
});

describe('既存の安全弁を壊していない', () => {
  const sql = read(MIGRATION);

  it('ai_record_usage(int, numeric) を作り替えていない', () => {
    expect(sql).not.toMatch(/function public\.ai_record_usage\s*\(\s*p_seconds/);
    expect(sql).not.toMatch(/drop function[^\n]*ai_record_usage\(int/);
    // 旧RPCは旧migrationにそのまま残っている
    expect(read(OLD_RPC)).toContain('create or replace function public.ai_record_usage(p_seconds int, p_cost_usd numeric)');
  });

  it('日次への積み増しは既定 off（クライアントと二重計上しない）', () => {
    expect(sql).toMatch(/p_rollup boolean default false/);
  });

  it('日次へ積むときは既存と同じクランプ（1回$1・秒はセッション上限）', () => {
    const rollup = sql.slice(sql.indexOf('if p_rollup and v_learner_id is not null then'));
    expect(rollup).toContain('least(v_cost, 1.0)');
    expect(rollup).toContain('least(v_secs, v_max_seconds)');
  });

  it('日次は加算専用のまま（絶対値の上書きをしていない）', () => {
    const rollup = sql.slice(sql.indexOf('if p_rollup and v_learner_id is not null then'));
    expect(rollup).toContain('set seconds_used = ai_usage_daily.seconds_used + excluded.seconds_used');
    expect(rollup).toContain('estimated_cost_usd = ai_usage_daily.estimated_cost_usd + excluded.estimated_cost_usd');
    // sessions_count には触らない（ai_start_session が予約時に加算済み）
    expect(rollup).not.toMatch(/sessions_count = ai_usage_daily\.sessions_count \+/);
  });

  it('明細台帳もクライアントから直接書けない（ai_usage_daily と同じ二層防御）', () => {
    expect(sql).toContain('revoke insert, update, delete on public.ai_usage_events from authenticated');
    expect(sql).toContain('revoke all on public.ai_usage_events from anon');
    expect(sql).toContain('alter table public.ai_usage_events enable row level security');
  });

  it('トークン数と金額に上限クランプがある（桁違いの注入を遮断）', () => {
    expect(sql).toContain('2000000');
    expect(sql).toContain('least(greatest(coalesce(v_cost, 0), 0), 10.0)');
  });

  it('rollback は既存資産に触らない', () => {
    // コメント中の言及は許す。**実行される文**が既存資産に触っていないことを見る
    const stmts = read(ROLLBACK)
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(stmts).not.toContain('ai_usage_daily');
    expect(stmts).not.toMatch(/ai_record_usage\(int/);
    expect(stmts).not.toMatch(/ai_learners|ai_learning_sessions|ai_plan_purchases/);
    expect(stmts).toContain('drop table if exists public.ai_usage_events');
  });
});

describe('4つの Edge Function が実利用を記録している', () => {
  it.each([
    ['ai-lesson-chat', FN_CHAT, 'kind: "text"'],
    ['ai-lesson-report', FN_REPORT, 'kind: "report"'],
    ['ai-lesson-translate', FN_TRANSLATE, 'kind: "translate"'],
    ['ai-lesson-token', FN_TOKEN, 'kind: "voice"'],
  ])('%s', (_name, path, kind) => {
    const src = read(path);
    expect(src).toContain('recordUsageEvent');
    expect(src).toContain(kind);
  });

  it('モデル名は env の既定値ではなく OpenAI が返した実際の値を記録する', () => {
    for (const p of [FN_CHAT, FN_REPORT, FN_TRANSLATE]) {
      expect(read(p), p).toContain('modelFromResponse(data,');
    }
    expect(read(FN_TOKEN)).toContain('secret.session?.model ?? REALTIME_MODEL');
  });

  it('テキスト系は source="reported"（OpenAI が返した実トークン数）', () => {
    for (const p of [FN_CHAT, FN_REPORT, FN_TRANSLATE]) {
      expect(read(p), p).toContain('source: "reported"');
    }
  });

  it('音声は source="estimated"（usage を受け取れないので必ず推定）', () => {
    expect(read(FN_TOKEN)).toContain('source: "estimated"');
    expect(read(FN_TOKEN)).toContain('durationSource: "pending_client_report"');
  });
});
