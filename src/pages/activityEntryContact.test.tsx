// @vitest-environment jsdom
// 通常活動の申込に「任意のメール」と「ログイン中のuser_id」を載せる（2026-08-24）。
//
// 【この機能が解いている問題】
// 通常活動は 6月19人 → 7月83人 → 8月94人 と広告ゼロで伸びている唯一の実需なのに、
// 申込レコードに連絡先が1件も残っていない。166件が名簿として使えない。
//
// 【壊してはいけないこと（テストの主目的）】
// 連絡先が欲しいからといって申込のハードルを上げたら本末転倒になる。
// **メール未入力でも今までどおり申し込めること** が、この機能で最も守るべき性質。
// 「メールを集めたい」より「申し込めること」が常に優先。
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Session = { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null;

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  session: null as Session,
  activity: null as unknown,
}));

vi.mock('../services/supabaseClient', () => {
  const selectChain = () => ({
    eq: () => ({
      single: () => Promise.resolve({ data: state.activity, error: null }),
      order: () => Promise.resolve({ data: [], error: null }),
    }),
  });
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: state.session } }) },
      rpc: (fn: string) => {
        if (fn === 'get_group_info') {
          return {
            single: () =>
              Promise.resolve({
                data: { id: 'g1', slug: 'kawaguchi-warabi', name: 'テスト会', enable_member_charge: false },
                error: null,
              }),
          };
        }
        return Promise.resolve({ data: null, error: null });
      },
      from: () => ({
        select: selectChain,
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row);
          return Promise.resolve({ error: null });
        },
      }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  };
});

import { ActivityPage, isValidOptionalEmail, normalizeOptionalEmail } from './ActivityPage';

const futureDate = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

const ACTIVITY = {
  id: 'a1',
  title: 'テスト活動',
  date: futureDate(),
  start_time: '17:00:00',
  end_time: '19:00:00',
  location: '芝園公民館',
  capacity: 16,
  price: 500,
  status: 'open',
  address: '',
  notes: '',
  group_id: 'g1',
};

