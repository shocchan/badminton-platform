// 再購入で学習記録が引き継がれる仕組みの受入テスト（2026-08-20 CEO確認事項）。
//
// 「もう一度600円／2,980円を買ったら、続きからできるのか」への答えを**コードで固定**する。
// 実体は Edge Function（Deno）なので、ここでは「アカウント解決の順序」が
// 実装から失われていないことをソース走査で守る（順序が消えると新アカウントが増える）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fnSrc = (rel: string) =>
  readFileSync(join(__dirname, '../../../../../supabase/functions', rel), 'utf8');

describe('再購入時のアカウント引き継ぎ', () => {
  const webhook = fnSrc('ai-course-stripe-webhook/index.ts');
  const checkout = fnSrc('ai-course-checkout/index.ts');
  // 受講権の延長・格下げガードは DB 側（RPC）が持つ
  const accessExtendSql = readFileSync(
    join(__dirname, '../../../../../supabase/migrations/20260824140000_ai_course_access_extend.sql'),
    'utf8',
  );

  it('**① ログイン中の購入は本人のアカウントへ紐づく**（購入メールが違っても）', () => {
    // checkout がトークンを検証して user_id を台帳へ先に入れる
    expect(checkout).toMatch(/auth\/v1\/user/);
    expect(checkout).toMatch(/user_id: attachUserId/);
    // webhook はその user_id を最優先で使う
    const byUser = webhook.indexOf('if (row.user_id)');
    const byEmail = webhook.indexOf('if (!userId && buyerEmail)');
    expect(byUser, 'ログイン中の紐づけ判定が消えている').toBeGreaterThan(0);
    expect(byEmail, 'メール一致の判定が消えている').toBeGreaterThan(0);
    expect(byUser, '**user_id より先にメール一致を見てはいけない**').toBeLessThan(byEmail);
  });

  it('**② ログアウトでの購入は同じメールで過去の発行済みアカウントへ紐づく**', () => {
    expect(webhook).toMatch(/buyer_email=eq\.\$\{encodeURIComponent\(buyerEmail\)\}/);
    expect(webhook).toMatch(/status=eq\.provisioned/);
  });

  it('引き継いだ場合はアカウントを作り直さない（期間だけ延長する）', () => {
    // 新規作成は「どちらの経路でも決まらなかったとき」だけ
    expect(webhook).toMatch(/if \(!userId\) \{/);
    // 受講権の反映は DB の ai_grant_purchase_access に一本化されている
    // （2026-08-24: 旧実装の ai_course_access?on_conflict=user_id 直接 upsert は
    //  「now+accessDays の上書き」で期間が縮む不具合があったため RPC へ移した。
    //  期間が伸びること自体の検証は planAccessExtension.test.ts が担う）
    expect(webhook).toMatch(/rpc\/ai_grant_purchase_access/);
    // learner・学習記録は触らない
    expect(webhook).not.toMatch(/delete.*ai_learners/i);
    expect(webhook).not.toMatch(/delete.*ai_learning_sessions/i);
  });

  it('体験パスを買い直したら60分が再び使える（開始前へ戻す）', () => {
    // Webhook はプランの窓（分）を RPC に渡すだけ
    expect(webhook).toMatch(/p_trial_window_minutes: plan\.realtimeWindowMinutes/);
    // 「開始前へ戻す」はDB側。格下げでないときだけ trial_started_at を null にする
    expect(accessExtendSql).toMatch(/trial_started_at\s*=\s*case when v_apply then null/);
  });

  it('引き継ぎ時はパスワードを作り直さない（前のIDでそのまま入れる）', () => {
    expect(webhook).toMatch(/reusedAccount = true/);
    // メール文面が「今までのパスワードのまま」を伝える分岐を持つ
    expect(webhook).toMatch(/これまでお使いのものをそのまま/);
    expect(webhook).toMatch(/请继续使用你原来的密码/);
  });

  /*
   * ID＝申込時のメールアドレスへ（2026-09-09 CEO決定）。
   * 合成メール（sxxxxxxx@id.badminton-platform.pages.dev）だと
   *   ・パスワード再設定メールを送れない（宛先が存在しない）
   *   ・バド側のマイページに会員として出てこない
   * の2つが起きる。実メールにすると同じ認証アカウントになる。
   */
  describe('新規アカウントは申込時のメールで作る', () => {
    it('合成メールでは作らない', () => {
      expect(webhook).toMatch(/const authEmail = buyerEmail\.trim\(\)\.toLowerCase\(\)/);
      // 作成リクエストに渡すのは実メール
      expect(webhook).toMatch(/email: authEmail, password, email_confirm: true/);
      // 合成メールの組み立てが残っていない
      expect(webhook).not.toMatch(/`\$\{loginId\}@\$\{ID_DOMAIN\}`/);
    });

    it('**同じメールの既存アカウントがあればパスワードを作り直さない**（バド会員のパスワードを壊さない）', () => {
      expect(webhook).toMatch(/findUserIdByEmail/);
      // 422（競合）でも作り直さず再利用へ倒す
      expect(webhook).toMatch(/password = null;\s*\n\s*reusedAccount = true;/);
      // 旧実装のパスワード揃え（PUT で password を上書き）が消えている
      expect(webhook).not.toMatch(/method: "PUT", body: JSON\.stringify\(\{ password \}\)/);
    });

    it('メールの完全一致だけを採用する（前方一致で他人を掴まない）', () => {
      expect(webhook).toMatch(/\(u\.email \?\? ""\)\.toLowerCase\(\) === email\.toLowerCase\(\)/);
    });
  });

  describe('ログインしないで入れる個別URL', () => {
    it('購入時に学習コードを発行してURLをメールに載せる', () => {
      expect(webhook).toMatch(/rpc\/ai_service_issue_learning_code/);
      expect(webhook).toMatch(/learnUrl = `\$\{STUDENT_SITE\}\/\$\{locale\}\/learn\//);
      expect(webhook).toMatch(/buyerMail\(\{[^}]*learnUrl/);
    });

    it('発行に失敗しても購入は止めない（URL無しのメールになるだけ）', () => {
      // try/catch で囲われ、失敗時に return していない
      const block = webhook.slice(webhook.indexOf('let learnUrl'), webhook.indexOf('let learnUrl') + 1200);
      expect(block).toMatch(/try \{/);
      expect(block).not.toMatch(/return json\(\{ error/);
    });

    it('URLが無いときは案内ごと出さない（壊れたリンクを書かない）', () => {
      expect(webhook).toMatch(/const entryBlock = learnUrl\s*\n?\s*\?/);
      expect(webhook).toMatch(/:\s*"";/);
    });
  });
});
