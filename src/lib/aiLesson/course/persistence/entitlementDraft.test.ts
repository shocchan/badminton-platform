// entitlement／admin_overrides列保護 migration草案の dry-run 検査（DB非接続・CEO指示§11）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../../../../..',
  'supabase/migrations/20260728010000_ai_course_entitlements.sql'), 'utf8');

describe('ai_course_entitlements 草案の安全性', () => {
  it('learner本人はselectのみ（書き込み系のgrantを与えない）', () => {
    expect(sql).toContain('grant select on public.ai_course_entitlements to authenticated');
    expect(sql).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*to authenticated/i);
  });
  it('write policyを一切作らない（insert/update/deleteのpolicyなし）', () => {
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete)/i);
  });
  it('learner自己権限昇格の経路がない（select policyのみ・本人行に限定）', () => {
    const policies = sql.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain('for select');
    expect(policies[0]).toContain('ai_my_learner_ids');
  });
  it('4権限列・付与記録・期限列を持つ', () => {
    for (const col of ['lab_preview', 'internal_review', 'decision_console', 'content_reviewer',
      'granted_by', 'granted_at', 'expires_at']) {
      expect(sql).toContain(col);
    }
  });
  it('既存フラグ移行はinsert（on conflict do nothing）のみで、admin_overrides自体を変更しない', () => {
    expect(sql).toContain('on conflict (learner_id) do nothing');
    expect(sql).not.toMatch(/update\s+public\.ai_learners\s+set/i);
    expect(sql).not.toMatch(/admin_overrides\s*=\s*/);
  });
});

describe('admin_overrides 列保護（二層防御の2層目・草案）', () => {
  it('admin_overrides変更をadmin/service role以外で拒否するtrigger草案がある', () => {
    expect(sql).toContain('ai_course_protect_admin_overrides');
    expect(sql).toContain('is distinct from');
    expect(sql).toContain('ai_learners_protect_admin_overrides');
  });
  it('rollbackにtrigger・function・tableの撤去が揃っている', () => {
    expect(sql).toContain('drop trigger if exists ai_learners_protect_admin_overrides');
    expect(sql).toContain('drop function if exists public.ai_course_protect_admin_overrides()');
    expect(sql).toContain('drop table if exists public.ai_course_entitlements');
  });
});