const renderPage = (lang: 'ja' | 'zh' = 'ja') =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/${lang}/activity/a1`]}>
        <Routes>
          <Route path="/:lang/activity/:id" element={<ActivityPage lang={lang} />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );

/** 名前だけ埋めて申し込む（＝今までどおりの最短経路） */
const openForm = async (lang: 'ja' | 'zh' = 'ja') => {
  renderPage(lang);
  return await screen.findByPlaceholderText(lang === 'ja' ? 'お名前' : '您的姓名');
};

const submitButton = () => screen.getByRole('button', { name: /今すぐ申し込む|立即报名/ });

beforeEach(() => {
  state.inserts = [];
  state.session = null;
  state.activity = ACTIVITY;
});
afterEach(cleanup);

describe('メールは任意（申込のしやすさを落とさない）', () => {
  it('【最重要】メール未入力でも申し込みが成立する', async () => {
    const nameInput = await openForm();
    fireEvent.change(nameInput, { target: { value: '山田太郎' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0].name).toBe('山田太郎');
    // 空欄は「空文字」ではなく null で保存する（書いた人と区別できなくなるため）
    expect(state.inserts[0].email).toBeNull();
    expect(await screen.findByText('申し込みが完了しました！')).toBeTruthy();
  });

  it('メール欄は required ではない（ブラウザ側でも止めない）', async () => {
    await openForm();
    const email = screen.getByLabelText(/メールアドレス/) as HTMLInputElement;
    expect(email.required).toBe(false);
    expect(email.value).toBe('');
  });

  it('申込ボタンは1つのまま（確認画面や追加の1タップを増やしていない）', async () => {
    await openForm();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(buttons.filter((b) => /今すぐ申し込む/.test(b))).toHaveLength(1);
    // 「メールを入れてください」的な確認ステップが挟まっていないこと
    const nameInput = screen.getByPlaceholderText('お名前');
    fireEvent.change(nameInput, { target: { value: '佐藤' } });
    fireEvent.click(submitButton());
    return waitFor(() => expect(state.inserts).toHaveLength(1));
  });

  it('ラベルに「任意」と、入れると何が得かが書いてある（日本語）', async () => {
    await openForm();
    expect(screen.getByText('メールアドレス（任意）')).toBeTruthy();
    expect(screen.getByText(/次回の活動案内/)).toBeTruthy();
    expect(screen.getByText(/空欄のままでも申し込めます/)).toBeTruthy();
  });

  it('中国語でも同じ案内が出る（このページは ja/zh 両方で使う）', async () => {
    await openForm('zh');
    expect(screen.getByText('邮箱（选填）')).toBeTruthy();
    expect(screen.getByText(/不填也可以正常报名/)).toBeTruthy();
  });
});

describe('メールを入れた場合', () => {
  it('入力した値が insert に載る（前後の空白は落とす）', async () => {
    const nameInput = await openForm();
    fireEvent.change(nameInput, { target: { value: '鈴木' } });
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: '  suzuki@example.com  ' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0].email).toBe('suzuki@example.com');
  });

  it('形式が不正なら送信しない（が、空欄に戻せば申し込める）', async () => {
    const nameInput = await openForm();
    fireEvent.change(nameInput, { target: { value: '田中' } });
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'tanaka@' } });
    fireEvent.click(submitButton());

    expect(await screen.findByText(/メールアドレスの形式をご確認ください/)).toBeTruthy();
    expect(state.inserts).toHaveLength(0);

    // 逃げ道が必ずあること: 消せば申し込める
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: '' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0].email).toBeNull();
  });

  it('定員超過で確定と補欠に分かれても、両方の行に同じメールが載る', async () => {
    state.activity = { ...ACTIVITY, capacity: 1 };
    const nameInput = await openForm();
    fireEvent.change(nameInput, { target: { value: '高橋' } });
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'taka@example.com' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(state.inserts).toHaveLength(2));
    expect(state.inserts.map((r) => r.status)).toEqual(['confirmed', 'waitlist']);
    expect(state.inserts.every((r) => r.email === 'taka@example.com')).toBe(true);
  });

  it('申込後はメール欄が空に戻る（続けて友人の分を申し込む時の取り違えを防ぐ）', async () => {
    const nameInput = await openForm();
    fireEvent.change(nameInput, { target: { value: '中村' } });
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'naka@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(state.inserts).toHaveLength(1));
    await waitFor(() =>
      expect((screen.getByLabelText(/メールアドレス/) as HTMLInputElement).value).toBe('')
    );
  });
});

describe('ログイン状態の紐づけ', () => {
  it('ログイン済みなら user_id が載り、メールは編集できる初期値として入る', async () => {
    state.session = { user: { id: 'u-123', email: 'me@example.com', user_metadata: { name: '会員太郎' } } };
    await openForm();

    await waitFor(() =>
      expect((screen.getByLabelText(/メールアドレス/) as HTMLInputElement).value).toBe('me@example.com')
    );
    // 編集・削除できること（強制されない）
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: 'other@example.com' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0].user_id).toBe('u-123');
    expect(state.inserts[0].email).toBe('other@example.com');
  });

  it('ログイン済みでもメールを消して申し込める（user_idだけ残る）', async () => {
    state.session = { user: { id: 'u-123', email: 'me@example.com', user_metadata: { name: '会員太郎' } } };
    await openForm();
    await waitFor(() =>
      expect((screen.getByLabelText(/メールアドレス/) as HTMLInputElement).value).toBe('me@example.com')
    );
    fireEvent.change(screen.getByLabelText(/メールアドレス/), { target: { value: '' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0].email).toBeNull();
    expect(state.inserts[0].user_id).toBe('u-123');
  });

  it('未ログインなら user_id は null（申込は今までどおり通る）', async () => {
    const nameInput = await openForm();
    fireEvent.change(nameInput, { target: { value: '匿名さん' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0].user_id).toBeNull();
    expect(state.inserts[0].email).toBeNull();
  });

  it('user_id は画面に出さない', async () => {
    state.session = { user: { id: 'u-123', email: 'me@example.com', user_metadata: { name: '会員太郎' } } };
    const { container } = renderPage();
    await screen.findByPlaceholderText('お名前');
    await waitFor(() => expect(screen.getByText(/会員太郎/)).toBeTruthy());
    expect(container.textContent).not.toContain('u-123');
  });
});

describe('任意メールの検証ロジック', () => {
  it('空欄は必ず通す', () => {
    expect(isValidOptionalEmail('')).toBe(true);
    expect(isValidOptionalEmail('   ')).toBe(true);
  });

  it('入力がある時だけ形式を見る', () => {
    expect(isValidOptionalEmail('a@example.com')).toBe(true);
    expect(isValidOptionalEmail(' a@example.com ')).toBe(true);
    expect(isValidOptionalEmail('a@example')).toBe(false);
    expect(isValidOptionalEmail('a b@example.com')).toBe(false);
    expect(isValidOptionalEmail('@example.com')).toBe(false);
    expect(isValidOptionalEmail('a'.repeat(250) + '@example.com')).toBe(false);
  });

  it('保存値: 空欄は null、入力ありは trim した文字列', () => {
    expect(normalizeOptionalEmail('  ')).toBeNull();
    expect(normalizeOptionalEmail(' a@example.com ')).toBe('a@example.com');
  });
});

// ── 個人情報が漏れない造りであることを、コードとmigrationの文面で固定する ──
// （実際の遮断はDBの列単位GRANT。ここでは「うっかり公開列に足す」変更を落とす）
describe('email が公開読み取りに混ざらないこと', () => {
  const page = readFileSync(join(__dirname, 'ActivityPage.tsx'), 'utf8');
  const migrationRaw = readFileSync(
    join(__dirname, '../../supabase/migrations/20260824110000_activity_entries_contact.sql'),
    'utf8'
  );
  // 実行される SQL だけを見る（コメントには「やってはいけない例」を書いているため）
  const migration = migrationRaw
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

  it('公開一覧の select 列に email / user_id を入れていない', () => {
    const selects = page.match(/\.select\('[^']*'\)/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) {
      expect(s, `公開SELECTに個人情報が混ざっている: ${s}`).not.toContain('email');
      expect(s, `公開SELECTに個人情報が混ざっている: ${s}`).not.toContain('user_id');
    }
  });

  it('migration が email に SELECT を GRANT していない', () => {
    const grants = migration.match(/grant\s+select[^;]*;/gi) ?? [];
    for (const g of grants) {
      expect(g, `匿名に email を読ませてはいけない: ${g}`).not.toMatch(/email|user_id/i);
    }
  });

  it('migration がテーブル全体の SELECT を開き直していない', () => {
    // `GRANT SELECT ON activity_entries TO anon` を一度でも書くと、
    // 列単位GRANTが表単位に戻って email まで公開される
    expect(migration).not.toMatch(/grant\s+select\s+on\s+(public\.)?activity_entries/i);
  });

  it('user_id を JWT の本人で固定する trigger が入っている（自称させない）', () => {
    expect(migration).toMatch(/before insert on public\.activity_entries/i);
    expect(migration).toMatch(/new\.user_id\s*:=/i);
    // 申込を落とす経路を作らない（trigger の中で例外を投げない）
    expect(migration).not.toMatch(/raise\s+exception/i);
  });

  it('migration が既存行をバックフィルしない（166件に触らない）', () => {
    expect(migration).not.toMatch(/\bupdate\s+public\.activity_entries/i);
    expect(migration).not.toMatch(/\bset\s+not\s+null\b/i);
    // 追加する列はどちらも nullable・DEFAULTなし・CHECKなし
    const addColumns = migration.match(/add column[^;]*/gi) ?? [];
    expect(addColumns).toHaveLength(2);
    for (const c of addColumns) {
      expect(c, `列に制約を付けると既存166行の扱いが変わる: ${c}`).not.toMatch(/not\s+null|default|check/i);
    }
  });
});
