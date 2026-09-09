// 7日間の実力診断（無料・招待リンク限定）の約束を固定する。2026-09-10 CEO決定。
//
// ここで守るのは4つ。どれも「決めたことが静かに崩れる」と実害が出る種類のもの:
//   1. 料金表に出さない（出すと ¥600 体験パスの下位互換に見える）
//   2. AI会話は0回（原価を持つのは会話だけ。1回開けると100人で約1万円）
//   3. 冒険は最初の3地域まで（有料と同じ深さにしない）
//   4. 受講権としていちばん弱い（無料が有料を上書きしたら事故）
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { planById, publishedPlans, PLAN_CATALOG } from './planCatalog';
import { entitlementsFor, PLAN_STRENGTH_RANK } from './planEntitlements';
import { aiBudgetFor } from './planAiBudget';

const FREE = 'free-7d';

describe('料金表には出さない', () => {
  it('公開プランの一覧に無料枠が入っていない', () => {
    expect(publishedPlans().map((p) => p.id)).not.toContain(FREE);
  });

  it('カタログには居る（権限はカタログから導出されるので、外に置くと制限なしに落ちる）', () => {
    expect(PLAN_CATALOG.map((p) => p.id)).toContain(FREE);
    expect(planById(FREE)?.status).toBe('draft');
  });
});

describe('AI会話は0回（無料枠に原価を持たせない）', () => {
  it('枠が3つとも0', () => {
    const b = aiBudgetFor(FREE);
    expect(b.voiceSessionsTotal).toBe(0);
    expect(b.voiceSessionsPerDay).toBe(0);
    expect(b.textSessionsPerDay).toBe(0);
  });

  it('権限としても会話が閉じている', () => {
    expect(entitlementsFor(FREE).aiConversation).toBe(false);
  });

  it('**サーバー側にも0が入っている**（知らないプランは共通上限で素通しになるため）', () => {
    const dir = 'supabase/migrations';
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.endsWith('.rollback.sql')).sort();
    let seeded: Record<string, Record<string, number>> | null = null;
    for (const f of files) {
      const m = readFileSync(`${dir}/${f}`, 'utf8').match(/'plan_ai_budgets',\s*'(\{[\s\S]*?\})'::jsonb/);
      if (m) seeded = JSON.parse(m[1]);
    }
    expect(seeded?.[FREE], 'free-7d が ai_config の seed に無い').toBeDefined();
    expect(seeded![FREE].voiceSessionsTotal).toBe(0);
    expect(seeded![FREE].textSessionsPerDay).toBe(0);
  });
});

describe('中身の深さ', () => {
  it('冒険は最初の3地域まで（有料と同じ深さにしない）', () => {
    expect(planById(FREE)?.contentRegionLimit).toBe(3);
  });

  it('7日で切れる', () => {
    expect(planById(FREE)?.accessDays).toBe(7);
  });

  it('無料であることを、価格ラベルにも数値にも矛盾なく書いている', () => {
    expect(planById(FREE)?.priceJpy).toBe(0);
    expect(planById(FREE)?.priceLabelJa).toBe('無料');
  });

  it('含まれないものを明示している（あとで「聞いていない」を作らない）', () => {
    const p = planById(FREE)!;
    expect(p.notIncludedJa.join('')).toContain('AI会話');
    expect(p.notIncludedJa.join('')).toContain('個別レッスン');
  });
});

describe('受講権としていちばん弱い', () => {
  it('TS側の強さが最小', () => {
    const ranks = Object.values(PLAN_STRENGTH_RANK);
    expect(PLAN_STRENGTH_RANK[FREE]).toBe(Math.min(...ranks));
  });

  it('**SQL側にも入っている**（未知のプランは最強に倒れるので、書き忘れると有料を上書きする）', () => {
    const dir = 'supabase/migrations';
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.endsWith('.rollback.sql')).sort();
    let last = '';
    for (const f of files) {
      const sql = readFileSync(`${dir}/${f}`, 'utf8');
      if (/function\s+public\.ai_plan_rank/.test(sql)) last = sql;
    }
    const m = last.match(new RegExp(`when '${FREE}'\\s*then\\s*(\\d+)`));
    expect(m, 'ai_plan_rank に free-7d が無い').toBeTruthy();
    expect(Number(m![1])).toBe(PLAN_STRENGTH_RANK[FREE]);
  });
});

describe('招待から受講権を作る仕組み（migration）', () => {
  const MIG = readFileSync('supabase/migrations/20260910100000_ai_free_trial_invites.sql', 'utf8');

  it('既に受講権がある人には触らない（有料を無料で上書きしない）', () => {
    expect(MIG).toMatch(/if exists \(select 1 from public\.ai_course_access/);
  });

  it('招待にプランが無ければ何もしない（従来の招待の意味を変えない）', () => {
    expect(MIG).toMatch(/v_grant\.plan_id is null then return new/);
  });

  it('同じ招待で何度も配らない（grant を消費済みにする）', () => {
    expect(MIG).toMatch(/set consumed_at = now\(\)/);
  });

  it('受講権を作れなくても登録そのものは通す（学習者を締め出さない）', () => {
    expect(MIG).toMatch(/exception when others then/);
  });

  it('破壊的な操作をしていない', () => {
    expect(MIG).not.toMatch(/drop\s+table/i);
    expect(MIG).not.toMatch(/delete\s+from/i);
    expect(MIG).not.toMatch(/truncate/i);
  });
});
