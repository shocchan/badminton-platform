// migrationファイルの構文・安全性・freezeを守る回帰テスト（2026-07-30 Gate実測の教訓を恒久化）。
//
// このテストは Final Executable Migration Gate で実際に見つかった2件の事故を再発させないためにある:
//   🔴 1. dollar-quote破損: JSの String.replace() の置換パターン仕様で `$$` が `$` になり、
//         entitlements migrationが適用不能（syntax error）になっていた。local適用まで気づけなかった。
//   🟠 2. rollbackが admin_overrides 保護（trigger/function）まで落としていた。
//         rollback直後に learner本人が自己昇格できる状態へ戻ってしまう。
//
// DBへは接続しない（テキスト検査のみ）。CIでもlocal Dockerなしで回る。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const ROOT = join(__dirname, '../../../../..');
const MIG = join(ROOT, 'supabase/migrations');
const ROLL = join(ROOT, 'supabase/rollbacks');
const read = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8');
const sqlFiles = (dir: string) => readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

/** コメント行を除いた本文（検査は実行されるSQLに対して行う） */
const body = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

const TARGETS = [
  '20260728000000_ai_course_vocab_persistence.sql',
  '20260728010000_ai_course_entitlements.sql',
  '20260729000000_ai_course_unit_progress.sql',
];

describe('dollar-quote の健全性（🔴事故1の再発防止）', () => {
  it('全migration/rollbackで $$ の出現数が偶数（開始と終了が対になっている）', () => {
    for (const [dir, label] of [[MIG, 'migrations'], [ROLL, 'rollbacks']] as const) {
      for (const f of sqlFiles(dir)) {
        const n = (read(dir, f).match(/\$\$/g) ?? []).length;
        expect(n % 2, `${label}/${f}: $$ が奇数個（${n}）= dollar-quoteが壊れている`).toBe(0);
      }
    }
  });
  it('`as $` / `end $` のような孤立した単一 $ が無い（$do$ 等のタグ付きquoteは許可）', () => {
    for (const [dir, label] of [[MIG, 'migrations'], [ROLL, 'rollbacks']] as const) {
      for (const f of sqlFiles(dir)) {
        for (const [i, line] of read(dir, f).split('\n').entries()) {
          if (line.trim().startsWith('--')) continue;
          // 「as/begin/end のあとに $ 1個だけで行が終わる」= 壊れたdollar-quote
          const broken = /\b(as|begin|end)\s*\$(?!\$|[A-Za-z_])\s*$/.test(line);
          expect(broken, `${label}/${f}:${i + 1} 孤立した $ → "${line.trim()}"`).toBe(false);
        }
      }
    }
  });
  it('関数本体を持つ対象migrationは $$ ... $$ で正しく閉じている', () => {
    for (const f of TARGETS) {
      const s = read(MIG, f);
      if (!/language plpgsql/.test(s)) continue;
      // language宣言の後に as $$ が続き、$$; で閉じる形になっている
      expect(/as \$\$/.test(s), `${f}: "as $$" が無い`).toBe(true);
      expect(/end \$\$;/.test(s) || /\$\$;/.test(s), `${f}: "$$;" で閉じていない`).toBe(true);
    }
  });
});

describe('rollbackがsecurity保護を落とさない（🟠事故2の再発防止）', () => {
  it('entitlements の feature rollback は admin_overrides 保護を削除しない', () => {
    const s = body(read(ROLL, 'rollback_20260728010000_ai_course_entitlements.sql'));
    expect(/drop\s+trigger[\s\S]*ai_learners_protect_admin_overrides/i.test(s),
      'feature rollbackが保護triggerを落としている（rollback直後に自己昇格が可能になる）').toBe(false);
    expect(/drop\s+function[\s\S]*ai_course_protect_admin_overrides/i.test(s),
      'feature rollbackが保護functionを落としている').toBe(false);
    expect(/drop\s+table\s+if\s+exists\s+public\.ai_course_entitlements/i.test(s),
      'feature rollbackがentitlementsテーブルを撤去していない').toBe(true);
  });
  it('security rollbackは別ファイルとして分離され、保護撤去はそこにだけ書かれている', () => {
    const s = body(read(ROLL, 'rollback_20260728010000_ai_course_entitlements_SECURITY_ONLY.sql'));
    expect(/drop\s+trigger[\s\S]*ai_learners_protect_admin_overrides/i.test(s)).toBe(true);
    expect(/drop\s+function[\s\S]*ai_course_protect_admin_overrides/i.test(s)).toBe(true);
  });
  it('unit_progress rollbackもfeature限定（RLS/grantsに触れない）', () => {
    const s = body(read(ROLL, 'rollback_20260729000000_ai_course_unit_progress.sql'));
    expect(/drop\s+trigger/i.test(s)).toBe(false);
    expect(/alter\s+table/i.test(s)).toBe(false);
  });
});

describe('対象migrationのwrite範囲（既存learnerデータ非破壊）', () => {
  const bodies = TARGETS.map(f => ({ f, s: body(read(MIG, f)) }));
  it('ai_learners への UPDATE / DELETE が1文も無い', () => {
    for (const { f, s } of bodies) {
      expect(/update\s+public\.ai_learners\s+set/i.test(s), `${f}: ai_learnersへのUPDATE`).toBe(false);
      expect(/delete\s+from\s+public\.ai_learners/i.test(s), `${f}: ai_learnersへのDELETE`).toBe(false);
    }
  });
  it('DELETE FROM 文が1件も無い（additive only）', () => {
    for (const { f, s } of bodies) {
      expect(/delete\s+from\s+/i.test(s), `${f}: DELETE FROM がある`).toBe(false);
    }
  });
  it('既存テーブルへのALTERは無い（新規テーブルのRLS有効化のみ）', () => {
    const newTables = ['ai_course_vocab_item_progress', 'ai_course_vocab_pack_progress',
      'ai_course_vocab_diagnostic_attempts', 'ai_course_entitlements', 'ai_course_unit_progress'];
    for (const { f, s } of bodies) {
      for (const m of s.matchAll(/alter\s+table\s+public\.([a-z_]+)/gi)) {
        expect(newTables.includes(m[1]), `${f}: 既存テーブル ${m[1]} へのALTER`).toBe(true);
      }
    }
  });
  it('entitlements移行の選択条件は labPreview を持つ行に限定されている', () => {
    const s = body(read(MIG, '20260728010000_ai_course_entitlements.sql'));
    expect(s).toMatch(/where\s+admin_overrides\s+\?\s+'labPreview'/);
  });
});

