// Edge Function 側の約束（2026-08-26 Phase S1/S2）。
//
// checkout と webhook は Deno で動くので、ここからは実行できない。
// しかも**本番と共有**なので、確認のためだけにデプロイもできない。
// そこで「デプロイしたときに何が起きるか」をソースの形で固定しておく。
//
// ここが落ちるときは、デプロイ後に本番で起きることが変わっている。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planById } from './planCatalog';

const CHECKOUT = readFileSync('supabase/functions/ai-course-checkout/index.ts', 'utf8');
const WEBHOOK = readFileSync('supabase/functions/ai-course-stripe-webhook/index.ts', 'utf8');
const CATALOG = readFileSync('supabase/functions/_shared/aiCoursePlans.ts', 'utf8');

describe('関数側カタログが src と一致している', () => {
  it('trialDays を持っている（無いと webhook が 7日を書けない）', () => {
    expect(CATALOG).toContain('trialDays: number | null;');
  });

  it('体験パスの日数が src のカタログと同じ', () => {
    const m = /"id": "ai-trial-pass"[\s\S]*?"trialDays": (\d+|null)/.exec(CATALOG);
    expect(m, '関数側カタログに体験パスの trialDays が無い').toBeTruthy();
    expect(m![1]).toBe(String(planById('ai-trial-pass')!.trialDays));
  });

  it('自動生成であることが書いてある（手で直させない）', () => {
    expect(CATALOG).toContain('AUTO-GENERATED');
  });
});

describe('checkout: 流入元を購入行へ焼き付ける', () => {
  it('anon_id は UUID 形式だけ受ける', () => {
    expect(CHECKOUT).toMatch(/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$/);
  });

  it('形が違えば捨てるだけで、決済は止めない', () => {
    // 計測のために購入を失敗させてはいけない
    expect(CHECKOUT).toMatch(/\? body\.anonId : null/);
  });

  it('購入行に流入元を書く（あとで台帳が変わっても売上の出どころは動かない）', () => {
    expect(CHECKOUT).toContain('attribution_source: utm.utm_source ?? null');
    expect(CHECKOUT).toContain('attribution_campaign: utm.utm_campaign ?? null');
  });

  it('受け取るUTMのキーは固定のまま（知らないキーを保存しない）', () => {
    const m = /for \(const k of \[([^\]]+)\]\)/.exec(CHECKOUT);
    expect(m).toBeTruthy();
    expect(m![1]).toContain('"utm_source"');
    expect(m![1]).toContain('"ref"');
  });

  it('金額はサーバー側カタログから取る（クライアントの値を信じない）', () => {
    expect(CHECKOUT).toContain('FUNCTION_PLAN_CATALOG.find');
  });
});

describe('webhook: 体験の長さを受講権に書く', () => {
  it('trial_days をカタログから書く', () => {
    expect(WEBHOOK).toContain('trial_days: plan.trialDays');
  });

  it('旧仕様の trial_window_minutes も書いたまま（既存の行と混ぜない）', () => {
    expect(WEBHOOK).toContain('trial_window_minutes: plan.realtimeWindowMinutes');
  });

  it('開始前は未開始のまま（購入した瞬間に時計を回さない）', () => {
    expect(WEBHOOK).toContain('trial_started_at: null');
  });

  it('購入メールが日数で案内する', () => {
    expect(WEBHOOK).toMatch(/plan\.trialDays !== null/);
    expect(WEBHOOK).toContain('日間ご利用いただけます');
    expect(WEBHOOK).toContain('天（请在购买后30天内开始）');
  });

  it('メールにAI音声会話の回数も書く（日数制では回数が上限）', () => {
    expect(WEBHOOK).toContain('音声会話は合計3回');
    expect(WEBHOOK).toContain('语音会话共3次');
  });
});

describe('この2つはまだ本番へ出していない（出すまで挙動は変わらない）', () => {
  it('デプロイ前提のメモが残っている', () => {
    // 本番と共有の関数なので、フロントの承認と同時に出す必要がある。
    // 手順は docs/ai-course/decisions/2026-08-26-sales-foundation.md に書く
    const doc = readFileSync('docs/ai-course/decisions/2026-08-26-sales-foundation.md', 'utf8');
    expect(doc).toContain('ai-course-stripe-webhook');
    expect(doc).toContain('ai-course-checkout');
  });
});
