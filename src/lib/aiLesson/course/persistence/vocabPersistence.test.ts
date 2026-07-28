// 正式DB保存の草案に対する dry-run 検証（DBへは接続しない）。
// migration草案が「設計パケットの約束」を破っていないかをテキストとして検査する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(join(__dirname, '../../../../..',
  'supabase/migrations_draft/20260728000000_ai_course_vocab_persistence_DRAFT.sql'), 'utf8');
const rollback = readFileSync(join(__dirname, '../../../../..',
  'supabase/migrations_draft/rollback_20260728000000_ai_course_vocab_persistence.sql'), 'utf8');

describe('migration草案の安全性（dry-run検査）', () => {
  it('3つの新テーブルだけを作り、既存テーブルを変更しない', () => {
    const creates = sql.match(/create table if not exists public\.(\w+)/g) ?? [];
    expect(creates).toHaveLength(3);
    // 既存テーブルへの alter / update / delete / drop を含まない
    expect(sql).not.toMatch(/alter table public\.ai_learners/i);
    expect(sql).not.toMatch(/\b(update|delete from|drop table)\s+public\.ai_(learners|item_progress|learning_sessions)/i);
  });

  it('3表すべてでRLSが有効になり、anonは締め出される', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on public.%I from anon');
  });

  it('authenticatedにdelete権限を与えない（削除はservice_roleのみ）', () => {
    expect(sql).toContain('grant select, insert, update on public.%I to authenticated');
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*to authenticated/i);
    expect(sql).not.toMatch(/create policy [^;]*for delete/i);
  });

  it('本人以外のlearner_idでの書き込みを防ぐ with check を持つ', () => {
    expect(sql).toContain('with check (learner_id in (select public.ai_my_learner_ids()))');
  });

  it('rollbackは3表とtrigger/functionをすべて片付ける', () => {
    ['ai_course_vocab_item_progress', 'ai_course_vocab_pack_progress',
     'ai_course_vocab_diagnostic_attempts'].forEach((t) => {
      expect(sql).toContain(t);
      expect(rollback).toContain(`drop table if exists public.${t}`);
    });
    expect(rollback).toContain('drop function if exists public.ai_course_vocab_touch()');
  });

  it('期限はローカル日付（date列）で持ち、サーバーで日付変換しない', () => {
    expect(sql).toContain('next_review_on date');
    expect(sql).not.toMatch(/at time zone/i);
  });
});
