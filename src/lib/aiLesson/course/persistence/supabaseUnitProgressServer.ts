// ProgressServerPort の Supabase 実装（§14・H1）。
//
// 対応スキーマ: supabase/migrations/20260729000000_ai_course_unit_progress.sql
//   - table  public.ai_course_unit_progress（select のみ authenticated へ grant）
//   - RPC    public.ai_upsert_unit_progress（楽観ロック＋mutationId冪等。書き込みは必ずここを通る）
//
// 方針:
// - 「保存しました」はサーバ確定後だけ（Repository側の契約）。この層は誠実にエラー種別を返す
// - conflict は RPC の errcode P0409。サーバ現在値を fetch し直して返す（黙って上書きしない）
// - クライアント時刻は送らない。updatedAtMs はサーバの updated_at から導出する
import type {
  ProgressServerPort, ServerResult, StoredProgress,
} from './unitProgressRepository';
import type { UnitRunState } from '../n3unit/unitRuntime';

interface ProgressRow {
  learner_id: string;
  unit_id: string;
  state: UnitRunState;
  row_version: number;
  updated_at: string;
}

/** supabase-js の必要最小面だけに依存する（テストでは本物のlocalクライアントを渡す） */
export interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(col: string, v: string): {
        eq(col: string, v: string): {
          maybeSingle(): Promise<{ data: ProgressRow | null; error: { code?: string; message: string } | null }>;
        };
      };
    };
  };
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: ProgressRow | null; error: { code?: string; message: string } | null }>;
}

const toStored = (row: ProgressRow): StoredProgress => ({
  learnerId: row.learner_id,
  unitId: row.unit_id,
  state: row.state,
  rowVersion: row.row_version,
  updatedAtMs: Date.parse(row.updated_at),
});

/** PostgREST/GoTrueのエラーを契約上の種別へ写像する。不明はunavailable（=再送対象）に倒す */
const classify = (e: { code?: string; message: string }): 'denied' | 'auth_expired' | 'unavailable' => {
  if (e.code === '42501') return 'denied';
  if (e.code === 'PGRST301' || e.code === '401' || /jwt|token/i.test(e.message)) return 'auth_expired';
  return 'unavailable';
};

export const createSupabaseProgressServer = (supabase: SupabaseLike): ProgressServerPort => ({
  async fetch(learnerId, unitId): Promise<ServerResult<StoredProgress | null>> {
    try {
      const { data, error } = await supabase
        .from('ai_course_unit_progress')
        .select('learner_id, unit_id, state, row_version, updated_at')
        .eq('learner_id', learnerId)
        .eq('unit_id', unitId)
        .maybeSingle();
      if (error) return { ok: false, error: { kind: classify(error) } };
      return { ok: true, value: data ? toStored(data) : null };
    } catch {
      return { ok: false, error: { kind: 'unavailable' } };
    }
  },

  async upsert({ learnerId, unitId, state, expectedRowVersion, mutationId }): Promise<ServerResult<StoredProgress>> {
    try {
      const { data, error } = await supabase.rpc('ai_upsert_unit_progress', {
        p_learner_id: learnerId,
        p_unit_id: unitId,
        p_state: state,
        p_expected_row_version: expectedRowVersion,
        p_mutation_id: mutationId,
      });
      if (error) {
        if (error.code === 'P0409') {
          // conflict: サーバ現在値を取り直して返す（Repositoryが決定的mergeを行う）
          const cur = await this.fetch(learnerId, unitId);
          if (cur.ok && cur.value) return { ok: false, error: { kind: 'conflict', server: cur.value } };
          return { ok: false, error: { kind: 'unavailable' } };
        }
        return { ok: false, error: { kind: classify(error) } };
      }
      if (!data) return { ok: false, error: { kind: 'unavailable' } };
      return { ok: true, value: toStored(data) };
    } catch {
      return { ok: false, error: { kind: 'unavailable' } };
    }
  },
});