describe('security設定がSQLに書かれている（適用時に落ちない）', () => {
  // AIコース era（20260718000000以降）のmigrationを対象にする。
  // バドミントン側の旧migration（20260707/20260709/20260710の管理RPC 10関数）は
  // search_path未固定のまま本番適用済み＝**別件のhardening課題**として
  // docs/ai-course/production/rollback-backup.md に記録し、ここでは対象外にする
  // （修正には新規migration＋remote適用が必要で、今回のスコープ外）。
  it('AIコースのSECURITY DEFINER関数はすべて search_path を固定している', () => {
    for (const f of sqlFiles(MIG).filter(x => x >= '20260718000000')) {
      const s = read(MIG, f);
      for (const m of s.matchAll(/create\s+or\s+replace\s+function[\s\S]{0,400}?as\s+\$\$/gi)) {
        const decl = m[0];
        if (!/security\s+definer/i.test(decl)) continue;
        // SQLのキーワードは大文字小文字を区別しない。ここに /i が無かったため
        // `SET search_path = public` と大文字で書いた migration を「未固定」と誤判定していた
        // （2026-08-24: 20260824120000 が実際に誤検知された）。外側の判定は元から /i。
        expect(/set\s+search_path\s*=/i.test(decl),
          `${f}: SECURITY DEFINER関数のsearch_pathが未固定（schema偽装で権限昇格しうる）`).toBe(true);
      }
    }
  });
  it('旧バドミントン側のsearch_path未固定関数は既知の10件から増えていない（新規追加の防止）', () => {
    const legacy: string[] = [];
    for (const f of sqlFiles(MIG).filter(x => x < '20260718000000')) {
      const s = read(MIG, f);
      for (const m of s.matchAll(/create\s+or\s+replace\s+function\s+([a-z_.]+)[\s\S]{0,400}?as\s+\$\$/gi)) {
        if (!/security\s+definer/i.test(m[0])) continue;
        if (!/set\s+search_path\s*=/.test(m[0])) legacy.push(m[1]);
      }
    }
    expect(legacy.sort()).toEqual([
      'admin_archive_activity', 'admin_delete_activity', 'admin_find_coupon', 'admin_game_stats',
      'admin_list_coupons', 'admin_list_members', 'admin_redeem_coupon', 'admin_unarchive_activity',
      'assert_group_admin', 'is_admin',
    ]);
  });
  it('新規テーブルはRLS有効化とanon revokeを含む', () => {
    for (const f of TARGETS) {
      const s = body(read(MIG, f));
      expect(/enable\s+row\s+level\s+security/i.test(s), `${f}: RLS有効化なし`).toBe(true);
      expect(/revoke\s+all\s+on\s+(public\.%I|public\.[a-z_]+)\s+from\s+anon/i.test(s), `${f}: anon revokeなし`).toBe(true);
    }
  });
});

describe('checksum freeze（2026-07-30 Gate後の凍結値・変更したらこのテストが落ちる）', () => {
  // 適用前にファイルが書き換わっていないことを保証する。意図的な変更時は
  // packet §23e の値とここを同時に更新し、local再実証（適用→rollback→matrix）をやり直す。
  const FROZEN: Record<string, string> = {
    'migrations/20260728000000_ai_course_vocab_persistence.sql': '50cb55ae59bc13a3999cc3ee80c6be21394c67b30ac64588a9b6270486f8b405',
    'migrations/20260728010000_ai_course_entitlements.sql': 'e8d2f37c0cd292b948f2be079f169e55854c037e6ccac41ac184078ec7fb5e79',
    'migrations/20260729000000_ai_course_unit_progress.sql': '92a5606de2efd07760e4b7fa5fe11f93b03a769c2d04666f0536c5fc383a6ee0',
    'rollbacks/rollback_20260728000000_ai_course_vocab_persistence.sql': 'e323251eca3deb18bf3ac0c2d2984dae3fb9d7806d764e4fd64fdc83834c1762',
    'rollbacks/rollback_20260728010000_ai_course_entitlements.sql': 'b68d11cf5bc6cba39c500dc6625e7785bc11bfb5aa5b0d809e1c6324ffa8a720',
    'rollbacks/rollback_20260729000000_ai_course_unit_progress.sql': '4b3ca07a070f64b1c2fe9eca79ba64c5476f0fed8effbd2b6dd3a8050dff6b92',
    'rollbacks/rollback_20260728010000_ai_course_entitlements_SECURITY_ONLY.sql': 'e200274f2a12b8867dded98d62f746ee4ad3b18567836442758347875d29bcbe',
  };
  it('凍結した7ファイルのSHA-256が一致する', () => {
    for (const [rel, want] of Object.entries(FROZEN)) {
      const buf = readFileSync(join(ROOT, 'supabase', rel));
      const got = createHash('sha256').update(buf).digest('hex');
      expect(got, `supabase/${rel} が変更されている（freeze値と不一致）`).toBe(want);
    }
  });
});
