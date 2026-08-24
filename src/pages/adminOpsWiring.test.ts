// 管理画面が「実務で使える状態」に配線されていることを固定する（2026-08-24）。
//
// 【なぜソースを読むテストにするか】
// AdminPage.tsx は2,800行あり、丸ごと描画するのは（tiptap・supabase・認証・ルータの
// 都合で）現実的でない。一方この回で直した不具合は、どれも
// **「実装は全部あるのに配線が1行足りない」** という種類のものだった。
//
//   ・subscribers タブ … 一覧・追加・編集・削除UIも fetch も型も揃っていたのに、
//     タブ配列に入っていないだけで到達不能だった（誰も気づかないまま）
//   ・contacts … /contact フォームは動いていたのに、読むコードが src に1件も無く、
//     status='new' のまま最古 2026-07-06 から5件が滞留していた
//
// 配線が外れたことを機械で気づけるようにするのが、このファイルの目的。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const admin = readFileSync(join(__dirname, 'AdminPage.tsx'), 'utf8');
const migration = readFileSync(
  join(__dirname, '../../supabase/migrations/20260824120000_admin_ops_payment_and_contacts.sql'),
  'utf8'
);

// タブ配列（サブグループでない側）の1行を取り出す
const tabRow = admin.split('\n').find(l => l.includes("['tournaments', '大会案内']")) ?? '';

describe('タブに到達できること', () => {
  it('タブ配列を1行で持つ形が変わっていない（この判定の前提）', () => {
    expect(tabRow, 'タブ配列の書き方が変わった。このテストを直すこと').toContain("['blog'");
  });

  it('subscribers タブが配列に入っている（完成済みUIが到達不能だった）', () => {
    expect(tabRow).toContain("['subscribers'");
  });

  it('contacts タブが配列に入っている', () => {
    expect(tabRow).toContain("['contacts'");
  });

  it('subscribers / contacts の中身が Tab 型と描画の両方に繋がっている', () => {
    expect(admin).toMatch(/type Tab =[^\n]*'subscribers'/);
    expect(admin).toMatch(/type Tab =[^\n]*'contacts'/);
    expect(admin).toContain("activeTab === 'subscribers'");
    expect(admin).toContain("activeTab === 'contacts'");
    expect(admin).toContain("if (activeTab === 'subscribers') fetchSubscribers();");
  });

  it('サブグループのタブは通常活動だけのまま（権限を広げていない）', () => {
    expect(admin).toContain("? [['activities', '通常活動']] as [Tab, string][]");
    // 問い合わせ・入金はサブグループ管理者に見せない
    expect(admin).toContain('!isSubGroup && contacts.unrepliedCount > 0');
  });

  it('ラベルが会員管理タブと重ならない（どちらも「登録者」だと選べない）', () => {
    expect(tabRow).toContain("['subscribers', '特典登録']");
  });
});

describe('未入金の管理', () => {
  it('入金列・未入金フィルタ・入金確認ボタンがある', () => {
    expect(admin).toContain('未入金のみ');
    expect(admin).toContain('入金確認');
    expect(admin).toContain('showUnpaidOnly');
    expect(admin).toContain('unpaidCount');
  });

  it('未入金かどうかの判定は共有ヘルパを使う（督促と同じ条件を保つため）', () => {
    expect(admin).toContain("from '../components/admin/entryPayment'");
    expect(admin).toContain('entries.filter(isUnpaid)');
  });

  it('大会側の支払い設定を取ってきている（期限判定に要る）', () => {
    expect(admin).toContain('tournaments(title, payment_required, payment_deadline, entry_fee)');
  });

  it('CSVに支払い方法・入金状況・入金日が入る', () => {
    expect(admin).toContain("'支払い方法', '入金状況', '入金日'");
    expect(admin).toContain('paymentCsvCells(e)');
  });

  it('入金の更新は認証の無い process-admin を通さず、管理者限定RPCを使う', () => {
    expect(admin).toContain("supabase.rpc('admin_set_entry_payment'");
    // process-admin に入金系の操作を足していないこと
    expect(admin).not.toMatch(/callAdminFunction\(\s*'(paid|payment|pay)/);
  });

  it('通常活動（activity_entries）の料金には接続していない', () => {
    expect(admin).not.toMatch(/activity_entries[\s\S]{0,200}payment_status/);
  });
});

describe('滞留している問い合わせ', () => {
  it('どのタブにいても未返信件数が見える（探しに行かせない）', () => {
    expect(admin).toContain('未返信の問い合わせが');
    expect(admin).toContain('contacts.unrepliedCount > 0');
  });

  it('未返信がゼロならバナー自体を出さない', () => {
    expect(admin).toMatch(/contacts\.unrepliedCount > 0 && \(/);
  });

  it('管理画面を開いた時点で読む（タブを開くまで気づけない、を避ける）', () => {
    expect(admin).toContain('useContacts(!isSubGroup && isSiteAdmin === true)');
  });

  it('問い合わせ画面から自動でメールを送っていない', () => {
    expect(admin).not.toMatch(/notify-contact/);
  });
});

describe('サーバー側の入り口（マイグレーション）', () => {
  it('入金更新RPCが管理者限定', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION admin_set_entry_payment');
    const fn = migration.slice(migration.indexOf('admin_set_entry_payment'));
    expect(fn).toContain("IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION admin_set_entry_payment(BIGINT, BOOLEAN) TO authenticated');
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION admin_set_entry_payment[^\n]*anon/);
  });

  it('督促と同じ列・同じ値を書く（completed で督促が止まる設計）', () => {
    expect(migration).toContain("payment_status = CASE WHEN p_paid THEN 'completed' ELSE 'pending' END");
  });

  it('クレジット決済分は手で付け外しできない（Stripeの記録とずれるため）', () => {
    expect(migration).toContain("IF v_method = 'credit' THEN");
  });

  it('contacts が匿名・一般ログインユーザーから読めない', () => {
    // 元の `TO authenticated USING (true)` を落として is_admin() に締めている
    expect(migration).toContain('DROP POLICY IF EXISTS "authenticated can read contacts" ON contacts');
    expect(migration).toContain('DROP POLICY IF EXISTS "authenticated can update contacts" ON contacts');
    expect(migration).toContain('FOR SELECT TO authenticated USING (is_admin())');
    expect(migration).toContain('REVOKE SELECT, UPDATE, DELETE ON public.contacts FROM anon, authenticated');
  });

  it('問い合わせフォームの送信（INSERT）は残す', () => {
    expect(migration).toContain('GRANT INSERT ON public.contacts TO anon, authenticated');
  });

  it('contacts のRPCも管理者限定で、状態は3種類しか受け付けない', () => {
    for (const fn of ['admin_list_contacts', 'admin_set_contact_status']) {
      const body = migration.slice(migration.indexOf(`CREATE OR REPLACE FUNCTION ${fn}`));
      expect(body, `${fn} に is_admin() ガードが無い`).toContain("IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'");
    }
    expect(migration).toContain("IF p_status NOT IN ('new', 'replied', 'closed') THEN");
  });
});
