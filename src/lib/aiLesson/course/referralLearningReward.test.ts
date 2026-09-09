// 紹介の報酬を「相手が3日学習したとき」に出す仕組みの約束を固定する。2026-09-10 CEO決定。
//
// ここはお金に触る唯一の場所（受講権を伸ばす）なので、静かに壊れると実害が出る。
// 守るのは4つ:
//   1. 1つの紹介につき報酬は1回だけ（webhookの再送と学習トリガーが同時に来ても二重に付けない）
//   2. 合計90日の上限を超えない
//   3. 学習日は learningDays から数える（ログインだけ・開いただけを数えない）
//   4. トリガーは学習の保存を絶対に止めない
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const MIG_PATH = 'supabase/migrations/20260910120000_ai_referral_learning_reward.sql';
const MIG = readFileSync(MIG_PATH, 'utf8');

describe('報酬は1つの紹介につき1回だけ', () => {
  it('付与の前に行をロックする（同時に来ても二重に付かない）', () => {
    expect(MIG).toMatch(/from public\.ai_referrals where id = p_referral_id for update/);
  });

  it('pending 以外なら何もせず抜ける', () => {
    expect(MIG).toMatch(/if v_ref\.reward_status <> 'pending' then/);
  });

  it('購入経路も学習経路も、同じ付与関数を通る（お金に触る場所を1か所にする）', () => {
    const calls = MIG.match(/public\.ai_referral_apply_reward\(/g) ?? [];
    // 定義1回 + purchase から1回 + learning から1回
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(MIG).toMatch(/return public\.ai_referral_apply_reward\(v_id, 'purchase', p_purchase_id\)/);
    expect(MIG).toMatch(/return public\.ai_referral_apply_reward\(v_id, 'learning', null\)/);
  });
});

describe('上限を超えない', () => {
  it('合計が cap を超えるなら capped にして付与しない', () => {
    expect(MIG).toMatch(/if v_already \+ v_days > v_cap then/);
    expect(MIG).toMatch(/reward_status = 'capped'/);
  });

  it('cap の既定は90日、1件あたりは30日（既存の設定と同じ）', () => {
    expect(MIG).toMatch(/rewardDaysPerPurchase'\)::int, 30\)/);
    expect(MIG).toMatch(/rewardDaysCap'\)::int, 90\)/);
  });

  it('期限切れの人にも効く（起点は now と valid_until の遅いほう）', () => {
    expect(MIG).toMatch(/greatest\(now\(\), valid_until\)/);
  });
});

describe('学習日の数え方', () => {
  it('settings.adventureV2.learningDays を見る（アプリ・メールと同じ単一の出所）', () => {
    expect(MIG).toMatch(/settings->'adventureV2'->'learningDays'/);
  });

  it('配列でなければ0として扱う（型が違う値で落ちない）', () => {
    expect(MIG).toMatch(/jsonb_typeof\(l\.settings->'adventureV2'->'learningDays'\) = 'array'/);
  });

  it('既定は3日', () => {
    expect(MIG).toMatch(/rewardMinLearningDays'\)::int, 3\)/);
    expect(MIG).toMatch(/'rewardMinLearningDays', 3/);
  });

  it('足りなければ付与せず not_yet を返す', () => {
    expect(MIG).toMatch(/if v_days < v_min then/);
    expect(MIG).toMatch(/'not_yet'/);
  });
});

describe('学習の保存を止めない', () => {
  it('トリガーは pending の紹介が無ければ即抜ける（学習の保存はホットパス）', () => {
    expect(MIG).toMatch(/if not exists \([\s\S]{0,200}invitee_user_id = new\.user_id and reward_status = 'pending'/);
  });

  it('例外を握って必ず new を返す', () => {
    expect(MIG).toMatch(/exception when others then[\s\S]{0,200}return new;/);
  });

  it('settings が変わったときだけ動く', () => {
    expect(MIG).toMatch(/after update of settings on public\.ai_learners/);
  });
});

describe('既存の設定・データを壊さない', () => {
  it('referral 設定は上書きせずキーを足すだけ', () => {
    expect(MIG).toMatch(/do update set value = ai_config\.value \|\| excluded\.value/);
  });

  it('破壊的な操作をしていない', () => {
    expect(MIG).not.toMatch(/drop\s+table/i);
    expect(MIG).not.toMatch(/delete\s+from/i);
    expect(MIG).not.toMatch(/truncate/i);
  });

  it('rollback がある', () => {
    expect(existsSync(MIG_PATH.replace(/\.sql$/, '.rollback.sql'))).toBe(true);
  });

  it('rollback は付与済みの受講権を取り上げない', () => {
    const back = readFileSync(MIG_PATH.replace(/\.sql$/, '.rollback.sql'), 'utf8');
    // 「取り上げる」＝期限から日数を引くこと。関数を元の本体へ戻すための
    // update（期限を伸ばす側）は入っているので、引き算だけを禁じる
    expect(back).not.toMatch(/valid_until\s*-\s*make_interval/);
    expect(back).not.toMatch(/delete\s+from\s+public\.ai_course_access/i);
  });
});
